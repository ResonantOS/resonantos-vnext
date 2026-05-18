# Task: Implement CamoFox Marionette Bridge + Process Lifecycle

## Context
We're adding CamoFox (Camoufox — Firefox anti-detection fork) browser support to ResonantOS vNext (Tauri 2 app). This task implements two new Rust modules that replace the existing `browser_host_service.rs` approach.

## Files to Create

### 1. `src-tauri/src/marionette_bridge.rs` (~400 lines)

A Rust client for Firefox's Marionette remote protocol over TCP.

**CRITICAL: Marionette wire format is JSON ARRAYS, not objects:**
```
Command:  [0, messageId, "CommandName", {params}]
Response: [1, messageId, errorOrNull, resultOrNull]
```
Framing: `<byte_length>:<json_payload>` (length-prefixed, colon delimiter)

**CRITICAL: The greeting on connect is a plain JSON OBJECT (exception to array format):**
```
<len>:{"applicationType":"gecko","marionetteProtocol":3}
```
Must consume this before sending any commands.

**CRITICAL: Marionette is strictly sequential. One command in-flight at a time. No multiplexing.**

**CRITICAL: Do NOT use inner Arc<Mutex> for stream/reader. Use a single struct with raw fields. The outer process mutex provides all synchronization.**

```rust
pub struct MarionetteClient {
    stream: TcpStream,
    reader: BufReader<TcpStream>,
    session_id: Option<String>,
    command_id: u64,
}
```

**Implementation requirements:**

1. `connect(port: u16) -> Result<Self, String>` — TCP connect, consume greeting, verify protocol version
2. `new_session() -> Result<String, String>` — WebDriver:NewSession handshake
3. `navigate(url: &str) -> Result<(), String>` — WebDriver:Navigate
4. `execute_script(script: &str) -> Result<Value, String>` — WebDriver:ExecuteScript (content context)
5. `execute_script_chrome(script: &str) -> Result<Value, String>` — Set context to chrome, execute, reset to content
6. `screenshot() -> Result<String, String>` — WebDriver:TakeScreenshot, returns base64
7. `get_url() -> Result<String, String>` — WebDriver:GetCurrentURL
8. `get_title() -> Result<String, String>` — WebDriver:GetTitle
9. `find_element(using: &str, value: &str) -> Result<String, String>` — WebDriver:FindElement
10. `click_element(element_id: &str) -> Result<(), String>` — WebDriver:ElementClick
11. `is_connected() -> bool` — Quick health check via GetTitle
12. `close_session() -> Result<(), String>` — WebDriver:DeleteSession

**send_command implementation:**
```rust
fn send_command(&mut self, command: &str, params: Value) -> Result<Value, String> {
    self.command_id += 1;
    // ARRAY format, not object!
    let cmd = Value::Array(vec![
        Value::from(0u64),                    // type = command
        Value::from(self.command_id),          // id (numeric!)
        Value::String(command.to_string()),    // command name
        params,                                // parameters
    ]);
    let json = serde_json::to_string(&cmd).unwrap();
    let framed = format!("{}:{}", json.len(), json);
    
    self.stream.write_all(framed.as_bytes())
        .map_err(|e| format!("Send failed: {}", e))?;
    self.stream.flush().map_err(|e| format!("Flush failed: {}", e))?;
    
    let response = self.read_message()?;
    // Response is [1, id, error_or_null, result_or_null]
    let arr = response.as_array()
        .ok_or("Response not an array")?;
    if arr.len() < 4 {
        return Err(format!("Malformed response: {:?}", arr));
    }
    // arr[2] is error (null if success)
    if !arr[2].is_null() {
        let err = &arr[2];
        return Err(format!("Marionette error: {} - {}", 
            err["error"].as_str().unwrap_or("unknown"),
            err["message"].as_str().unwrap_or("")));
    }
    // arr[3] is result
    Ok(arr[3].clone())
}
```

**read_message implementation:**
```rust
fn read_message(&mut self) -> Result<Value, String> {
    // Read length prefix: ASCII digits followed by ':'
    let mut len_buf = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        self.reader.read_exact(&mut byte)
            .map_err(|e| format!("Read length: {}", e))?;
        if byte[0] == b':' { break; }
        if !byte[0].is_ascii_digit() {
            return Err(format!("Invalid length byte: {}", byte[0]));
        }
        len_buf.push(byte[0]);
    }
    let length: usize = String::from_utf8(len_buf)
        .map_err(|e| format!("Length not UTF-8: {}", e))?
        .parse()
        .map_err(|e| format!("Parse length: {}", e))?;
    
    let mut payload = vec![0u8; length];
    self.reader.read_exact(&mut payload)
        .map_err(|e| format!("Read payload: {}", e))?;
    
    serde_json::from_slice(&payload)
        .map_err(|e| format!("Parse JSON: {}", e))
}
```

**Timeouts:** Set read timeout to 30s, write timeout to 10s on the TcpStream.

**Phantom-specific operations** (use execute_script_chrome for these):

```rust
/// Get Phantom's runtime UUID
pub fn get_phantom_uuid(&mut self) -> Result<String, String> {
    let result = self.execute_script_chrome(r#"
        const {AddonManager} = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        let addon = await AddonManager.getAddonByID("{7c42eea1-b3e4-4be4-a56f-82a5852b12dc}");
        if (!addon) return null;
        const {WebExtensionPolicy} = Cu.getGlobalForObject(Cu);
        const policy = WebExtensionPolicy.getByID(addon.id);
        return policy?.mozExtensionHostname || null;
    "#)?;
    // ... extract string from result
}

/// Open Phantom notification page via system principal (for approvals)
pub fn open_phantom_page(&mut self, page: &str) -> Result<(), String> {
    let uuid = self.get_phantom_uuid()?;
    self.execute_script_chrome(&format!(r#"
        const win = Services.wm.getMostRecentWindow("navigator:browser");
        win.gBrowser.selectedBrowser.loadURI(
            Services.io.newURI("moz-extension://{uuid}/{page}"),
            {{ triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }}
        );
    "#, uuid = uuid, page = page))
    .map(|_| ())
}

/// Trigger Phantom connect via page-context injection (NOT wrappedJSObject)
pub fn trigger_phantom_connect(&mut self) -> Result<(), String> {
    // Inject script element into page DOM — runs in page context, not Marionette sandbox
    self.execute_script(r#"
        const s = document.createElement('script');
        s.textContent = `window.phantom.solana.connect().then(r => {
            document.title = "CONNECTED:" + r.publicKey.toString();
        }).catch(e => {
            document.title = "ERROR:" + e.message;
        });`;
        document.head.appendChild(s);
        return null;
    "#).map(|_| ())
}

/// Check wallet state via page title (set by injected connect script)
pub fn check_wallet_title(&mut self) -> Result<Option<String>, String> {
    let title = self.get_title()?;
    if title.starts_with("CONNECTED:") {
        Ok(Some(title[10..].to_string()))
    } else if title.starts_with("ERROR:") {
        Err(format!("Wallet error: {}", &title[6..]))
    } else {
        Ok(None) // Still pending
    }
}
```

### 2. `src-tauri/src/camofox_service.rs` (~300 lines)

Process lifecycle management for CamoFox.

```rust
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::path::PathBuf;
use std::time::Duration;
use crate::marionette_bridge::MarionetteClient;

static CAMOFOX: OnceLock<Mutex<Option<CamofoxState>>> = OnceLock::new();

struct CamofoxState {
    child: Child,
    marionette: MarionetteClient,
    profile_path: PathBuf,
    pid: u32,
}

impl Drop for CamofoxState {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait(); // Reap zombie
    }
}
```

**Required functions:**

1. `find_binary() -> Option<PathBuf>` — Platform-specific binary discovery:
   - macOS: `~/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox`
   - Windows: `%LOCALAPPDATA%\camoufox\camoufox.exe`
   - Linux: `~/.cache/camoufox/camoufox`

2. `default_profile() -> PathBuf` — `~/.camofox/profiles/resonantos`

3. `start(profile: Option<PathBuf>) -> Result<u32, String>` — Launch subprocess with `-profile`, `-marionette`, `-no-remote`, `--kiosk`. Wait for Marionette with retry loop (500ms intervals, 30 attempts = 15s timeout). Return PID.

4. `stop() -> Result<(), String>` — Kill process, clean up.

5. `with_marionette<F, R>(f: F) -> Result<R, String>` — Lock mutex (with poison recovery), call closure with `&mut MarionetteClient`.

6. `get_pid() -> Result<u32, String>` — Return CamoFox PID (needed for window management).

7. `health_check() -> Result<bool, String>` — Quick Marionette ping.

8. `navigate(url: &str) -> Result<(), String>` — Convenience wrapper.

9. `screenshot() -> Result<String, String>` — Convenience wrapper.

10. `connect_wallet() -> Result<String, String>` — Full flow: trigger_phantom_connect → open_phantom_page("notification.html") → click approve → poll title for CONNECTED.

**Mutex poison recovery:**
```rust
let mut guard = mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
```

## Files to Modify

### 3. `src-tauri/src/lib.rs` — Add module declarations and Tauri commands

Add at the top:
```rust
mod marionette_bridge;
mod camofox_service;
```

Add Tauri commands:
```rust
#[tauri::command]
fn camofox_start(app: AppHandle) -> Result<u32, String> {
    assert_addon_capabilities(&app, "addon.browser", &["network", "browser-control"])?;
    camofox_service::start(None)
}

#[tauri::command]
fn camofox_stop() -> Result<(), String> {
    camofox_service::stop()
}

#[tauri::command]
fn camofox_navigate(app: AppHandle, url: String) -> Result<(), String> {
    assert_addon_capabilities(&app, "addon.browser", &["network", "browser-control"])?;
    camofox_service::navigate(&url)
}

#[tauri::command]
fn camofox_screenshot(app: AppHandle) -> Result<String, String> {
    assert_addon_capabilities(&app, "addon.browser", &["browser-control"])?;
    camofox_service::screenshot()
}

#[tauri::command]
fn camofox_connect_wallet(app: AppHandle) -> Result<String, String> {
    assert_addon_capabilities(&app, "addon.browser", &["network", "browser-control"])?;
    camofox_service::connect_wallet()
}

#[tauri::command]
fn camofox_health() -> Result<bool, String> {
    camofox_service::health_check()
}

#[tauri::command]
fn camofox_pid() -> Result<u32, String> {
    camofox_service::get_pid()
}
```

Register in the invoke_handler:
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    camofox_start,
    camofox_stop,
    camofox_navigate,
    camofox_screenshot,
    camofox_connect_wallet,
    camofox_health,
    camofox_pid,
])
```

## Test Command
```bash
cd ~/resonantos-vnext/src-tauri && cargo check 2>&1
```
The code must compile without errors. We cannot run the full app test until the frontend is wired, but `cargo check` validates all Rust.

## Dependencies
No new Cargo.toml dependencies needed — uses only std::net, std::io, std::process, serde_json (already present).

## Scope
- 2 new files: marionette_bridge.rs (~400 lines), camofox_service.rs (~300 lines)
- 1 modified file: lib.rs (~40 lines added)
- Total: ~740 lines new Rust code
