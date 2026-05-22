# CamoFox Browser Integration Report

**Date:** 2026-05-12  
**Status:** ✅ Complete — All three layers wired and building clean

---

## Layer 1: Rust IPC Commands (lib.rs)

### Commands Added

| Command | Function | Calls |
|---------|----------|-------|
| `camofox_start` | Start CamoFox with optional profile path | `camofox_service::ensure_running()` |
| `camofox_stop` | Stop CamoFox process | `camofox_service::stop()` |
| `camofox_navigate` | Navigate to URL | `camofox_service::navigate()` |
| `camofox_screenshot` | Capture base64 PNG screenshot | `camofox_service::screenshot()` |
| `camofox_health` | Marionette liveness check | `camofox_service::health_check()` |
| `camofox_connect_wallet` | Phantom wallet connect flow | `camofox_service::connect_wallet()` |
| `camofox_show` | Show CamoFox overlay with URL + bounds | `camofox_integration::camofox_browser_show()` |
| `camofox_resize` | Resize CamoFox overlay | `camofox_integration::camofox_browser_resize()` |
| `camofox_hide` | Hide CamoFox overlay offscreen | `camofox_integration::camofox_browser_hide()` |

### Capability Checks
- `camofox_show` requires: `network`, `ui-embedding`, `browser-control`
- `camofox_resize` requires: `ui-embedding`, `browser-control`
- `camofox_hide` requires: `ui-embedding`, `browser-control`
- `camofox_start/stop/navigate/screenshot/health/connect_wallet` are lightweight commands without capability gates (CamoFox is the browser backend, not a privileged Chromium host)

### Registration
All 9 commands registered in `tauri::generate_handler![]` macro at the end of the existing command list.

---

## Layer 2: React Frontend (BrowserWorkspace.tsx)

### Changes

1. **Backend Switcher** — Chromium/CamoFox toggle in the bookmarks bar (right-aligned)
2. **CamoFox Viewport** — When CamoFox backend is selected:
   - Start/Stop buttons
   - Screenshot button + auto-refresh timer (800ms interval)
   - Connect Wallet button (Phantom via Marionette)
   - Base64 PNG screenshot rendered in `<img>` tag
   - Running status indicator (green/red dot)
   - Wallet pubkey display when connected
3. **Navigation Integration** — URL bar `submit` calls `invoke('camofox_navigate')` when CamoFox is active
4. **Auto-Start** — CamoFox starts automatically when backend is switched to "CamoFox" and browser is ready
5. **Cleanup** — Screenshot timer cleared on unmount and backend switch

### Existing Chromium Untouched
All Chromium browser commands, native webview show/resize/hide, probes, extensions — everything wrapped in `{browserBackend === "chromium" ? (...) : null}` conditional. Zero Chromium functionality removed.

---

## Layer 3: Build Results

| Check | Result |
|-------|--------|
| `npm run build` (TypeScript + Vite) | ✅ Clean (0 errors) |
| `cargo build` (Rust) | ✅ Clean (0 new warnings, 26 pre-existing) |
| `cargo test --lib` | ✅ 115 passed, 0 failed, 3 ignored |

---

## Architecture Notes

- **Additive, not destructive** — CamoFox is a new backend option alongside Chromium
- **Screenshot-refresh approach** — Pragmatic path for embedding Firefox content inside Tauri; true NSView embedding of Firefox/Gecko is a much larger project
- **Marionette protocol** — All CamoFox browser control goes through the existing `marionette_bridge.rs` wire protocol client
- **Dynamic port allocation** — CamoFox uses ports 2828-2928, automatically finding an available one
- **Overlay on macOS** — `camofox_overlay_macos` handles window positioning to match Tauri viewport bounds

## Files Modified

1. `src-tauri/src/lib.rs` — Added 9 CamoFox Tauri commands + registered in handler
2. `src/modules/browser/BrowserWorkspace.tsx` — Added CamoFox backend switcher, viewport, lifecycle hooks
