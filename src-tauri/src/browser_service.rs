use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Manager};
#[cfg(not(target_os = "macos"))]
use tauri::{LogicalPosition, LogicalSize, WebviewBuilder, WebviewUrl};
use tungstenite::{Message, connect};

type CdpSocket = tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<std::net::TcpStream>>;

static BROWSER_SESSIONS: OnceLock<Mutex<HashMap<String, BrowserSession>>> = OnceLock::new();
#[cfg(not(target_os = "macos"))]
const NATIVE_BROWSER_WEBVIEW_LABEL: &str = "resonant-browser-native";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserOpenUrlRequest {
    pub url: String,
    pub viewport_width: Option<u32>,
    pub viewport_height: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionRequest {
    pub session_id: String,
    pub url: Option<String>,
    pub viewport_width: Option<u32>,
    pub viewport_height: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionIdRequest {
    pub session_id: String,
    pub viewport_width: Option<u32>,
    pub viewport_height: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInteractionRequest {
    pub session_id: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub delta_x: Option<f64>,
    pub delta_y: Option<f64>,
    pub viewport_width: Option<u32>,
    pub viewport_height: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserNativeWebviewRequest {
    pub url: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    #[cfg_attr(target_os = "macos", allow(dead_code))]
    pub navigate: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserNativeWebviewBoundsRequest {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserOpenUrlResult {
    pub session_id: String,
    pub requested_url: String,
    pub final_url: String,
    pub title: String,
    pub status: String,
    pub engine: String,
    pub screenshot_data_url: String,
    pub audit: Vec<BrowserAuditEvent>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserEngineStatus {
    pub installed: bool,
    pub engine_path: Option<String>,
    pub install_hint: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserEngineInstallResult {
    pub installed: bool,
    pub engine_path: Option<String>,
    pub log: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserNativeWebviewResult {
    pub label: String,
    pub url: Option<String>,
    pub visible: bool,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserReadPageResult {
    pub session_id: String,
    pub final_url: String,
    pub title: String,
    pub text: String,
    pub links: Vec<BrowserPageLink>,
    pub audit: Vec<BrowserAuditEvent>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserCloseSessionResult {
    pub session_id: String,
    pub closed: bool,
    pub audit: Vec<BrowserAuditEvent>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInteractionResult {
    pub session_id: String,
    pub final_url: String,
    pub title: String,
    pub screenshot_data_url: String,
    pub audit: Vec<BrowserAuditEvent>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPageLink {
    pub text: String,
    pub href: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAuditEvent {
    pub action: String,
    pub detail: String,
    pub timestamp: String,
}

struct BrowserChild {
    child: Child,
}

struct BrowserSession {
    _browser: BrowserChild,
    browser_ws_url: String,
    target_id: String,
    viewport: BrowserViewport,
    user_data_dir: PathBuf,
}

#[derive(Clone, Copy, Debug)]
struct BrowserViewport {
    width: u32,
    height: u32,
}

impl Drop for BrowserChild {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn browser_sessions() -> &'static Mutex<HashMap<String, BrowserSession>> {
    BROWSER_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn execute_browser_open_url(
    app: &AppHandle,
    request: BrowserOpenUrlRequest,
) -> Result<BrowserOpenUrlResult, String> {
    let normalized_url = normalize_browser_url(&request.url)?;
    let viewport = normalize_viewport(request.viewport_width, request.viewport_height);
    let session_id = format!("browser-{}", timestamp_millis());
    let user_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join("browser-engine")
        .join(&session_id);
    fs::create_dir_all(&user_data_dir)
        .map_err(|error| format!("Failed to create browser session directory: {error}"))?;

    let chromium_path = find_chromium_binary()
        .ok_or_else(|| "No Chromium browser engine found. Install the Browser add-on engine or set RESONANTOS_CHROMIUM_PATH.".to_string())?;
    let mut audit = vec![audit_event(
        "engine.resolved",
        format!("Using Chromium engine at {}", chromium_path.display()),
    )];

    let (mut browser, browser_ws_url) = launch_chromium(&chromium_path, &user_data_dir)?;
    audit.push(audit_event(
        "engine.launched",
        "Chromium launched with host-controlled CDP.".to_string(),
    ));

    let result = run_cdp_capture(&browser_ws_url, &session_id, &normalized_url, viewport)?;
    audit.extend(result.audit.clone());

    let _ = browser.child.kill();

    Ok(BrowserOpenUrlResult {
        session_id,
        requested_url: normalized_url,
        final_url: result.final_url,
        title: result.title,
        status: "captured".to_string(),
        engine: "chromium-cdp".to_string(),
        screenshot_data_url: format!("data:image/png;base64,{}", result.screenshot_base64),
        audit,
    })
}

pub fn query_browser_engine_status() -> BrowserEngineStatus {
    let engine_path = find_chromium_binary();
    BrowserEngineStatus {
        installed: engine_path.is_some(),
        engine_path: engine_path.map(|path| path.display().to_string()),
        install_hint: "Install the Browser add-on engine from Add-ons, or run `npx playwright install chromium`.".to_string(),
    }
}

pub fn install_browser_engine() -> Result<BrowserEngineInstallResult, String> {
    let output = Command::new("npx")
        .arg("playwright")
        .arg("install")
        .arg("chromium")
        .output()
        .map_err(|error| format!("Failed to start Chromium engine installer: {error}"))?;
    let mut log = String::new();
    log.push_str(&String::from_utf8_lossy(&output.stdout));
    log.push_str(&String::from_utf8_lossy(&output.stderr));
    let engine_path = find_chromium_binary();
    Ok(BrowserEngineInstallResult {
        installed: output.status.success() && engine_path.is_some(),
        engine_path: engine_path.map(|path| path.display().to_string()),
        log,
    })
}

pub fn execute_browser_start_session(
    app: &AppHandle,
    request: BrowserOpenUrlRequest,
) -> Result<BrowserOpenUrlResult, String> {
    let normalized_url = normalize_browser_url(&request.url)?;
    let viewport = normalize_viewport(request.viewport_width, request.viewport_height);
    let session_id = format!("browser-{}", timestamp_millis());
    let user_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join("browser-engine")
        .join(&session_id);
    fs::create_dir_all(&user_data_dir)
        .map_err(|error| format!("Failed to create browser session directory: {error}"))?;

    let chromium_path = find_chromium_binary()
        .ok_or_else(|| "No Chromium browser engine found. Install the Browser add-on engine or set RESONANTOS_CHROMIUM_PATH.".to_string())?;
    let mut audit = vec![audit_event(
        "engine.resolved",
        format!("Using Chromium engine at {}", chromium_path.display()),
    )];
    let (browser, browser_ws_url) = launch_chromium(&chromium_path, &user_data_dir)?;
    audit.push(audit_event(
        "engine.launched",
        "Persistent Chromium session launched with host-controlled CDP.".to_string(),
    ));

    let target_id = create_cdp_target(&browser_ws_url)?;
    audit.push(audit_event("target.created", target_id.clone()));
    let result = capture_existing_target(
        &browser_ws_url,
        &target_id,
        &session_id,
        Some(&normalized_url),
        viewport,
    )?;
    audit.extend(result.audit.clone());

    let mut sessions = browser_sessions()
        .lock()
        .map_err(|_| "Browser session registry is unavailable.".to_string())?;
    if let Some(previous) = sessions.insert(
        session_id.clone(),
        BrowserSession {
            _browser: browser,
            browser_ws_url,
            target_id,
            viewport,
            user_data_dir,
        },
    ) {
        drop(previous);
    }

    Ok(browser_capture_result(
        session_id,
        normalized_url,
        result,
        "session-active",
        audit,
    ))
}

pub fn execute_browser_session_open_url(
    request: BrowserSessionRequest,
) -> Result<BrowserOpenUrlResult, String> {
    let url = request
        .url
        .as_deref()
        .ok_or_else(|| "Browser session open_url requires a URL.".to_string())
        .and_then(normalize_browser_url)?;
    with_session(&request.session_id, |session| {
        let mut audit = vec![audit_event("session.reused", request.session_id.clone())];
        let viewport = normalize_viewport_or_existing(
            request.viewport_width,
            request.viewport_height,
            session.viewport,
        );
        let result = capture_existing_target(
            &session.browser_ws_url,
            &session.target_id,
            &request.session_id,
            Some(&url),
            viewport,
        )?;
        audit.extend(result.audit.clone());
        Ok(browser_capture_result(
            request.session_id.clone(),
            url,
            result,
            "session-active",
            audit,
        ))
    })
}

pub fn execute_browser_session_screenshot(
    request: BrowserSessionIdRequest,
) -> Result<BrowserOpenUrlResult, String> {
    with_session(&request.session_id, |session| {
        let mut audit = vec![audit_event("session.reused", request.session_id.clone())];
        let viewport = normalize_viewport_or_existing(
            request.viewport_width,
            request.viewport_height,
            session.viewport,
        );
        let result = capture_existing_target(
            &session.browser_ws_url,
            &session.target_id,
            &request.session_id,
            None,
            viewport,
        )?;
        let requested_url = result.final_url.clone();
        audit.extend(result.audit.clone());
        Ok(browser_capture_result(
            request.session_id.clone(),
            requested_url,
            result,
            "session-active",
            audit,
        ))
    })
}

pub fn execute_browser_session_click(
    request: BrowserInteractionRequest,
) -> Result<BrowserInteractionResult, String> {
    let lookup_session_id = request.session_id.clone();
    let result_session_id = request.session_id.clone();
    with_session(&lookup_session_id, |session| {
        let viewport = normalize_viewport_or_existing(
            request.viewport_width,
            request.viewport_height,
            session.viewport,
        );
        let x = request.x.unwrap_or(0.0).clamp(0.0, viewport.width as f64);
        let y = request.y.unwrap_or(0.0).clamp(0.0, viewport.height as f64);
        dispatch_mouse_click(&session.browser_ws_url, &session.target_id, x, y, viewport)?;
        let capture = capture_existing_target(
            &session.browser_ws_url,
            &session.target_id,
            &request.session_id,
            None,
            viewport,
        )?;
        Ok(browser_interaction_result(
            result_session_id,
            capture,
            vec![audit_event("input.click", format!("{x:.0},{y:.0}"))],
        ))
    })
}

pub fn execute_browser_session_scroll(
    request: BrowserInteractionRequest,
) -> Result<BrowserInteractionResult, String> {
    let lookup_session_id = request.session_id.clone();
    let result_session_id = request.session_id.clone();
    with_session(&lookup_session_id, |session| {
        let viewport = normalize_viewport_or_existing(
            request.viewport_width,
            request.viewport_height,
            session.viewport,
        );
        let delta_x = request.delta_x.unwrap_or(0.0);
        let delta_y = request.delta_y.unwrap_or(0.0);
        dispatch_mouse_wheel(
            &session.browser_ws_url,
            &session.target_id,
            delta_x,
            delta_y,
            viewport,
        )?;
        let capture = capture_existing_target(
            &session.browser_ws_url,
            &session.target_id,
            &request.session_id,
            None,
            viewport,
        )?;
        Ok(browser_interaction_result(
            result_session_id,
            capture,
            vec![audit_event(
                "input.scroll",
                format!("{delta_x:.0},{delta_y:.0}"),
            )],
        ))
    })
}

pub fn execute_browser_session_read_page(
    request: BrowserSessionIdRequest,
) -> Result<BrowserReadPageResult, String> {
    with_session(&request.session_id, |session| {
        let mut audit = vec![audit_event("session.reused", request.session_id.clone())];
        let page = read_existing_target(&session.browser_ws_url, &session.target_id)?;
        audit.push(audit_event("page.read", page.final_url.clone()));
        Ok(BrowserReadPageResult {
            session_id: request.session_id.clone(),
            final_url: page.final_url,
            title: page.title,
            text: page.text,
            links: page.links,
            audit,
        })
    })
}

pub fn execute_browser_close_session(
    request: BrowserSessionIdRequest,
) -> Result<BrowserCloseSessionResult, String> {
    let mut sessions = browser_sessions()
        .lock()
        .map_err(|_| "Browser session registry is unavailable.".to_string())?;
    let Some(session) = sessions.remove(&request.session_id) else {
        return Err(format!("Browser session not found: {}", request.session_id));
    };
    let user_data_dir = session.user_data_dir.clone();
    drop(session);
    let _ = fs::remove_dir_all(user_data_dir);
    Ok(BrowserCloseSessionResult {
        session_id: request.session_id.clone(),
        closed: true,
        audit: vec![audit_event("session.closed", request.session_id)],
    })
}

#[cfg(not(target_os = "macos"))]
pub fn execute_browser_native_webview_show(
    app: &AppHandle,
    request: BrowserNativeWebviewRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    let normalized_url = normalize_browser_url(&request.url)?;
    assert_webview_safe_url(&normalized_url)?;
    let parsed_url = tauri::Url::parse(&normalized_url)
        .map_err(|error| format!("Browser URL could not be parsed: {error}"))?;
    let bounds = normalize_webview_bounds(request.x, request.y, request.width, request.height);

    if let Some(webview) = app.get_webview(NATIVE_BROWSER_WEBVIEW_LABEL) {
        webview
            .set_position(LogicalPosition::new(bounds.0, bounds.1))
            .map_err(|error| format!("Failed to position native Browser webview: {error}"))?;
        webview
            .set_size(LogicalSize::new(bounds.2, bounds.3))
            .map_err(|error| format!("Failed to size native Browser webview: {error}"))?;
        if request.navigate {
            webview
                .navigate(parsed_url)
                .map_err(|error| format!("Failed to navigate native Browser webview: {error}"))?;
        }
        return Ok(BrowserNativeWebviewResult {
            label: NATIVE_BROWSER_WEBVIEW_LABEL.to_string(),
            url: if request.navigate {
                Some(normalized_url)
            } else {
                None
            },
            visible: true,
            status: if request.navigate {
                "navigated"
            } else {
                "shown"
            }
            .to_string(),
        });
    }

    let window = app
        .get_window("main")
        .ok_or_else(|| "Main ResonantOS window was not found.".to_string())?;
    let webview = WebviewBuilder::new(
        NATIVE_BROWSER_WEBVIEW_LABEL,
        WebviewUrl::External(parsed_url),
    )
    .on_navigation(|url| url.scheme() == "http" || url.scheme() == "https");
    window
        .add_child(
            webview,
            LogicalPosition::new(bounds.0, bounds.1),
            LogicalSize::new(bounds.2, bounds.3),
        )
        .map_err(|error| format!("Failed to create native Browser webview: {error}"))?;

    Ok(BrowserNativeWebviewResult {
        label: NATIVE_BROWSER_WEBVIEW_LABEL.to_string(),
        url: Some(normalized_url),
        visible: true,
        status: "created".to_string(),
    })
}

#[cfg(not(target_os = "macos"))]
pub fn execute_browser_native_webview_resize(
    app: &AppHandle,
    request: BrowserNativeWebviewBoundsRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    let bounds = normalize_webview_bounds(request.x, request.y, request.width, request.height);
    let webview = app
        .get_webview(NATIVE_BROWSER_WEBVIEW_LABEL)
        .ok_or_else(|| "Native Browser webview is not running.".to_string())?;
    webview
        .set_position(LogicalPosition::new(bounds.0, bounds.1))
        .map_err(|error| format!("Failed to position native Browser webview: {error}"))?;
    webview
        .set_size(LogicalSize::new(bounds.2, bounds.3))
        .map_err(|error| format!("Failed to size native Browser webview: {error}"))?;
    Ok(BrowserNativeWebviewResult {
        label: NATIVE_BROWSER_WEBVIEW_LABEL.to_string(),
        url: None,
        visible: true,
        status: "resized".to_string(),
    })
}

#[cfg(not(target_os = "macos"))]
pub fn execute_browser_native_webview_hide(
    app: &AppHandle,
) -> Result<BrowserNativeWebviewResult, String> {
    if let Some(webview) = app.get_webview(NATIVE_BROWSER_WEBVIEW_LABEL) {
        webview
            .set_position(LogicalPosition::new(-10000.0, -10000.0))
            .map_err(|error| format!("Failed to hide native Browser webview: {error}"))?;
        webview
            .set_size(LogicalSize::new(1.0, 1.0))
            .map_err(|error| format!("Failed to shrink native Browser webview: {error}"))?;
    }
    Ok(BrowserNativeWebviewResult {
        label: NATIVE_BROWSER_WEBVIEW_LABEL.to_string(),
        url: None,
        visible: false,
        status: "hidden".to_string(),
    })
}

fn normalize_browser_url(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Browser URL cannot be empty.".to_string());
    }
    if trimmed.starts_with("file:") {
        return Err(
            "Browser file URLs require a future explicit filesystem capability.".to_string(),
        );
    }
    if trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("data:")
    {
        return Ok(trimmed.to_string());
    }
    Ok(format!("https://{trimmed}"))
}

#[cfg(not(target_os = "macos"))]
fn assert_webview_safe_url(url: &str) -> Result<(), String> {
    let parsed = tauri::Url::parse(url)
        .map_err(|error| format!("Browser URL could not be parsed: {error}"))?;
    if parsed.scheme() == "http" || parsed.scheme() == "https" {
        Ok(())
    } else {
        Err("Native Browser webview only accepts http and https URLs.".to_string())
    }
}

#[cfg(not(target_os = "macos"))]
fn normalize_webview_bounds(x: f64, y: f64, width: f64, height: f64) -> (f64, f64, f64, f64) {
    (x.max(0.0), y.max(0.0), width.max(1.0), height.max(1.0))
}

fn find_chromium_binary() -> Option<PathBuf> {
    if let Ok(path) = env::var("RESONANTOS_CHROMIUM_PATH") {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    let candidates = [
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
    for candidate in candidates {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Some(path);
        }
    }

    let home = env::var("HOME")
        .map(PathBuf::from)
        .or_else(|_| env::var("USERPROFILE").map(PathBuf::from))
        .ok()?;
    let playwright_cache = home.join("Library").join("Caches").join("ms-playwright");
    find_browser_binary_under(&playwright_cache, 5)
}

fn find_browser_binary_under(root: &Path, max_depth: usize) -> Option<PathBuf> {
    if max_depth == 0 || !root.exists() {
        return None;
    }
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            let name = path
                .file_name()
                .and_then(|item| item.to_str())
                .unwrap_or_default();
            if matches!(
                name,
                "chrome-headless-shell" | "chrome" | "chrome.exe" | "chromium" | "chromium.exe"
            ) {
                return Some(path);
            }
        }
        if path.is_dir() {
            if let Some(found) = find_browser_binary_under(&path, max_depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

fn launch_chromium(
    chromium_path: &Path,
    user_data_dir: &Path,
) -> Result<(BrowserChild, String), String> {
    let mut child = Command::new(chromium_path)
        .arg("--headless=new")
        .arg("--remote-debugging-port=0")
        .arg(format!("--user-data-dir={}", user_data_dir.display()))
        .arg("--disable-gpu")
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("about:blank")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to launch Chromium: {error}"))?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture Chromium startup output.".to_string())?;
    let mut reader = BufReader::new(stderr);
    let started = Instant::now();
    let mut line = String::new();
    while started.elapsed() < Duration::from_secs(12) {
        line.clear();
        let read = reader
            .read_line(&mut line)
            .map_err(|error| format!("Failed to read Chromium startup output: {error}"))?;
        if read == 0 {
            continue;
        }
        if let Some(index) = line.find("ws://") {
            return Ok((BrowserChild { child }, line[index..].trim().to_string()));
        }
    }

    let _ = child.kill();
    Err("Timed out waiting for Chromium DevTools endpoint.".to_string())
}

struct CdpCapture {
    final_url: String,
    title: String,
    screenshot_base64: String,
    audit: Vec<BrowserAuditEvent>,
}

struct CdpPageRead {
    final_url: String,
    title: String,
    text: String,
    links: Vec<BrowserPageLink>,
}

fn with_session<T>(
    session_id: &str,
    operation: impl FnOnce(&BrowserSession) -> Result<T, String>,
) -> Result<T, String> {
    let sessions = browser_sessions()
        .lock()
        .map_err(|_| "Browser session registry is unavailable.".to_string())?;
    let session = sessions
        .get(session_id)
        .ok_or_else(|| format!("Browser session not found: {session_id}"))?;
    operation(session)
}

fn browser_capture_result(
    session_id: String,
    requested_url: String,
    result: CdpCapture,
    status: &str,
    audit: Vec<BrowserAuditEvent>,
) -> BrowserOpenUrlResult {
    BrowserOpenUrlResult {
        session_id,
        requested_url,
        final_url: result.final_url,
        title: result.title,
        status: status.to_string(),
        engine: "chromium-cdp".to_string(),
        screenshot_data_url: format!("data:image/png;base64,{}", result.screenshot_base64),
        audit,
    }
}

fn browser_interaction_result(
    session_id: String,
    result: CdpCapture,
    mut audit: Vec<BrowserAuditEvent>,
) -> BrowserInteractionResult {
    audit.extend(result.audit.clone());
    BrowserInteractionResult {
        session_id,
        final_url: result.final_url,
        title: result.title,
        screenshot_data_url: format!("data:image/png;base64,{}", result.screenshot_base64),
        audit,
    }
}

fn normalize_viewport(width: Option<u32>, height: Option<u32>) -> BrowserViewport {
    BrowserViewport {
        width: width.unwrap_or(1365).clamp(640, 2400),
        height: height.unwrap_or(900).clamp(420, 1800),
    }
}

fn normalize_viewport_or_existing(
    width: Option<u32>,
    height: Option<u32>,
    existing: BrowserViewport,
) -> BrowserViewport {
    if width.is_some() || height.is_some() {
        normalize_viewport(width, height)
    } else {
        existing
    }
}

fn run_cdp_capture(
    browser_ws_url: &str,
    session_id: &str,
    url: &str,
    viewport: BrowserViewport,
) -> Result<CdpCapture, String> {
    let (mut socket, _) = connect(browser_ws_url)
        .map_err(|error| format!("Failed to connect to Chromium DevTools: {error}"))?;
    let mut next_id = 1_u64;
    let mut audit = Vec::new();

    let create_target = cdp_call(
        &mut socket,
        &mut next_id,
        None,
        "Target.createTarget",
        json!({ "url": "about:blank" }),
        Duration::from_secs(8),
    )?;
    let target_id = create_target
        .get("result")
        .and_then(|result| result.get("targetId"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Chromium did not return a target id.".to_string())?;
    audit.push(audit_event("target.created", target_id.to_string()));

    let attach = cdp_call(
        &mut socket,
        &mut next_id,
        None,
        "Target.attachToTarget",
        json!({ "targetId": target_id, "flatten": true }),
        Duration::from_secs(8),
    )?;
    let cdp_session_id = attach
        .get("result")
        .and_then(|result| result.get("sessionId"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Chromium did not return a CDP session id.".to_string())?
        .to_string();
    audit.push(audit_event("target.attached", cdp_session_id.clone()));

    cdp_call(
        &mut socket,
        &mut next_id,
        Some(&cdp_session_id),
        "Page.enable",
        json!({}),
        Duration::from_secs(8),
    )?;
    cdp_call(
        &mut socket,
        &mut next_id,
        Some(&cdp_session_id),
        "Runtime.enable",
        json!({}),
        Duration::from_secs(8),
    )?;
    set_viewport(&mut socket, &mut next_id, &cdp_session_id, viewport)?;
    cdp_call(
        &mut socket,
        &mut next_id,
        Some(&cdp_session_id),
        "Page.navigate",
        json!({ "url": url }),
        Duration::from_secs(8),
    )?;
    wait_for_cdp_event(
        &mut socket,
        Some(&cdp_session_id),
        "Page.loadEventFired",
        Duration::from_secs(18),
    )?;
    audit.push(audit_event("page.loaded", url.to_string()));

    let title_response = cdp_call(
        &mut socket,
        &mut next_id,
        Some(&cdp_session_id),
        "Runtime.evaluate",
        json!({ "expression": "document.title", "returnByValue": true }),
        Duration::from_secs(8),
    )?;
    let title = title_response
        .pointer("/result/result/value")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let url_response = cdp_call(
        &mut socket,
        &mut next_id,
        Some(&cdp_session_id),
        "Runtime.evaluate",
        json!({ "expression": "window.location.href", "returnByValue": true }),
        Duration::from_secs(8),
    )?;
    let final_url = url_response
        .pointer("/result/result/value")
        .and_then(Value::as_str)
        .unwrap_or(url)
        .to_string();

    let screenshot_response = cdp_call(
        &mut socket,
        &mut next_id,
        Some(&cdp_session_id),
        "Page.captureScreenshot",
        json!({ "format": "png", "captureBeyondViewport": false }),
        Duration::from_secs(12),
    )?;
    let screenshot_base64 = screenshot_response
        .get("result")
        .and_then(|result| result.get("data"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Chromium did not return screenshot data.".to_string())?
        .to_string();
    audit.push(audit_event("evidence.screenshot", session_id.to_string()));

    Ok(CdpCapture {
        final_url,
        title,
        screenshot_base64,
        audit,
    })
}

fn create_cdp_target(browser_ws_url: &str) -> Result<String, String> {
    let (mut socket, _) = connect(browser_ws_url)
        .map_err(|error| format!("Failed to connect to Chromium DevTools: {error}"))?;
    let mut next_id = 1_u64;
    let create_target = cdp_call(
        &mut socket,
        &mut next_id,
        None,
        "Target.createTarget",
        json!({ "url": "about:blank" }),
        Duration::from_secs(8),
    )?;
    create_target
        .get("result")
        .and_then(|result| result.get("targetId"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| "Chromium did not return a target id.".to_string())
}

fn attach_to_target(
    socket: &mut CdpSocket,
    next_id: &mut u64,
    target_id: &str,
) -> Result<String, String> {
    let attach = cdp_call(
        socket,
        next_id,
        None,
        "Target.attachToTarget",
        json!({ "targetId": target_id, "flatten": true }),
        Duration::from_secs(8),
    )?;
    attach
        .get("result")
        .and_then(|result| result.get("sessionId"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| "Chromium did not return a CDP session id.".to_string())
}

fn enable_page_runtime(
    socket: &mut CdpSocket,
    next_id: &mut u64,
    cdp_session_id: &str,
) -> Result<(), String> {
    cdp_call(
        socket,
        next_id,
        Some(cdp_session_id),
        "Page.enable",
        json!({}),
        Duration::from_secs(8),
    )?;
    cdp_call(
        socket,
        next_id,
        Some(cdp_session_id),
        "Runtime.enable",
        json!({}),
        Duration::from_secs(8),
    )?;
    Ok(())
}

fn capture_existing_target(
    browser_ws_url: &str,
    target_id: &str,
    session_id: &str,
    url: Option<&str>,
    viewport: BrowserViewport,
) -> Result<CdpCapture, String> {
    let (mut socket, _) = connect(browser_ws_url)
        .map_err(|error| format!("Failed to connect to Chromium DevTools: {error}"))?;
    let mut next_id = 1_u64;
    let mut audit = Vec::new();
    let cdp_session_id = attach_to_target(&mut socket, &mut next_id, target_id)?;
    audit.push(audit_event("target.attached", cdp_session_id.clone()));
    enable_page_runtime(&mut socket, &mut next_id, &cdp_session_id)?;
    set_viewport(&mut socket, &mut next_id, &cdp_session_id, viewport)?;

    if let Some(url) = url {
        cdp_call(
            &mut socket,
            &mut next_id,
            Some(&cdp_session_id),
            "Page.navigate",
            json!({ "url": url }),
            Duration::from_secs(8),
        )?;
        wait_for_cdp_event(
            &mut socket,
            Some(&cdp_session_id),
            "Page.loadEventFired",
            Duration::from_secs(18),
        )?;
        audit.push(audit_event("page.loaded", url.to_string()));
    }

    let title = evaluate_string(&mut socket, &mut next_id, &cdp_session_id, "document.title")?;
    let final_url = evaluate_string(
        &mut socket,
        &mut next_id,
        &cdp_session_id,
        "window.location.href",
    )?;
    let screenshot_response = cdp_call(
        &mut socket,
        &mut next_id,
        Some(&cdp_session_id),
        "Page.captureScreenshot",
        json!({ "format": "png", "captureBeyondViewport": false }),
        Duration::from_secs(12),
    )?;
    let screenshot_base64 = screenshot_response
        .get("result")
        .and_then(|result| result.get("data"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Chromium did not return screenshot data.".to_string())?
        .to_string();
    audit.push(audit_event("evidence.screenshot", session_id.to_string()));

    Ok(CdpCapture {
        final_url,
        title,
        screenshot_base64,
        audit,
    })
}

fn set_viewport(
    socket: &mut CdpSocket,
    next_id: &mut u64,
    cdp_session_id: &str,
    viewport: BrowserViewport,
) -> Result<(), String> {
    cdp_call(
        socket,
        next_id,
        Some(cdp_session_id),
        "Emulation.setDeviceMetricsOverride",
        json!({
            "width": viewport.width,
            "height": viewport.height,
            "deviceScaleFactor": 1,
            "mobile": false,
            "scale": 1,
        }),
        Duration::from_secs(8),
    )?;
    cdp_call(
        socket,
        next_id,
        Some(cdp_session_id),
        "Emulation.setPageScaleFactor",
        json!({ "pageScaleFactor": 1 }),
        Duration::from_secs(8),
    )?;
    Ok(())
}

fn dispatch_mouse_click(
    browser_ws_url: &str,
    target_id: &str,
    x: f64,
    y: f64,
    viewport: BrowserViewport,
) -> Result<(), String> {
    let (mut socket, _) = connect(browser_ws_url)
        .map_err(|error| format!("Failed to connect to Chromium DevTools: {error}"))?;
    let mut next_id = 1_u64;
    let cdp_session_id = attach_to_target(&mut socket, &mut next_id, target_id)?;
    enable_page_runtime(&mut socket, &mut next_id, &cdp_session_id)?;
    set_viewport(&mut socket, &mut next_id, &cdp_session_id, viewport)?;
    for event_type in ["mousePressed", "mouseReleased"] {
        cdp_call(
            &mut socket,
            &mut next_id,
            Some(&cdp_session_id),
            "Input.dispatchMouseEvent",
            json!({
                "type": event_type,
                "x": x,
                "y": y,
                "button": "left",
                "clickCount": 1,
            }),
            Duration::from_secs(8),
        )?;
    }
    std::thread::sleep(Duration::from_millis(350));
    Ok(())
}

fn dispatch_mouse_wheel(
    browser_ws_url: &str,
    target_id: &str,
    delta_x: f64,
    delta_y: f64,
    viewport: BrowserViewport,
) -> Result<(), String> {
    let (mut socket, _) = connect(browser_ws_url)
        .map_err(|error| format!("Failed to connect to Chromium DevTools: {error}"))?;
    let mut next_id = 1_u64;
    let cdp_session_id = attach_to_target(&mut socket, &mut next_id, target_id)?;
    enable_page_runtime(&mut socket, &mut next_id, &cdp_session_id)?;
    set_viewport(&mut socket, &mut next_id, &cdp_session_id, viewport)?;
    cdp_call(
        &mut socket,
        &mut next_id,
        Some(&cdp_session_id),
        "Input.dispatchMouseEvent",
        json!({
            "type": "mouseWheel",
            "x": (viewport.width / 2) as f64,
            "y": (viewport.height / 2) as f64,
            "deltaX": delta_x,
            "deltaY": delta_y,
        }),
        Duration::from_secs(8),
    )?;
    std::thread::sleep(Duration::from_millis(120));
    Ok(())
}

fn read_existing_target(browser_ws_url: &str, target_id: &str) -> Result<CdpPageRead, String> {
    let (mut socket, _) = connect(browser_ws_url)
        .map_err(|error| format!("Failed to connect to Chromium DevTools: {error}"))?;
    let mut next_id = 1_u64;
    let cdp_session_id = attach_to_target(&mut socket, &mut next_id, target_id)?;
    enable_page_runtime(&mut socket, &mut next_id, &cdp_session_id)?;

    let title = evaluate_string(&mut socket, &mut next_id, &cdp_session_id, "document.title")?;
    let final_url = evaluate_string(
        &mut socket,
        &mut next_id,
        &cdp_session_id,
        "window.location.href",
    )?;
    let text = evaluate_string(
        &mut socket,
        &mut next_id,
        &cdp_session_id,
        "document.body ? document.body.innerText : ''",
    )?;
    let links_value = evaluate_json(
        &mut socket,
        &mut next_id,
        &cdp_session_id,
        "Array.from(document.querySelectorAll('a[href]')).slice(0, 40).map(a => ({ text: (a.innerText || a.textContent || '').trim().slice(0, 160), href: a.href }))",
    )?;
    let links = links_value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(BrowserPageLink {
                        text: item.get("text")?.as_str()?.to_string(),
                        href: item.get("href")?.as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(CdpPageRead {
        final_url,
        title,
        text,
        links,
    })
}

fn evaluate_string(
    socket: &mut CdpSocket,
    next_id: &mut u64,
    cdp_session_id: &str,
    expression: &str,
) -> Result<String, String> {
    Ok(evaluate_json(socket, next_id, cdp_session_id, expression)?
        .as_str()
        .unwrap_or("")
        .to_string())
}

fn evaluate_json(
    socket: &mut CdpSocket,
    next_id: &mut u64,
    cdp_session_id: &str,
    expression: &str,
) -> Result<Value, String> {
    let response = cdp_call(
        socket,
        next_id,
        Some(cdp_session_id),
        "Runtime.evaluate",
        json!({ "expression": expression, "returnByValue": true }),
        Duration::from_secs(8),
    )?;
    Ok(response
        .pointer("/result/result/value")
        .cloned()
        .unwrap_or(Value::Null))
}

fn cdp_call(
    socket: &mut CdpSocket,
    next_id: &mut u64,
    session_id: Option<&str>,
    method: &str,
    params: Value,
    timeout: Duration,
) -> Result<Value, String> {
    let id = *next_id;
    *next_id += 1;
    let mut payload = json!({
        "id": id,
        "method": method,
        "params": params,
    });
    if let Some(session_id) = session_id {
        payload["sessionId"] = json!(session_id);
    }
    socket
        .send(Message::Text(payload.to_string()))
        .map_err(|error| format!("Failed to send CDP command {method}: {error}"))?;

    let started = Instant::now();
    while started.elapsed() < timeout {
        let message = socket
            .read()
            .map_err(|error| format!("Failed while waiting for CDP command {method}: {error}"))?;
        let Message::Text(text) = message else {
            continue;
        };
        let event = serde_json::from_str::<Value>(&text)
            .map_err(|error| format!("Failed to decode CDP event: {error}"))?;
        if event.get("id").and_then(Value::as_u64) == Some(id) {
            if let Some(error) = event.get("error") {
                return Err(format!("CDP command {method} failed: {error}"));
            }
            return Ok(event);
        }
    }
    Err(format!("Timed out waiting for CDP command {method}."))
}

fn wait_for_cdp_event(
    socket: &mut CdpSocket,
    session_id: Option<&str>,
    method: &str,
    timeout: Duration,
) -> Result<(), String> {
    let started = Instant::now();
    while started.elapsed() < timeout {
        let message = socket
            .read()
            .map_err(|error| format!("Failed while waiting for CDP event {method}: {error}"))?;
        let Message::Text(text) = message else {
            continue;
        };
        let event = serde_json::from_str::<Value>(&text)
            .map_err(|error| format!("Failed to decode CDP event: {error}"))?;
        let method_matches = event.get("method").and_then(Value::as_str) == Some(method);
        let session_matches = session_id
            .map(|expected| event.get("sessionId").and_then(Value::as_str) == Some(expected))
            .unwrap_or(true);
        if method_matches && session_matches {
            return Ok(());
        }
    }
    Err(format!("Timed out waiting for CDP event {method}."))
}

fn audit_event(action: &str, detail: String) -> BrowserAuditEvent {
    BrowserAuditEvent {
        action: action.to_string(),
        detail,
        timestamp: format!("unix-ms:{}", timestamp_millis()),
    }
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::{find_browser_binary_under, normalize_browser_url};
    use std::fs;

    #[test]
    fn normalizes_plain_hosts_to_https() {
        assert_eq!(
            normalize_browser_url("example.com").unwrap(),
            "https://example.com"
        );
        assert_eq!(
            normalize_browser_url("https://example.com").unwrap(),
            "https://example.com"
        );
        assert!(normalize_browser_url("file:///etc/hosts").is_err());
        assert!(normalize_browser_url("   ").is_err());
    }

    #[test]
    fn discovers_playwright_style_chromium_binary() {
        let root =
            std::env::temp_dir().join(format!("resonantos-browser-test-{}", std::process::id()));
        let browser_dir = root
            .join("chromium_headless_shell-1")
            .join("chrome-headless-shell-mac-arm64");
        fs::create_dir_all(&browser_dir).unwrap();
        let binary = browser_dir.join("chrome-headless-shell");
        fs::write(&binary, "").unwrap();

        assert_eq!(find_browser_binary_under(&root, 5), Some(binary));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    #[ignore = "launches the local Chromium engine; run explicitly when validating Browser add-on execution"]
    fn captures_local_data_url_with_chromium_engine() {
        let chromium = super::find_chromium_binary()
            .expect("Chromium engine should be installed for this validation");
        let root = std::env::temp_dir().join(format!(
            "resonantos-browser-engine-validation-{}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let (mut browser, ws_url) = super::launch_chromium(&chromium, &root).unwrap();
        let capture = super::run_cdp_capture(
            &ws_url,
            "browser-engine-validation",
            "data:text/html,<html><head><title>Resonant Browser Engine</title></head><body>ok</body></html>",
            super::normalize_viewport(Some(900), Some(700)),
        )
        .unwrap();
        let _ = browser.child.kill();
        let _ = fs::remove_dir_all(root);

        assert_eq!(capture.title, "Resonant Browser Engine");
        assert!(capture.screenshot_base64.len() > 100);
    }

    #[test]
    #[ignore = "launches the local Chromium engine and loads the public internet; run explicitly when validating Browser add-on navigation"]
    fn captures_public_example_dot_com_with_chromium_engine() {
        let chromium = super::find_chromium_binary()
            .expect("Chromium engine should be installed for this validation");
        let root = std::env::temp_dir().join(format!(
            "resonantos-browser-public-validation-{}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let (mut browser, ws_url) = super::launch_chromium(&chromium, &root).unwrap();
        let capture = super::run_cdp_capture(
            &ws_url,
            "browser-public-validation",
            "https://example.com",
            super::normalize_viewport(Some(1000), Some(760)),
        )
        .unwrap();
        let _ = browser.child.kill();
        let _ = fs::remove_dir_all(root);

        assert!(capture.final_url.starts_with("https://example.com"));
        assert!(capture.title.contains("Example Domain"));
        assert!(capture.screenshot_base64.len() > 100);
    }

    #[test]
    #[ignore = "launches the local Chromium engine; run explicitly when validating persistent Browser sessions"]
    fn persistent_chromium_target_can_read_and_recapture() {
        let chromium = super::find_chromium_binary()
            .expect("Chromium engine should be installed for this validation");
        let root = std::env::temp_dir().join(format!(
            "resonantos-browser-persistent-validation-{}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let (mut browser, ws_url) = super::launch_chromium(&chromium, &root).unwrap();
        let target_id = super::create_cdp_target(&ws_url).unwrap();
        let capture = super::capture_existing_target(
            &ws_url,
            &target_id,
            "browser-persistent-validation",
            Some("data:text/html,<html><head><title>Persistent Browser</title></head><body><a href='https://example.com'>Example link</a><p>Readable body</p></body></html>"),
            super::normalize_viewport(Some(900), Some(700)),
        )
        .unwrap();
        let readout = super::read_existing_target(&ws_url, &target_id).unwrap();
        let recapture = super::capture_existing_target(
            &ws_url,
            &target_id,
            "browser-persistent-validation",
            None,
            super::normalize_viewport(Some(900), Some(700)),
        )
        .unwrap();
        let _ = browser.child.kill();
        let _ = fs::remove_dir_all(root);

        assert_eq!(capture.title, "Persistent Browser");
        assert_eq!(readout.title, "Persistent Browser");
        assert!(readout.text.contains("Readable body"));
        assert_eq!(readout.links[0].text, "Example link");
        assert!(recapture.screenshot_base64.len() > 100);
    }
}
