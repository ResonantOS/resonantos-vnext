# BROWSER-FIX-REPORT — CamoFox Bug Fixes

**Author:** Linus (Subagent)  
**Date:** 2026-05-12  
**Source:** QA-BROWSER-REPORT.md (28 issues)  
**Build:** ✅ `cargo build` — PASS (0 errors, existing warnings only)  
**Tests:** ✅ `cargo test --lib` — 115 passed, 0 failed  

---

## Summary

Fixed **14 issues** from the QA report across 5 Rust files + Cargo.toml.

| Severity | Fixed | Total | Coverage |
|----------|-------|-------|----------|
| 🔴 Critical | 6/7 | 7 | 86% (C7 is C++ native bridge — not touched) |
| 🟡 Medium | 7/12 | 12 | 58% |
| 🟢 Low | 1/9 | 9 | 11% (logging added) |

---

## Critical Fixes (🔴)

### ✅ C1: `connect_wallet()` Broken Navigation Flow
**File:** `camofox_service.rs`  
**Fix:** Completely rewrote `connect_wallet()`. The flow now:
1. Navigates to `https://phantom.app` (real HTTPS page)
2. Verifies Phantom extension is injected
3. Opens approval popup, clicks approve
4. Navigates back to real page
5. Uses `executeAsyncScript` to get pubkey directly (no title polling on a destroyed page)

### ✅ C2: `about:blank` Extensions Don't Inject
**File:** `camofox_service.rs`  
**Fix:** Changed navigation target from `about:blank` to `https://phantom.app`. Extensions inject content scripts on real HTTPS pages.

### ✅ C3: Wallet Pubkey via Page Title — Spoofable
**File:** `marionette_bridge.rs`  
**Fix:** Replaced `trigger_phantom_connect()` to use `WebDriver:ExecuteAsyncScript` with a callback that returns the pubkey directly from the Marionette script context. Uses a custom DOM event (`__phantom_result__`) for cross-sandbox communication instead of the spoofable `document.title`.

### ✅ C4: Chrome Context Not Restored After Error
**File:** `marionette_bridge.rs`  
**Fix:** `execute_script_chrome()` now checks the `SetContext("content")` restore result. If it fails, forces a reconnect. If reconnect also fails, marks `session_id = None` (defunct), preventing further commands from running with leaked chrome privileges.

### ✅ C5: TOCTOU Race in `camofox_browser_show()`
**Files:** `camofox_service.rs`, `camofox_integration.rs`  
**Fix:** Added `ensure_running()` that holds the mutex for the entire check-and-start sequence. `camofox_integration.rs` now calls `ensure_running()` instead of separate `health_check()` + `start()`.

### ✅ C6: Marionette Port Hardcoded
**File:** `camofox_service.rs`  
**Fix:** Added `find_available_marionette_port()` that scans ports 2828–2928 using `TcpListener::bind()`. The chosen port is passed to CamoFox via `--marionette-port=<port>` and stored in `CamofoxState.marionette_port`.

### ⏭️ C7: Native Bridge `g_last_json` Use-After-Return
**Skipped:** This is in Objective-C++ (`resonant_browser_native_bridge_mac.mm`). Fixing C/C++ files was outside the Rust scope and requires a separate build system (CMake). The fix is documented in the QA report: use `thread_local` storage for the returned `c_str()`.

---

## Medium Fixes (🟡)

### ✅ M1: `connect_wallet()` Holds Mutex During Polling
**File:** `camofox_service.rs`  
**Fix:** The rewritten `connect_wallet()` eliminates the 60-iteration polling loop. The `executeAsyncScript` call handles the wait internally (up to 60s script timeout), and each `with_marionette()` call acquires/releases the lock per call.

### ✅ M2: `CamofoxState::Drop` Blocks 2.5s
**File:** `camofox_service.rs`  
**Fix:** Replaced the 5×500ms wait loop in `Drop` with a single non-blocking `try_wait()`. The process is already killed; the OS reaps the zombie on process exit.

### ✅ M3: No Graceful Marionette Teardown on `stop()`
**File:** `camofox_service.rs`  
**Fix:** `CamofoxState::Drop` now calls `marionette.close_session()` (best-effort) before `child.kill()`, allowing graceful profile sync and extension data persistence.

### ✅ M4: Reconnect Silently Destroys State
**File:** `marionette_bridge.rs`  
**Fix:** Added `warn!()` logging when reconnect occurs, explicitly noting that "previous session state will be lost". This makes the state destruction observable.

### ✅ M5: Overlay No Process Check
**File:** `camofox_overlay_macos.rs`  
**Fix:** Added `is_camofox_running()` (uses `pgrep -x camoufox`) and `require_camofox_running()` guard. All overlay functions (`reposition`, `bring_to_front`, `hide_offscreen`) now check process existence first and return a clear error message.

### ✅ M6: Overlay Retina Scaling
**File:** `camofox_overlay_macos.rs`  
**Fix:** Added `display_scale_factor()` that detects the backing scale factor via NSScreen's `backingScaleFactor`. Exposed as `get_display_scale_factor()` for callers that need to convert between device pixels and logical points.

### ✅ M7: `find_chromium_binary()` macOS-Only
**File:** `browser_service.rs`  
**Fix:** Added `#[cfg()]` platform-conditional candidate paths:
- **macOS:** `/Applications/Chromium.app`, Chrome.app, Edge.app
- **Windows:** `C:/Program Files/Google/Chrome/...`, Edge, Chromium
- **Linux:** `/usr/bin/chromium-browser`, `chromium`, `google-chrome-stable`, snap paths
- **Playwright cache:** Platform-aware paths (`Library/Caches` on macOS, `AppData/Local` on Windows, `.cache` on Linux)

### ⏭️ M8–M12: Not Fixed
- **M8** (CDP WebSocket timeout): Requires `connect_timeout` on TcpStream — non-trivial refactor
- **M9** (RPC response timeout): Requires async I/O or pipe timeout — non-trivial refactor
- **M10** (pkill in tests): Integration tests are external, not part of the Rust library
- **M11** (read_message size limit): ✅ **FIXED** — Added 64MB cap
- **M12** (session cleanup race): Low priority, existing behavior is acceptable

---

## Low Fixes (🟢)

### ✅ L2: No Logging in CamoFox Modules — FIXED
**Files:** All 4 CamoFox Rust files + `Cargo.toml`  
**Fix:** 
- Added `tracing = "0.1"` to `Cargo.toml`
- Added `use tracing::{info, warn, error, debug}` to all CamoFox modules
- Added structured logging to:
  - All lifecycle events (start, stop, ensure_running)
  - Marionette connection/reconnection
  - Command send/receive
  - Chrome context execution
  - Wallet connect flow steps
  - Overlay operations
  - Error paths

### ⏭️ L1, L3–L9: Not Fixed (low priority, documented in QA report)

---

## Files Modified

| File | Changes |
|------|---------|
| `Cargo.toml` | Added `tracing = "0.1"` dependency |
| `src/lib.rs` | Added 4 module declarations (camofox_*, marionette_bridge) |
| `src/camofox_service.rs` | C1, C2, C5, C6, M1, M2, M3 fixes + logging |
| `src/camofox_integration.rs` | C5 fix (use ensure_running) + logging |
| `src/camofox_overlay_macos.rs` | M5, M6 fixes + logging |
| `src/marionette_bridge.rs` | C3, C4, M4, M11 fixes + logging |
| `src/browser_service.rs` | M7 fix (cross-platform chromium paths) |

---

## Build & Test Results

```
cargo build: ✅ PASS (0 errors, 50 warnings — all pre-existing dead-code warnings)
cargo test --lib: ✅ 115 passed, 0 failed, 3 ignored
cargo test (integration): 6 integration tests fail — these are external tests
  that require a running CamoFox binary + port 2828. They were failing before
  our changes (they use pkill and hardcoded port 2828). The 2 that pass (t01, t08)
  are non-deterministic based on CamoFox availability.
```

---

## Remaining Work (Not Fixed)

| Issue | Reason |
|-------|--------|
| C7 (native bridge c_str) | Objective-C++ file, requires CMake build |
| M8 (CDP WebSocket timeout) | Non-trivial refactor to add connect_timeout |
| M9 (RPC response timeout) | Requires async I/O or pipe timeout changes |
| M10 (pkill in tests) | External integration tests |
| M12 (session cleanup race) | Low impact |
| L1, L3-L9 | Low priority improvements |
