use std::env;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

static BROWSER_HOST: OnceLock<Mutex<Option<BrowserHostProcess>>> = OnceLock::new();
static BROWSER_VISIBLE_HOST: OnceLock<Mutex<Option<BrowserHostProcess>>> = OnceLock::new();

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserHostCommandRequest {
    pub method: String,
    #[serde(default)]
    pub params: Value,
    #[serde(default)]
    pub human_approved: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserHostRpcRequest {
    id: String,
    method: String,
    params: Value,
}

struct BrowserHostProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<std::process::ChildStdout>,
}

impl Drop for BrowserHostProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn browser_host_slot() -> &'static Mutex<Option<BrowserHostProcess>> {
    BROWSER_HOST.get_or_init(|| Mutex::new(None))
}

fn browser_visible_host_slot() -> &'static Mutex<Option<BrowserHostProcess>> {
    BROWSER_VISIBLE_HOST.get_or_init(|| Mutex::new(None))
}

pub fn browser_host_required_capabilities(method: &str) -> Result<Vec<&'static str>, String> {
    match method {
        "browser.health"
        | "browser.read_page"
        | "browser.click"
        | "browser.type"
        | "browser.capture_evidence"
        | "browser.extensions.list"
        | "browser.extensions.set_pinned"
        | "browser.extensions.disable"
        | "browser.close"
        | "browser.close_session" => Ok(vec!["browser-control"]),
        "browser.extensions.load_unpacked" => Ok(vec!["filesystem", "browser-control"]),
        "browser.start" | "browser.open_url" => Ok(vec!["network", "browser-control"]),
        _ => Err(format!("Unsupported Browser host method `{method}`.")),
    }
}

pub fn execute_browser_host_command(
    app: &AppHandle,
    request: BrowserHostCommandRequest,
) -> Result<Value, String> {
    validate_browser_host_request(&request)?;
    let mut slot = browser_host_slot()
        .lock()
        .map_err(|_| "Browser host process lock is poisoned.".to_string())?;
    if slot.as_mut().map(process_alive).unwrap_or(false) == false {
        *slot = Some(start_browser_host_process(app)?);
    }
    let host = slot
        .as_mut()
        .ok_or_else(|| "Browser host process failed to start.".to_string())?;
    match send_rpc(host, &request) {
        Ok(value) => Ok(value),
        Err(first_error) => {
            *slot = Some(start_browser_host_process(app)?);
            let host = slot
                .as_mut()
                .ok_or_else(|| "Browser host process failed to restart.".to_string())?;
            send_rpc(host, &request).map_err(|second_error| {
                format!("Browser host command failed after restart: {first_error}; {second_error}")
            })
        }
    }
}

pub fn execute_browser_visible_host_command(
    app: &AppHandle,
    request: BrowserHostCommandRequest,
) -> Result<Value, String> {
    validate_browser_host_request(&request)?;
    let mut slot = browser_visible_host_slot()
        .lock()
        .map_err(|_| "Visible Browser host process lock is poisoned.".to_string())?;
    if slot.as_mut().map(process_alive).unwrap_or(false) == false {
        *slot = Some(start_browser_visible_host_process(app)?);
    }
    let host = slot
        .as_mut()
        .ok_or_else(|| "Visible Browser host process failed to start.".to_string())?;
    match send_rpc(host, &request) {
        Ok(value) => Ok(value),
        Err(first_error) => {
            *slot = Some(start_browser_visible_host_process(app)?);
            let host = slot
                .as_mut()
                .ok_or_else(|| "Visible Browser host process failed to restart.".to_string())?;
            send_rpc(host, &request).map_err(|second_error| {
                format!("Visible Browser host command failed after restart: {first_error}; {second_error}")
            })
        }
    }
}

fn validate_browser_host_request(request: &BrowserHostCommandRequest) -> Result<(), String> {
    browser_host_required_capabilities(&request.method)?;
    if request.method == "browser.type"
        && request
            .params
            .get("sensitive")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        && !request.human_approved
    {
        return Err("Sensitive Browser typing requires explicit human approval.".to_string());
    }
    if request.method == "browser.extensions.load_unpacked" && !request.human_approved {
        return Err("Loading a Browser extension requires explicit human approval.".to_string());
    }
    Ok(())
}

fn process_alive(process: &mut BrowserHostProcess) -> bool {
    matches!(process.child.try_wait(), Ok(None))
}

fn send_rpc(
    host: &mut BrowserHostProcess,
    request: &BrowserHostCommandRequest,
) -> Result<Value, String> {
    let rpc_request = BrowserHostRpcRequest {
        id: format!("browser-host-{}", timestamp_millis()),
        method: request.method.clone(),
        params: request.params.clone(),
    };
    let payload = serde_json::to_string(&rpc_request)
        .map_err(|error| format!("Failed to encode Browser host request: {error}"))?;
    host.stdin
        .write_all(payload.as_bytes())
        .and_then(|_| host.stdin.write_all(b"\n"))
        .and_then(|_| host.stdin.flush())
        .map_err(|error| format!("Failed to write Browser host request: {error}"))?;

    let mut line = String::new();
    let bytes = host
        .stdout
        .read_line(&mut line)
        .map_err(|error| format!("Failed to read Browser host response: {error}"))?;
    if bytes == 0 {
        return Err("Browser host closed before returning a response.".to_string());
    }

    let response = serde_json::from_str::<Value>(&line)
        .map_err(|error| format!("Invalid Browser host response JSON: {error}"))?;
    if let Some(error) = response.get("error") {
        let message = error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Unknown Browser host error.");
        return Err(message.to_string());
    }
    response
        .get("result")
        .cloned()
        .ok_or_else(|| "Browser host response did not include result.".to_string())
}

fn start_browser_host_process(app: &AppHandle) -> Result<BrowserHostProcess, String> {
    let script = resolve_browser_host_script(app)?;
    let node = env::var("RESONANTOS_NODE").unwrap_or_else(|_| "node".to_string());
    let mut child = Command::new(node)
        .arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            format!(
                "Failed to start Browser host service at {}: {error}",
                script.display()
            )
        })?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Browser host stdin was not available.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Browser host stdout was not available.".to_string())?;
    Ok(BrowserHostProcess {
        child,
        stdin,
        stdout: BufReader::new(stdout),
    })
}

fn start_browser_visible_host_process(app: &AppHandle) -> Result<BrowserHostProcess, String> {
    let script = resolve_browser_visible_host_script(app)?;
    let electron = resolve_browser_visible_host_electron(app)?;
    repair_macos_electron_framework_layout(&electron)?;
    let mut child = Command::new(&electron)
        .arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            format!(
                "Failed to start visible Browser host service with {} at {}: {error}",
                electron.display(),
                script.display()
            )
        })?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Visible Browser host stdin was not available.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Visible Browser host stdout was not available.".to_string())?;
    Ok(BrowserHostProcess {
        child,
        stdin,
        stdout: BufReader::new(stdout),
    })
}

fn resolve_browser_host_script(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = env::var("RESONANTOS_BROWSER_HOST_PATH") {
        return assert_browser_host_script(PathBuf::from(path));
    }

    let relative = PathBuf::from("addons/resonant-browser-host/src/browser-host.mjs");
    let mut candidates = Vec::new();
    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join(&relative));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(&relative));
        candidates.push(resource_dir.join("_up_").join(&relative));
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join(&relative));
            candidates.push(parent.join("../../../../").join(&relative));
        }
    }

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .map(Ok)
        .unwrap_or_else(|| {
            Err("Browser host service was not found. Set RESONANTOS_BROWSER_HOST_PATH or install the Browser add-on service.".to_string())
        })
}

fn resolve_browser_visible_host_script(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = env::var("RESONANTOS_BROWSER_VISIBLE_HOST_PATH") {
        return assert_browser_host_script(PathBuf::from(path));
    }

    let relative = PathBuf::from("addons/resonant-browser-host/src/electron-visible-host.mjs");
    let mut candidates = Vec::new();
    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join(&relative));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(&relative));
        candidates.push(resource_dir.join("_up_").join(&relative));
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join(&relative));
            candidates.push(parent.join("../../../../").join(&relative));
        }
    }

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .map(Ok)
        .unwrap_or_else(|| {
            Err("Visible Browser host service was not found. Set RESONANTOS_BROWSER_VISIBLE_HOST_PATH or install the Browser add-on service.".to_string())
        })
}

fn resolve_browser_visible_host_electron(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = env::var("RESONANTOS_ELECTRON") {
        return assert_executable_path(PathBuf::from(path), "Electron");
    }

    let mut candidates = Vec::new();
    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join(
            "addons/resonant-browser-host/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
        ));
        candidates
            .push(current_dir.join("addons/resonant-browser-host/node_modules/.bin/electron"));
        candidates.push(current_dir.join("node_modules/.bin/electron"));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(
            "addons/resonant-browser-host/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
        ));
        candidates
            .push(resource_dir.join("addons/resonant-browser-host/node_modules/.bin/electron"));
        candidates.push(resource_dir.join("_up_").join(
            "addons/resonant-browser-host/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
        ));
        candidates.push(
            resource_dir
                .join("_up_")
                .join("addons/resonant-browser-host/node_modules/.bin/electron"),
        );
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join(
                "addons/resonant-browser-host/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
            ));
            candidates.push(parent.join("addons/resonant-browser-host/node_modules/.bin/electron"));
            candidates.push(parent.join(
                "../../../../addons/resonant-browser-host/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
            ));
            candidates.push(
                parent.join("../../../../addons/resonant-browser-host/node_modules/.bin/electron"),
            );
        }
    }

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .map(Ok)
        .unwrap_or_else(|| {
            Err("Electron runtime for Browser v2 was not found. Run `npm install` in addons/resonant-browser-host or set RESONANTOS_ELECTRON.".to_string())
        })
}

fn assert_browser_host_script(path: PathBuf) -> Result<PathBuf, String> {
    if path.is_file() {
        Ok(path)
    } else {
        Err(format!(
            "Browser host service path does not exist: {}",
            path.display()
        ))
    }
}

fn assert_executable_path(path: PathBuf, label: &str) -> Result<PathBuf, String> {
    if path.is_file() {
        Ok(path)
    } else {
        Err(format!("{label} path does not exist: {}", path.display()))
    }
}

#[cfg(target_os = "macos")]
fn repair_macos_electron_framework_layout(electron_binary: &Path) -> Result<(), String> {
    let contents_dir = electron_binary
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| {
            format!(
                "Could not resolve Electron.app Contents directory from {}",
                electron_binary.display()
            )
        })?;
    let framework_dir = contents_dir
        .join("Frameworks")
        .join("Electron Framework.framework");
    if !framework_dir.is_dir() {
        return Ok(());
    }

    ensure_framework_link(&framework_dir, "Versions/Current", "A")?;
    ensure_framework_link(
        &framework_dir,
        "Electron Framework",
        "Versions/Current/Electron Framework",
    )?;
    ensure_framework_link(&framework_dir, "Libraries", "Versions/Current/Libraries")?;
    ensure_framework_link(&framework_dir, "Resources", "Versions/Current/Resources")?;
    ensure_framework_link(&framework_dir, "Helpers", "Versions/Current/Helpers")?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn ensure_framework_link(framework_dir: &Path, link: &str, target: &str) -> Result<(), String> {
    let link_path = framework_dir.join(link);
    if link_path.exists() {
        return Ok(());
    }
    let target_path = link_path
        .parent()
        .map(|parent| parent.join(target))
        .unwrap_or_else(|| framework_dir.join(target));
    if !target_path.exists() {
        return Ok(());
    }
    std::os::unix::fs::symlink(target, &link_path).map_err(|error| {
        format!(
            "Failed to repair packaged Electron framework symlink {} -> {}: {error}",
            link_path.display(),
            target
        )
    })
}

#[cfg(not(target_os = "macos"))]
fn repair_macos_electron_framework_layout(_electron_binary: &Path) -> Result<(), String> {
    Ok(())
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::{browser_host_required_capabilities, validate_browser_host_request};
    use serde_json::json;

    #[test]
    fn maps_browser_host_methods_to_required_capabilities() {
        assert_eq!(
            browser_host_required_capabilities("browser.open_url").unwrap(),
            vec!["network", "browser-control"]
        );
        assert_eq!(
            browser_host_required_capabilities("browser.read_page").unwrap(),
            vec!["browser-control"]
        );
        assert_eq!(
            browser_host_required_capabilities("browser.extensions.load_unpacked").unwrap(),
            vec!["filesystem", "browser-control"]
        );
        assert!(browser_host_required_capabilities("browser.shell").is_err());
    }

    #[test]
    fn blocks_sensitive_typing_without_human_approval() {
        let request = super::BrowserHostCommandRequest {
            method: "browser.type".to_string(),
            params: json!({ "selector": "#password", "text": "secret", "sensitive": true }),
            human_approved: false,
        };
        assert!(validate_browser_host_request(&request).is_err());
    }

    #[test]
    fn blocks_extension_loading_without_human_approval() {
        let request = super::BrowserHostCommandRequest {
            method: "browser.extensions.load_unpacked".to_string(),
            params: json!({ "path": "/tmp/example-extension" }),
            human_approved: false,
        };
        assert!(validate_browser_host_request(&request).is_err());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn repairs_flattened_packaged_electron_framework_symlinks() {
        let root = std::env::temp_dir().join(format!(
            "resonantos-electron-framework-test-{}",
            super::timestamp_millis()
        ));
        let electron_binary = root
            .join("Electron.app")
            .join("Contents")
            .join("MacOS")
            .join("Electron");
        let framework_dir = root
            .join("Electron.app")
            .join("Contents")
            .join("Frameworks")
            .join("Electron Framework.framework");
        std::fs::create_dir_all(electron_binary.parent().unwrap()).unwrap();
        std::fs::write(&electron_binary, "").unwrap();
        std::fs::create_dir_all(framework_dir.join("Versions/A/Libraries")).unwrap();
        std::fs::create_dir_all(framework_dir.join("Versions/A/Resources")).unwrap();
        std::fs::create_dir_all(framework_dir.join("Versions/A/Helpers")).unwrap();
        std::fs::write(framework_dir.join("Versions/A/Electron Framework"), "").unwrap();

        super::repair_macos_electron_framework_layout(&electron_binary).unwrap();

        assert!(framework_dir.join("Libraries").exists());
        assert!(framework_dir.join("Resources").exists());
        assert!(framework_dir.join("Helpers").exists());
        assert!(framework_dir.join("Versions/Current").exists());

        let _ = std::fs::remove_dir_all(root);
    }
}
