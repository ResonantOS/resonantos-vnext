// Intent citation: docs/architecture/ADR-007-living-archive-boundaries.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md
// Intent citation: docs/architecture/ADR-012-living-archive-approval-policy.md

use std::fs;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::AppHandle;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveStats {
    pub(crate) pages_total: i64,
    pub(crate) pages_by_type: Value,
    pub(crate) links_total: i64,
    pub(crate) sources_total: i64,
    pub(crate) sources_unprocessed: i64,
    pub(crate) activity_7d: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveActivityEntry {
    pub(crate) ts: String,
    pub(crate) action: String,
    pub(crate) page_id: Option<String>,
    pub(crate) source_id: Option<String>,
    pub(crate) agent_id: Option<String>,
    pub(crate) details: Option<Value>,
    pub(crate) errors: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSearchRequest {
    pub(crate) query: String,
    pub(crate) limit: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSearchPageHit {
    pub(crate) page_id: String,
    pub(crate) title: String,
    pub(crate) page_type: String,
    pub(crate) file_path: String,
    pub(crate) stage: Option<String>,
    pub(crate) updated: Option<String>,
    pub(crate) score: f64,
    pub(crate) snippet: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSearchSourceHit {
    pub(crate) source_id: String,
    pub(crate) title: String,
    pub(crate) source_type: String,
    pub(crate) raw_path: String,
    pub(crate) processed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSearchResult {
    pub(crate) query: String,
    pub(crate) pages: Vec<ArchiveSearchPageHit>,
    pub(crate) sources: Vec<ArchiveSearchSourceHit>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveReadDocumentRequest {
    pub(crate) path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveDocumentPayload {
    pub(crate) path: String,
    pub(crate) title: Option<String>,
    pub(crate) doc_type: Option<String>,
    pub(crate) frontmatter: Value,
    pub(crate) content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveIntakeWriteRequest {
    pub(crate) actor_id: String,
    pub(crate) bucket: String,
    pub(crate) file_name: String,
    pub(crate) content: String,
    pub(crate) metadata: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveIntakeWriteResult {
    pub(crate) actor_id: String,
    pub(crate) bucket: String,
    pub(crate) artifact_path: String,
    pub(crate) metadata_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveIngestRequestRecord {
    pub(crate) actor_id: String,
    pub(crate) source_path: String,
    pub(crate) source_type: String,
    pub(crate) source_role: Option<String>,
    pub(crate) intent: String,
    pub(crate) provenance: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveIngestRequestResult {
    pub(crate) request_file: String,
    pub(crate) queued_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveQueuedIngestRequest {
    pub(crate) request_file: String,
    pub(crate) queued_at: String,
    pub(crate) actor_id: String,
    pub(crate) source_path: String,
    pub(crate) source_type: String,
    pub(crate) source_role: Option<String>,
    pub(crate) intent: String,
    pub(crate) source_exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveReviewDecision {
    pub(crate) status: String,
    pub(crate) action: Option<String>,
    pub(crate) actor_id: Option<String>,
    pub(crate) decided_at: Option<String>,
    pub(crate) tier_applied: Option<String>,
    pub(crate) notes: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveReviewArtifact {
    pub(crate) artifact_file: String,
    pub(crate) checked_at: String,
    pub(crate) request_file: String,
    pub(crate) source_path: String,
    pub(crate) source_type: String,
    pub(crate) source_role: Option<String>,
    pub(crate) intent: String,
    pub(crate) provider_id: String,
    pub(crate) model: String,
    pub(crate) summary: String,
    pub(crate) confidence: String,
    pub(crate) doctrine_sensitivity: String,
    pub(crate) recommended_tier: String,
    pub(crate) recommendation_reason: String,
    pub(crate) proposed_pages: Vec<Value>,
    pub(crate) decision: ArchiveReviewDecision,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveProcessIngestRequest {
    pub(crate) request_file: String,
    pub(crate) provider_id: String,
    pub(crate) provider_type: String,
    pub(crate) api_base_url: Option<String>,
    pub(crate) runtime_node_id: Option<String>,
    pub(crate) runtime_node_kind: Option<String>,
    pub(crate) runtime_node_endpoint: Option<String>,
    pub(crate) auth_tier: Option<String>,
    pub(crate) model: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveProcessIngestResult {
    pub(crate) request_file: String,
    pub(crate) archived_request_file: String,
    pub(crate) review_artifact_file: String,
    pub(crate) summary: String,
    pub(crate) checked_at: String,
    pub(crate) review_artifact: ArchiveReviewArtifact,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveReviewDecisionRequest {
    pub(crate) artifact_file: String,
    pub(crate) actor_id: String,
    pub(crate) action: String,
    pub(crate) notes: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveReviewDecisionResult {
    pub(crate) artifact_file: String,
    pub(crate) status: String,
    pub(crate) action: String,
    pub(crate) actor_id: String,
    pub(crate) decided_at: String,
    pub(crate) tier_applied: String,
    pub(crate) summary: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchivePromoteReviewArtifactRequest {
    pub(crate) artifact_file: String,
    pub(crate) actor_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchivePromotedPage {
    pub(crate) page_type: String,
    pub(crate) page_id: String,
    pub(crate) title: String,
    pub(crate) file_path: String,
    pub(crate) action: String,
    pub(crate) backup_path: Option<String>,
    pub(crate) source_id: String,
    pub(crate) indexed: bool,
    pub(crate) merge_mode: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSkippedPage {
    pub(crate) title: String,
    pub(crate) reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchivePromoteReviewArtifactResult {
    pub(crate) artifact_file: String,
    pub(crate) promoted_at: String,
    pub(crate) actor_id: String,
    pub(crate) pages_written: Vec<ArchivePromotedPage>,
    pub(crate) skipped_pages: Vec<ArchiveSkippedPage>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveTolBundleCandidate {
    pub(crate) session_id: String,
    pub(crate) raw_audio_path: Option<String>,
    pub(crate) transcript_path: Option<String>,
    pub(crate) analysis_path: Option<String>,
    pub(crate) date: Option<String>,
    pub(crate) time: Option<String>,
    pub(crate) summary: Option<String>,
    pub(crate) status: String,
    pub(crate) strategic_actions_count: usize,
    pub(crate) explicit_directives_count: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveTolBundleBuildRequest {
    pub(crate) session_id: String,
    pub(crate) actor_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveTolBundleBuildResult {
    pub(crate) session_id: String,
    pub(crate) intake_artifact_path: String,
    pub(crate) request_file: String,
    pub(crate) queued_at: String,
    pub(crate) raw_audio_path: Option<String>,
    pub(crate) transcript_path: String,
    pub(crate) analysis_path: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveSourceWatchIndexRecord {
    path: String,
    absolute_path: String,
    root_role: String,
    root_subtype: Option<String>,
    source_type: String,
    title: String,
    hash: String,
    size_bytes: u64,
    modified_at: String,
    first_seen_at: String,
    last_seen_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSourceWatchRecord {
    pub(crate) path: String,
    pub(crate) absolute_path: String,
    pub(crate) root_role: String,
    pub(crate) root_subtype: Option<String>,
    pub(crate) source_type: String,
    pub(crate) title: String,
    pub(crate) hash: String,
    pub(crate) previous_hash: Option<String>,
    pub(crate) size_bytes: u64,
    pub(crate) modified_at: String,
    pub(crate) status: String,
    pub(crate) indexed_in_db: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSourceFolderScanResult {
    pub(crate) scanned_at: String,
    pub(crate) roots_scanned: usize,
    pub(crate) files_seen: usize,
    pub(crate) new_files: usize,
    pub(crate) changed_files: usize,
    pub(crate) unchanged_files: usize,
    pub(crate) skipped_files: usize,
    pub(crate) records: Vec<ArchiveSourceWatchRecord>,
    pub(crate) index_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSourceFolderScanRequest {
    pub(crate) root_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryImportRequest {
    pub(crate) source_path: String,
    pub(crate) domain: String,
    pub(crate) import_mode: String,
    pub(crate) library_name: Option<String>,
    pub(crate) actor_id: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryImportSourceRecord {
    pub(crate) source_id: String,
    pub(crate) version_id: String,
    pub(crate) original_path: String,
    pub(crate) canonical_path: String,
    pub(crate) source_type: String,
    pub(crate) title: String,
    pub(crate) hash: String,
    pub(crate) size_bytes: u64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveClassificationProposal {
    pub(crate) source_id: String,
    pub(crate) title: String,
    pub(crate) canonical_path: String,
    pub(crate) proposed_target: String,
    pub(crate) confidence: String,
    pub(crate) reason: String,
    pub(crate) tags: Vec<String>,
    pub(crate) wikilinks: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryImportResult {
    pub(crate) imported_at: String,
    pub(crate) domain: String,
    pub(crate) import_mode: String,
    pub(crate) library_id: String,
    pub(crate) library_name: String,
    pub(crate) original_path: String,
    pub(crate) canonical_root: String,
    pub(crate) files_seen: usize,
    pub(crate) files_imported: usize,
    pub(crate) skipped_files: usize,
    pub(crate) manifest_path: String,
    pub(crate) version_ledger_path: String,
    pub(crate) classification_manifest_path: Option<String>,
    pub(crate) classification_status: String,
    pub(crate) metadata_standard: String,
    pub(crate) obsidian_vault_detected: bool,
    pub(crate) recommended_addon: Option<String>,
    pub(crate) records: Vec<ArchiveLibraryImportSourceRecord>,
    pub(crate) classification_proposals: Vec<ArchiveClassificationProposal>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveImportedLibrarySummary {
    pub(crate) imported_at: String,
    pub(crate) domain: String,
    pub(crate) import_mode: String,
    pub(crate) library_id: String,
    pub(crate) library_name: String,
    pub(crate) original_path: String,
    pub(crate) canonical_root: String,
    pub(crate) files_seen: usize,
    pub(crate) files_imported: usize,
    pub(crate) skipped_files: usize,
    pub(crate) manifest_path: String,
    pub(crate) version_ledger_path: Option<String>,
    pub(crate) classification_manifest_path: Option<String>,
    pub(crate) classification_status: String,
    pub(crate) metadata_standard: String,
    pub(crate) obsidian_vault_detected: bool,
    pub(crate) recommended_addon: Option<String>,
    pub(crate) records_count: usize,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSystemMemorySource {
    pub(crate) relative_path: String,
    pub(crate) absolute_path: String,
    pub(crate) exists: bool,
    pub(crate) required: bool,
    pub(crate) hash: Option<String>,
    pub(crate) size_bytes: Option<u64>,
    pub(crate) modified_at: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSystemMemoryPage {
    pub(crate) page_id: String,
    pub(crate) title: String,
    pub(crate) file_path: String,
    pub(crate) source_count: usize,
    pub(crate) hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSystemMemoryStatus {
    pub(crate) status: String,
    pub(crate) generated_at: Option<String>,
    pub(crate) manifest_path: String,
    pub(crate) pages_root: String,
    pub(crate) sources: Vec<ArchiveSystemMemorySource>,
    pub(crate) pages: Vec<ArchiveSystemMemoryPage>,
    pub(crate) stale_sources: Vec<String>,
    pub(crate) missing_sources: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSystemMemoryRefreshResult {
    pub(crate) refreshed_at: String,
    pub(crate) manifest_path: String,
    pub(crate) pages_root: String,
    pub(crate) pages_written: Vec<ArchiveSystemMemoryPage>,
    pub(crate) sources_indexed: usize,
    pub(crate) missing_sources: Vec<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveSystemMemoryManifest {
    schema_version: String,
    generator_version: String,
    generated_at: String,
    pages_root: String,
    sources: Vec<ArchiveSystemMemorySource>,
    pages: Vec<ArchiveSystemMemoryPage>,
}

fn unix_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("unix:{seconds}")
}

fn slugify(value: &str) -> String {
    let mut output = String::new();
    let mut last_dash = false;
    for character in value.chars() {
        let lower = character.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            output.push(lower);
            last_dash = false;
        } else if !last_dash {
            output.push('-');
            last_dash = true;
        }
    }
    output.trim_matches('-').to_string()
}

fn source_id_from_path(source_path: &str) -> String {
    let candidate = PathBuf::from(source_path);
    let stem = candidate
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(source_path);
    let slug = slugify(stem);
    if slug.is_empty() {
        "source".to_string()
    } else {
        slug
    }
}

fn string_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|item| !item.is_empty())
}

fn parse_frontmatter(content: &str) -> (Value, String, Option<String>, Option<String>) {
    if let Some(stripped) = content.strip_prefix("---\n") {
        if let Some(end) = stripped.find("\n---\n") {
            let fm_text = &stripped[..end];
            let mut frontmatter = Map::new();
            for line in fm_text
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
            {
                if let Some((key, value)) = line.split_once(':') {
                    frontmatter.insert(
                        key.trim().to_string(),
                        json!(value.trim().trim_matches('"')),
                    );
                }
            }
            let body = stripped[end + "\n---\n".len()..].to_string();
            let title = frontmatter
                .get("title")
                .and_then(Value::as_str)
                .map(ToString::to_string);
            let doc_type = frontmatter
                .get("type")
                .and_then(Value::as_str)
                .map(ToString::to_string);
            return (Value::Object(frontmatter), body, title, doc_type);
        }
    }

    let title = content
        .lines()
        .find_map(|line| line.strip_prefix("# ").map(ToString::to_string));
    (Value::Object(Map::new()), content.to_string(), title, None)
}

fn resolve_document_path(
    runtime: &ArchiveRuntime,
    requested_path: &str,
) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(requested_path);
    let resolved = if candidate.is_absolute() {
        candidate
    } else {
        runtime.vault_root.join(candidate)
    };

    let normalized = resolved
        .canonicalize()
        .map_err(|error| format!("Failed to resolve archive document path: {error}"))?;
    let allowed = runtime
        .allowed_roots()
        .into_iter()
        .any(|root| normalized == root || normalized.starts_with(&root));
    if !allowed {
        return Err(format!(
            "Archive document path `{}` is outside the allowed archive roots.",
            normalized.display()
        ));
    }
    Ok(normalized)
}

fn resolve_source_path(runtime: &ArchiveRuntime, requested_path: &str) -> PathBuf {
    let candidate = PathBuf::from(requested_path);
    if candidate.is_absolute() {
        candidate
    } else {
        runtime.vault_root.join(candidate)
    }
}

fn relative_to_vault(runtime: &ArchiveRuntime, path: &PathBuf) -> String {
    path.strip_prefix(&runtime.vault_root)
        .unwrap_or(path)
        .display()
        .to_string()
}

mod archive_runtime;
use archive_runtime::{dedupe_paths, ArchiveRuntime, VaultMappingFile};
pub(crate) use archive_runtime::{query_archive_runtime_status, ArchiveRuntimeStatus};

mod archive_review;
pub(crate) use archive_review::{
    decide_archive_review_artifact, list_archive_review_artifacts, process_archive_ingest_request,
    promote_archive_review_artifact,
};
#[cfg(test)]
use archive_review::{
    evaluate_approval_tier, merge_promoted_page_body, render_promoted_page,
    upsert_promoted_page_index, wiki_page_subdir, PromotedPageIndexInput,
};

mod archive_source_library;
#[cfg(test)]
use archive_source_library::{
    collect_imported_library_manifests, import_archive_library_with_runtime, supported_source_file,
};
pub(crate) use archive_source_library::{
    import_archive_library, list_imported_archive_libraries, scan_archive_source_folders,
};

fn source_hash(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path)
        .map_err(|error| format!("Failed to read source file {}: {error}", path.display()))?;
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    Ok(format!("fnv64:{:016x}", hasher.finish()))
}

fn system_time_label(value: SystemTime) -> String {
    let seconds = value
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("unix:{seconds}")
}

mod archive_system_memory;
#[cfg(test)]
use archive_system_memory::SYSTEM_MEMORY_SOURCE_SPECS;
use archive_system_memory::{
    collect_system_memory_sources, render_system_memory_pages, resolve_system_memory_project_root,
    system_memory_status_from_runtime, SYSTEM_MEMORY_GENERATOR_VERSION,
};

mod archive_tol_bundles;
pub(crate) use archive_tol_bundles::{
    build_archive_tol_bundle, list_archive_tol_bundle_candidates,
};

fn system_time_to_unix(time: SystemTime) -> Option<String> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| format!("unix:{}", duration.as_secs()))
}

fn open_archive_db(runtime: &ArchiveRuntime) -> Result<Option<Connection>, String> {
    let db_path = runtime.db_path();
    if !db_path.exists() {
        return Ok(None);
    }
    Connection::open(db_path)
        .map(Some)
        .map_err(|error| format!("Failed to open Living Archive database: {error}"))
}

fn load_archive_stats(connection: &Connection) -> Result<ArchiveStats, String> {
    let mut pages_by_type = Map::new();
    let mut pages_total = 0_i64;
    let mut statement = connection
        .prepare("SELECT COUNT(*) as count, type FROM pages GROUP BY type")
        .map_err(|error| format!("Failed to query archive pages: {error}"))?;
    let mut rows = statement
        .query([])
        .map_err(|error| format!("Failed to read archive page stats: {error}"))?;
    while let Some(row) = rows
        .next()
        .map_err(|error| format!("Failed to iterate page stats: {error}"))?
    {
        let count: i64 = row
            .get("count")
            .map_err(|error| format!("Invalid page count row: {error}"))?;
        let page_type: String = row
            .get("type")
            .map_err(|error| format!("Invalid page type row: {error}"))?;
        pages_total += count;
        pages_by_type.insert(page_type, json!(count));
    }

    let links_total: i64 = connection
        .query_row("SELECT COUNT(*) FROM links", [], |row| row.get(0))
        .map_err(|error| format!("Failed to query archive links: {error}"))?;
    let sources_total: i64 = connection
        .query_row("SELECT COUNT(*) FROM sources", [], |row| row.get(0))
        .map_err(|error| format!("Failed to query archive sources: {error}"))?;
    let sources_unprocessed: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sources WHERE processed = 0",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("Failed to query unprocessed sources: {error}"))?;
    let activity_7d: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM activity_log WHERE ts > datetime('now', '-7 days')",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("Failed to query archive activity: {error}"))?;

    Ok(ArchiveStats {
        pages_total,
        pages_by_type: Value::Object(pages_by_type),
        links_total,
        sources_total,
        sources_unprocessed,
        activity_7d,
    })
}

fn load_recent_activity(
    connection: &Connection,
    limit: usize,
) -> Result<Vec<ArchiveActivityEntry>, String> {
    let mut statement = connection
        .prepare(
            "SELECT ts, action, page_id, source_id, agent_id, details, errors FROM activity_log ORDER BY ts DESC LIMIT ?1",
        )
        .map_err(|error| format!("Failed to prepare archive activity query: {error}"))?;
    let entries = statement
        .query_map(params![limit as i64], |row| {
            let details_raw: Option<String> = row.get("details")?;
            Ok(ArchiveActivityEntry {
                ts: row.get("ts")?,
                action: row.get("action")?,
                page_id: row.get("page_id")?,
                source_id: row.get("source_id")?,
                agent_id: row.get("agent_id")?,
                details: details_raw.and_then(|raw| serde_json::from_str::<Value>(&raw).ok()),
                errors: row.get("errors")?,
            })
        })
        .map_err(|error| format!("Failed to read archive activity rows: {error}"))?;

    let mut items = Vec::new();
    for entry in entries {
        items.push(entry.map_err(|error| format!("Invalid archive activity entry: {error}"))?);
    }
    Ok(items)
}

fn manual_archive_search(
    runtime: &ArchiveRuntime,
    query: &str,
    limit: usize,
) -> Result<Vec<ArchiveSearchPageHit>, String> {
    let query_lower = query.to_lowercase();
    let mut hits = Vec::new();
    for subdir in ["entities", "concepts", "summaries", "syntheses"] {
        let dir_path = runtime.wiki_root.join(subdir);
        if !dir_path.exists() {
            continue;
        }
        for entry in fs::read_dir(&dir_path)
            .map_err(|error| format!("Failed to scan archive wiki directory: {error}"))?
        {
            let entry =
                entry.map_err(|error| format!("Failed to read archive wiki entry: {error}"))?;
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                continue;
            }
            let raw = fs::read_to_string(&path)
                .map_err(|error| format!("Failed to read archive wiki page: {error}"))?;
            let lower = raw.to_lowercase();
            if !lower.contains(&query_lower) {
                continue;
            }
            let (frontmatter, body, title, doc_type) = parse_frontmatter(&raw);
            hits.push(ArchiveSearchPageHit {
                page_id: frontmatter
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or_else(|| {
                        path.file_stem()
                            .and_then(|stem| stem.to_str())
                            .unwrap_or("page")
                    })
                    .to_string(),
                title: title.unwrap_or_else(|| {
                    path.file_stem()
                        .and_then(|stem| stem.to_str())
                        .unwrap_or("Untitled")
                        .to_string()
                }),
                page_type: doc_type.unwrap_or_else(|| "unknown".to_string()),
                file_path: path
                    .strip_prefix(&runtime.vault_root)
                    .unwrap_or(&path)
                    .display()
                    .to_string(),
                stage: frontmatter
                    .get("stage")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                updated: frontmatter
                    .get("updated")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                score: 0.5,
                snippet: body.lines().take(6).collect::<Vec<_>>().join(" "),
            });
            if hits.len() >= limit {
                return Ok(hits);
            }
        }
    }
    Ok(hits)
}

pub(crate) fn archive_system_memory_status(
    app: &AppHandle,
) -> Result<ArchiveSystemMemoryStatus, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let project_root = resolve_system_memory_project_root(app)?;
    system_memory_status_from_runtime(&runtime, &project_root)
}

pub(crate) fn refresh_archive_system_memory(
    app: &AppHandle,
) -> Result<ArchiveSystemMemoryRefreshResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let project_root = resolve_system_memory_project_root(app)?;
    let refreshed_at = unix_timestamp();
    let sources = collect_system_memory_sources(&project_root);
    let missing_sources = sources
        .iter()
        .filter(|source| source.required && !source.exists)
        .map(|source| source.relative_path.clone())
        .collect::<Vec<_>>();
    if !missing_sources.is_empty() {
        return Err(format!(
            "System memory refresh is blocked because required sources are missing: {}",
            missing_sources.join(", ")
        ));
    }

    let pages = render_system_memory_pages(&project_root, &runtime, &sources)?;
    let manifest_path = runtime.system_memory_manifest_path();
    if let Some(parent) = manifest_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create system memory provenance root: {error}"))?;
    }

    let manifest = ArchiveSystemMemoryManifest {
        schema_version: "1".to_string(),
        generator_version: SYSTEM_MEMORY_GENERATOR_VERSION.to_string(),
        generated_at: refreshed_at.clone(),
        pages_root: runtime.system_memory_root().display().to_string(),
        sources: sources.clone(),
        pages: pages.clone(),
    };
    fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest)
            .map_err(|error| format!("Failed to encode system memory manifest: {error}"))?,
    )
    .map_err(|error| format!("Failed to write system memory manifest: {error}"))?;

    Ok(ArchiveSystemMemoryRefreshResult {
        refreshed_at,
        manifest_path: manifest_path.display().to_string(),
        pages_root: runtime.system_memory_root().display().to_string(),
        pages_written: pages,
        sources_indexed: sources.iter().filter(|source| source.exists).count(),
        missing_sources,
    })
}

pub(crate) fn search_archive(
    app: &AppHandle,
    request: ArchiveSearchRequest,
) -> Result<ArchiveSearchResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let query = request.query.trim().to_string();
    if query.is_empty() {
        return Err("Archive search query cannot be empty.".to_string());
    }
    let limit = request.limit.unwrap_or(12).clamp(1, 50);
    let search_term = format!("%{query}%");

    let (pages, sources) = match open_archive_db(&runtime)? {
        Some(connection) => {
            let mut page_statement = connection
                .prepare(
                    "SELECT id, type, title, file_path, stage, updated,
                            (title LIKE ?1) as title_match,
                            (content LIKE ?1) as content_match,
                            content
                     FROM pages
                     WHERE title LIKE ?1 OR content LIKE ?1
                     ORDER BY title_match DESC, updated DESC
                     LIMIT ?2",
                )
                .map_err(|error| format!("Failed to prepare archive page search: {error}"))?;

            let page_rows = page_statement
                .query_map(params![search_term, limit as i64], |row| {
                    let content: Option<String> = row.get("content")?;
                    Ok(ArchiveSearchPageHit {
                        page_id: row.get("id")?,
                        title: row.get("title")?,
                        page_type: row.get("type")?,
                        file_path: row.get("file_path")?,
                        stage: row.get("stage")?,
                        updated: row.get("updated")?,
                        score: if row.get::<_, i64>("title_match")? > 0 {
                            1.0
                        } else {
                            0.5
                        } + if row.get::<_, i64>("content_match")? > 0 {
                            0.25
                        } else {
                            0.0
                        },
                        snippet: content
                            .unwrap_or_default()
                            .lines()
                            .take(6)
                            .collect::<Vec<_>>()
                            .join(" "),
                    })
                })
                .map_err(|error| format!("Failed to run archive page search: {error}"))?;

            let mut pages = Vec::new();
            for row in page_rows {
                pages.push(
                    row.map_err(|error| format!("Invalid archive page search row: {error}"))?,
                );
            }

            let mut source_statement = connection
                .prepare(
                    "SELECT id, title, type, raw_path, processed
                     FROM sources
                     WHERE title LIKE ?1 OR raw_path LIKE ?1
                     ORDER BY added_at DESC
                     LIMIT ?2",
                )
                .map_err(|error| format!("Failed to prepare archive source search: {error}"))?;

            let source_rows = source_statement
                .query_map(params![search_term, limit as i64], |row| {
                    Ok(ArchiveSearchSourceHit {
                        source_id: row.get("id")?,
                        title: row.get("title")?,
                        source_type: row.get("type")?,
                        raw_path: row.get("raw_path")?,
                        processed: row.get::<_, i64>("processed")? == 1,
                    })
                })
                .map_err(|error| format!("Failed to run archive source search: {error}"))?;

            let mut sources = Vec::new();
            for row in source_rows {
                sources.push(
                    row.map_err(|error| format!("Invalid archive source search row: {error}"))?,
                );
            }
            (pages, sources)
        }
        None => (manual_archive_search(&runtime, &query, limit)?, Vec::new()),
    };

    Ok(ArchiveSearchResult {
        query,
        pages,
        sources,
    })
}

pub(crate) fn read_archive_document(
    app: &AppHandle,
    request: ArchiveReadDocumentRequest,
) -> Result<ArchiveDocumentPayload, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let path = resolve_document_path(&runtime, &request.path)?;
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read archive document: {error}"))?;
    let (frontmatter, body, title, doc_type) = parse_frontmatter(&content);
    let relative = path
        .strip_prefix(&runtime.vault_root)
        .unwrap_or(&path)
        .display()
        .to_string();

    Ok(ArchiveDocumentPayload {
        path: relative,
        title,
        doc_type,
        frontmatter,
        content: body,
    })
}

pub(crate) fn write_archive_intake_artifact(
    app: &AppHandle,
    request: ArchiveIntakeWriteRequest,
) -> Result<ArchiveIntakeWriteResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let bucket = slugify(&request.bucket);
    let file_name = request.file_name.trim();
    if file_name.is_empty() {
        return Err("Archive intake artifact must have a file name.".to_string());
    }

    let bucket_root = runtime.intake_root().join(bucket.clone());
    fs::create_dir_all(&bucket_root)
        .map_err(|error| format!("Failed to create archive intake bucket: {error}"))?;
    let artifact_path = bucket_root.join(file_name);
    fs::write(&artifact_path, request.content)
        .map_err(|error| format!("Failed to write archive intake artifact: {error}"))?;

    let metadata_path = if let Some(metadata) = request.metadata {
        let meta_path = artifact_path.with_extension(format!(
            "{}json",
            artifact_path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| format!("{ext}."))
                .unwrap_or_default()
        ));
        let payload = serde_json::to_string_pretty(&metadata)
            .map_err(|error| format!("Failed to encode archive intake metadata: {error}"))?;
        fs::write(&meta_path, payload)
            .map_err(|error| format!("Failed to write archive intake metadata: {error}"))?;
        Some(meta_path)
    } else {
        None
    };

    if let Some(connection) = open_archive_db(&runtime)? {
        let _ = connection.execute(
            "INSERT INTO activity_log (ts, action, details, agent_id) VALUES (?1, ?2, ?3, ?4)",
            params![
                unix_timestamp(),
                "intake_write",
                json!({
                    "bucket": bucket,
                    "artifact_path": artifact_path.display().to_string(),
                })
                .to_string(),
                request.actor_id
            ],
        );
    }

    Ok(ArchiveIntakeWriteResult {
        actor_id: request.actor_id,
        bucket,
        artifact_path: artifact_path.display().to_string(),
        metadata_path: metadata_path.map(|path| path.display().to_string()),
    })
}

pub(crate) fn queue_archive_ingest_request(
    app: &AppHandle,
    request: ArchiveIngestRequestRecord,
) -> Result<ArchiveIngestRequestResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let requests_root = runtime.review_queue_root().join("requests");
    fs::create_dir_all(&requests_root)
        .map_err(|error| format!("Failed to create archive review request root: {error}"))?;

    let queued_at = unix_timestamp();
    let file_name = format!(
        "{}-{}.json",
        queued_at.replace(':', "-"),
        slugify(&format!("{}-{}", request.actor_id, request.intent))
    );
    let request_file = requests_root.join(file_name);
    let payload = json!({
        "queuedAt": queued_at,
        "actorId": request.actor_id,
        "sourcePath": request.source_path,
        "sourceType": request.source_type,
        "sourceRole": request.source_role,
        "intent": request.intent,
        "provenance": request.provenance,
    });
    fs::write(
        &request_file,
        serde_json::to_string_pretty(&payload)
            .map_err(|error| format!("Failed to encode archive ingest request: {error}"))?,
    )
    .map_err(|error| format!("Failed to write archive ingest request: {error}"))?;

    if let Some(connection) = open_archive_db(&runtime)? {
        let _ = connection.execute(
            "INSERT INTO activity_log (ts, action, details, agent_id) VALUES (?1, ?2, ?3, ?4)",
            params![
                queued_at,
                "ingest_request",
                payload.to_string(),
                request.actor_id
            ],
        );
    }

    Ok(ArchiveIngestRequestResult {
        request_file: request_file.display().to_string(),
        queued_at,
    })
}

pub(crate) fn list_archive_ingest_requests(
    app: &AppHandle,
) -> Result<Vec<ArchiveQueuedIngestRequest>, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let requests_root = runtime.review_queue_root().join("requests");
    if !requests_root.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&requests_root)
        .map_err(|error| format!("Failed to read archive ingest request queue: {error}"))?
    {
        let entry = entry
            .map_err(|error| format!("Failed to read archive ingest request entry: {error}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let raw = fs::read_to_string(&path)
            .map_err(|error| format!("Failed to read archive ingest request file: {error}"))?;
        let payload = serde_json::from_str::<Value>(&raw)
            .map_err(|error| format!("Invalid archive ingest request JSON: {error}"))?;

        let source_path = payload
            .get("sourcePath")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let source_exists = resolve_source_path(&runtime, &source_path).exists();

        entries.push(ArchiveQueuedIngestRequest {
            request_file: path.display().to_string(),
            queued_at: payload
                .get("queuedAt")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            actor_id: payload
                .get("actorId")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            source_path,
            source_type: payload
                .get("sourceType")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            source_role: payload
                .get("sourceRole")
                .and_then(Value::as_str)
                .map(ToString::to_string),
            intent: payload
                .get("intent")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            source_exists,
        });
    }

    entries.sort_by(|left, right| right.queued_at.cmp(&left.queued_at));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::{evaluate_approval_tier, render_promoted_page, slugify, wiki_page_subdir};
    use super::{upsert_promoted_page_index, PromotedPageIndexInput};
    use rusqlite::{params, Connection};
    use serde_json::{json, Value};
    use std::fs;
    use std::path::Path;

    #[test]
    fn routes_low_confidence_to_human_review() {
        let (tier, _) =
            evaluate_approval_tier("transcript", "review-and-ingest", "low", "low", &[]);
        assert_eq!(tier, "human-review");
    }

    #[test]
    fn routes_high_impact_pages_to_human_review() {
        let (tier, _) = evaluate_approval_tier(
            "transcript",
            "review-and-ingest",
            "high",
            "medium",
            &[json!({"type": "synthesis"})],
        );
        assert_eq!(tier, "human-review");
    }

    #[test]
    fn defaults_regular_ingest_to_strategist_review() {
        let (tier, _) =
            evaluate_approval_tier("transcript", "review-and-ingest", "high", "low", &[]);
        assert_eq!(tier, "strategist-review");
    }

    #[test]
    fn allows_narrow_refresh_auto_approval() {
        let (tier, _) = evaluate_approval_tier("summary", "summary-refresh", "high", "low", &[]);
        assert_eq!(tier, "auto-approve");
    }

    #[test]
    fn maps_only_supported_wiki_page_types() {
        assert_eq!(wiki_page_subdir("summary"), Some("summaries"));
        assert_eq!(wiki_page_subdir("entity"), Some("entities"));
        assert_eq!(wiki_page_subdir("concept"), Some("concepts"));
        assert_eq!(wiki_page_subdir("synthesis"), Some("syntheses"));
        assert_eq!(wiki_page_subdir("future-asset"), None);
    }

    #[test]
    fn renders_trusted_page_with_review_provenance() {
        let page = json!({
            "type": "concept",
            "title": "Provider Fabric",
            "content": "Routing belongs to ResonantOS."
        });
        let (rendered, frontmatter, body) = render_promoted_page(
            &page,
            "concept",
            &slugify("Provider Fabric"),
            "Provider Fabric",
            "unix:1",
            "/source.md",
            &["source".to_string()],
            "/artifact.json",
            "unix:2",
            None,
        );
        assert!(rendered.contains("review_artifact: \"/artifact.json\""));
        assert!(rendered.contains("# Provider Fabric"));
        assert!(rendered.contains("Routing belongs to ResonantOS."));
        assert_eq!(
            frontmatter.get("created").and_then(Value::as_str),
            Some("unix:1")
        );
        assert_eq!(
            frontmatter.get("updated").and_then(Value::as_str),
            Some("unix:2")
        );
        assert!(body.contains("# Provider Fabric"));
        assert!(body.contains("Routing belongs to ResonantOS."));
    }

    #[test]
    fn merges_promoted_update_without_overwriting_existing_body() {
        let page = json!({
            "type": "concept",
            "title": "Provider Fabric",
            "content": "New routing policy detail."
        });
        let (_, _, body) = render_promoted_page(
            &page,
            "concept",
            "provider-fabric",
            "Provider Fabric",
            "unix:1",
            "/source.md",
            &["source".to_string()],
            "/artifact.json",
            "unix:2",
            Some("# Provider Fabric\n\nExisting trusted interpretation."),
        );

        assert!(body.contains("Existing trusted interpretation."));
        assert!(body.contains("## Promoted Update (unix:2)"));
        assert!(body.contains("New routing policy detail."));
        assert!(body.contains("<!-- resonantos-promote:artifact-json -->"));
    }

    #[test]
    fn does_not_append_duplicate_promoted_sections_for_same_artifact() {
        let existing = "# Provider Fabric\n\nExisting trusted interpretation.\n\n---\n\n<!-- resonantos-promote:artifact-json -->\n## Promoted Update (unix:2)\n\nAlready applied.";
        let merged = super::merge_promoted_page_body(
            Some(existing),
            "Provider Fabric",
            "Duplicate detail.",
            "/source.md",
            "/artifact.json",
            "unix:3",
        );

        assert_eq!(merged, existing);
        assert!(!merged.contains("Duplicate detail."));
    }

    #[test]
    fn upserts_promoted_page_into_archive_index_and_source_links() {
        let db_path = std::env::temp_dir().join(format!(
            "resonantos-archive-index-test-{}.db",
            std::process::id()
        ));
        let _ = fs::remove_file(&db_path);
        let connection = Connection::open(&db_path).expect("test db should open");
        connection
            .execute_batch(
                "
                CREATE TABLE pages (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    created TEXT NOT NULL,
                    updated TEXT NOT NULL,
                    stage TEXT DEFAULT 'stub',
                    frontmatter TEXT,
                    content TEXT,
                    search_vector BLOB,
                    UNIQUE(type, title)
                );
                CREATE TABLE sources (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    type TEXT NOT NULL,
                    raw_path TEXT NOT NULL UNIQUE,
                    hash TEXT,
                    added_at TEXT NOT NULL,
                    processed INTEGER DEFAULT 0,
                    metadata TEXT
                );
                CREATE TABLE page_sources (
                    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    PRIMARY KEY (page_id, source_id)
                );
                ",
            )
            .expect("test schema should initialize");

        upsert_promoted_page_index(
            &connection,
            PromotedPageIndexInput {
                page_id: "provider-fabric",
                page_type: "concept",
                title: "Provider Fabric",
                file_path: "WIKI/concepts/provider-fabric.md",
                stage: "developing",
                frontmatter: &json!({"id": "provider-fabric", "type": "concept"}),
                body: "Routing belongs to ResonantOS.",
                source_id: "session-1",
                source_title: "session-1",
                source_type: "transcript",
                source_path: "/archive/source/session-1.md",
                promoted_at: "unix:1",
            },
        )
        .expect("page index upsert should succeed");

        let indexed_body: String = connection
            .query_row(
                "SELECT content FROM pages WHERE id = ?1",
                params!["provider-fabric"],
                |row| row.get(0),
            )
            .expect("indexed page should exist");
        let processed: i64 = connection
            .query_row(
                "SELECT processed FROM sources WHERE id = ?1",
                params!["session-1"],
                |row| row.get(0),
            )
            .expect("indexed source should exist");
        let link_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM page_sources", [], |row| row.get(0))
            .expect("page source link should be countable");

        assert_eq!(indexed_body, "Routing belongs to ResonantOS.");
        assert_eq!(processed, 1);
        assert_eq!(link_count, 1);

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn source_folder_scan_accepts_expected_source_file_types() {
        assert!(super::supported_source_file(Path::new("note.md")));
        assert!(super::supported_source_file(Path::new("transcript.txt")));
        assert!(super::supported_source_file(Path::new("recording.mp3")));
        assert!(super::supported_source_file(Path::new("report.pdf")));
        assert!(!super::supported_source_file(Path::new("photo.png")));
        assert!(!super::supported_source_file(Path::new("temp.tmp")));
    }

    #[test]
    fn source_hash_changes_when_file_content_changes() {
        let path = std::env::temp_dir().join(format!(
            "resonantos-source-hash-test-{}.md",
            std::process::id()
        ));
        fs::write(&path, "first version").expect("test file should be writable");
        let first_hash = super::source_hash(&path).expect("first hash should compute");
        fs::write(&path, "second version").expect("test file should update");
        let second_hash = super::source_hash(&path).expect("second hash should compute");

        assert_ne!(first_hash, second_hash);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn imports_library_into_managed_human_knowledge_with_version_records() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-library-import-test-{}-{}",
            std::process::id(),
            super::unix_timestamp().replace(':', "-")
        ));
        let source_root = root.join("source-folder");
        let nested_source = source_root.join("notes").join("identity.md");
        fs::create_dir_all(nested_source.parent().expect("nested parent should exist"))
            .expect("test source folder should be writable");
        fs::write(&nested_source, "# Identity\nHuman-authored source.")
            .expect("test source file should be writable");

        let runtime = super::ArchiveRuntime {
            config_path: root.join("ARCHIVE_CONFIG.json"),
            mode: "adopt".to_string(),
            vault_root: root.join("vault"),
            managed_root: root.join("_LivingArchive"),
            wiki_root: root.join("_LivingArchive").join("WIKI"),
            data_root: root.join("_LivingArchive").join("DATA"),
            logs_root: root.join("_LivingArchive").join("logs"),
            config_root: root.join("_LivingArchive").join("CONFIG"),
            mapping_file: root
                .join("_LivingArchive")
                .join("CONFIG")
                .join("VAULT_MAP.json"),
            mappings: Vec::new(),
        };

        let result = super::import_archive_library_with_runtime(
            &runtime,
            super::ArchiveLibraryImportRequest {
                source_path: source_root.display().to_string(),
                domain: "human-knowledge".to_string(),
                import_mode: "copy".to_string(),
                library_name: Some("Identity Vault".to_string()),
                actor_id: "strategist.core".to_string(),
            },
        )
        .expect("library import should succeed");

        assert_eq!(result.domain, "human-knowledge");
        assert_eq!(result.import_mode, "copy");
        assert_eq!(result.files_seen, 1);
        assert_eq!(result.files_imported, 1);
        assert_eq!(result.records[0].title, "identity");
        assert!(Path::new(&result.records[0].canonical_path).exists());
        assert!(Path::new(&result.manifest_path).exists());
        assert!(Path::new(&result.version_ledger_path).exists());
        assert!(result.classification_manifest_path.is_none());
        assert!(result.classification_proposals.is_empty());

        let version_path = root
            .join("_LivingArchive")
            .join("Memory")
            .join("HUMAN_KNOWLEDGE")
            .join("versions")
            .join("identity-vault")
            .join(&result.records[0].source_id)
            .join("v1");
        assert!(version_path.exists());

        let manifest_raw =
            fs::read_to_string(&result.manifest_path).expect("manifest should be readable");
        assert!(manifest_raw.contains("\"managedCopyIsCanonical\": true"));
        assert!(
            nested_source.exists(),
            "copy import must preserve the original source"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn mixed_library_import_writes_classification_review_artifact() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-mixed-library-import-test-{}-{}",
            std::process::id(),
            super::unix_timestamp().replace(':', "-")
        ));
        let source_root = root.join("mixed-folder");
        let personal_note = source_root.join("00_THE_CONSTITUTION").join("identity.md");
        let research_note = source_root.join("research").join("market-report.md");
        fs::create_dir_all(
            personal_note
                .parent()
                .expect("personal parent should exist"),
        )
        .expect("test personal folder should be writable");
        fs::create_dir_all(
            research_note
                .parent()
                .expect("research parent should exist"),
        )
        .expect("test research folder should be writable");
        fs::write(&personal_note, "# Identity\nPersonal philosophy.")
            .expect("test personal note should be writable");
        fs::write(&research_note, "# Market Report\nExternal research.")
            .expect("test research note should be writable");

        let runtime = super::ArchiveRuntime {
            config_path: root.join("ARCHIVE_CONFIG.json"),
            mode: "adopt".to_string(),
            vault_root: root.join("vault"),
            managed_root: root.join("_LivingArchive"),
            wiki_root: root.join("_LivingArchive").join("WIKI"),
            data_root: root.join("_LivingArchive").join("DATA"),
            logs_root: root.join("_LivingArchive").join("logs"),
            config_root: root.join("_LivingArchive").join("CONFIG"),
            mapping_file: root
                .join("_LivingArchive")
                .join("CONFIG")
                .join("VAULT_MAP.json"),
            mappings: Vec::new(),
        };

        let result = super::import_archive_library_with_runtime(
            &runtime,
            super::ArchiveLibraryImportRequest {
                source_path: source_root.display().to_string(),
                domain: "mixed-library".to_string(),
                import_mode: "copy".to_string(),
                library_name: Some("Mixed Vault".to_string()),
                actor_id: "strategist.core".to_string(),
            },
        )
        .expect("mixed library import should succeed");

        assert_eq!(result.domain, "mixed-library");
        assert_eq!(
            result.classification_status,
            "needs-ai-assisted-classification"
        );
        assert_eq!(result.classification_proposals.len(), 2);
        assert!(result
            .classification_proposals
            .iter()
            .any(|proposal| proposal.proposed_target == "human-knowledge"));
        assert!(result
            .classification_proposals
            .iter()
            .any(|proposal| proposal.proposed_target == "external-knowledge"));
        let classification_manifest = result
            .classification_manifest_path
            .as_ref()
            .expect("mixed imports should write a classification review artifact");
        assert!(Path::new(classification_manifest).exists());
        let classification_raw = fs::read_to_string(classification_manifest)
            .expect("classification manifest should read");
        assert!(classification_raw.contains("\"structuralChangesAllowed\": false"));
        assert!(classification_raw.contains("\"library-classification-review\""));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn collects_imported_library_registry_from_manifests() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-library-registry-test-{}-{}",
            std::process::id(),
            super::unix_timestamp().replace(':', "-")
        ));
        let metadata_root = root.join("Memory").join("HUMAN_KNOWLEDGE").join("metadata");
        fs::create_dir_all(&metadata_root).expect("metadata root should be writable");
        let manifest_path = metadata_root.join("identity-vault-manifest.json");
        fs::write(
            &manifest_path,
            json!({
                "importedAt": "unix:100",
                "domain": "human-knowledge",
                "importMode": "copy",
                "libraryId": "identity-vault",
                "libraryName": "Identity Vault",
                "originalPath": "/original/Identity Vault",
                "canonicalRoot": "/managed/Identity Vault",
                "filesSeen": 1,
                "skippedFiles": 0,
                "classificationStatus": "user-classified",
                "metadataStandard": "obsidian-frontmatter-wikilinks",
                "obsidianVaultDetected": false,
                "versionLedgerPath": "/managed/metadata/identity-vault-version-ledger.jsonl",
                "records": [{"sourceId": "identity", "versionId": "v1"}],
            })
            .to_string(),
        )
        .expect("manifest should be writable");

        let mut summaries = Vec::new();
        super::collect_imported_library_manifests(&metadata_root, &mut summaries)
            .expect("library registry collection should succeed");

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].library_id, "identity-vault");
        assert_eq!(summaries[0].records_count, 1);
        assert_eq!(summaries[0].files_imported, 1);
        assert!(summaries[0].version_ledger_path.is_some());

        let _ = fs::remove_dir_all(root);
    }

    fn write_minimal_system_memory_project(project_root: &Path) {
        for spec in super::SYSTEM_MEMORY_SOURCE_SPECS {
            let path = project_root.join(spec.relative_path);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("system memory source parent should exist");
            }
            let content = if spec.relative_path.ends_with(".md") {
                format!(
                    "# {}\n\nBinding test source for `{}`.\n",
                    spec.relative_path, spec.relative_path
                )
            } else if spec.relative_path.ends_with(".json") {
                "{}\n".to_string()
            } else {
                format!("// Binding test source for {}.\n", spec.relative_path)
            };
            fs::write(path, content).expect("system memory source should write");
        }
    }

    fn test_archive_runtime(root: &Path) -> super::ArchiveRuntime {
        super::ArchiveRuntime {
            config_path: root.join("CONFIG").join("ARCHIVE_CONFIG.json"),
            mode: "adopt".to_string(),
            vault_root: root.join("Vault"),
            managed_root: root.join("Memory"),
            wiki_root: root.join("Wiki"),
            data_root: root.join("DATA"),
            logs_root: root.join("LOGS"),
            config_root: root.join("CONFIG"),
            mapping_file: root.join("CONFIG").join("VAULT_MAP.json"),
            mappings: Vec::new(),
        }
    }

    #[test]
    fn renders_system_memory_pages_from_architecture_sources() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-system-memory-render-test-{}-{}",
            std::process::id(),
            super::unix_timestamp().replace(':', "-")
        ));
        let project_root = root.join("project");
        write_minimal_system_memory_project(&project_root);
        let runtime = test_archive_runtime(&root);
        let sources = super::collect_system_memory_sources(&project_root);

        let pages = super::render_system_memory_pages(&project_root, &runtime, &sources)
            .expect("system memory pages should render");

        assert_eq!(pages.len(), 4);
        assert!(runtime
            .system_memory_root()
            .join("resonantos-system-index.md")
            .exists());
        assert!(runtime
            .system_memory_root()
            .join("resonantos-architecture-contract.md")
            .exists());
        let index = fs::read_to_string(
            runtime
                .system_memory_root()
                .join("resonantos-system-index.md"),
        )
        .expect("system memory index should read");
        assert!(index.contains("host-owned architecture memory"));
        assert!(index.contains("docs/architecture/ADR-013-living-archive-memory-domains.md"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn detects_stale_system_memory_when_architecture_source_changes() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-system-memory-stale-test-{}-{}",
            std::process::id(),
            super::unix_timestamp().replace(':', "-")
        ));
        let project_root = root.join("project");
        write_minimal_system_memory_project(&project_root);
        let runtime = test_archive_runtime(&root);
        let sources = super::collect_system_memory_sources(&project_root);
        let pages = super::render_system_memory_pages(&project_root, &runtime, &sources)
            .expect("system memory pages should render");
        let manifest_path = runtime.system_memory_manifest_path();
        fs::create_dir_all(manifest_path.parent().expect("manifest should have parent"))
            .expect("manifest parent should write");
        let manifest = super::ArchiveSystemMemoryManifest {
            schema_version: "1".to_string(),
            generator_version: super::SYSTEM_MEMORY_GENERATOR_VERSION.to_string(),
            generated_at: "unix:1".to_string(),
            pages_root: runtime.system_memory_root().display().to_string(),
            sources,
            pages,
        };
        fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&manifest).expect("manifest should encode"),
        )
        .expect("manifest should write");

        fs::write(
            project_root.join("docs/README.md"),
            "# ResonantOS Docs\n\nChanged after refresh.\n",
        )
        .expect("source should update");

        let status = super::system_memory_status_from_runtime(&runtime, &project_root)
            .expect("system memory status should resolve");

        assert_eq!(status.status, "stale");
        assert!(status.stale_sources.contains(&"docs/README.md".to_string()));

        let _ = fs::remove_dir_all(root);
    }
}
