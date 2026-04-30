// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const DEFAULT_HERMES_HOME: &str = ".hermes";
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
    pub(crate) checked_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesChatRequest {
    pub(crate) prompt: String,
    pub(crate) profile_home: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HermesChatResult {
    pub(crate) reply: String,
    pub(crate) command: String,
    pub(crate) profile_home: String,
}

pub(crate) fn query_hermes_status(profile_home: Option<String>) -> HermesInstallStatus {
    let home = resolve_hermes_home(profile_home);
    let command = resolve_hermes_command(&home);
    let detected = home.exists();
    let version = command
        .as_deref()
        .and_then(|binary| {
            let mut command = hermes_command(binary);
            command.arg("--version");
            command_output(&mut command).ok()
        })
        .map(clean_output)
        .filter(|value| !value.is_empty());
    let agent_source_path = find_agent_source_path(&home);
    let agent_git_branch = agent_source_path
        .as_deref()
        .and_then(|path| git_output(path, &["branch", "--show-current"]));
    let agent_git_commit = agent_source_path
        .as_deref()
        .and_then(|path| git_output(path, &["rev-parse", "--short", "HEAD"]));
    let agent_git_dirty = agent_source_path
        .as_deref()
        .and_then(|path| git_output(path, &["status", "--porcelain"]))
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let gateway = inspect_gateway(&home);
    let inventory = inspect_inventory(&home);
    let findings = build_findings(
        detected,
        command.as_deref(),
        version.as_deref(),
        &home,
        &gateway,
        &inventory,
        agent_git_dirty,
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

    let mut process = hermes_command(&command);
    let output = process
        .arg("chat")
        .arg("-Q")
        .arg("--source")
        .arg("resonantos")
        .arg("-q")
        .arg(prompt)
        .env("HERMES_HOME", &home)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("Failed to run Hermes chat: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Hermes chat failed without stderr output.".to_string()
        } else {
            stderr
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
    })
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

fn resolve_hermes_command(home: &Path) -> Option<String> {
    let candidates = [
        home.join("hermes-agent/venv/bin/hermes"),
        home.join("hermes-agent/hermes_cli/main.py"),
        home.join("hermes-agent/main.py"),
    ];
    for candidate in candidates {
        if candidate.exists() {
            return Some(candidate.display().to_string());
        }
    }
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

fn inspect_gateway(home: &Path) -> HermesGatewayStatus {
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

    let running = pid.map(process_running).unwrap_or(false);
    let detail = if !present {
        "No Hermes gateway state file was found.".to_string()
    } else if running {
        "Hermes gateway process appears to be running.".to_string()
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
    if version.is_none() {
        findings.push(finding(
            "hermes-version-unknown",
            "warning",
            "Hermes version could not be checked",
            "The CLI did not return a version string, so update compatibility cannot be confirmed.",
            "Check the Hermes CLI manually and consider adding a stable `--version` response.",
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
    use super::{clean_hermes_chat_output, hermes_command, resolve_hermes_command};
    use std::fs;

    #[test]
    fn prefers_profile_venv_hermes_command() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-hermes-command-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let venv_bin = root.join("hermes-agent/venv/bin");
        let cli_dir = root.join("hermes-agent/hermes_cli");
        fs::create_dir_all(&venv_bin).expect("venv bin should be created");
        fs::create_dir_all(&cli_dir).expect("cli dir should be created");
        fs::write(venv_bin.join("hermes"), "#!/bin/sh\n").expect("venv hermes should be written");
        fs::write(cli_dir.join("main.py"), "print('fallback')\n").expect("main should be written");

        let command = resolve_hermes_command(&root).expect("command should resolve");

        assert!(command.ends_with("hermes-agent/venv/bin/hermes"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn python_entrypoint_uses_profile_venv_python() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-hermes-python-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let venv_bin = root.join("venv/bin");
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
}
