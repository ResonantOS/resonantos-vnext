// Intent citation: docs/architecture/ADR-007-living-archive-boundaries.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md
// Intent citation: docs/architecture/ADR-012-living-archive-approval-policy.md

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use tauri::AppHandle;

use crate::provider_service::{
    execute_provider_service_chat, ChatMessageInput, ProviderServiceChatRequest,
};

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
    pub(crate) snippet: Option<String>,
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

#[derive(Clone, Deserialize)]
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
    pub(crate) verifier_provider_id: Option<String>,
    pub(crate) verifier_provider_type: Option<String>,
    pub(crate) verifier_api_base_url: Option<String>,
    pub(crate) verifier_runtime_node_id: Option<String>,
    pub(crate) verifier_runtime_node_kind: Option<String>,
    pub(crate) verifier_runtime_node_endpoint: Option<String>,
    pub(crate) verifier_auth_tier: Option<String>,
    pub(crate) verifier_model: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveMaintenanceCycleRequest {
    pub(crate) provider_id: String,
    pub(crate) provider_type: String,
    pub(crate) api_base_url: Option<String>,
    pub(crate) runtime_node_id: Option<String>,
    pub(crate) runtime_node_kind: Option<String>,
    pub(crate) runtime_node_endpoint: Option<String>,
    pub(crate) auth_tier: Option<String>,
    pub(crate) model: String,
    pub(crate) verifier_provider_id: Option<String>,
    pub(crate) verifier_provider_type: Option<String>,
    pub(crate) verifier_api_base_url: Option<String>,
    pub(crate) verifier_runtime_node_id: Option<String>,
    pub(crate) verifier_runtime_node_kind: Option<String>,
    pub(crate) verifier_runtime_node_endpoint: Option<String>,
    pub(crate) verifier_auth_tier: Option<String>,
    pub(crate) verifier_model: Option<String>,
    pub(crate) max_requests: Option<usize>,
    pub(crate) auto_promote: Option<bool>,
    pub(crate) actor_id: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveBackgroundCycleRequest {
    pub(crate) provider_id: String,
    pub(crate) provider_type: String,
    pub(crate) api_base_url: Option<String>,
    pub(crate) runtime_node_id: Option<String>,
    pub(crate) runtime_node_kind: Option<String>,
    pub(crate) runtime_node_endpoint: Option<String>,
    pub(crate) auth_tier: Option<String>,
    pub(crate) model: String,
    pub(crate) verifier_provider_id: Option<String>,
    pub(crate) verifier_provider_type: Option<String>,
    pub(crate) verifier_api_base_url: Option<String>,
    pub(crate) verifier_runtime_node_id: Option<String>,
    pub(crate) verifier_runtime_node_kind: Option<String>,
    pub(crate) verifier_runtime_node_endpoint: Option<String>,
    pub(crate) verifier_auth_tier: Option<String>,
    pub(crate) verifier_model: Option<String>,
    pub(crate) max_requests: Option<usize>,
    pub(crate) auto_promote: Option<bool>,
    pub(crate) actor_id: Option<String>,
    pub(crate) root_path: Option<String>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveMaintenanceCycleResult {
    pub(crate) started_at: String,
    pub(crate) finished_at: String,
    pub(crate) processed: Vec<ArchiveProcessIngestResult>,
    pub(crate) promoted: Vec<ArchivePromoteReviewArtifactResult>,
    pub(crate) navigation: ArchiveWikiNavigationRefreshResult,
    pub(crate) lint: ArchiveLintResult,
    pub(crate) skipped: Vec<String>,
    pub(crate) errors: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveBackgroundCycleResult {
    pub(crate) started_at: String,
    pub(crate) finished_at: String,
    pub(crate) scan: ArchiveSourceFolderScanResult,
    pub(crate) queued_request_files: Vec<String>,
    pub(crate) skipped_queue_sources: Vec<String>,
    pub(crate) maintenance: ArchiveMaintenanceCycleResult,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveWikiNavigationRefreshResult {
    pub(crate) refreshed_at: String,
    pub(crate) index_path: String,
    pub(crate) log_path: String,
    pub(crate) pages_indexed: usize,
    pub(crate) activity_entries: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLintFinding {
    pub(crate) severity: String,
    pub(crate) category: String,
    pub(crate) target: String,
    pub(crate) detail: String,
    pub(crate) recommended_action: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLintResult {
    pub(crate) checked_at: String,
    pub(crate) report_path: String,
    pub(crate) pages_checked: usize,
    pub(crate) sources_checked: usize,
    pub(crate) findings: Vec<ArchiveLintFinding>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSemanticLintRequest {
    pub(crate) provider_id: String,
    pub(crate) provider_type: String,
    pub(crate) api_base_url: Option<String>,
    pub(crate) runtime_node_id: Option<String>,
    pub(crate) runtime_node_kind: Option<String>,
    pub(crate) runtime_node_endpoint: Option<String>,
    pub(crate) auth_tier: Option<String>,
    pub(crate) model: String,
    pub(crate) max_candidates: Option<usize>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSemanticLintFinding {
    pub(crate) severity: String,
    pub(crate) target_pages: Vec<String>,
    pub(crate) claim: String,
    pub(crate) conflicting_evidence: String,
    pub(crate) confidence: String,
    pub(crate) recommended_action: String,
    pub(crate) requires_human_review: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveSemanticLintResult {
    pub(crate) checked_at: String,
    pub(crate) report_path: String,
    pub(crate) provider_id: String,
    pub(crate) model: String,
    pub(crate) source_lint_report_path: String,
    pub(crate) candidates_reviewed: usize,
    pub(crate) findings: Vec<ArchiveSemanticLintFinding>,
    pub(crate) summary: String,
    pub(crate) repair_request_files: Vec<String>,
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
    pub(crate) excluded_top_folders: Option<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryPreflightRequest {
    pub(crate) source_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryPreflightCount {
    pub(crate) label: String,
    pub(crate) count: usize,
    pub(crate) size_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryPreflightSample {
    pub(crate) path: String,
    pub(crate) reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryPreflightWarning {
    pub(crate) severity: String,
    pub(crate) title: String,
    pub(crate) detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryRecommendedImportPlan {
    pub(crate) summary: String,
    pub(crate) recommended_action: String,
    pub(crate) auto_excluded_top_folders: Vec<String>,
    pub(crate) ambiguous_top_folders: Vec<String>,
    pub(crate) included_top_folders: Vec<String>,
    pub(crate) approval_note: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryPreflightResult {
    pub(crate) source_path: String,
    pub(crate) exists: bool,
    pub(crate) is_directory: bool,
    pub(crate) obsidian_vault_detected: bool,
    pub(crate) supported_files: usize,
    pub(crate) skipped_files: usize,
    pub(crate) hidden_entries_skipped: usize,
    pub(crate) generated_archive_entries_skipped: usize,
    pub(crate) estimated_import_bytes: u64,
    pub(crate) estimated_managed_storage_bytes: u64,
    pub(crate) supported_by_extension: Vec<ArchiveLibraryPreflightCount>,
    pub(crate) skipped_by_extension: Vec<ArchiveLibraryPreflightCount>,
    pub(crate) supported_by_top_folder: Vec<ArchiveLibraryPreflightCount>,
    pub(crate) skipped_by_top_folder: Vec<ArchiveLibraryPreflightCount>,
    pub(crate) warnings: Vec<ArchiveLibraryPreflightWarning>,
    pub(crate) samples: Vec<ArchiveLibraryPreflightSample>,
    pub(crate) recommended_plan: ArchiveLibraryRecommendedImportPlan,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryClassificationReviewRequest {
    pub(crate) classification_manifest_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryClassificationReview {
    pub(crate) artifact_type: String,
    pub(crate) created_at: String,
    pub(crate) actor_id: String,
    pub(crate) library_id: String,
    pub(crate) library_name: String,
    pub(crate) original_path: String,
    pub(crate) canonical_root: String,
    pub(crate) classification_status: String,
    pub(crate) metadata_standard: String,
    pub(crate) structural_changes_allowed: bool,
    pub(crate) requires_human_approval_before_move: bool,
    pub(crate) records_total: usize,
    pub(crate) proposals_previewed: usize,
    pub(crate) remaining_for_full_review: usize,
    pub(crate) proposals: Vec<ArchiveClassificationProposal>,
    pub(crate) manifest_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryReorganisationPlanRequest {
    pub(crate) classification_manifest_path: String,
    pub(crate) actor_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryReorganisationMove {
    pub(crate) source_id: String,
    pub(crate) title: String,
    pub(crate) proposed_target: String,
    pub(crate) source_path: String,
    pub(crate) destination_path: Option<String>,
    pub(crate) action: String,
    pub(crate) confidence: String,
    pub(crate) reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveLibraryReorganisationPlan {
    pub(crate) planned_at: String,
    pub(crate) actor_id: String,
    pub(crate) library_id: String,
    pub(crate) library_name: String,
    pub(crate) plan_path: String,
    pub(crate) rollback_plan_path: String,
    pub(crate) audit_log_path: String,
    pub(crate) requires_approval: bool,
    pub(crate) structural_changes_allowed: bool,
    pub(crate) moves_planned: usize,
    pub(crate) tag_only_count: usize,
    pub(crate) blocked_count: usize,
    pub(crate) entries: Vec<ArchiveLibraryReorganisationMove>,
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
    let allowed = archive_path_is_allowed(runtime, &normalized);
    if !allowed {
        return Err(format!(
            "Archive document path `{}` is outside the allowed archive roots.",
            normalized.display()
        ));
    }
    Ok(normalized)
}

fn validate_intake_file_name(file_name: &str) -> Result<(), String> {
    let file_name_path = Path::new(file_name);
    if file_name_path.is_absolute() || file_name.contains('/') || file_name.contains('\\') {
        return Err(
            "Archive intake artifact file name must not contain path separators.".to_string(),
        );
    }
    if file_name_path.file_name().and_then(|value| value.to_str()) != Some(file_name) {
        return Err("Archive intake artifact file name must be a plain file name.".to_string());
    }
    Ok(())
}

fn archive_path_is_allowed(runtime: &ArchiveRuntime, normalized_path: &Path) -> bool {
    runtime
        .allowed_roots()
        .into_iter()
        .filter_map(|root| root.canonicalize().ok())
        .any(|root| normalized_path == root || normalized_path.starts_with(&root))
}

fn resolve_source_path(runtime: &ArchiveRuntime, requested_path: &str) -> PathBuf {
    let candidate = PathBuf::from(requested_path);
    if candidate.is_absolute() {
        candidate
    } else {
        runtime.vault_root.join(candidate)
    }
}

fn resolve_allowed_source_path(
    runtime: &ArchiveRuntime,
    requested_path: &str,
) -> Result<PathBuf, String> {
    let resolved = resolve_source_path(runtime, requested_path);
    let normalized = resolved
        .canonicalize()
        .map_err(|error| format!("Failed to resolve archive source path: {error}"))?;
    if !archive_path_is_allowed(runtime, &normalized) {
        return Err(format!(
            "Archive source path `{}` is outside the allowed archive roots.",
            normalized.display()
        ));
    }
    Ok(normalized)
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
    promote_archive_review_artifact, run_archive_maintenance_cycle,
};
#[cfg(test)]
use archive_review::{
    evaluate_approval_tier, merge_promoted_page_body, render_promoted_page,
    upsert_promoted_page_index, wiki_page_subdir, PromotedPageIndexInput,
};

mod archive_source_library;
use archive_source_library::collect_imported_library_manifests;
pub(crate) use archive_source_library::{
    import_archive_library, list_imported_archive_libraries, preflight_archive_library_import,
    read_archive_library_classification_review, scan_archive_source_folders,
    write_archive_library_reorganisation_plan,
};
#[cfg(test)]
use archive_source_library::{import_archive_library_with_runtime, supported_source_file};

fn source_hash(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path)
        .map_err(|error| format!("Failed to read source file {}: {error}", path.display()))?;
    Ok(format!("sha256:{}", sha256_hex(&bytes)))
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
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
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create Living Archive database root: {error}"))?;
    }
    let connection = Connection::open(db_path)
        .map_err(|error| format!("Failed to open Living Archive database: {error}"))?;
    initialize_archive_db_schema(&connection)?;
    Ok(Some(connection))
}

fn initialize_archive_db_schema(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS pages (
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
            CREATE TABLE IF NOT EXISTS sources (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                type TEXT NOT NULL,
                raw_path TEXT NOT NULL UNIQUE,
                hash TEXT,
                added_at TEXT NOT NULL,
                processed INTEGER DEFAULT 0,
                metadata TEXT
            );
            CREATE TABLE IF NOT EXISTS links (
                source_page_id TEXT NOT NULL,
                target_page_id TEXT NOT NULL,
                link_type TEXT DEFAULT 'wikilink',
                created_at TEXT,
                PRIMARY KEY (source_page_id, target_page_id, link_type)
            );
            CREATE TABLE IF NOT EXISTS page_sources (
                page_id TEXT NOT NULL,
                source_id TEXT NOT NULL,
                PRIMARY KEY (page_id, source_id)
            );
            CREATE TABLE IF NOT EXISTS activity_log (
                ts TEXT NOT NULL,
                action TEXT NOT NULL,
                page_id TEXT,
                source_id TEXT,
                agent_id TEXT,
                details TEXT,
                errors TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_pages_type ON pages(type);
            CREATE INDEX IF NOT EXISTS idx_pages_updated ON pages(updated);
            CREATE INDEX IF NOT EXISTS idx_sources_processed ON sources(processed);
            CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_log(ts);
            ",
        )
        .map_err(|error| format!("Failed to initialize Living Archive database schema: {error}"))
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

struct ArchiveWikiNavigationPage {
    page_id: String,
    page_type: String,
    title: String,
    file_path: String,
    stage: Option<String>,
    updated: String,
    content: String,
    snippet: String,
}

struct ArchiveWikiNavigationLogEntry {
    ts: String,
    action: String,
    page_id: Option<String>,
    source_id: Option<String>,
    agent_id: Option<String>,
    errors: Option<String>,
}

fn markdown_escape_inline(value: &str) -> String {
    value.replace('|', "\\|").replace('\n', " ")
}

fn collect_navigation_pages(
    connection: &Connection,
) -> Result<Vec<ArchiveWikiNavigationPage>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, type, title, file_path, stage, updated, content
             FROM pages
             ORDER BY type ASC, title ASC",
        )
        .map_err(|error| format!("Failed to prepare archive wiki index query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            let content: String = row.get::<_, Option<String>>("content")?.unwrap_or_default();
            Ok(ArchiveWikiNavigationPage {
                page_id: row.get("id")?,
                page_type: row.get("type")?,
                title: row.get("title")?,
                file_path: row.get("file_path")?,
                stage: row.get("stage")?,
                updated: row.get("updated")?,
                snippet: content
                    .lines()
                    .filter(|line| !line.trim().is_empty())
                    .take(2)
                    .collect::<Vec<_>>()
                    .join(" "),
                content,
            })
        })
        .map_err(|error| format!("Failed to query archive wiki index pages: {error}"))?;

    let mut pages = Vec::new();
    for row in rows {
        pages.push(row.map_err(|error| format!("Invalid archive wiki index row: {error}"))?);
    }
    Ok(pages)
}

fn collect_navigation_log_entries(
    connection: &Connection,
) -> Result<Vec<ArchiveWikiNavigationLogEntry>, String> {
    let mut statement = connection
        .prepare(
            "SELECT ts, action, page_id, source_id, agent_id, errors
             FROM activity_log
             ORDER BY ts DESC
             LIMIT 200",
        )
        .map_err(|error| format!("Failed to prepare archive wiki log query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(ArchiveWikiNavigationLogEntry {
                ts: row.get("ts")?,
                action: row.get("action")?,
                page_id: row.get("page_id")?,
                source_id: row.get("source_id")?,
                agent_id: row.get("agent_id")?,
                errors: row.get("errors")?,
            })
        })
        .map_err(|error| format!("Failed to query archive wiki log entries: {error}"))?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|error| format!("Invalid archive wiki log row: {error}"))?);
    }
    entries.reverse();
    Ok(entries)
}

fn render_archive_index_markdown(
    refreshed_at: &str,
    pages: &[ArchiveWikiNavigationPage],
) -> String {
    let mut by_type = BTreeMap::<String, Vec<&ArchiveWikiNavigationPage>>::new();
    for page in pages {
        by_type
            .entry(page.page_type.clone())
            .or_default()
            .push(page);
    }

    let mut output = format!(
        "# Living Archive Index\n\nGenerated: `{refreshed_at}`  \nPages indexed: `{}`\n\nThis file is generated by ResonantOS from trusted AI Memory pages. Do not edit it manually; edit or promote wiki pages through the Living Archive flow.\n",
        pages.len()
    );

    for (page_type, typed_pages) in by_type {
        output.push_str(&format!("\n## {}\n\n", markdown_escape_inline(&page_type)));
        output.push_str("| Page | ID | Stage | Updated | Summary |\n");
        output.push_str("| --- | --- | --- | --- | --- |\n");
        for page in typed_pages {
            output.push_str(&format!(
                "| [{}]({}) | `{}` | {} | `{}` | {} |\n",
                markdown_escape_inline(&page.title),
                page.file_path.replace(' ', "%20"),
                markdown_escape_inline(&page.page_id),
                markdown_escape_inline(page.stage.as_deref().unwrap_or("unknown")),
                markdown_escape_inline(&page.updated),
                markdown_escape_inline(&page.snippet.chars().take(220).collect::<String>())
            ));
        }
    }

    output
}

fn render_archive_log_markdown(
    refreshed_at: &str,
    entries: &[ArchiveWikiNavigationLogEntry],
) -> String {
    let mut output = format!(
        "# Living Archive Log\n\nGenerated: `{refreshed_at}`  \nEntries shown: `{}`\n\nThis file is generated from the append-only archive activity log. It gives the LLM and the human a chronological trace of recent archive evolution.\n",
        entries.len()
    );

    for entry in entries {
        let target = entry
            .page_id
            .as_deref()
            .or(entry.source_id.as_deref())
            .unwrap_or("archive");
        output.push_str(&format!(
            "\n## [{}] {} | {}\n\n- actor: `{}`\n- target: `{}`\n",
            markdown_escape_inline(&entry.ts),
            markdown_escape_inline(&entry.action),
            markdown_escape_inline(target),
            markdown_escape_inline(entry.agent_id.as_deref().unwrap_or("system")),
            markdown_escape_inline(target)
        ));
        if let Some(errors) = entry.errors.as_deref().filter(|value| !value.is_empty()) {
            output.push_str(&format!("- errors: `{}`\n", markdown_escape_inline(errors)));
        }
    }

    output
}

fn unix_seconds(value: &str) -> Option<u64> {
    value.strip_prefix("unix:")?.parse::<u64>().ok()
}

fn extract_markdown_wikilinks(content: &str) -> Vec<String> {
    let mut links = Vec::new();
    let mut remaining = content;
    while let Some(start) = remaining.find("[[") {
        let after_start = &remaining[start + 2..];
        let Some(end) = after_start.find("]]") else {
            break;
        };
        let raw_target = &after_start[..end];
        let target = raw_target
            .split('|')
            .next()
            .unwrap_or(raw_target)
            .split('#')
            .next()
            .unwrap_or(raw_target)
            .trim();
        if !target.is_empty() && !links.iter().any(|link| link == target) {
            links.push(target.to_string());
        }
        remaining = &after_start[end + 2..];
    }
    links.sort();
    links
}

fn finding(
    severity: &str,
    category: &str,
    target: impl Into<String>,
    detail: impl Into<String>,
    recommended_action: impl Into<String>,
) -> ArchiveLintFinding {
    ArchiveLintFinding {
        severity: severity.to_string(),
        category: category.to_string(),
        target: target.into(),
        detail: detail.into(),
        recommended_action: recommended_action.into(),
    }
}

fn collect_lint_findings(
    pages: &[ArchiveWikiNavigationPage],
    sources_unprocessed: Vec<(String, String, String)>,
    checked_at: &str,
) -> Vec<ArchiveLintFinding> {
    let mut findings = Vec::new();
    let now = unix_seconds(checked_at).unwrap_or(0);
    let mut normalized_titles = BTreeMap::<String, Vec<&ArchiveWikiNavigationPage>>::new();
    let mut inbound_counts = BTreeMap::<String, usize>::new();
    let mut title_to_page = BTreeMap::<String, &ArchiveWikiNavigationPage>::new();

    for page in pages {
        let normalized = slugify(&page.title);
        normalized_titles
            .entry(normalized.clone())
            .or_default()
            .push(page);
        title_to_page.insert(normalized, page);
    }

    for page in pages {
        for link in extract_markdown_wikilinks(&page.content) {
            let target = slugify(&link);
            *inbound_counts.entry(target).or_insert(0) += 1;
        }
    }

    for page in pages {
        let page_key = slugify(&page.title);
        let inbound_count = inbound_counts.get(&page_key).copied().unwrap_or(0);
        let outbound_links = extract_markdown_wikilinks(&page.content);
        if inbound_count == 0 && outbound_links.is_empty() && pages.len() > 1 {
            findings.push(finding(
                "warning",
                "orphan-page",
                &page.file_path,
                format!("`{}` has no detected inbound or outbound wikilinks.", page.title),
                "Ask the archive lint/ingest agent to propose links to related pages or mark the page as intentionally standalone.",
            ));
        } else if outbound_links.is_empty() && !matches!(page.page_type.as_str(), "summary") {
            findings.push(finding(
                "info",
                "missing-wikilinks",
                &page.file_path,
                format!("`{}` has no outgoing wikilinks in the indexed content.", page.title),
                "Suggest Obsidian-style wikilinks for people, concepts, projects, protocols, and source pages.",
            ));
        }

        if let Some(updated) = unix_seconds(&page.updated) {
            let stale_after_seconds = 90 * 24 * 60 * 60;
            if now.saturating_sub(updated) > stale_after_seconds {
                findings.push(finding(
                    "info",
                    "stale-page",
                    &page.file_path,
                    format!("`{}` has not been updated in more than 90 days.", page.title),
                    "Queue the page for refresh only if newer source material exists or the page is important to active work.",
                ));
            }
        }

        let lowered = page.content.to_ascii_lowercase();
        if lowered.contains("contradict")
            || lowered.contains("conflict")
            || lowered.contains("tension")
            || lowered.contains("disagree")
        {
            findings.push(finding(
                "warning",
                "contradiction-candidate",
                &page.file_path,
                format!("`{}` contains tension/conflict language in indexed content.", page.title),
                "Run provider-backed contradiction review before promoting synthesis based on this page.",
            ));
        }
    }

    for (normalized, matches) in normalized_titles {
        if matches.len() > 1 {
            findings.push(finding(
                "warning",
                "duplicate-title",
                normalized,
                format!(
                    "{} pages normalize to the same title: {}",
                    matches.len(),
                    matches
                        .iter()
                        .map(|page| page.file_path.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                "Review whether these pages should be merged, aliased, or made more specific.",
            ));
        }
    }

    for (source_id, title, raw_path) in sources_unprocessed {
        findings.push(finding(
            "warning",
            "unprocessed-source",
            raw_path,
            format!("Source `{title}` remains unprocessed in the archive index."),
            format!("Queue source `{source_id}` for ingest review or mark it intentionally out of scope."),
        ));
    }

    for page in pages {
        let page_key = slugify(&page.title);
        if !title_to_page.contains_key(&page_key) {
            findings.push(finding(
                "info",
                "index-mismatch",
                &page.file_path,
                format!(
                    "`{}` could not be resolved in the lint title index.",
                    page.title
                ),
                "Refresh wiki navigation and re-run lint.",
            ));
        }
    }

    findings
}

fn render_archive_lint_report(
    checked_at: &str,
    pages_checked: usize,
    sources_checked: usize,
    findings: &[ArchiveLintFinding],
) -> String {
    let mut output = format!(
        "# Living Archive Lint Report\n\nChecked: `{checked_at}`  \nPages checked: `{pages_checked}`  \nSources checked: `{sources_checked}`  \nFindings: `{}`\n\nThis report is generated by ResonantOS. It identifies maintenance work; it does not mutate trusted wiki knowledge.\n",
        findings.len()
    );
    for finding in findings {
        output.push_str(&format!(
            "\n## [{}] {} | {}\n\n- target: `{}`\n- detail: {}\n- recommended action: {}\n",
            markdown_escape_inline(&finding.severity),
            markdown_escape_inline(&finding.category),
            markdown_escape_inline(&finding.target),
            markdown_escape_inline(&finding.target),
            markdown_escape_inline(&finding.detail),
            markdown_escape_inline(&finding.recommended_action)
        ));
    }
    output
}

pub(crate) fn lint_archive(app: &AppHandle) -> Result<ArchiveLintResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let connection = open_archive_db(&runtime)?
        .ok_or_else(|| "Living Archive database is unavailable.".to_string())?;
    let checked_at = unix_timestamp();
    let pages = collect_navigation_pages(&connection)?;
    let mut source_statement = connection
        .prepare(
            "SELECT id, title, raw_path FROM sources WHERE processed = 0 ORDER BY added_at DESC LIMIT 200",
        )
        .map_err(|error| format!("Failed to prepare archive lint source query: {error}"))?;
    let source_rows = source_statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>("id")?,
                row.get::<_, String>("title")?,
                row.get::<_, String>("raw_path")?,
            ))
        })
        .map_err(|error| format!("Failed to run archive lint source query: {error}"))?;
    let mut sources = Vec::new();
    for row in source_rows {
        sources.push(row.map_err(|error| format!("Invalid archive lint source row: {error}"))?);
    }

    let findings = collect_lint_findings(&pages, sources.clone(), &checked_at);
    let report_root = runtime.review_queue_root().join("lint");
    fs::create_dir_all(&report_root)
        .map_err(|error| format!("Failed to create archive lint report root: {error}"))?;
    let report_path = report_root.join(format!("{}-lint-report.md", checked_at.replace(':', "-")));
    fs::write(
        &report_path,
        render_archive_lint_report(&checked_at, pages.len(), sources.len(), &findings),
    )
    .map_err(|error| format!("Failed to write archive lint report: {error}"))?;

    let _ = connection.execute(
        "INSERT INTO activity_log (ts, action, details, agent_id) VALUES (?1, ?2, ?3, ?4)",
        params![
            checked_at,
            "archive_lint",
            json!({
                "reportPath": report_path.display().to_string(),
                "pagesChecked": pages.len(),
                "sourcesChecked": sources.len(),
                "findings": findings.len(),
            })
            .to_string(),
            "archive-maintenance.core"
        ],
    );

    Ok(ArchiveLintResult {
        checked_at,
        report_path: report_path.display().to_string(),
        pages_checked: pages.len(),
        sources_checked: sources.len(),
        findings,
    })
}

fn semantic_lint_candidates<'a>(
    pages: &'a [ArchiveWikiNavigationPage],
    lint: &ArchiveLintResult,
    max_candidates: usize,
) -> Vec<&'a ArchiveWikiNavigationPage> {
    let contradiction_targets = lint
        .findings
        .iter()
        .filter(|finding| finding.category == "contradiction-candidate")
        .map(|finding| finding.target.as_str())
        .collect::<Vec<_>>();
    let mut selected = Vec::new();
    for page in pages {
        let lowered = page.content.to_ascii_lowercase();
        let is_target = contradiction_targets
            .iter()
            .any(|target| *target == page.file_path);
        let has_signal = lowered.contains("contradict")
            || lowered.contains("conflict")
            || lowered.contains("tension")
            || lowered.contains("disagree")
            || lowered.contains("however")
            || lowered.contains("but ");
        if is_target || has_signal {
            selected.push(page);
        }
        if selected.len() >= max_candidates {
            break;
        }
    }
    selected
}

fn trim_semantic_lint_content(content: &str) -> String {
    const MAX_CHARS: usize = 4_000;
    if content.chars().count() <= MAX_CHARS {
        return content.to_string();
    }
    format!(
        "{}\n[Semantic lint candidate truncated]",
        content.chars().take(MAX_CHARS).collect::<String>()
    )
}

fn parse_semantic_lint_findings(value: &Value) -> Vec<ArchiveSemanticLintFinding> {
    value
        .get("findings")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|finding| {
            let target_pages = finding
                .get("target_pages")
                .or_else(|| finding.get("targetPages"))
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            ArchiveSemanticLintFinding {
                severity: finding
                    .get("severity")
                    .and_then(Value::as_str)
                    .unwrap_or("warning")
                    .to_string(),
                target_pages,
                claim: finding
                    .get("claim")
                    .and_then(Value::as_str)
                    .unwrap_or("Semantic lint finding did not include a claim.")
                    .to_string(),
                conflicting_evidence: finding
                    .get("conflicting_evidence")
                    .or_else(|| finding.get("conflictingEvidence"))
                    .and_then(Value::as_str)
                    .unwrap_or("No conflicting evidence was provided.")
                    .to_string(),
                confidence: finding
                    .get("confidence")
                    .and_then(Value::as_str)
                    .unwrap_or("medium")
                    .to_string(),
                recommended_action: finding
                    .get("recommended_action")
                    .or_else(|| finding.get("recommendedAction"))
                    .and_then(Value::as_str)
                    .unwrap_or("Review the candidate pages before using them in synthesis.")
                    .to_string(),
                requires_human_review: finding
                    .get("requires_human_review")
                    .or_else(|| finding.get("requiresHumanReview"))
                    .and_then(Value::as_bool)
                    .unwrap_or(true),
            }
        })
        .collect()
}

fn render_semantic_lint_report(result: &ArchiveSemanticLintResult) -> String {
    let mut output = format!(
        "# Living Archive Semantic Lint Report\n\nChecked: `{}`  \nProvider: `{}`  \nModel: `{}`  \nCandidates reviewed: `{}`  \nFindings: `{}`  \nSource deterministic lint: `{}`\n\n{}\n",
        result.checked_at,
        result.provider_id,
        result.model,
        result.candidates_reviewed,
        result.findings.len(),
        result.source_lint_report_path,
        result.summary
    );
    for finding in &result.findings {
        output.push_str(&format!(
            "\n## [{}] {}\n\n- pages: `{}`\n- confidence: `{}`\n- requires human review: `{}`\n- conflicting evidence: {}\n- recommended action: {}\n",
            markdown_escape_inline(&finding.severity),
            markdown_escape_inline(&finding.claim),
            markdown_escape_inline(&finding.target_pages.join(", ")),
            markdown_escape_inline(&finding.confidence),
            finding.requires_human_review,
            markdown_escape_inline(&finding.conflicting_evidence),
            markdown_escape_inline(&finding.recommended_action)
        ));
    }
    output
}

pub(crate) async fn semantic_lint_archive(
    app: &AppHandle,
    request: ArchiveSemanticLintRequest,
) -> Result<ArchiveSemanticLintResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    let connection = open_archive_db(&runtime)?
        .ok_or_else(|| "Living Archive database is unavailable.".to_string())?;
    let lint = lint_archive(app)?;
    let pages = collect_navigation_pages(&connection)?;
    let max_candidates = request.max_candidates.unwrap_or(6).clamp(1, 12);
    let candidates = semantic_lint_candidates(&pages, &lint, max_candidates);
    let checked_at = unix_timestamp();
    let report_root = runtime.review_queue_root().join("lint").join("semantic");
    fs::create_dir_all(&report_root)
        .map_err(|error| format!("Failed to create semantic archive lint root: {error}"))?;
    let report_path = report_root.join(format!(
        "{}-semantic-lint-report.md",
        checked_at.replace(':', "-")
    ));

    if candidates.is_empty() {
        let result = ArchiveSemanticLintResult {
            checked_at: checked_at.clone(),
            report_path: report_path.display().to_string(),
            provider_id: request.provider_id,
            model: request.model,
            source_lint_report_path: lint.report_path,
            candidates_reviewed: 0,
            findings: Vec::new(),
            summary: "No contradiction candidates were identified by deterministic lint."
                .to_string(),
            repair_request_files: Vec::new(),
        };
        fs::write(&report_path, render_semantic_lint_report(&result))
            .map_err(|error| format!("Failed to write semantic archive lint report: {error}"))?;
        return Ok(result);
    }

    let candidate_payload = candidates
        .iter()
        .map(|page| {
            json!({
                "title": page.title,
                "pageType": page.page_type,
                "filePath": page.file_path,
                "updated": page.updated,
                "content": trim_semantic_lint_content(&page.content),
            })
        })
        .collect::<Vec<_>>();
    let system_prompt = [
        "You are the Living Archive Semantic Lint Reviewer.",
        "Your task is to challenge candidate wiki pages for real contradictions, stale claims, ambiguous synthesis, or claims that require human review.",
        "Do not rewrite pages. Do not approve changes. Produce a reviewable report only.",
        "Return strict JSON with keys: summary, findings.",
        "Each finding must include: severity, target_pages, claim, conflicting_evidence, confidence, recommended_action, requires_human_review.",
        "Use requires_human_review=true for identity-bearing, doctrine-sensitive, low-confidence, or broad synthesis conflicts.",
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
                content: serde_json::to_string_pretty(&json!({
                    "deterministicLintReport": lint.report_path,
                    "deterministicFindings": lint.findings,
                    "candidatePages": candidate_payload,
                }))
                .map_err(|error| format!("Failed to encode semantic lint prompt: {error}"))?,
            }],
        },
    )
    .await?;
    let parsed = serde_json::from_str::<Value>(&reply).unwrap_or_else(|_| {
        json!({
            "summary": "Semantic lint provider did not return valid JSON.",
            "findings": [{
                "severity": "warning",
                "target_pages": [],
                "claim": "Provider response was not valid JSON.",
                "conflicting_evidence": reply,
                "confidence": "low",
                "recommended_action": "Retry semantic lint or inspect the raw provider response.",
                "requires_human_review": true
            }]
        })
    });
    let mut result = ArchiveSemanticLintResult {
        checked_at: checked_at.clone(),
        report_path: report_path.display().to_string(),
        provider_id: request.provider_id,
        model: request.model,
        source_lint_report_path: lint.report_path,
        candidates_reviewed: candidates.len(),
        findings: parse_semantic_lint_findings(&parsed),
        summary: parsed
            .get("summary")
            .and_then(Value::as_str)
            .unwrap_or("Semantic lint completed.")
            .to_string(),
        repair_request_files: Vec::new(),
    };
    fs::write(&report_path, render_semantic_lint_report(&result))
        .map_err(|error| format!("Failed to write semantic archive lint report: {error}"))?;

    if !result.findings.is_empty() {
        let repair_source_path = report_path.with_extension("repair-source.json");
        fs::write(
            &repair_source_path,
            serde_json::to_string_pretty(&json!({
                "schemaVersion": 1,
                "artifactType": "semantic-lint-repair-source",
                "checkedAt": result.checked_at,
                "providerId": result.provider_id,
                "model": result.model,
                "sourceLintReportPath": result.source_lint_report_path,
                "semanticReportPath": result.report_path,
                "summary": result.summary,
                "findings": result.findings,
                "instruction": "Create conservative wiki repair proposals. Do not erase prior claims; add provenance-backed corrections, tensions, and open questions. Escalate identity-bearing, doctrine-sensitive, low-confidence, or destructive repairs to human review."
            }))
            .map_err(|error| format!("Failed to encode semantic repair source: {error}"))?,
        )
        .map_err(|error| format!("Failed to write semantic repair source: {error}"))?;

        let repair_request = queue_archive_ingest_request(
            app,
            ArchiveIngestRequestRecord {
                actor_id: "archive-semantic-lint.ai".to_string(),
                source_path: repair_source_path.display().to_string(),
                source_type: "semantic-lint".to_string(),
                source_role: Some("ai-memory-maintenance".to_string()),
                intent: "repair-wiki-pages".to_string(),
                provenance: Some(json!({
                    "origin": "archive-semantic-lint",
                    "semanticReportPath": result.report_path,
                    "findings": result.findings.len(),
                })),
            },
        )?;
        result
            .repair_request_files
            .push(repair_request.request_file);
    }

    let _ = connection.execute(
        "INSERT INTO activity_log (ts, action, details, agent_id) VALUES (?1, ?2, ?3, ?4)",
        params![
            checked_at,
            "archive_semantic_lint",
            json!({
                "reportPath": result.report_path,
                "candidatesReviewed": result.candidates_reviewed,
                "findings": result.findings.len(),
                "providerId": result.provider_id,
                "model": result.model,
            })
            .to_string(),
            "archive-maintenance.ai"
        ],
    );

    Ok(result)
}

pub(crate) fn refresh_archive_wiki_navigation(
    app: &AppHandle,
) -> Result<ArchiveWikiNavigationRefreshResult, String> {
    let runtime = ArchiveRuntime::resolve(app)?;
    fs::create_dir_all(&runtime.wiki_root)
        .map_err(|error| format!("Failed to create archive wiki root: {error}"))?;
    let connection = open_archive_db(&runtime)?
        .ok_or_else(|| "Living Archive database is unavailable.".to_string())?;
    let refreshed_at = unix_timestamp();
    let pages = collect_navigation_pages(&connection)?;
    let entries = collect_navigation_log_entries(&connection)?;
    let index_path = runtime.wiki_root.join("index.md");
    let log_path = runtime.wiki_root.join("log.md");
    fs::write(
        &index_path,
        render_archive_index_markdown(&refreshed_at, &pages),
    )
    .map_err(|error| format!("Failed to write Living Archive index.md: {error}"))?;
    fs::write(
        &log_path,
        render_archive_log_markdown(&refreshed_at, &entries),
    )
    .map_err(|error| format!("Failed to write Living Archive log.md: {error}"))?;

    let _ = connection.execute(
        "INSERT INTO activity_log (ts, action, details, agent_id) VALUES (?1, ?2, ?3, ?4)",
        params![
            refreshed_at,
            "wiki_navigation_refresh",
            json!({
                "indexPath": index_path.display().to_string(),
                "logPath": log_path.display().to_string(),
                "pagesIndexed": pages.len(),
                "activityEntries": entries.len(),
            })
            .to_string(),
            "archive-maintenance.core"
        ],
    );

    Ok(ArchiveWikiNavigationRefreshResult {
        refreshed_at,
        index_path: index_path.display().to_string(),
        log_path: log_path.display().to_string(),
        pages_indexed: pages.len(),
        activity_entries: entries.len(),
    })
}

pub(crate) async fn run_archive_background_cycle(
    app: &AppHandle,
    request: ArchiveBackgroundCycleRequest,
) -> Result<ArchiveBackgroundCycleResult, String> {
    let started_at = unix_timestamp();
    let scan = scan_archive_source_folders(
        app,
        ArchiveSourceFolderScanRequest {
            root_path: request.root_path.clone(),
        },
    )?;
    let queued = list_archive_ingest_requests(app)?;
    let mut already_queued = queued
        .iter()
        .map(|item| item.source_path.clone())
        .collect::<HashSet<_>>();
    let mut queued_request_files = Vec::new();
    let mut skipped_queue_sources = Vec::new();

    for record in scan
        .records
        .iter()
        .filter(|record| record.status == "new" || record.status == "changed")
    {
        if already_queued.contains(&record.absolute_path) || already_queued.contains(&record.path) {
            skipped_queue_sources.push(format!("Already queued: {}", record.path));
            continue;
        }
        let result = queue_archive_ingest_request(
            app,
            ArchiveIngestRequestRecord {
                actor_id: "archive-background-sync.core".to_string(),
                source_path: record.absolute_path.clone(),
                source_type: record.source_type.clone(),
                source_role: Some(record.root_role.clone()),
                intent: if record.status == "changed" {
                    "review-and-reingest".to_string()
                } else {
                    "review-and-ingest".to_string()
                },
                provenance: Some(json!({
                    "origin": "archive-background-cycle",
                    "status": record.status,
                    "hash": record.hash,
                    "previousHash": record.previous_hash,
                    "modifiedAt": record.modified_at,
                    "rootRole": record.root_role,
                    "rootSubtype": record.root_subtype,
                })),
            },
        )?;
        already_queued.insert(record.absolute_path.clone());
        queued_request_files.push(result.request_file);
    }

    let maintenance = run_archive_maintenance_cycle(
        app,
        ArchiveMaintenanceCycleRequest {
            provider_id: request.provider_id,
            provider_type: request.provider_type,
            api_base_url: request.api_base_url,
            runtime_node_id: request.runtime_node_id,
            runtime_node_kind: request.runtime_node_kind,
            runtime_node_endpoint: request.runtime_node_endpoint,
            auth_tier: request.auth_tier,
            model: request.model,
            verifier_provider_id: request.verifier_provider_id,
            verifier_provider_type: request.verifier_provider_type,
            verifier_api_base_url: request.verifier_api_base_url,
            verifier_runtime_node_id: request.verifier_runtime_node_id,
            verifier_runtime_node_kind: request.verifier_runtime_node_kind,
            verifier_runtime_node_endpoint: request.verifier_runtime_node_endpoint,
            verifier_auth_tier: request.verifier_auth_tier,
            verifier_model: request.verifier_model,
            max_requests: request.max_requests,
            auto_promote: request.auto_promote,
            actor_id: request.actor_id,
        },
    )
    .await?;

    Ok(ArchiveBackgroundCycleResult {
        started_at,
        finished_at: unix_timestamp(),
        scan,
        queued_request_files,
        skipped_queue_sources,
        maintenance,
    })
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

const ARCHIVE_SEARCH_STOPWORDS: &[&str] = &[
    "about", "after", "again", "also", "and", "are", "can", "could", "did", "does", "for", "from",
    "have", "how", "into", "know", "more", "not", "that", "the", "this", "what", "when", "where",
    "which", "who", "why", "with", "you", "your",
];

fn archive_search_terms(query: &str) -> Vec<String> {
    let mut terms = query
        .split(|character: char| !character.is_alphanumeric())
        .map(|term| term.to_lowercase())
        .filter(|term| term.len() >= 3 && !ARCHIVE_SEARCH_STOPWORDS.contains(&term.as_str()))
        .collect::<Vec<_>>();
    terms.sort();
    terms.dedup();
    if terms.is_empty() {
        let compact = query.trim().to_lowercase();
        if !compact.is_empty() {
            terms.push(compact);
        }
    }
    terms
}

fn text_source_extension(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_lowercase())
            .as_deref(),
        Some("md")
            | Some("markdown")
            | Some("txt")
            | Some("rtf")
            | Some("csv")
            | Some("json")
            | Some("yaml")
            | Some("yml")
            | Some("html")
            | Some("htm")
    )
}

fn source_excerpt_for_terms(content: &str, terms: &[String]) -> String {
    let matching_lines = content
        .lines()
        .filter(|line| {
            let lower = line.to_lowercase();
            terms.iter().any(|term| lower.contains(term))
        })
        .take(5)
        .collect::<Vec<_>>();
    let excerpt = if matching_lines.is_empty() {
        content.lines().take(5).collect::<Vec<_>>().join(" ")
    } else {
        matching_lines.join(" ")
    };
    let compact = excerpt.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() > 700 {
        format!("{}...", compact.chars().take(700).collect::<String>())
    } else {
        compact
    }
}

fn imported_source_search(
    runtime: &ArchiveRuntime,
    query: &str,
    limit: usize,
    existing_source_ids: &HashSet<String>,
) -> Result<Vec<ArchiveSearchSourceHit>, String> {
    let terms = archive_search_terms(query);
    if terms.is_empty() {
        return Ok(Vec::new());
    }

    let mut libraries = Vec::new();
    for (_, domain_root) in runtime.memory_domain_roots() {
        collect_imported_library_manifests(&domain_root.join("metadata"), &mut libraries)?;
    }

    let mut hits = Vec::new();
    for library in libraries {
        let raw = fs::read_to_string(&library.manifest_path)
            .map_err(|error| format!("Failed to read imported library manifest: {error}"))?;
        let payload = serde_json::from_str::<Value>(&raw)
            .map_err(|error| format!("Invalid imported library manifest JSON: {error}"))?;
        let records = payload
            .get("records")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        for record in records {
            let source_id = record
                .get("sourceId")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if source_id.is_empty() || existing_source_ids.contains(&source_id) {
                continue;
            }
            let title = record
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Imported source")
                .to_string();
            let canonical_path = record
                .get("canonicalPath")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if canonical_path.is_empty() {
                continue;
            }
            let original_path = record
                .get("originalPath")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let title_and_path = format!("{title} {canonical_path} {original_path}").to_lowercase();
            let title_or_path_match = terms.iter().any(|term| title_and_path.contains(term));
            let source_path = PathBuf::from(&canonical_path);
            let mut snippet = None;
            let mut content_match = false;

            if text_source_extension(&source_path) {
                if let Ok(metadata) = fs::metadata(&source_path) {
                    if metadata.len() <= 1_500_000 {
                        if let Ok(content) = fs::read_to_string(&source_path) {
                            let lower = content.to_lowercase();
                            content_match = terms.iter().any(|term| lower.contains(term));
                            if content_match || title_or_path_match {
                                snippet = Some(source_excerpt_for_terms(&content, &terms));
                            }
                        }
                    }
                }
            }

            if !title_or_path_match && !content_match {
                continue;
            }

            let score = if title.to_lowercase().contains(&terms[0]) {
                4
            } else if title_or_path_match {
                3
            } else {
                1
            };
            hits.push((
                score,
                ArchiveSearchSourceHit {
                    source_id,
                    title,
                    source_type: record
                        .get("sourceType")
                        .and_then(Value::as_str)
                        .unwrap_or("source")
                        .to_string(),
                    raw_path: canonical_path,
                    processed: false,
                    snippet,
                },
            ));
        }
    }

    hits.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| left.1.title.cmp(&right.1.title))
    });
    Ok(hits.into_iter().map(|(_, hit)| hit).take(limit).collect())
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

    let (pages, mut sources) = match open_archive_db(&runtime)? {
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
                        snippet: None,
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
    let existing_source_ids = sources
        .iter()
        .map(|source| source.source_id.clone())
        .collect::<HashSet<_>>();
    if sources.len() < limit {
        sources.extend(imported_source_search(
            &runtime,
            &query,
            limit - sources.len(),
            &existing_source_ids,
        )?);
    }

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
    validate_intake_file_name(file_name)?;

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
    let resolved_source = resolve_allowed_source_path(&runtime, &request.source_path)?;
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
        "sourcePath": resolved_source.display().to_string(),
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
    use super::{
        parse_semantic_lint_findings, render_archive_index_markdown, render_archive_log_markdown,
    };
    use super::{upsert_promoted_page_index, PromotedPageIndexInput};
    use super::{ArchiveWikiNavigationLogEntry, ArchiveWikiNavigationPage};
    use rusqlite::{params, Connection};
    use serde_json::{json, Value};
    use std::collections::HashSet;
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
    fn renders_llm_wiki_index_and_log_markdown() {
        let index = render_archive_index_markdown(
            "2026-04-30T12:00:00Z",
            &[ArchiveWikiNavigationPage {
                page_id: "augmentatism".to_string(),
                page_type: "concept".to_string(),
                title: "Augmentatism".to_string(),
                file_path: "WIKI/concepts/augmentatism.md".to_string(),
                stage: Some("developing".to_string()),
                updated: "2026-04-30T12:00:00Z".to_string(),
                content: "A human-AI collaboration philosophy.".to_string(),
                snippet: "A human-AI collaboration philosophy.".to_string(),
            }],
        );
        assert!(index.contains("# Living Archive Index"));
        assert!(index.contains("[Augmentatism](WIKI/concepts/augmentatism.md)"));

        let log = render_archive_log_markdown(
            "2026-04-30T12:00:00Z",
            &[ArchiveWikiNavigationLogEntry {
                ts: "2026-04-30T12:00:00Z".to_string(),
                action: "trusted_wiki_promote".to_string(),
                page_id: Some("augmentatism".to_string()),
                source_id: None,
                agent_id: Some("archive-maintenance.ai".to_string()),
                errors: None,
            }],
        );
        assert!(log.contains("# Living Archive Log"));
        assert!(log.contains("trusted_wiki_promote | augmentatism"));
    }

    #[test]
    fn parses_semantic_lint_findings_for_repair_queueing() {
        let findings = parse_semantic_lint_findings(&json!({
            "findings": [{
                "severity": "warning",
                "target_pages": ["AI_MEMORY/wiki/concepts/a.md"],
                "claim": "A and B are both described as the primary model.",
                "conflicting_evidence": "Page A says MiniMax; page B says GPT.",
                "confidence": "high",
                "recommended_action": "Create a repair artifact that preserves both claims and resolves the active strategy.",
                "requires_human_review": false
            }]
        }));

        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].confidence, "high");
        assert!(!findings[0].requires_human_review);
        assert_eq!(findings[0].target_pages[0], "AI_MEMORY/wiki/concepts/a.md");
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
    fn archive_document_guard_rejects_portable_state_secrets() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-archive-boundary-test-{}-{}",
            std::process::id(),
            super::unix_timestamp().replace(':', "-")
        ));
        let runtime = test_archive_runtime(&root);
        let memory_page = runtime
            .memory_domain_root("ai-memory")
            .join("wiki")
            .join("allowed.md");
        let secret_file = runtime
            .vault_root
            .join("Secrets")
            .join("provider-secrets.json");
        fs::create_dir_all(
            memory_page
                .parent()
                .expect("memory page should have parent"),
        )
        .expect("memory parent should write");
        fs::create_dir_all(secret_file.parent().expect("secret should have parent"))
            .expect("secret parent should write");
        fs::write(&memory_page, "# Allowed").expect("memory page should write");
        fs::write(&secret_file, "{\"shared-minimax\":\"secret\"}")
            .expect("secret file should write");

        assert!(super::resolve_document_path(&runtime, &memory_page.display().to_string()).is_ok());
        assert!(
            super::resolve_document_path(&runtime, &secret_file.display().to_string()).is_err(),
            "Living Archive reads must not include the portable secrets root"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn archive_intake_file_name_rejects_path_traversal() {
        assert!(super::validate_intake_file_name("artifact.md").is_ok());
        assert!(super::validate_intake_file_name("../artifact.md").is_err());
        assert!(super::validate_intake_file_name("nested/artifact.md").is_err());
        assert!(super::validate_intake_file_name("nested\\artifact.md").is_err());
    }

    #[test]
    fn opens_archive_database_with_required_wiki_schema() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-archive-db-schema-test-{}-{}",
            std::process::id(),
            super::unix_timestamp().replace(':', "-")
        ));
        let runtime = test_archive_runtime(&root);

        let connection = super::open_archive_db(&runtime)
            .expect("archive db should initialize")
            .expect("archive db connection should be present");
        let table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('pages', 'sources', 'links', 'page_sources', 'activity_log')",
                [],
                |row| row.get(0),
            )
            .expect("schema tables should be countable");

        assert_eq!(table_count, 5);
        assert!(runtime.db_path().exists());

        let _ = fs::remove_dir_all(root);
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
                excluded_top_folders: None,
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
    fn rejects_move_import_before_audited_execution_exists() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-library-move-reject-test-{}-{}",
            std::process::id(),
            super::unix_timestamp().replace(':', "-")
        ));
        let source_root = root.join("source-folder");
        let source_file = source_root.join("identity.md");
        fs::create_dir_all(&source_root).expect("test source folder should be writable");
        fs::write(&source_file, "# Identity\nHuman-authored source.")
            .expect("test source file should be writable");
        let runtime = test_archive_runtime(&root);

        let result = super::import_archive_library_with_runtime(
            &runtime,
            super::ArchiveLibraryImportRequest {
                source_path: source_root.display().to_string(),
                domain: "human-knowledge".to_string(),
                import_mode: "move".to_string(),
                library_name: Some("Identity Vault".to_string()),
                actor_id: "strategist.core".to_string(),
                excluded_top_folders: None,
            },
        );

        assert!(result.is_err());
        let error = result.err().expect("move import should be rejected");
        assert!(error.contains("Move-on-import is disabled"));
        assert!(
            source_file.exists(),
            "rejected move import must preserve the original source file"
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
                excluded_top_folders: None,
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
    fn searches_imported_source_library_with_question_terms() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-imported-source-search-test-{}-{}",
            std::process::id(),
            super::unix_timestamp().replace(':', "-")
        ));
        let source_root = root.join("source-folder").join("02_PROTOCOL_LIBRARY");
        fs::create_dir_all(&source_root).expect("test source folder should be writable");
        fs::write(
            source_root.join("Play_047_The_Mixtape_Constraint.md"),
            "# Play #47: The Mixtape Constraint\n\nThe Protocol of Mixtape forbids average answers by adding deliberate curation and friction.",
        )
        .expect("test source file should write");

        let runtime = test_archive_runtime(&root);
        super::import_archive_library_with_runtime(
            &runtime,
            super::ArchiveLibraryImportRequest {
                source_path: root.join("source-folder").display().to_string(),
                domain: "mixed-library".to_string(),
                import_mode: "copy".to_string(),
                library_name: Some("Protocol Library".to_string()),
                actor_id: "strategist.core".to_string(),
                excluded_top_folders: None,
            },
        )
        .expect("library import should succeed");

        let hits = super::imported_source_search(
            &runtime,
            "do you know what's the mixtape protocol?",
            5,
            &HashSet::new(),
        )
        .expect("imported source search should succeed");

        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].title, "Play_047_The_Mixtape_Constraint");
        assert!(hits[0]
            .snippet
            .as_deref()
            .unwrap_or_default()
            .contains("Protocol of Mixtape"));

        let _ = fs::remove_dir_all(root);
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
