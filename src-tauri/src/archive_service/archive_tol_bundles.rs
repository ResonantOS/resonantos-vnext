// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md
// Add-on boundary citation: docs/architecture/AUDIO2TOL_INTAKE_ANALYSIS.md

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use serde_json::{Map, Value, json};
use tauri::AppHandle;

use super::{
    ArchiveIngestRequestRecord, ArchiveIntakeWriteRequest, ArchiveRuntime,
    ArchiveTolBundleBuildRequest, ArchiveTolBundleBuildResult, ArchiveTolBundleCandidate,
    parse_frontmatter, queue_archive_ingest_request, relative_to_vault, resolve_source_path,
    slugify, system_time_to_unix, unix_timestamp, write_archive_intake_artifact,
};

fn tol_mapping_root(runtime: &ArchiveRuntime, role: &str, subtype: &str) -> Option<PathBuf> {
    runtime
        .mappings
        .iter()
        .find(|mapping| mapping.role == role && mapping.subtype.as_deref() == Some(subtype))
        .map(|mapping| runtime.vault_root.join(&mapping.path))
}

fn collect_tol_session_ids(
    root: &PathBuf,
    suffix_marker: &str,
    session_ids: &mut HashSet<String>,
) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(root)
        .map_err(|error| format!("Failed to read TOL folder {}: {error}", root.display()))?
    {
        let entry = entry.map_err(|error| format!("Failed to read TOL entry: {error}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        if let Some(session_id) = stem.strip_suffix(suffix_marker) {
            session_ids.insert(session_id.to_string());
        }
    }
    Ok(())
}

fn build_tol_candidate(
    runtime: &ArchiveRuntime,
    session_id: &str,
) -> Result<Option<ArchiveTolBundleCandidate>, String> {
    let transcript_root = tol_mapping_root(runtime, "derived_sources", "transcript")
        .unwrap_or_else(|| runtime.vault_root.join("03_TOL/TOL Transcripts"));
    let analysis_root = tol_mapping_root(runtime, "wiki_pages", "analysis")
        .unwrap_or_else(|| runtime.vault_root.join("03_TOL/TOL Analysis"));
    let raw_root = tol_mapping_root(runtime, "raw_sources", "audio")
        .unwrap_or_else(|| runtime.vault_root.join("03_TOL/RAW Audio"));
    let transcript = transcript_root.join(format!("{session_id}_TOL_Transcript.md"));
    let analysis = analysis_root.join(format!("{session_id}_TOL_Analysis.md"));
    if !transcript.exists() && !analysis.exists() {
        return Ok(None);
    }

    let raw_audio = raw_audio_for_session(&raw_root, session_id);
    let mut summary = None;
    let mut date = None;
    let mut time = None;
    let mut status = "missing-analysis".to_string();
    let mut strategic_actions_count = 0usize;
    let mut explicit_directives_count = 0usize;

    if analysis.exists() {
        let content = fs::read_to_string(&analysis).map_err(|error| {
            format!(
                "Failed to read TOL analysis {}: {error}",
                analysis.display()
            )
        })?;
        let (frontmatter, body, _, _) = parse_frontmatter(&content);
        summary = frontmatter
            .get("summary")
            .and_then(Value::as_str)
            .map(ToString::to_string);
        date = frontmatter
            .get("date")
            .and_then(Value::as_str)
            .map(ToString::to_string);
        time = frontmatter
            .get("time")
            .and_then(Value::as_str)
            .map(ToString::to_string);
        let sections = tol_analysis_sections(&body);
        strategic_actions_count = count_markdown_tasks(sections.get("strategicNextActions"));
        explicit_directives_count = count_markdown_tasks(sections.get("explicitDirectives"));
        status = if transcript.exists() {
            "bundle-ready".to_string()
        } else {
            "missing-transcript".to_string()
        };
    }

    Ok(Some(ArchiveTolBundleCandidate {
        session_id: session_id.to_string(),
        raw_audio_path: raw_audio.map(|path| relative_to_vault(runtime, &path)),
        transcript_path: transcript
            .exists()
            .then(|| relative_to_vault(runtime, &transcript)),
        analysis_path: analysis
            .exists()
            .then(|| relative_to_vault(runtime, &analysis)),
        date,
        time,
        summary,
        status,
        strategic_actions_count,
        explicit_directives_count,
    }))
}

fn raw_audio_for_session(raw_root: &PathBuf, session_id: &str) -> Option<PathBuf> {
    let recorder_stem = normalized_tol_session_to_recorder_stem(session_id)?;
    for extension in ["mp3", "wav", "m4a", "aac", "flac"] {
        let candidate = raw_root.join(format!("{recorder_stem}.{extension}"));
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn normalized_tol_session_to_recorder_stem(session_id: &str) -> Option<String> {
    if session_id.len() != 15 {
        return None;
    }
    let year = session_id.get(2..4)?;
    let month = session_id.get(5..7)?;
    let day = session_id.get(8..10)?;
    let time = session_id.get(11..15)?;
    Some(format!("{year}{month}{day}_{time}"))
}

fn tol_analysis_sections(body: &str) -> Map<String, Value> {
    let mut sections = Map::new();
    let markers = [
        ("mirror", "## 1. The Mirror"),
        ("dissonance", "## 2. Dissonance"),
        ("strategicNextActions", "## 3. Strategic Next Actions"),
        ("explicitDirectives", "## 4. Explicit Directives"),
    ];

    for (index, (key, marker)) in markers.iter().enumerate() {
        let Some(start) = body.find(marker) else {
            continue;
        };
        let after_start = &body[start..];
        let next_start = markers
            .iter()
            .skip(index + 1)
            .filter_map(|(_, next_marker)| after_start.find(next_marker))
            .min()
            .unwrap_or(after_start.len());
        sections.insert(key.to_string(), json!(after_start[..next_start].trim()));
    }

    sections
}

fn count_markdown_tasks(section: Option<&Value>) -> usize {
    section
        .and_then(Value::as_str)
        .map(|content| {
            content
                .lines()
                .filter(|line| {
                    line.trim_start().starts_with("* [ ]") || line.trim_start().starts_with("- [ ]")
                })
                .count()
        })
        .unwrap_or(0)
}

pub(crate) fn list_archive_tol_bundle_candidates(
    app: &AppHandle,
) -> Result<Vec<ArchiveTolBundleCandidate>, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let mut session_ids = HashSet::new();
    let transcript_root = tol_mapping_root(&runtime, "derived_sources", "transcript")
        .unwrap_or_else(|| runtime.vault_root.join("03_TOL/TOL Transcripts"));
    let analysis_root = tol_mapping_root(&runtime, "wiki_pages", "analysis")
        .unwrap_or_else(|| runtime.vault_root.join("03_TOL/TOL Analysis"));

    collect_tol_session_ids(&transcript_root, "_TOL_Transcript", &mut session_ids)?;
    collect_tol_session_ids(&analysis_root, "_TOL_Analysis", &mut session_ids)?;

    let mut candidates = Vec::new();
    for session_id in session_ids {
        if let Some(candidate) = build_tol_candidate(&runtime, &session_id)? {
            candidates.push(candidate);
        }
    }

    candidates.sort_by(|left, right| right.session_id.cmp(&left.session_id));
    Ok(candidates)
}

pub(crate) fn build_archive_tol_bundle(
    app: &AppHandle,
    request: ArchiveTolBundleBuildRequest,
) -> Result<ArchiveTolBundleBuildResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let session_id = request.session_id.trim();
    if session_id.is_empty() {
        return Err("TOL bundle session id is required.".to_string());
    }
    let candidate = build_tol_candidate(&runtime, session_id)?
        .ok_or_else(|| format!("No TOL session was found for `{session_id}`."))?;
    let transcript_path = candidate
        .transcript_path
        .clone()
        .ok_or_else(|| format!("TOL session `{session_id}` is missing its transcript."))?;
    let analysis_path = candidate
        .analysis_path
        .clone()
        .ok_or_else(|| format!("TOL session `{session_id}` is missing its analysis note."))?;

    let analysis_abs = resolve_source_path(&runtime, &analysis_path);
    let analysis_content = fs::read_to_string(&analysis_abs)
        .map_err(|error| format!("Failed to read TOL analysis note: {error}"))?;
    let (analysis_frontmatter, analysis_body, _, _) = parse_frontmatter(&analysis_content);
    let sections = tol_analysis_sections(&analysis_body);

    let raw_audio_metadata = candidate.raw_audio_path.as_ref().and_then(|path| {
        let absolute = resolve_source_path(&runtime, path);
        fs::metadata(&absolute).ok().map(|metadata| {
            json!({
                "path": path,
                "originalFileName": absolute.file_name().and_then(|value| value.to_str()).unwrap_or_default(),
                "sizeBytes": metadata.len(),
                "modifiedAt": metadata.modified().ok().and_then(system_time_to_unix),
            })
        })
    });

    let manifest = json!({
        "schemaVersion": 1,
        "bundleType": "audio2tol.session",
        "sourceAddonId": "addon.audio2tol",
        "sessionId": session_id,
        "createdAt": unix_timestamp(),
        "rawAudio": raw_audio_metadata,
        "transcript": {
            "path": transcript_path,
            "format": PathBuf::from(&candidate.transcript_path.clone().unwrap_or_default()).extension().and_then(|value| value.to_str()).unwrap_or("md"),
        },
        "analysis": {
            "path": analysis_path,
            "format": PathBuf::from(&candidate.analysis_path.clone().unwrap_or_default()).extension().and_then(|value| value.to_str()).unwrap_or("md"),
            "frontmatter": analysis_frontmatter,
            "sections": sections,
        },
        "processing": {
            "transcriber": "whisper.cpp",
            "protocolPath": "TOL - SYSTEM INJECTION.rtf",
            "templatePath": "TOL_Analysis_Template.md",
            "metadataCompleteness": "inferred-from-current-audio2tol-output",
        },
        "boundaries": {
            "rawIsImmutable": true,
            "transcriptIsDerived": true,
            "analysisIsDerived": true,
            "trustedWikiWriteAllowed": false,
        }
    });

    let intake = write_archive_intake_artifact(
        app,
        ArchiveIntakeWriteRequest {
            actor_id: request.actor_id.clone(),
            bucket: "tol-bundles".to_string(),
            file_name: format!("{}-tol-bundle.json", slugify(session_id)),
            content: serde_json::to_string_pretty(&manifest)
                .map_err(|error| format!("Failed to encode TOL bundle manifest: {error}"))?,
            metadata: Some(json!({
                "origin": "audio2tol",
                "sessionId": session_id,
                "sourceType": "tol_bundle",
                "rawAudioPath": candidate.raw_audio_path,
                "transcriptPath": candidate.transcript_path,
                "analysisPath": candidate.analysis_path,
            })),
        },
    )?;

    let ingest = queue_archive_ingest_request(
        app,
        ArchiveIngestRequestRecord {
            actor_id: request.actor_id.clone(),
            source_path: intake.artifact_path.clone(),
            source_type: "tol_bundle".to_string(),
            source_role: Some("audio2tol-bundle".to_string()),
            intent: "review-and-ingest".to_string(),
            provenance: Some(json!({
                "origin": "audio2tol",
                "sessionId": session_id,
                "bundleManifestPath": intake.artifact_path,
                "metadataPath": intake.metadata_path,
            })),
        },
    )?;

    Ok(ArchiveTolBundleBuildResult {
        session_id: session_id.to_string(),
        intake_artifact_path: intake.artifact_path,
        request_file: ingest.request_file,
        queued_at: ingest.queued_at,
        raw_audio_path: candidate.raw_audio_path,
        transcript_path,
        analysis_path,
    })
}
