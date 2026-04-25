mod archive_service;
mod delegation_service;
mod host_state;
mod provider_service;
mod recovery_service;

use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use tauri::{AppHandle, Window};

use crate::archive_service::{
    archive_system_memory_status, build_archive_tol_bundle, decide_archive_review_artifact,
    import_archive_library, list_archive_ingest_requests, list_archive_review_artifacts,
    list_archive_tol_bundle_candidates, list_imported_archive_libraries,
    process_archive_ingest_request, promote_archive_review_artifact, query_archive_runtime_status,
    queue_archive_ingest_request, read_archive_document, refresh_archive_system_memory,
    scan_archive_source_folders, search_archive, write_archive_intake_artifact,
    ArchiveDocumentPayload, ArchiveImportedLibrarySummary, ArchiveIngestRequestRecord,
    ArchiveIngestRequestResult, ArchiveIntakeWriteRequest, ArchiveIntakeWriteResult,
    ArchiveLibraryImportRequest, ArchiveLibraryImportResult, ArchiveProcessIngestRequest,
    ArchiveProcessIngestResult, ArchivePromoteReviewArtifactRequest,
    ArchivePromoteReviewArtifactResult, ArchiveQueuedIngestRequest, ArchiveReadDocumentRequest,
    ArchiveReviewArtifact, ArchiveReviewDecisionRequest, ArchiveReviewDecisionResult,
    ArchiveRuntimeStatus, ArchiveSearchRequest, ArchiveSearchResult,
    ArchiveSourceFolderScanRequest, ArchiveSourceFolderScanResult,
    ArchiveSystemMemoryRefreshResult, ArchiveSystemMemoryStatus, ArchiveTolBundleBuildRequest,
    ArchiveTolBundleBuildResult, ArchiveTolBundleCandidate,
};
use crate::delegation_service::{
    create_task_workspace, finish_task_workspace, read_task_workspace, CreateTaskWorkspaceRequest,
    FinishTaskWorkspaceRequest, FinishTaskWorkspaceResult, ReadTaskWorkspaceRequest,
    TaskWorkspacePayload, TaskWorkspaceRecord,
};
use crate::host_state::{
    addons_dir, read_provider_secrets, read_runtime_state_value, state_file, validate_manifest,
    write_provider_secrets,
};
use crate::provider_service::{
    abort_provider_service_chat_stream, execute_archive_ingest_probe,
    execute_provider_service_chat, execute_provider_service_chat_stream,
    query_local_runtime_status, query_provider_diagnostics, query_recovery_route_candidates,
    ArchiveIngestProbeRequest, ArchiveIngestProbeResult, ChatMessageInput, LocalRuntimeStatus,
    ProviderDiagnosticReport, ProviderServiceChatRequest, ProviderServiceChatStreamRequest,
    RecoveryRouteCandidate,
};
use crate::recovery_service::{
    execute_engineer_recovery_turn, EngineerRecoveryTurnRequest, EngineerRecoveryTurnResult,
};

#[tauri::command]
fn load_runtime_state(app: AppHandle) -> Result<Option<Value>, String> {
    read_runtime_state_value(&app)
}

#[tauri::command]
fn save_runtime_state(app: AppHandle, state: Value) -> Result<Value, String> {
    let path = state_file(&app)?;
    let payload = serde_json::to_string_pretty(&state)
        .map_err(|error| format!("Failed to encode runtime state: {error}"))?;
    fs::write(&path, payload).map_err(|error| format!("Failed to write runtime state: {error}"))?;
    Ok(state)
}

#[tauri::command]
fn delegation_create_task_workspace(
    app: AppHandle,
    request: CreateTaskWorkspaceRequest,
) -> Result<TaskWorkspaceRecord, String> {
    create_task_workspace(&app, request)
}

#[tauri::command]
fn delegation_read_task_workspace(
    app: AppHandle,
    request: ReadTaskWorkspaceRequest,
) -> Result<TaskWorkspacePayload, String> {
    read_task_workspace(&app, request)
}

#[tauri::command]
fn delegation_finish_task_workspace(
    app: AppHandle,
    request: FinishTaskWorkspaceRequest,
) -> Result<FinishTaskWorkspaceResult, String> {
    finish_task_workspace(&app, request)
}

#[tauri::command]
fn list_sideloaded_addons(app: AppHandle) -> Result<Vec<Value>, String> {
    let mut manifests = Vec::new();
    for entry in fs::read_dir(addons_dir(&app)?)
        .map_err(|error| format!("Failed to list add-ons: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to read add-on entry: {error}"))?;
        if !entry.path().is_file() {
            continue;
        }
        let raw = fs::read_to_string(entry.path())
            .map_err(|error| format!("Failed to read add-on manifest: {error}"))?;
        let manifest = serde_json::from_str::<Value>(&raw)
            .map_err(|error| format!("Invalid add-on manifest: {error}"))?;
        manifests.push(manifest);
    }
    Ok(manifests)
}

#[tauri::command]
fn sideload_addon_manifest(app: AppHandle, manifest_path: String) -> Result<Value, String> {
    let path = PathBuf::from(&manifest_path);
    if !path.exists() {
        return Err(format!("Manifest path does not exist: {manifest_path}"));
    }
    let raw =
        fs::read_to_string(&path).map_err(|error| format!("Failed to read manifest: {error}"))?;
    let manifest = serde_json::from_str::<Value>(&raw)
        .map_err(|error| format!("Invalid manifest JSON: {error}"))?;
    validate_manifest(&manifest)?;

    let addon_id = manifest
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Manifest `id` is missing".to_string())?;
    let target = addons_dir(&app)?.join(format!("{addon_id}.json"));
    let payload = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("Failed to encode manifest: {error}"))?;
    fs::write(target, payload).map_err(|error| format!("Failed to install manifest: {error}"))?;
    Ok(manifest)
}

#[tauri::command]
fn load_provider_secret_statuses(app: AppHandle) -> Result<HashMap<String, bool>, String> {
    let secrets = read_provider_secrets(&app)?;
    let mut statuses = HashMap::new();
    for key in secrets.keys() {
        statuses.insert(key.clone(), true);
    }

    if env::var("OPENAI_API_KEY").is_ok() {
        statuses.insert("shared-openai".to_string(), true);
    }
    if env::var("MINIMAX_API_KEY").is_ok() {
        statuses.insert("shared-minimax".to_string(), true);
    }

    Ok(statuses)
}

#[tauri::command]
fn save_provider_secret(
    app: AppHandle,
    provider_id: String,
    api_key: String,
) -> Result<(), String> {
    let mut secrets = read_provider_secrets(&app)?;
    let trimmed = api_key.trim().to_string();
    if trimmed.is_empty() {
        secrets.remove(&provider_id);
    } else {
        secrets.insert(provider_id, trimmed);
    }
    write_provider_secrets(&app, &secrets)
}

#[tauri::command]
fn local_runtime_status(target_model: Option<String>) -> LocalRuntimeStatus {
    query_local_runtime_status(target_model)
}

#[tauri::command]
fn archive_runtime_status(app: AppHandle) -> Result<ArchiveRuntimeStatus, String> {
    query_archive_runtime_status(&app)
}

#[tauri::command]
fn archive_scan_source_folders(
    app: AppHandle,
    request: ArchiveSourceFolderScanRequest,
) -> Result<ArchiveSourceFolderScanResult, String> {
    scan_archive_source_folders(&app, request)
}

#[tauri::command]
fn archive_import_library(
    app: AppHandle,
    request: ArchiveLibraryImportRequest,
) -> Result<ArchiveLibraryImportResult, String> {
    import_archive_library(&app, request)
}

#[tauri::command]
fn archive_imported_libraries(
    app: AppHandle,
) -> Result<Vec<ArchiveImportedLibrarySummary>, String> {
    list_imported_archive_libraries(&app)
}

#[tauri::command]
fn archive_system_memory(app: AppHandle) -> Result<ArchiveSystemMemoryStatus, String> {
    archive_system_memory_status(&app)
}

#[tauri::command]
fn archive_refresh_system_memory(
    app: AppHandle,
) -> Result<ArchiveSystemMemoryRefreshResult, String> {
    refresh_archive_system_memory(&app)
}

#[tauri::command]
fn archive_search(
    app: AppHandle,
    request: ArchiveSearchRequest,
) -> Result<ArchiveSearchResult, String> {
    search_archive(&app, request)
}

#[tauri::command]
fn archive_read_document(
    app: AppHandle,
    request: ArchiveReadDocumentRequest,
) -> Result<ArchiveDocumentPayload, String> {
    read_archive_document(&app, request)
}

#[tauri::command]
fn archive_write_intake_artifact(
    app: AppHandle,
    request: ArchiveIntakeWriteRequest,
) -> Result<ArchiveIntakeWriteResult, String> {
    write_archive_intake_artifact(&app, request)
}

#[tauri::command]
fn archive_request_ingest(
    app: AppHandle,
    request: ArchiveIngestRequestRecord,
) -> Result<ArchiveIngestRequestResult, String> {
    queue_archive_ingest_request(&app, request)
}

#[tauri::command]
fn archive_review_queue(app: AppHandle) -> Result<Vec<ArchiveQueuedIngestRequest>, String> {
    list_archive_ingest_requests(&app)
}

#[tauri::command]
fn archive_review_artifacts(app: AppHandle) -> Result<Vec<ArchiveReviewArtifact>, String> {
    list_archive_review_artifacts(&app)
}

#[tauri::command]
fn archive_tol_bundle_candidates(app: AppHandle) -> Result<Vec<ArchiveTolBundleCandidate>, String> {
    list_archive_tol_bundle_candidates(&app)
}

#[tauri::command]
fn archive_build_tol_bundle(
    app: AppHandle,
    request: ArchiveTolBundleBuildRequest,
) -> Result<ArchiveTolBundleBuildResult, String> {
    build_archive_tol_bundle(&app, request)
}

#[tauri::command]
async fn archive_process_ingest_request(
    app: AppHandle,
    request: ArchiveProcessIngestRequest,
) -> Result<ArchiveProcessIngestResult, String> {
    process_archive_ingest_request(&app, request).await
}

#[tauri::command]
fn archive_review_decision(
    app: AppHandle,
    request: ArchiveReviewDecisionRequest,
) -> Result<ArchiveReviewDecisionResult, String> {
    decide_archive_review_artifact(&app, request)
}

#[tauri::command]
fn archive_promote_review_artifact(
    app: AppHandle,
    request: ArchivePromoteReviewArtifactRequest,
) -> Result<ArchivePromoteReviewArtifactResult, String> {
    promote_archive_review_artifact(&app, request)
}

#[tauri::command]
async fn engineer_recovery_turn(
    app: AppHandle,
    provider_id: String,
    provider_type: String,
    api_base_url: Option<String>,
    runtime_node_id: Option<String>,
    runtime_node_kind: Option<String>,
    model: String,
    system_prompt: String,
    messages: Vec<ChatMessageInput>,
    runtime_node_endpoint: Option<String>,
    auth_tier: Option<String>,
) -> Result<EngineerRecoveryTurnResult, String> {
    execute_engineer_recovery_turn(
        &app,
        EngineerRecoveryTurnRequest {
            provider_id,
            provider_type,
            api_base_url,
            runtime_node_id,
            runtime_node_kind,
            model,
            system_prompt,
            messages,
            runtime_node_endpoint,
            auth_tier,
        },
    )
    .await
}

#[tauri::command]
async fn recovery_route_candidates(app: AppHandle) -> Result<Vec<RecoveryRouteCandidate>, String> {
    query_recovery_route_candidates(&app).await
}

#[tauri::command]
async fn provider_diagnostics(
    app: AppHandle,
    provider_id: Option<String>,
) -> Result<Vec<ProviderDiagnosticReport>, String> {
    query_provider_diagnostics(&app, provider_id.as_deref()).await
}

#[tauri::command]
async fn provider_service_chat_completion(
    app: AppHandle,
    provider_id: String,
    provider_type: String,
    api_base_url: Option<String>,
    runtime_node_id: Option<String>,
    runtime_node_kind: Option<String>,
    runtime_node_endpoint: Option<String>,
    auth_tier: Option<String>,
    model: String,
    reasoning_effort: String,
    system_prompt: String,
    messages: Vec<ChatMessageInput>,
) -> Result<String, String> {
    execute_provider_service_chat(
        &app,
        ProviderServiceChatRequest {
            provider_id,
            provider_type,
            api_base_url,
            runtime_node_id,
            runtime_node_kind,
            runtime_node_endpoint,
            auth_tier,
            model,
            reasoning_effort,
            system_prompt,
            messages,
        },
    )
    .await
}

#[tauri::command]
async fn provider_service_chat_completion_stream(
    app: AppHandle,
    window: Window,
    run_id: String,
    provider_id: String,
    provider_type: String,
    api_base_url: Option<String>,
    runtime_node_id: Option<String>,
    runtime_node_kind: Option<String>,
    runtime_node_endpoint: Option<String>,
    auth_tier: Option<String>,
    model: String,
    reasoning_effort: String,
    system_prompt: String,
    messages: Vec<ChatMessageInput>,
) -> Result<String, String> {
    execute_provider_service_chat_stream(
        &app,
        &window,
        ProviderServiceChatStreamRequest {
            run_id,
            provider_id,
            provider_type,
            api_base_url,
            runtime_node_id,
            runtime_node_kind,
            runtime_node_endpoint,
            auth_tier,
            model,
            reasoning_effort,
            system_prompt,
            messages,
        },
    )
    .await
}

#[tauri::command]
fn provider_service_abort_chat_completion(run_id: String) -> Result<(), String> {
    abort_provider_service_chat_stream(&run_id);
    Ok(())
}

#[tauri::command]
async fn archive_ingest_probe(
    app: AppHandle,
    provider_id: String,
    provider_type: String,
    api_base_url: Option<String>,
    runtime_node_id: Option<String>,
    runtime_node_kind: Option<String>,
    runtime_node_endpoint: Option<String>,
    auth_tier: Option<String>,
    model: String,
    source_label: String,
    source_excerpt: String,
) -> Result<ArchiveIngestProbeResult, String> {
    execute_archive_ingest_probe(
        &app,
        ArchiveIngestProbeRequest {
            provider_id,
            provider_type,
            api_base_url,
            runtime_node_id,
            runtime_node_kind,
            runtime_node_endpoint,
            auth_tier,
            model,
            source_label,
            source_excerpt,
        },
    )
    .await
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_runtime_state,
            save_runtime_state,
            delegation_create_task_workspace,
            delegation_read_task_workspace,
            delegation_finish_task_workspace,
            list_sideloaded_addons,
            sideload_addon_manifest,
            load_provider_secret_statuses,
            save_provider_secret,
            local_runtime_status,
            archive_runtime_status,
            archive_scan_source_folders,
            archive_import_library,
            archive_imported_libraries,
            archive_system_memory,
            archive_refresh_system_memory,
            archive_search,
            archive_read_document,
            archive_write_intake_artifact,
            archive_request_ingest,
            archive_review_queue,
            archive_review_artifacts,
            archive_tol_bundle_candidates,
            archive_build_tol_bundle,
            archive_process_ingest_request,
            archive_review_decision,
            archive_promote_review_artifact,
            engineer_recovery_turn,
            recovery_route_candidates,
            provider_diagnostics,
            provider_service_chat_completion,
            provider_service_chat_completion_stream,
            provider_service_abort_chat_completion,
            archive_ingest_probe
        ])
        .run(tauri::generate_context!())
        .expect("error while running ResonantOS vNext");
}
