use std::env;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use crate::marionette_bridge::MarionetteClient;
use tracing::{debug, error, info, warn};

// ---------------------------------------------------------------------------
// Global singleton
// ---------------------------------------------------------------------------

static CAMOFOX: OnceLock<Mutex<Option<CamofoxState>>> = OnceLock::new();

fn global_mutex() -> &'static Mutex<Option<CamofoxState>> {
    CAMOFOX.get_or_init(|| Mutex::new(None))
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

struct CamofoxState {
    child: Child,
    marionette: MarionetteClient,
    _profile_path: PathBuf,
    pid: u32,
    /// The Marionette port this instance is using (C6 fix: dynamic port).
    marionette_port: u16,
}

impl Drop for CamofoxState {
    fn drop(&mut self) {
        // M3 fix: attempt graceful Marionette session teardown before killing.
        debug!(pid = self.pid, "Gracefully closing Marionette session before kill");
        let _ = self.marionette.close_session();

        let _ = self.child.kill();
        // M2 fix: spawn a background thread so Drop doesn't block the mutex.
        // We take ownership of the child by replacing it with a dummy via pid.
        // Since we already called kill(), just do a non-blocking try_wait once.
        // The OS will reap the zombie when our process exits.
        match self.child.try_wait() {
            Ok(Some(status)) => {
                debug!(pid = self.pid, ?status, "CamoFox process exited");
            }
            _ => {
                debug!(pid = self.pid, "CamoFox process still running after kill, OS will reap");
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Binary / profile discovery
// ---------------------------------------------------------------------------

/// Platform-specific CamoFox binary location.
pub fn find_binary() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        // ~/Library/Caches/camoufox/...
        let cache = env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("/tmp"))
            .join("Library/Caches");
        let path = cache.join("camoufox/Camoufox.app/Contents/MacOS/camoufox");
        if path.exists() {
            return Some(path);
        }
        None
    }
    #[cfg(target_os = "windows")]
    {
        let local = env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("C:/Users/Default/AppData/Local"));
        let path = local.join("camoufox/camoufox.exe");
        if path.exists() {
            return Some(path);
        }
        None
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        // Linux / other Unix: ~/.cache/camoufox/camoufox
        let home = env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("/tmp"));
        let path = home.join(".cache/camoufox/camoufox");
        if path.exists() {
            return Some(path);
        }
        None
    }
}

/// Marionette port range for dynamic port allocation (C6 fix).
const MARIONETTE_PORT_RANGE_START: u16 = 2828;
const MARIONETTE_PORT_RANGE_END: u16 = 2928;

/// Find an available port in the Marionette range by attempting to bind.
fn find_available_marionette_port() -> Result<u16, String> {
    for port in MARIONETTE_PORT_RANGE_START..=MARIONETTE_PORT_RANGE_END {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            drop(listener);
            debug!(port, "Found available Marionette port");
            return Ok(port);
        }
    }
    Err(format!(
        "No available Marionette port in range {}-{}",
        MARIONETTE_PORT_RANGE_START, MARIONETTE_PORT_RANGE_END
    ))
}

/// Default profile directory for ResonantOS.
pub fn default_profile() -> PathBuf {
    let home = env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            #[cfg(target_os = "windows")]
            {
                env::var("USERPROFILE")
                    .map(PathBuf::from)
                    .unwrap_or_else(|_| PathBuf::from("C:/Users/Default"))
            }
            #[cfg(not(target_os = "windows"))]
            {
                PathBuf::from("/tmp")
            }
        });
    home.join(".camofox/profiles/resonantos")
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/// Launch CamoFox with Marionette enabled on a dynamically chosen port.
/// Waits up to 15 s for Marionette to become available. Returns the process PID on success.
pub fn start(profile: Option<PathBuf>) -> Result<u32, String> {
    start_internal(profile, &mut *global_mutex().lock().unwrap_or_else(|p| p.into_inner()))
}

/// Internal start logic that operates on an already-locked guard.
/// Used by both `start()` and `ensure_running()` to avoid TOCTOU.
fn start_internal(
    profile: Option<PathBuf>,
    guard: &mut Option<CamofoxState>,
) -> Result<u32, String> {
    if guard.is_some() {
        return Err("CamoFox is already running. Call camofox_stop first.".to_string());
    }

    let binary = find_binary().ok_or_else(|| {
        "CamoFox binary not found. Install camoufox to the expected location.".to_string()
    })?;

    // C6 fix: find an available port instead of hardcoding 2828.
    let marionette_port = find_available_marionette_port()?;
    info!(port = marionette_port, binary = %binary.display(), "Starting CamoFox");

    let profile_path = profile.unwrap_or_else(default_profile);
    std::fs::create_dir_all(&profile_path)
        .map_err(|e| format!("Create profile dir {}: {e}", profile_path.display()))?;

    let mut child = Command::new(&binary)
        .arg("-profile")
        .arg(&profile_path)
        .arg("-marionette")
        .arg(format!("--marionette-port={marionette_port}"))
        .arg("-no-remote")
        .arg("-headless")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch CamoFox ({}): {e}", binary.display()))?;

    let pid = child.id();
    info!(pid, marionette_port, "CamoFox process spawned, waiting for Marionette");

    // Wait for Marionette to become available (500 ms × 30 = 15 s).
    let mut marionette = None;
    for attempt in 1..=30 {
        thread::sleep(Duration::from_millis(500));
        match MarionetteClient::connect(marionette_port) {
            Ok(mut client) => {
                if let Err(e) = client.new_session() {
                    if attempt == 30 {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(format!("Marionette NewSession failed after 30 attempts: {e}"));
                    }
                    debug!(attempt, error = %e, "NewSession failed, retrying");
                    continue;
                }
                marionette = Some(client);
                break;
            }
            Err(_) if attempt < 30 => {
                debug!(attempt, "Marionette not ready yet, retrying");
                continue;
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "Marionette did not become available after 15 s: {e}"
                ));
            }
        }
    }

    let marionette = match marionette {
        Some(m) => m,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Marionette connection was not established".to_string());
        }
    };

    info!(pid, marionette_port, "CamoFox started successfully");

    *guard = Some(CamofoxState {
        child,
        marionette,
        _profile_path: profile_path,
        pid,
        marionette_port,
    });

    Ok(pid)
}

/// C5 fix: Atomic ensure_running() — holds the mutex for the entire
/// check-and-start sequence to eliminate the TOCTOU race.
pub fn ensure_running(profile: Option<PathBuf>) -> Result<u32, String> {
    let mutex = global_mutex();
    let mut guard = mutex.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(ref mut state) = *guard {
        // Check if the existing instance is still alive.
        if state.marionette.is_connected() {
            debug!(pid = state.pid, "CamoFox already running and healthy");
            return Ok(state.pid);
        }
        // Stale — drop and restart.
        warn!(pid = state.pid, "CamoFox stale (Marionette disconnected), restarting");
        *guard = None;
    }

    start_internal(profile, &mut guard)
}

/// Kill the CamoFox process and clean up state.
pub fn stop() -> Result<(), String> {
    let mutex = global_mutex();
    let mut guard = mutex.lock().unwrap_or_else(|p| p.into_inner());

    if guard.is_none() {
        return Err("CamoFox is not running.".to_string());
    }

    info!("Stopping CamoFox");
    // Drop causes graceful session close + kill.
    *guard = None;
    Ok(())
}

// ---------------------------------------------------------------------------
// Generic helper - run a closure with access to the Marionette client
// ---------------------------------------------------------------------------

pub fn with_marionette<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut MarionetteClient) -> Result<R, String>,
{
    let mutex = global_mutex();
    let mut guard = mutex.lock().unwrap_or_else(|p| p.into_inner());

    match guard.as_mut() {
        Some(state) => f(&mut state.marionette),
        None => Err("CamoFox is not running. Call camofox_start first.".to_string()),
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Return the PID of the running CamoFox process.
pub fn get_pid() -> Result<u32, String> {
    let mutex = global_mutex();
    let guard = mutex.lock().unwrap_or_else(|p| p.into_inner());
    guard
        .as_ref()
        .map(|s| s.pid)
        .ok_or_else(|| "CamoFox is not running.".to_string())
}

/// Quick Marionette liveness check.
pub fn health_check() -> Result<bool, String> {
    with_marionette(|m| Ok(m.is_connected()))
}

/// Navigate to the given URL.
pub fn navigate(url: &str) -> Result<(), String> {
    with_marionette(|m| m.navigate(url))
}

/// Capture a screenshot and return the base64-encoded PNG.
pub fn screenshot() -> Result<String, String> {
    with_marionette(|m| m.screenshot())
}

/// Scroll the CamoFox page by the given pixel deltas (positive down/right).
pub fn scroll(delta_x: i32, delta_y: i32) -> Result<(), String> {
    let script = format!(
        "window.scrollBy({}, {});",
        delta_x, delta_y
    );
    with_marionette(|m| m.execute_script(&script).map(|_| ()))
}

/// Inject the Resonant Context SDK script into the current CamoFox page.
/// The `script` parameter is the full JS source of the SDK.
pub fn inject_resonant_context(script: &str) -> Result<(), String> {
    // Wrap SDK injection and initialisation in a single execute_script call.
    // Guard against double-injection.
    let injection = format!(
        r#"if (!window.__resonantContextInjected) {{
  window.__resonantContextInjected = true;
  try {{
    {sdk}
    if (typeof ResonantContext !== 'undefined') {{
      window.__resonantCtx = new ResonantContext({{ sections: [], overlaySelectors: [], maxTextChars: 500 }});
    }}
  }} catch(e) {{ console.error('ResonantContext init failed:', e); }}
}}
null;"#,
        sdk = script
    );
    with_marionette(|m| m.execute_script(&injection).map(|_| ()))
}

/// Read the latest context snapshot from the injected SDK.
/// Returns `null` JSON value when no SDK is active on the page.
pub fn read_context_snapshot() -> Result<serde_json::Value, String> {
    let script = r#"
try {
  if (window.__resonantCtx && typeof window.__resonantCtx.snapshot === 'function') {
    return window.__resonantCtx.snapshot();
  }
  return null;
} catch(e) {
  return null;
}
"#;
    with_marionette(|m| m.execute_script(script))
}

/// Full Phantom wallet connect flow (rewritten — fixes C1, C2, C3, M1):
///
/// 1. Navigate to a real HTTPS page (so Phantom content script injects).
/// 2. Wait for Phantom to become available.
/// 3. Open the Phantom approval popup.
/// 4. Click the approve button.
/// 5. Navigate back to the real page.
/// 6. Use executeAsyncScript to get the pubkey directly (no title spoofing).
pub fn connect_wallet() -> Result<String, String> {
    info!("Starting Phantom wallet connect flow");

    // C2 fix: Navigate to a real HTTPS page where extensions inject content scripts.
    // about:blank does NOT get extension content script injection.
    with_marionette(|m| m.navigate("https://phantom.app"))?;

    // Wait for the page to settle and Phantom to inject.
    thread::sleep(Duration::from_millis(3000));

    // Verify Phantom is available before proceeding.
    let phantom_ready = with_marionette(|m| m.check_phantom_available())?;
    if !phantom_ready {
        warn!("Phantom extension not detected on page, retrying after longer wait");
        thread::sleep(Duration::from_millis(3000));
        let retry = with_marionette(|m| m.check_phantom_available())?;
        if !retry {
            return Err("Phantom wallet extension not detected. Ensure Phantom is installed and enabled.".to_string());
        }
    }
    info!("Phantom extension detected, opening approval popup");

    // Step 3: Open the Phantom notification/approval page.
    with_marionette(|m| m.open_phantom_page("notification.html"))?;

    // Short pause for the popup to render.
    thread::sleep(Duration::from_millis(1500));

    // Step 4: Click the primary approve/connect button.
    let approve_result = with_marionette(|m| {
        m.find_element("css selector", "button[data-testid='primary-button']")
    });
    if let Ok(element_id) = approve_result {
        info!("Clicking wallet approval button");
        let _ = with_marionette(|m| m.click_element(&element_id));
    } else {
        warn!("Approval button not found — wallet may auto-approve or require manual interaction");
    }

    // Step 5: Navigate back to a real page for the connect call.
    with_marionette(|m| m.navigate("https://phantom.app"))?;
    thread::sleep(Duration::from_millis(2000));

    // Step 6: C3 fix — use executeAsyncScript to get pubkey directly from
    // Marionette context instead of the spoofable page title.
    // C1 fix — inject a fresh connect call on the current (navigated-to) page.
    // M1 fix — the with_marionette call acquires/releases the lock per call,
    // and the async script handles the wait internally (no polling loop).
    info!("Requesting wallet public key via executeAsyncScript");
    let result = with_marionette(|m| m.trigger_phantom_connect())?;

    // Parse the result — should be a string pubkey or an error.
    match result.as_str() {
        Some(s) if s.starts_with("ERROR:") => {
            error!(error = s, "Wallet connect failed");
            Err(format!("Wallet error: {}", &s[6..]))
        }
        Some(pubkey) if !pubkey.is_empty() => {
            info!(pubkey, "Wallet connected successfully");
            Ok(pubkey.to_string())
        }
        _ => {
            error!(result = ?result, "Unexpected wallet connect result");
            Err(format!("Unexpected wallet connect result: {result:?}"))
        }
    }
}
