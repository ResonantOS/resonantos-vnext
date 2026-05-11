use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

const MAX_NOTE_BYTES: u64 = 1_048_576;
const DEFAULT_NOTE_LIMIT: usize = 200;
const MAX_NOTE_LIMIT: usize = 1_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianVaultRequest {
    pub vault_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianListNotesRequest {
    pub vault_path: String,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianReadNoteRequest {
    pub vault_path: String,
    pub note_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianOpenNoteRequest {
    pub vault_path: String,
    pub note_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianWriteNoteRequest {
    pub vault_path: String,
    pub note_path: String,
    pub content: String,
    pub expected_modified_at: Option<String>,
    pub actor_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianCreateNoteRequest {
    pub vault_path: String,
    pub note_path: String,
    pub content: Option<String>,
    pub actor_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianCreateFolderRequest {
    pub vault_path: String,
    pub folder_path: String,
    pub actor_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianMoveNoteRequest {
    pub vault_path: String,
    pub from_note_path: String,
    pub to_note_path: String,
    pub expected_modified_at: Option<String>,
    pub actor_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianArchiveNoteRequest {
    pub vault_path: String,
    pub note_path: String,
    pub expected_modified_at: Option<String>,
    pub actor_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianVaultIndexRequest {
    pub vault_path: String,
    pub query: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianVaultStatus {
    pub vault_path: String,
    pub exists: bool,
    pub is_directory: bool,
    pub obsidian_config_detected: bool,
    pub markdown_files: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianNoteSummary {
    pub title: String,
    pub relative_path: String,
    pub size_bytes: u64,
    pub modified_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianNotePayload {
    pub title: String,
    pub relative_path: String,
    pub content: String,
    pub size_bytes: u64,
    pub modified_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianOpenNoteResult {
    pub opened_url: String,
    pub absolute_path: String,
    pub note_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianWriteNoteResult {
    pub note_path: String,
    pub title: String,
    pub size_bytes: u64,
    pub previous_modified_at: Option<String>,
    pub modified_at: Option<String>,
    pub version_path: String,
    pub audit_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianNoteOperationResult {
    pub operation: String,
    pub note_path: Option<String>,
    pub previous_note_path: Option<String>,
    pub folder_path: Option<String>,
    pub archived_path: Option<String>,
    pub title: Option<String>,
    pub size_bytes: Option<u64>,
    pub modified_at: Option<String>,
    pub version_path: Option<String>,
    pub audit_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianBacklink {
    pub source_path: String,
    pub source_title: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianIndexedNote {
    pub title: String,
    pub relative_path: String,
    pub size_bytes: u64,
    pub modified_at: Option<String>,
    pub tags: Vec<String>,
    pub wikilinks: Vec<String>,
    pub backlinks: Vec<ObsidianBacklink>,
    pub excerpt: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsidianVaultIndex {
    pub vault_path: String,
    pub note_count: usize,
    pub query: Option<String>,
    pub notes: Vec<ObsidianIndexedNote>,
}

pub(crate) fn query_obsidian_vault_status(
    request: ObsidianVaultRequest,
) -> Result<ObsidianVaultStatus, String> {
    let path = PathBuf::from(request.vault_path.trim());
    let exists = path.exists();
    let is_directory = path.is_dir();
    let obsidian_config_detected = is_directory && path.join(".obsidian").is_dir();
    let markdown_files = if is_directory {
        collect_markdown_notes(&path, MAX_NOTE_LIMIT)
            .map(|notes| notes.len())
            .unwrap_or(0)
    } else {
        0
    };
    let mut warnings = Vec::new();

    if !exists {
        warnings.push("The selected path does not exist.".to_string());
    } else if !is_directory {
        warnings.push("The selected path is not a folder.".to_string());
    } else if !obsidian_config_detected {
        warnings.push("No .obsidian configuration folder was detected; ResonantOS will treat this as an Obsidian-compatible markdown folder only.".to_string());
    }
    if markdown_files >= MAX_NOTE_LIMIT {
        warnings.push(format!(
            "Vault preview is capped at {MAX_NOTE_LIMIT} markdown notes in V1."
        ));
    }

    Ok(ObsidianVaultStatus {
        vault_path: path.display().to_string(),
        exists,
        is_directory,
        obsidian_config_detected,
        markdown_files,
        warnings,
    })
}

pub(crate) fn list_obsidian_notes(
    request: ObsidianListNotesRequest,
) -> Result<Vec<ObsidianNoteSummary>, String> {
    let root = validated_vault_root(&request.vault_path)?;
    let limit = request
        .limit
        .unwrap_or(DEFAULT_NOTE_LIMIT)
        .clamp(1, MAX_NOTE_LIMIT);
    collect_markdown_notes(&root, limit)
}

pub(crate) fn read_obsidian_note(
    request: ObsidianReadNoteRequest,
) -> Result<ObsidianNotePayload, String> {
    let root = validated_vault_root(&request.vault_path)?;
    let note_path = safe_note_path(&root, &request.note_path)?;
    let metadata = fs::metadata(&note_path)
        .map_err(|error| format!("Failed to inspect Obsidian note: {error}"))?;
    if metadata.len() > MAX_NOTE_BYTES {
        return Err(format!(
            "Obsidian note is too large for V1 preview: {} bytes",
            metadata.len()
        ));
    }
    let content = fs::read_to_string(&note_path)
        .map_err(|error| format!("Failed to read Obsidian note: {error}"))?;
    let relative_path = note_path
        .strip_prefix(&root)
        .map_err(|_| "Resolved note path escaped the vault root.".to_string())?
        .to_string_lossy()
        .replace('\\', "/");

    Ok(ObsidianNotePayload {
        title: note_title(&note_path),
        relative_path,
        content,
        size_bytes: metadata.len(),
        modified_at: modified_label(&metadata),
    })
}

pub(crate) fn open_obsidian_note(
    request: ObsidianOpenNoteRequest,
) -> Result<ObsidianOpenNoteResult, String> {
    let root = validated_vault_root(&request.vault_path)?;
    let note_path = safe_note_path(&root, &request.note_path)?;
    let relative_path = note_path
        .strip_prefix(&root)
        .map_err(|_| "Resolved note path escaped the vault root.".to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let absolute_path = note_path.display().to_string();
    let opened_url = obsidian_open_url(&absolute_path);
    open_external_url(&opened_url)?;

    Ok(ObsidianOpenNoteResult {
        opened_url,
        absolute_path,
        note_path: relative_path,
    })
}

pub(crate) fn write_obsidian_note(
    request: ObsidianWriteNoteRequest,
) -> Result<ObsidianWriteNoteResult, String> {
    if request.content.as_bytes().len() as u64 > MAX_NOTE_BYTES {
        return Err(format!(
            "Obsidian note content is too large for V2 editing: {} bytes",
            request.content.as_bytes().len()
        ));
    }

    let root = validated_vault_root(&request.vault_path)?;
    let note_path = safe_note_path(&root, &request.note_path)?;
    let previous_metadata = fs::metadata(&note_path)
        .map_err(|error| format!("Failed to inspect Obsidian note before write: {error}"))?;
    let previous_modified_at = modified_label(&previous_metadata);
    if let Some(expected_modified_at) = request.expected_modified_at.as_deref() {
        if previous_modified_at.as_deref() != Some(expected_modified_at) {
            return Err(
                "Obsidian note changed on disk since it was opened; rescan before saving."
                    .to_string(),
            );
        }
    }

    let relative_path = relative_note_path(&root, &note_path)?;
    let version_path = version_note_path(&root, &relative_path)?;
    if let Some(parent) = version_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create Obsidian note version folder: {error}"))?;
    }
    fs::copy(&note_path, &version_path)
        .map_err(|error| format!("Failed to snapshot Obsidian note before write: {error}"))?;

    fs::write(&note_path, request.content)
        .map_err(|error| format!("Failed to write Obsidian note: {error}"))?;
    let next_metadata = fs::metadata(&note_path)
        .map_err(|error| format!("Failed to inspect Obsidian note after write: {error}"))?;
    let audit_path = write_note_audit_record(
        &root,
        &relative_path,
        &version_path,
        previous_modified_at.as_deref(),
        modified_label(&next_metadata).as_deref(),
        request.actor_id.as_deref().unwrap_or("addon.obsidian"),
    )?;

    Ok(ObsidianWriteNoteResult {
        note_path: relative_path,
        title: note_title(&note_path),
        size_bytes: next_metadata.len(),
        previous_modified_at,
        modified_at: modified_label(&next_metadata),
        version_path: version_path.display().to_string(),
        audit_path: audit_path.display().to_string(),
    })
}

pub(crate) fn create_obsidian_note(
    request: ObsidianCreateNoteRequest,
) -> Result<ObsidianNoteOperationResult, String> {
    let content = request
        .content
        .unwrap_or_else(|| "# Untitled\n".to_string());
    if content.as_bytes().len() as u64 > MAX_NOTE_BYTES {
        return Err(format!(
            "Obsidian note content is too large for V2 editing: {} bytes",
            content.as_bytes().len()
        ));
    }

    let root = validated_vault_root(&request.vault_path)?;
    let note_path = safe_new_note_path(&root, &request.note_path)?;
    if note_path.exists() {
        return Err("An Obsidian note already exists at that path.".to_string());
    }
    if let Some(parent) = note_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create Obsidian note folder: {error}"))?;
    }
    fs::write(&note_path, content)
        .map_err(|error| format!("Failed to create Obsidian note: {error}"))?;
    let metadata = fs::metadata(&note_path)
        .map_err(|error| format!("Failed to inspect created Obsidian note: {error}"))?;
    let relative_path = relative_note_path(&root, &note_path)?;
    let audit_path = write_note_operation_audit_record(
        &root,
        "create-note",
        serde_json::json!({
            "notePath": relative_path,
            "modifiedAt": modified_label(&metadata),
            "actorId": request.actor_id.as_deref().unwrap_or("addon.obsidian"),
        }),
    )?;

    Ok(ObsidianNoteOperationResult {
        operation: "create-note".to_string(),
        note_path: Some(relative_path),
        previous_note_path: None,
        folder_path: None,
        archived_path: None,
        title: Some(note_title(&note_path)),
        size_bytes: Some(metadata.len()),
        modified_at: modified_label(&metadata),
        version_path: None,
        audit_path: audit_path.display().to_string(),
    })
}

pub(crate) fn create_obsidian_folder(
    request: ObsidianCreateFolderRequest,
) -> Result<ObsidianNoteOperationResult, String> {
    let root = validated_vault_root(&request.vault_path)?;
    let folder_path = safe_new_folder_path(&root, &request.folder_path)?;
    if folder_path.exists() {
        return Err("An Obsidian folder already exists at that path.".to_string());
    }
    fs::create_dir_all(&folder_path)
        .map_err(|error| format!("Failed to create Obsidian folder: {error}"))?;
    let relative_path = relative_note_path(&root, &folder_path)?;
    let audit_path = write_note_operation_audit_record(
        &root,
        "create-folder",
        serde_json::json!({
            "folderPath": relative_path,
            "actorId": request.actor_id.as_deref().unwrap_or("addon.obsidian"),
        }),
    )?;

    Ok(ObsidianNoteOperationResult {
        operation: "create-folder".to_string(),
        note_path: None,
        previous_note_path: None,
        folder_path: Some(relative_path),
        archived_path: None,
        title: None,
        size_bytes: None,
        modified_at: None,
        version_path: None,
        audit_path: audit_path.display().to_string(),
    })
}

pub(crate) fn move_obsidian_note(
    request: ObsidianMoveNoteRequest,
) -> Result<ObsidianNoteOperationResult, String> {
    let root = validated_vault_root(&request.vault_path)?;
    let from_path = safe_note_path(&root, &request.from_note_path)?;
    let to_path = safe_new_note_path(&root, &request.to_note_path)?;
    if to_path.exists() {
        return Err("An Obsidian note already exists at the destination path.".to_string());
    }

    let previous_metadata = fs::metadata(&from_path)
        .map_err(|error| format!("Failed to inspect Obsidian note before move: {error}"))?;
    let previous_modified_at = modified_label(&previous_metadata);
    if let Some(expected_modified_at) = request.expected_modified_at.as_deref() {
        if previous_modified_at.as_deref() != Some(expected_modified_at) {
            return Err(
                "Obsidian note changed on disk since it was opened; rescan before moving."
                    .to_string(),
            );
        }
    }

    let previous_relative_path = relative_note_path(&root, &from_path)?;
    let version_path = version_note_path(&root, &previous_relative_path)?;
    if let Some(parent) = version_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create Obsidian note version folder: {error}"))?;
    }
    fs::copy(&from_path, &version_path)
        .map_err(|error| format!("Failed to snapshot Obsidian note before move: {error}"))?;
    if let Some(parent) = to_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("Failed to create Obsidian note destination folder: {error}")
        })?;
    }
    fs::rename(&from_path, &to_path)
        .map_err(|error| format!("Failed to move Obsidian note: {error}"))?;
    let metadata = fs::metadata(&to_path)
        .map_err(|error| format!("Failed to inspect moved Obsidian note: {error}"))?;
    let next_relative_path = relative_note_path(&root, &to_path)?;
    let audit_path = write_note_operation_audit_record(
        &root,
        "move-note",
        serde_json::json!({
            "previousNotePath": previous_relative_path,
            "notePath": next_relative_path,
            "versionPath": version_path.display().to_string(),
            "previousModifiedAt": previous_modified_at,
            "modifiedAt": modified_label(&metadata),
            "actorId": request.actor_id.as_deref().unwrap_or("addon.obsidian"),
        }),
    )?;

    Ok(ObsidianNoteOperationResult {
        operation: "move-note".to_string(),
        note_path: Some(next_relative_path),
        previous_note_path: Some(previous_relative_path),
        folder_path: None,
        archived_path: None,
        title: Some(note_title(&to_path)),
        size_bytes: Some(metadata.len()),
        modified_at: modified_label(&metadata),
        version_path: Some(version_path.display().to_string()),
        audit_path: audit_path.display().to_string(),
    })
}

pub(crate) fn archive_obsidian_note(
    request: ObsidianArchiveNoteRequest,
) -> Result<ObsidianNoteOperationResult, String> {
    let root = validated_vault_root(&request.vault_path)?;
    let note_path = safe_note_path(&root, &request.note_path)?;
    let metadata = fs::metadata(&note_path)
        .map_err(|error| format!("Failed to inspect Obsidian note before archive: {error}"))?;
    let previous_modified_at = modified_label(&metadata);
    if let Some(expected_modified_at) = request.expected_modified_at.as_deref() {
        if previous_modified_at.as_deref() != Some(expected_modified_at) {
            return Err(
                "Obsidian note changed on disk since it was opened; rescan before archiving."
                    .to_string(),
            );
        }
    }

    let previous_relative_path = relative_note_path(&root, &note_path)?;
    let stamp = unix_nanos_now()?;
    let archived_path = root
        .join(".resonantos")
        .join("obsidian-note-trash")
        .join(stamp.to_string())
        .join(&previous_relative_path);
    if let Some(parent) = archived_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create Obsidian note archive folder: {error}"))?;
    }
    fs::rename(&note_path, &archived_path)
        .map_err(|error| format!("Failed to archive Obsidian note: {error}"))?;
    let audit_path = write_note_operation_audit_record(
        &root,
        "archive-note",
        serde_json::json!({
            "previousNotePath": previous_relative_path,
            "archivedPath": archived_path.display().to_string(),
            "previousModifiedAt": previous_modified_at,
            "actorId": request.actor_id.as_deref().unwrap_or("addon.obsidian"),
        }),
    )?;

    Ok(ObsidianNoteOperationResult {
        operation: "archive-note".to_string(),
        note_path: None,
        previous_note_path: Some(previous_relative_path),
        folder_path: None,
        archived_path: Some(archived_path.display().to_string()),
        title: Some(note_title(&archived_path)),
        size_bytes: Some(metadata.len()),
        modified_at: None,
        version_path: None,
        audit_path: audit_path.display().to_string(),
    })
}

pub(crate) fn index_obsidian_vault(
    request: ObsidianVaultIndexRequest,
) -> Result<ObsidianVaultIndex, String> {
    let root = validated_vault_root(&request.vault_path)?;
    let limit = request
        .limit
        .unwrap_or(DEFAULT_NOTE_LIMIT)
        .clamp(1, MAX_NOTE_LIMIT);
    let query = request
        .query
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let query_lower = query.as_ref().map(|value| value.to_lowercase());
    let summaries = collect_markdown_notes(&root, MAX_NOTE_LIMIT)?;
    let mut indexed_notes = Vec::new();

    for summary in summaries.iter() {
        let note_path = safe_note_path(&root, &summary.relative_path)?;
        let content = read_indexable_note_content(&note_path)?;
        indexed_notes.push(ObsidianIndexedNote {
            title: summary.title.clone(),
            relative_path: summary.relative_path.clone(),
            size_bytes: summary.size_bytes,
            modified_at: summary.modified_at.clone(),
            tags: extract_tags(&content),
            wikilinks: extract_wikilinks(&content),
            backlinks: Vec::new(),
            excerpt: excerpt_for_query(&content, query_lower.as_deref()),
        });
    }

    attach_backlinks(&mut indexed_notes);

    let filtered_notes = indexed_notes
        .into_iter()
        .filter(|note| note_matches_query(note, query_lower.as_deref()))
        .take(limit)
        .collect::<Vec<_>>();

    Ok(ObsidianVaultIndex {
        vault_path: root.display().to_string(),
        note_count: summaries.len(),
        query,
        notes: filtered_notes,
    })
}

fn validated_vault_root(vault_path: &str) -> Result<PathBuf, String> {
    let trimmed = vault_path.trim();
    if trimmed.is_empty() {
        return Err("Select an Obsidian vault or markdown folder first.".to_string());
    }
    let root = PathBuf::from(trimmed)
        .canonicalize()
        .map_err(|error| format!("Failed to resolve vault path: {error}"))?;
    if !root.is_dir() {
        return Err("Selected vault path is not a folder.".to_string());
    }
    Ok(root)
}

fn safe_note_path(root: &Path, note_path: &str) -> Result<PathBuf, String> {
    reject_internal_note_path(note_path)?;
    let candidate = root.join(note_path);
    let resolved = candidate
        .canonicalize()
        .map_err(|error| format!("Failed to resolve Obsidian note path: {error}"))?;
    if !resolved.starts_with(root) {
        return Err("Obsidian note path is outside the configured vault.".to_string());
    }
    if resolved.extension().and_then(|item| item.to_str()) != Some("md") {
        return Err("Only markdown notes can be read by the Obsidian V1 bridge.".to_string());
    }
    Ok(resolved)
}

fn safe_new_note_path(root: &Path, note_path: &str) -> Result<PathBuf, String> {
    reject_internal_note_path(note_path)?;
    let candidate = root.join(note_path);
    if candidate.extension().and_then(|item| item.to_str()) != Some("md") {
        return Err("Only markdown notes can be created or moved by Resonant Notes.".to_string());
    }
    ensure_lexical_child(root, &candidate)?;
    Ok(candidate)
}

fn safe_new_folder_path(root: &Path, folder_path: &str) -> Result<PathBuf, String> {
    reject_internal_note_path(folder_path)?;
    let candidate = root.join(folder_path);
    ensure_lexical_child(root, &candidate)?;
    Ok(candidate)
}

fn ensure_lexical_child(root: &Path, candidate: &Path) -> Result<(), String> {
    if candidate == root || !candidate.starts_with(root) {
        return Err("Obsidian path must stay inside the configured vault.".to_string());
    }
    Ok(())
}

fn reject_internal_note_path(note_path: &str) -> Result<(), String> {
    for component in Path::new(note_path).components() {
        match component {
            Component::Normal(name) if should_skip_entry(&name.to_string_lossy()) => {
                return Err(
                    "Obsidian internal and generated folders cannot be edited through the add-on."
                        .to_string(),
                );
            }
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(
                    "Obsidian note path must be relative to the configured vault.".to_string(),
                );
            }
            _ => {}
        }
    }
    Ok(())
}

fn relative_note_path(root: &Path, note_path: &Path) -> Result<String, String> {
    Ok(note_path
        .strip_prefix(root)
        .map_err(|_| "Resolved note path escaped the vault root.".to_string())?
        .to_string_lossy()
        .replace('\\', "/"))
}

fn version_note_path(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let stamp = unix_nanos_now()?;
    let safe_relative = relative_path.replace('\\', "/");
    Ok(root
        .join(".resonantos")
        .join("obsidian-note-versions")
        .join(safe_relative)
        .with_extension(format!("{stamp}.md")))
}

fn write_note_audit_record(
    root: &Path,
    relative_path: &str,
    version_path: &Path,
    previous_modified_at: Option<&str>,
    modified_at: Option<&str>,
    actor_id: &str,
) -> Result<PathBuf, String> {
    let stamp = unix_seconds_now()?;
    let audit_root = root.join(".resonantos").join("obsidian-note-audit");
    fs::create_dir_all(&audit_root)
        .map_err(|error| format!("Failed to create Obsidian note audit folder: {error}"))?;
    let audit_path = audit_root.join(format!("{stamp}-write-note.json"));
    let payload = serde_json::json!({
        "artifactType": "obsidian-note-write-audit",
        "actorId": actor_id,
        "notePath": relative_path,
        "versionPath": version_path.display().to_string(),
        "previousModifiedAt": previous_modified_at,
        "modifiedAt": modified_at,
        "writtenAt": format!("unix:{stamp}"),
    });
    let encoded = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to encode Obsidian note audit record: {error}"))?;
    fs::write(&audit_path, encoded)
        .map_err(|error| format!("Failed to write Obsidian note audit record: {error}"))?;
    Ok(audit_path)
}

fn write_note_operation_audit_record(
    root: &Path,
    operation: &str,
    details: serde_json::Value,
) -> Result<PathBuf, String> {
    let stamp = unix_seconds_now()?;
    let audit_root = root.join(".resonantos").join("obsidian-note-audit");
    fs::create_dir_all(&audit_root)
        .map_err(|error| format!("Failed to create Obsidian note audit folder: {error}"))?;
    let audit_path = audit_root.join(format!("{stamp}-{operation}.json"));
    let payload = serde_json::json!({
        "artifactType": "obsidian-note-operation-audit",
        "operation": operation,
        "details": details,
        "recordedAt": format!("unix:{stamp}"),
    });
    let encoded = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to encode Obsidian operation audit record: {error}"))?;
    fs::write(&audit_path, encoded)
        .map_err(|error| format!("Failed to write Obsidian operation audit record: {error}"))?;
    Ok(audit_path)
}

fn unix_seconds_now() -> Result<u64, String> {
    Ok(std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before Unix epoch: {error}"))?
        .as_secs())
}

fn unix_nanos_now() -> Result<u128, String> {
    Ok(std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before Unix epoch: {error}"))?
        .as_nanos())
}

fn collect_markdown_notes(root: &Path, limit: usize) -> Result<Vec<ObsidianNoteSummary>, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Failed to resolve vault root: {error}"))?;
    let mut notes = Vec::new();
    collect_markdown_notes_inner(&canonical_root, &canonical_root, limit, &mut notes)?;
    notes.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(notes)
}

fn collect_markdown_notes_inner(
    root: &Path,
    current: &Path,
    limit: usize,
    notes: &mut Vec<ObsidianNoteSummary>,
) -> Result<(), String> {
    if notes.len() >= limit {
        return Ok(());
    }

    for entry in fs::read_dir(current)
        .map_err(|error| format!("Failed to scan Obsidian vault folder: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("Failed to read Obsidian vault entry: {error}"))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip_entry(&name) {
            continue;
        }

        if path.is_dir() {
            collect_markdown_notes_inner(root, &path, limit, notes)?;
        } else if path.extension().and_then(|item| item.to_str()) == Some("md") {
            let metadata = fs::metadata(&path)
                .map_err(|error| format!("Failed to inspect Obsidian note: {error}"))?;
            let relative_path = path
                .strip_prefix(root)
                .map_err(|_| "Resolved note path escaped the vault root.".to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            notes.push(ObsidianNoteSummary {
                title: note_title(&path),
                relative_path,
                size_bytes: metadata.len(),
                modified_at: modified_label(&metadata),
            });
            if notes.len() >= limit {
                return Ok(());
            }
        }
    }

    Ok(())
}

fn read_indexable_note_content(note_path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(note_path)
        .map_err(|error| format!("Failed to inspect Obsidian note for indexing: {error}"))?;
    if metadata.len() > MAX_NOTE_BYTES {
        return Ok(String::new());
    }
    fs::read_to_string(note_path)
        .map_err(|error| format!("Failed to read Obsidian note for indexing: {error}"))
}

fn extract_tags(content: &str) -> Vec<String> {
    let mut tags = Vec::new();
    for token in content.split_whitespace() {
        let trimmed = token.trim_matches(|character: char| {
            matches!(
                character,
                ',' | '.' | ';' | ':' | ')' | '(' | '[' | ']' | '{' | '}'
            )
        });
        if trimmed.starts_with('#') && trimmed.len() > 1 {
            let tag = trimmed
                .chars()
                .take_while(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '#' | '_' | '-' | '/')
                })
                .collect::<String>();
            if tag.len() > 1 && !tags.contains(&tag) {
                tags.push(tag);
            }
        }
    }
    tags.sort();
    tags
}

fn extract_wikilinks(content: &str) -> Vec<String> {
    let mut links = Vec::new();
    let mut remaining = content;
    while let Some(start) = remaining.find("[[") {
        let after_start = &remaining[start + 2..];
        let Some(end) = after_start.find("]]") else {
            break;
        };
        let raw_target = &after_start[..end];
        let target = normalize_wikilink_target(raw_target);
        if !target.is_empty() && !links.contains(&target) {
            links.push(target);
        }
        remaining = &after_start[end + 2..];
    }
    links.sort();
    links
}

fn normalize_wikilink_target(raw_target: &str) -> String {
    raw_target
        .split(['|', '#'])
        .next()
        .unwrap_or("")
        .trim()
        .trim_end_matches(".md")
        .to_string()
}

fn attach_backlinks(notes: &mut [ObsidianIndexedNote]) {
    let note_snapshots = notes
        .iter()
        .map(|note| {
            (
                note.relative_path.clone(),
                note.title.clone(),
                note_aliases(note),
                note.wikilinks.clone(),
            )
        })
        .collect::<Vec<_>>();

    for note in notes.iter_mut() {
        let aliases = note_aliases(note);
        let mut backlinks = Vec::new();
        for (source_path, source_title, _source_aliases, links) in note_snapshots.iter() {
            if source_path == &note.relative_path {
                continue;
            }
            if links
                .iter()
                .any(|link| aliases.contains(&link.to_lowercase()))
            {
                backlinks.push(ObsidianBacklink {
                    source_path: source_path.clone(),
                    source_title: source_title.clone(),
                });
            }
        }
        backlinks.sort_by(|left, right| left.source_path.cmp(&right.source_path));
        note.backlinks = backlinks;
    }
}

fn note_aliases(note: &ObsidianIndexedNote) -> Vec<String> {
    let without_extension = note
        .relative_path
        .strip_suffix(".md")
        .unwrap_or(&note.relative_path)
        .to_lowercase();
    let file_stem = without_extension
        .split('/')
        .last()
        .unwrap_or(&without_extension)
        .to_string();
    vec![note.title.to_lowercase(), without_extension, file_stem]
}

fn note_matches_query(note: &ObsidianIndexedNote, query: Option<&str>) -> bool {
    let Some(query) = query else {
        return true;
    };
    note.title.to_lowercase().contains(query)
        || note.relative_path.to_lowercase().contains(query)
        || note
            .tags
            .iter()
            .any(|tag| tag.to_lowercase().contains(query))
        || note
            .wikilinks
            .iter()
            .any(|link| link.to_lowercase().contains(query))
        || note.backlinks.iter().any(|backlink| {
            backlink.source_title.to_lowercase().contains(query)
                || backlink.source_path.to_lowercase().contains(query)
        })
        || note.excerpt.to_lowercase().contains(query)
}

fn excerpt_for_query(content: &str, query: Option<&str>) -> String {
    let normalized = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && *line != "---")
        .collect::<Vec<_>>();
    if normalized.is_empty() {
        return String::new();
    }
    if let Some(query) = query {
        if let Some(line) = normalized
            .iter()
            .find(|line| line.to_lowercase().contains(query))
        {
            return truncate_excerpt(line);
        }
    }
    truncate_excerpt(normalized[0])
}

fn truncate_excerpt(value: &str) -> String {
    const EXCERPT_LIMIT: usize = 160;
    if value.chars().count() <= EXCERPT_LIMIT {
        return value.to_string();
    }
    let mut excerpt = value.chars().take(EXCERPT_LIMIT).collect::<String>();
    excerpt.push('…');
    excerpt
}

fn should_skip_entry(name: &str) -> bool {
    matches!(
        name,
        ".obsidian" | ".resonantos" | ".git" | ".trash" | "node_modules" | "target" | ".DS_Store"
    )
}

fn note_title(path: &Path) -> String {
    path.file_stem()
        .and_then(|item| item.to_str())
        .unwrap_or("Untitled")
        .replace(['_', '-'], " ")
}

fn modified_label(metadata: &fs::Metadata) -> Option<String> {
    let modified = metadata.modified().ok()?;
    let seconds = modified.duration_since(UNIX_EPOCH).ok()?.as_secs();
    Some(format!("unix:{seconds}"))
}

fn obsidian_open_url(absolute_path: &str) -> String {
    format!("obsidian://open?path={}", percent_encode(absolute_path))
}

fn percent_encode(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(*byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn open_external_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(url).status();

    #[cfg(target_os = "windows")]
    let status = Command::new("cmd").args(["/C", "start", "", url]).status();

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(url).status();

    status
        .map_err(|error| format!("Failed to open Obsidian URL: {error}"))
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err("Operating system did not accept the Obsidian URL.".to_string())
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_VAULT_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_vault() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after unix epoch")
            .as_nanos();
        let sequence = TEST_VAULT_COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "resonantos-obsidian-test-{}-{suffix}-{sequence}",
            std::process::id()
        ));
        fs::create_dir_all(root.join(".obsidian")).expect("test vault config should be created");
        fs::create_dir_all(root.join("Folder")).expect("test folder should be created");
        fs::write(root.join("Folder").join("Note One.md"), "# Note One")
            .expect("test note should be written");
        fs::write(root.join(".obsidian").join("hidden.md"), "# Hidden")
            .expect("hidden note should be written");
        root
    }

    #[test]
    fn lists_markdown_notes_without_obsidian_internal_files() {
        let root = temp_vault();
        let notes = list_obsidian_notes(ObsidianListNotesRequest {
            vault_path: root.display().to_string(),
            limit: Some(20),
        })
        .expect("vault notes should list");

        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].relative_path, "Folder/Note One.md");

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rejects_note_paths_outside_the_vault() {
        let root = temp_vault();
        let result = read_obsidian_note(ObsidianReadNoteRequest {
            vault_path: root.display().to_string(),
            note_path: "../outside.md".to_string(),
        });

        assert!(result.is_err());

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn builds_obsidian_open_url_from_absolute_note_path() {
        let url = obsidian_open_url("/ExampleVault/Folder/Note One.md");

        assert_eq!(
            url,
            "obsidian://open?path=%2FExampleVault%2FFolder%2FNote%20One.md"
        );
    }

    #[test]
    fn writes_note_with_version_snapshot_and_audit_record() {
        let root = temp_vault();
        let before = read_obsidian_note(ObsidianReadNoteRequest {
            vault_path: root.display().to_string(),
            note_path: "Folder/Note One.md".to_string(),
        })
        .expect("test note should read before write");

        let result = write_obsidian_note(ObsidianWriteNoteRequest {
            vault_path: root.display().to_string(),
            note_path: "Folder/Note One.md".to_string(),
            content: "# Note One\nUpdated inside ResonantOS.".to_string(),
            expected_modified_at: before.modified_at,
            actor_id: Some("test.actor".to_string()),
        })
        .expect("test note should write with audit");

        assert_eq!(result.note_path, "Folder/Note One.md");
        assert!(PathBuf::from(&result.version_path).exists());
        assert!(PathBuf::from(&result.audit_path).exists());
        assert_eq!(
            fs::read_to_string(&result.version_path).expect("version should read"),
            "# Note One"
        );
        assert_eq!(
            fs::read_to_string(root.join("Folder").join("Note One.md"))
                .expect("updated note should read"),
            "# Note One\nUpdated inside ResonantOS."
        );
        let audit = fs::read_to_string(&result.audit_path).expect("audit should read");
        assert!(audit.contains("obsidian-note-write-audit"));
        assert!(audit.contains("test.actor"));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn indexes_wikilinks_tags_search_and_backlinks() {
        let root = temp_vault();
        fs::write(
            root.join("Folder").join("Note One.md"),
            "# Note One\nLinks to [[Second Note]] #resonance/system",
        )
        .expect("test note should be overwritten");
        fs::write(
            root.join("Folder").join("Second Note.md"),
            "# Second Note\nBacklink target with #archive",
        )
        .expect("second note should be written");

        let index = index_obsidian_vault(ObsidianVaultIndexRequest {
            vault_path: root.display().to_string(),
            query: Some("second".to_string()),
            limit: Some(20),
        })
        .expect("vault should index");

        assert_eq!(index.note_count, 2);
        assert_eq!(index.notes.len(), 2);
        let source = index
            .notes
            .iter()
            .find(|note| note.relative_path == "Folder/Note One.md")
            .expect("source note should index");
        assert_eq!(source.wikilinks, vec!["Second Note"]);
        assert_eq!(source.tags, vec!["#resonance/system"]);
        let target = index
            .notes
            .iter()
            .find(|note| note.relative_path == "Folder/Second Note.md")
            .expect("target note should index");
        assert_eq!(target.backlinks.len(), 1);
        assert_eq!(target.backlinks[0].source_path, "Folder/Note One.md");

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rejects_write_when_expected_modified_marker_is_stale() {
        let root = temp_vault();
        let result = write_obsidian_note(ObsidianWriteNoteRequest {
            vault_path: root.display().to_string(),
            note_path: "Folder/Note One.md".to_string(),
            content: "# Stale write".to_string(),
            expected_modified_at: Some("unix:0".to_string()),
            actor_id: Some("test.actor".to_string()),
        });

        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(root.join("Folder").join("Note One.md"))
                .expect("original note should remain"),
            "# Note One"
        );

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn creates_moves_and_archives_notes_with_audit_records() {
        let root = temp_vault();

        let created = create_obsidian_note(ObsidianCreateNoteRequest {
            vault_path: root.display().to_string(),
            note_path: "Projects/New Note.md".to_string(),
            content: Some("# New Note".to_string()),
            actor_id: Some("test.actor".to_string()),
        })
        .expect("note should be created");
        assert_eq!(created.note_path.as_deref(), Some("Projects/New Note.md"));
        assert!(PathBuf::from(&created.audit_path).exists());
        assert!(root.join("Projects").join("New Note.md").exists());

        let folder = create_obsidian_folder(ObsidianCreateFolderRequest {
            vault_path: root.display().to_string(),
            folder_path: "Projects/Nested".to_string(),
            actor_id: Some("test.actor".to_string()),
        })
        .expect("folder should be created");
        assert_eq!(folder.folder_path.as_deref(), Some("Projects/Nested"));
        assert!(root.join("Projects").join("Nested").is_dir());

        let before = read_obsidian_note(ObsidianReadNoteRequest {
            vault_path: root.display().to_string(),
            note_path: "Projects/New Note.md".to_string(),
        })
        .expect("created note should read before move");
        let moved = move_obsidian_note(ObsidianMoveNoteRequest {
            vault_path: root.display().to_string(),
            from_note_path: "Projects/New Note.md".to_string(),
            to_note_path: "Projects/Nested/Renamed Note.md".to_string(),
            expected_modified_at: before.modified_at,
            actor_id: Some("test.actor".to_string()),
        })
        .expect("note should move");
        assert_eq!(
            moved.previous_note_path.as_deref(),
            Some("Projects/New Note.md")
        );
        assert_eq!(
            moved.note_path.as_deref(),
            Some("Projects/Nested/Renamed Note.md")
        );
        assert!(
            moved
                .version_path
                .as_ref()
                .map(PathBuf::from)
                .unwrap()
                .exists()
        );
        assert!(!root.join("Projects").join("New Note.md").exists());
        assert!(
            root.join("Projects")
                .join("Nested")
                .join("Renamed Note.md")
                .exists()
        );

        let before_archive = read_obsidian_note(ObsidianReadNoteRequest {
            vault_path: root.display().to_string(),
            note_path: "Projects/Nested/Renamed Note.md".to_string(),
        })
        .expect("moved note should read before archive");
        let archived = archive_obsidian_note(ObsidianArchiveNoteRequest {
            vault_path: root.display().to_string(),
            note_path: "Projects/Nested/Renamed Note.md".to_string(),
            expected_modified_at: before_archive.modified_at,
            actor_id: Some("test.actor".to_string()),
        })
        .expect("note should archive");
        assert_eq!(
            archived.previous_note_path.as_deref(),
            Some("Projects/Nested/Renamed Note.md")
        );
        assert!(
            archived
                .archived_path
                .as_ref()
                .map(PathBuf::from)
                .unwrap()
                .exists()
        );
        assert!(
            !root
                .join("Projects")
                .join("Nested")
                .join("Renamed Note.md")
                .exists()
        );

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rejects_create_move_and_archive_paths_outside_safe_vault_area() {
        let root = temp_vault();

        assert!(
            create_obsidian_note(ObsidianCreateNoteRequest {
                vault_path: root.display().to_string(),
                note_path: "../Escaped.md".to_string(),
                content: None,
                actor_id: None,
            })
            .is_err()
        );
        assert!(
            create_obsidian_folder(ObsidianCreateFolderRequest {
                vault_path: root.display().to_string(),
                folder_path: ".obsidian/generated".to_string(),
                actor_id: None,
            })
            .is_err()
        );
        assert!(
            move_obsidian_note(ObsidianMoveNoteRequest {
                vault_path: root.display().to_string(),
                from_note_path: "Folder/Note One.md".to_string(),
                to_note_path: ".resonantos/Note One.md".to_string(),
                expected_modified_at: None,
                actor_id: None,
            })
            .is_err()
        );
        assert!(
            archive_obsidian_note(ObsidianArchiveNoteRequest {
                vault_path: root.display().to_string(),
                note_path: "../Escaped.md".to_string(),
                expected_modified_at: None,
                actor_id: None,
            })
            .is_err()
        );

        fs::remove_dir_all(root).ok();
    }
}
