// Intent citation: docs/architecture/ADR-009-rust-service-ipc-boundary.md
// Intent citation: docs/architecture/ADR-029-living-archive-mcp-bridge.md

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::host_state::ensure_portable_user_state;

const DEFAULT_MEMORY_SERVICE_PORT: u16 = 4888;
const MEMORY_SERVICE_HOSTNAME: &str = "127.0.0.1";
const MEMORY_SERVICE_SESSION_ID: &str = "living-archive-memory-service";
const MEMORY_SERVICE_HEALTH_TIMEOUT: Duration = Duration::from_secs(8);

static MEMORY_SERVICE_SESSIONS: OnceLock<Mutex<HashMap<String, MemoryServiceProcessSession>>> =
    OnceLock::new();

fn memory_service_sessions() -> &'static Mutex<HashMap<String, MemoryServiceProcessSession>> {
    MEMORY_SERVICE_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

struct MemoryServiceProcessSession {
    child: Child,
    memory_root: String,
    port: u16,
    readonly: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryServiceStatusRequest {
    pub(crate) port: Option<u16>,
    pub(crate) session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryServiceStartRequest {
    pub(crate) port: Option<u16>,
    pub(crate) session_id: Option<String>,
    pub(crate) readonly: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryServiceStopRequest {
    pub(crate) session_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryServiceStatus {
    pub(crate) available: bool,
    pub(crate) running: bool,
    pub(crate) endpoint: String,
    pub(crate) memory_root: String,
    pub(crate) session_id: String,
    pub(crate) readonly: bool,
    pub(crate) pid: Option<u32>,
    pub(crate) command: String,
    pub(crate) status_detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryServiceResult {
    pub(crate) session_id: String,
    pub(crate) endpoint: String,
    pub(crate) memory_root: String,
    pub(crate) readonly: bool,
    pub(crate) command: String,
    pub(crate) pid: Option<u32>,
    pub(crate) already_running: bool,
}

pub(crate) fn query_memory_service_status(
    app: &AppHandle,
    request: MemoryServiceStatusRequest,
) -> Result<MemoryServiceStatus, String> {
    let portable_state = ensure_portable_user_state(app)?;
    let session_id = normalize_session_id(request.session_id);
    let port = request.port.unwrap_or(DEFAULT_MEMORY_SERVICE_PORT);
    let endpoint = endpoint_for_port(port);
    let script = memory_service_script_path(app)?;
    let available = script.is_file();
    let command = command_label(&script);

    let mut sessions = memory_service_sessions()
        .lock()
        .map_err(|_| "Living Archive memory service session lock is poisoned.".to_string())?;
    if let Some(existing) = sessions.get_mut(&session_id) {
        if existing
            .child
            .try_wait()
            .map_err(|error| format!("Failed to inspect Living Archive memory service: {error}"))?
            .is_none()
        {
            return Ok(MemoryServiceStatus {
                available,
                running: true,
                endpoint: endpoint_for_port(existing.port),
                memory_root: existing.memory_root.clone(),
                session_id,
                readonly: existing.readonly,
                pid: Some(existing.child.id()),
                command,
                status_detail: "Managed Living Archive memory service is running.".to_string(),
            });
        }
        sessions.remove(&session_id);
    }

    Ok(MemoryServiceStatus {
        available,
        running: false,
        endpoint,
        memory_root: portable_state.memory_root,
        session_id,
        readonly: false,
        pid: None,
        command,
        status_detail: if available {
            "Living Archive memory service is available but not running.".to_string()
        } else {
            "Living Archive memory service script is missing from the app bundle.".to_string()
        },
    })
}

pub(crate) fn start_memory_service(
    app: &AppHandle,
    request: MemoryServiceStartRequest,
) -> Result<MemoryServiceResult, String> {
    let portable_state = ensure_portable_user_state(app)?;
    let script = memory_service_script_path(app)?;
    if !script.is_file() {
        return Err(format!(
            "Living Archive memory service script was not found at {}.",
            script.display()
        ));
    }

    let session_id = normalize_session_id(request.session_id);
    let port = match request.port {
        Some(port) => port,
        None => available_local_port().unwrap_or(DEFAULT_MEMORY_SERVICE_PORT),
    };
    let readonly = request.readonly.unwrap_or(false);
    let endpoint = endpoint_for_port(port);

    let mut sessions = memory_service_sessions()
        .lock()
        .map_err(|_| "Living Archive memory service session lock is poisoned.".to_string())?;
    if let Some(existing) = sessions.get_mut(&session_id) {
        if existing
            .child
            .try_wait()
            .map_err(|error| {
                format!("Failed to inspect existing Living Archive memory service: {error}")
            })?
            .is_none()
        {
            return Ok(MemoryServiceResult {
                session_id,
                endpoint: endpoint_for_port(existing.port),
                memory_root: existing.memory_root.clone(),
                readonly: existing.readonly,
                command: command_label(&script),
                pid: Some(existing.child.id()),
                already_running: true,
            });
        }
        sessions.remove(&session_id);
    }

    let child = Command::new(resolve_node_binary())
        .arg(&script)
        .arg("--memory-root")
        .arg(&portable_state.memory_root)
        .arg("--host")
        .arg(MEMORY_SERVICE_HOSTNAME)
        .arg("--port")
        .arg(port.to_string())
        .args(if readonly { vec!["--readonly"] } else { vec![] })
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to start Living Archive memory service: {error}"))?;
    let pid = child.id();

    sessions.insert(
        session_id.clone(),
        MemoryServiceProcessSession {
            child,
            memory_root: portable_state.memory_root.clone(),
            port,
            readonly,
        },
    );
    wait_for_memory_service_health(port)?;

    Ok(MemoryServiceResult {
        session_id,
        endpoint,
        memory_root: portable_state.memory_root,
        readonly,
        command: command_label(&script),
        pid: Some(pid),
        already_running: false,
    })
}

pub(crate) fn stop_memory_service(
    request: MemoryServiceStopRequest,
) -> Result<MemoryServiceResult, String> {
    let session_id = normalize_session_id(request.session_id);
    let mut sessions = memory_service_sessions()
        .lock()
        .map_err(|_| "Living Archive memory service session lock is poisoned.".to_string())?;
    let Some(mut session) = sessions.remove(&session_id) else {
        return Err(format!(
            "No Living Archive memory service session is running: {session_id}"
        ));
    };
    let pid = session.child.id();
    let _ = session.child.kill();
    let _ = session.child.wait();
    Ok(MemoryServiceResult {
        session_id,
        endpoint: endpoint_for_port(session.port),
        memory_root: session.memory_root,
        readonly: session.readonly,
        command: "node examples/living-archive-memory-service.mjs".to_string(),
        pid: Some(pid),
        already_running: false,
    })
}

fn normalize_session_id(value: Option<String>) -> String {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| MEMORY_SERVICE_SESSION_ID.to_string())
}

fn endpoint_for_port(port: u16) -> String {
    format!("http://{MEMORY_SERVICE_HOSTNAME}:{port}")
}

fn memory_service_script_path(app: &AppHandle) -> Result<PathBuf, String> {
    let current_dir = std::env::current_dir()
        .map_err(|error| format!("Failed to resolve current working directory: {error}"))?;
    for candidate in [
        current_dir
            .join("examples")
            .join("living-archive-memory-service.mjs"),
        current_dir
            .parent()
            .unwrap_or(&current_dir)
            .join("examples")
            .join("living-archive-memory-service.mjs"),
        app.path()
            .resource_dir()
            .unwrap_or_else(|_| current_dir.clone())
            .join("examples")
            .join("living-archive-memory-service.mjs"),
        app.path()
            .resource_dir()
            .unwrap_or_else(|_| current_dir.clone())
            .join("living-archive-memory-service.mjs"),
    ] {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Ok(current_dir
        .join("examples")
        .join("living-archive-memory-service.mjs"))
}

fn command_label(script: &PathBuf) -> String {
    format!("node {}", script.display())
}

fn resolve_node_binary() -> String {
    std::env::var("RESONANTOS_NODE_BINARY").unwrap_or_else(|_| "node".to_string())
}

fn available_local_port() -> Option<u16> {
    TcpListener::bind((MEMORY_SERVICE_HOSTNAME, 0))
        .ok()
        .and_then(|listener| listener.local_addr().ok().map(|address| address.port()))
}

fn wait_for_memory_service_health(port: u16) -> Result<(), String> {
    let deadline = Instant::now() + MEMORY_SERVICE_HEALTH_TIMEOUT;
    while Instant::now() < deadline {
        if memory_service_health_ready(port) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(150));
    }
    Err(format!(
        "Living Archive memory service started but did not become healthy on {MEMORY_SERVICE_HOSTNAME}:{port} within {}s.",
        MEMORY_SERVICE_HEALTH_TIMEOUT.as_secs()
    ))
}

fn memory_service_health_ready(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect((MEMORY_SERVICE_HOSTNAME, port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    if stream
        .write_all(
            b"POST /memory/status HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
        )
        .is_err()
    {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok()
        && (response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
}

#[cfg(test)]
mod tests {
    use super::{endpoint_for_port, normalize_session_id};

    #[test]
    fn defaults_session_id_for_empty_input() {
        assert_eq!(
            normalize_session_id(Some("   ".to_string())),
            "living-archive-memory-service"
        );
    }

    #[test]
    fn builds_loopback_endpoint() {
        assert_eq!(endpoint_for_port(4888), "http://127.0.0.1:4888");
    }
}
