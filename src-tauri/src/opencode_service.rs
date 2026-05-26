// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md
// Intent citation: docs/architecture/ADR-015-delegation-fabric-addon-catalog-native-tools.md

use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

const DEFAULT_OPENCODE_PORT: u16 = 4096;
const OPENCODE_HOSTNAME: &str = "127.0.0.1";
const OPENCODE_SESSION_ID: &str = "opencode-main";
const OPENCODE_HEALTH_TIMEOUT: Duration = Duration::from_secs(8);
const TRUST_KERNEL_COMMAND_TIMEOUT: Duration = Duration::from_secs(3);

static OPENCODE_SESSIONS: OnceLock<Mutex<HashMap<String, OpenCodeProcessSession>>> =
    OnceLock::new();

fn opencode_sessions() -> &'static Mutex<HashMap<String, OpenCodeProcessSession>> {
    OPENCODE_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

struct OpenCodeProcessSession {
    child: Child,
    workspace_path: String,
    port: u16,
    mode: OpenCodeLaunchMode,
    trust_kernel: TrustKernelAdvisory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum OpenCodeLaunchMode {
    Web,
    Serve,
}

fn opencode_command_arg_for_mode(mode: &OpenCodeLaunchMode) -> &'static str {
    match mode {
        // OpenCode's `web` command opens the user's external browser. ResonantOS embeds the
        // same localhost UI itself, so the host must use the headless server command here.
        OpenCodeLaunchMode::Web => "serve",
        OpenCodeLaunchMode::Serve => "serve",
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenCodeStatus {
    pub(crate) installed: bool,
    pub(crate) version: Option<String>,
    pub(crate) binary_path: Option<String>,
    pub(crate) install_hint: String,
    pub(crate) supports_web_ui: bool,
    pub(crate) supports_server_api: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenCodeStartRequest {
    pub(crate) workspace_path: String,
    pub(crate) port: Option<u16>,
    pub(crate) mode: Option<OpenCodeLaunchMode>,
    pub(crate) session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenCodeStopRequest {
    pub(crate) session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenCodeTrustEventRequest {
    pub(crate) session_id: Option<String>,
    pub(crate) event_type: String,
    pub(crate) content: Option<String>,
    pub(crate) command: Option<String>,
    pub(crate) tool: Option<String>,
    pub(crate) path: Option<String>,
    pub(crate) returncode: Option<i32>,
    pub(crate) metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenCodeInjectPromptRequest {
    pub(crate) session_id: Option<String>,
    pub(crate) prompt: String,
    pub(crate) clear_existing: Option<bool>,
    pub(crate) submit: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenCodeInjectPromptResult {
    pub(crate) session_id: String,
    pub(crate) opencode_session_id: Option<String>,
    pub(crate) workspace_path: String,
    pub(crate) api_base_url: String,
    pub(crate) web_url: Option<String>,
    pub(crate) prompt_length: usize,
    pub(crate) cleared: bool,
    pub(crate) submitted: bool,
}

#[derive(Debug, Deserialize)]
struct OpenCodeSessionCreateResponse {
    id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenCodeServiceResult {
    pub(crate) session_id: String,
    pub(crate) workspace_path: String,
    pub(crate) mode: OpenCodeLaunchMode,
    pub(crate) api_base_url: String,
    pub(crate) web_url: String,
    pub(crate) command: String,
    pub(crate) pid: Option<u32>,
    pub(crate) already_running: bool,
    pub(crate) trust_kernel_run_dir: Option<String>,
    pub(crate) trust_kernel_packet_path: Option<String>,
    pub(crate) trust_kernel_brief_path: Option<String>,
    pub(crate) trust_kernel_warning: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrustKernelAdvisory {
    pub(crate) run_dir: Option<String>,
    pub(crate) packet_path: Option<String>,
    pub(crate) brief_path: Option<String>,
    pub(crate) warning: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TrustKernelStartOutput {
    run_dir: String,
    packet_path: String,
    brief_path: String,
}

pub(crate) fn query_opencode_status() -> OpenCodeStatus {
    let binary_path = resolve_opencode_binary();
    let version = binary_path
        .as_deref()
        .map(Command::new)
        .or_else(|| Some(Command::new("opencode")))
        .and_then(|mut command| {
            command
                .arg("--version")
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .ok()
        })
        .and_then(|output| {
            if output.status.success() {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                None
            }
        })
        .filter(|value| !value.is_empty());

    OpenCodeStatus {
        installed: binary_path.is_some() || version.is_some(),
        version,
        binary_path,
        install_hint:
            "Install the optional OpenCode runtime with the OpenCode desktop app, `npm install -g opencode-ai`, or the official installer."
                .to_string(),
        supports_web_ui: true,
        supports_server_api: true,
    }
}

pub(crate) fn start_opencode_service(
    request: OpenCodeStartRequest,
) -> Result<OpenCodeServiceResult, String> {
    if !query_opencode_status().installed {
        return Err("OpenCode is not installed. Install `opencode-ai` before launching this optional add-on.".to_string());
    }
    let binary = resolve_opencode_binary().unwrap_or_else(|| "opencode".to_string());

    let workspace = validate_workspace_path(&request.workspace_path)?;
    let session_id = request
        .session_id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| OPENCODE_SESSION_ID.to_string());
    let port = match request.port {
        Some(port) => port,
        None => available_local_port().unwrap_or(DEFAULT_OPENCODE_PORT),
    };
    let mode = request.mode.unwrap_or(OpenCodeLaunchMode::Web);

    let mut sessions = opencode_sessions()
        .lock()
        .map_err(|_| "OpenCode session lock is poisoned.".to_string())?;
    if let Some(existing) = sessions.get_mut(&session_id) {
        if existing
            .child
            .try_wait()
            .map_err(|error| format!("Failed to inspect existing OpenCode process: {error}"))?
            .is_none()
        {
            return Ok(service_result(
                session_id,
                existing.workspace_path.clone(),
                existing.port,
                existing.mode.clone(),
                existing.child.id(),
                true,
                existing.trust_kernel.clone(),
            ));
        }
        sessions.remove(&session_id);
    }

    let mode_arg = opencode_command_arg_for_mode(&mode);
    let trust_kernel = start_trust_kernel_advisory(&workspace, &session_id, mode_arg);
    let child = Command::new(&binary)
        .arg(mode_arg)
        .arg("--hostname")
        .arg(OPENCODE_HOSTNAME)
        .arg("--port")
        .arg(port.to_string())
        .arg("--cors")
        .arg("tauri://localhost")
        .arg("--cors")
        .arg("http://localhost:1430")
        .arg("--cors")
        .arg("http://127.0.0.1:1430")
        .current_dir(&workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to start OpenCode {mode_arg} with {binary}: {error}"))?;
    let pid = child.id();

    sessions.insert(
        session_id.clone(),
        OpenCodeProcessSession {
            child,
            workspace_path: workspace.display().to_string(),
            port,
            mode: mode.clone(),
            trust_kernel: trust_kernel.clone(),
        },
    );
    wait_for_opencode_health(port)?;

    Ok(service_result(
        session_id,
        workspace.display().to_string(),
        port,
        mode,
        pid,
        false,
        trust_kernel,
    ))
}

pub(crate) fn stop_opencode_service(
    request: OpenCodeStopRequest,
) -> Result<OpenCodeServiceResult, String> {
    let session_id = request
        .session_id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| OPENCODE_SESSION_ID.to_string());
    let mut sessions = opencode_sessions()
        .lock()
        .map_err(|_| "OpenCode session lock is poisoned.".to_string())?;
    let Some(mut session) = sessions.remove(&session_id) else {
        return Err(format!(
            "No OpenCode service session is running: {session_id}"
        ));
    };
    let pid = session.child.id();
    let _ = session.child.kill();
    let _ = session.child.wait();
    let mut trust_kernel = session.trust_kernel;
    if let Some(run_dir) = trust_kernel.run_dir.as_deref() {
        if let Some(warning) = finish_trust_kernel_advisory(run_dir) {
            trust_kernel.warning = Some(match trust_kernel.warning {
                Some(existing) => format!("{existing}; {warning}"),
                None => warning,
            });
        }
    }
    Ok(service_result(
        session_id,
        session.workspace_path,
        session.port,
        session.mode,
        pid,
        false,
        trust_kernel,
    ))
}

pub(crate) fn record_opencode_trust_event(
    request: OpenCodeTrustEventRequest,
) -> Result<TrustKernelAdvisory, String> {
    let session_id = request
        .session_id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| OPENCODE_SESSION_ID.to_string());
    let sessions = opencode_sessions()
        .lock()
        .map_err(|_| "OpenCode session lock is poisoned.".to_string())?;
    let Some(session) = sessions.get(&session_id) else {
        return Err(format!(
            "No OpenCode service session is running: {session_id}"
        ));
    };
    let Some(run_dir) = session.trust_kernel.run_dir.as_deref() else {
        return Err("OpenCode session has no active Trust Kernel run.".to_string());
    };
    let Some(root) = resolve_trust_kernel_root() else {
        return Err("Trust Kernel root was not found; event was not recorded.".to_string());
    };
    let metadata = request
        .metadata
        .unwrap_or_else(|| serde_json::json!({"source": "opencode_service"}));
    let args = build_trust_hook_event_args(
        run_dir,
        &session_id,
        &request.event_type,
        &session.workspace_path,
        request.content.as_deref().unwrap_or(""),
        request.command.as_deref(),
        request.tool.as_deref().unwrap_or(""),
        request.path.as_deref().unwrap_or(""),
        request.returncode,
        &metadata,
    )?;
    let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    run_trust_kernel_command(&root, &arg_refs)?;
    Ok(session.trust_kernel.clone())
}

pub(crate) fn inject_opencode_prompt(
    request: OpenCodeInjectPromptRequest,
) -> Result<OpenCodeInjectPromptResult, String> {
    let session_id = request
        .session_id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| OPENCODE_SESSION_ID.to_string());
    let prompt = request.prompt.trim();
    if prompt.is_empty() {
        return Err("OpenCode prompt injection requires non-empty prompt text.".to_string());
    }
    if prompt.len() > 24_000 {
        return Err("OpenCode prompt injection is capped at 24k characters.".to_string());
    }

    let (workspace_path, port) = {
        let mut sessions = opencode_sessions()
            .lock()
            .map_err(|_| "OpenCode session lock is poisoned.".to_string())?;
        let Some(session) = sessions.get_mut(&session_id) else {
            return Err(format!(
                "No OpenCode service session is running: {session_id}"
            ));
        };
        if session
            .child
            .try_wait()
            .map_err(|error| format!("Failed to inspect OpenCode process: {error}"))?
            .is_some()
        {
            return Err(format!(
                "OpenCode service session is not running: {session_id}"
            ));
        }
        (session.workspace_path.clone(), session.port)
    };

    let query = format!("directory={}", percent_encode_query(&workspace_path));
    let title = prompt
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("ResonantOS delegated OpenCode task")
        .chars()
        .take(80)
        .collect::<String>();
    let created_session = post_opencode_json(
        port,
        &format!("/session?{query}"),
        Some(&serde_json::json!({ "title": title }).to_string()),
    )?;
    let session = serde_json::from_str::<OpenCodeSessionCreateResponse>(&created_session).map_err(
        |error| format!("OpenCode session creation returned an unexpected response: {error}"),
    )?;
    let submitted = request.submit.unwrap_or(false);
    if submitted {
        let prompt_body = opencode_prompt_message_body(prompt, false);
        let prompt_path = format!("/session/{}/message?{query}", session.id);
        thread::spawn(move || {
            let _ = post_opencode_json_with_timeout(
                port,
                &prompt_path,
                Some(&prompt_body),
                Duration::from_secs(60 * 60),
            );
        });
    } else {
        post_opencode_json(
            port,
            &format!("/session/{}/message?{query}", session.id),
            Some(&opencode_prompt_message_body(prompt, true)),
        )?;
    }
    let api_base_url = format!("http://{OPENCODE_HOSTNAME}:{port}");

    Ok(OpenCodeInjectPromptResult {
        session_id,
        opencode_session_id: Some(session.id.clone()),
        workspace_path: workspace_path.clone(),
        web_url: Some(format!(
            "{}/{}/session/{}",
            api_base_url,
            base64_url_no_pad(&workspace_path),
            session.id
        )),
        api_base_url,
        prompt_length: prompt.len(),
        cleared: request.clear_existing.unwrap_or(true),
        submitted,
    })
}

fn opencode_prompt_message_body(prompt: &str, no_reply: bool) -> String {
    serde_json::json!({
        "noReply": no_reply,
        "parts": [{ "type": "text", "text": prompt }]
    })
    .to_string()
}

fn validate_workspace_path(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    if !path.exists() {
        return Err(format!("OpenCode workspace path does not exist: {value}"));
    }
    if !path.is_dir() {
        return Err(format!(
            "OpenCode workspace path is not a directory: {value}"
        ));
    }
    path.canonicalize()
        .map_err(|error| format!("Failed to resolve OpenCode workspace path: {error}"))
}

fn percent_encode_query(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            _ => format!("%{byte:02X}").chars().collect(),
        })
        .collect()
}

fn base64_url_no_pad(value: &str) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let bytes = value.as_bytes();
    let mut output = String::new();
    let mut index = 0;
    while index < bytes.len() {
        let first = bytes[index];
        let second = bytes.get(index + 1).copied();
        let third = bytes.get(index + 2).copied();
        output.push(TABLE[(first >> 2) as usize] as char);
        output.push(
            TABLE[(((first & 0b0000_0011) << 4) | (second.unwrap_or(0) >> 4)) as usize] as char,
        );
        if let Some(second) = second {
            output.push(
                TABLE[(((second & 0b0000_1111) << 2) | (third.unwrap_or(0) >> 6)) as usize] as char,
            );
        }
        if let Some(third) = third {
            output.push(TABLE[(third & 0b0011_1111) as usize] as char);
        }
        index += 3;
    }
    output
}

fn post_opencode_json(
    port: u16,
    path_and_query: &str,
    body: Option<&str>,
) -> Result<String, String> {
    post_opencode_json_with_timeout(port, path_and_query, body, Duration::from_secs(3))
}

fn post_opencode_json_with_timeout(
    port: u16,
    path_and_query: &str,
    body: Option<&str>,
    timeout: Duration,
) -> Result<String, String> {
    let body = body.unwrap_or("");
    let mut stream = TcpStream::connect((OPENCODE_HOSTNAME, port))
        .map_err(|error| format!("Failed to connect to OpenCode API: {error}"))?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|error| format!("Failed to configure OpenCode API read timeout: {error}"))?;
    stream
        .set_write_timeout(Some(timeout))
        .map_err(|error| format!("Failed to configure OpenCode API write timeout: {error}"))?;
    let request = format!(
        "POST {path_and_query} HTTP/1.1\r\nHost: {OPENCODE_HOSTNAME}:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("Failed to write OpenCode API request: {error}"))?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| format!("Failed to read OpenCode API response: {error}"))?;
    if response.starts_with("HTTP/1.1 200") {
        Ok(response
            .split("\r\n\r\n")
            .nth(1)
            .unwrap_or("")
            .trim()
            .to_string())
    } else {
        let status = response.lines().next().unwrap_or("unknown status");
        Err(format!("OpenCode API rejected prompt injection: {status}"))
    }
}

fn service_result(
    session_id: String,
    workspace_path: String,
    port: u16,
    mode: OpenCodeLaunchMode,
    pid: u32,
    already_running: bool,
    trust_kernel: TrustKernelAdvisory,
) -> OpenCodeServiceResult {
    let api_base_url = format!("http://{OPENCODE_HOSTNAME}:{port}");
    let command_arg = opencode_command_arg_for_mode(&mode);
    let web_url = format!(
        "{}/{}/session",
        api_base_url,
        base64_url_no_pad(&workspace_path)
    );
    OpenCodeServiceResult {
        session_id,
        workspace_path,
        mode,
        api_base_url: api_base_url.clone(),
        web_url,
        command: format!("opencode {command_arg} --hostname 127.0.0.1 --port <port>"),
        pid: Some(pid),
        already_running,
        trust_kernel_run_dir: trust_kernel.run_dir,
        trust_kernel_packet_path: trust_kernel.packet_path,
        trust_kernel_brief_path: trust_kernel.brief_path,
        trust_kernel_warning: trust_kernel.warning,
    }
}

fn start_trust_kernel_advisory(
    workspace: &Path,
    session_id: &str,
    mode_arg: &str,
) -> TrustKernelAdvisory {
    let Some(root) = resolve_trust_kernel_root() else {
        return TrustKernelAdvisory {
            warning: Some(
                "Trust Kernel root was not found; OpenCode launched without a protocol packet."
                    .to_string(),
            ),
            ..TrustKernelAdvisory::default()
        };
    };
    let task = format!("OpenCode {mode_arg} workspace launch");
    let output = run_trust_kernel_command(
        &root,
        &[
            "run",
            "python",
            "-m",
            "trust_kernel",
            "advisory-start",
            "--task",
            &task,
            "--runtime",
            "opencode",
            "--agent-id",
            "opencode.runtime",
            "--session-id",
            session_id,
            "--cwd",
            &workspace.display().to_string(),
        ],
    );
    match output {
        Ok(stdout) => match serde_json::from_str::<TrustKernelStartOutput>(&stdout) {
            Ok(parsed) => TrustKernelAdvisory {
                run_dir: Some(parsed.run_dir),
                packet_path: Some(parsed.packet_path),
                brief_path: Some(parsed.brief_path),
                warning: None,
            },
            Err(error) => TrustKernelAdvisory {
                warning: Some(format!(
                    "Trust Kernel advisory output was not parseable: {error}"
                )),
                ..TrustKernelAdvisory::default()
            },
        },
        Err(error) => TrustKernelAdvisory {
            warning: Some(error),
            ..TrustKernelAdvisory::default()
        },
    }
}

fn finish_trust_kernel_advisory(run_dir: &str) -> Option<String> {
    let root = resolve_trust_kernel_root()?;
    run_trust_kernel_command(
        &root,
        &[
            "run",
            "python",
            "-m",
            "trust_kernel",
            "finalize-run",
            "--run",
            run_dir,
        ],
    )
    .err()
}

fn build_trust_hook_event_args(
    run_dir: &str,
    session_id: &str,
    event_type: &str,
    cwd: &str,
    content: &str,
    command: Option<&str>,
    tool: &str,
    path: &str,
    returncode: Option<i32>,
    metadata: &serde_json::Value,
) -> Result<Vec<String>, String> {
    if !matches!(
        event_type,
        "user_message"
            | "assistant_message"
            | "tool_call"
            | "artifact_written"
            | "agent_end"
            | "verification_report"
    ) {
        return Err(format!("Unsupported Trust Kernel event type: {event_type}"));
    }
    let payload = serde_json::json!({
        "run": run_dir,
        "event_type": event_type,
        "runtime": "opencode",
        "agent_id": "opencode.runtime",
        "session_id": session_id,
        "cwd": cwd,
        "content": content,
        "command": command,
        "tool": tool,
        "path": path,
        "returncode": returncode,
        "metadata": metadata,
    });
    Ok(vec![
        "run".to_string(),
        "python".to_string(),
        "-m".to_string(),
        "trust_kernel".to_string(),
        "hook-event".to_string(),
        "--payload".to_string(),
        payload.to_string(),
    ])
}

fn run_trust_kernel_command(root: &Path, args: &[&str]) -> Result<String, String> {
    let mut child = Command::new("uv")
        .args(args)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to start Trust Kernel advisory command: {error}"))?;
    let deadline = Instant::now() + TRUST_KERNEL_COMMAND_TIMEOUT;
    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child.wait_with_output().map_err(|error| {
                    format!("Failed to read Trust Kernel advisory output: {error}")
                })?;
                if output.status.success() {
                    return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
                }
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Err(if stderr.is_empty() {
                    "Trust Kernel advisory command failed without stderr.".to_string()
                } else {
                    format!("Trust Kernel advisory command failed: {stderr}")
                });
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(error) => {
                return Err(format!(
                    "Failed to inspect Trust Kernel advisory command: {error}"
                ));
            }
        }
    }
    let _ = child.kill();
    let _ = child.wait();
    Err("Trust Kernel advisory command timed out.".to_string())
}

fn resolve_trust_kernel_root() -> Option<PathBuf> {
    if let Ok(value) = env::var("TRUST_KERNEL_ROOT") {
        let path = PathBuf::from(value);
        if has_trust_kernel_package(&path) {
            return Some(path);
        }
    }
    env::current_dir()
        .ok()
        .and_then(|path| resolve_trust_kernel_root_from(&path))
}

fn resolve_trust_kernel_root_from(start: &Path) -> Option<PathBuf> {
    start
        .ancestors()
        .find(|candidate| has_trust_kernel_package(candidate))
        .map(Path::to_path_buf)
}

fn has_trust_kernel_package(path: &Path) -> bool {
    path.join("trust_kernel").join("__init__.py").is_file() && path.join("pyproject.toml").is_file()
}

fn available_local_port() -> Option<u16> {
    TcpListener::bind((OPENCODE_HOSTNAME, 0))
        .ok()
        .and_then(|listener| listener.local_addr().ok().map(|address| address.port()))
}

fn wait_for_opencode_health(port: u16) -> Result<(), String> {
    let deadline = Instant::now() + OPENCODE_HEALTH_TIMEOUT;
    while Instant::now() < deadline {
        if opencode_health_ready(port) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(150));
    }
    Err(format!(
        "OpenCode started but did not become healthy on {OPENCODE_HOSTNAME}:{port} within {}s.",
        OPENCODE_HEALTH_TIMEOUT.as_secs()
    ))
}

fn opencode_health_ready(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect((OPENCODE_HOSTNAME, port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    if stream
        .write_all(b"GET /global/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok()
        && response.starts_with("HTTP/1.1 200")
        && response.contains("\"healthy\":true")
}

fn resolve_opencode_binary() -> Option<String> {
    let command = if cfg!(target_os = "windows") {
        ("where", vec!["opencode"])
    } else {
        ("which", vec!["opencode"])
    };
    Command::new(command.0)
        .args(command.1)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
                .map(ToOwned::to_owned)
        })
        .or_else(resolve_opencode_app_binary)
}

fn resolve_opencode_app_binary() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let path = "/Applications/OpenCode.app/Contents/MacOS/opencode-cli";
        if Path::new(path).is_file() {
            return Some(path.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{
        base64_url_no_pad, build_trust_hook_event_args, opencode_command_arg_for_mode,
        opencode_prompt_message_body, percent_encode_query, post_opencode_json,
        resolve_trust_kernel_root_from, service_result, validate_workspace_path,
        OpenCodeLaunchMode, TrustKernelAdvisory,
    };
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn rejects_missing_workspace_path_before_launch() {
        assert!(validate_workspace_path("/definitely/not/a/real/opencode/workspace").is_err());
    }

    #[test]
    fn builds_local_only_service_urls() {
        let result = service_result(
            "test".to_string(),
            "/tmp/work".to_string(),
            4096,
            OpenCodeLaunchMode::Web,
            42,
            false,
            TrustKernelAdvisory::default(),
        );
        assert_eq!(result.api_base_url, "http://127.0.0.1:4096");
        assert_eq!(result.web_url, "http://127.0.0.1:4096/L3RtcC93b3Jr/session");
    }

    #[test]
    fn web_launch_mode_uses_embed_safe_headless_server() {
        assert_eq!(
            opencode_command_arg_for_mode(&OpenCodeLaunchMode::Web),
            "serve"
        );
        assert_eq!(
            opencode_command_arg_for_mode(&OpenCodeLaunchMode::Serve),
            "serve"
        );
    }

    #[test]
    fn includes_trust_kernel_metadata_in_service_result() {
        let result = service_result(
            "test".to_string(),
            "/tmp/work".to_string(),
            4096,
            OpenCodeLaunchMode::Web,
            42,
            false,
            TrustKernelAdvisory {
                run_dir: Some("trust_kernel/runs/run".to_string()),
                packet_path: Some("trust_kernel/runs/run/agent_packet.md".to_string()),
                brief_path: Some("trust_kernel/runs/run/protocol_brief.md".to_string()),
                warning: None,
            },
        );
        assert_eq!(
            result.trust_kernel_packet_path.as_deref(),
            Some("trust_kernel/runs/run/agent_packet.md")
        );
    }

    #[test]
    fn resolves_trust_kernel_root_from_nested_vnext_path() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|path| path.parent())
            .expect("vnext should live inside repository root")
            .to_path_buf();
        if root.join("trust_kernel").join("__init__.py").is_file() {
            let nested = root.join("resonantos-vnext").join("src-tauri");
            assert_eq!(
                resolve_trust_kernel_root_from(&nested).as_deref(),
                Some(root.as_path())
            );
        }
    }

    #[test]
    fn builds_trust_hook_event_command() {
        let args = build_trust_hook_event_args(
            "trust_kernel/runs/run",
            "opencode-main",
            "tool_call",
            "/tmp/work",
            "cargo test",
            Some("cargo test"),
            "shell",
            "",
            Some(0),
            &serde_json::json!({"source": "unit-test"}),
        )
        .expect("tool_call event should be supported");

        assert!(args.windows(2).any(|pair| pair == ["-m", "trust_kernel"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["trust_kernel", "hook-event"]));
        let payload_arg = args
            .windows(2)
            .find_map(|pair| (pair[0] == "--payload").then_some(pair[1].as_str()))
            .expect("hook-event command should pass a JSON payload");
        let payload: serde_json::Value =
            serde_json::from_str(payload_arg).expect("payload should be valid JSON");
        assert_eq!(payload["run"], "trust_kernel/runs/run");
        assert_eq!(payload["event_type"], "tool_call");
        assert_eq!(payload["session_id"], "opencode-main");
        assert_eq!(payload["command"], "cargo test");
        assert_eq!(payload["returncode"], 0);
        assert_eq!(payload["metadata"]["source"], "unit-test");
    }

    #[test]
    fn rejects_unsupported_trust_event_type() {
        let result = build_trust_hook_event_args(
            "trust_kernel/runs/run",
            "opencode-main",
            "unknown",
            "/tmp/work",
            "",
            None,
            "",
            "",
            None,
            &serde_json::json!({}),
        );
        assert!(result.is_err());
    }

    #[test]
    fn allocates_ephemeral_local_port() {
        let port = super::available_local_port().expect("local port should be available");
        assert!(port > 0);
    }

    #[test]
    fn encodes_opencode_prompt_query_paths() {
        assert_eq!(
            percent_encode_query("/Users/augmentor/My Vault/Notes + Code"),
            "%2FUsers%2Faugmentor%2FMy%20Vault%2FNotes%20%2B%20Code"
        );
        assert_eq!(
            base64_url_no_pad("/Users/augmentor/My Vault/Notes + Code"),
            "L1VzZXJzL2F1Z21lbnRvci9NeSBWYXVsdC9Ob3RlcyArIENvZGU"
        );
    }

    #[test]
    fn builds_visible_opencode_prompt_bodies() {
        let context_only: serde_json::Value =
            serde_json::from_str(&opencode_prompt_message_body("review only", true))
                .expect("prompt body should be valid JSON");
        assert_eq!(context_only["noReply"], true);
        assert_eq!(context_only["parts"][0]["type"], "text");
        assert_eq!(context_only["parts"][0]["text"], "review only");

        let submitted: serde_json::Value =
            serde_json::from_str(&opencode_prompt_message_body("start work", false))
                .expect("prompt body should be valid JSON");
        assert_eq!(submitted["noReply"], false);
        assert_eq!(submitted["parts"][0]["text"], "start work");
    }

    #[test]
    fn posts_opencode_json_to_loopback_api() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
        let port = listener.local_addr().expect("local addr").port();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("request should arrive");
            let mut buffer = [0_u8; 2048];
            let bytes = stream.read(&mut buffer).expect("request should read");
            let request = String::from_utf8_lossy(&buffer[..bytes]);
            assert!(request
                .starts_with("POST /session/ses_test/message?directory=%2Ftmp%2Fwork HTTP/1.1"));
            assert!(request.contains("Content-Type: application/json"));
            assert!(request.contains("\"noReply\":false"));
            assert!(request.contains("\"text\":\"hello\""));
            assert!(request.contains("\"type\":\"text\""));
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\ntrue")
                .expect("response should write");
        });

        let response = post_opencode_json(
            port,
            "/session/ses_test/message?directory=%2Ftmp%2Fwork",
            Some(&opencode_prompt_message_body("hello", false)),
        )
        .expect("post should succeed");
        assert_eq!(response, "true");
        handle.join().expect("server thread should finish");
    }
}
