mod archive_service;
mod audio2tol_service;
mod browser_host_service;
mod browser_native_service;
mod browser_service;
mod compute_service;
mod delegation_service;
mod hermes_service;
mod host_state;
mod memory_service;
mod obsidian_service;
mod opencode_service;
mod paperclip_service;
mod provider_service;
mod recovery_service;
mod telegram_service;
mod terminal_service;

use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use tauri::{
    menu::{Menu, MenuItem, Submenu},
    AppHandle, Emitter, Window,
};

use crate::archive_service::{
    archive_system_memory_status, build_archive_tol_bundle, decide_archive_review_artifact,
    import_archive_library, lint_archive, list_archive_ai_memory_build_jobs,
    list_archive_ingest_requests, list_archive_review_artifacts,
    list_archive_tol_bundle_candidates, list_imported_archive_libraries,
    preflight_archive_library_import, process_archive_ingest_request,
    promote_archive_review_artifact, query_archive_runtime_status, queue_archive_ingest_request,
    queue_imported_library_for_ingest, read_archive_document,
    read_archive_library_classification_review, refresh_archive_system_memory,
    refresh_archive_wiki_navigation, run_archive_ai_memory_build_job, run_archive_background_cycle,
    run_archive_maintenance_cycle, scan_archive_source_folders, search_archive,
    semantic_lint_archive, write_archive_intake_artifact,
    write_archive_library_reorganisation_plan, ArchiveAiMemoryBuildJobSummary,
    ArchiveAiMemoryBuildRequest, ArchiveAiMemoryBuildResult, ArchiveBackgroundCycleRequest,
    ArchiveBackgroundCycleResult, ArchiveDocumentPayload, ArchiveImportedLibrarySummary,
    ArchiveIngestRequestRecord, ArchiveIngestRequestResult, ArchiveIntakeWriteRequest,
    ArchiveIntakeWriteResult, ArchiveLibraryClassificationReview,
    ArchiveLibraryClassificationReviewRequest, ArchiveLibraryImportRequest,
    ArchiveLibraryImportResult, ArchiveLibraryPreflightRequest, ArchiveLibraryPreflightResult,
    ArchiveLibraryReorganisationPlan, ArchiveLibraryReorganisationPlanRequest, ArchiveLintResult,
    ArchiveMaintenanceCycleRequest, ArchiveMaintenanceCycleResult, ArchiveProcessIngestRequest,
    ArchiveProcessIngestResult, ArchivePromoteReviewArtifactRequest,
    ArchivePromoteReviewArtifactResult, ArchiveQueueImportedLibraryRequest,
    ArchiveQueueImportedLibraryResult, ArchiveQueuedIngestRequest, ArchiveReadDocumentRequest,
    ArchiveReviewArtifact, ArchiveReviewDecisionRequest, ArchiveReviewDecisionResult,
    ArchiveRuntimeStatus, ArchiveSearchRequest, ArchiveSearchResult, ArchiveSemanticLintRequest,
    ArchiveSemanticLintResult, ArchiveSourceFolderScanRequest, ArchiveSourceFolderScanResult,
    ArchiveSystemMemoryRefreshResult, ArchiveSystemMemoryStatus, ArchiveTolBundleBuildRequest,
    ArchiveTolBundleBuildResult, ArchiveTolBundleCandidate, ArchiveWikiNavigationRefreshResult,
};
use crate::audio2tol_service::{
    audio2tol_analyze_tol_transcript, audio2tol_detect_whisper_cpp,
    audio2tol_get_pipeline_progress, audio2tol_import_audio_files, audio2tol_install_whisper_cpp,
    audio2tol_open_path, audio2tol_plan_import_audio_files, audio2tol_process_audio_batch,
    audio2tol_process_tol_file, audio2tol_scan_audio_files, audio2tol_transcribe_audio_file,
};
use crate::browser_host_service::{
    browser_host_required_capabilities, execute_browser_host_command,
    execute_browser_visible_host_command, BrowserHostCommandRequest,
};
use crate::browser_native_service::{
    execute_native_browser_embedded_click, execute_native_browser_embedded_hide,
    execute_native_browser_embedded_resize, execute_native_browser_embedded_scroll,
    execute_native_browser_embedded_show, execute_native_browser_embedded_type_text,
    prepare_native_browser_application_if_available, query_native_browser_attach_smoke,
    query_native_browser_bridge_probe, query_native_browser_probe, NativeBrowserAttachSmokeRequest,
    NativeBrowserAttachSmokeResult, NativeBrowserBridgeProbeRequest,
    NativeBrowserBridgeProbeResult, NativeBrowserProbeRequest, NativeBrowserProbeResult,
};
use crate::browser_service::{
    execute_browser_close_session, execute_browser_open_url, execute_browser_session_click,
    execute_browser_session_open_url, execute_browser_session_read_page,
    execute_browser_session_screenshot, execute_browser_session_scroll,
    execute_browser_start_session, install_browser_engine, query_browser_engine_status,
    BrowserCloseSessionResult, BrowserEngineInstallResult, BrowserEngineStatus,
    BrowserInteractionRequest, BrowserInteractionResult, BrowserNativeClickRequest,
    BrowserNativeScrollRequest, BrowserNativeTypeTextRequest, BrowserNativeWebviewBoundsRequest,
    BrowserNativeWebviewRequest, BrowserNativeWebviewResult, BrowserOpenUrlRequest,
    BrowserOpenUrlResult, BrowserReadPageResult, BrowserSessionIdRequest, BrowserSessionRequest,
};
#[cfg(not(target_os = "macos"))]
use crate::browser_service::{
    execute_browser_native_webview_hide, execute_browser_native_webview_resize,
    execute_browser_native_webview_show,
};
use crate::compute_service::{
    execute_local_safe_command, execute_remote_probe, query_gx10_llama_status,
    query_local_passive_diagnostics, query_nas_backup_status, switch_gx10_llama_model,
    ComputePassiveDiagnosticsResult, ComputeRemoteProbeRequest, ComputeRemoteProbeResult,
    ComputeSafeCommandRequest, ComputeSafeCommandResult, Gx10LlamaStatusResult,
    Gx10LlamaSwitchRequest, Gx10LlamaSwitchResult, NasBackupStatusResult,
};
use crate::delegation_service::{
    create_task_workspace, execute_opencode_task_workspace, finish_task_workspace,
    list_task_workspaces, read_task_workspace, CreateTaskWorkspaceRequest,
    ExecuteOpenCodeTaskRequest, ExecuteOpenCodeTaskResult, FinishTaskWorkspaceRequest,
    FinishTaskWorkspaceResult, ReadTaskWorkspaceRequest, TaskWorkspacePayload, TaskWorkspaceRecord,
};
use crate::hermes_service::{
    execute_hermes_chat, install_hermes, query_hermes_dashboard_status, query_hermes_status,
    query_hermes_workspace_snapshot, start_hermes_dashboard, stop_hermes_dashboard,
    HermesChatRequest, HermesChatResult, HermesDashboardRequest, HermesDashboardStatus,
    HermesInstallRequest, HermesInstallResult, HermesInstallStatus, HermesStatusMode,
    HermesStatusRequest, HermesWorkspaceSnapshot,
};
use crate::host_state::{
    addons_dir, assert_addon_capabilities, assert_living_archive_host_access,
    read_provider_secrets, read_runtime_state_value, state_file, validate_manifest,
    write_provider_secrets,
};
use crate::memory_service::{
    query_memory_service_status, start_memory_service, stop_memory_service, MemoryServiceResult,
    MemoryServiceStartRequest, MemoryServiceStatus, MemoryServiceStatusRequest,
    MemoryServiceStopRequest,
};
use crate::obsidian_service::{
    archive_obsidian_note, create_obsidian_folder, create_obsidian_note, index_obsidian_vault,
    list_obsidian_notes, move_obsidian_note, open_obsidian_note, query_obsidian_vault_status,
    read_obsidian_note, write_obsidian_note, ObsidianArchiveNoteRequest,
    ObsidianCreateFolderRequest, ObsidianCreateNoteRequest, ObsidianListNotesRequest,
    ObsidianMoveNoteRequest, ObsidianNoteOperationResult, ObsidianNotePayload, ObsidianNoteSummary,
    ObsidianOpenNoteRequest, ObsidianOpenNoteResult, ObsidianReadNoteRequest, ObsidianVaultIndex,
    ObsidianVaultIndexRequest, ObsidianVaultRequest, ObsidianVaultStatus, ObsidianWriteNoteRequest,
    ObsidianWriteNoteResult,
};
use crate::opencode_service::{
    inject_opencode_prompt, query_opencode_status, record_opencode_trust_event,
    start_opencode_service, stop_opencode_service, OpenCodeInjectPromptRequest,
    OpenCodeInjectPromptResult, OpenCodeServiceResult, OpenCodeStartRequest, OpenCodeStatus,
    OpenCodeStopRequest, OpenCodeTrustEventRequest, TrustKernelAdvisory,
};
use crate::paperclip_service::{
    create_paperclip_issue_from_delegation, query_paperclip_dashboard_snapshot,
    query_paperclip_status, start_paperclip_service, stop_paperclip_service,
    PaperclipCreateIssueRequest, PaperclipCreateIssueResult, PaperclipDashboardRequest,
    PaperclipDashboardSnapshot, PaperclipServiceResult, PaperclipStartRequest, PaperclipStatus,
    PaperclipStatusRequest, PaperclipStopRequest,
};
use crate::provider_service::{
    abort_provider_service_chat_stream, execute_archive_ingest_probe,
    execute_provider_service_chat, execute_provider_service_chat_stream,
    execute_provider_setup_probe, execute_provider_smoke_test, query_local_runtime_status,
    query_provider_diagnostics, query_provider_request_audit, query_recovery_route_candidates,
    ArchiveIngestProbeRequest, ArchiveIngestProbeResult, ChatMessageInput, LocalRuntimeStatus,
    ProviderDiagnosticReport, ProviderRequestAuditRecord, ProviderServiceChatRequest,
    ProviderServiceChatStreamRequest, ProviderSetupProbeRequest, ProviderSetupProbeResult,
    ProviderSmokeTestResult, RecoveryRouteCandidate,
};
use crate::recovery_service::{
    execute_engineer_recovery_turn, EngineerRecoveryTurnRequest, EngineerRecoveryTurnResult,
};
use crate::telegram_service::{
    save_telegram_bot_token, start_telegram_service, stop_telegram_service, telegram_status,
    TelegramServiceStartRequest, TelegramServiceStatus,
};
use crate::terminal_service::{
    resize_terminal_pty, run_terminal_command, start_terminal_pty, stop_terminal_pty,
    write_terminal_pty, TerminalPtySessionResult, TerminalResizePtyRequest,
    TerminalRunCommandRequest, TerminalRunCommandResult, TerminalStartPtyRequest,
    TerminalWritePtyRequest,
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
    app.emit("runtime-state-updated", state.clone())
        .map_err(|error| format!("Failed to broadcast runtime state update: {error}"))?;
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
fn delegation_list_task_workspaces(app: AppHandle) -> Result<Vec<TaskWorkspaceRecord>, String> {
    list_task_workspaces(&app)
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
fn delegation_execute_opencode_task(
    app: AppHandle,
    request: ExecuteOpenCodeTaskRequest,
) -> Result<ExecuteOpenCodeTaskResult, String> {
    assert_addon_capabilities(&app, "addon.opencode", &["filesystem", "shell"])?;
    execute_opencode_task_workspace(&app, request)
}

#[tauri::command]
fn compute_local_passive_diagnostics() -> ComputePassiveDiagnosticsResult {
    query_local_passive_diagnostics()
}

#[tauri::command]
fn compute_local_safe_command(
    request: ComputeSafeCommandRequest,
) -> Result<ComputeSafeCommandResult, String> {
    execute_local_safe_command(request)
}

#[tauri::command]
fn compute_remote_probe(
    request: ComputeRemoteProbeRequest,
) -> Result<ComputeRemoteProbeResult, String> {
    execute_remote_probe(request)
}

#[tauri::command]
fn compute_gx10_llama_status() -> Result<Gx10LlamaStatusResult, String> {
    query_gx10_llama_status()
}

#[tauri::command]
fn compute_gx10_llama_switch(
    request: Gx10LlamaSwitchRequest,
) -> Result<Gx10LlamaSwitchResult, String> {
    switch_gx10_llama_model(request)
}

#[tauri::command]
fn compute_nas_backup_status() -> Result<NasBackupStatusResult, String> {
    query_nas_backup_status()
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
fn telegram_save_bot_token(app: AppHandle, bot_token: String) -> Result<(), String> {
    save_telegram_bot_token(&app, bot_token)
}

#[tauri::command]
fn telegram_service_status(
    app: AppHandle,
    channel_id: Option<String>,
) -> Result<TelegramServiceStatus, String> {
    telegram_status(&app, channel_id)
}

#[tauri::command]
async fn telegram_service_start(
    app: AppHandle,
    request: TelegramServiceStartRequest,
) -> Result<TelegramServiceStatus, String> {
    start_telegram_service(app, request).await
}

#[tauri::command]
fn telegram_service_stop(
    app: AppHandle,
    channel_id: Option<String>,
) -> Result<TelegramServiceStatus, String> {
    stop_telegram_service(&app, channel_id)
}

#[tauri::command]
fn local_runtime_status(target_model: Option<String>) -> LocalRuntimeStatus {
    query_local_runtime_status(target_model)
}

#[tauri::command]
fn archive_runtime_status(app: AppHandle) -> Result<ArchiveRuntimeStatus, String> {
    assert_living_archive_host_access(&app, &[])?;
    query_archive_runtime_status(&app)
}

#[tauri::command]
fn archive_scan_source_folders(
    app: AppHandle,
    request: ArchiveSourceFolderScanRequest,
) -> Result<ArchiveSourceFolderScanResult, String> {
    assert_living_archive_host_access(&app, &["filesystem"])?;
    scan_archive_source_folders(&app, request)
}

#[tauri::command]
fn archive_import_library(
    app: AppHandle,
    request: ArchiveLibraryImportRequest,
) -> Result<ArchiveLibraryImportResult, String> {
    assert_living_archive_host_access(&app, &["filesystem", "archive-intake-write"])?;
    import_archive_library(&app, request)
}

#[tauri::command]
fn archive_preflight_library_import(
    app: AppHandle,
    request: ArchiveLibraryPreflightRequest,
) -> Result<ArchiveLibraryPreflightResult, String> {
    assert_living_archive_host_access(&app, &["filesystem"])?;
    preflight_archive_library_import(&app, request)
}

#[tauri::command]
fn archive_imported_libraries(
    app: AppHandle,
) -> Result<Vec<ArchiveImportedLibrarySummary>, String> {
    assert_living_archive_host_access(&app, &[])?;
    list_imported_archive_libraries(&app)
}

#[tauri::command]
fn archive_library_classification_review(
    app: AppHandle,
    request: ArchiveLibraryClassificationReviewRequest,
) -> Result<ArchiveLibraryClassificationReview, String> {
    assert_living_archive_host_access(&app, &["archive-read"])?;
    read_archive_library_classification_review(&app, request)
}

#[tauri::command]
fn archive_library_reorganisation_plan(
    app: AppHandle,
    request: ArchiveLibraryReorganisationPlanRequest,
) -> Result<ArchiveLibraryReorganisationPlan, String> {
    assert_living_archive_host_access(&app, &["archive-read"])?;
    write_archive_library_reorganisation_plan(&app, request)
}

#[tauri::command]
fn archive_system_memory(app: AppHandle) -> Result<ArchiveSystemMemoryStatus, String> {
    assert_living_archive_host_access(&app, &["archive-read"])?;
    archive_system_memory_status(&app)
}

#[tauri::command]
fn archive_refresh_system_memory(
    app: AppHandle,
) -> Result<ArchiveSystemMemoryRefreshResult, String> {
    assert_living_archive_host_access(&app, &["filesystem", "archive-read"])?;
    refresh_archive_system_memory(&app)
}

#[tauri::command]
fn archive_search(
    app: AppHandle,
    request: ArchiveSearchRequest,
) -> Result<ArchiveSearchResult, String> {
    assert_living_archive_host_access(&app, &["archive-read"])?;
    search_archive(&app, request)
}

#[tauri::command]
fn archive_read_document(
    app: AppHandle,
    request: ArchiveReadDocumentRequest,
) -> Result<ArchiveDocumentPayload, String> {
    assert_living_archive_host_access(&app, &["archive-read"])?;
    read_archive_document(&app, request)
}

#[tauri::command]
fn obsidian_vault_status(request: ObsidianVaultRequest) -> Result<ObsidianVaultStatus, String> {
    query_obsidian_vault_status(request)
}

#[tauri::command]
fn obsidian_list_notes(
    request: ObsidianListNotesRequest,
) -> Result<Vec<ObsidianNoteSummary>, String> {
    list_obsidian_notes(request)
}

#[tauri::command]
fn obsidian_read_note(request: ObsidianReadNoteRequest) -> Result<ObsidianNotePayload, String> {
    read_obsidian_note(request)
}

#[tauri::command]
fn obsidian_open_note(request: ObsidianOpenNoteRequest) -> Result<ObsidianOpenNoteResult, String> {
    open_obsidian_note(request)
}

#[tauri::command]
fn obsidian_write_note(
    app: AppHandle,
    request: ObsidianWriteNoteRequest,
) -> Result<ObsidianWriteNoteResult, String> {
    assert_addon_capabilities(&app, "addon.obsidian", &["filesystem"])?;
    write_obsidian_note(request)
}

#[tauri::command]
fn obsidian_create_note(
    app: AppHandle,
    request: ObsidianCreateNoteRequest,
) -> Result<ObsidianNoteOperationResult, String> {
    assert_addon_capabilities(&app, "addon.obsidian", &["filesystem"])?;
    create_obsidian_note(request)
}

#[tauri::command]
fn obsidian_create_folder(
    app: AppHandle,
    request: ObsidianCreateFolderRequest,
) -> Result<ObsidianNoteOperationResult, String> {
    assert_addon_capabilities(&app, "addon.obsidian", &["filesystem"])?;
    create_obsidian_folder(request)
}

#[tauri::command]
fn obsidian_move_note(
    app: AppHandle,
    request: ObsidianMoveNoteRequest,
) -> Result<ObsidianNoteOperationResult, String> {
    assert_addon_capabilities(&app, "addon.obsidian", &["filesystem"])?;
    move_obsidian_note(request)
}

#[tauri::command]
fn obsidian_archive_note(
    app: AppHandle,
    request: ObsidianArchiveNoteRequest,
) -> Result<ObsidianNoteOperationResult, String> {
    assert_addon_capabilities(&app, "addon.obsidian", &["filesystem"])?;
    archive_obsidian_note(request)
}

#[tauri::command]
fn obsidian_vault_index(request: ObsidianVaultIndexRequest) -> Result<ObsidianVaultIndex, String> {
    index_obsidian_vault(request)
}

#[tauri::command]
fn browser_engine_status() -> BrowserEngineStatus {
    query_browser_engine_status()
}

#[tauri::command]
fn browser_install_engine(app: AppHandle) -> Result<BrowserEngineInstallResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["network", "browser-control"])?;
    install_browser_engine()
}

#[tauri::command]
fn browser_open_url(
    app: AppHandle,
    request: BrowserOpenUrlRequest,
) -> Result<BrowserOpenUrlResult, String> {
    assert_addon_capabilities(
        &app,
        "addon.browser",
        &["network", "ui-embedding", "browser-control"],
    )?;
    execute_browser_open_url(&app, request)
}

#[tauri::command]
fn browser_start_session(
    app: AppHandle,
    request: BrowserOpenUrlRequest,
) -> Result<BrowserOpenUrlResult, String> {
    assert_addon_capabilities(
        &app,
        "addon.browser",
        &["network", "ui-embedding", "browser-control"],
    )?;
    execute_browser_start_session(&app, request)
}

#[tauri::command]
fn browser_session_open_url(
    app: AppHandle,
    request: BrowserSessionRequest,
) -> Result<BrowserOpenUrlResult, String> {
    assert_addon_capabilities(
        &app,
        "addon.browser",
        &["network", "ui-embedding", "browser-control"],
    )?;
    execute_browser_session_open_url(request)
}

#[tauri::command]
fn browser_session_screenshot(
    app: AppHandle,
    request: BrowserSessionIdRequest,
) -> Result<BrowserOpenUrlResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["ui-embedding", "browser-control"])?;
    execute_browser_session_screenshot(request)
}

#[tauri::command]
fn browser_session_read_page(
    app: AppHandle,
    request: BrowserSessionIdRequest,
) -> Result<BrowserReadPageResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["browser-control"])?;
    execute_browser_session_read_page(request)
}

#[tauri::command]
fn browser_session_click(
    app: AppHandle,
    request: BrowserInteractionRequest,
) -> Result<BrowserInteractionResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["ui-embedding", "browser-control"])?;
    execute_browser_session_click(request)
}

#[tauri::command]
fn browser_session_scroll(
    app: AppHandle,
    request: BrowserInteractionRequest,
) -> Result<BrowserInteractionResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["ui-embedding", "browser-control"])?;
    execute_browser_session_scroll(request)
}

#[tauri::command]
fn browser_close_session(
    request: BrowserSessionIdRequest,
) -> Result<BrowserCloseSessionResult, String> {
    execute_browser_close_session(request)
}

#[tauri::command]
fn browser_host_command(
    app: AppHandle,
    request: BrowserHostCommandRequest,
) -> Result<Value, String> {
    let required = browser_host_required_capabilities(&request.method)?;
    assert_addon_capabilities(&app, "addon.browser", &required)?;
    execute_browser_host_command(&app, request)
}

#[tauri::command]
fn browser_visible_host_command(
    app: AppHandle,
    request: BrowserHostCommandRequest,
) -> Result<Value, String> {
    let required = browser_host_required_capabilities(&request.method)?;
    assert_addon_capabilities(&app, "addon.browser", &required)?;
    execute_browser_visible_host_command(&app, request)
}

#[tauri::command]
fn browser_native_webview_show(
    app: AppHandle,
    window: Window,
    request: BrowserNativeWebviewRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    assert_addon_capabilities(
        &app,
        "addon.browser",
        &["network", "ui-embedding", "browser-control"],
    )?;
    #[cfg(target_os = "macos")]
    {
        let parent = window
            .ns_view()
            .map_err(|error| format!("Native Browser parent NSView unavailable: {error}"))?;
        execute_native_browser_embedded_show(parent.cast(), request)
    }
    #[cfg(not(target_os = "macos"))]
    {
        execute_browser_native_webview_show(&app, request)
    }
}

#[tauri::command]
fn browser_native_webview_resize(
    app: AppHandle,
    request: BrowserNativeWebviewBoundsRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["ui-embedding", "browser-control"])?;
    #[cfg(target_os = "macos")]
    {
        execute_native_browser_embedded_resize(request)
    }
    #[cfg(not(target_os = "macos"))]
    {
        execute_browser_native_webview_resize(&app, request)
    }
}

#[tauri::command]
fn browser_native_webview_hide(app: AppHandle) -> Result<BrowserNativeWebviewResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["ui-embedding", "browser-control"])?;
    #[cfg(target_os = "macos")]
    {
        execute_native_browser_embedded_hide()
    }
    #[cfg(not(target_os = "macos"))]
    {
        execute_browser_native_webview_hide(&app)
    }
}

#[tauri::command]
fn browser_native_webview_click(
    app: AppHandle,
    request: BrowserNativeClickRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["ui-embedding", "browser-control"])?;
    #[cfg(target_os = "macos")]
    {
        execute_native_browser_embedded_click(request)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        Err("Native Chromium click is not implemented for this platform yet.".to_string())
    }
}

#[tauri::command]
fn browser_native_webview_scroll(
    app: AppHandle,
    request: BrowserNativeScrollRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["ui-embedding", "browser-control"])?;
    #[cfg(target_os = "macos")]
    {
        execute_native_browser_embedded_scroll(request)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        Err("Native Chromium scroll is not implemented for this platform yet.".to_string())
    }
}

#[tauri::command]
fn browser_native_webview_type_text(
    app: AppHandle,
    request: BrowserNativeTypeTextRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["ui-embedding", "browser-control"])?;
    #[cfg(target_os = "macos")]
    {
        execute_native_browser_embedded_type_text(request)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        Err("Native Chromium typing is not implemented for this platform yet.".to_string())
    }
}

#[tauri::command]
fn browser_native_probe(
    app: AppHandle,
    request: NativeBrowserProbeRequest,
) -> Result<NativeBrowserProbeResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["ui-embedding", "browser-control"])?;
    Ok(query_native_browser_probe(request))
}

#[tauri::command]
fn browser_native_attach_smoke(
    app: AppHandle,
    window: Window,
    request: NativeBrowserAttachSmokeRequest,
) -> Result<NativeBrowserAttachSmokeResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["ui-embedding", "browser-control"])?;
    #[cfg(target_os = "macos")]
    {
        let parent_handle_present = window.ns_view().is_ok();
        Ok(query_native_browser_attach_smoke(
            request,
            "macos",
            "macos-ns-view",
            parent_handle_present,
        ))
    }
    #[cfg(target_os = "windows")]
    {
        Ok(query_native_browser_attach_smoke(
            request,
            "windows",
            "windows-hwnd",
            false,
        ))
    }
    #[cfg(target_os = "linux")]
    {
        Ok(query_native_browser_attach_smoke(
            request,
            "linux",
            "x11-or-wayland-handle",
            false,
        ))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Ok(query_native_browser_attach_smoke(
            request,
            std::env::consts::OS,
            "unsupported-platform-handle",
            false,
        ))
    }
}

#[tauri::command]
fn browser_native_bridge_probe(
    app: AppHandle,
    request: NativeBrowserBridgeProbeRequest,
) -> Result<NativeBrowserBridgeProbeResult, String> {
    assert_addon_capabilities(&app, "addon.browser", &["ui-embedding", "browser-control"])?;
    Ok(query_native_browser_bridge_probe(request))
}

#[tauri::command]
fn opencode_status() -> OpenCodeStatus {
    query_opencode_status()
}

#[tauri::command]
fn paperclip_status(request: PaperclipStatusRequest) -> PaperclipStatus {
    query_paperclip_status(request)
}

#[tauri::command]
fn hermes_status(
    app: AppHandle,
    request: HermesStatusRequest,
) -> Result<HermesInstallStatus, String> {
    let mode = if request.executable.unwrap_or(false) {
        assert_addon_capabilities(&app, "addon.hermes", &["shell"])?;
        HermesStatusMode::Executable
    } else {
        HermesStatusMode::Passive
    };
    Ok(query_hermes_status(request.profile_home, mode))
}

#[tauri::command]
async fn hermes_install(
    app: AppHandle,
    request: HermesInstallRequest,
) -> Result<HermesInstallResult, String> {
    assert_addon_capabilities(&app, "addon.hermes", &["network", "shell"])?;
    tauri::async_runtime::spawn_blocking(move || install_hermes(request))
        .await
        .map_err(|error| format!("Hermes installer task failed: {error}"))?
}

#[tauri::command]
fn hermes_workspace_snapshot(
    app: AppHandle,
    profile_home: Option<String>,
) -> Result<HermesWorkspaceSnapshot, String> {
    assert_addon_capabilities(&app, "addon.hermes", &["shell", "ui-embedding"])?;
    Ok(query_hermes_workspace_snapshot(profile_home))
}

#[tauri::command]
fn hermes_dashboard_status(
    app: AppHandle,
    profile_home: Option<String>,
) -> Result<HermesDashboardStatus, String> {
    assert_addon_capabilities(&app, "addon.hermes", &["shell", "ui-embedding"])?;
    Ok(query_hermes_dashboard_status(profile_home, None, None))
}

#[tauri::command]
fn hermes_dashboard_start(
    app: AppHandle,
    request: HermesDashboardRequest,
) -> Result<HermesDashboardStatus, String> {
    assert_addon_capabilities(&app, "addon.hermes", &["shell", "ui-embedding"])?;
    start_hermes_dashboard(request)
}

#[tauri::command]
fn hermes_dashboard_stop(
    app: AppHandle,
    profile_home: Option<String>,
) -> Result<HermesDashboardStatus, String> {
    assert_addon_capabilities(&app, "addon.hermes", &["shell", "ui-embedding"])?;
    stop_hermes_dashboard(profile_home)
}

#[tauri::command]
async fn hermes_chat(
    app: AppHandle,
    request: HermesChatRequest,
) -> Result<HermesChatResult, String> {
    assert_addon_capabilities(&app, "addon.hermes", &["shell", "providers"])?;
    tauri::async_runtime::spawn_blocking(move || execute_hermes_chat(request))
        .await
        .map_err(|error| format!("Hermes bridge task failed: {error}"))?
}

#[tauri::command]
fn living_archive_memory_service_status(
    app: AppHandle,
    request: MemoryServiceStatusRequest,
) -> Result<MemoryServiceStatus, String> {
    assert_living_archive_host_access(&app, &["archive-read"])?;
    query_memory_service_status(&app, request)
}

#[tauri::command]
fn living_archive_memory_service_start(
    app: AppHandle,
    request: MemoryServiceStartRequest,
) -> Result<MemoryServiceResult, String> {
    assert_living_archive_host_access(&app, &["filesystem", "archive-read"])?;
    start_memory_service(&app, request)
}

#[tauri::command]
fn living_archive_memory_service_stop(
    app: AppHandle,
    request: MemoryServiceStopRequest,
) -> Result<MemoryServiceResult, String> {
    assert_living_archive_host_access(&app, &["filesystem", "archive-read"])?;
    stop_memory_service(request)
}

#[tauri::command]
fn opencode_start_service(
    app: AppHandle,
    request: OpenCodeStartRequest,
) -> Result<OpenCodeServiceResult, String> {
    assert_addon_capabilities(
        &app,
        "addon.opencode",
        &["filesystem", "shell", "ui-embedding"],
    )?;
    start_opencode_service(request)
}

#[tauri::command]
fn opencode_stop_service(
    app: AppHandle,
    request: OpenCodeStopRequest,
) -> Result<OpenCodeServiceResult, String> {
    assert_addon_capabilities(&app, "addon.opencode", &["shell"])?;
    stop_opencode_service(request)
}

#[tauri::command]
fn opencode_record_trust_event(
    app: AppHandle,
    request: OpenCodeTrustEventRequest,
) -> Result<TrustKernelAdvisory, String> {
    assert_addon_capabilities(&app, "addon.opencode", &["shell"])?;
    record_opencode_trust_event(request)
}

#[tauri::command]
fn opencode_inject_prompt(
    app: AppHandle,
    request: OpenCodeInjectPromptRequest,
) -> Result<OpenCodeInjectPromptResult, String> {
    assert_addon_capabilities(
        &app,
        "addon.opencode",
        &["filesystem", "shell", "ui-embedding"],
    )?;
    inject_opencode_prompt(request)
}

#[tauri::command]
fn paperclip_start_service(
    app: AppHandle,
    request: PaperclipStartRequest,
) -> Result<PaperclipServiceResult, String> {
    assert_addon_capabilities(&app, "addon.paperclip", &["network", "ui-embedding"])?;
    start_paperclip_service(request)
}

#[tauri::command]
fn paperclip_stop_service(
    app: AppHandle,
    request: PaperclipStopRequest,
) -> Result<PaperclipServiceResult, String> {
    assert_addon_capabilities(&app, "addon.paperclip", &["ui-embedding"])?;
    stop_paperclip_service(request)
}

#[tauri::command]
async fn paperclip_dashboard_snapshot(
    app: AppHandle,
    request: PaperclipDashboardRequest,
) -> Result<PaperclipDashboardSnapshot, String> {
    assert_addon_capabilities(&app, "addon.paperclip", &["network"])?;
    query_paperclip_dashboard_snapshot(request).await
}

#[tauri::command]
async fn paperclip_create_issue_from_delegation(
    app: AppHandle,
    request: PaperclipCreateIssueRequest,
) -> Result<PaperclipCreateIssueResult, String> {
    assert_addon_capabilities(&app, "addon.paperclip", &["network", "agent-delegation"])?;
    create_paperclip_issue_from_delegation(request).await
}

#[tauri::command]
fn terminal_status(app: AppHandle) -> Result<String, String> {
    assert_addon_capabilities(&app, "addon.terminal", &["shell", "ui-embedding"])?;
    Ok("ready".to_string())
}

#[tauri::command]
fn terminal_run_command(
    app: AppHandle,
    request: TerminalRunCommandRequest,
) -> Result<TerminalRunCommandResult, String> {
    assert_addon_capabilities(&app, "addon.terminal", &["shell"])?;
    run_terminal_command(request)
}

#[tauri::command]
fn terminal_start_pty(
    app: AppHandle,
    window: Window,
    request: TerminalStartPtyRequest,
) -> Result<TerminalPtySessionResult, String> {
    assert_addon_capabilities(&app, "addon.terminal", &["shell", "ui-embedding"])?;
    start_terminal_pty(window, request)
}

#[tauri::command]
fn terminal_write_pty(app: AppHandle, request: TerminalWritePtyRequest) -> Result<(), String> {
    assert_addon_capabilities(&app, "addon.terminal", &["shell"])?;
    write_terminal_pty(request)
}

#[tauri::command]
fn terminal_resize_pty(app: AppHandle, request: TerminalResizePtyRequest) -> Result<(), String> {
    assert_addon_capabilities(&app, "addon.terminal", &["shell", "ui-embedding"])?;
    resize_terminal_pty(request)
}

#[tauri::command]
fn terminal_stop_pty(app: AppHandle, session_id: String) -> Result<(), String> {
    assert_addon_capabilities(&app, "addon.terminal", &["shell"])?;
    stop_terminal_pty(&session_id)
}

#[tauri::command]
fn archive_write_intake_artifact(
    app: AppHandle,
    request: ArchiveIntakeWriteRequest,
) -> Result<ArchiveIntakeWriteResult, String> {
    assert_living_archive_host_access(&app, &["archive-intake-write"])?;
    write_archive_intake_artifact(&app, request)
}

#[tauri::command]
fn archive_request_ingest(
    app: AppHandle,
    request: ArchiveIngestRequestRecord,
) -> Result<ArchiveIngestRequestResult, String> {
    assert_living_archive_host_access(&app, &["archive-intake-write"])?;
    queue_archive_ingest_request(&app, request)
}

#[tauri::command]
fn archive_queue_imported_library_ingest(
    app: AppHandle,
    request: ArchiveQueueImportedLibraryRequest,
) -> Result<ArchiveQueueImportedLibraryResult, String> {
    assert_living_archive_host_access(&app, &["archive-read", "archive-intake-write"])?;
    queue_imported_library_for_ingest(&app, request)
}

#[tauri::command]
fn archive_review_queue(app: AppHandle) -> Result<Vec<ArchiveQueuedIngestRequest>, String> {
    assert_living_archive_host_access(&app, &["archive-read"])?;
    list_archive_ingest_requests(&app)
}

#[tauri::command]
fn archive_review_artifacts(app: AppHandle) -> Result<Vec<ArchiveReviewArtifact>, String> {
    assert_living_archive_host_access(&app, &["archive-read"])?;
    list_archive_review_artifacts(&app)
}

#[tauri::command]
fn archive_tol_bundle_candidates(app: AppHandle) -> Result<Vec<ArchiveTolBundleCandidate>, String> {
    assert_living_archive_host_access(&app, &["archive-read"])?;
    list_archive_tol_bundle_candidates(&app)
}

#[tauri::command]
fn archive_build_tol_bundle(
    app: AppHandle,
    request: ArchiveTolBundleBuildRequest,
) -> Result<ArchiveTolBundleBuildResult, String> {
    assert_living_archive_host_access(&app, &["archive-intake-write"])?;
    build_archive_tol_bundle(&app, request)
}

#[tauri::command]
async fn archive_process_ingest_request(
    app: AppHandle,
    request: ArchiveProcessIngestRequest,
) -> Result<ArchiveProcessIngestResult, String> {
    assert_living_archive_host_access(&app, &["archive-read", "providers", "filesystem"])?;
    process_archive_ingest_request(&app, request).await
}

#[tauri::command]
async fn archive_maintenance_cycle(
    app: AppHandle,
    request: ArchiveMaintenanceCycleRequest,
) -> Result<ArchiveMaintenanceCycleResult, String> {
    assert_living_archive_host_access(&app, &["archive-read", "providers", "filesystem"])?;
    run_archive_maintenance_cycle(&app, request).await
}

#[tauri::command]
async fn archive_ai_memory_build_job(
    app: AppHandle,
    request: ArchiveAiMemoryBuildRequest,
) -> Result<ArchiveAiMemoryBuildResult, String> {
    assert_living_archive_host_access(
        &app,
        &[
            "archive-read",
            "archive-intake-write",
            "providers",
            "filesystem",
        ],
    )?;
    run_archive_ai_memory_build_job(&app, request).await
}

#[tauri::command]
fn archive_ai_memory_build_jobs(
    app: AppHandle,
) -> Result<Vec<ArchiveAiMemoryBuildJobSummary>, String> {
    assert_living_archive_host_access(&app, &["archive-read"])?;
    list_archive_ai_memory_build_jobs(&app)
}

#[tauri::command]
async fn archive_background_cycle(
    app: AppHandle,
    request: ArchiveBackgroundCycleRequest,
) -> Result<ArchiveBackgroundCycleResult, String> {
    assert_living_archive_host_access(&app, &["archive-read", "providers", "filesystem"])?;
    run_archive_background_cycle(&app, request).await
}

#[tauri::command]
fn archive_review_decision(
    app: AppHandle,
    request: ArchiveReviewDecisionRequest,
) -> Result<ArchiveReviewDecisionResult, String> {
    assert_living_archive_host_access(&app, &["archive-read", "filesystem"])?;
    decide_archive_review_artifact(&app, request)
}

#[tauri::command]
fn archive_promote_review_artifact(
    app: AppHandle,
    request: ArchivePromoteReviewArtifactRequest,
) -> Result<ArchivePromoteReviewArtifactResult, String> {
    assert_living_archive_host_access(&app, &["archive-read", "filesystem"])?;
    promote_archive_review_artifact(&app, request)
}

#[tauri::command]
fn archive_refresh_wiki_navigation(
    app: AppHandle,
) -> Result<ArchiveWikiNavigationRefreshResult, String> {
    assert_living_archive_host_access(&app, &["archive-read", "filesystem"])?;
    refresh_archive_wiki_navigation(&app)
}

#[tauri::command]
fn archive_lint(app: AppHandle) -> Result<ArchiveLintResult, String> {
    assert_living_archive_host_access(&app, &["archive-read", "filesystem"])?;
    lint_archive(&app)
}

#[tauri::command]
async fn archive_semantic_lint(
    app: AppHandle,
    request: ArchiveSemanticLintRequest,
) -> Result<ArchiveSemanticLintResult, String> {
    assert_living_archive_host_access(&app, &["archive-read", "providers", "filesystem"])?;
    semantic_lint_archive(&app, request).await
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
fn provider_request_audit(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<ProviderRequestAuditRecord>, String> {
    query_provider_request_audit(&app, limit)
}

#[tauri::command]
async fn provider_service_chat_completion(
    app: AppHandle,
    request_id: Option<String>,
    thread_id: Option<String>,
    agent_id: Option<String>,
    channel_id: Option<String>,
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
            request_id,
            thread_id,
            agent_id,
            channel_id,
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
    thread_id: Option<String>,
    agent_id: Option<String>,
    channel_id: Option<String>,
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
            thread_id,
            agent_id,
            channel_id,
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
async fn provider_smoke_test(
    app: AppHandle,
    provider_id: String,
    provider_type: String,
    api_base_url: Option<String>,
    runtime_node_id: Option<String>,
    runtime_node_kind: Option<String>,
    runtime_node_endpoint: Option<String>,
    auth_tier: Option<String>,
    model: String,
) -> Result<ProviderSmokeTestResult, String> {
    execute_provider_smoke_test(
        &app,
        ProviderServiceChatRequest {
            request_id: Some("provider-smoke-test".to_string()),
            thread_id: None,
            agent_id: None,
            channel_id: None,
            provider_id,
            provider_type,
            api_base_url,
            runtime_node_id,
            runtime_node_kind,
            runtime_node_endpoint,
            auth_tier,
            model,
            reasoning_effort: "minimal".to_string(),
            system_prompt: String::new(),
            messages: Vec::new(),
        },
    )
    .await
}

#[tauri::command]
async fn provider_setup_probe(
    app: AppHandle,
    provider_id: String,
    provider_type: String,
    api_base_url: Option<String>,
    runtime_node_kind: Option<String>,
    runtime_node_endpoint: Option<String>,
    auth_tier: Option<String>,
) -> Result<ProviderSetupProbeResult, String> {
    execute_provider_setup_probe(
        &app,
        ProviderSetupProbeRequest {
            provider_id,
            provider_type,
            api_base_url,
            runtime_node_kind,
            runtime_node_endpoint,
            auth_tier,
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
    let _ = prepare_native_browser_application_if_available();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .menu(|app| {
            let quit = MenuItem::with_id(
                app,
                "resonantos.quit",
                "Quit ResonantOS",
                true,
                Some("Cmd+Q"),
            )?;
            let app_menu = Submenu::with_items(app, "ResonantOS", true, &[&quit])?;
            Menu::with_items(app, &[&app_menu])
        })
        .on_menu_event(|app, event| {
            if event.id() == "resonantos.quit" {
                app.exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_runtime_state,
            save_runtime_state,
            delegation_create_task_workspace,
            delegation_list_task_workspaces,
            delegation_read_task_workspace,
            delegation_finish_task_workspace,
            delegation_execute_opencode_task,
            list_sideloaded_addons,
            sideload_addon_manifest,
            compute_local_passive_diagnostics,
            compute_local_safe_command,
            compute_remote_probe,
            compute_gx10_llama_status,
            compute_gx10_llama_switch,
            compute_nas_backup_status,
            load_provider_secret_statuses,
            save_provider_secret,
            telegram_save_bot_token,
            telegram_service_status,
            telegram_service_start,
            telegram_service_stop,
            local_runtime_status,
            archive_runtime_status,
            audio2tol_analyze_tol_transcript,
            audio2tol_detect_whisper_cpp,
            audio2tol_get_pipeline_progress,
            audio2tol_import_audio_files,
            audio2tol_install_whisper_cpp,
            audio2tol_open_path,
            audio2tol_plan_import_audio_files,
            audio2tol_process_audio_batch,
            audio2tol_process_tol_file,
            audio2tol_scan_audio_files,
            audio2tol_transcribe_audio_file,
            archive_scan_source_folders,
            archive_preflight_library_import,
            archive_import_library,
            archive_imported_libraries,
            archive_library_classification_review,
            archive_library_reorganisation_plan,
            archive_system_memory,
            archive_refresh_system_memory,
            archive_search,
            archive_read_document,
            obsidian_vault_status,
            obsidian_list_notes,
            obsidian_read_note,
            obsidian_open_note,
            obsidian_write_note,
            obsidian_create_note,
            obsidian_create_folder,
            obsidian_move_note,
            obsidian_archive_note,
            obsidian_vault_index,
            browser_engine_status,
            browser_install_engine,
            browser_open_url,
            browser_start_session,
            browser_session_open_url,
            browser_session_screenshot,
            browser_session_read_page,
            browser_session_click,
            browser_session_scroll,
            browser_close_session,
            browser_host_command,
            browser_visible_host_command,
            browser_native_webview_show,
            browser_native_webview_resize,
            browser_native_webview_hide,
            browser_native_webview_click,
            browser_native_webview_scroll,
            browser_native_webview_type_text,
            browser_native_probe,
            browser_native_attach_smoke,
            browser_native_bridge_probe,
            hermes_status,
            hermes_install,
            hermes_workspace_snapshot,
            hermes_dashboard_status,
            hermes_dashboard_start,
            hermes_dashboard_stop,
            hermes_chat,
            living_archive_memory_service_status,
            living_archive_memory_service_start,
            living_archive_memory_service_stop,
            opencode_status,
            opencode_start_service,
            opencode_stop_service,
            opencode_record_trust_event,
            opencode_inject_prompt,
            paperclip_status,
            paperclip_start_service,
            paperclip_stop_service,
            paperclip_dashboard_snapshot,
            paperclip_create_issue_from_delegation,
            terminal_status,
            terminal_run_command,
            terminal_start_pty,
            terminal_write_pty,
            terminal_resize_pty,
            terminal_stop_pty,
            archive_write_intake_artifact,
            archive_request_ingest,
            archive_queue_imported_library_ingest,
            archive_review_queue,
            archive_review_artifacts,
            archive_tol_bundle_candidates,
            archive_build_tol_bundle,
            archive_process_ingest_request,
            archive_maintenance_cycle,
            archive_ai_memory_build_job,
            archive_ai_memory_build_jobs,
            archive_background_cycle,
            archive_review_decision,
            archive_promote_review_artifact,
            archive_refresh_wiki_navigation,
            archive_lint,
            archive_semantic_lint,
            engineer_recovery_turn,
            recovery_route_candidates,
            provider_diagnostics,
            provider_request_audit,
            provider_smoke_test,
            provider_setup_probe,
            provider_service_chat_completion,
            provider_service_chat_completion_stream,
            provider_service_abort_chat_completion,
            archive_ingest_probe
        ])
        .run(tauri::generate_context!())
        .expect("error while running ResonantOS vNext");
}
