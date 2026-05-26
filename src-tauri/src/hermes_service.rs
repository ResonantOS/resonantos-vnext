// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md

use std::env;
use std::fs;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const DEFAULT_HERMES_HOME: &str = ".hermes";
const DEFAULT_HERMES_DASHBOARD_HOST: &str = "127.0.0.1";
const DEFAULT_HERMES_DASHBOARD_PORT: u16 = 9119;
const HERMES_INSTALLER_URL: &str =
    "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh";
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesAuditFinding {
    pub(crate) id: String,
    pub(crate) severity: String,
    pub(crate) title: String,
    pub(crate) detail: String,
    pub(crate) suggestion: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesGatewayStatus {
    pub(crate) present: bool,
    pub(crate) running: bool,
    pub(crate) pid: Option<u32>,
    pub(crate) state: Option<String>,
    pub(crate) channels: Vec<String>,
    pub(crate) updated_at: Option<String>,
    pub(crate) detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesInventory {
    pub(crate) skills_count: usize,
    pub(crate) memories_count: usize,
    pub(crate) sessions_count: usize,
    pub(crate) kb_present: bool,
    pub(crate) kb_index_present: bool,
    pub(crate) state_db_present: bool,
    pub(crate) state_db_ok: bool,
    pub(crate) identity_present: bool,
    pub(crate) env_present: bool,
    pub(crate) config_present: bool,
    pub(crate) channel_directory_present: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesInstallStatus {
    pub(crate) detected: bool,
    pub(crate) home: String,
    pub(crate) command: Option<String>,
    pub(crate) version: Option<String>,
    pub(crate) agent_source_path: Option<String>,
    pub(crate) agent_git_branch: Option<String>,
    pub(crate) agent_git_commit: Option<String>,
    pub(crate) agent_git_dirty: bool,
    pub(crate) gateway: HermesGatewayStatus,
    pub(crate) inventory: HermesInventory,
    pub(crate) findings: Vec<HermesAuditFinding>,
    pub(crate) compatibility: String,
    pub(crate) current_model: Option<String>,
    pub(crate) available_models: Vec<String>,
    pub(crate) checked_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesInstallRequest {
    pub(crate) profile_home: Option<String>,
    pub(crate) branch: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesStatusRequest {
    pub(crate) profile_home: Option<String>,
    pub(crate) executable: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesInstallResult {
    pub(crate) success: bool,
    pub(crate) profile_home: String,
    pub(crate) command: String,
    pub(crate) log: String,
    pub(crate) status: HermesInstallStatus,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesChatRequest {
    pub(crate) prompt: String,
    pub(crate) profile_home: Option<String>,
    pub(crate) model: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesChatResult {
    pub(crate) reply: String,
    pub(crate) command: String,
    pub(crate) profile_home: String,
    pub(crate) model: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesDashboardStatus {
    pub(crate) running: bool,
    pub(crate) url: String,
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) detail: String,
    pub(crate) raw_status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesDashboardRequest {
    pub(crate) profile_home: Option<String>,
    pub(crate) host: Option<String>,
    pub(crate) port: Option<u16>,
    pub(crate) include_tui: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesProfileSummary {
    pub(crate) name: String,
    pub(crate) model: String,
    pub(crate) gateway: String,
    pub(crate) alias: String,
    pub(crate) current: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesCuratorStatus {
    pub(crate) enabled: bool,
    pub(crate) interval: Option<String>,
    pub(crate) stale_after: Option<String>,
    pub(crate) archive_after: Option<String>,
    pub(crate) raw_status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesKanbanTask {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) status: String,
    pub(crate) assignee: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesKanbanSnapshot {
    pub(crate) counts: Vec<(String, usize)>,
    pub(crate) tasks: Vec<HermesKanbanTask>,
    pub(crate) assignees_raw: String,
    pub(crate) raw_stats: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesWorkspaceSnapshot {
    pub(crate) install: HermesInstallStatus,
    pub(crate) dashboard: HermesDashboardStatus,
    pub(crate) profiles: Vec<HermesProfileSummary>,
    pub(crate) curator: HermesCuratorStatus,
    pub(crate) kanban: HermesKanbanSnapshot,
    pub(crate) slashgoal_command: String,
    pub(crate) archivist_recommendation: String,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub(crate) enum HermesStatusMode {
    Passive,
    Executable,
}

pub(crate) fn query_hermes_status(
    profile_home: Option<String>,
    mode: HermesStatusMode,
) -> HermesInstallStatus {
    let home = resolve_hermes_home(profile_home);
    let executable = mode == HermesStatusMode::Executable;
    let command = if executable {
        resolve_hermes_command(&home)
    } else {
        resolve_profile_hermes_command(&home)
    };
    let detected = home.exists();
    let version = if executable {
        command.as_deref().and_then(|binary| {
            let mut command = hermes_command(binary);
            command.arg("--version");
            command_output(&mut command).ok()
        })
    } else {
        None
    }
    .map(clean_output)
    .filter(|value| !value.is_empty());
    let agent_source_path = find_agent_source_path(&home);
    let agent_git_branch = executable
        .then_some(agent_source_path.as_deref())
        .flatten()
        .and_then(|path| git_output(path, &["branch", "--show-current"]));
    let agent_git_commit = executable
        .then_some(agent_source_path.as_deref())
        .flatten()
        .and_then(|path| git_output(path, &["rev-parse", "--short", "HEAD"]));
    let agent_git_dirty = if executable {
        agent_source_path
            .as_deref()
            .and_then(|path| git_output(path, &["status", "--porcelain"]))
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
    } else {
        false
    };
    let gateway = inspect_gateway(&home, executable);
    let inventory = inspect_inventory(&home);
    let current_model = inspect_current_model(&home);
    let available_models = inspect_available_models(&home, current_model.as_deref());
    let findings = build_findings(
        detected,
        command.as_deref(),
        version.as_deref(),
        &home,
        &gateway,
        &inventory,
        agent_git_dirty,
        executable,
    );
    let compatibility = compatibility_from_findings(&findings);

    HermesInstallStatus {
        detected,
        home: home.display().to_string(),
        command,
        version,
        agent_source_path: agent_source_path.map(|path| path.display().to_string()),
        agent_git_branch,
        agent_git_commit,
        agent_git_dirty,
        gateway,
        inventory,
        findings,
        compatibility,
        current_model,
        available_models,
        checked_at: chrono_like_now(),
    }
}

pub(crate) fn execute_hermes_chat(request: HermesChatRequest) -> Result<HermesChatResult, String> {
    let home = resolve_hermes_home(request.profile_home);
    if !home.exists() {
        return Err(format!("Hermes profile was not found: {}", home.display()));
    }
    let Some(command) = resolve_hermes_command(&home) else {
        return Err("Hermes CLI was not found. Install Hermes or expose the `hermes` command before using chat.".to_string());
    };
    let prompt = request.prompt.trim();
    if prompt.is_empty() {
        return Err("Hermes chat prompt is empty.".to_string());
    }
    let selected_model = request
        .model
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    validate_selected_model(&home, selected_model.as_deref())?;

    let mut process = hermes_command(&command);
    process
        .arg("chat")
        .arg("-Q")
        .arg("--source")
        .arg("resonantos");
    if let Some(model) = selected_model.as_deref() {
        process.arg("-m").arg(model);
    }
    let output = process
        .arg("-q")
        .arg(prompt)
        .env("HERMES_HOME", &home)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("Failed to run Hermes chat: {error}"))?;

    if !output.status.success() {
        let failure = clean_hermes_failure_output(
            &String::from_utf8_lossy(&output.stdout),
            &String::from_utf8_lossy(&output.stderr),
        );
        return Err(if failure.is_empty() {
            "Hermes chat failed without stderr output.".to_string()
        } else {
            failure
        });
    }

    let reply = clean_hermes_chat_output(&String::from_utf8_lossy(&output.stdout));
    if reply.is_empty() {
        return Err("Hermes chat completed without a reply.".to_string());
    }

    Ok(HermesChatResult {
        reply,
        command,
        profile_home: home.display().to_string(),
        model: selected_model,
    })
}

pub(crate) fn install_hermes(request: HermesInstallRequest) -> Result<HermesInstallResult, String> {
    let home = resolve_hermes_home(request.profile_home);
    let existing_status = query_hermes_status(
        Some(home.display().to_string()),
        HermesStatusMode::Executable,
    );
    if existing_status.detected && existing_status.command.is_some() {
        return Ok(HermesInstallResult {
            success: true,
            profile_home: home.display().to_string(),
            command: "existing-install".to_string(),
            log: "Hermes is already installed; no installer was run.".to_string(),
            status: existing_status,
        });
    }
    if home.join("hermes-agent").exists() && !home.join("hermes-agent/.git").exists() {
        return Err(format!(
            "Hermes install target exists but is not a git checkout: {}. Move it aside or choose a different profile path.",
            home.join("hermes-agent").display()
        ));
    }

    fs::create_dir_all(&home).map_err(|error| {
        format!(
            "Failed to create Hermes profile directory {}: {error}",
            home.display()
        )
    })?;
    let installer_path = env::temp_dir().join(format!(
        "resonantos-hermes-install-{}-{}.sh",
        std::process::id(),
        chrono_like_now().replace(':', "-")
    ));
    let mut curl = Command::new("curl");
    curl.arg("-fsSL")
        .arg(HERMES_INSTALLER_URL)
        .arg("-o")
        .arg(&installer_path);
    let curl_output = curl
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("Failed to download Hermes installer: {error}"))?;
    if !curl_output.status.success() {
        return Err(format!(
            "Hermes installer download failed: {}",
            clean_output(String::from_utf8_lossy(&curl_output.stderr).to_string())
        ));
    }

    let branch = request.branch.unwrap_or_else(|| "main".to_string());
    let mut installer = Command::new("bash");
    installer
        .arg(&installer_path)
        .arg("--skip-setup")
        .arg("--branch")
        .arg(&branch)
        .arg("--hermes-home")
        .arg(&home)
        .env("HERMES_HOME", &home)
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONHOME")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let output = installer
        .output()
        .map_err(|error| format!("Failed to run Hermes installer: {error}"))?;
    let _ = fs::remove_file(&installer_path);
    let log = clean_output(
        [
            String::from_utf8_lossy(&output.stdout).to_string(),
            String::from_utf8_lossy(&output.stderr).to_string(),
        ]
        .join("\n"),
    );
    let status = query_hermes_status(
        Some(home.display().to_string()),
        HermesStatusMode::Executable,
    );
    let success = output.status.success() && status.detected && status.command.is_some();
    if !success {
        return Err(if log.is_empty() {
            "Hermes installer failed without output.".to_string()
        } else {
            log
        });
    }

    Ok(HermesInstallResult {
        success,
        profile_home: home.display().to_string(),
        command: format!(
            "bash {} --skip-setup --branch {} --hermes-home {}",
            HERMES_INSTALLER_URL,
            branch,
            home.display()
        ),
        log,
        status,
    })
}

pub(crate) fn query_hermes_workspace_snapshot(
    profile_home: Option<String>,
) -> HermesWorkspaceSnapshot {
    let install = query_hermes_status(profile_home.clone(), HermesStatusMode::Executable);
    HermesWorkspaceSnapshot {
        dashboard: query_hermes_dashboard_status(profile_home.clone(), None, None),
        profiles: query_hermes_profiles(profile_home.clone()),
        curator: query_hermes_curator_status(profile_home.clone()),
        kanban: query_hermes_kanban_snapshot(profile_home),
        install,
        slashgoal_command:
            "/slashgoal <detailed mission with scope, success criteria, allowed tools, approval checkpoints, and stop condition>"
                .to_string(),
        archivist_recommendation: [
            "Create a separate Hermes profile named Archivist or Librarian for background task enrichment.",
            "Grant it read-only Living Archive context in ResonantOS, keep archive writes as draft-only proposals, and run periodic Kanban triage on a cheap model.",
        ]
        .join(" "),
    }
}

pub(crate) fn query_hermes_dashboard_status(
    profile_home: Option<String>,
    host: Option<String>,
    port: Option<u16>,
) -> HermesDashboardStatus {
    let home = resolve_hermes_home(profile_home);
    let (host, port) = dashboard_target(host, port).unwrap_or_else(|_| {
        (
            DEFAULT_HERMES_DASHBOARD_HOST.to_string(),
            DEFAULT_HERMES_DASHBOARD_PORT,
        )
    });
    let url = format!("http://{host}:{port}");
    let raw_status = resolve_hermes_command(&home)
        .as_deref()
        .and_then(|binary| {
            let mut command = hermes_command(binary);
            command
                .arg("dashboard")
                .arg("--status")
                .env("HERMES_HOME", &home);
            command_output(&mut command).ok()
        })
        .map(clean_output)
        .unwrap_or_else(|| "Hermes dashboard status is unavailable.".to_string());
    let tcp_running = socket_open(&host, port);
    let status_running = raw_status.to_lowercase().contains("running")
        && !raw_status.to_lowercase().contains("no hermes dashboard");
    let running = tcp_running || status_running;
    let detail = if running {
        format!("Hermes dashboard is reachable at {url}.")
    } else {
        format!("Hermes dashboard is not reachable at {url}.")
    };
    HermesDashboardStatus {
        running,
        url,
        host,
        port,
        detail,
        raw_status,
    }
}

pub(crate) fn start_hermes_dashboard(
    request: HermesDashboardRequest,
) -> Result<HermesDashboardStatus, String> {
    let home = resolve_hermes_home(request.profile_home.clone());
    let (host, port) = dashboard_target(request.host.clone(), request.port)?;
    let Some(binary) = resolve_hermes_command(&home) else {
        return Err(
            "Hermes CLI was not found. Install or update Hermes before launching the dashboard."
                .to_string(),
        );
    };
    let mut process = hermes_command(&binary);
    process
        .arg("dashboard")
        .arg("--host")
        .arg(&host)
        .arg("--port")
        .arg(port.to_string())
        .arg("--no-open")
        .env("HERMES_HOME", &home)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if request.include_tui.unwrap_or(true) {
        process.arg("--tui");
    }
    process
        .spawn()
        .map_err(|error| format!("Failed to start Hermes dashboard: {error}"))?;
    for _ in 0..20 {
        if socket_open(&host, port) {
            break;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    Ok(query_hermes_dashboard_status(
        request.profile_home,
        Some(host),
        Some(port),
    ))
}

pub(crate) fn stop_hermes_dashboard(
    profile_home: Option<String>,
) -> Result<HermesDashboardStatus, String> {
    let home = resolve_hermes_home(profile_home.clone());
    let Some(binary) = resolve_hermes_command(&home) else {
        return Err(
            "Hermes CLI was not found. Install or update Hermes before stopping the dashboard."
                .to_string(),
        );
    };
    let mut command = hermes_command(&binary);
    command
        .arg("dashboard")
        .arg("--stop")
        .env("HERMES_HOME", &home);
    let _ = command_output(&mut command);
    Ok(query_hermes_dashboard_status(profile_home, None, None))
}

pub(crate) fn query_hermes_profiles(profile_home: Option<String>) -> Vec<HermesProfileSummary> {
    let home = resolve_hermes_home(profile_home);
    let Some(binary) = resolve_hermes_command(&home) else {
        return Vec::new();
    };
    let mut command = hermes_command(&binary);
    command.arg("profile").arg("list").env("HERMES_HOME", &home);
    command_output(&mut command)
        .ok()
        .map(clean_output)
        .map(|output| parse_profile_list(&output))
        .unwrap_or_default()
}

pub(crate) fn query_hermes_curator_status(profile_home: Option<String>) -> HermesCuratorStatus {
    let home = resolve_hermes_home(profile_home);
    let raw_status = resolve_hermes_command(&home)
        .as_deref()
        .and_then(|binary| {
            let mut command = hermes_command(binary);
            command
                .arg("curator")
                .arg("status")
                .env("HERMES_HOME", &home);
            command_output(&mut command).ok()
        })
        .map(clean_output)
        .unwrap_or_default();
    HermesCuratorStatus {
        enabled: raw_status.to_lowercase().contains("curator: enabled"),
        interval: parse_colon_value(&raw_status, "interval"),
        stale_after: parse_colon_value(&raw_status, "stale after"),
        archive_after: parse_colon_value(&raw_status, "archive after"),
        raw_status,
    }
}

pub(crate) fn query_hermes_kanban_snapshot(profile_home: Option<String>) -> HermesKanbanSnapshot {
    let home = resolve_hermes_home(profile_home);
    let Some(binary) = resolve_hermes_command(&home) else {
        return HermesKanbanSnapshot {
            counts: Vec::new(),
            tasks: Vec::new(),
            assignees_raw: String::new(),
            raw_stats: String::new(),
        };
    };
    let mut stats_command = hermes_command(&binary);
    stats_command
        .arg("kanban")
        .arg("stats")
        .env("HERMES_HOME", &home);
    let raw_stats = command_output(&mut stats_command)
        .ok()
        .map(clean_output)
        .unwrap_or_default();
    let mut tasks_command = hermes_command(&binary);
    tasks_command
        .arg("kanban")
        .arg("list")
        .arg("--json")
        .env("HERMES_HOME", &home);
    let tasks_raw = command_output(&mut tasks_command).ok().unwrap_or_default();
    let mut assignees_command = hermes_command(&binary);
    assignees_command
        .arg("kanban")
        .arg("assignees")
        .env("HERMES_HOME", &home);
    let assignees_raw = command_output(&mut assignees_command)
        .ok()
        .map(clean_output)
        .unwrap_or_default();
    HermesKanbanSnapshot {
        counts: parse_kanban_counts(&raw_stats),
        tasks: parse_kanban_tasks(&tasks_raw),
        assignees_raw,
        raw_stats,
    }
}

fn resolve_hermes_home(profile_home: Option<String>) -> PathBuf {
    if let Some(value) = profile_home.filter(|value| !value.trim().is_empty()) {
        return expand_home(value.trim());
    }
    env::var("HERMES_HOME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(|value| expand_home(&value))
        .unwrap_or_else(|| home_dir().join(DEFAULT_HERMES_HOME))
}

fn home_dir() -> PathBuf {
    env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn expand_home(value: &str) -> PathBuf {
    if value == "~" {
        return home_dir();
    }
    if let Some(rest) = value.strip_prefix("~/") {
        return home_dir().join(rest);
    }
    PathBuf::from(value)
}

fn dashboard_target(host: Option<String>, port: Option<u16>) -> Result<(String, u16), String> {
    let host = host
        .unwrap_or_else(|| DEFAULT_HERMES_DASHBOARD_HOST.to_string())
        .trim()
        .to_ascii_lowercase();
    if host != DEFAULT_HERMES_DASHBOARD_HOST && host != "localhost" {
        return Err(
            "Hermes dashboard can only bind to localhost or 127.0.0.1 from ResonantOS.".to_string(),
        );
    }
    let port = port.unwrap_or(DEFAULT_HERMES_DASHBOARD_PORT);
    if port == 0 {
        return Err("Hermes dashboard port must be between 1 and 65535.".to_string());
    }
    Ok((DEFAULT_HERMES_DASHBOARD_HOST.to_string(), port))
}

fn resolve_profile_hermes_command(home: &Path) -> Option<String> {
    let candidates = [
        home.join("hermes-agent")
            .join("venv")
            .join("bin")
            .join("hermes"),
        home.join("hermes-agent").join("hermes_cli").join("main.py"),
        home.join("hermes-agent").join("main.py"),
    ];
    for candidate in candidates {
        if candidate.exists() {
            return Some(candidate.display().to_string());
        }
    }
    None
}

fn resolve_hermes_command(home: &Path) -> Option<String> {
    resolve_profile_hermes_command(home).or_else(|| {
        command_output(Command::new("sh").arg("-lc").arg("command -v hermes"))
            .ok()
            .map(clean_output)
            .filter(|value| !value.is_empty())
            .or_else(|| {
                Command::new("hermes")
                    .arg("--version")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .ok()
                    .filter(|status| status.success())
                    .map(|_| "hermes".to_string())
            })
    })
}

fn hermes_command(binary: &str) -> Command {
    if binary.ends_with(".py") {
        let path = PathBuf::from(binary);
        let profile_python = path.parent().and_then(Path::parent).and_then(|root| {
            [
                root.join("venv").join("bin").join("python"),
                root.join("venv").join("Scripts").join("python.exe"),
                root.join("venv").join("Scripts").join("python"),
            ]
            .into_iter()
            .find(|candidate| candidate.exists())
        });
        let mut command = Command::new(
            profile_python
                .as_ref()
                .map(|candidate| candidate.as_os_str())
                .unwrap_or_else(|| std::ffi::OsStr::new("python3")),
        );
        command.arg(binary);
        command
    } else {
        Command::new(binary)
    }
}

fn command_output(command: &mut Command) -> Result<String, String> {
    let output = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn clean_output(value: String) -> String {
    value
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn clean_hermes_chat_output(value: &str) -> String {
    let normalized = value.replace('\r', "");
    let mut lines = Vec::new();
    let mut inside_hermes_box = false;
    for raw_line in normalized.lines() {
        let stripped = strip_ansi(raw_line);
        let line = stripped.trim_end();
        let trimmed = line.trim();
        if trimmed.starts_with("session_id:")
            || trimmed.starts_with("Session:")
            || trimmed.starts_with("Resume this session with:")
            || trimmed.starts_with("Duration:")
            || trimmed.starts_with("Messages:")
        {
            continue;
        }
        if trimmed.starts_with("╭─") && trimmed.contains("⚕ Hermes") {
            inside_hermes_box = true;
            continue;
        }
        if inside_hermes_box && trimmed.starts_with('╰') {
            inside_hermes_box = false;
            continue;
        }
        if inside_hermes_box {
            lines.push(trim_box_line(line).to_string());
        }
    }
    let extracted = lines
        .into_iter()
        .map(|line| line.trim_end().to_string())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();
    if !extracted.is_empty() {
        return extracted;
    }
    normalized
        .lines()
        .map(strip_ansi)
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty()
                && !trimmed.starts_with('╭')
                && !trimmed.starts_with('╰')
                && !trimmed.starts_with('│')
                && !trimmed.starts_with("session_id:")
                && !trimmed.starts_with("Session:")
                && !trimmed.starts_with("Resume this session with:")
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn clean_hermes_failure_output(stdout: &str, stderr: &str) -> String {
    let combined = [stdout, stderr].join("\n");
    let mut lines = Vec::new();
    let mut skipping_warning = false;
    for raw_line in combined.replace('\r', "").lines() {
        let line = strip_ansi(raw_line);
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("session_id:") {
            continue;
        }
        if trimmed.starts_with("Warning: FAL_KEY contained") {
            skipping_warning = true;
            continue;
        }
        if skipping_warning {
            if trimmed.starts_with("This usually means")
                || trimmed.starts_with("Unicode glyphs")
                || trimmed.starts_with("provider")
                || trimmed.starts_with("HTTP header")
                || trimmed.starts_with("and run")
                || trimmed.starts_with("key was")
                || trimmed.starts_with("authentication")
                || trimmed.starts_with("ASCII letters")
            {
                continue;
            }
            skipping_warning = false;
        }
        lines.push(trimmed.to_string());
    }
    lines.join("\n").trim().to_string()
}

fn trim_box_line(line: &str) -> &str {
    line.trim()
        .strip_prefix('│')
        .unwrap_or(line.trim())
        .trim()
        .strip_suffix('│')
        .unwrap_or_else(|| line.trim().strip_prefix('│').unwrap_or(line.trim()).trim())
        .trim()
}

fn strip_ansi(value: &str) -> String {
    let mut output = String::new();
    let mut chars = value.chars().peekable();
    while let Some(character) = chars.next() {
        if character == '\u{1b}' {
            for next in chars.by_ref() {
                if next.is_ascii_alphabetic() || next == 'm' {
                    break;
                }
            }
            continue;
        }
        output.push(character);
    }
    output
}

fn find_agent_source_path(home: &Path) -> Option<PathBuf> {
    let path = home.join("hermes-agent");
    path.join(".git").exists().then_some(path)
}

fn git_output(path: &Path, args: &[&str]) -> Option<String> {
    let mut command = Command::new("git");
    command.args(args).current_dir(path);
    command_output(&mut command)
        .ok()
        .map(clean_output)
        .filter(|value| !value.is_empty())
}

fn inspect_gateway(home: &Path, executable: bool) -> HermesGatewayStatus {
    let gateway_state_path = home.join("gateway_state.json");
    let pid_path = home.join("gateway.pid");
    let mut present = gateway_state_path.exists() || pid_path.exists();
    let mut pid = read_pid(&pid_path);
    let mut state = None;
    let mut channels = Vec::new();
    let mut updated_at = None;

    if let Ok(raw) = fs::read_to_string(&gateway_state_path) {
        if let Ok(value) = serde_json::from_str::<Value>(&raw) {
            present = true;
            pid = pid.or_else(|| {
                value
                    .get("pid")
                    .and_then(Value::as_u64)
                    .map(|value| value as u32)
            });
            state = value
                .get("gateway_state")
                .or_else(|| value.get("state"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
            updated_at = value
                .get("updated_at")
                .or_else(|| value.get("updatedAt"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
            channels = collect_gateway_channels(&value);
        }
    }

    let running = executable && pid.map(process_running).unwrap_or(false);
    let detail = if !present {
        "No Hermes gateway state file was found.".to_string()
    } else if running {
        "Hermes gateway process appears to be running.".to_string()
    } else if !executable {
        "Hermes gateway state exists; process liveness was not checked in passive audit mode."
            .to_string()
    } else {
        "Hermes gateway state exists, but the recorded process is not running.".to_string()
    };

    HermesGatewayStatus {
        present,
        running,
        pid,
        state,
        channels,
        updated_at,
        detail,
    }
}

fn collect_gateway_channels(value: &Value) -> Vec<String> {
    let mut channels = Vec::new();
    for key in ["channels", "connected_channels", "active_channels"] {
        if let Some(items) = value.get(key).and_then(Value::as_array) {
            for item in items {
                if let Some(label) = item.as_str() {
                    channels.push(label.to_string());
                } else if let Some(label) = item
                    .get("name")
                    .or_else(|| item.get("id"))
                    .and_then(Value::as_str)
                {
                    channels.push(label.to_string());
                }
            }
        }
    }
    if let Some(telegram) = value.get("telegram").and_then(Value::as_object) {
        let connected = telegram
            .get("connected")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if connected {
            channels.push("telegram".to_string());
        }
    }
    channels.sort();
    channels.dedup();
    channels
}

fn read_pid(path: &Path) -> Option<u32> {
    fs::read_to_string(path).ok()?.trim().parse::<u32>().ok()
}

fn process_running(pid: u32) -> bool {
    Command::new("ps")
        .arg("-p")
        .arg(pid.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn socket_open(host: &str, port: u16) -> bool {
    let Ok(mut addresses) = (host, port).to_socket_addrs() else {
        return false;
    };
    addresses
        .any(|address| TcpStream::connect_timeout(&address, Duration::from_millis(150)).is_ok())
}

fn parse_profile_list(output: &str) -> Vec<HermesProfileSummary> {
    output
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty()
                || trimmed.starts_with("Profile")
                || trimmed.starts_with('─')
                || trimmed.starts_with("Warning:")
            {
                return None;
            }
            let current = trimmed.starts_with('◆') || trimmed.starts_with('*');
            let cleaned = trimmed
                .trim_start_matches('◆')
                .trim_start_matches('*')
                .trim();
            let parts = cleaned.split_whitespace().collect::<Vec<_>>();
            if parts.len() < 3 {
                return None;
            }
            Some(HermesProfileSummary {
                name: parts[0].to_string(),
                model: parts[1].to_string(),
                gateway: parts[2].to_string(),
                alias: parts.get(3).copied().unwrap_or("—").to_string(),
                current,
            })
        })
        .collect()
}

fn parse_colon_value(output: &str, key: &str) -> Option<String> {
    let wanted = key.to_lowercase();
    output.lines().find_map(|line| {
        let trimmed = line.trim();
        let (left, right) = trimmed.split_once(':')?;
        (left.trim().eq_ignore_ascii_case(&wanted)).then(|| right.trim().to_string())
    })
}

fn parse_kanban_counts(output: &str) -> Vec<(String, usize)> {
    output
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let status = parts.next()?;
            let count = parts.next()?.parse::<usize>().ok()?;
            Some((status.to_string(), count))
        })
        .collect()
}

fn parse_kanban_tasks(raw: &str) -> Vec<HermesKanbanTask> {
    let Ok(value) = serde_json::from_str::<Value>(raw.trim()) else {
        return Vec::new();
    };
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let id = item
                        .get("id")
                        .or_else(|| item.get("task_id"))
                        .or_else(|| item.get("taskId"))
                        .and_then(Value::as_str)?
                        .to_string();
                    let title = item
                        .get("title")
                        .or_else(|| item.get("name"))
                        .and_then(Value::as_str)
                        .unwrap_or("Untitled Hermes task")
                        .to_string();
                    let status = item
                        .get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("unknown")
                        .to_string();
                    let assignee = item
                        .get("assignee")
                        .or_else(|| item.get("profile"))
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned);
                    Some(HermesKanbanTask {
                        id,
                        title,
                        status,
                        assignee,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn inspect_inventory(home: &Path) -> HermesInventory {
    let state_db = home.join("state.db");
    HermesInventory {
        skills_count: count_dir_entries(&home.join("skills")),
        memories_count: count_dir_entries(&home.join("memories")),
        sessions_count: count_dir_entries(&home.join("sessions")),
        kb_present: home.join("KB").exists() || home.join("kb").exists(),
        kb_index_present: home.join("kb_index/kb_search.db").exists(),
        state_db_present: state_db.exists(),
        state_db_ok: sqlite_ok(&state_db),
        identity_present: home.join("SOUL.md").exists(),
        env_present: home.join(".env").exists(),
        config_present: home.join("config.yaml").exists() || home.join("config.yml").exists(),
        channel_directory_present: home.join("channel_directory.json").exists(),
    }
}

fn inspect_current_model(home: &Path) -> Option<String> {
    read_hermes_config(home).and_then(|raw| parse_current_model_from_config(&raw))
}

fn inspect_available_models(home: &Path, current_model: Option<&str>) -> Vec<String> {
    let mut models = current_model
        .map(|model| vec![model.to_string()])
        .unwrap_or_default();
    if let Some(raw) = read_hermes_config(home) {
        models.extend(parse_available_models_from_config(&raw));
    }
    unique_non_empty(models)
}

fn validate_selected_model(home: &Path, selected_model: Option<&str>) -> Result<(), String> {
    let Some(model) = selected_model else {
        return Ok(());
    };
    let available_models = inspect_available_models(home, inspect_current_model(home).as_deref());
    if available_models.is_empty() || available_models.iter().any(|item| item == model) {
        return Ok(());
    }
    Err(format!(
        "Hermes model `{model}` is not declared in the local Hermes config. Available models: {}. Refresh the Hermes workspace or choose a configured model before sending.",
        available_models.join(", ")
    ))
}

fn read_hermes_config(home: &Path) -> Option<String> {
    ["config.yaml", "config.yml"]
        .iter()
        .map(|name| home.join(name))
        .find(|path| path.exists())
        .and_then(|path| fs::read_to_string(path).ok())
}

fn parse_current_model_from_config(raw: &str) -> Option<String> {
    let mut inside_model_block = false;
    for raw_line in raw.lines() {
        let line = raw_line.split('#').next().unwrap_or("").trim_end();
        if line.trim().is_empty() {
            continue;
        }
        let leading_spaces = line.len().saturating_sub(line.trim_start().len());
        let trimmed = line.trim();
        if leading_spaces == 0 {
            inside_model_block = trimmed == "model:";
            continue;
        }
        if inside_model_block && trimmed.starts_with("default:") {
            let value = trimmed.trim_start_matches("default:").trim();
            if !value.is_empty() {
                return Some(unquote_yaml_scalar(value));
            }
        }
    }
    None
}

fn parse_available_models_from_config(raw: &str) -> Vec<String> {
    let mut models = Vec::new();
    if let Some(current) = parse_current_model_from_config(raw) {
        models.push(current);
    }
    for raw_line in raw.lines() {
        let line = raw_line.split('#').next().unwrap_or("").trim();
        if let Some(value) = line.strip_prefix("default_model:") {
            let model = unquote_yaml_scalar(value);
            if !model.is_empty() {
                models.push(model);
            }
        }
    }
    unique_non_empty(models)
}

fn unique_non_empty(values: Vec<String>) -> Vec<String> {
    let mut unique = Vec::new();
    for value in values {
        let trimmed = value.trim().to_string();
        if !trimmed.is_empty() && !unique.iter().any(|item| item == &trimmed) {
            unique.push(trimmed);
        }
    }
    unique
}

fn unquote_yaml_scalar(value: &str) -> String {
    value
        .trim()
        .trim_matches(|character| character == '"' || character == '\'')
        .to_string()
}

fn count_dir_entries(path: &Path) -> usize {
    fs::read_dir(path)
        .ok()
        .map(|entries| entries.filter_map(Result::ok).count())
        .unwrap_or(0)
}

fn sqlite_ok(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    Connection::open(path)
        .and_then(|connection| {
            connection.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
        })
        .map(|value| value.eq_ignore_ascii_case("ok"))
        .unwrap_or(false)
}

fn build_findings(
    detected: bool,
    command: Option<&str>,
    version: Option<&str>,
    home: &Path,
    gateway: &HermesGatewayStatus,
    inventory: &HermesInventory,
    agent_git_dirty: bool,
    executable_audit: bool,
) -> Vec<HermesAuditFinding> {
    let mut findings = Vec::new();
    if !detected {
        findings.push(finding(
            "hermes-profile-missing",
            "blocked",
            "Hermes profile not found",
            format!("No Hermes profile exists at {}.", home.display()),
            "Install Hermes or choose the correct Hermes profile before enabling the integrated agent.",
        ));
        return findings;
    }
    if command.is_none() {
        findings.push(finding(
            "hermes-command-missing",
            "blocked",
            "Hermes command not found",
            "ResonantOS found the Hermes profile but could not resolve a runnable Hermes CLI.",
            "Expose `hermes` on PATH or keep `hermes-agent/hermes_cli/main.py` inside the profile.",
        ));
    }
    if version.is_none() && executable_audit {
        findings.push(finding(
            "hermes-version-unknown",
            "warning",
            "Hermes version could not be checked",
            "The CLI did not return a version string, so update compatibility cannot be confirmed.",
            "Check the Hermes CLI manually and consider adding a stable `--version` response.",
        ));
    } else if version.is_none() && command.is_some() {
        findings.push(finding(
            "hermes-executable-audit-skipped",
            "info",
            "Executable Hermes checks were skipped",
            "ResonantOS inspected profile files without running the Hermes CLI.",
            "Grant shell access and run the executable audit before enabling dashboard, chat, or delegation workflows.",
        ));
    }
    if !gateway.present {
        findings.push(finding(
            "hermes-gateway-not-present",
            "warning",
            "Gateway state is missing",
            "The Hermes gateway is not currently advertising state for ResonantOS to attach to.",
            "Use CLI-backed chat for now, or start the Hermes gateway before enabling channel/delegation features.",
        ));
    } else if !gateway.running {
        findings.push(finding(
            "hermes-gateway-stale",
            "warning",
            "Gateway process is not running",
            gateway.detail.clone(),
            "Restart the Hermes gateway before enabling channel mirroring or live delegation delivery.",
        ));
    }
    if !inventory.identity_present {
        findings.push(finding(
            "hermes-identity-missing",
            "blocked",
            "Hermes identity is missing",
            "SOUL.md was not found in the Hermes profile.",
            "Restore the Hermes identity file before integrating it as a delegated ResonantOS agent.",
        ));
    }
    if !inventory.config_present {
        findings.push(finding(
            "hermes-config-missing",
            "blocked",
            "Hermes config is missing",
            "config.yaml was not found in the Hermes profile.",
            "Restore or create Hermes config before using the add-on.",
        ));
    }
    if !inventory.env_present {
        findings.push(finding(
            "hermes-env-missing",
            "warning",
            "Hermes environment file is missing",
            ".env was not found. Providers or channels may still work through another mechanism, but this should be verified.",
            "Review Hermes provider and channel credentials without copying secrets into ResonantOS.",
        ));
    }
    if inventory.state_db_present && !inventory.state_db_ok {
        findings.push(finding(
            "hermes-state-db-integrity",
            "blocked",
            "Hermes state database failed integrity check",
            "SQLite did not report a clean integrity check for state.db.",
            "Back up the profile and repair Hermes state before enabling ResonantOS integration.",
        ));
    }
    if inventory.kb_present && !inventory.kb_index_present {
        findings.push(finding(
            "hermes-kb-index-missing",
            "warning",
            "Hermes KB index is missing",
            "Hermes has a KB folder but no kb_index/kb_search.db index was found.",
            "Rebuild the Hermes KB index before relying on Hermes memory search from ResonantOS.",
        ));
    }
    if inventory.skills_count == 0 {
        findings.push(finding(
            "hermes-skills-empty",
            "warning",
            "No Hermes skills detected",
            "The profile skills folder is empty or missing.",
            "Review whether this Hermes profile is the intended one for ResonantOS delegation.",
        ));
    }
    if agent_git_dirty {
        findings.push(finding(
            "hermes-agent-local-modifications",
            "warning",
            "Hermes agent source has local modifications",
            "The Hermes agent repository has uncommitted local changes.",
            "Review local customizations before updating Hermes or applying compatibility fixes.",
        ));
    }
    if !inventory.channel_directory_present {
        findings.push(finding(
            "hermes-channel-directory-missing",
            "info",
            "Channel directory is missing",
            "No channel_directory.json was found. Direct chat can still work, but channel-aware delegation may be limited.",
            "Create or rebuild the Hermes channel directory before enabling outbound communication workflows.",
        ));
    }
    if findings.is_empty() {
        findings.push(finding(
            "hermes-ready",
            "ready",
            "Hermes profile is ready",
            "The local Hermes install has the expected profile files and no critical compatibility findings.",
            "Enable Hermes in the chat rail, then keep outbound sends behind ResonantOS approval gates.",
        ));
    }
    findings
}

fn finding(
    id: &str,
    severity: &str,
    title: &str,
    detail: impl Into<String>,
    suggestion: &str,
) -> HermesAuditFinding {
    HermesAuditFinding {
        id: id.to_string(),
        severity: severity.to_string(),
        title: title.to_string(),
        detail: detail.into(),
        suggestion: suggestion.to_string(),
    }
}

fn compatibility_from_findings(findings: &[HermesAuditFinding]) -> String {
    if findings.iter().any(|finding| finding.severity == "blocked") {
        "blocked".to_string()
    } else if findings.iter().any(|finding| finding.severity == "warning") {
        "degraded".to_string()
    } else {
        "ready".to_string()
    }
}

fn chrono_like_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0));
    format!("unix:{}", now.as_secs())
}

#[cfg(test)]
mod tests {
    use super::{
        clean_hermes_chat_output, clean_hermes_failure_output, dashboard_target, hermes_command,
        install_hermes, parse_available_models_from_config, parse_current_model_from_config,
        parse_kanban_counts, parse_kanban_tasks, parse_profile_list, query_hermes_status,
        resolve_hermes_command, start_hermes_dashboard, validate_selected_model,
        HermesDashboardRequest, HermesInstallRequest, HermesStatusMode,
        DEFAULT_HERMES_DASHBOARD_PORT,
    };
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn prefers_profile_venv_hermes_command() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-hermes-command-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let venv_bin = root.join("hermes-agent").join("venv").join("bin");
        let cli_dir = root.join("hermes-agent").join("hermes_cli");
        fs::create_dir_all(&venv_bin).expect("venv bin should be created");
        fs::create_dir_all(&cli_dir).expect("cli dir should be created");
        fs::write(venv_bin.join("hermes"), "#!/bin/sh\n").expect("venv hermes should be written");
        fs::write(cli_dir.join("main.py"), "print('fallback')\n").expect("main should be written");

        let command = resolve_hermes_command(&root).expect("command should resolve");

        assert!(PathBuf::from(command).ends_with(
            PathBuf::from("hermes-agent")
                .join("venv")
                .join("bin")
                .join("hermes")
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn install_is_noop_when_runnable_hermes_exists() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-hermes-existing-install-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let venv_bin = root.join("hermes-agent").join("venv").join("bin");
        fs::create_dir_all(&venv_bin).expect("venv bin should be created");
        let hermes_path = venv_bin.join("hermes");
        fs::write(&hermes_path, "#!/bin/sh\necho 'Hermes Agent test'\n")
            .expect("hermes should be written");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&hermes_path, fs::Permissions::from_mode(0o755))
                .expect("hermes should be executable");
        }

        let result = install_hermes(HermesInstallRequest {
            profile_home: Some(root.display().to_string()),
            branch: None,
        })
        .expect("existing install should not run installer");

        assert!(result.success);
        assert_eq!(result.command, "existing-install");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn passive_status_does_not_execute_profile_local_hermes() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-hermes-passive-status-test-{}",
            std::process::id()
        ));
        let marker = root.join("executed.marker");
        let _ = fs::remove_dir_all(&root);
        let venv_bin = root.join("hermes-agent").join("venv").join("bin");
        fs::create_dir_all(&venv_bin).expect("venv bin should be created");
        let hermes_path = venv_bin.join("hermes");
        fs::write(
            &hermes_path,
            format!(
                "#!/bin/sh\ntouch '{}'\necho 'Hermes Agent test'\n",
                marker.display()
            ),
        )
        .expect("hermes should be written");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&hermes_path, fs::Permissions::from_mode(0o755))
                .expect("hermes should be executable");
        }

        let status =
            query_hermes_status(Some(root.display().to_string()), HermesStatusMode::Passive);

        assert!(status.command.is_some());
        assert!(status.version.is_none());
        assert!(!marker.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn dashboard_target_allows_only_local_loopback_hosts() {
        assert_eq!(
            dashboard_target(None, None).expect("default target should parse"),
            ("127.0.0.1".to_string(), DEFAULT_HERMES_DASHBOARD_PORT)
        );
        assert_eq!(
            dashboard_target(Some(" localhost ".to_string()), Some(9120))
                .expect("localhost should normalize"),
            ("127.0.0.1".to_string(), 9120)
        );
        assert!(dashboard_target(Some("0.0.0.0".to_string()), Some(9119)).is_err());
        assert!(dashboard_target(Some("192.168.1.10".to_string()), Some(9119)).is_err());
        assert!(dashboard_target(Some("127.0.0.1".to_string()), Some(0)).is_err());
    }

    #[test]
    fn dashboard_start_rejects_non_loopback_host_before_command_lookup() {
        let result = start_hermes_dashboard(HermesDashboardRequest {
            profile_home: Some("/tmp/resonantos-missing-hermes-profile".to_string()),
            host: Some("0.0.0.0".to_string()),
            port: Some(9119),
            include_tui: None,
        });

        assert_eq!(
            result.expect_err("non-loopback host should be rejected"),
            "Hermes dashboard can only bind to localhost or 127.0.0.1 from ResonantOS."
        );
    }

    #[test]
    fn parses_exact_current_model_from_hermes_config() {
        let raw = r#"
model:
  default: "gemma-4-26b-a4b-q4_k_m.gguf"
  provider: gx10-26b
providers:
  minimax:
    default_model: minimax-m2.7
"#;

        assert_eq!(
            parse_current_model_from_config(raw).as_deref(),
            Some("gemma-4-26b-a4b-q4_k_m.gguf")
        );
    }

    #[test]
    fn parses_configured_hermes_models_without_duplicates() {
        let raw = r#"
model:
  default: gemma-4-26b-a4b-q4_k_m.gguf
providers:
  gx10-26b:
    default_model: gemma-4-26b-a4b-q4_k_m.gguf
  minimax:
    default_model: minimax-m2.7
"#;

        assert_eq!(
            parse_available_models_from_config(raw),
            vec![
                "gemma-4-26b-a4b-q4_k_m.gguf".to_string(),
                "minimax-m2.7".to_string()
            ]
        );
    }

    #[test]
    fn rejects_models_not_declared_in_hermes_config() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-hermes-model-validation-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("profile root should be created");
        fs::write(
            root.join("config.yaml"),
            "model:\n  default: gemma-4-26b-a4b-q4_k_m.gguf\n",
        )
        .expect("config should be written");

        assert!(validate_selected_model(&root, Some("gemma-4-26b-a4b-q4_k_m.gguf")).is_ok());
        let error = validate_selected_model(&root, Some("minimax-m2.7"))
            .expect_err("model should be rejected");
        assert!(error.contains("not declared"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn python_entrypoint_uses_profile_venv_python() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-hermes-python-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let venv_bin = root.join("venv").join("bin");
        let cli_dir = root.join("hermes_cli");
        fs::create_dir_all(&venv_bin).expect("venv bin should be created");
        fs::create_dir_all(&cli_dir).expect("cli dir should be created");
        fs::write(venv_bin.join("python"), "#!/bin/sh\n").expect("venv python should be written");
        let main = cli_dir.join("main.py");
        fs::write(&main, "print('ok')\n").expect("main should be written");

        let command = hermes_command(&main.display().to_string());

        assert_eq!(command.get_program(), venv_bin.join("python").as_os_str());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn extracts_only_final_hermes_reply_from_quiet_box_output() {
        let raw = "\r\n╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮\r\nHERMES_QUIET_OK\r\n\r\nsession_id: 20260429_135054_19e594\r\n";

        let cleaned = clean_hermes_chat_output(raw);

        assert_eq!(cleaned, "HERMES_QUIET_OK");
    }

    #[test]
    fn strips_banner_and_resume_footer_from_verbose_output() {
        let raw = [
            "╭──────────── Hermes Agent v0.9.0 ─────────────╮",
            "│ Available Tools │",
            "╰──────────────────────────────────────────────╯",
            "Query: noisy prompt",
            "Initializing agent...",
            "╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮",
            "I am here. Standing by.",
            "╰──────────────────────────────────────────────────────────────────────────────╯",
            "Resume this session with:",
            "  hermes --resume 20260429_134737_df7d14",
            "Session: 20260429_134737_df7d14",
        ]
        .join("\n");

        let cleaned = clean_hermes_chat_output(&raw);

        assert_eq!(cleaned, "I am here. Standing by.");
    }

    #[test]
    fn parses_profile_list_current_marker() {
        let output = "\n Profile          Model                        Gateway      Alias\n ───────────────    ───────────────────────────    ───────────    ────────────\n ◆default         gemma-4-26b-a4b-q4_k_m.ggu   stopped      —\n archivist        gpt-4.1-mini                 running      hermes-archivist\n";

        let profiles = parse_profile_list(output);

        assert_eq!(profiles.len(), 2);
        assert_eq!(profiles[0].name, "default");
        assert!(profiles[0].current);
        assert_eq!(profiles[1].name, "archivist");
        assert_eq!(profiles[1].gateway, "running");
    }

    #[test]
    fn parses_kanban_snapshot_fragments() {
        let counts = parse_kanban_counts("By status:\n  triage    2\n  ready     1\n");
        let tasks = parse_kanban_tasks(
            r#"[{"id":"T-1","title":"Review archive","status":"ready","assignee":"archivist"}]"#,
        );

        assert_eq!(
            counts,
            vec![("triage".to_string(), 2), ("ready".to_string(), 1)]
        );
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "Review archive");
        assert_eq!(tasks[0].assignee.as_deref(), Some("archivist"));
    }

    #[test]
    fn failure_output_prefers_real_stdout_error_over_env_warning() {
        let stdout = "Failed to initialize agent: compression model has a context window below the minimum.\n";
        let stderr = "  Warning: FAL_KEY contained 1 non-ASCII character (U+1F3A8 ('🎨')) — stripped so the key can be sent as an HTTP header.\n  This usually means the key was copy-pasted from a PDF, rich-text editor, or web page that substituted lookalike\n  Unicode glyphs for ASCII letters.\n";

        let cleaned = clean_hermes_failure_output(stdout, stderr);

        assert!(cleaned.contains("Failed to initialize agent"));
        assert!(!cleaned.contains("FAL_KEY"));
    }
}
