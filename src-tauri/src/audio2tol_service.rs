use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, LazyLock, Mutex,
};
use std::thread;
use std::time::SystemTime;

use chrono::{DateTime, Local};
use serde_json::Value;
use tauri::Emitter;

use crate::host_state::{
    assert_addon_capabilities, read_runtime_state_value, resolve_provider_secret,
};

const AUDIO2TOL_ADDON_ID: &str = "addon.audio2tol";

fn assert_audio2tol_capabilities(
    app: &tauri::AppHandle,
    capabilities: &[&str],
) -> Result<(), String> {
    assert_addon_capabilities(app, AUDIO2TOL_ADDON_ID, capabilities)
}

#[derive(serde::Serialize)]
pub(crate) struct AudioScanResult {
    count: usize,
    files: Vec<String>,
}

#[derive(serde::Serialize)]
pub(crate) struct ImportResult {
    source: String,
    destination: Option<String>,
    status: String,
    message: String,
    backups: Vec<BackupImportResult>,
}

#[derive(serde::Serialize)]
pub(crate) struct ImportPlanResult {
    total_count: usize,
    new_count: usize,
    existing_count: usize,
    new_files: Vec<String>,
    existing_files: Vec<String>,
}

#[derive(serde::Serialize)]
pub(crate) struct ProcessFileResult {
    source: String,
    imported_path: String,
    transcript_path: String,
    analysis_path: Option<String>,
    status: String,
    message: String,
}

#[derive(serde::Serialize)]
pub(crate) struct BatchProcessingResult {
    completed_count: usize,
    failed_count: usize,
}

#[derive(serde::Serialize)]
pub(crate) struct TranscriptionResult {
    source: String,
    imported_path: String,
    transcript_path: String,
    status: String,
    message: String,
}

#[derive(serde::Serialize)]
pub(crate) struct AnalysisResult {
    source: String,
    imported_path: String,
    transcript_path: String,
    analysis_path: Option<String>,
    status: String,
    message: String,
}

#[derive(serde::Serialize)]
pub(crate) struct BackupImportResult {
    folder: String,
    destination: Option<String>,
    status: String,
    message: String,
}

struct Audio2TolProviderRoute {
    provider: String,
    model: String,
    endpoint: String,
    api_key: String,
}

#[derive(serde::Serialize)]
pub(crate) struct WhisperDetectionResult {
    found: bool,
    path: Option<String>,
    version: Option<String>,
    message: String,
}

#[derive(serde::Serialize, Clone)]
pub(crate) struct ProgressEvent {
    stage: String,
    status: String,
    source: Option<String>,
    detail: String,
    elapsed_seconds: Option<u64>,
}

static PIPELINE_PROGRESS: LazyLock<Mutex<Option<ProgressEvent>>> =
    LazyLock::new(|| Mutex::new(None));

#[tauri::command]
pub(crate) fn audio2tol_plan_import_audio_files(
    app: tauri::AppHandle,
    files: Vec<String>,
    destination_folder: String,
    transcript_folder: String,
    transcript_format: String,
    final_output_folder: String,
    final_output_format: String,
    analysis_mode: String,
) -> Result<ImportPlanResult, String> {
    assert_audio2tol_capabilities(&app, &["filesystem"])?;

    let destination_root = PathBuf::from(destination_folder);

    if !destination_root.exists() {
        fs::create_dir_all(&destination_root).map_err(|error| {
            format!(
                "Could not create audio destination folder {}: {error}",
                destination_root.display()
            )
        })?;
    }

    if !destination_root.is_dir() {
        return Err("Audio destination path is not a folder.".to_string());
    }

    let mut new_files = Vec::new();
    let mut existing_files = Vec::new();
    let transcript_extension = normalize_extension(&transcript_format, "md");
    let analysis_extension = normalize_extension(&final_output_format, "md");
    let analysis_enabled = analysis_mode != "off";

    for source in files {
        let source_path = PathBuf::from(&source);
        let Some(file_name) = source_path.file_name() else {
            continue;
        };

        let destination_path = destination_root.join(file_name);
        if !destination_path.exists() {
            new_files.push(source);
            continue;
        }

        let timestamp = recording_timestamp(&destination_path)?;
        let transcript_path = PathBuf::from(&transcript_folder)
            .join(format!("{timestamp}_TOL_Transcript.{transcript_extension}"));
        let analysis_path = PathBuf::from(&final_output_folder)
            .join(format!("{timestamp}_TOL_Analysis.{analysis_extension}"));
        let transcript_exists = transcript_path.is_file();
        let analysis_exists = !analysis_enabled || analysis_path.is_file();

        if transcript_exists && analysis_exists {
            existing_files.push(source);
        } else {
            new_files.push(source);
        }
    }

    Ok(ImportPlanResult {
        total_count: new_files.len() + existing_files.len(),
        new_count: new_files.len(),
        existing_count: existing_files.len(),
        new_files,
        existing_files,
    })
}

#[tauri::command]
pub(crate) fn audio2tol_import_audio_files(
    app: tauri::AppHandle,
    files: Vec<String>,
    destination_folder: String,
    backup_folders: Vec<String>,
) -> Result<Vec<ImportResult>, String> {
    assert_audio2tol_capabilities(&app, &["filesystem"])?;

    let destination_root = PathBuf::from(destination_folder);

    if !destination_root.exists() {
        fs::create_dir_all(&destination_root).map_err(|error| {
            format!(
                "Could not create audio destination folder {}: {error}",
                destination_root.display()
            )
        })?;
    }

    if !destination_root.is_dir() {
        return Err("Audio destination path is not a folder.".to_string());
    }

    for folder in &backup_folders {
        let backup_root = PathBuf::from(folder);

        if !backup_root.exists() {
            fs::create_dir_all(&backup_root).map_err(|error| {
                format!(
                    "Could not create backup folder {}: {error}",
                    backup_root.display()
                )
            })?;
        }

        if !backup_root.is_dir() {
            return Err(format!(
                "Backup path is not a folder: {}",
                backup_root.display()
            ));
        }
    }

    let mut results = Vec::new();

    for source in files {
        let source_path = PathBuf::from(&source);
        let Some(file_name) = source_path.file_name() else {
            results.push(ImportResult {
                source,
                destination: None,
                status: "failed".to_string(),
                message: "Source path has no filename.".to_string(),
                backups: Vec::new(),
            });
            continue;
        };

        if !source_path.is_file() {
            results.push(ImportResult {
                source,
                destination: None,
                status: "failed".to_string(),
                message: "Source file does not exist.".to_string(),
                backups: Vec::new(),
            });
            continue;
        }

        let destination_path = destination_root.join(file_name);
        let (status, message) = copy_preserving_existing(&source_path, &destination_path);
        let backups = backup_folders
            .iter()
            .map(|folder| {
                let backup_path = PathBuf::from(folder).join(file_name);
                let (status, message) = copy_preserving_existing(&source_path, &backup_path);

                BackupImportResult {
                    folder: folder.clone(),
                    destination: Some(backup_path.to_string_lossy().to_string()),
                    status,
                    message,
                }
            })
            .collect();

        results.push(ImportResult {
            source,
            destination: Some(destination_path.to_string_lossy().to_string()),
            status,
            message,
            backups,
        });
    }

    Ok(results)
}

#[tauri::command]
pub(crate) fn audio2tol_open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    assert_audio2tol_capabilities(&app, &["filesystem", "shell"])?;

    let target = PathBuf::from(path);

    if !target.exists() {
        return Err(format!("Path does not exist: {}", target.display()));
    }

    Command::new("open")
        .arg(target)
        .spawn()
        .map_err(|error| format!("Could not open path: {error}"))?;

    Ok(())
}

#[tauri::command]
pub(crate) fn audio2tol_transcribe_audio_file(
    app: tauri::AppHandle,
    source: String,
    imported_path: String,
    whisper_path: String,
    whisper_model: String,
    transcript_folder: String,
    transcript_format: String,
    language: String,
) -> Result<TranscriptionResult, String> {
    assert_audio2tol_capabilities(&app, &["filesystem", "shell"])?;

    let imported = PathBuf::from(&imported_path);

    if !imported.is_file() {
        return Err(format!(
            "Imported audio file does not exist: {}",
            imported.display()
        ));
    }

    let timestamp = recording_timestamp(&imported)?;
    let transcript_dir = ensure_folder(&transcript_folder, "transcript folder")?;
    let transcript_extension = normalize_extension(&transcript_format, "md");
    let transcript_path =
        transcript_dir.join(format!("{timestamp}_TOL_Transcript.{transcript_extension}"));
    let model_path = ensure_whisper_model(&whisper_model)?;

    let stop_heartbeat = Arc::new(AtomicBool::new(false));
    let heartbeat_flag = stop_heartbeat.clone();
    let heartbeat_app = app.clone();
    let heartbeat_source = source.clone();
    let _ = emit_progress(
        &app,
        "transcribing",
        "started",
        Some(source.clone()),
        format!("Starting Whisper transcription for {}", imported.display()),
        None,
    );
    let heartbeat = thread::spawn(move || {
        let started_at = std::time::Instant::now();
        while !heartbeat_flag.load(Ordering::Relaxed) {
            let elapsed = started_at.elapsed().as_secs();
            let _ = emit_progress(
                &heartbeat_app,
                "transcribing",
                "running",
                Some(heartbeat_source.clone()),
                "Whisper transcription in progress.".to_string(),
                Some(elapsed),
            );
            thread::sleep(std::time::Duration::from_secs(1));
        }
    });

    let transcribe_result = run_whisper(
        &whisper_path,
        &model_path,
        &imported,
        &transcript_path,
        &language,
    );
    stop_heartbeat.store(true, Ordering::Relaxed);
    let _ = heartbeat.join();
    transcribe_result?;
    let _ = emit_progress(
        &app,
        "transcribing",
        "completed",
        Some(source.clone()),
        format!("Transcript created at {}", transcript_path.display()),
        None,
    );

    Ok(TranscriptionResult {
        source,
        imported_path,
        transcript_path: transcript_path.to_string_lossy().to_string(),
        status: "transcribed".to_string(),
        message: "Transcript created.".to_string(),
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub(crate) fn audio2tol_analyze_tol_transcript(
    app: tauri::AppHandle,
    source: String,
    imported_path: String,
    transcript_path: String,
    llm_provider: String,
    provider_profile_id: String,
    runtime_node_id: String,
    llm_model: String,
    api_endpoint: String,
    fallback_provider: String,
    fallback_provider_profile_id: String,
    fallback_runtime_node_id: String,
    fallback_model: String,
    fallback_endpoint: String,
    protocol_path: String,
    template_path: String,
    final_output_folder: String,
    final_output_format: String,
) -> Result<AnalysisResult, String> {
    assert_audio2tol_capabilities(&app, &["filesystem", "providers"])?;

    let imported = PathBuf::from(&imported_path);
    let transcript_file = PathBuf::from(&transcript_path);

    if !transcript_file.is_file() {
        return Err(format!(
            "Transcript file does not exist: {}",
            transcript_file.display()
        ));
    }

    if llm_provider == "Analysis off" {
        let _ = emit_progress(
            &app,
            "analyzing",
            "completed",
            Some(source.clone()),
            "Analysis disabled. Transcript only.".to_string(),
            None,
        );
        return Ok(AnalysisResult {
            source,
            imported_path,
            transcript_path,
            analysis_path: None,
            status: "transcribed".to_string(),
            message: "Analysis is off. Transcript created only.".to_string(),
        });
    }

    let timestamp = recording_timestamp(&imported)?;
    let output_dir = ensure_folder(&final_output_folder, "final output folder")?;
    let final_extension = normalize_extension(&final_output_format, "md");
    let analysis_path = output_dir.join(format!("{timestamp}_TOL_Analysis.{final_extension}"));
    let transcript = fs::read_to_string(&transcript_file).map_err(|error| {
        format!(
            "Could not read generated transcript {}: {error}",
            transcript_file.display()
        )
    })?;
    let protocol = read_text_file(&protocol_path)?;
    let template = read_text_file(&template_path)?;
    let primary_route = resolve_audio2tol_provider_route(
        &app,
        &provider_profile_id,
        &runtime_node_id,
        &llm_provider,
        &llm_model,
        &api_endpoint,
    )?;
    let fallback_route = resolve_audio2tol_provider_route(
        &app,
        &fallback_provider_profile_id,
        &fallback_runtime_node_id,
        &fallback_provider,
        &fallback_model,
        &fallback_endpoint,
    )?;
    let stop_heartbeat = Arc::new(AtomicBool::new(false));
    let heartbeat_flag = stop_heartbeat.clone();
    let heartbeat_app = app.clone();
    let heartbeat_source = source.clone();
    let _ = emit_progress(
        &app,
        "analyzing",
        "started",
        Some(source.clone()),
        format!(
            "Submitting transcript {} for TOL analysis",
            transcript_file.display()
        ),
        None,
    );
    let heartbeat = thread::spawn(move || {
        let started_at = std::time::Instant::now();
        while !heartbeat_flag.load(Ordering::Relaxed) {
            let elapsed = started_at.elapsed().as_secs();
            let _ = emit_progress(
                &heartbeat_app,
                "analyzing",
                "running",
                Some(heartbeat_source.clone()),
                "LLM analysis in progress.".to_string(),
                Some(elapsed),
            );
            thread::sleep(std::time::Duration::from_secs(1));
        }
    });
    let rendered_result = run_llm_analysis_with_fallback(
        &primary_route.provider,
        &primary_route.model,
        &primary_route.endpoint,
        &primary_route.api_key,
        &fallback_route.provider,
        &fallback_route.model,
        &fallback_route.endpoint,
        &fallback_route.api_key,
        &protocol,
        &template,
        &transcript,
        &timestamp,
        &imported,
        &transcript_file,
    );
    stop_heartbeat.store(true, Ordering::Relaxed);
    let _ = heartbeat.join();
    let rendered = rendered_result?;

    fs::write(&analysis_path, rendered).map_err(|error| {
        format!(
            "Could not write final analysis {}: {error}",
            analysis_path.display()
        )
    })?;
    let _ = emit_progress(
        &app,
        "analyzing",
        "completed",
        Some(source.clone()),
        format!("Analysis created at {}", analysis_path.display()),
        None,
    );

    Ok(AnalysisResult {
        source,
        imported_path,
        transcript_path,
        analysis_path: Some(analysis_path.to_string_lossy().to_string()),
        status: "completed".to_string(),
        message: "Final TOL analysis created.".to_string(),
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub(crate) fn audio2tol_process_tol_file(
    app: tauri::AppHandle,
    source: String,
    imported_path: String,
    whisper_path: String,
    whisper_model: String,
    transcript_folder: String,
    transcript_format: String,
    language: String,
    llm_provider: String,
    llm_model: String,
    api_endpoint: String,
    api_key: String,
    protocol_path: String,
    template_path: String,
    final_output_folder: String,
    final_output_format: String,
) -> Result<ProcessFileResult, String> {
    assert_audio2tol_capabilities(&app, &["filesystem", "shell", "providers"])?;

    let imported = PathBuf::from(&imported_path);

    if !imported.is_file() {
        return Err(format!(
            "Imported audio file does not exist: {}",
            imported.display()
        ));
    }

    let timestamp = recording_timestamp(&imported)?;
    let transcript_dir = ensure_folder(&transcript_folder, "transcript folder")?;
    let output_dir = ensure_folder(&final_output_folder, "final output folder")?;
    let transcript_extension = normalize_extension(&transcript_format, "md");
    let final_extension = normalize_extension(&final_output_format, "md");
    let transcript_path =
        transcript_dir.join(format!("{timestamp}_TOL_Transcript.{transcript_extension}"));
    let analysis_path = output_dir.join(format!("{timestamp}_TOL_Analysis.{final_extension}"));

    let model_path = ensure_whisper_model(&whisper_model)?;
    run_whisper(
        &whisper_path,
        &model_path,
        &imported,
        &transcript_path,
        &language,
    )?;

    let transcript = fs::read_to_string(&transcript_path).map_err(|error| {
        format!(
            "Could not read generated transcript {}: {error}",
            transcript_path.display()
        )
    })?;

    if llm_provider == "Analysis off" {
        return Ok(ProcessFileResult {
            source,
            imported_path,
            transcript_path: transcript_path.to_string_lossy().to_string(),
            analysis_path: None,
            status: "transcribed".to_string(),
            message: "Transcript created. Analysis is off.".to_string(),
        });
    }

    let protocol = read_text_file(&protocol_path)?;
    let template = read_text_file(&template_path)?;
    let rendered = run_llm_analysis(
        &llm_provider,
        &llm_model,
        &api_endpoint,
        &api_key,
        &protocol,
        &template,
        &transcript,
        &timestamp,
        &imported,
        &transcript_path,
    )?;

    fs::write(&analysis_path, rendered).map_err(|error| {
        format!(
            "Could not write final analysis {}: {error}",
            analysis_path.display()
        )
    })?;

    Ok(ProcessFileResult {
        source,
        imported_path,
        transcript_path: transcript_path.to_string_lossy().to_string(),
        analysis_path: Some(analysis_path.to_string_lossy().to_string()),
        status: "completed".to_string(),
        message: "Transcript and final TOL analysis created.".to_string(),
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub(crate) fn audio2tol_process_audio_batch(
    app: tauri::AppHandle,
    files: Vec<String>,
    destination_folder: String,
    backup_folders: Vec<String>,
    whisper_path: String,
    whisper_model: String,
    transcript_folder: String,
    transcript_format: String,
    language: String,
    llm_provider: String,
    llm_model: String,
    api_endpoint: String,
    _api_key: String,
    protocol_path: String,
    template_path: String,
    final_output_folder: String,
    final_output_format: String,
) -> Result<BatchProcessingResult, String> {
    assert_audio2tol_capabilities(&app, &["filesystem", "shell", "providers"])?;

    let _ = emit_progress(
        &app,
        "importing",
        "started",
        None,
        format!(
            "Importing {} new audio file{}.",
            files.len(),
            if files.len() == 1 { "" } else { "s" }
        ),
        None,
    );

    let results =
        audio2tol_import_audio_files(app.clone(), files, destination_folder, backup_folders)?;
    let mut completed_count = 0usize;
    let mut failed_count = 0usize;

    for result in results {
        let source_name = Path::new(&result.source)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(&result.source)
            .to_string();

        let _ = emit_progress(
            &app,
            "importing",
            "running",
            Some(result.source.clone()),
            format!(
                "{source_name} {status}: {message}",
                status = result.status,
                message = result.message
            ),
            None,
        );

        if result.status == "failed" {
            failed_count += 1;
            continue;
        }

        let Some(imported_path) = result.destination.clone() else {
            failed_count += 1;
            continue;
        };

        let transcribed = match audio2tol_transcribe_audio_file(
            app.clone(),
            result.source.clone(),
            imported_path.clone(),
            whisper_path.clone(),
            whisper_model.clone(),
            transcript_folder.clone(),
            transcript_format.clone(),
            language.clone(),
        ) {
            Ok(value) => value,
            Err(error) => {
                failed_count += 1;
                let _ = emit_progress(
                    &app,
                    "transcribing",
                    "completed",
                    Some(result.source.clone()),
                    format!("{source_name} failed during transcription: {error}"),
                    None,
                );
                continue;
            }
        };

        if llm_provider == "Analysis off" {
            completed_count += 1;
            continue;
        }

        match audio2tol_analyze_tol_transcript(
            app.clone(),
            result.source.clone(),
            transcribed.imported_path,
            transcribed.transcript_path,
            llm_provider.clone(),
            "shared-minimax".to_string(),
            "node-minimax-cloud".to_string(),
            llm_model.clone(),
            api_endpoint.clone(),
            "GX10 Qwen 35B".to_string(),
            "gx10-local-llama".to_string(),
            "node-gx10-qwen".to_string(),
            "Qwen3.6-35B-A3B-Q4_K_M.gguf".to_string(),
            "http://192.168.1.77:30004/v1".to_string(),
            protocol_path.clone(),
            template_path.clone(),
            final_output_folder.clone(),
            final_output_format.clone(),
        ) {
            Ok(_) => {
                completed_count += 1;
            }
            Err(error) => {
                failed_count += 1;
                let _ = emit_progress(
                    &app,
                    "analyzing",
                    "completed",
                    Some(result.source.clone()),
                    format!("{source_name} failed during analysis: {error}"),
                    None,
                );
            }
        }
    }

    let final_stage = if failed_count > 0 {
        "failed"
    } else {
        "completed"
    };
    let _ = emit_progress(
        &app,
        final_stage,
        "completed",
        None,
        format!("Processing finished. {completed_count} completed, {failed_count} failed."),
        None,
    );

    Ok(BatchProcessingResult {
        completed_count,
        failed_count,
    })
}

fn copy_preserving_existing(source: &Path, destination: &Path) -> (String, String) {
    if destination.exists() {
        return (
            "skipped".to_string(),
            "Destination file already exists. Skipped to avoid duplicate import.".to_string(),
        );
    }

    match fs::copy(source, destination) {
        Ok(_) => ("copied".to_string(), "Copied successfully.".to_string()),
        Err(error) => ("failed".to_string(), format!("Copy failed: {error}")),
    }
}

fn ensure_folder(path: &str, label: &str) -> Result<PathBuf, String> {
    let folder = PathBuf::from(path);

    if !folder.exists() {
        fs::create_dir_all(&folder)
            .map_err(|error| format!("Could not create {label} {}: {error}", folder.display()))?;
    }

    if !folder.is_dir() {
        return Err(format!(
            "Selected {label} is not a folder: {}",
            folder.display()
        ));
    }

    Ok(folder)
}

fn normalize_extension(extension: &str, fallback: &str) -> String {
    let normalized = extension
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase();

    if normalized.is_empty() {
        fallback.to_string()
    } else {
        normalized
    }
}

fn recording_timestamp(path: &Path) -> Result<String, String> {
    let modified = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or_else(|_| SystemTime::now());
    let datetime: DateTime<Local> = modified.into();

    Ok(datetime.format("%Y-%m-%d-%H%M").to_string())
}

fn ensure_whisper_model(model: &str) -> Result<PathBuf, String> {
    let model_name = model.trim();
    let requested = if model_name.is_empty() {
        "large-v3"
    } else {
        model_name
    };
    let filename = if requested.ends_with(".bin") {
        requested.to_string()
    } else if requested.starts_with("ggml-") {
        format!("{requested}.bin")
    } else {
        format!("ggml-{requested}.bin")
    };

    let mut candidates = vec![
        PathBuf::from("/opt/homebrew/share/whisper-cpp").join(&filename),
        PathBuf::from("/usr/local/share/whisper-cpp").join(&filename),
        PathBuf::from("/opt/homebrew/Cellar/whisper-cpp/1.8.4/share/whisper-cpp").join(&filename),
    ];

    if let Some(home) = std::env::var_os("HOME") {
        candidates.push(
            PathBuf::from(&home)
                .join(".cache/audio2tol/models")
                .join(&filename),
        );
        candidates.push(
            PathBuf::from(&home)
                .join("Library/Application Support/Audio2TOL/models")
                .join(&filename),
        );
    }

    for candidate in &candidates {
        if candidate.is_file() {
            return Ok(candidate.clone());
        }
    }

    let Some(home) = std::env::var_os("HOME") else {
        return Err("Could not locate home folder for Whisper model download.".to_string());
    };
    let model_dir = PathBuf::from(home).join(".cache/audio2tol/models");
    fs::create_dir_all(&model_dir).map_err(|error| {
        format!(
            "Could not create Whisper model folder {}: {error}",
            model_dir.display()
        )
    })?;
    let destination = model_dir.join(&filename);
    let url = format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{filename}");

    let status = Command::new("curl")
        .arg("-L")
        .arg("--fail")
        .arg("--progress-bar")
        .arg("-o")
        .arg(&destination)
        .arg(&url)
        .status()
        .map_err(|error| format!("Could not start Whisper model download: {error}"))?;

    if !status.success() {
        let _ = fs::remove_file(&destination);
        return Err(format!(
            "Could not download Whisper model {filename}. URL: {url}"
        ));
    }

    Ok(destination)
}

fn run_whisper(
    whisper_path: &str,
    model_path: &Path,
    audio_path: &Path,
    transcript_path: &Path,
    language: &str,
) -> Result<(), String> {
    let output_stem = transcript_path.with_extension("");
    let thread_count = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(4)
        .clamp(4, 12);
    let language_arg = match language {
        "Auto Detect" => "auto",
        "English" => "en",
        "Italian" => "it",
        "French" => "fr",
        "Spanish" => "es",
        "German" => "de",
        other => other,
    };

    let output = Command::new(whisper_path)
        .arg("-m")
        .arg(model_path)
        .arg("-f")
        .arg(audio_path)
        .arg("-t")
        .arg(thread_count.to_string())
        .arg("-l")
        .arg(language_arg)
        .arg("-otxt")
        .arg("-nt")
        .arg("-of")
        .arg(&output_stem)
        .arg("-bo")
        .arg("5")
        .arg("-bs")
        .arg("5")
        .output()
        .map_err(|error| format!("Could not start whisper.cpp: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "whisper.cpp failed.\nSTDOUT:\n{stdout}\nSTDERR:\n{stderr}"
        ));
    }

    let generated_txt = output_stem.with_extension("txt");

    if !generated_txt.is_file() {
        return Err(format!(
            "whisper.cpp finished but did not create expected transcript {}",
            generated_txt.display()
        ));
    }

    if transcript_path.extension().and_then(|value| value.to_str()) == Some("txt") {
        if generated_txt != transcript_path {
            fs::rename(&generated_txt, transcript_path).map_err(|error| {
                format!(
                    "Could not move transcript to {}: {error}",
                    transcript_path.display()
                )
            })?;
        }
        return Ok(());
    }

    let transcript = fs::read_to_string(&generated_txt).map_err(|error| {
        format!(
            "Could not read transcript {}: {error}",
            generated_txt.display()
        )
    })?;
    fs::write(transcript_path, transcript).map_err(|error| {
        format!(
            "Could not write transcript {}: {error}",
            transcript_path.display()
        )
    })?;
    let _ = fs::remove_file(generated_txt);

    Ok(())
}

fn emit_progress(
    app: &tauri::AppHandle,
    stage: &str,
    status: &str,
    source: Option<String>,
    detail: String,
    elapsed_seconds: Option<u64>,
) -> Result<(), String> {
    let event = ProgressEvent {
        stage: stage.to_string(),
        status: status.to_string(),
        source,
        detail,
        elapsed_seconds,
    };

    if let Ok(mut progress) = PIPELINE_PROGRESS.lock() {
        *progress = Some(event.clone());
    }

    app.emit("audio2tol-pipeline-progress", event)
        .map_err(|error| format!("Could not emit progress event: {error}"))
}

#[tauri::command]
pub(crate) fn audio2tol_get_pipeline_progress() -> Option<ProgressEvent> {
    PIPELINE_PROGRESS
        .lock()
        .ok()
        .and_then(|progress| progress.clone())
}

fn resolve_audio2tol_provider_route(
    app: &tauri::AppHandle,
    provider_profile_id: &str,
    runtime_node_id: &str,
    fallback_provider_label: &str,
    model: &str,
    fallback_endpoint: &str,
) -> Result<Audio2TolProviderRoute, String> {
    if provider_profile_id.trim().is_empty() && fallback_provider_label == "Analysis off" {
        return Ok(Audio2TolProviderRoute {
            provider: "Analysis off".to_string(),
            model: String::new(),
            endpoint: String::new(),
            api_key: String::new(),
        });
    }

    let state = read_runtime_state_value(app)?.unwrap_or(Value::Null);
    let providers = state
        .get("providers")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let runtime_nodes = state
        .get("runtimeNodes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let provider = providers.iter().find(|item| {
        item.get("id")
            .and_then(Value::as_str)
            .map(|id| id == provider_profile_id)
            .unwrap_or(false)
    });
    let runtime_node = runtime_nodes.iter().find(|item| {
        item.get("id")
            .and_then(Value::as_str)
            .map(|id| id == runtime_node_id)
            .unwrap_or(false)
    });
    let provider_type = provider
        .and_then(|item| item.get("providerType"))
        .and_then(Value::as_str)
        .unwrap_or(fallback_provider_label)
        .to_string();
    let provider_label = provider
        .and_then(|item| item.get("label"))
        .and_then(Value::as_str)
        .unwrap_or(fallback_provider_label);
    let runtime_kind = runtime_node
        .and_then(|item| item.get("kind"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let endpoint = runtime_node
        .and_then(|item| item.get("endpoint"))
        .and_then(Value::as_str)
        .or_else(|| {
            provider
                .and_then(|item| item.get("apiBaseUrl"))
                .and_then(Value::as_str)
        })
        .unwrap_or(fallback_endpoint)
        .to_string();
    let provider_key = match provider_type.as_str() {
        "minimax" | "openai" | "openai-compatible" | "local" => provider_type.to_string(),
        _ => provider_label.to_string(),
    };
    let api_key =
        if runtime_kind == "cloud" || provider_type == "minimax" || provider_type == "openai" {
            resolve_provider_secret(app, provider_profile_id)?.unwrap_or_default()
        } else {
            String::new()
        };

    Ok(Audio2TolProviderRoute {
        provider: provider_key,
        model: model.to_string(),
        endpoint,
        api_key,
    })
}

#[allow(clippy::too_many_arguments)]
fn run_llm_analysis_with_fallback(
    provider: &str,
    model: &str,
    endpoint: &str,
    api_key: &str,
    fallback_provider: &str,
    fallback_model: &str,
    fallback_endpoint: &str,
    fallback_api_key: &str,
    protocol: &str,
    template: &str,
    transcript: &str,
    timestamp: &str,
    audio_path: &Path,
    transcript_path: &Path,
) -> Result<String, String> {
    match run_llm_analysis(
        provider,
        model,
        endpoint,
        api_key,
        protocol,
        template,
        transcript,
        timestamp,
        audio_path,
        transcript_path,
    ) {
        Ok(rendered) => Ok(rendered),
        Err(primary_error) => {
            if fallback_provider.trim().is_empty()
                || fallback_provider == "Analysis off"
                || fallback_endpoint.trim().is_empty()
                || fallback_model.trim().is_empty()
            {
                return Err(primary_error);
            }

            run_llm_analysis(
                fallback_provider,
                fallback_model,
                fallback_endpoint,
                fallback_api_key,
                protocol,
                template,
                transcript,
                timestamp,
                audio_path,
                transcript_path,
            )
            .map_err(|fallback_error| {
                format!("Primary analysis failed: {primary_error}\nFallback analysis failed: {fallback_error}")
            })
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_llm_analysis(
    provider: &str,
    model: &str,
    endpoint: &str,
    api_key: &str,
    protocol: &str,
    template: &str,
    transcript: &str,
    timestamp: &str,
    audio_path: &Path,
    transcript_path: &Path,
) -> Result<String, String> {
    if provider == "Ollama" || provider == "local" {
        return run_openai_compatible_chat(
            "http://localhost:11434/v1",
            model,
            "",
            protocol,
            template,
            transcript,
            timestamp,
            audio_path,
            transcript_path,
        );
    }

    if provider == "MiniMax" || provider == "minimax" {
        let endpoint = if endpoint.trim().trim_end_matches('/') == "https://api.minimax.io" {
            "https://api.minimax.io/v1"
        } else {
            endpoint
        };
        return run_openai_compatible_chat(
            endpoint,
            model,
            api_key,
            protocol,
            template,
            transcript,
            timestamp,
            audio_path,
            transcript_path,
        );
    }

    if provider == "GX10 Qwen 35B" || provider == "openai-compatible" {
        let endpoint = if endpoint.trim().is_empty() {
            "http://192.168.1.77:30004/v1"
        } else {
            endpoint
        };
        let model = if model.trim().is_empty() || model == "provider-default" {
            "Qwen3.6-35B-A3B-Q4_K_M.gguf"
        } else {
            model
        };
        return run_openai_compatible_chat(
            endpoint,
            model,
            "",
            protocol,
            template,
            transcript,
            timestamp,
            audio_path,
            transcript_path,
        );
    }

    if provider == "LM Studio"
        || provider == "OpenAI-compatible API"
        || provider == "OpenAI"
        || provider == "openai"
    {
        return run_openai_compatible_chat(
            endpoint,
            model,
            api_key,
            protocol,
            template,
            transcript,
            timestamp,
            audio_path,
            transcript_path,
        );
    }

    Err(format!(
        "{provider} analysis is not wired yet. Use MiniMax, OpenAI-compatible API, Ollama, or LM Studio for this build."
    ))
}

#[allow(clippy::too_many_arguments)]
fn run_openai_compatible_chat(
    endpoint: &str,
    model: &str,
    api_key: &str,
    protocol: &str,
    template: &str,
    transcript: &str,
    timestamp: &str,
    audio_path: &Path,
    transcript_path: &Path,
) -> Result<String, String> {
    let base = endpoint.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("LLM API endpoint is empty.".to_string());
    }

    let url = if base.ends_with("/chat/completions") {
        base.to_string()
    } else {
        format!("{base}/chat/completions")
    };
    let selected_model = if model.trim().is_empty() || model == "provider-default" {
        "MiniMax-M2.7"
    } else {
        model
    };
    let prompt =
        build_analysis_prompt(template, transcript, timestamp, audio_path, transcript_path);
    let payload = serde_json::json!({
        "model": selected_model,
        "messages": [
            {"role": "system", "content": protocol},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "stream": false
    });
    let response_body = post_json_with_curl(&url, api_key, &payload)?;
    let parsed: serde_json::Value = serde_json::from_str(&response_body)
        .map_err(|error| format!("Could not parse LLM response: {error}. Body: {response_body}"))?;

    let content = parsed
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_str())
        .map(|content| content.to_string())
        .filter(|content| !content.trim().is_empty())
        .ok_or_else(|| {
            format!("LLM response did not contain analysis content. Body: {response_body}")
        })?;

    Ok(strip_think_blocks(&content).trim().to_string())
}

fn strip_think_blocks(content: &str) -> String {
    let mut remaining = content;
    let mut cleaned = String::new();

    loop {
        let Some(start) = remaining.find("<think>") else {
            cleaned.push_str(remaining);
            break;
        };

        cleaned.push_str(&remaining[..start]);
        let after_start = &remaining[start + "<think>".len()..];

        if let Some(end) = after_start.find("</think>") {
            remaining = &after_start[end + "</think>".len()..];
        } else {
            break;
        }
    }

    cleaned
}

fn post_json_with_curl(
    url: &str,
    api_key: &str,
    payload: &serde_json::Value,
) -> Result<String, String> {
    let payload_path = std::env::temp_dir().join(format!(
        "audio2tol-llm-{}-{}.json",
        std::process::id(),
        chrono::Local::now()
            .timestamp_nanos_opt()
            .unwrap_or_default()
    ));
    let response_path = std::env::temp_dir().join(format!(
        "audio2tol-llm-response-{}-{}.json",
        std::process::id(),
        chrono::Local::now()
            .timestamp_nanos_opt()
            .unwrap_or_default()
    ));

    fs::write(
        &payload_path,
        serde_json::to_vec(payload)
            .map_err(|error| format!("Could not encode LLM payload: {error}"))?,
    )
    .map_err(|error| format!("Could not write temporary LLM payload: {error}"))?;

    let mut command = Command::new("curl");
    command
        .arg("-sS")
        .arg("-L")
        .arg("-o")
        .arg(&response_path)
        .arg("-w")
        .arg("%{http_code}")
        .arg("--connect-timeout")
        .arg("30")
        .arg("--max-time")
        .arg("300")
        .arg(url)
        .arg("-H")
        .arg("Content-Type: application/json")
        .arg("--data-binary")
        .arg(format!("@{}", payload_path.display()));

    if !api_key.trim().is_empty() {
        command
            .arg("-H")
            .arg(format!("Authorization: Bearer {}", api_key.trim()));
    }

    let output = command
        .output()
        .map_err(|error| format!("Could not start curl for LLM request: {error}"));
    let _ = fs::remove_file(&payload_path);
    let output = output?;
    let status_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let response_body = fs::read_to_string(&response_path).unwrap_or_default();
    let _ = fs::remove_file(&response_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("LLM curl request failed: {stderr}"));
    }

    if !status_text.starts_with('2') {
        return Err(format!(
            "LLM request failed with HTTP status {status_text}: {response_body}"
        ));
    }

    Ok(response_body)
}

fn build_analysis_prompt(
    template: &str,
    transcript: &str,
    timestamp: &str,
    audio_path: &Path,
    transcript_path: &Path,
) -> String {
    let (date, time) = timestamp
        .split_once('-')
        .and_then(|_| {
            if timestamp.len() >= 15 {
                Some((&timestamp[0..10], &timestamp[11..15]))
            } else {
                None
            }
        })
        .unwrap_or(("", ""));
    let transcript_filename = transcript_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let transcript_extension = transcript_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("md");
    let adjusted_template = template
        .replace(
            "03_TOL/Transcripts/[YYYY-MM-DD-HHmm].txt",
            transcript_filename,
        )
        .replace(
            "03_TOL/Transcripts/[YYYY-MM-DD-HHmm].md",
            transcript_filename,
        )
        .replace("[YYYY-MM-DD]", date)
        .replace("[HHmm]", time)
        .replace("[YYYY-MM-DD-HHmm]", timestamp)
        .replace("[[03_TOL/Transcripts/", "[[")
        .replace(".txt]]", &format!(".{transcript_extension}]]"));

    format!(
        "Use the following Obsidian markdown template and return only the completed markdown note. Do not wrap it in code fences. Do not include hidden reasoning, thinking tags, analysis prefaces, or commentary outside the note.\n\nMetadata:\n- date: {date}\n- time: {time}\n- audio filename: {}\n- transcript filename: {}\n- transcript relative link: [[{}]]\n\nTemplate:\n{template}\n\nRaw TOL transcript:\n{transcript}",
        audio_path.file_name().and_then(|value| value.to_str()).unwrap_or(""),
        transcript_filename,
        transcript_filename,
        template = adjusted_template
    )
}

fn read_text_file(path: &str) -> Result<String, String> {
    let path_buf = resolve_existing_path(path)?;

    if path_buf.extension().and_then(|value| value.to_str()) == Some("rtf") {
        let output = Command::new("textutil")
            .arg("-convert")
            .arg("txt")
            .arg("-stdout")
            .arg(&path_buf)
            .output()
            .map_err(|error| {
                format!("Could not convert RTF file {}: {error}", path_buf.display())
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "textutil failed for {}: {stderr}",
                path_buf.display()
            ));
        }

        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }

    fs::read_to_string(&path_buf)
        .map_err(|error| format!("Could not read text file {}: {error}", path_buf.display()))
}

fn resolve_existing_path(path: &str) -> Result<PathBuf, String> {
    let direct = PathBuf::from(path);

    if direct.exists() {
        return Ok(direct);
    }

    if direct.is_absolute() {
        return Err(format!("Path does not exist: {}", direct.display()));
    }

    let cwd =
        std::env::current_dir().map_err(|error| format!("Could not read current dir: {error}"))?;
    let candidates = [
        cwd.join(&direct),
        cwd.join("..").join(&direct),
        cwd.join("../..").join(&direct),
    ];

    for candidate in candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(format!("Path does not exist: {path}"))
}

#[tauri::command]
pub(crate) fn audio2tol_detect_whisper_cpp(
    app: tauri::AppHandle,
) -> Result<WhisperDetectionResult, String> {
    assert_audio2tol_capabilities(&app, &["filesystem"])?;

    let candidates = whisper_candidates();

    for candidate in candidates {
        if !candidate.is_file() {
            continue;
        }

        return Ok(WhisperDetectionResult {
            found: true,
            path: Some(candidate.to_string_lossy().to_string()),
            version: None,
            message: "Local whisper.cpp detected.".to_string(),
        });
    }

    Ok(WhisperDetectionResult {
        found: false,
        path: None,
        version: None,
        message: "Local whisper.cpp was not found. Install it from the app or choose an existing executable.".to_string(),
    })
}

#[tauri::command]
pub(crate) fn audio2tol_install_whisper_cpp(
    app: tauri::AppHandle,
) -> Result<WhisperDetectionResult, String> {
    assert_audio2tol_capabilities(&app, &["shell", "network"])?;

    let brew = find_in_path("brew")
        .or_else(|| {
            ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]
                .iter()
                .map(PathBuf::from)
                .find(|path| path.is_file())
        })
        .ok_or_else(|| {
            "Homebrew was not found. Install Homebrew first or install whisper.cpp manually."
                .to_string()
        })?;

    let output = Command::new(brew)
        .arg("install")
        .arg("whisper-cpp")
        .output()
        .map_err(|error| format!("Could not start Homebrew install: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Homebrew could not install whisper-cpp: {stderr}"));
    }

    audio2tol_detect_whisper_cpp(app)
}

#[tauri::command]
pub(crate) fn audio2tol_scan_audio_files(
    app: tauri::AppHandle,
    folder: String,
    supported_formats: String,
    recursive: bool,
) -> Result<AudioScanResult, String> {
    assert_audio2tol_capabilities(&app, &["filesystem"])?;

    let root = PathBuf::from(folder);

    if !root.exists() {
        return Err("Selected audio source folder does not exist.".to_string());
    }

    if !root.is_dir() {
        return Err("Selected audio source path is not a folder.".to_string());
    }

    let extensions = parse_supported_formats(&supported_formats);
    let mut files = Vec::new();

    scan_folder(&root, recursive, &extensions, &mut files)?;
    files.sort();

    Ok(AudioScanResult {
        count: files.len(),
        files,
    })
}

fn whisper_candidates() -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from("/opt/homebrew/bin/whisper-cli"),
        PathBuf::from("/usr/local/bin/whisper-cli"),
        PathBuf::from("/usr/bin/whisper-cli"),
    ];

    candidates.extend(homebrew_cellar_whisper_candidates(
        "/opt/homebrew/Cellar/whisper-cpp",
    ));
    candidates.extend(homebrew_cellar_whisper_candidates(
        "/usr/local/Cellar/whisper-cpp",
    ));

    candidates.extend([
        PathBuf::from("/opt/homebrew/bin/whisper"),
        PathBuf::from("/usr/local/bin/whisper"),
        PathBuf::from("/usr/bin/whisper"),
    ]);

    for name in ["whisper-cli", "whisper-cpp", "whisper"] {
        if let Some(path) = find_in_path(name) {
            candidates.push(path);
        }
    }

    dedupe_paths(candidates)
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;

    std::env::split_paths(&path_var)
        .map(|path| path.join(name))
        .find(|path| path.is_file())
}

fn homebrew_cellar_whisper_candidates(cellar_path: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let Ok(entries) = fs::read_dir(cellar_path) else {
        return candidates;
    };

    for entry in entries.flatten() {
        let path = entry.path();

        for name in ["whisper-cli", "whisper"] {
            candidates.push(path.join("bin").join(name));
        }
    }

    candidates
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut deduped = Vec::new();

    for path in paths {
        if !deduped.iter().any(|existing| existing == &path) {
            deduped.push(path);
        }
    }

    deduped
}

fn parse_supported_formats(supported_formats: &str) -> Vec<String> {
    supported_formats
        .split(',')
        .map(|format| format.trim().trim_start_matches('.').to_ascii_lowercase())
        .filter(|format| !format.is_empty())
        .collect()
}

fn scan_folder(
    folder: &Path,
    recursive: bool,
    extensions: &[String],
    files: &mut Vec<String>,
) -> Result<(), String> {
    let entries = fs::read_dir(folder)
        .map_err(|error| format!("Could not read folder {}: {error}", folder.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("Could not read folder entry: {error}"))?;
        let path = entry.path();

        if path.is_dir() {
            if recursive {
                scan_folder(&path, recursive, extensions, files)?;
            }
            continue;
        }

        let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };

        if extensions
            .iter()
            .any(|supported| supported == &extension.to_ascii_lowercase())
        {
            files.push(path.to_string_lossy().to_string());
        }
    }

    Ok(())
}
