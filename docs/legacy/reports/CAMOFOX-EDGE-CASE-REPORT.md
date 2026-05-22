# CamoFox Edge Case Analysis — Hyper Linus Panel
Date: 2026-05-12
Analyst: Overnight Subagent (Analog 6)

## Files Analyzed
- `src-tauri/src/marionette_bridge.rs` (17KB — Marionette wire protocol client)
- `src-tauri/src/camofox_service.rs` (10KB — process lifecycle, global singleton)
- `src-tauri/src/camofox_overlay_macos.rs` (7.6KB — macOS window coordination via osascript)
- `src-tauri/src/camofox_integration.rs` (3KB — bridge to existing browser command types)
- `src-tauri/tests/camofox_integration_test.rs` (8 tests, raw TCP Marionette protocol)
- `src-tauri/tests/marionette_test.rs` (1 test, raw TCP validation)
- `src-tauri/src/browser_service.rs` (struct definitions referenced by integration)
- `src-tauri/src/browser_host_service.rs` (old browser host approach, for comparison)
- `src-tauri/src/browser_native_service.rs` (old native browser, for comparison)

---

## Executive Summary

**Overall Assessment: B+** — Solid foundation with clean layered architecture. The Marionette bridge is well-implemented with proper wire protocol handling. However, there are **3 critical**, **5 high-priority**, and **8 medium-priority** issues across race conditions, wallet security, crash recovery, and overlay reliability.

**Severity Distribution:**
| Severity | Count | Impact |
|----------|-------|--------|
| 🔴 Critical | 3 | Data loss, security breach, or total failure scenarios |
| 🟠 High | 5 | Significant user-visible bugs |
| 🟡 Medium | 8 | Intermittent issues under specific conditions |
| 🟢 Low | 6 | Code quality, robustness improvements |

**Highest-risk area:** The wallet connect flow (`connect_wallet`) has the most concentrated risk — it involves multiple sequential Marionette commands with no transaction-level rollback, uses the page title as a data channel (trivially spoofable), and has a 30s polling loop that holds the global mutex.

---

## Critical Issues (🔴)

### 🔴 C1: `connect_wallet()` Holds Global Mutex for 30+ Seconds (Deadlock Risk)

**File:** `camofox_service.rs` → `connect_wallet()`

**What happens:** `connect_wallet()` calls `with_marionette()` 5 separate times in sequence, each acquiring and releasing the global `Mutex<Option<CamofoxState>>`. Between calls, the mutex is released — but the real problem is the 30s polling loop at the end:

```rust
// Poll for up to 30 s (60 × 500 ms).
for _ in 0..60 {
    thread::sleep(Duration::from_millis(500));
    match with_marionette(|m| m.check_wallet_title())? {
        Some(pubkey) => return Ok(pubkey),
        None => continue,
    }
}
```

Each iteration acquires the mutex, checks the title, releases it, sleeps 500ms, and repeats up to 60 times. This means:
- Any other Tauri command trying to use CamoFox (navigate, screenshot, health_check, resize) will contend with this loop for 30 seconds.
- If the user triggers a `camofox_browser_show` while wallet connect is in progress, the show command will interleave between poll iterations, potentially changing the page title and breaking the title-based state detection.

**Impact:** Any concurrent CamoFox operation during wallet connect can corrupt the wallet connect state or cause unexpected navigation. Worst case: user navigates away mid-connect, the public key is never read, and the wallet enters an inconsistent state where it's connected server-side but the app thinks it failed.

**Fix:**
```rust
// Hold the mutex for the entire wallet connect operation
pub fn connect_wallet() -> Result<String, String> {
    let mutex = global_mutex();
    let mut guard = mutex.lock().unwrap_or_else(|p| p.into_inner());
    let state = guard.as_mut()
        .ok_or("CamoFox is not running")?;
    let m = &mut state.marionette;
    
    m.navigate("about:blank")?;
    m.trigger_phantom_connect()?;
    m.open_phantom_page("notification.html")?;
    thread::sleep(Duration::from_millis(800));
    
    if let Ok(el) = m.find_element("css selector", "button[data-testid='primary-button']") {
        let _ = m.click_element(&el);
    }
    m.navigate("about:blank")?;
    
    for _ in 0..60 {
        thread::sleep(Duration::from_millis(500));
        match m.check_wallet_title()? {
            Some(pubkey) => return Ok(pubkey),
            None => continue,
        }
    }
    Err("Wallet connect timed out after 30 s".to_string())
}
```

This atomically holds the lock for the entire operation, preventing interleaving.

---

### 🔴 C2: Wallet Public Key Communicated via Page Title — Spoofable & Fragile

**File:** `marionette_bridge.rs` → `trigger_phantom_connect()` / `check_wallet_title()`

**What happens:** The wallet connect flow injects a script that sets `document.title` to `"CONNECTED:<pubkey>"` or `"ERROR:<message>"`. Then it polls `GetTitle` to extract the result.

**Attack surface:**
1. **Any other script on the page** can set `document.title` to `"CONNECTED:<fake_pubkey>"` and the bridge will accept it as a valid wallet connection.
2. **A malicious page** (if the user navigated to one) could pre-set the title format.
3. **The page itself** (e.g., Jupiter DEX) may legitimately change its title during the connection flow, overwriting the injected result.

**Additionally:** After triggering the connect, the code navigates to `notification.html` (Phantom popup), clicks approve, then navigates **back to `about:blank`**. But the original `trigger_phantom_connect` script was injected into the _previous_ `about:blank` page — which was destroyed by the navigation to `notification.html`. The title-based result is now lost.

**Impact:** The wallet connect flow as written **cannot work correctly**. The sequence is:
1. Navigate to about:blank ✅
2. Inject connect trigger (sets title on THIS page) ✅
3. Navigate to notification.html ❌ **This destroys the page with the trigger script**
4. Click approve ✅ (but the connect() promise from step 2 was on the destroyed page)
5. Navigate back to about:blank ❌ **This is a NEW about:blank, not the one with the title**
6. Poll title → will always be empty → **30s timeout guaranteed**

**Fix:** Use `window.postMessage` or a custom DOM element instead of title. Or better: after clicking approve, navigate to a purpose-built local HTML page that runs the connect check fresh:

```rust
// After clicking approve, navigate to a local page that checks connection state
m.navigate("about:blank")?;
m.execute_script(r#"
    const s = document.createElement('script');
    s.textContent = `
        (async () => {
            try {
                if (window.phantom?.solana) {
                    const resp = await window.phantom.solana.connect();
                    document.title = "CONNECTED:" + resp.publicKey.toString();
                } else {
                    document.title = "ERROR:phantom_not_found";
                }
            } catch(e) {
                document.title = "ERROR:" + e.message;
            }
        })();
    `;
    document.head.appendChild(s);
    return null;
"#)?;
// Now poll THIS page's title
```

**Note:** Even with this fix, the title-as-data-channel pattern remains fragile. A proper solution would use `execute_script` to directly return the result from a polling `executeAsyncScript` with a timeout.

---

### 🔴 C3: `execute_script_chrome` — Incomplete Context Restore on Panic

**File:** `marionette_bridge.rs` → `execute_script_chrome()`

**What happens:** The function switches to chrome context, executes a privileged script, then restores content context:

```rust
pub fn execute_script_chrome(&mut self, script: &str) -> Result<Value, String> {
    self.send_command("Marionette:SetContext", json!({ "value": "chrome" }))?;
    let result = self.send_command("WebDriver:ExecuteScript", ...);
    let _ = self.send_command("Marionette:SetContext", json!({ "value": "content" }));
    let result = result?;
    // ...
}
```

**Edge case 1:** If `SetContext("chrome")` succeeds but `ExecuteScript` causes a **Marionette disconnect** (not just an error response, but a TCP-level failure), `send_command` triggers `reconnect()`. The reconnect establishes a fresh session. The next line (`SetContext("content")`) runs on the **new session** — which is already in content context by default. So this works by accident.

BUT: if `reconnect()` itself fails, the old stream is replaced with the new (broken) stream inside `reconnect`, and the context is left in an unknown state. All subsequent commands may execute in chrome context with system principal privileges.

**Edge case 2:** If the MarionetteClient is used across an `UnwindSafe` boundary (e.g., `catch_unwind`), a panic between `SetContext("chrome")` and the restore would leave the session in chrome context permanently.

**Impact:** Subsequent content-context operations (user-facing scripts) would run with **system principal privileges**, potentially allowing DOM scripts to access `Services.scriptSecurityManager`, `ChromeUtils`, etc.

**Fix:**
```rust
pub fn execute_script_chrome(&mut self, script: &str) -> Result<Value, String> {
    self.send_command("Marionette:SetContext", json!({ "value": "chrome" }))?;
    let result = self.send_command("WebDriver:ExecuteScript", json!({
        "script": script, "args": []
    }));
    // Always try to restore, track if restore itself fails
    let restore = self.send_command("Marionette:SetContext", json!({ "value": "content" }));
    if restore.is_err() {
        // Context may be stuck in chrome — force reconnect to get a clean session
        let _ = self.reconnect(self.port);
    }
    result.map(|r| r.get("value").cloned().unwrap_or(r))
}
```

---

## High Priority (🟠)

### 🟠 H1: Race Between `health_check()` and `start()` in `camofox_browser_show`

**File:** `camofox_integration.rs` → `camofox_browser_show()`

```rust
if !camofox_service::health_check().unwrap_or(false) {
    camofox_service::start(None)?;
}
```

**What happens:** `health_check()` acquires the mutex, checks Marionette liveness, releases it. Then `start()` acquires the mutex again. Between those two acquisitions, another thread could:
- Call `stop()`, making `start()` succeed but leaving the health check stale
- Call `start()` first, causing the second `start()` to fail with "CamoFox is already running"

**This is a classic TOCTOU (Time-of-Check-Time-of-Use) race.**

**Impact:** Under concurrent Tauri commands (e.g., user rapidly clicking "show browser"), one of two things happens:
1. Double-start error message surfaces to the user
2. More subtly: `start()` succeeds but the `navigate()` call on the next line uses the stale state from a previous instance

**Fix:** Combine check-and-start into an atomic operation:
```rust
pub fn ensure_running() -> Result<u32, String> {
    let mutex = global_mutex();
    let mut guard = mutex.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(ref mut state) = *guard {
        if state.marionette.is_connected() {
            return Ok(state.pid);
        }
        // Not connected — drop the stale state and fall through to start
        *guard = None;
    }
    // Start fresh (inlined start logic, already holding the lock)
    // ...
}
```

---

### 🟠 H2: Marionette Port Hardcoded — No Port Conflict Detection

**File:** `camofox_service.rs` — `const DEFAULT_MARIONETTE_PORT: u16 = 2828;`

**What happens:** Port 2828 is the default Marionette port. If:
- Another Firefox/CamoFox instance is already running (from a previous crash, user-launched, or test suite)
- Another application uses port 2828
- The tests (`kill_camofox` via `pkill -f camoufox`) fail to kill an existing instance

...then `MarionetteClient::connect(2828)` will connect to the **wrong Firefox instance**, potentially controlling a user's personal browser session.

**Impact:** 
- Navigation commands sent to wrong browser instance
- Screenshots captured from wrong browser
- Wallet operations executed in wrong browser context (security breach)
- `stop()` kills the CamoFox child process, but the Marionette client is connected to a different process — state is now permanently inconsistent

**Fix:**
```rust
// Use a random port to avoid conflicts
let port = find_available_port(2828..2928)?;

let mut child = Command::new(&binary)
    .arg("-profile").arg(&profile_path)
    .arg("-marionette")
    .arg("-marionette-port").arg(port.to_string())  // Firefox supports this
    .arg("-no-remote")
    .arg("--kiosk")
    // ...
```

Also verify the connected Marionette instance belongs to our PID by checking the process tree or using a profile-specific canary.

---

### 🟠 H3: `CamofoxState::Drop` — 2.5s Blocking Drop Can Cascade

**File:** `camofox_service.rs` → `impl Drop for CamofoxState`

```rust
impl Drop for CamofoxState {
    fn drop(&mut self) {
        let _ = self.child.kill();
        for _ in 0..5 {
            match self.child.try_wait() {
                Ok(Some(_)) => break,
                _ => thread::sleep(Duration::from_millis(500)),
            }
        }
    }
}
```

**What happens:** Drop is called while holding the global mutex (inside `stop()` which calls `*guard = None`). If the child process takes the full 2.5s to die, the mutex is held for 2.5s, blocking ALL other CamoFox operations.

Worse: if `drop()` is called during process shutdown (Tauri app closing), it blocks the main thread for up to 2.5s, potentially causing a macOS "Application Not Responding" dialog.

**Impact:** 2.5s UI freeze during CamoFox shutdown. If the user rapidly toggles the browser on/off, they can stack up to 2.5s delays per toggle.

**Fix:** Spawn the kill+wait into a detached thread:
```rust
impl Drop for CamofoxState {
    fn drop(&mut self) {
        let mut child = std::mem::replace(&mut self.child, /* need a dummy */);
        // Actually, since we can't replace Child with a dummy, 
        // move the wait logic to stop() before dropping:
    }
}

pub fn stop() -> Result<(), String> {
    let mut guard = global_mutex().lock().unwrap_or_else(|p| p.into_inner());
    if let Some(mut state) = guard.take() {
        let _ = state.child.kill();
        // Spawn background reaper
        std::thread::spawn(move || {
            for _ in 0..5 {
                match state.child.try_wait() {
                    Ok(Some(_)) => return,
                    _ => std::thread::sleep(Duration::from_millis(500)),
                }
            }
        });
        // Don't run CamofoxState::Drop (already took ownership)
        std::mem::forget(state);
    }
    Ok(())
}
```

---

### 🟠 H4: osascript Overlay Has No Process Existence Check

**File:** `camofox_overlay_macos.rs`

**What happens:** All overlay functions (`reposition`, `bring_to_front`, `hide_offscreen`, `get_bounds`) blindly send AppleScript to `process "camoufox"` without first verifying that the process exists.

If CamoFox crashed or was killed externally:
- `osascript` will return an error like `"System Events got an error: Can't get process "camoufox""`
- The error is returned as `Err(String)` — but `camofox_integration.rs` propagates this to the frontend as an unrecoverable error

Additionally, the `reposition` function uses `front window` — if CamoFox has multiple windows (e.g., Phantom popup as separate window), `front window` may target the wrong one.

**Impact:** After any CamoFox crash, all overlay operations fail with cryptic AppleScript errors until `camofox_service::stop()` and `start()` are called. The integration layer has no auto-recovery for overlay failures.

**Fix:** Add a `is_running()` check before overlay operations:
```rust
pub fn is_process_running() -> bool {
    let output = Command::new("pgrep").args(["-x", "camoufox"]).output();
    output.map(|o| o.status.success()).unwrap_or(false)
}

pub fn reposition(x: i32, y: i32, w: i32, h: i32) -> Result<(), String> {
    if !is_process_running() {
        return Err("CamoFox process not found".to_string());
    }
    // ... existing logic
}
```

---

### 🟠 H5: Reconnect Silently Creates New Session — Loses All Browser State

**File:** `marionette_bridge.rs` → `reconnect()`

**What happens:** When a read error occurs during `send_command`, the code calls `reconnect()` which:
1. Opens a new TCP connection
2. Consumes the greeting
3. Calls `new_session()` — creating a **brand new WebDriver session**

A new session in Marionette means:
- All open tabs are closed
- All navigation history is lost
- Any in-flight wallet transactions are abandoned
- The Phantom extension state may reset
- The user sees a blank browser after reconnection

The original error is still returned to the caller, but `reconnect()` has already destroyed the browser state.

**Impact:** Any network hiccup (TCP timeout, packet loss on loopback) causes total loss of browser state. The user's DeFi transaction page disappears. If they were mid-swap on Jupiter, the transaction may have been submitted but the confirmation page is gone.

**Fix:** Separate "reconnect Marionette TCP" from "create new session". On reconnect, first try to reattach to the existing session:
```rust
fn reconnect(&mut self, port: u16) -> Result<(), String> {
    // ... open new TCP connection, consume greeting ...
    
    // Try to reattach to existing session first
    if let Some(ref session_id) = self.session_id {
        // Marionette doesn't have a native "reattach" — but we can 
        // check if the old session still exists by sending a command
        match self.send_command("WebDriver:GetTitle", json!({})) {
            Ok(_) => return Ok(()), // Session survived
            Err(_) => {} // Fall through to new session
        }
    }
    self.new_session()?;
    Ok(())
}
```

---

## Medium Priority (🟡)

### 🟡 M1: No Graceful Marionette Session Teardown on `stop()`

**File:** `camofox_service.rs` → `stop()`

The `stop()` function sets `*guard = None`, triggering `CamofoxState::Drop` which calls `child.kill()`. It never calls `marionette.close_session()` first.

**Impact:** The Firefox process receives SIGKILL, which:
- Prevents graceful profile sync (sessionstore.jsonlz4 may not be written)
- May corrupt the profile's `storage/` directory (IndexedDB, extension data)
- Phantom wallet extension data could be lost

**Fix:** Call `close_session()` before kill, with a short timeout:
```rust
pub fn stop() -> Result<(), String> {
    let mut guard = global_mutex().lock().unwrap_or_else(|p| p.into_inner());
    if let Some(ref mut state) = *guard {
        let _ = state.marionette.close_session(); // Best-effort
        // Then proceed with kill
    }
    *guard = None;
    Ok(())
}
```

---

### 🟡 M2: `command_id` Overflow After 2^64 Commands

**File:** `marionette_bridge.rs`

`command_id` is `u64` and increments on every `send_command`. At 1000 commands/sec, overflow occurs after 584 million years. **Not a practical risk**, but `reconnect()` also calls `new_session()` which uses `send_command`, incrementing the counter. It does NOT reset `command_id`.

More practically: after a reconnect, the `command_id` continues from where it left off. If Marionette on the new connection expects IDs starting from 1, there could be a protocol mismatch. Marionette's actual behavior is to accept any ID (it echoes it back), so this is technically safe but semantically wrong.

**Impact:** Minimal. Defensive fix: reset `command_id = 0` in `reconnect()`.

---

### 🟡 M3: `find_binary()` Returns the First Match — No Version Validation

**File:** `camofox_service.rs` → `find_binary()`

**What happens:** The function checks if the binary exists at the expected path and returns it. No validation that:
- It's actually CamoFox (could be regular Firefox at that path)
- The version supports Marionette protocol 3
- The binary is executable
- The binary hasn't been tampered with

**Impact:** If a user has a corrupted or incompatible binary at the expected path, `start()` will launch it, wait 15s for Marionette, and fail with a generic timeout error.

**Fix:** After finding the binary, do a quick validation:
```rust
// Check it's actually camoufox
let output = Command::new(&path).arg("--version").output();
if let Ok(out) = output {
    let version = String::from_utf8_lossy(&out.stdout);
    if !version.contains("Camoufox") && !version.contains("Firefox") {
        return None; // Not a Firefox-based browser
    }
}
```

---

### 🟡 M4: Overlay `reposition()` Doesn't Account for macOS Retina Scaling

**File:** `camofox_overlay_macos.rs` → `reposition()`

**What happens:** The `BrowserNativeWebviewRequest` provides `x`, `y`, `width`, `height` as `f64` (logical pixels from the Tauri webview). These are cast to `i32` and passed directly to osascript.

On Retina displays (which the Mac Mini M4 uses), macOS System Events operates in **physical pixels** for some operations and **logical pixels** for others, depending on the context. The AppleScript `set position of front window` uses **logical (point) coordinates**, but if the Tauri webview reports values in device pixels, the overlay will be positioned at 2× the expected offset.

**Impact:** On Retina displays, the CamoFox overlay could be positioned incorrectly — offset or sized at half the expected dimensions, creating a visible gap between the Tauri shell and the browser content.

**Fix:** Detect the display scale factor and normalize coordinates:
```rust
pub fn get_scale_factor() -> f64 {
    let script = r#"tell application "System Events"
    tell process "Finder"
        get properties of desktop
    end tell
end tell"#;
    // Or use NSScreen.mainScreen.backingScaleFactor via objc crate
    // For now, assume 2.0 on Apple Silicon Macs
    2.0
}
```

---

### 🟡 M5: `with_marionette` Panics if Mutex is Poisoned (via `unwrap_or_else`)

**File:** `camofox_service.rs` → multiple functions

```rust
let mut guard = mutex.lock().unwrap_or_else(|p| p.into_inner());
```

This recovers from a poisoned mutex by extracting the inner value. Mutex poisoning occurs when a thread panics while holding the lock. The `into_inner()` call gives access to potentially inconsistent state.

**What happens:** If a thread panics during a Marionette operation (e.g., an allocation failure during `send_command`), the `MarionetteClient`'s internal state (stream, reader, command_id) may be in an inconsistent state. The next caller gets this corrupt state.

**Impact:** Subsequent Marionette commands may:
- Read partial responses from a previous command
- Send commands with wrong IDs
- Crash on malformed data in the BufReader

**Fix:** On poisoned mutex recovery, reset the state:
```rust
let mut guard = mutex.lock().unwrap_or_else(|p| {
    let mut inner = p.into_inner();
    // State is potentially corrupt — kill the process and clear state
    if let Some(ref mut state) = *inner {
        let _ = state.child.kill();
    }
    *inner = None;
    inner
});
```

---

### 🟡 M6: `connect_wallet` Navigation to `about:blank` May Not Have Phantom Extension

**File:** `camofox_service.rs` → `connect_wallet()`

**What happens:** The wallet connect flow navigates to `about:blank` and injects a script that calls `window.phantom.solana.connect()`. But `about:blank` is a privileged page — browser extensions typically do NOT inject content scripts into `about:blank`, `about:newtab`, or other `about:` pages.

This means `window.phantom` will be `undefined` on `about:blank`, and the injected script will throw `TypeError: Cannot read properties of undefined (reading 'solana')`, setting the title to `"ERROR:Cannot read properties of undefined"`.

**Impact:** Wallet connect will ALWAYS fail on the first attempt because Phantom doesn't inject into `about:blank`.

**Fix:** Navigate to a page where Phantom injects (any https:// page):
```rust
m.navigate("https://phantom.app")?;
thread::sleep(Duration::from_secs(3)); // Wait for extension injection
m.trigger_phantom_connect()?;
```

---

### 🟡 M7: AppleScript Injection via Process Name

**File:** `camofox_overlay_macos.rs`

The AppleScript commands reference `process "camoufox"` by name. If a malicious application registers itself with the process name "camoufox", the overlay commands would target it instead. This is unlikely but worth noting.

More practically: the `reposition` function uses string interpolation in AppleScript:
```rust
let script = format!(
    r#"tell application "System Events"
    tell process "camoufox"
        set position of front window to {{{x}, {y}}}
        set size of front window to {{{w}, {h}}}
    end tell
end tell"#
);
```

The `x`, `y`, `w`, `h` parameters are `i32` values, so there's no injection risk here. But if this pattern were extended to accept string parameters (e.g., window title), injection would be possible.

**Impact:** Currently safe. Flagged as a defensive note for future development.

---

### 🟡 M8: No Timeout on `read_message` Length Prefix Parsing

**File:** `marionette_bridge.rs` → `read_message()`

```rust
loop {
    self.reader.read_exact(&mut byte)...;
    if byte[0] == b':' { break; }
    if !byte[0].is_ascii_digit() { return Err(...); }
    len_buf.push(byte[0]);
}
```

**What happens:** If Marionette sends an unbounded stream of ASCII digits without a `:` delimiter, `len_buf` grows without limit. A malicious or buggy Marionette implementation could send `"99999999999999..."` (billions of digits) causing OOM.

More practically: if the TCP stream returns data one byte at a time due to network conditions, and the length prefix is very large (e.g., a multi-MB screenshot response), `len_buf` allocates correctly but the subsequent `vec![0u8; length]` could allocate gigabytes.

**Impact:** OOM crash if Marionette returns an unexpectedly large length prefix.

**Fix:** Cap the length:
```rust
const MAX_MARIONETTE_MESSAGE: usize = 64 * 1024 * 1024; // 64 MB
let length: usize = /* parse */;
if length > MAX_MARIONETTE_MESSAGE {
    return Err(format!("Message too large: {length} bytes"));
}
```

---

## Low Priority (🟢)

### 🟢 L1: `find_binary()` Falls Back to `/tmp` for `$HOME`

If `$HOME` is unset, the code falls back to `/tmp` on Unix or `C:/Users/Default` on Windows. On macOS, this means looking for CamoFox at `/tmp/Library/Caches/camoufox/...`, which will never exist. This is a non-issue in practice (HOME is always set on macOS), but the fallback creates a confusing error path.

### 🟢 L2: Tests Use `pkill -f camoufox` — Kills ALL Matching Processes

The integration tests use `pkill -f camoufox` which kills any process with "camoufox" in its command line, including:
- A user's browser session
- Another test running in parallel
- An unrelated process with "camoufox" in its path

Should use PID-based cleanup instead.

### 🟢 L3: `get_url()` and `get_title()` Have Redundant Result Extraction

Both functions try `result.as_str()` then `result["value"].as_str()`. This dual-path extraction suggests uncertainty about the Marionette response format. Should be documented which version of Marionette returns which format.

### 🟢 L4: `screenshot()` Only Returns Base64 — No Size Limit

For long/complex pages, screenshots can be multi-megabyte base64 strings passed through the Tauri IPC bridge. Should support optional viewport-only screenshots.

### 🟢 L5: `browser_native_service.rs` Integration Not Wired

The `camofox_integration.rs` references are not present in `lib.rs` — the Phase 3 wiring (try CamoFox first, fall back to native) has not been implemented. The modules exist but are dead code from the Tauri command handler perspective.

### 🟢 L6: No Logging Anywhere in the CamoFox Stack

None of the four CamoFox modules use `log::info!`, `tracing::`, or any logging framework. All errors are returned as `Result<_, String>`. This makes production debugging extremely difficult — there's no way to know what CamoFox did after the fact.

---

## Test Coverage Gaps

| Area | Current Coverage | Gap |
|------|-----------------|-----|
| Marionette wire protocol | ✅ 8 tests (raw TCP) | Good coverage of happy path |
| Marionette reconnect | ❌ No tests | Reconnect logic is untested |
| CamoFox process lifecycle | ❌ No tests | start/stop/restart not tested via `camofox_service` |
| Concurrent access | ❌ No tests | No multi-threaded tests for mutex contention |
| Wallet connect flow | ❌ No tests | The most complex flow has zero test coverage |
| Overlay positioning | ✅ 2 unit tests | `calculate_viewport_bounds` tested; `reposition` not tested |
| osascript error handling | ❌ No tests | What happens when System Events denies access? |
| Profile corruption recovery | ❌ No tests | What if profile dir exists but is corrupt? |
| Integration bridge | ❌ No tests | `camofox_integration.rs` has no tests |
| Non-macOS overlay | ❌ No tests | Overlay is no-op on non-macOS; no tests verify the no-op path works |
| Port conflict | ❌ No tests | What if port 2828 is already in use? |
| Binary not found | ❌ No tests | What if camoufox isn't installed? |

**Most Critical Missing Tests:**
1. **Wallet connect end-to-end** — The most user-facing, security-critical flow
2. **Reconnect behavior** — The only crash-recovery mechanism
3. **Concurrent Tauri commands** — Real-world usage pattern
4. **Process death during operation** — `kill -9` the Firefox process mid-command

---

## Recommended Fixes (Top 5)

### Fix 1: Rewrite `connect_wallet()` as an Atomic Operation
**Priority:** 🔴 Critical | **Effort:** 2-3 hours | **Files:** `camofox_service.rs`, `marionette_bridge.rs`

The wallet connect flow is fundamentally broken (C1 + C2 + M6 combined). Rewrite it to:
1. Hold the mutex for the entire operation
2. Navigate to a real HTTPS page (not `about:blank`) for Phantom injection
3. Use `executeAsyncScript` with a callback instead of title-polling
4. Add a cancel mechanism so users aren't stuck in a 30s loop

```rust
pub fn connect_wallet() -> Result<String, String> {
    let mutex = global_mutex();
    let mut guard = mutex.lock().unwrap_or_else(|p| p.into_inner());
    let state = guard.as_mut().ok_or("CamoFox is not running")?;
    let m = &mut state.marionette;
    
    // Navigate to a page where Phantom injects
    m.navigate("https://phantom.app")?;
    std::thread::sleep(Duration::from_secs(3));
    
    // Use executeAsyncScript for the entire flow
    let result = m.send_command("WebDriver:ExecuteAsyncScript", json!({
        "script": r#"
            const callback = arguments[arguments.length - 1];
            const s = document.createElement('script');
            s.textContent = `
                window.__phantom_result = null;
                window.phantom.solana.connect()
                    .then(r => { window.__phantom_result = r.publicKey.toString(); })
                    .catch(e => { window.__phantom_result = "ERROR:" + e.message; });
            `;
            document.head.appendChild(s);
            // Poll for result
            const poll = setInterval(() => {
                if (window.__phantom_result) {
                    clearInterval(poll);
                    callback(window.__phantom_result);
                }
            }, 200);
            setTimeout(() => { clearInterval(poll); callback("ERROR:timeout"); }, 30000);
        "#,
        "args": [],
        "scriptTimeout": 35000
    }))?;
    
    let pubkey = result.get("value").and_then(|v| v.as_str()).unwrap_or("");
    if let Some(err) = pubkey.strip_prefix("ERROR:") {
        return Err(format!("Wallet error: {err}"));
    }
    Ok(pubkey.to_string())
}
```

### Fix 2: Add `ensure_running()` to Eliminate TOCTOU Race
**Priority:** 🟠 High | **Effort:** 1 hour | **Files:** `camofox_service.rs`, `camofox_integration.rs`

Replace the `health_check()` + `start()` pattern with an atomic `ensure_running()` that holds the lock for both operations.

### Fix 3: Use Dynamic Marionette Port
**Priority:** 🟠 High | **Effort:** 1-2 hours | **Files:** `camofox_service.rs`

Pass `-marionette-port <random>` to the CamoFox process. Store the chosen port in `CamofoxState`. This eliminates cross-process conflicts and test interference.

### Fix 4: Add Structured Logging
**Priority:** 🟢 Low (but high ROI) | **Effort:** 2 hours | **Files:** All 4 CamoFox modules

Add `tracing` spans and events to all CamoFox operations. Critical for production debugging:
```rust
use tracing::{info, warn, error, instrument};

#[instrument(skip(self))]
pub fn navigate(&mut self, url: &str) -> Result<(), String> {
    info!(url, "Marionette navigate");
    self.send_command("WebDriver:Navigate", json!({ "url": url }))?;
    Ok(())
}
```

### Fix 5: Force Context Restore in `execute_script_chrome`
**Priority:** 🔴 Critical | **Effort:** 30 minutes | **Files:** `marionette_bridge.rs`

If the content context restore fails, force a reconnect to get a clean session. Never leave the Marionette session in chrome context.

---

## Architecture Notes

**What's Done Well:**
- Clean separation: bridge (wire protocol) → service (lifecycle) → overlay (platform) → integration (Tauri bridge)
- The Marionette wire protocol implementation is correct and handles the greeting/array format distinction properly
- Response ID validation prevents desync
- `OnceLock<Mutex<Option<State>>>` is the correct Rust pattern for a lazy global singleton
- The overlay approach (coordinated sibling windows via osascript) is the right call for macOS — true reparenting IS impossible

**Architecture Concerns:**
- The global singleton pattern means only ONE CamoFox instance per Tauri app. If multi-tab isolation is ever needed, this needs refactoring to a pool/registry pattern.
- The `with_marionette` closure pattern forces all operations to be synchronous and blocking. An async Marionette client would enable non-blocking Tauri commands.
- No event system — the Tauri frontend has no way to know when CamoFox crashes, reconnects, or loses state. Events should be emitted via `app.emit()`.
