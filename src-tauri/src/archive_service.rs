// Intent citation: docs/architecture/ADR-007-living-archive-boundaries.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md
// Intent citation: docs/architecture/ADR-012-living-archive-approval-policy.md

use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager};

use crate::provider_service::{
    execute_provider_service_chat, ChatMessageInput, ProviderServiceChatRequest,
};

#[derive(Deserialize)]
struct ArchiveConfigFile {
    mode: Option<String>,
    vault_root: String,
    managed_root: String,
    wiki_root: String,
    data_root: String,
    logs_root: String,
    config_root: String,
    mapping_file: Option<String>,
}

#[derive(Deserialize)]
struct VaultMapFile {
    mappings: Vec<VaultMappingFile>,
}

#[derive(Clone, Deserialize)]
struct VaultMappingFile {
    path: String,
    role: String,
    subtype: Option<String>,
    managed_by_ai: Option<bool>,
    immutable: Option<bool>,
    rename_allowed: Option<bool>,
    move_allowed: Option<bool>,
}

#[derive(Deserialize)]
struct IngestAgentConfigFile {
    enabled: Option<bool>,
    provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchivePathMapping {
    pub(crate) path: String,
    pub(crate) role: String,
    pub(crate) subtype: Option<String>,
    pub(crate) absolute_path: String,
    pub(crate) exists: bool,
    pub(crate) managed_by_ai: bool,
    pub(crate) immutable: bool,
    pub(crate) rename_allowed: bool,
    pub(crate) move_allowed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSourceRoot {
    pub(crate) role: String,
    pub(crate) subtype: Option<String>,
    pub(crate) path: String,
    pub(crate) exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveIngestAgentStatus {
    pub(crate) enabled: bool,
    pub(crate) provider: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) reasoning_effort: Option<String>,
    pub(crate) config_file: String,
    pub(crate) prompt_file: String,
    pub(crate) config_exists: bool,
    pub(crate) prompt_exists: bool,
}

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveRuntimeStatus {
    pub(crate) status: String,
    pub(crate) mode: String,
    pub(crate) config_path: String,
    pub(crate) vault_root: String,
    pub(crate) managed_root: String,
    pub(crate) wiki_root: String,
    pub(crate) data_root: String,
    pub(crate) logs_root: String,
    pub(crate) config_root: String,
    pub(crate) mapping_file: String,
    pub(crate) intake_root: String,
    pub(crate) review_queue_root: String,
    pub(crate) mappings: Vec<ArchivePathMapping>,
    pub(crate) source_roots: Vec<ArchiveSourceRoot>,
    pub(crate) ingest_agent: ArchiveIngestAgentStatus,
    pub(crate) stats: Option<ArchiveStats>,
    pub(crate) recent_activity: Vec<ArchiveActivityEntry>,
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

struct ArchiveRuntime {
    config_path: PathBuf,
    mode: String,
    vault_root: PathBuf,
    managed_root: PathBuf,
    wiki_root: PathBuf,
    data_root: PathBuf,
    logs_root: PathBuf,
    config_root: PathBuf,
    mapping_file: PathBuf,
    mappings: Vec<VaultMappingFile>,
}

impl ArchiveRuntime {
    fn resolve(app: &AppHandle) -> Result<Self, String> {
        let config_path = archive_config_candidates(app)?
            .into_iter()
            .find(|candidate| candidate.exists())
            .ok_or_else(|| {
                "No Living Archive config was found. Set RESONANT_ARCHIVE_CONFIG or create _LivingArchive/CONFIG/ARCHIVE_CONFIG.json."
                    .to_string()
            })?;

        let raw = fs::read_to_string(&config_path)
            .map_err(|error| format!("Failed to read archive config: {error}"))?;
        let config: ArchiveConfigFile = serde_json::from_str(&raw)
            .map_err(|error| format!("Invalid archive config JSON: {error}"))?;

        let config_root = PathBuf::from(&config.config_root);
        let mapping_file = config
            .mapping_file
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| config_root.join("VAULT_MAP.json"));

        let mappings = if mapping_file.exists() {
            let raw_map = fs::read_to_string(&mapping_file)
                .map_err(|error| format!("Failed to read vault map: {error}"))?;
            serde_json::from_str::<VaultMapFile>(&raw_map)
                .map_err(|error| format!("Invalid vault map JSON: {error}"))?
                .mappings
        } else {
            Vec::new()
        };

        Ok(Self {
            config_path,
            mode: config.mode.unwrap_or_else(|| "adopt".to_string()),
            vault_root: PathBuf::from(config.vault_root),
            managed_root: PathBuf::from(config.managed_root),
            wiki_root: PathBuf::from(config.wiki_root),
            data_root: PathBuf::from(config.data_root),
            logs_root: PathBuf::from(config.logs_root),
            config_root,
            mapping_file,
            mappings,
        })
    }

    fn db_path(&self) -> PathBuf {
        self.data_root.join("wiki.db")
    }

    fn source_watch_index_path(&self) -> PathBuf {
        self.data_root.join("source-watch-index.json")
    }

    fn review_queue_root(&self) -> PathBuf {
        self.managed_root.join("REVIEW")
    }

    fn intake_root(&self) -> PathBuf {
        self.managed_root.join("INTAKE")
    }

    fn memory_root(&self) -> PathBuf {
        if self
            .managed_root
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value == "Memory")
        {
            return self.managed_root.clone();
        }
        self.managed_root.join("Memory")
    }

    fn memory_domain_root(&self, domain: &str) -> PathBuf {
        match domain {
            "human-knowledge" => self.memory_root().join("HUMAN_KNOWLEDGE"),
            "external-knowledge" => self.memory_root().join("EXTERNAL_KNOWLEDGE"),
            "ai-memory" => self.memory_root().join("AI_MEMORY"),
            "mixed-library" => self
                .memory_root()
                .join("INTAKE")
                .join("imports")
                .join("mixed"),
            _ => self.memory_root().join("UNCLASSIFIED_KNOWLEDGE"),
        }
    }

    fn memory_domain_roots(&self) -> Vec<(&'static str, PathBuf)> {
        vec![
            (
                "human-knowledge",
                self.memory_domain_root("human-knowledge"),
            ),
            (
                "external-knowledge",
                self.memory_domain_root("external-knowledge"),
            ),
            ("ai-memory", self.memory_domain_root("ai-memory")),
            ("mixed-library", self.memory_domain_root("mixed-library")),
        ]
    }

    fn system_memory_root(&self) -> PathBuf {
        self.memory_domain_root("ai-memory").join("system")
    }

    fn system_memory_manifest_path(&self) -> PathBuf {
        self.memory_domain_root("ai-memory")
            .join("provenance")
            .join("system-memory-manifest.json")
    }

    fn allowed_roots(&self) -> Vec<PathBuf> {
        let mut roots = vec![
            self.vault_root.clone(),
            self.managed_root.clone(),
            self.wiki_root.clone(),
            self.data_root.clone(),
            self.logs_root.clone(),
            self.config_root.clone(),
            self.review_queue_root(),
            self.intake_root(),
        ];
        roots.extend(
            self.mappings
                .iter()
                .map(|mapping| self.vault_root.join(&mapping.path)),
        );
        dedupe_paths(roots)
    }
}

fn archive_config_candidates(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let mut candidates = Vec::new();

    if let Some(path) = env::var_os("RESONANT_ARCHIVE_CONFIG") {
        candidates.push(PathBuf::from(path));
    }
    if let Some(path) = env::var_os("LIVING_ARCHIVE_CONFIG") {
        candidates.push(PathBuf::from(path));
    }
    if let Ok(documents_dir) = app.path().document_dir() {
        candidates.push(
            documents_dir
                .join("RESONANT_OS_BASE")
                .join("_LivingArchive")
                .join("CONFIG")
                .join("ARCHIVE_CONFIG.json"),
        );
    }

    Ok(dedupe_paths(candidates))
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut unique = Vec::new();
    for path in paths {
        let key = path.to_string_lossy().to_string();
        if seen.insert(key) {
            unique.push(path);
        }
    }
    unique
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

fn normalize_confidence(value: Option<&Value>) -> String {
    match value
        .and_then(Value::as_str)
        .unwrap_or("medium")
        .to_ascii_lowercase()
        .as_str()
    {
        "high" => "high".to_string(),
        "low" => "low".to_string(),
        _ => "medium".to_string(),
    }
}

fn normalize_doctrine_sensitivity(value: Option<&Value>, source_type: &str) -> String {
    let explicit = value
        .and_then(Value::as_str)
        .map(|raw| raw.to_ascii_lowercase());
    if let Some(level) = explicit {
        return match level.as_str() {
            "high" => "high".to_string(),
            "low" => "low".to_string(),
            _ => "medium".to_string(),
        };
    }

    match source_type {
        "constitution" | "protocol" | "philosophy" | "manifesto" => "high".to_string(),
        "summary" | "analysis" => "medium".to_string(),
        _ => "low".to_string(),
    }
}

fn proposed_page_types(proposed_pages: &[Value]) -> Vec<String> {
    proposed_pages
        .iter()
        .filter_map(|page| {
            page.get("type")
                .and_then(Value::as_str)
                .map(|value| value.to_ascii_lowercase())
        })
        .collect()
}

fn evaluate_approval_tier(
    source_type: &str,
    intent: &str,
    confidence: &str,
    doctrine_sensitivity: &str,
    proposed_pages: &[Value],
) -> (String, String) {
    let page_types = proposed_page_types(proposed_pages);
    let has_high_impact_page = page_types
        .iter()
        .any(|page_type| page_type == "synthesis" || page_type == "future-asset");
    let doctrine_sensitive_source = matches!(
        source_type,
        "constitution" | "protocol" | "philosophy" | "manifesto"
    );

    if confidence == "low" {
        return (
            "human-review".to_string(),
            "Low-confidence ingest must be escalated to human review before trusted promotion."
                .to_string(),
        );
    }

    if doctrine_sensitivity == "high" || doctrine_sensitive_source || has_high_impact_page {
        return (
            "human-review".to_string(),
            "Doctrine-sensitive or high-impact archive promotion requires human review."
                .to_string(),
        );
    }

    if matches!(intent, "summary-refresh" | "metadata-refresh")
        && confidence == "high"
        && doctrine_sensitivity == "low"
    {
        return (
            "auto-approve".to_string(),
            "This request matches the narrow low-risk refresh policy and can be auto-approved."
                .to_string(),
        );
    }

    (
        "strategist-review".to_string(),
        "Strategist review is the default approval tier for trusted archive promotion.".to_string(),
    )
}

fn parse_proposed_pages(value: Option<&Value>) -> Vec<Value> {
    value.and_then(Value::as_array).cloned().unwrap_or_default()
}

fn string_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|item| !item.is_empty())
}

fn collect_string_values(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
            .collect(),
        Some(Value::String(raw)) => raw
            .trim_matches(|character| character == '[' || character == ']')
            .split(',')
            .map(str::trim)
            .map(|item| item.trim_matches('"'))
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn merge_source_ids(page: &Value, default_source_id: &str) -> Vec<String> {
    let mut sources = Vec::new();
    for source in collect_string_values(page.get("sources")) {
        if !sources.contains(&source) {
            sources.push(source);
        }
    }
    if !sources.iter().any(|source| source == default_source_id) {
        sources.push(default_source_id.to_string());
    }
    sources
}

fn wiki_page_subdir(page_type: &str) -> Option<&'static str> {
    match page_type.to_ascii_lowercase().as_str() {
        "summary" => Some("summaries"),
        "entity" => Some("entities"),
        "concept" => Some("concepts"),
        "synthesis" => Some("syntheses"),
        _ => None,
    }
}

fn render_promoted_page(
    page: &Value,
    page_type: &str,
    page_id: &str,
    title: &str,
    created_at: &str,
    source_path: &str,
    source_ids: &[String],
    artifact_file: &str,
    promoted_at: &str,
    existing_body: Option<&str>,
) -> (String, Value, String) {
    let promoted_body = string_field(
        page,
        &["content", "body", "markdown", "summary", "description"],
    )
    .unwrap_or("No body was supplied by the review artifact.");
    let stage = string_field(page, &["stage"])
        .filter(|value| matches!(*value, "stub" | "developing" | "mature"))
        .unwrap_or(if page_type == "summary" {
            "mature"
        } else {
            "developing"
        });
    let source_yaml = source_ids
        .iter()
        .map(|source| format!("  - \"{}\"", source.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join("\n");
    let frontmatter = json!({
        "id": page_id,
        "type": page_type,
        "title": title,
        "created": created_at,
        "updated": promoted_at,
        "stage": stage,
        "sources": source_ids,
        "source_path": source_path,
        "review_artifact": artifact_file,
    });

    let body = merge_promoted_page_body(
        existing_body,
        title,
        promoted_body,
        source_path,
        artifact_file,
        promoted_at,
    );
    let content = format!(
        "---\nid: {page_id}\ntype: {page_type}\ntitle: \"{}\"\ncreated: {created_at}\nupdated: {promoted_at}\nstage: {stage}\nsources:\n{}\nsource_path: \"{}\"\nreview_artifact: \"{}\"\n---\n\n{}\n",
        title.replace('"', "\\\""),
        source_yaml,
        source_path.replace('"', "\\\""),
        artifact_file.replace('"', "\\\""),
        body
    );
    (content, frontmatter, body)
}

fn merge_promoted_page_body(
    existing_body: Option<&str>,
    title: &str,
    promoted_body: &str,
    source_path: &str,
    artifact_file: &str,
    promoted_at: &str,
) -> String {
    let marker = format!("<!-- resonantos-promote:{} -->", slugify(artifact_file));
    if let Some(existing_body) = existing_body.map(str::trim).filter(|body| !body.is_empty()) {
        if existing_body.contains(&marker) {
            return existing_body.to_string();
        }
        return format!(
            "{existing_body}\n\n---\n\n{marker}\n## Promoted Update ({promoted_at})\n\n**Source:** `{source_path}`  \n**Review Artifact:** `{artifact_file}`\n\n{}",
            promoted_body.trim()
        );
    }

    format!("# {title}\n\n{}", promoted_body.trim())
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

fn supported_source_file(path: &Path) -> bool {
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

#[derive(Clone, Copy)]
struct SystemMemorySourceSpec {
    relative_path: &'static str,
    required: bool,
}

const SYSTEM_MEMORY_GENERATOR_VERSION: &str = "resonantos-system-memory-v1";

const SYSTEM_MEMORY_SOURCE_SPECS: &[SystemMemorySourceSpec] = &[
    SystemMemorySourceSpec {
        relative_path: "docs/README.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/FEATURE_BACKLOG.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/MODULE_MAP.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-001-platform-stack.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-002-modular-codebase.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-003-engineering-standards.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-005-provider-fabric-routing.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-006-addon-runtime-sdk.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-007-living-archive-boundaries.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-009-rust-service-ipc-boundary.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-010-recovery-ladder.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-011-living-archive-host-service.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-012-living-archive-approval-policy.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-013-living-archive-memory-domains.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/ADR-014-system-architecture-memory.md",
        required: true,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/architecture/AUDIO2TOL_INTAKE_ANALYSIS.md",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "docs/product/UX-001-resonantos-app-shell.md",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src/core/contracts.ts",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src/core/runtime.ts",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src/core/provider-service.ts",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src-tauri/src/archive_service.rs",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src-tauri/src/lib.rs",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src-tauri/src/provider_service.rs",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src-tauri/src/recovery_service.rs",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "src-tauri/tauri.conf.json",
        required: false,
    },
    SystemMemorySourceSpec {
        relative_path: "package.json",
        required: false,
    },
];

fn hash_text(value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("fnv64:{:016x}", hasher.finish())
}

fn system_memory_project_root_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = env::var_os("RESONANTOS_PROJECT_ROOT") {
        candidates.push(PathBuf::from(path));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.clone());
        candidates.push(resource_dir.join("_up_"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR"))),
    );
    dedupe_paths(candidates)
}

fn resolve_system_memory_project_root(app: &AppHandle) -> Result<PathBuf, String> {
    system_memory_project_root_candidates(app)
        .into_iter()
        .find(|candidate| candidate.join("docs").exists())
        .ok_or_else(|| {
            "No ResonantOS architecture source root was found for system memory refresh."
                .to_string()
        })
}

fn collect_system_memory_sources(project_root: &Path) -> Vec<ArchiveSystemMemorySource> {
    SYSTEM_MEMORY_SOURCE_SPECS
        .iter()
        .map(|spec| {
            let absolute_path = project_root.join(spec.relative_path);
            let metadata = absolute_path.metadata().ok();
            ArchiveSystemMemorySource {
                relative_path: spec.relative_path.to_string(),
                absolute_path: absolute_path.display().to_string(),
                exists: absolute_path.exists(),
                required: spec.required,
                hash: if absolute_path.exists() {
                    source_hash(&absolute_path).ok()
                } else {
                    None
                },
                size_bytes: metadata.as_ref().map(|value| value.len()),
                modified_at: metadata
                    .and_then(|value| value.modified().ok())
                    .map(system_time_label),
            }
        })
        .collect()
}

fn read_system_source(project_root: &Path, relative_path: &str) -> String {
    let path = project_root.join(relative_path);
    fs::read_to_string(&path).unwrap_or_else(|_| {
        format!(
            "> Source unavailable at refresh time: `{}`\n",
            path.display()
        )
    })
}

fn first_markdown_heading(content: &str, fallback: &str) -> String {
    content
        .lines()
        .find_map(|line| line.strip_prefix("# ").map(str::trim))
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn render_system_memory_section(project_root: &Path, relative_path: &str) -> String {
    let content = read_system_source(project_root, relative_path);
    let title = first_markdown_heading(&content, relative_path);
    format!(
        "## {}\n\n_Source: `{}`_\n\n{}\n",
        title,
        relative_path,
        content.trim()
    )
}

fn write_system_memory_page(
    pages_root: &Path,
    page_id: &str,
    title: &str,
    content: &str,
    source_count: usize,
) -> Result<ArchiveSystemMemoryPage, String> {
    fs::create_dir_all(pages_root)
        .map_err(|error| format!("Failed to create system memory root: {error}"))?;
    let path = pages_root.join(format!("{page_id}.md"));
    fs::write(&path, content)
        .map_err(|error| format!("Failed to write system memory page {page_id}: {error}"))?;
    Ok(ArchiveSystemMemoryPage {
        page_id: page_id.to_string(),
        title: title.to_string(),
        file_path: path.display().to_string(),
        source_count,
        hash: hash_text(content),
    })
}

fn render_system_memory_pages(
    project_root: &Path,
    runtime: &ArchiveRuntime,
    sources: &[ArchiveSystemMemorySource],
) -> Result<Vec<ArchiveSystemMemoryPage>, String> {
    let generated_at = unix_timestamp();
    let pages_root = runtime.system_memory_root();
    let available_sources = sources.iter().filter(|source| source.exists).count();
    let source_table = sources
        .iter()
        .map(|source| {
            format!(
                "| `{}` | {} | {} | {} |",
                source.relative_path,
                if source.required {
                    "required"
                } else {
                    "optional"
                },
                if source.exists { "present" } else { "missing" },
                source.hash.as_deref().unwrap_or("n/a")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let index_content = format!(
        "---\ntype: resonantos_system_memory\ntrust: core\nmanaged_by: resonantos_host\ngenerated_at: {generated_at}\n---\n\n# ResonantOS System Memory Index\n\nThis is host-owned architecture memory for Augmentor and the Resonant Engineer Agent. It is generated before user knowledge intake and must not be edited as user memory.\n\n## Rules\n\n- Treat these pages as the current system contract until the manifest reports stale sources.\n- Prefer this memory over user imports when answering how ResonantOS works.\n- Refresh this memory after architecture docs, IPC contracts, provider routing, recovery, or archive service code changes.\n\n## Source Inventory\n\n| Source | Role | Status | Hash |\n| --- | --- | --- | --- |\n{source_table}\n"
    );

    let architecture_docs = [
        "docs/README.md",
        "docs/architecture/MODULE_MAP.md",
        "docs/architecture/ADR-001-platform-stack.md",
        "docs/architecture/ADR-002-modular-codebase.md",
        "docs/architecture/ADR-003-engineering-standards.md",
        "docs/architecture/ADR-005-provider-fabric-routing.md",
        "docs/architecture/ADR-006-addon-runtime-sdk.md",
        "docs/architecture/ADR-009-rust-service-ipc-boundary.md",
    ];
    let architecture_content = format!(
        "---\ntype: resonantos_system_memory\ntrust: core\nmanaged_by: resonantos_host\ngenerated_at: {generated_at}\n---\n\n# ResonantOS Architecture Contract\n\n{}\n",
        architecture_docs
            .iter()
            .map(|path| render_system_memory_section(project_root, path))
            .collect::<Vec<_>>()
            .join("\n---\n\n")
    );

    let memory_docs = [
        "docs/architecture/ADR-007-living-archive-boundaries.md",
        "docs/architecture/ADR-010-recovery-ladder.md",
        "docs/architecture/ADR-011-living-archive-host-service.md",
        "docs/architecture/ADR-012-living-archive-approval-policy.md",
        "docs/architecture/ADR-013-living-archive-memory-domains.md",
        "docs/architecture/ADR-014-system-architecture-memory.md",
        "docs/architecture/AUDIO2TOL_INTAKE_ANALYSIS.md",
    ];
    let memory_content = format!(
        "---\ntype: resonantos_system_memory\ntrust: core\nmanaged_by: resonantos_host\ngenerated_at: {generated_at}\n---\n\n# Living Archive And Recovery Contract\n\n{}\n",
        memory_docs
            .iter()
            .map(|path| render_system_memory_section(project_root, path))
            .collect::<Vec<_>>()
            .join("\n---\n\n")
    );

    let code_contract_content = format!(
        "---\ntype: resonantos_system_memory\ntrust: core\nmanaged_by: resonantos_host\ngenerated_at: {generated_at}\n---\n\n# ResonantOS Code Contract Inventory\n\nThis page is a deterministic source map for host services and TypeScript contracts. It does not replace source review; it tells agents which files define the running system boundary.\n\n## Indexed Sources\n\n{source_table}\n\n## Current Runtime Roots\n\n- Vault root: `{}`\n- Managed root: `{}`\n- System memory root: `{}`\n- System memory manifest: `{}`\n\n## Source Count\n\n{} architecture and code sources were indexed.\n",
        runtime.vault_root.display(),
        runtime.managed_root.display(),
        runtime.system_memory_root().display(),
        runtime.system_memory_manifest_path().display(),
        available_sources
    );

    Ok(vec![
        write_system_memory_page(
            &pages_root,
            "resonantos-system-index",
            "ResonantOS System Memory Index",
            &index_content,
            sources.len(),
        )?,
        write_system_memory_page(
            &pages_root,
            "resonantos-architecture-contract",
            "ResonantOS Architecture Contract",
            &architecture_content,
            architecture_docs.len(),
        )?,
        write_system_memory_page(
            &pages_root,
            "resonantos-archive-recovery-contract",
            "Living Archive And Recovery Contract",
            &memory_content,
            memory_docs.len(),
        )?,
        write_system_memory_page(
            &pages_root,
            "resonantos-code-contract-inventory",
            "ResonantOS Code Contract Inventory",
            &code_contract_content,
            sources.len(),
        )?,
    ])
}

fn read_system_memory_manifest(
    manifest_path: &Path,
) -> Result<Option<ArchiveSystemMemoryManifest>, String> {
    if !manifest_path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(manifest_path)
        .map_err(|error| format!("Failed to read system memory manifest: {error}"))?;
    serde_json::from_str::<ArchiveSystemMemoryManifest>(&raw)
        .map(Some)
        .map_err(|error| format!("Invalid system memory manifest JSON: {error}"))
}

fn system_memory_status_from_runtime(
    runtime: &ArchiveRuntime,
    project_root: &Path,
) -> Result<ArchiveSystemMemoryStatus, String> {
    let manifest_path = runtime.system_memory_manifest_path();
    let current_sources = collect_system_memory_sources(project_root);
    let manifest = read_system_memory_manifest(&manifest_path)?;
    let mut stale_sources = Vec::new();
    let missing_sources = current_sources
        .iter()
        .filter(|source| source.required && !source.exists)
        .map(|source| source.relative_path.clone())
        .collect::<Vec<_>>();

    if let Some(manifest) = manifest.as_ref() {
        for source in &current_sources {
            let previous = manifest
                .sources
                .iter()
                .find(|candidate| candidate.relative_path == source.relative_path);
            if previous.and_then(|value| value.hash.as_ref()) != source.hash.as_ref() {
                stale_sources.push(source.relative_path.clone());
            }
        }
    }

    let status = if manifest.is_none() {
        "missing"
    } else if !missing_sources.is_empty() {
        "blocked"
    } else if !stale_sources.is_empty() {
        "stale"
    } else {
        "ready"
    };

    Ok(ArchiveSystemMemoryStatus {
        status: status.to_string(),
        generated_at: manifest.as_ref().map(|value| value.generated_at.clone()),
        manifest_path: manifest_path.display().to_string(),
        pages_root: runtime.system_memory_root().display().to_string(),
        sources: current_sources,
        pages: manifest.map(|value| value.pages).unwrap_or_default(),
        stale_sources,
        missing_sources,
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

fn system_time_to_unix(time: SystemTime) -> Option<String> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| format!("unix:{}", duration.as_secs()))
}

fn parse_review_decision(payload: &Value) -> ArchiveReviewDecision {
    let decision = payload.get("decision").and_then(Value::as_object);
    ArchiveReviewDecision {
        status: decision
            .and_then(|item| item.get("status"))
            .and_then(Value::as_str)
            .unwrap_or("pending")
            .to_string(),
        action: decision
            .and_then(|item| item.get("action"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
        actor_id: decision
            .and_then(|item| item.get("actorId"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
        decided_at: decision
            .and_then(|item| item.get("decidedAt"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
        tier_applied: decision
            .and_then(|item| item.get("tierApplied"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
        notes: decision
            .and_then(|item| item.get("notes"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
    }
}

fn parse_review_artifact(artifact_file: PathBuf, payload: &Value) -> ArchiveReviewArtifact {
    let result = payload.get("result").unwrap_or(payload);
    ArchiveReviewArtifact {
        artifact_file: artifact_file.display().to_string(),
        checked_at: payload
            .get("checkedAt")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        request_file: payload
            .get("requestFile")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        source_path: payload
            .get("sourcePath")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
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
        provider_id: payload
            .get("providerId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        model: payload
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        summary: result
            .get("summary")
            .and_then(Value::as_str)
            .unwrap_or("Review artifact created.")
            .to_string(),
        confidence: normalize_confidence(result.get("confidence")),
        doctrine_sensitivity: payload
            .get("policy")
            .and_then(|value| value.get("doctrineSensitivity"))
            .and_then(Value::as_str)
            .unwrap_or("medium")
            .to_string(),
        recommended_tier: payload
            .get("policy")
            .and_then(|value| value.get("recommendedTier"))
            .and_then(Value::as_str)
            .unwrap_or("strategist-review")
            .to_string(),
        recommendation_reason: payload
            .get("policy")
            .and_then(|value| value.get("recommendationReason"))
            .and_then(Value::as_str)
            .unwrap_or("Strategist review is the default approval tier.")
            .to_string(),
        proposed_pages: parse_proposed_pages(result.get("proposed_pages")),
        decision: parse_review_decision(payload),
    }
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

struct PromotedPageIndexInput<'a> {
    page_id: &'a str,
    page_type: &'a str,
    title: &'a str,
    file_path: &'a str,
    stage: &'a str,
    frontmatter: &'a Value,
    body: &'a str,
    source_id: &'a str,
    source_title: &'a str,
    source_type: &'a str,
    source_path: &'a str,
    promoted_at: &'a str,
}

fn existing_page_created_at(
    connection: &Connection,
    page_id: &str,
) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT created FROM pages WHERE id = ?1",
            params![page_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Failed to read existing archive page index row: {error}"))
}

fn upsert_promoted_page_index(
    connection: &Connection,
    input: PromotedPageIndexInput<'_>,
) -> Result<String, String> {
    let existing_created = existing_page_created_at(connection, input.page_id)?;
    let created_at = existing_created.unwrap_or_else(|| input.promoted_at.to_string());
    let frontmatter_json = serde_json::to_string(input.frontmatter)
        .map_err(|error| format!("Failed to encode promoted page frontmatter: {error}"))?;

    connection
        .execute(
            "INSERT INTO pages (id, type, title, file_path, created, updated, stage, frontmatter, content)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                file_path = excluded.file_path,
                updated = excluded.updated,
                stage = excluded.stage,
                frontmatter = excluded.frontmatter,
                content = excluded.content",
            params![
                input.page_id,
                input.page_type,
                input.title,
                input.file_path,
                created_at,
                input.promoted_at,
                input.stage,
                frontmatter_json,
                input.body,
            ],
        )
        .map_err(|error| format!("Failed to update promoted page archive index: {error}"))?;

    connection
        .execute(
            "INSERT OR IGNORE INTO sources (id, title, type, raw_path, added_at, processed, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)",
            params![
                input.source_id,
                input.source_title,
                input.source_type,
                input.source_path,
                input.promoted_at,
                json!({"registeredBy": "resonantos-vnext"}).to_string(),
            ],
        )
        .map_err(|error| format!("Failed to register promoted page source in archive index: {error}"))?;
    connection
        .execute(
            "UPDATE sources SET processed = 1 WHERE id = ?1 OR raw_path = ?2",
            params![input.source_id, input.source_path],
        )
        .map_err(|error| format!("Failed to mark promoted page source as processed: {error}"))?;

    let indexed_source_id = connection
        .query_row(
            "SELECT id FROM sources WHERE raw_path = ?1 OR id = ?2 ORDER BY CASE WHEN id = ?2 THEN 0 ELSE 1 END LIMIT 1",
            params![input.source_path, input.source_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Failed to resolve promoted page source index row: {error}"))?
        .unwrap_or_else(|| input.source_id.to_string());

    connection
        .execute(
            "INSERT OR IGNORE INTO page_sources (page_id, source_id) VALUES (?1, ?2)",
            params![input.page_id, indexed_source_id],
        )
        .map_err(|error| {
            format!("Failed to link promoted page to source in archive index: {error}")
        })?;

    Ok(created_at)
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

pub(crate) fn query_archive_runtime_status(
    app: &AppHandle,
) -> Result<ArchiveRuntimeStatus, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    fs::create_dir_all(runtime.intake_root())
        .map_err(|error| format!("Failed to ensure archive intake root: {error}"))?;
    fs::create_dir_all(runtime.review_queue_root())
        .map_err(|error| format!("Failed to ensure archive review root: {error}"))?;

    let ingest_agent_config = runtime.config_root.join("INGEST_AGENT_CONFIG.json");
    let ingest_agent_prompt = runtime.config_root.join("INGEST_AGENT_SYSTEM_PROMPT.md");
    let ingest_agent = if ingest_agent_config.exists() {
        let raw = fs::read_to_string(&ingest_agent_config)
            .map_err(|error| format!("Failed to read ingest agent config: {error}"))?;
        let config: IngestAgentConfigFile = serde_json::from_str(&raw)
            .map_err(|error| format!("Invalid ingest agent config JSON: {error}"))?;
        ArchiveIngestAgentStatus {
            enabled: config.enabled.unwrap_or(true),
            provider: config.provider,
            model: config.model,
            reasoning_effort: config.reasoning_effort,
            config_file: ingest_agent_config.display().to_string(),
            prompt_file: ingest_agent_prompt.display().to_string(),
            config_exists: true,
            prompt_exists: ingest_agent_prompt.exists(),
        }
    } else {
        ArchiveIngestAgentStatus {
            enabled: false,
            provider: None,
            model: None,
            reasoning_effort: None,
            config_file: ingest_agent_config.display().to_string(),
            prompt_file: ingest_agent_prompt.display().to_string(),
            config_exists: false,
            prompt_exists: ingest_agent_prompt.exists(),
        }
    };

    let mappings = runtime
        .mappings
        .iter()
        .map(|mapping| {
            let absolute_path = runtime.vault_root.join(&mapping.path);
            ArchivePathMapping {
                path: mapping.path.clone(),
                role: mapping.role.clone(),
                subtype: mapping.subtype.clone(),
                absolute_path: absolute_path.display().to_string(),
                exists: absolute_path.exists(),
                managed_by_ai: mapping.managed_by_ai.unwrap_or(false),
                immutable: mapping.immutable.unwrap_or(false),
                rename_allowed: mapping.rename_allowed.unwrap_or(false),
                move_allowed: mapping.move_allowed.unwrap_or(false),
            }
        })
        .collect::<Vec<_>>();

    let source_roots = runtime
        .mappings
        .iter()
        .filter(|mapping| mapping.role == "raw_sources" || mapping.role == "derived_sources")
        .map(|mapping| {
            let absolute_path = runtime.vault_root.join(&mapping.path);
            ArchiveSourceRoot {
                role: mapping.role.clone(),
                subtype: mapping.subtype.clone(),
                path: absolute_path.display().to_string(),
                exists: absolute_path.exists(),
            }
        })
        .collect::<Vec<_>>();

    let (stats, recent_activity) = match open_archive_db(&runtime)? {
        Some(connection) => (
            Some(load_archive_stats(&connection)?),
            load_recent_activity(&connection, 12)?,
        ),
        None => (None, Vec::new()),
    };

    Ok(ArchiveRuntimeStatus {
        status: if runtime.wiki_root.exists() && runtime.db_path().exists() {
            "ready".to_string()
        } else {
            "attention".to_string()
        },
        mode: runtime.mode.clone(),
        config_path: runtime.config_path.display().to_string(),
        vault_root: runtime.vault_root.display().to_string(),
        managed_root: runtime.managed_root.display().to_string(),
        wiki_root: runtime.wiki_root.display().to_string(),
        data_root: runtime.data_root.display().to_string(),
        logs_root: runtime.logs_root.display().to_string(),
        config_root: runtime.config_root.display().to_string(),
        mapping_file: runtime.mapping_file.display().to_string(),
        intake_root: runtime.intake_root().display().to_string(),
        review_queue_root: runtime.review_queue_root().display().to_string(),
        mappings,
        source_roots,
        ingest_agent,
        stats,
        recent_activity,
    })
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

fn import_archive_library_with_runtime(
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

fn collect_imported_library_manifests(
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

pub(crate) fn list_archive_review_artifacts(
    app: &AppHandle,
) -> Result<Vec<ArchiveReviewArtifact>, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let artifacts_root = runtime.review_queue_root().join("artifacts");
    if !artifacts_root.exists() {
        return Ok(Vec::new());
    }

    let mut artifacts = Vec::new();
    for entry in fs::read_dir(&artifacts_root)
        .map_err(|error| format!("Failed to read archive review artifacts: {error}"))?
    {
        let entry = entry
            .map_err(|error| format!("Failed to read archive review artifact entry: {error}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let raw = fs::read_to_string(&path)
            .map_err(|error| format!("Failed to read archive review artifact: {error}"))?;
        let payload = serde_json::from_str::<Value>(&raw)
            .map_err(|error| format!("Invalid archive review artifact JSON: {error}"))?;
        artifacts.push(parse_review_artifact(path, &payload));
    }

    artifacts.sort_by(|left, right| right.checked_at.cmp(&left.checked_at));
    Ok(artifacts)
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

pub(crate) async fn process_archive_ingest_request(
    app: &AppHandle,
    request: ArchiveProcessIngestRequest,
) -> Result<ArchiveProcessIngestResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let request_path = resolve_document_path(&runtime, &request.request_file)?;
    let request_raw = fs::read_to_string(&request_path)
        .map_err(|error| format!("Failed to read queued archive ingest request: {error}"))?;
    let payload = serde_json::from_str::<Value>(&request_raw)
        .map_err(|error| format!("Invalid queued archive ingest request JSON: {error}"))?;

    let source_path = payload
        .get("sourcePath")
        .and_then(Value::as_str)
        .ok_or_else(|| "Queued ingest request is missing sourcePath.".to_string())?;
    let source_type = payload
        .get("sourceType")
        .and_then(Value::as_str)
        .unwrap_or("note");
    let source_role = payload
        .get("sourceRole")
        .and_then(Value::as_str)
        .map(ToString::to_string);
    let intent = payload
        .get("intent")
        .and_then(Value::as_str)
        .unwrap_or("review-and-ingest");
    let queued_at = payload
        .get("queuedAt")
        .and_then(Value::as_str)
        .unwrap_or_default();

    let resolved_source = resolve_source_path(&runtime, source_path);
    if !resolved_source.exists() {
        return Err(format!(
            "Archive ingest source does not exist: {}",
            resolved_source.display()
        ));
    }

    let source_content = fs::read_to_string(&resolved_source)
        .map_err(|error| format!("Failed to read archive ingest source: {error}"))?;
    let truncated_content = if source_content.chars().count() > 16_000 {
        source_content.chars().take(16_000).collect::<String>()
    } else {
        source_content.clone()
    };

    let prompt_file = runtime.config_root.join("INGEST_AGENT_SYSTEM_PROMPT.md");
    let ingest_prompt = if prompt_file.exists() {
        fs::read_to_string(&prompt_file)
            .map_err(|error| format!("Failed to read ingest agent system prompt: {error}"))?
    } else {
        "You are the Resonant Ingest Agent. Produce a structured archive review draft from the provided source without writing trusted knowledge pages directly.".to_string()
    };

    let system_prompt = [
        ingest_prompt.as_str(),
        "You are processing a queued Living Archive ingest request for review, not directly mutating trusted wiki knowledge.",
        "Return strict JSON with these top-level keys:",
        "summary, claims, entities, concepts, process_signals, tensions, open_questions, doctrine_alignment, confidence, doctrine_sensitivity, needs_review, review_reason, proposed_pages.",
        "Do not wrap the JSON in markdown fences.",
    ]
    .join("\n\n");

    let reply = execute_provider_service_chat(
        app,
        ProviderServiceChatRequest {
            provider_id: request.provider_id.clone(),
            provider_type: request.provider_type,
            api_base_url: request.api_base_url,
            runtime_node_id: request.runtime_node_id,
            runtime_node_kind: request.runtime_node_kind,
            runtime_node_endpoint: request.runtime_node_endpoint,
            auth_tier: request.auth_tier,
            model: request.model.clone(),
            reasoning_effort: "high".to_string(),
            system_prompt,
            messages: vec![ChatMessageInput {
                role: "user".to_string(),
                content: format!(
                    "Queued at: {queued_at}\nIntent: {intent}\nSource type: {source_type}\nSource role: {}\nSource path: {}\n\nSource content:\n{}",
                    source_role.as_deref().unwrap_or("unknown"),
                    resolved_source.display(),
                    truncated_content
                ),
            }],
        },
    )
    .await?;

    let parsed = serde_json::from_str::<Value>(&reply).unwrap_or_else(|_| {
        json!({
            "summary": reply,
            "claims": [],
            "entities": [],
            "concepts": [],
            "process_signals": [],
            "tensions": [],
            "open_questions": [],
            "doctrine_alignment": "unknown",
            "confidence": "low",
            "doctrine_sensitivity": "medium",
            "needs_review": true,
            "review_reason": "Ingest response was not valid JSON.",
            "proposed_pages": []
        })
    });

    let confidence = normalize_confidence(parsed.get("confidence"));
    let doctrine_sensitivity =
        normalize_doctrine_sensitivity(parsed.get("doctrine_sensitivity"), source_type);
    let proposed_pages = parse_proposed_pages(parsed.get("proposed_pages"));
    let (recommended_tier, recommendation_reason) = evaluate_approval_tier(
        source_type,
        intent,
        &confidence,
        &doctrine_sensitivity,
        &proposed_pages,
    );

    let checked_at = unix_timestamp();
    let artifacts_root = runtime.review_queue_root().join("artifacts");
    let processed_root = runtime.review_queue_root().join("processed");
    fs::create_dir_all(&artifacts_root)
        .map_err(|error| format!("Failed to create archive review artifact root: {error}"))?;
    fs::create_dir_all(&processed_root)
        .map_err(|error| format!("Failed to create archive processed request root: {error}"))?;

    let source_stem = resolved_source
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("source");
    let review_artifact_file = artifacts_root.join(format!(
        "{}-{}.json",
        checked_at.replace(':', "-"),
        slugify(&format!("{source_type}-{source_stem}"))
    ));
    let decision = if recommended_tier == "auto-approve" {
        json!({
            "status": "approved",
            "action": "approve",
            "actorId": "policy.auto",
            "decidedAt": checked_at,
            "tierApplied": "auto-approve",
            "notes": "Auto-approved by archive approval policy."
        })
    } else {
        json!({
            "status": "pending"
        })
    };
    let artifact_payload = json!({
        "checkedAt": checked_at,
        "requestFile": request_path.display().to_string(),
        "sourcePath": resolved_source.display().to_string(),
        "sourceType": source_type,
        "sourceRole": source_role,
        "intent": intent,
        "providerId": request.provider_id,
        "model": request.model,
        "policy": {
            "confidence": confidence,
            "doctrineSensitivity": doctrine_sensitivity,
            "recommendedTier": recommended_tier,
            "recommendationReason": recommendation_reason,
        },
        "decision": decision,
        "result": parsed,
    });
    fs::write(
        &review_artifact_file,
        serde_json::to_string_pretty(&artifact_payload)
            .map_err(|error| format!("Failed to encode archive review artifact: {error}"))?,
    )
    .map_err(|error| format!("Failed to write archive review artifact: {error}"))?;

    let archived_request_file = processed_root.join(
        request_path
            .file_name()
            .ok_or_else(|| "Queued request path is missing a filename.".to_string())?,
    );
    fs::rename(&request_path, &archived_request_file)
        .map_err(|error| format!("Failed to archive processed ingest request: {error}"))?;

    if let Some(connection) = open_archive_db(&runtime)? {
        let _ = connection.execute(
            "INSERT INTO activity_log (ts, action, details, agent_id) VALUES (?1, ?2, ?3, ?4)",
            params![
                checked_at,
                "ingest_review",
                artifact_payload.to_string(),
                "archive-ingest.core"
            ],
        );
    }

    Ok(ArchiveProcessIngestResult {
        request_file: request.request_file,
        archived_request_file: archived_request_file.display().to_string(),
        review_artifact_file: review_artifact_file.display().to_string(),
        summary: parsed
            .get("summary")
            .and_then(Value::as_str)
            .unwrap_or("Review artifact created.")
            .to_string(),
        checked_at,
        review_artifact: parse_review_artifact(review_artifact_file.clone(), &artifact_payload),
    })
}

pub(crate) fn decide_archive_review_artifact(
    app: &AppHandle,
    request: ArchiveReviewDecisionRequest,
) -> Result<ArchiveReviewDecisionResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let artifact_path = resolve_document_path(&runtime, &request.artifact_file)?;
    let raw = fs::read_to_string(&artifact_path)
        .map_err(|error| format!("Failed to read archive review artifact: {error}"))?;
    let mut payload = serde_json::from_str::<Value>(&raw)
        .map_err(|error| format!("Invalid archive review artifact JSON: {error}"))?;

    let recommended_tier = payload
        .get("policy")
        .and_then(|value| value.get("recommendedTier"))
        .and_then(Value::as_str)
        .unwrap_or("strategist-review")
        .to_string();
    let current_status = payload
        .get("decision")
        .and_then(|value| value.get("status"))
        .and_then(Value::as_str)
        .unwrap_or("pending");
    if current_status != "pending" {
        return Err("Archive review artifact already has a final decision.".to_string());
    }

    let action = request.action.as_str();
    if !matches!(action, "approve" | "reject" | "escalate") {
        return Err(
            "Archive review decision action must be approve, reject, or escalate.".to_string(),
        );
    }

    if action == "approve" && recommended_tier == "human-review" && request.actor_id != "human.user"
    {
        return Err(
            "This archive review artifact requires human review and cannot be approved by the Strategist.".to_string(),
        );
    }

    let decided_at = unix_timestamp();
    let resulting_status = match action {
        "approve" => "approved",
        "reject" => "rejected",
        "escalate" => "escalated",
        _ => "pending",
    };
    let tier_applied = if action == "approve" {
        recommended_tier.clone()
    } else if action == "escalate" {
        "human-review".to_string()
    } else {
        recommended_tier.clone()
    };

    let decision_value = json!({
        "status": resulting_status,
        "action": action,
        "actorId": request.actor_id,
        "decidedAt": decided_at,
        "tierApplied": tier_applied,
        "notes": request.notes,
    });

    if let Some(object) = payload.as_object_mut() {
        object.insert("decision".to_string(), decision_value.clone());
    }

    fs::write(
        &artifact_path,
        serde_json::to_string_pretty(&payload).map_err(|error| {
            format!("Failed to encode updated archive review artifact: {error}")
        })?,
    )
    .map_err(|error| format!("Failed to write updated archive review artifact: {error}"))?;

    if let Some(connection) = open_archive_db(&runtime)? {
        let _ = connection.execute(
            "INSERT INTO activity_log (ts, action, details, agent_id) VALUES (?1, ?2, ?3, ?4)",
            params![
                decided_at,
                "ingest_review_decision",
                json!({
                    "artifactFile": artifact_path.display().to_string(),
                    "status": resulting_status,
                    "action": action,
                    "tierApplied": tier_applied,
                    "recommendedTier": recommended_tier,
                })
                .to_string(),
                request.actor_id
            ],
        );
    }

    let summary = payload
        .get("result")
        .and_then(|value| value.get("summary"))
        .and_then(Value::as_str)
        .unwrap_or("Archive review decision recorded.")
        .to_string();

    Ok(ArchiveReviewDecisionResult {
        artifact_file: artifact_path.display().to_string(),
        status: resulting_status.to_string(),
        action: action.to_string(),
        actor_id: request.actor_id,
        decided_at,
        tier_applied,
        summary,
    })
}

pub(crate) fn promote_archive_review_artifact(
    app: &AppHandle,
    request: ArchivePromoteReviewArtifactRequest,
) -> Result<ArchivePromoteReviewArtifactResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let artifact_path = resolve_document_path(&runtime, &request.artifact_file)?;
    let raw = fs::read_to_string(&artifact_path)
        .map_err(|error| format!("Failed to read archive review artifact: {error}"))?;
    let mut payload = serde_json::from_str::<Value>(&raw)
        .map_err(|error| format!("Invalid archive review artifact JSON: {error}"))?;
    let artifact = parse_review_artifact(artifact_path.clone(), &payload);

    if artifact.decision.status != "approved" {
        return Err(
            "Only approved archive review artifacts can be promoted to trusted wiki pages."
                .to_string(),
        );
    }

    let promoted_at = unix_timestamp();
    let artifact_file = artifact_path.display().to_string();
    let mut pages_written = Vec::new();
    let mut skipped_pages = Vec::new();
    let connection = open_archive_db(&runtime)?;
    let default_source_id = source_id_from_path(&artifact.source_path);
    let source_title = PathBuf::from(&artifact.source_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(&artifact.source_path)
        .to_string();
    let backup_root = runtime
        .review_queue_root()
        .join("backups")
        .join(promoted_at.replace(':', "-"));

    for page in artifact.proposed_pages.iter() {
        let title = string_field(page, &["title", "name", "label"]).unwrap_or("Untitled page");
        let page_type = string_field(page, &["type", "page_type", "pageType"]).unwrap_or("unknown");
        let Some(subdir) = wiki_page_subdir(page_type) else {
            skipped_pages.push(ArchiveSkippedPage {
                title: title.to_string(),
                reason: format!("Unsupported trusted wiki page type `{page_type}`."),
            });
            continue;
        };

        let raw_id = string_field(page, &["id", "slug", "page_id", "pageId"]).unwrap_or(title);
        let page_id = slugify(raw_id);
        if page_id.is_empty() {
            skipped_pages.push(ArchiveSkippedPage {
                title: title.to_string(),
                reason: "Page id could not be normalized into a safe slug.".to_string(),
            });
            continue;
        }

        let page_dir = runtime.wiki_root.join(subdir);
        fs::create_dir_all(&page_dir)
            .map_err(|error| format!("Failed to create trusted wiki page directory: {error}"))?;
        let normalized_dir = page_dir
            .canonicalize()
            .map_err(|error| format!("Failed to resolve trusted wiki page directory: {error}"))?;
        let normalized_wiki_root = runtime
            .wiki_root
            .canonicalize()
            .map_err(|error| format!("Failed to resolve trusted wiki root: {error}"))?;
        if !normalized_dir.starts_with(&normalized_wiki_root) {
            return Err(
                "Trusted wiki promotion resolved outside the configured wiki root.".to_string(),
            );
        }

        let page_path = normalized_dir.join(format!("{page_id}.md"));
        let action = if page_path.exists() {
            "updated"
        } else {
            "created"
        }
        .to_string();
        let backup_path = if page_path.exists() {
            fs::create_dir_all(&backup_root).map_err(|error| {
                format!("Failed to create archive promotion backup root: {error}")
            })?;
            let backup_path = backup_root.join(format!("{subdir}-{page_id}.md"));
            fs::copy(&page_path, &backup_path).map_err(|error| {
                format!("Failed to back up existing trusted wiki page: {error}")
            })?;
            Some(backup_path)
        } else {
            None
        };

        let (existing_created_at, existing_body) = if page_path.exists() {
            let existing_raw = fs::read_to_string(&page_path)
                .map_err(|error| format!("Failed to read existing trusted wiki page: {error}"))?;
            let (frontmatter, body, _, _) = parse_frontmatter(&existing_raw);
            let created_at = frontmatter
                .get("created")
                .and_then(Value::as_str)
                .map(ToString::to_string);
            (created_at, Some(body))
        } else {
            (None, None)
        };
        let created_at = existing_created_at.as_deref().unwrap_or(&promoted_at);
        let page_type_normalized = page_type.to_ascii_lowercase();
        let source_ids = merge_source_ids(page, &default_source_id);
        let (content, frontmatter, body) = render_promoted_page(
            page,
            &page_type_normalized,
            &page_id,
            title,
            created_at,
            &artifact.source_path,
            &source_ids,
            &artifact_file,
            &promoted_at,
            existing_body.as_deref(),
        );
        fs::write(&page_path, content)
            .map_err(|error| format!("Failed to write trusted wiki page: {error}"))?;
        let relative_file_path = page_path
            .strip_prefix(&runtime.vault_root)
            .unwrap_or(&page_path)
            .display()
            .to_string();
        let stage = frontmatter
            .get("stage")
            .and_then(Value::as_str)
            .unwrap_or("developing");
        let indexed = if let Some(connection) = connection.as_ref() {
            upsert_promoted_page_index(
                connection,
                PromotedPageIndexInput {
                    page_id: &page_id,
                    page_type: &page_type_normalized,
                    title,
                    file_path: &relative_file_path,
                    stage,
                    frontmatter: &frontmatter,
                    body: &body,
                    source_id: &default_source_id,
                    source_title: &source_title,
                    source_type: &artifact.source_type,
                    source_path: &artifact.source_path,
                    promoted_at: &promoted_at,
                },
            )?;
            true
        } else {
            false
        };

        pages_written.push(ArchivePromotedPage {
            page_type: page_type_normalized,
            page_id,
            title: title.to_string(),
            file_path: relative_file_path,
            merge_mode: if action == "updated" {
                "append-provenance-section".to_string()
            } else {
                "create-page".to_string()
            },
            action,
            backup_path: backup_path.map(|path| path.display().to_string()),
            source_id: default_source_id.clone(),
            indexed,
        });
    }

    if let Some(object) = payload.as_object_mut() {
        object.insert(
            "promotion".to_string(),
            json!({
                "status": if pages_written.is_empty() { "no-op" } else { "promoted" },
                "actorId": request.actor_id,
                "promotedAt": promoted_at,
                "pagesWritten": pages_written.len(),
                "pagesSkipped": skipped_pages.len(),
            }),
        );
    }
    fs::write(
        &artifact_path,
        serde_json::to_string_pretty(&payload).map_err(|error| {
            format!("Failed to encode promoted archive review artifact: {error}")
        })?,
    )
    .map_err(|error| format!("Failed to update promoted archive review artifact: {error}"))?;

    if let Some(connection) = connection.as_ref() {
        let page_ids = pages_written
            .iter()
            .map(|page| page.page_id.clone())
            .collect::<Vec<_>>();
        let _ = connection.execute(
            "INSERT INTO activity_log (ts, action, details, agent_id) VALUES (?1, ?2, ?3, ?4)",
            params![
                promoted_at,
                "trusted_wiki_promote",
                json!({
                    "artifactFile": artifact_file,
                    "pagesWritten": pages_written.len(),
                    "pagesSkipped": skipped_pages.len(),
                    "pageIds": page_ids,
                })
                .to_string(),
                request.actor_id
            ],
        );
    }

    Ok(ArchivePromoteReviewArtifactResult {
        artifact_file,
        promoted_at,
        actor_id: request.actor_id,
        pages_written,
        skipped_pages,
    })
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
