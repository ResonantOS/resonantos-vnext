// Intent citation: docs/architecture/ADR-025-native-embedded-browser-host.md

use std::env;
use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::browser_service::{
    BrowserNativeClickRequest, BrowserNativeScrollRequest, BrowserNativeTypeTextRequest,
    BrowserNativeWebviewBoundsRequest, BrowserNativeWebviewRequest, BrowserNativeWebviewResult,
};
use libloading::{Library, Symbol};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserProbeRequest {
    pub engine_candidate: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
#[allow(dead_code)]
pub enum NativeBrowserProbeStatus {
    Ready,
    Partial,
    Blocked,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
#[allow(dead_code)]
pub enum NativeBrowserCapabilityStatus {
    Ready,
    PresentUnverified,
    Missing,
    Blocked,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserProbeResult {
    pub status: NativeBrowserProbeStatus,
    pub engine_candidate: String,
    pub host_binary_status: NativeBrowserCapabilityStatus,
    pub source_scaffold_status: NativeBrowserCapabilityStatus,
    pub embedded_view_status: NativeBrowserCapabilityStatus,
    pub extension_compatibility_status: NativeBrowserCapabilityStatus,
    pub phantom_status: NativeBrowserCapabilityStatus,
    pub bitwarden_status: NativeBrowserCapabilityStatus,
    pub blockers: Vec<String>,
    pub next_actions: Vec<String>,
    pub checked_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserAttachSmokeRequest {
    pub host_integration_mode: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
#[allow(dead_code)]
pub enum NativeBrowserAttachSmokeStatus {
    Attached,
    Blocked,
    Unsupported,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserAttachSmokeResult {
    pub status: NativeBrowserAttachSmokeStatus,
    pub platform: String,
    pub parent_handle_kind: String,
    pub parent_handle_present: bool,
    pub host_integration_mode: String,
    pub blocker: Option<String>,
    pub next_actions: Vec<String>,
    pub checked_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserBridgeProbeRequest {
    pub integration_mode: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
#[allow(dead_code)]
pub enum NativeBrowserBridgeProbeStatus {
    Ready,
    Partial,
    Missing,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBrowserBridgeProbeResult {
    pub status: NativeBrowserBridgeProbeStatus,
    pub integration_mode: String,
    pub bridge_library_status: NativeBrowserCapabilityStatus,
    pub c_abi_status: NativeBrowserCapabilityStatus,
    pub bridge_library_path: Option<String>,
    pub exported_symbols: Vec<String>,
    pub blockers: Vec<String>,
    pub next_actions: Vec<String>,
    pub checked_at: String,
}

const NATIVE_BROWSER_LABEL: &str = "resonant-browser-native";

struct NativeBrowserBridgeLibrary {
    library: Library,
}

static NATIVE_BROWSER_BRIDGE: OnceLock<Mutex<Option<NativeBrowserBridgeLibrary>>> = OnceLock::new();
static PACKAGED_NATIVE_HOST_APP: OnceLock<Result<PathBuf, String>> = OnceLock::new();

pub fn query_native_browser_probe(request: NativeBrowserProbeRequest) -> NativeBrowserProbeResult {
    let engine_candidate = request
        .engine_candidate
        .unwrap_or_else(|| "cef-chrome-runtime".to_string());
    let host_path = env::var("RESONANTOS_NATIVE_BROWSER_HOST")
        .ok()
        .or_else(|| env::var("RESONANTOS_CEF_ROOT").ok())
        .or_else(|| {
            if env::var("RESONANTOS_DISABLE_NATIVE_BROWSER_BINARY_DISCOVERY").is_ok() {
                return None;
            }
            native_host_binary_candidates()
                .into_iter()
                .find(|path| path.exists())
                .map(|path| path.to_string_lossy().to_string())
        });
    let host_present = host_path
        .as_deref()
        .map(Path::new)
        .map(Path::exists)
        .unwrap_or(false);
    let source_scaffold_present = native_host_source_candidates()
        .iter()
        .any(|path| path.exists());
    let embedded_bridge_present = native_bridge_library_candidates().into_iter().any(|path| {
        path.exists()
            && path
                .extension()
                .map(|extension| extension == "dylib" || extension == "so")
                .unwrap_or(false)
    });

    let mut blockers = Vec::new();
    if !host_present {
        blockers
            .push("No product native Browser host is registered with ResonantOS yet.".to_string());
    }
    if !embedded_bridge_present {
        blockers.push(
            "Embedded CEF/Chromium view attachment has not passed a host-side smoke test."
                .to_string(),
        );
    }
    let phantom_extension_present = local_phantom_extension_dir().is_some();
    if !phantom_extension_present {
        blockers.push(
            "Local Phantom Wallet extension source was not found in the reviewed Chrome profile path."
                .to_string(),
        );
    }
    blockers.push(
        "Bitwarden extension compatibility has not been proven in the embedded host.".to_string(),
    );

    if let Some(path) = host_path.as_deref() {
        if host_present {
            blockers.retain(|blocker| !blocker.contains("No product native Browser host"));
        } else {
            blockers.push(format!(
                "Configured native Browser host path does not exist: {path}"
            ));
        }
    }

    NativeBrowserProbeResult {
        status: if host_present {
            NativeBrowserProbeStatus::Partial
        } else {
            NativeBrowserProbeStatus::Blocked
        },
        engine_candidate,
        host_binary_status: if host_present {
            NativeBrowserCapabilityStatus::PresentUnverified
        } else {
            NativeBrowserCapabilityStatus::Missing
        },
        source_scaffold_status: if source_scaffold_present {
            NativeBrowserCapabilityStatus::Ready
        } else {
            NativeBrowserCapabilityStatus::Missing
        },
        embedded_view_status: if embedded_bridge_present {
            NativeBrowserCapabilityStatus::Ready
        } else {
            NativeBrowserCapabilityStatus::Blocked
        },
        extension_compatibility_status: if embedded_bridge_present && phantom_extension_present {
            NativeBrowserCapabilityStatus::PresentUnverified
        } else {
            NativeBrowserCapabilityStatus::Blocked
        },
        phantom_status: if embedded_bridge_present && phantom_extension_present {
            NativeBrowserCapabilityStatus::Ready
        } else if phantom_extension_present {
            NativeBrowserCapabilityStatus::PresentUnverified
        } else {
            NativeBrowserCapabilityStatus::Missing
        },
        bitwarden_status: NativeBrowserCapabilityStatus::Blocked,
        blockers,
        next_actions: vec![
            "Build the native Browser host binary behind the ADR-025 IPC contract.".to_string(),
            if embedded_bridge_present {
                "Wire the verified native CEF bridge into the packaged ResonantOS app bundle lifecycle.".to_string()
            } else {
                "Attach the native view to the ResonantOS center workspace and verify it receives user input.".to_string()
            },
            if phantom_extension_present {
                "Use the embedded Phantom popup or DAO connect flow to complete wallet profile setup under human approval.".to_string()
            } else {
                "Install Phantom in the local Chrome profile or set RESONANTOS_PHANTOM_EXTENSION_DIR to the reviewed unpacked extension folder.".to_string()
            },
        ],
        checked_at: format!("unix-ms:{}", timestamp_millis()),
    }
}

pub fn query_native_browser_bridge_probe(
    request: NativeBrowserBridgeProbeRequest,
) -> NativeBrowserBridgeProbeResult {
    let integration_mode = request
        .integration_mode
        .unwrap_or_else(|| "in-process-native-library".to_string());
    let bridge_path = env::var("RESONANTOS_NATIVE_BROWSER_BRIDGE")
        .ok()
        .map(PathBuf::from)
        .or_else(|| {
            if env::var("RESONANTOS_DISABLE_NATIVE_BROWSER_BRIDGE_DISCOVERY").is_ok() {
                return None;
            }
            native_bridge_library_candidates()
                .into_iter()
                .find(|path| path.exists())
        });
    let bridge_present = bridge_path.as_deref().map(Path::is_file).unwrap_or(false);
    let exported_symbols = bridge_path
        .as_deref()
        .filter(|path| path.is_file())
        .map(read_bridge_symbols)
        .transpose()
        .map(|symbols| symbols.unwrap_or_default())
        .unwrap_or_else(|error| vec![format!("symbol-read-error:{error}")]);
    let abi_ready = required_bridge_symbols().iter().all(|required| {
        exported_symbols
            .iter()
            .any(|symbol| symbol.contains(*required))
    });

    build_bridge_probe_result(
        integration_mode,
        bridge_path,
        bridge_present,
        exported_symbols,
        abi_ready,
    )
}

pub fn prepare_native_browser_application_if_available() -> Option<String> {
    let bridge = load_native_browser_bridge().ok()?;
    let json = bridge.as_ref()?.call_prepare().ok()?;
    Some(json)
}

pub fn execute_native_browser_embedded_show(
    parent_ns_view: *mut c_void,
    request: BrowserNativeWebviewRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    let bridge = load_native_browser_bridge()?;
    let bridge = bridge
        .as_ref()
        .ok_or_else(|| "Native Browser bridge failed to stay loaded.".to_string())?;
    let normalized_url = normalize_native_browser_url(&request.url)?;
    let initialize = bridge.call_initialize(
        &native_framework_dir_path()?,
        &native_helper_executable_path()?,
        &native_cache_dir_path()?,
    )?;
    if !json_status_is_ready(&initialize) {
        return Err(format!(
            "Native Chromium initialization failed: {initialize}"
        ));
    }

    let attach = bridge.call_attach(
        parent_ns_view,
        request.x.round() as c_int,
        request.y.round() as c_int,
        request.width.round().max(1.0) as c_int,
        request.height.round().max(1.0) as c_int,
        &normalized_url,
    )?;
    if !json_status_is_allowed_progress(&attach) {
        return Err(format!("Native Chromium attach failed: {attach}"));
    }

    Ok(BrowserNativeWebviewResult {
        label: NATIVE_BROWSER_LABEL.to_string(),
        url: Some(normalized_url),
        visible: true,
        status: format!("native-cef:{attach}"),
    })
}

pub fn execute_native_browser_embedded_resize(
    request: BrowserNativeWebviewBoundsRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    let bridge = load_native_browser_bridge()?;
    let bridge = bridge
        .as_ref()
        .ok_or_else(|| "Native Browser bridge failed to stay loaded.".to_string())?;
    let result = bridge.call_resize(
        request.x.round() as c_int,
        request.y.round() as c_int,
        request.width.round().max(1.0) as c_int,
        request.height.round().max(1.0) as c_int,
    )?;
    if !json_status_is_allowed_progress(&result) {
        return Err(format!("Native Chromium resize failed: {result}"));
    }

    Ok(BrowserNativeWebviewResult {
        label: NATIVE_BROWSER_LABEL.to_string(),
        url: None,
        visible: true,
        status: format!("native-cef:{result}"),
    })
}

pub fn execute_native_browser_embedded_hide() -> Result<BrowserNativeWebviewResult, String> {
    let bridge = load_native_browser_bridge()?;
    let bridge = bridge
        .as_ref()
        .ok_or_else(|| "Native Browser bridge failed to stay loaded.".to_string())?;
    let result = bridge.call_close()?;
    Ok(BrowserNativeWebviewResult {
        label: NATIVE_BROWSER_LABEL.to_string(),
        url: None,
        visible: false,
        status: format!("native-cef:{result}"),
    })
}

pub fn execute_native_browser_embedded_click(
    request: BrowserNativeClickRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    let bridge = load_native_browser_bridge()?;
    let bridge = bridge
        .as_ref()
        .ok_or_else(|| "Native Browser bridge failed to stay loaded.".to_string())?;
    let result = bridge.call_click(
        request.x.round().max(0.0) as c_int,
        request.y.round().max(0.0) as c_int,
    )?;
    if !json_status_is_allowed_progress(&result) {
        return Err(format!("Native Chromium click failed: {result}"));
    }
    Ok(BrowserNativeWebviewResult {
        label: NATIVE_BROWSER_LABEL.to_string(),
        url: None,
        visible: true,
        status: format!("native-cef:{result}"),
    })
}

pub fn execute_native_browser_embedded_scroll(
    request: BrowserNativeScrollRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    let bridge = load_native_browser_bridge()?;
    let bridge = bridge
        .as_ref()
        .ok_or_else(|| "Native Browser bridge failed to stay loaded.".to_string())?;
    let result = bridge.call_scroll(
        request.x.round().max(0.0) as c_int,
        request.y.round().max(0.0) as c_int,
        request.delta_x.round() as c_int,
        request.delta_y.round() as c_int,
    )?;
    if !json_status_is_allowed_progress(&result) {
        return Err(format!("Native Chromium scroll failed: {result}"));
    }
    Ok(BrowserNativeWebviewResult {
        label: NATIVE_BROWSER_LABEL.to_string(),
        url: None,
        visible: true,
        status: format!("native-cef:{result}"),
    })
}

pub fn execute_native_browser_embedded_type_text(
    request: BrowserNativeTypeTextRequest,
) -> Result<BrowserNativeWebviewResult, String> {
    let bridge = load_native_browser_bridge()?;
    let bridge = bridge
        .as_ref()
        .ok_or_else(|| "Native Browser bridge failed to stay loaded.".to_string())?;
    let result = bridge.call_type_text(&request.text)?;
    if !json_status_is_allowed_progress(&result) {
        return Err(format!("Native Chromium type failed: {result}"));
    }
    Ok(BrowserNativeWebviewResult {
        label: NATIVE_BROWSER_LABEL.to_string(),
        url: None,
        visible: true,
        status: format!("native-cef:{result}"),
    })
}

fn build_bridge_probe_result(
    integration_mode: String,
    bridge_path: Option<PathBuf>,
    bridge_present: bool,
    exported_symbols: Vec<String>,
    abi_ready: bool,
) -> NativeBrowserBridgeProbeResult {
    let mut blockers = Vec::new();
    if !bridge_present {
        blockers.push("In-process native Browser bridge library was not found.".to_string());
    }
    if bridge_present && !abi_ready {
        blockers.push(
            "Native Browser bridge library does not export the required C ABI symbols.".to_string(),
        );
    }

    NativeBrowserBridgeProbeResult {
        status: if bridge_present && abi_ready {
            NativeBrowserBridgeProbeStatus::Ready
        } else if bridge_present {
            NativeBrowserBridgeProbeStatus::Partial
        } else {
            NativeBrowserBridgeProbeStatus::Missing
        },
        integration_mode,
        bridge_library_status: if bridge_present {
            NativeBrowserCapabilityStatus::Ready
        } else {
            NativeBrowserCapabilityStatus::Missing
        },
        c_abi_status: if abi_ready {
            NativeBrowserCapabilityStatus::Ready
        } else {
            NativeBrowserCapabilityStatus::Blocked
        },
        bridge_library_path: bridge_path.map(|path| path.to_string_lossy().to_string()),
        exported_symbols,
        blockers,
        next_actions: vec![
            "Load or link the in-process bridge from the Rust/Tauri host boundary.".to_string(),
            "Wire CEF start, attach, resize, navigation, and extension lifecycle behind the bridge ABI.".to_string(),
            "Keep Browser marked not-ready until embedded rendering and Phantom/Bitwarden smoke tests pass.".to_string(),
        ],
        checked_at: format!("unix-ms:{}", timestamp_millis()),
    }
}

pub fn query_native_browser_attach_smoke(
    request: NativeBrowserAttachSmokeRequest,
    platform: &str,
    parent_handle_kind: &str,
    parent_handle_present: bool,
) -> NativeBrowserAttachSmokeResult {
    let host_integration_mode = request
        .host_integration_mode
        .unwrap_or_else(|| "external-process".to_string());
    let external_process = host_integration_mode == "external-process";
    let macos_ns_view = platform == "macos" && parent_handle_kind == "macos-ns-view";
    let blocker = if !parent_handle_present {
        Some(format!(
            "No {parent_handle_kind} parent handle was available for native Browser attachment."
        ))
    } else if external_process && macos_ns_view {
        Some(
            "External CEF executables cannot safely attach to a process-local macOS NSView. Product Browser embedding requires in-process CEF/native library integration owned by the Tauri process."
                .to_string(),
        )
    } else if external_process {
        Some(
            "External-process native Browser attachment is not accepted for product readiness. The Browser add-on must prove an in-process or platform-native embedding boundary before it can replace the current webview placeholder."
                .to_string(),
        )
    } else {
        None
    };

    NativeBrowserAttachSmokeResult {
        status: if blocker.is_some() {
            NativeBrowserAttachSmokeStatus::Blocked
        } else {
            NativeBrowserAttachSmokeStatus::Attached
        },
        platform: platform.to_string(),
        parent_handle_kind: parent_handle_kind.to_string(),
        parent_handle_present,
        host_integration_mode,
        blocker,
        next_actions: vec![
            "Move the CEF host from an external executable into an in-process Rust-owned native integration.".to_string(),
            "Expose attach, resize, detach, navigation, and extension lifecycle through narrow IPC commands.".to_string(),
            "Run Phantom Wallet and Bitwarden compatibility smoke tests before marking Browser ready.".to_string(),
        ],
        checked_at: format!("unix-ms:{}", timestamp_millis()),
    }
}

fn native_host_source_candidates() -> Vec<PathBuf> {
    let relative = PathBuf::from("addons/resonant-browser-native/native_host/CMakeLists.txt");
    let mut candidates = Vec::new();
    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join(&relative));
        if let Some(parent) = current_dir.parent() {
            candidates.push(parent.join(&relative));
        }
    }
    candidates
}

fn native_host_binary_candidates() -> Vec<PathBuf> {
    let relative = PathBuf::from(
        "addons/resonant-browser-native/build/ResonantBrowserNativeHost.app/Contents/MacOS/ResonantBrowserNativeHost",
    );
    let mut candidates = relative_path_candidates(&relative);
    candidates.extend(
        native_host_app_candidates()
            .into_iter()
            .map(|app| app.join("Contents/MacOS/ResonantBrowserNativeHost")),
    );
    candidates
}

fn native_bridge_library_candidates() -> Vec<PathBuf> {
    let relative = if cfg!(target_os = "macos") {
        PathBuf::from(
            "addons/resonant-browser-native/build/libResonantBrowserNativeBridgeShared.dylib",
        )
    } else {
        PathBuf::from(
            "addons/resonant-browser-native/build/libResonantBrowserNativeBridgeShared.so",
        )
    };
    let static_relative =
        PathBuf::from("addons/resonant-browser-native/build/libResonantBrowserNativeBridge.a");
    let mut candidates = relative_path_candidates(&relative);
    candidates.extend(staged_resource_path_candidates(
        "libResonantBrowserNativeBridgeShared.dylib",
    ));
    candidates.extend(relative_path_candidates(&static_relative));
    candidates
}

fn local_phantom_extension_dir() -> Option<PathBuf> {
    env::var("RESONANTOS_PHANTOM_EXTENSION_DIR")
        .ok()
        .map(PathBuf::from)
        .filter(|path| path.join("manifest.json").is_file())
        .or_else(|| {
            let home = env::var("HOME").ok()?;
            let root = PathBuf::from(home)
                .join("Library/Application Support/Google/Chrome/Default/Extensions")
                .join("bfnaelmomeimhlpmgjnjophhpkkoljpa");
            fs::read_dir(root)
                .ok()?
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .filter(|path| path.join("manifest.json").is_file())
                .max_by(|left, right| {
                    left.file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or_default()
                        .cmp(
                            right
                                .file_name()
                                .and_then(|name| name.to_str())
                                .unwrap_or_default(),
                        )
                })
        })
}

fn required_bridge_symbols() -> [&'static str; 13] {
    [
        "resonant_browser_native_contract_json",
        "resonant_browser_native_in_process_status_json",
        "resonant_browser_native_prepare_macos_application_json",
        "resonant_browser_native_initialize_json",
        "resonant_browser_native_attach_macos_ns_view_json",
        "resonant_browser_native_resize_json",
        "resonant_browser_native_navigate_json",
        "resonant_browser_native_click_json",
        "resonant_browser_native_scroll_json",
        "resonant_browser_native_type_text_json",
        "resonant_browser_native_probe_phantom_json",
        "resonant_browser_native_close_json",
        "resonant_browser_native_status_json",
    ]
}

fn read_bridge_symbols(path: &Path) -> Result<Vec<String>, String> {
    let output = Command::new("nm")
        .arg("-g")
        .arg(path)
        .output()
        .map_err(|error| format!("Failed to run nm for native Browser bridge: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "nm failed for native Browser bridge: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect())
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

impl NativeBrowserBridgeLibrary {
    fn call_prepare(&self) -> Result<String, String> {
        unsafe {
            let prepare: Symbol<unsafe extern "C" fn() -> *const c_char> = self
                .library
                .get(b"resonant_browser_native_prepare_macos_application_json")
                .map_err(|error| format!("Native Browser prepare symbol missing: {error}"))?;
            c_string_result(prepare())
        }
    }

    fn call_initialize(
        &self,
        framework_dir_path: &Path,
        helper_executable_path: &Path,
        cache_dir_path: &Path,
    ) -> Result<String, String> {
        let framework = path_to_cstring(framework_dir_path)?;
        let helper = path_to_cstring(helper_executable_path)?;
        let cache = path_to_cstring(cache_dir_path)?;
        unsafe {
            let initialize: Symbol<
                unsafe extern "C" fn(*const c_char, *const c_char, *const c_char) -> *const c_char,
            > = self
                .library
                .get(b"resonant_browser_native_initialize_json")
                .map_err(|error| format!("Native Browser initialize symbol missing: {error}"))?;
            c_string_result(initialize(
                framework.as_ptr(),
                helper.as_ptr(),
                cache.as_ptr(),
            ))
        }
    }

    fn call_attach(
        &self,
        parent_ns_view: *mut c_void,
        x: c_int,
        y: c_int,
        width: c_int,
        height: c_int,
        url: &str,
    ) -> Result<String, String> {
        let url = CString::new(url)
            .map_err(|_| "Native Browser URL cannot contain NUL bytes.".to_string())?;
        unsafe {
            let attach: Symbol<
                unsafe extern "C" fn(
                    *mut c_void,
                    c_int,
                    c_int,
                    c_int,
                    c_int,
                    *const c_char,
                ) -> *const c_char,
            > = self
                .library
                .get(b"resonant_browser_native_attach_macos_ns_view_json")
                .map_err(|error| format!("Native Browser attach symbol missing: {error}"))?;
            c_string_result(attach(parent_ns_view, x, y, width, height, url.as_ptr()))
        }
    }

    fn call_resize(
        &self,
        x: c_int,
        y: c_int,
        width: c_int,
        height: c_int,
    ) -> Result<String, String> {
        unsafe {
            let resize: Symbol<unsafe extern "C" fn(c_int, c_int, c_int, c_int) -> *const c_char> =
                self.library
                    .get(b"resonant_browser_native_resize_json")
                    .map_err(|error| format!("Native Browser resize symbol missing: {error}"))?;
            c_string_result(resize(x, y, width, height))
        }
    }

    fn call_close(&self) -> Result<String, String> {
        unsafe {
            let close: Symbol<unsafe extern "C" fn() -> *const c_char> = self
                .library
                .get(b"resonant_browser_native_close_json")
                .map_err(|error| format!("Native Browser close symbol missing: {error}"))?;
            c_string_result(close())
        }
    }

    fn call_click(&self, x: c_int, y: c_int) -> Result<String, String> {
        unsafe {
            let click: Symbol<unsafe extern "C" fn(c_int, c_int) -> *const c_char> = self
                .library
                .get(b"resonant_browser_native_click_json")
                .map_err(|error| format!("Native Browser click symbol missing: {error}"))?;
            c_string_result(click(x, y))
        }
    }

    fn call_scroll(
        &self,
        x: c_int,
        y: c_int,
        delta_x: c_int,
        delta_y: c_int,
    ) -> Result<String, String> {
        unsafe {
            let scroll: Symbol<unsafe extern "C" fn(c_int, c_int, c_int, c_int) -> *const c_char> =
                self.library
                    .get(b"resonant_browser_native_scroll_json")
                    .map_err(|error| format!("Native Browser scroll symbol missing: {error}"))?;
            c_string_result(scroll(x, y, delta_x, delta_y))
        }
    }

    fn call_type_text(&self, text: &str) -> Result<String, String> {
        let text = CString::new(text)
            .map_err(|_| "Native Browser text cannot contain NUL bytes.".to_string())?;
        unsafe {
            let type_text: Symbol<unsafe extern "C" fn(*const c_char) -> *const c_char> = self
                .library
                .get(b"resonant_browser_native_type_text_json")
                .map_err(|error| format!("Native Browser type symbol missing: {error}"))?;
            c_string_result(type_text(text.as_ptr()))
        }
    }
}

fn load_native_browser_bridge(
) -> Result<std::sync::MutexGuard<'static, Option<NativeBrowserBridgeLibrary>>, String> {
    let lock = NATIVE_BROWSER_BRIDGE.get_or_init(|| Mutex::new(None));
    let mut guard = lock
        .lock()
        .map_err(|_| "Native Browser bridge lock is poisoned.".to_string())?;
    if guard.is_none() {
        let path = native_bridge_library_candidates()
            .into_iter()
            .find(|path| path.extension().map(|ext| ext == "dylib" || ext == "so").unwrap_or(false) && path.exists())
            .ok_or_else(|| "Native Browser shared bridge library was not found. Build ResonantBrowserNativeBridgeShared first.".to_string())?;
        let library = unsafe { Library::new(&path) }.map_err(|error| {
            format!(
                "Failed to load native Browser bridge {}: {error}",
                path.display()
            )
        })?;
        *guard = Some(NativeBrowserBridgeLibrary { library });
    }
    Ok(guard)
}

fn c_string_result(pointer: *const c_char) -> Result<String, String> {
    if pointer.is_null() {
        return Err("Native Browser bridge returned a null JSON pointer.".to_string());
    }
    unsafe { CStr::from_ptr(pointer) }
        .to_str()
        .map(str::to_string)
        .map_err(|error| format!("Native Browser bridge returned invalid UTF-8: {error}"))
}

fn path_to_cstring(path: &Path) -> Result<CString, String> {
    CString::new(path.to_string_lossy().as_bytes())
        .map_err(|_| format!("Path contains NUL bytes: {}", path.display()))
}

fn native_framework_dir_path() -> Result<PathBuf, String> {
    native_host_app_candidates()
        .into_iter()
        .map(|app| app.join("Contents/Frameworks/Chromium Embedded Framework.framework"))
        .find(|path| path.exists())
        .ok_or_else(|| {
            "Native Browser CEF framework was not found in the built or packaged host app."
                .to_string()
        })
}

fn native_helper_executable_path() -> Result<PathBuf, String> {
    native_host_app_candidates()
        .into_iter()
        .map(|app| {
            app.join(
                "Contents/Frameworks/ResonantBrowserNativeHost Helper.app/Contents/MacOS/ResonantBrowserNativeHost Helper",
            )
        })
        .find(|path| path.exists())
        .ok_or_else(|| "Native Browser CEF helper executable was not found in the built or packaged host app.".to_string())
}

fn native_cache_dir_path() -> Result<PathBuf, String> {
    let path = env::temp_dir().join("resonantos-native-browser-in-process-cache");
    std::fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create native Browser cache dir: {error}"))?;
    Ok(path)
}

fn native_host_app_candidates() -> Vec<PathBuf> {
    let relative =
        PathBuf::from("addons/resonant-browser-native/build/ResonantBrowserNativeHost.app");
    let mut candidates = relative_path_candidates(&relative);
    if let Some(packaged) = packaged_native_host_app_path() {
        candidates.push(packaged);
    }
    candidates
}

fn packaged_native_host_app_path() -> Option<PathBuf> {
    PACKAGED_NATIVE_HOST_APP
        .get_or_init(unpack_packaged_native_host_app)
        .as_ref()
        .ok()
        .cloned()
}

fn unpack_packaged_native_host_app() -> Result<PathBuf, String> {
    let zip_path = staged_resource_path_candidates("ResonantBrowserNativeHost.app.zip")
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "Packaged native Browser host zip was not found.".to_string())?;
    let unpack_root = env::temp_dir().join("resonantos-native-browser-host");
    let host_app = unpack_root.join("ResonantBrowserNativeHost.app");
    let host_binary = host_app.join("Contents/MacOS/ResonantBrowserNativeHost");
    if host_binary.exists() {
        return Ok(host_app);
    }
    fs::create_dir_all(&unpack_root)
        .map_err(|error| format!("Failed to create native Browser unpack dir: {error}"))?;
    let status = Command::new("/usr/bin/ditto")
        .args(["-x", "-k"])
        .arg(&zip_path)
        .arg(&unpack_root)
        .status()
        .map_err(|error| format!("Failed to launch native Browser unpack tool: {error}"))?;
    if !status.success() {
        return Err(format!(
            "Native Browser host unpack failed from {} with status {status}",
            zip_path.display()
        ));
    }
    if !host_binary.exists() {
        return Err(format!(
            "Native Browser host unpack completed but binary is missing at {}",
            host_binary.display()
        ));
    }
    Ok(host_app)
}

fn staged_resource_path_candidates(file_name: &str) -> Vec<PathBuf> {
    let staged = PathBuf::from("build/native-browser").join(file_name);
    let packaged = PathBuf::from("native-browser").join(file_name);
    let mut candidates = relative_path_candidates(&staged);
    candidates.extend(relative_path_candidates(&packaged));
    candidates
}

fn relative_path_candidates(relative: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join(relative));
        if let Some(parent) = current_dir.parent() {
            candidates.push(parent.join(relative));
        }
    }
    if let Ok(current_exe) = env::current_exe() {
        if let Some(mac_os_dir) = current_exe.parent() {
            if let Some(contents_dir) = mac_os_dir.parent() {
                let resources_dir = contents_dir.join("Resources");
                candidates.push(resources_dir.join(relative));
                candidates.push(resources_dir.join("_up_").join(relative));
            }
        }
    }
    candidates
}

fn normalize_native_browser_url(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok("https://resonantos.com".to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Ok(trimmed.to_string());
    }
    if trimmed == "chrome-extension://bfnaelmomeimhlpmgjnjophhpkkoljpa/popup.html" {
        return Ok(trimmed.to_string());
    }
    if trimmed.contains("://") {
        return Err(
            "Native Browser only accepts http, https, and the reviewed Phantom popup URL in this version."
                .to_string(),
        );
    }
    Ok(format!("https://{trimmed}"))
}

fn json_status_is_ready(json: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(json)
        .ok()
        .and_then(|value| {
            value
                .get("status")
                .and_then(|status| status.as_str())
                .map(str::to_string)
        })
        .map(|status| status == "ready")
        .unwrap_or(false)
}

fn json_status_is_allowed_progress(json: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(json)
        .ok()
        .and_then(|value| {
            value
                .get("status")
                .and_then(|status| status.as_str())
                .map(str::to_string)
        })
        .map(|status| {
            matches!(
                status.as_str(),
                "ready"
                    | "attaching"
                    | "attached"
                    | "loaded"
                    | "resized"
                    | "navigating"
                    | "closing"
                    | "closed"
            )
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::{
        build_bridge_probe_result, query_native_browser_attach_smoke,
        query_native_browser_bridge_probe, query_native_browser_probe,
        NativeBrowserAttachSmokeRequest, NativeBrowserAttachSmokeStatus,
        NativeBrowserBridgeProbeRequest, NativeBrowserBridgeProbeStatus, NativeBrowserProbeRequest,
        NativeBrowserProbeStatus,
    };

    #[test]
    fn blocks_product_readiness_without_native_host() {
        std::env::remove_var("RESONANTOS_NATIVE_BROWSER_HOST");
        std::env::remove_var("RESONANTOS_CEF_ROOT");
        std::env::set_var("RESONANTOS_DISABLE_NATIVE_BROWSER_BINARY_DISCOVERY", "1");

        let result = query_native_browser_probe(NativeBrowserProbeRequest {
            engine_candidate: None,
        });

        assert_eq!(result.status, NativeBrowserProbeStatus::Blocked);
        assert_eq!(result.engine_candidate, "cef-chrome-runtime");
        assert!(result
            .blockers
            .iter()
            .any(|blocker| blocker.contains("No product native Browser host")));
        assert!(result
            .blockers
            .iter()
            .any(|blocker| blocker.contains("Bitwarden extension compatibility")));
        std::env::remove_var("RESONANTOS_DISABLE_NATIVE_BROWSER_BINARY_DISCOVERY");
    }

    #[test]
    fn reports_partial_when_native_host_binary_exists() {
        let binary = std::env::temp_dir().join("resonantos-native-browser-host-test");
        std::fs::write(&binary, b"host").unwrap();
        std::env::set_var(
            "RESONANTOS_NATIVE_BROWSER_HOST",
            binary.to_string_lossy().to_string(),
        );

        let result = query_native_browser_probe(NativeBrowserProbeRequest {
            engine_candidate: None,
        });

        assert_eq!(result.status, NativeBrowserProbeStatus::Partial);
        assert!(result
            .blockers
            .iter()
            .all(|blocker| !blocker.contains("No product native Browser host")));

        std::env::remove_var("RESONANTOS_NATIVE_BROWSER_HOST");
        let _ = std::fs::remove_file(binary);
    }

    #[test]
    fn blocks_external_process_attachment_to_macos_ns_view() {
        let result = query_native_browser_attach_smoke(
            NativeBrowserAttachSmokeRequest {
                host_integration_mode: Some("external-process".to_string()),
            },
            "macos",
            "macos-ns-view",
            true,
        );

        assert_eq!(result.status, NativeBrowserAttachSmokeStatus::Blocked);
        assert_eq!(result.parent_handle_kind, "macos-ns-view");
        assert!(result.parent_handle_present);
        assert!(result
            .blocker
            .as_deref()
            .unwrap_or_default()
            .contains("External CEF executables cannot safely attach"));
        assert!(result
            .next_actions
            .iter()
            .any(|action| action.contains("in-process Rust-owned")));
    }

    #[test]
    fn bridge_probe_reports_ready_when_library_and_abi_are_present() {
        let result = build_bridge_probe_result(
            "in-process-native-library".to_string(),
            Some(std::path::PathBuf::from(
                "/tmp/libResonantBrowserNativeBridge.a",
            )),
            true,
            vec![
                "_resonant_browser_native_contract_json".to_string(),
                "_resonant_browser_native_in_process_status_json".to_string(),
            ],
            true,
        );

        assert_eq!(result.status, NativeBrowserBridgeProbeStatus::Ready);
        assert_eq!(
            result.bridge_library_status,
            super::NativeBrowserCapabilityStatus::Ready
        );
        assert_eq!(
            result.c_abi_status,
            super::NativeBrowserCapabilityStatus::Ready
        );
        assert!(result.blockers.is_empty());
    }

    #[test]
    fn bridge_probe_blocks_when_library_discovery_is_disabled() {
        std::env::set_var("RESONANTOS_DISABLE_NATIVE_BROWSER_BRIDGE_DISCOVERY", "1");
        std::env::remove_var("RESONANTOS_NATIVE_BROWSER_BRIDGE");

        let result = query_native_browser_bridge_probe(NativeBrowserBridgeProbeRequest {
            integration_mode: None,
        });

        assert_eq!(result.status, NativeBrowserBridgeProbeStatus::Missing);
        assert!(result
            .blockers
            .iter()
            .any(|blocker| blocker.contains("bridge library was not found")));

        std::env::remove_var("RESONANTOS_DISABLE_NATIVE_BROWSER_BRIDGE_DISCOVERY");
    }
}
