// Intent citation: docs/architecture/ADR-013-living-archive-memory-domains.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use tauri::AppHandle;

use super::{
    open_archive_db, relative_to_vault, slugify, source_hash, source_id_from_path,
    system_time_label, unix_timestamp, ArchiveClassificationProposal,
    ArchiveImportedLibrarySummary, ArchiveLibraryClassificationReview,
    ArchiveLibraryClassificationReviewRequest, ArchiveLibraryImportRequest,
    ArchiveLibraryImportResult, ArchiveLibraryImportSourceRecord, ArchiveLibraryReorganisationMove,
    ArchiveLibraryReorganisationPlan, ArchiveLibraryReorganisationPlanRequest, ArchiveRuntime,
    ArchiveSourceFolderScanRequest, ArchiveSourceFolderScanResult, ArchiveSourceWatchIndexRecord,
    ArchiveSourceWatchRecord, VaultMappingFile,
};

fn source_watch_roots(runtime: &ArchiveRuntime) -> Vec<&VaultMappingFile> {
    runtime
        .mappings
        .iter()
        .filter(|mapping| mapping.role == "raw_sources" || mapping.role == "derived_sources")
        .collect()
}

fn selected_source_watch_roots<'a>(
    runtime: &'a ArchiveRuntime,
    root_path: Option<&str>,
) -> Result<Vec<&'a VaultMappingFile>, String> {
    let Some(root_path) = root_path.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(source_watch_roots(runtime));
    };
    let selected = PathBuf::from(root_path);
    let selected_display = selected.display().to_string();
    let roots = runtime
        .mappings
        .iter()
        .filter(|mapping| {
            let absolute = runtime.vault_root.join(&mapping.path);
            mapping.path == root_path || absolute.display().to_string() == selected_display
        })
        .collect::<Vec<_>>();
    if roots.is_empty() {
        return Err(format!(
            "Selected source folder `{root_path}` is not present in the Living Archive vault map."
        ));
    }
    Ok(roots)
}

#[cfg_attr(not(test), allow(dead_code))]
pub(super) fn supported_source_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase()),
        Some(extension)
            if matches!(
                extension.as_str(),
                "md" | "txt" | "json" | "pdf" | "docx" | "csv" | "tsv" | "mp3" | "wav" | "m4a" | "aac" | "flac"
            )
    )
}

fn infer_source_type(path: &Path, mapping: &VaultMappingFile) -> String {
    if let Some(subtype) = mapping.subtype.as_ref().filter(|value| !value.is_empty()) {
        return subtype.clone();
    }
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .unwrap_or_else(|| mapping.role.clone())
}

fn source_title_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("Untitled source")
        .to_string()
}

fn wiki_link_title(title: &str) -> String {
    let cleaned = title.replace(['[', ']'], "").trim().to_string();
    if cleaned.is_empty() {
        "Untitled source".to_string()
    } else {
        cleaned
    }
}

fn build_library_classification_proposals(
    records: &[ArchiveLibraryImportSourceRecord],
) -> Vec<ArchiveClassificationProposal> {
    records
        .iter()
        .take(24)
        .map(|record| {
            let haystack = format!("{} {}", record.title, record.canonical_path).to_lowercase();
            let external_signals = [
                "research",
                "paper",
                "meeting",
                "client",
                "company",
                "market",
                "report",
                "transcript",
                "competitor",
                "business",
            ];
            let human_signals = [
                "journal",
                "diary",
                "tol",
                "personal",
                "identity",
                "constitution",
                "protocol",
                "notes",
                "philosophy",
                "cosmodestiny",
                "augmentatism",
            ];
            let external_score = external_signals
                .iter()
                .filter(|signal| haystack.contains(**signal))
                .count();
            let human_score = human_signals
                .iter()
                .filter(|signal| haystack.contains(**signal))
                .count();
            let proposed_target = if human_score > external_score {
                "human-knowledge"
            } else if external_score > human_score {
                "external-knowledge"
            } else {
                "unclear"
            }
            .to_string();
            let confidence = if proposed_target == "unclear" {
                "low"
            } else if human_score.max(external_score) > 1 {
                "high"
            } else {
                "medium"
            }
            .to_string();
            let ownership_tag = match proposed_target.as_str() {
                "human-knowledge" => "ownership/human",
                "external-knowledge" => "ownership/external",
                _ => "ownership/unclear",
            };
            let reason = if proposed_target == "unclear" {
                "No strong ownership signal was detected. Human decision is required before reorganisation."
                    .to_string()
            } else {
                format!(
                    "Matched {} path or title signals.",
                    if proposed_target == "human-knowledge" {
                        "human-authored"
                    } else {
                        "external/reference"
                    }
                )
            };

            ArchiveClassificationProposal {
                source_id: record.source_id.clone(),
                title: record.title.clone(),
                canonical_path: record.canonical_path.clone(),
                proposed_target,
                confidence,
                reason,
                tags: vec![
                    ownership_tag.to_string(),
                    format!("source-type/{}", record.source_type),
                    "review/unapproved".to_string(),
                ],
                wikilinks: vec![format!("[[{}]]", wiki_link_title(&record.title))],
            }
        })
        .collect()
}

fn normalize_memory_domain(value: &str) -> Result<String, String> {
    match value.trim() {
        "human-knowledge" | "external-knowledge" | "ai-memory" | "mixed-library" => {
            Ok(value.trim().to_string())
        }
        other => Err(format!(
            "Unsupported Living Archive memory domain `{other}`. Use human-knowledge, external-knowledge, ai-memory, or mixed-library."
        )),
    }
}

fn obsidian_vault_detected(source_root: &Path) -> bool {
    source_root.is_dir() && source_root.join(".obsidian").is_dir()
}

fn normalize_import_mode(value: &str) -> Result<String, String> {
    match value.trim() {
        "copy" | "move" | "reference" => Ok(value.trim().to_string()),
        other => Err(format!(
            "Unsupported Living Archive import mode `{other}`. Use copy, move, or reference."
        )),
    }
}

fn unique_library_root(base: PathBuf) -> PathBuf {
    if !base.exists() {
        return base;
    }
    let timestamp = unix_timestamp().replace(':', "-");
    let file_name = base
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("library");
    base.with_file_name(format!("{file_name}-{timestamp}"))
}

fn copy_source_file(source: &Path, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create imported source folder: {error}"))?;
    }
    fs::copy(source, target).map(|_| ()).map_err(|error| {
        format!(
            "Failed to copy source file {} to {}: {error}",
            source.display(),
            target.display()
        )
    })
}

fn collect_source_files(root: &Path, output: &mut Vec<PathBuf>) -> Result<usize, String> {
    if !root.exists() {
        return Ok(0);
    }
    let mut skipped = 0usize;
    for entry in fs::read_dir(root)
        .map_err(|error| format!("Failed to read source folder {}: {error}", root.display()))?
    {
        let entry =
            entry.map_err(|error| format!("Failed to read source folder entry: {error}"))?;
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if file_name.starts_with('.') || file_name == "_LivingArchive" {
            skipped += 1;
            continue;
        }
        if path.is_dir() {
            skipped += collect_source_files(&path, output)?;
        } else if supported_source_file(&path) {
            output.push(path);
        } else {
            skipped += 1;
        }
    }
    Ok(skipped)
}

fn read_source_watch_index(
    runtime: &ArchiveRuntime,
) -> Result<HashMap<String, ArchiveSourceWatchIndexRecord>, String> {
    let path = runtime.source_watch_index_path();
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read archive source watch index: {error}"))?;
    let records: Vec<ArchiveSourceWatchIndexRecord> = serde_json::from_str(&raw)
        .map_err(|error| format!("Invalid archive source watch index JSON: {error}"))?;
    Ok(records
        .into_iter()
        .map(|record| (record.path.clone(), record))
        .collect())
}

fn write_source_watch_index(
    runtime: &ArchiveRuntime,
    records: &HashMap<String, ArchiveSourceWatchIndexRecord>,
) -> Result<(), String> {
    fs::create_dir_all(&runtime.data_root)
        .map_err(|error| format!("Failed to create archive data root: {error}"))?;
    let mut sorted = records.values().cloned().collect::<Vec<_>>();
    sorted.sort_by(|left, right| left.path.cmp(&right.path));
    let payload = serde_json::to_string_pretty(&sorted)
        .map_err(|error| format!("Failed to encode archive source watch index: {error}"))?;
    fs::write(runtime.source_watch_index_path(), payload)
        .map_err(|error| format!("Failed to write archive source watch index: {error}"))
}

fn upsert_source_scan_row(
    connection: &Connection,
    record: &ArchiveSourceWatchIndexRecord,
    changed: bool,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO sources (id, title, type, raw_path, hash, added_at, processed, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)
             ON CONFLICT(raw_path) DO UPDATE SET
                title = excluded.title,
                type = excluded.type,
                hash = excluded.hash,
                processed = CASE WHEN ?8 THEN 0 ELSE processed END,
                metadata = excluded.metadata",
            params![
                source_id_from_path(&record.path),
                record.title,
                record.source_type,
                record.path,
                record.hash,
                record.first_seen_at,
                json!({
                    "registeredBy": "resonantos-vnext-source-scan",
                    "rootRole": record.root_role,
                    "rootSubtype": record.root_subtype,
                    "absolutePath": record.absolute_path,
                    "sizeBytes": record.size_bytes,
                    "modifiedAt": record.modified_at,
                    "lastSeenAt": record.last_seen_at,
                })
                .to_string(),
                changed,
            ],
        )
        .map(|_| ())
        .map_err(|error| format!("Failed to upsert archive source scan row: {error}"))
}

pub(crate) fn scan_archive_source_folders(
    app: &AppHandle,
    request: ArchiveSourceFolderScanRequest,
) -> Result<ArchiveSourceFolderScanResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let scanned_at = unix_timestamp();
    let mut previous_index = read_source_watch_index(&runtime)?;
    let mut next_index = previous_index.clone();
    let mut records = Vec::new();
    let mut skipped_files = 0usize;
    let roots = selected_source_watch_roots(&runtime, request.root_path.as_deref())?;
    let connection = open_archive_db(&runtime)?;

    for mapping in &roots {
        let root = runtime.vault_root.join(&mapping.path);
        let mut files = Vec::new();
        skipped_files += collect_source_files(&root, &mut files)?;

        for file in files {
            let metadata = fs::metadata(&file).map_err(|error| {
                format!(
                    "Failed to read source file metadata {}: {error}",
                    file.display()
                )
            })?;
            let relative_path = relative_to_vault(&runtime, &file);
            let hash = source_hash(&file)?;
            let previous = previous_index.remove(&relative_path);
            let status = match previous.as_ref() {
                None => "new",
                Some(record) if record.hash != hash => "changed",
                Some(_) => "unchanged",
            }
            .to_string();
            let modified_at = metadata
                .modified()
                .map(system_time_label)
                .unwrap_or_else(|_| "unknown".to_string());
            let first_seen_at = previous
                .as_ref()
                .map(|record| record.first_seen_at.clone())
                .unwrap_or_else(|| scanned_at.clone());
            let source_type = infer_source_type(&file, mapping);
            let index_record = ArchiveSourceWatchIndexRecord {
                path: relative_path.clone(),
                absolute_path: file.display().to_string(),
                root_role: mapping.role.clone(),
                root_subtype: mapping.subtype.clone(),
                source_type,
                title: source_title_from_path(&file),
                hash: hash.clone(),
                size_bytes: metadata.len(),
                modified_at: modified_at.clone(),
                first_seen_at,
                last_seen_at: scanned_at.clone(),
            };
            let changed = status == "new" || status == "changed";
            let indexed_in_db = if let Some(connection) = connection.as_ref() {
                upsert_source_scan_row(connection, &index_record, changed).is_ok()
            } else {
                false
            };
            records.push(ArchiveSourceWatchRecord {
                path: index_record.path.clone(),
                absolute_path: index_record.absolute_path.clone(),
                root_role: index_record.root_role.clone(),
                root_subtype: index_record.root_subtype.clone(),
                source_type: index_record.source_type.clone(),
                title: index_record.title.clone(),
                hash: index_record.hash.clone(),
                previous_hash: previous.map(|record| record.hash),
                size_bytes: index_record.size_bytes,
                modified_at,
                status,
                indexed_in_db,
            });
            next_index.insert(relative_path, index_record);
        }
    }

    write_source_watch_index(&runtime, &next_index)?;

    let new_files = records
        .iter()
        .filter(|record| record.status == "new")
        .count();
    let changed_files = records
        .iter()
        .filter(|record| record.status == "changed")
        .count();
    let unchanged_files = records
        .iter()
        .filter(|record| record.status == "unchanged")
        .count();
    records.sort_by(|left, right| {
        left.status
            .cmp(&right.status)
            .then_with(|| left.path.cmp(&right.path))
    });

    Ok(ArchiveSourceFolderScanResult {
        scanned_at,
        roots_scanned: roots.len(),
        files_seen: records.len(),
        new_files,
        changed_files,
        unchanged_files,
        skipped_files,
        records,
        index_path: runtime.source_watch_index_path().display().to_string(),
    })
}

pub(crate) fn import_archive_library(
    app: &AppHandle,
    request: ArchiveLibraryImportRequest,
) -> Result<ArchiveLibraryImportResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    import_archive_library_with_runtime(&runtime, request)
}

pub(super) fn import_archive_library_with_runtime(
    runtime: &ArchiveRuntime,
    request: ArchiveLibraryImportRequest,
) -> Result<ArchiveLibraryImportResult, String> {
    let domain = normalize_memory_domain(&request.domain)?;
    let import_mode = normalize_import_mode(&request.import_mode)?;
    let imported_at = unix_timestamp();
    let source_root = PathBuf::from(request.source_path.trim());
    if !source_root.exists() {
        return Err(format!(
            "Selected library path does not exist: {}",
            source_root.display()
        ));
    }
    let obsidian_vault_detected = obsidian_vault_detected(&source_root);
    let metadata_standard = if obsidian_vault_detected {
        "obsidian-compatible-existing-vault"
    } else {
        "obsidian-frontmatter-wikilinks"
    }
    .to_string();
    let classification_status = if domain == "mixed-library" {
        "needs-ai-assisted-classification"
    } else {
        "user-classified"
    }
    .to_string();
    let recommended_addon = if obsidian_vault_detected {
        None
    } else {
        Some("addon.obsidian".to_string())
    };

    let library_name = request
        .library_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .or_else(|| {
            source_root
                .file_name()
                .and_then(|value| value.to_str())
                .map(ToString::to_string)
        })
        .unwrap_or_else(|| "Imported Library".to_string());
    let library_id = slugify(&library_name);
    let domain_root = runtime.memory_domain_root(&domain);
    let canonical_root = unique_library_root(domain_root.join("sources").join(&library_id));
    let versions_root = domain_root.join("versions").join(&library_id);
    let metadata_root = domain_root.join("metadata");
    fs::create_dir_all(&canonical_root)
        .map_err(|error| format!("Failed to create canonical library root: {error}"))?;
    fs::create_dir_all(&versions_root)
        .map_err(|error| format!("Failed to create library version root: {error}"))?;
    fs::create_dir_all(&metadata_root)
        .map_err(|error| format!("Failed to create library metadata root: {error}"))?;

    let mut files = Vec::new();
    let skipped_files = if source_root.is_dir() {
        collect_source_files(&source_root, &mut files)?
    } else if supported_source_file(&source_root) {
        files.push(source_root.clone());
        0
    } else {
        1
    };

    let mut records = Vec::new();
    for source_file in &files {
        let relative = if source_root.is_dir() {
            source_file
                .strip_prefix(&source_root)
                .unwrap_or(source_file)
                .to_path_buf()
        } else {
            source_file
                .file_name()
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("source"))
        };
        let canonical_path = canonical_root.join(&relative);
        if import_mode == "copy" {
            copy_source_file(source_file, &canonical_path)?;
        } else if import_mode == "move" {
            if let Some(parent) = canonical_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Failed to create moved source folder: {error}"))?;
            }
            fs::rename(source_file, &canonical_path).map_err(|error| {
                format!(
                    "Failed to move source file {} to {}: {error}",
                    source_file.display(),
                    canonical_path.display()
                )
            })?;
        }

        let version_source = if import_mode == "reference" {
            source_file
        } else {
            &canonical_path
        };
        let metadata = fs::metadata(version_source).map_err(|error| {
            format!(
                "Failed to read imported source metadata {}: {error}",
                version_source.display()
            )
        })?;
        let hash = source_hash(version_source)?;
        let source_id = slugify(&format!("{}-{}", library_id, relative.display()));
        let version_id = "v1".to_string();
        let version_path = versions_root.join(&source_id).join(&version_id);
        if import_mode != "reference" {
            copy_source_file(version_source, &version_path)?;
        }
        let record = ArchiveLibraryImportSourceRecord {
            source_id,
            version_id,
            original_path: source_file.display().to_string(),
            canonical_path: if import_mode == "reference" {
                source_file.display().to_string()
            } else {
                canonical_path.display().to_string()
            },
            source_type: source_file
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| value.to_ascii_lowercase())
                .unwrap_or_else(|| "source".to_string()),
            title: source_title_from_path(source_file),
            hash,
            size_bytes: metadata.len(),
        };
        records.push(record);
    }

    let manifest_path = metadata_root.join(format!("{}-manifest.json", slugify(&library_name)));
    let version_ledger_path =
        metadata_root.join(format!("{}-version-ledger.jsonl", slugify(&library_name)));
    let classification_proposals = if domain == "mixed-library" {
        build_library_classification_proposals(&records)
    } else {
        Vec::new()
    };
    let classification_manifest_path = if domain == "mixed-library" {
        let path = metadata_root.join(format!(
            "{}-classification-review.json",
            slugify(&library_name)
        ));
        let review_payload = json!({
            "schemaVersion": 1,
            "artifactType": "library-classification-review",
            "createdAt": imported_at,
            "actorId": request.actor_id,
            "libraryId": library_id,
            "libraryName": library_name,
            "originalPath": source_root.display().to_string(),
            "canonicalRoot": canonical_root.display().to_string(),
            "classificationStatus": classification_status,
            "metadataStandard": metadata_standard,
            "policy": {
                "structuralChangesAllowed": false,
                "requiresHumanApprovalBeforeMove": true,
                "labels": ["human-knowledge", "external-knowledge", "unclear"],
                "defaultAction": "tag-and-review-before-reorganise"
            },
            "summary": {
                "recordsTotal": records.len(),
                "proposalsPreviewed": classification_proposals.len(),
                "remainingForFullReview": records.len().saturating_sub(classification_proposals.len())
            },
            "proposals": classification_proposals.clone(),
        });
        fs::write(
            &path,
            serde_json::to_string_pretty(&review_payload).map_err(|error| {
                format!("Failed to encode library classification review artifact: {error}")
            })?,
        )
        .map_err(|error| {
            format!("Failed to write library classification review artifact: {error}")
        })?;
        Some(path)
    } else {
        None
    };
    let version_ledger = records
        .iter()
        .map(|record| {
            json!({
                "recordedAt": imported_at,
                "event": "source-version-created",
                "libraryId": library_id,
                "sourceId": record.source_id,
                "versionId": record.version_id,
                "hash": record.hash,
                "sizeBytes": record.size_bytes,
                "originalPath": record.original_path,
                "canonicalPath": record.canonical_path,
                "sourceType": record.source_type,
            })
            .to_string()
        })
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(
        &version_ledger_path,
        if version_ledger.is_empty() {
            String::new()
        } else {
            format!("{version_ledger}\n")
        },
    )
    .map_err(|error| format!("Failed to write library source version ledger: {error}"))?;
    let manifest = json!({
        "importedAt": imported_at,
        "actorId": request.actor_id,
        "domain": domain,
        "importMode": import_mode,
        "libraryId": library_id,
        "libraryName": library_name,
        "originalPath": source_root.display().to_string(),
        "canonicalRoot": canonical_root.display().to_string(),
        "filesSeen": files.len(),
        "skippedFiles": skipped_files,
        "classificationStatus": classification_status,
        "metadataStandard": metadata_standard,
        "obsidianVaultDetected": obsidian_vault_detected,
        "recommendedAddon": recommended_addon,
        "versionLedgerPath": version_ledger_path.display().to_string(),
        "classificationManifestPath": classification_manifest_path.as_ref().map(|path| path.display().to_string()),
        "records": records.clone(),
        "canonicality": {
            "managedCopyIsCanonical": import_mode != "reference",
            "originalExternalPathUsedAfterImport": import_mode == "reference"
        },
        "classificationPolicy": {
            "mixedLibraryRequiresReview": domain == "mixed-library",
            "defaultStandardForNonObsidianSources": "Obsidian frontmatter tags plus wikilinks",
            "allowedLabels": ["human-knowledge", "external-knowledge", "unclear-needs-human-decision"]
        }
    });
    fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest)
            .map_err(|error| format!("Failed to encode library import manifest: {error}"))?,
    )
    .map_err(|error| format!("Failed to write library import manifest: {error}"))?;

    Ok(ArchiveLibraryImportResult {
        imported_at,
        domain,
        import_mode,
        library_id,
        library_name,
        original_path: source_root.display().to_string(),
        canonical_root: canonical_root.display().to_string(),
        files_seen: files.len(),
        files_imported: records.len(),
        skipped_files,
        manifest_path: manifest_path.display().to_string(),
        version_ledger_path: version_ledger_path.display().to_string(),
        classification_manifest_path: classification_manifest_path
            .map(|path| path.display().to_string()),
        classification_status,
        metadata_standard,
        obsidian_vault_detected,
        recommended_addon,
        records,
        classification_proposals,
    })
}

fn parse_imported_library_manifest(
    path: &Path,
) -> Result<Option<ArchiveImportedLibrarySummary>, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read library import manifest: {error}"))?;
    let payload = serde_json::from_str::<Value>(&raw)
        .map_err(|error| format!("Invalid library import manifest JSON: {error}"))?;
    if !payload.get("libraryId").is_some() || !payload.get("canonicalRoot").is_some() {
        return Ok(None);
    }
    let records_count = payload
        .get("records")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    Ok(Some(ArchiveImportedLibrarySummary {
        imported_at: payload
            .get("importedAt")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        domain: payload
            .get("domain")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        import_mode: payload
            .get("importMode")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        library_id: payload
            .get("libraryId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        library_name: payload
            .get("libraryName")
            .and_then(Value::as_str)
            .unwrap_or("Imported Library")
            .to_string(),
        original_path: payload
            .get("originalPath")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        canonical_root: payload
            .get("canonicalRoot")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        files_seen: payload
            .get("filesSeen")
            .and_then(Value::as_u64)
            .unwrap_or(0) as usize,
        files_imported: payload
            .get("records")
            .and_then(Value::as_array)
            .map(Vec::len)
            .or_else(|| {
                payload
                    .get("filesImported")
                    .and_then(Value::as_u64)
                    .map(|value| value as usize)
            })
            .unwrap_or(records_count),
        skipped_files: payload
            .get("skippedFiles")
            .and_then(Value::as_u64)
            .unwrap_or(0) as usize,
        manifest_path: path.display().to_string(),
        version_ledger_path: payload
            .get("versionLedgerPath")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        classification_manifest_path: payload
            .get("classificationManifestPath")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        classification_status: payload
            .get("classificationStatus")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        metadata_standard: payload
            .get("metadataStandard")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        obsidian_vault_detected: payload
            .get("obsidianVaultDetected")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        recommended_addon: payload
            .get("recommendedAddon")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        records_count,
    }))
}

pub(super) fn collect_imported_library_manifests(
    metadata_root: &Path,
    output: &mut Vec<ArchiveImportedLibrarySummary>,
) -> Result<(), String> {
    if !metadata_root.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(metadata_root)
        .map_err(|error| format!("Failed to read library metadata root: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("Failed to read library metadata entry: {error}"))?;
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if !file_name.ends_with("-manifest.json") {
            continue;
        }
        if let Some(summary) = parse_imported_library_manifest(&path)? {
            output.push(summary);
        }
    }
    Ok(())
}

pub(crate) fn list_imported_archive_libraries(
    app: &AppHandle,
) -> Result<Vec<ArchiveImportedLibrarySummary>, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let mut libraries = Vec::new();
    for (_, domain_root) in runtime.memory_domain_roots() {
        collect_imported_library_manifests(&domain_root.join("metadata"), &mut libraries)?;
    }
    libraries.sort_by(|left, right| {
        right
            .imported_at
            .cmp(&left.imported_at)
            .then_with(|| left.library_name.cmp(&right.library_name))
    });
    Ok(libraries)
}

fn string_from_payload(payload: &Value, key: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn resolve_classification_manifest_path(
    runtime: &ArchiveRuntime,
    requested_path: &str,
) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(requested_path);
    let resolved = if candidate.is_absolute() {
        candidate
    } else {
        runtime.managed_root.join(candidate)
    };
    let normalized = resolved.canonicalize().map_err(|error| {
        format!("Failed to resolve library classification review path: {error}")
    })?;
    let allowed = runtime
        .allowed_roots()
        .into_iter()
        .any(|root| normalized == root || normalized.starts_with(&root));
    if !allowed {
        return Err(format!(
            "Library classification review path `{}` is outside the allowed archive roots.",
            normalized.display()
        ));
    }
    let file_name = normalized
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !file_name.ends_with("-classification-review.json") {
        return Err(
            "Only Living Archive classification-review artifacts can be opened here.".to_string(),
        );
    }
    Ok(normalized)
}

pub(crate) fn read_archive_library_classification_review(
    app: &AppHandle,
    request: ArchiveLibraryClassificationReviewRequest,
) -> Result<ArchiveLibraryClassificationReview, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let manifest_path =
        resolve_classification_manifest_path(&runtime, &request.classification_manifest_path)?;
    let raw = fs::read_to_string(&manifest_path).map_err(|error| {
        format!("Failed to read library classification review artifact: {error}")
    })?;
    let payload = serde_json::from_str::<Value>(&raw)
        .map_err(|error| format!("Invalid library classification review JSON: {error}"))?;
    let artifact_type = string_from_payload(&payload, "artifactType");
    if artifact_type != "library-classification-review" {
        return Err(
            "Selected artifact is not a Living Archive library classification review.".to_string(),
        );
    }
    let proposals = serde_json::from_value::<Vec<ArchiveClassificationProposal>>(
        payload
            .get("proposals")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new())),
    )
    .map_err(|error| format!("Invalid library classification proposals: {error}"))?;
    let summary = payload.get("summary").unwrap_or(&Value::Null);
    let policy = payload.get("policy").unwrap_or(&Value::Null);
    Ok(ArchiveLibraryClassificationReview {
        artifact_type,
        created_at: string_from_payload(&payload, "createdAt"),
        actor_id: string_from_payload(&payload, "actorId"),
        library_id: string_from_payload(&payload, "libraryId"),
        library_name: string_from_payload(&payload, "libraryName"),
        original_path: string_from_payload(&payload, "originalPath"),
        canonical_root: string_from_payload(&payload, "canonicalRoot"),
        classification_status: string_from_payload(&payload, "classificationStatus"),
        metadata_standard: string_from_payload(&payload, "metadataStandard"),
        structural_changes_allowed: policy
            .get("structuralChangesAllowed")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        requires_human_approval_before_move: policy
            .get("requiresHumanApprovalBeforeMove")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        records_total: summary
            .get("recordsTotal")
            .and_then(Value::as_u64)
            .unwrap_or(proposals.len() as u64) as usize,
        proposals_previewed: summary
            .get("proposalsPreviewed")
            .and_then(Value::as_u64)
            .unwrap_or(proposals.len() as u64) as usize,
        remaining_for_full_review: summary
            .get("remainingForFullReview")
            .and_then(Value::as_u64)
            .unwrap_or(0) as usize,
        proposals,
        manifest_path: manifest_path.display().to_string(),
    })
}

fn relative_canonical_source_path(canonical_root: &str, canonical_path: &str) -> PathBuf {
    let root = PathBuf::from(canonical_root);
    let path = PathBuf::from(canonical_path);
    path.strip_prefix(&root)
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            path.file_name()
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("unresolved-source"))
        })
}

fn reorganisation_destination(
    runtime: &ArchiveRuntime,
    review: &ArchiveLibraryClassificationReview,
    proposal: &ArchiveClassificationProposal,
) -> Option<PathBuf> {
    let domain = match proposal.proposed_target.as_str() {
        "human-knowledge" => "human-knowledge",
        "external-knowledge" => "external-knowledge",
        _ => return None,
    };
    Some(
        runtime
            .memory_domain_root(domain)
            .join("sources")
            .join(&review.library_id)
            .join(relative_canonical_source_path(
                &review.canonical_root,
                &proposal.canonical_path,
            )),
    )
}

pub(crate) fn write_archive_library_reorganisation_plan(
    app: &AppHandle,
    request: ArchiveLibraryReorganisationPlanRequest,
) -> Result<ArchiveLibraryReorganisationPlan, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let review = read_archive_library_classification_review(
        app,
        ArchiveLibraryClassificationReviewRequest {
            classification_manifest_path: request.classification_manifest_path,
        },
    )?;
    let planned_at = unix_timestamp();
    let metadata_root = PathBuf::from(&review.manifest_path)
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| runtime.memory_domain_root("mixed-library").join("metadata"));
    fs::create_dir_all(&metadata_root)
        .map_err(|error| format!("Failed to create reorganisation metadata root: {error}"))?;

    let entries = review
        .proposals
        .iter()
        .map(|proposal| {
            let destination = reorganisation_destination(&runtime, &review, proposal);
            ArchiveLibraryReorganisationMove {
                source_id: proposal.source_id.clone(),
                title: proposal.title.clone(),
                proposed_target: proposal.proposed_target.clone(),
                source_path: proposal.canonical_path.clone(),
                destination_path: destination.map(|path| path.display().to_string()),
                action: if proposal.proposed_target == "unclear" {
                    "tag-only-review".to_string()
                } else {
                    "propose-move-after-approval".to_string()
                },
                confidence: proposal.confidence.clone(),
                reason: proposal.reason.clone(),
            }
        })
        .collect::<Vec<_>>();
    let moves_planned = entries
        .iter()
        .filter(|entry| entry.action == "propose-move-after-approval")
        .count();
    let tag_only_count = entries
        .iter()
        .filter(|entry| entry.action == "tag-only-review")
        .count();
    let blocked_count = review.remaining_for_full_review + tag_only_count;
    let slug = slugify(&review.library_name);
    let plan_path = metadata_root.join(format!("{slug}-reorganisation-plan.json"));
    let rollback_plan_path = metadata_root.join(format!("{slug}-rollback-plan.json"));
    let audit_log_path = metadata_root.join(format!("{slug}-reorganisation-audit.jsonl"));
    let plan_payload = json!({
        "schemaVersion": 1,
        "artifactType": "library-reorganisation-plan",
        "plannedAt": planned_at,
        "actorId": request.actor_id,
        "libraryId": review.library_id,
        "libraryName": review.library_name,
        "classificationManifestPath": review.manifest_path,
        "requiresApproval": true,
        "structuralChangesAllowed": false,
        "executionPolicy": {
            "filesMovedByThisCommand": 0,
            "futureMoveRequiresExplicitHumanApproval": true,
            "unclearSourcesRemainInMixedLibrary": true
        },
        "summary": {
            "movesPlanned": moves_planned,
            "tagOnlyCount": tag_only_count,
            "blockedCount": blocked_count
        },
        "entries": entries.clone(),
    });
    fs::write(
        &plan_path,
        serde_json::to_string_pretty(&plan_payload)
            .map_err(|error| format!("Failed to encode reorganisation plan: {error}"))?,
    )
    .map_err(|error| format!("Failed to write reorganisation plan: {error}"))?;

    let rollback_payload = json!({
        "schemaVersion": 1,
        "artifactType": "library-reorganisation-rollback-plan",
        "plannedAt": planned_at,
        "libraryId": review.library_id,
        "libraryName": review.library_name,
        "sourcePlanPath": plan_path.display().to_string(),
        "rollbackPolicy": {
            "appliesOnlyAfterFutureMoveExecution": true,
            "filesMovedByThisCommand": 0,
            "restoreFromSourcePath": true
        },
        "entries": entries.clone(),
    });
    fs::write(
        &rollback_plan_path,
        serde_json::to_string_pretty(&rollback_payload)
            .map_err(|error| format!("Failed to encode rollback plan: {error}"))?,
    )
    .map_err(|error| format!("Failed to write rollback plan: {error}"))?;

    let audit_line = json!({
        "event": "library-reorganisation-plan-created",
        "plannedAt": planned_at,
        "actorId": request.actor_id,
        "libraryId": review.library_id,
        "planPath": plan_path.display().to_string(),
        "rollbackPlanPath": rollback_plan_path.display().to_string(),
        "filesMoved": 0,
        "requiresApproval": true
    });
    let mut audit = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&audit_log_path)
        .map_err(|error| format!("Failed to open reorganisation audit log: {error}"))?;
    writeln!(audit, "{audit_line}")
        .map_err(|error| format!("Failed to append reorganisation audit log: {error}"))?;

    Ok(ArchiveLibraryReorganisationPlan {
        planned_at,
        actor_id: request.actor_id,
        library_id: review.library_id,
        library_name: review.library_name,
        plan_path: plan_path.display().to_string(),
        rollback_plan_path: rollback_plan_path.display().to_string(),
        audit_log_path: audit_log_path.display().to_string(),
        requires_approval: true,
        structural_changes_allowed: false,
        moves_planned,
        tag_only_count,
        blocked_count,
        entries,
    })
}
