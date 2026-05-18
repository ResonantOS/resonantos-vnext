# QA Platform Compatibility Report — ResonantOS vNext

**Analyst:** QA-Platform (subagent)  
**Date:** 2026-05-12  
**Scope:** All Rust source in `src-tauri/src/`, Cargo.toml, tauri.conf.json, vite.config.ts, package.json, scripts/  
**Target platforms:** macOS, Windows, Linux

---

## Executive Summary

| Platform | Verdict | Confidence |
|----------|---------|------------|
| **macOS** | ✅ PASS | High — primary development target, all features implemented |
| **Windows** | ⚠️ CONDITIONAL PASS | Medium — core compiles, several features degraded or missing |
| **Linux** | ⚠️ CONDITIONAL PASS | Medium — similar to Windows; slightly better due to Unix compatibility |

The codebase is **primarily macOS-oriented** but has been built with reasonable cross-platform awareness in the actively-compiled modules. The main risks are in: (1) uncompiled macOS-only modules that will break the build if enabled, (2) degraded browser embedding on non-macOS, and (3) a few `HOME`-only fallback paths that silently fail on Windows.

---

## 1. Platform Compatibility Matrix

### 1.1 Compiled Modules (declared in `lib.rs`)

| Feature / Module | macOS | Windows | Linux | Notes |
|-----------------|-------|---------|-------|-------|
| **archive_service** | ✅ Full | ✅ Full | ✅ Full | No platform-specific code |
| **browser_service** (headless Chromium) | ✅ Full | ✅ Full | ✅ Full | Binary discovery includes all 3 platforms |
| **browser_service** (native webview) | ✅ NSView embedding | ⚠️ Tauri child webview | ⚠️ Tauri child webview | macOS uses native NSView; others use Tauri `WebviewBuilder` fallback |
| **browser_host_service** | ✅ Full | ⚠️ Degraded | ⚠️ Degraded | Electron framework repair is macOS-only; visible host Electron path candidates are macOS-centric |
| **browser_native_service** | ✅ Full (CEF + dylib) | ❌ Missing | ❌ Missing | Bridge library is `.dylib`/`.a` macOS-only; CEF build only supports macOS |
| **delegation_service** | ✅ Full | ✅ Full | ✅ Full | No platform-specific code |
| **hermes_service** | ✅ Full | ⚠️ Degraded | ✅ Full | `home_dir()` uses `$HOME` only (no `$USERPROFILE` fallback) |
| **host_state** | ✅ Full | ✅ Full | ✅ Full | Uses `$HOME` with `$USERPROFILE` fallback ✅ |
| **memory_service** | ✅ Full | ✅ Full | ✅ Full | No platform-specific code |
| **obsidian_service** | ✅ Full | ✅ Full | ✅ Full | `open_external_url` has all 3 platform gates ✅ |
| **opencode_service** | ✅ Full | ⚠️ Partial | ⚠️ Partial | `resolve_opencode_app_binary()` only checks macOS path; Windows/Linux get no app-bundle fallback |
| **paperclip_service** | ✅ Full | ✅ Full | ✅ Full | Uses `cfg!(target_os = "windows")` for `where` vs `which` ✅ |
| **provider_service** | ✅ Full | ✅ Full | ✅ Full | No platform-specific code |
| **recovery_service** | ✅ Full | ✅ Full | ✅ Full | No platform-specific code |
| **terminal_service** | ✅ Full | ✅ Full | ✅ Full | `portable-pty` handles cross-platform PTY; `cmd`/`sh` gated; default shell `zsh` on non-Windows |

### 1.2 Uncompiled Modules (source exists, NOT in `lib.rs`)

| Module | macOS | Windows | Linux | Notes |
|--------|-------|---------|-------|-------|
| **camofox_overlay_macos.rs** | ✅ macOS-only | ❌ Will not compile | ❌ Will not compile | Uses `osascript` (AppleScript); entire module is `#[cfg(target_os = "macos")]` |
| **camofox_integration.rs** | ✅ Full | ⚠️ Compiles, overlay is no-op | ⚠️ Compiles, overlay is no-op | Has proper `#[cfg]` gates; non-macOS silently skips overlay positioning |
| **camofox_service.rs** | ✅ Full | ✅ Full | ✅ Full | Binary discovery has proper 3-platform `#[cfg]` gates ✅ |
| **marionette_bridge.rs** | ✅ Full | ✅ Full | ✅ Full | Pure TCP/JSON — no platform-specific code |
| **resonator_service.rs** | ✅ Full | ❌ **WILL NOT COMPILE** | ❌ **WILL NOT COMPILE** | Hardcoded `MacOSControl::new()` with ZERO cfg gates |

---

## 2. Detailed Platform-Specific Issues

### 2.1 CRITICAL — `resonator_service.rs` (macOS-only, no cfg gates)

**File:** `src-tauri/src/resonator_service.rs`  
**Status:** Not compiled (not in `lib.rs`), but if enabled, **will fail on Windows/Linux**  
**Severity:** 🔴 CRITICAL (blocks future enablement)

```rust
use resonator_control::macos::MacOSControl;
// ...
let ctl = MacOSControl::new();  // Used in EVERY function, ZERO cfg gates
```

**Every function** (`resonator_screen_capture`, `resonator_mouse_click`, `resonator_key_type`, `resonator_key_combo`, `resonator_clipboard_get`, `resonator_app_launch`) directly instantiates `MacOSControl` with no platform abstraction or conditional compilation.

**Fix required:** Create a platform trait (`DesktopControl` exists in the import), implement per-platform, use `#[cfg]` to select the right impl. Or wrap the entire module in `#[cfg(target_os = "macos")]` and provide stubs for other platforms.

---

### 2.2 HIGH — `browser_native_service.rs` (macOS-only CEF embedding)

**File:** `src-tauri/src/browser_native_service.rs`  
**Status:** Compiled, but non-functional on Windows/Linux  
**Severity:** 🟠 HIGH

Issues:
1. **Bridge library names are macOS-only:** `libResonantBrowserNativeBridgeShared.dylib` — Windows needs `.dll`, Linux needs `.so`
2. **Bridge probe function names reference macOS:** `resonant_browser_native_attach_macos_ns_view_json`, `resonant_browser_native_prepare_macos_application_json`
3. **CMakeLists.txt** compiles `.mm` (Objective-C++) files only on Apple; non-Apple builds lack the macOS bridge/host source
4. **`build-native-browser.mjs`** explicitly checks: `if (os.platform() !== "darwin") { skip(...) }`
5. **CEF platform detection** only supports `macosarm64` and `macosx64` — no Windows or Linux CEF builds

The non-macOS path in `lib.rs` falls back to Tauri's built-in `WebviewBuilder`, which provides a functional but less capable alternative.

**Runtime behavior on Windows/Linux:** Native browser probes will report "Blocked" or "Partial". The `execute_native_browser_embedded_show` is never called (gated by `#[cfg(target_os = "macos")]` in `lib.rs`). Instead, `execute_browser_native_webview_show` from `browser_service.rs` (the Tauri child webview path) is used.

---

### 2.3 HIGH — `browser_host_service.rs` (Electron path resolution macOS-heavy)

**File:** `src-tauri/src/browser_host_service.rs`  
**Severity:** 🟠 HIGH

1. **`resolve_browser_visible_host_electron()`** — all candidate paths reference `Electron.app/Contents/MacOS/Electron` which is the macOS bundle layout. On Windows it would be `electron.exe` in a different structure; on Linux it would be just `electron` binary.
2. **`repair_macos_electron_framework_layout()`** — properly `#[cfg(target_os = "macos")]` with a no-op on other platforms ✅
3. **Electron resolution will fail** on Windows/Linux unless `RESONANTOS_ELECTRON` env var is set manually

**Impact:** Visible browser host (Electron-based) will fail to start on Windows/Linux without manual env var configuration.

---

### 2.4 MEDIUM — `hermes_service.rs` (`home_dir()` lacks Windows fallback)

**File:** `src-tauri/src/hermes_service.rs:653`  
**Severity:** 🟡 MEDIUM

```rust
fn home_dir() -> PathBuf {
    env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}
```

On Windows, `$HOME` is typically not set. This will fall back to `"."` (current directory), which could work but is unpredictable. Compare with `host_state.rs` which correctly does:
```rust
fn user_home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}
```

**Impact:** Hermes profile home resolution will use the current working directory on Windows instead of the user's home. This could cause profile creation in unexpected locations.

---

### 2.5 MEDIUM — `browser_service.rs` (Playwright cache path macOS-only)

**File:** `src-tauri/src/browser_service.rs:659-660`  
**Severity:** 🟡 MEDIUM

```rust
let playwright_cache = home.join("Library").join("Caches").join("ms-playwright");
```

The Playwright cache directory follows macOS conventions (`~/Library/Caches/ms-playwright`). On Windows it should be `%LOCALAPPDATA%\ms-playwright`, on Linux `~/.cache/ms-playwright`.

**Impact:** Auto-discovery of Playwright-managed Chromium binaries will fail on Windows/Linux. The user would need to set `RESONANTOS_CHROMIUM_PATH` manually or have a system-level Chrome/Chromium installed.

---

### 2.6 MEDIUM — `browser_service.rs` (Chromium binary discovery paths)

**File:** `src-tauri/src/browser_service.rs:650-657`  
**Severity:** 🟡 MEDIUM

The hardcoded Chromium candidate list is macOS-only:
```rust
let candidates = [
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];
```

Missing:
- **Windows:** `C:\Program Files\Google\Chrome\Application\chrome.exe`, `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
- **Linux:** `/usr/bin/google-chrome`, `/usr/bin/chromium-browser`, `/usr/bin/chromium`, `/snap/bin/chromium`

**Impact:** Headless browser sessions will fail on Windows/Linux unless `RESONANTOS_CHROMIUM_PATH` is set or Playwright has been installed (and even then, see issue 2.5 above).

---

### 2.7 MEDIUM — `opencode_service.rs` (app binary fallback macOS-only)

**File:** `src-tauri/src/opencode_service.rs:328-335`  
**Severity:** 🟡 MEDIUM

```rust
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
```

Only macOS has a fallback app-bundle path. Windows/Linux rely entirely on `which`/`where` in `$PATH`.

**Impact:** Low — if OpenCode is installed but not in PATH on Windows/Linux, it won't be found. Minor issue since most users install CLI tools in PATH.

---

### 2.8 LOW — `camofox_overlay_macos.rs` (overlay is macOS-only by design)

**File:** `src-tauri/src/camofox_overlay_macos.rs`  
**Severity:** 🟢 LOW (correctly gated)

The entire module is wrapped in `#[cfg(target_os = "macos")]`. The integration module (`camofox_integration.rs`) correctly handles non-macOS with no-op stubs:

```rust
#[cfg(not(target_os = "macos"))]
{
    let _ = (&request.x, &request.y, &request.width, &request.height);
}
```

**Impact:** CamoFox window overlay positioning is silently skipped on non-macOS. The CamoFox browser process still launches and Marionette still works — just no visual overlay coordination. This is acceptable for Phase 1 but will need platform-specific window management for production.

---

### 2.9 LOW — `terminal_service.rs` (default shell is `zsh` on non-Windows)

**File:** `src-tauri/src/terminal_service.rs:200`  
**Severity:** 🟢 LOW

```rust
.unwrap_or_else(|| {
    if cfg!(target_os = "windows") {
        "cmd".to_string()
    } else {
        "zsh".to_string()
    }
});
```

Falls back to `zsh` if `$SHELL` is not set. On Linux, `bash` is more universally available than `zsh`. However, `$SHELL` is almost always set on Unix systems, so this rarely triggers.

**Impact:** Minimal — edge case only. Could use `/bin/sh` as the ultimate fallback for safety.

---

### 2.10 LOW — `setup-camofox.sh` (bash script, cross-platform aware)

**File:** `scripts/setup-camofox.sh`  
**Severity:** 🟢 LOW

The script handles macOS, Linux, and Windows (Git Bash/MSYS2) for CamoFox binary discovery. However:
- `stat -f%z` (macOS) vs `stat -c%s` (Linux) is handled with fallback ✅
- `shasum` vs `sha256sum` is handled ✅
- Windows users running PowerShell (not Git Bash) won't be able to use this script

---

## 3. Cargo.toml Analysis

**No platform-specific dependencies.** All dependencies are cross-platform:

| Dependency | Cross-platform? | Notes |
|------------|-----------------|-------|
| `tauri` 2 | ✅ | Core framework, handles all 3 platforms |
| `portable-pty` 0.8 | ✅ | Cross-platform PTY (ConPTY on Windows) |
| `rusqlite` (bundled) | ✅ | Bundles SQLite C library |
| `reqwest` (rustls-tls) | ✅ | Uses rustls (no OpenSSL dependency) |
| `libloading` 0.8 | ✅ | Cross-platform dynamic library loading |
| `tungstenite` 0.24 | ✅ | Pure Rust WebSocket |
| `serde`, `serde_json`, `sha2`, `futures-util` | ✅ | Pure Rust |

**Notable:** `resonator_control` crate (used by `resonator_service.rs`) is NOT in Cargo.toml — confirming it's not compiled. When enabled, it would need platform-specific dependencies.

---

## 4. Tauri Config Analysis

**File:** `src-tauri/tauri.conf.json`

| Setting | Value | Platform Impact |
|---------|-------|-----------------|
| `bundle.targets` | `"all"` | Builds for all platforms ✅ |
| `bundle.icon` | `.icns` + `.ico` + `.png` | All platforms covered ✅ |
| `bundle.resources` | `../addons/resonant-browser-host`, `../build/native-browser` | `native-browser` only has macOS artifacts |
| `app.security.csp` | `null` | Same across platforms ✅ |
| `build.beforeDevCommand` | `node scripts/ensure-dev-server.mjs` | Cross-platform ✅ |

**Issue:** `bundle.resources` includes `../build/native-browser` which only contains macOS-built CEF artifacts. On Windows/Linux builds, this directory will be empty (build-native-browser.mjs skips non-Darwin). The bundle step may warn or fail if the directory doesn't exist.

---

## 5. Frontend (Vite + React) Analysis

**No platform-specific code.** The frontend is pure React/TypeScript with standard web dependencies. `vite.config.ts` and `package.json` are platform-agnostic. The Tauri API layer handles platform differences transparently.

---

## 6. Scripts Analysis

| Script | macOS | Windows | Linux |
|--------|-------|---------|-------|
| `setup-camofox.sh` | ✅ | ⚠️ Git Bash only | ✅ |
| `build-native-browser.mjs` | ✅ | ❌ Skips | ❌ Skips |
| `ensure-dev-server.mjs` | ✅ | ✅ | ✅ |

---

## 7. Hardcoded Path Analysis

| File | Path | Issue | Severity |
|------|------|-------|----------|
| `browser_service.rs:650-657` | `/Applications/*.app` | macOS-only Chromium candidates | 🟡 MEDIUM |
| `browser_service.rs:659` | `~/Library/Caches/ms-playwright` | macOS-only Playwright cache | 🟡 MEDIUM |
| `opencode_service.rs:329` | `/Applications/OpenCode.app/...` | macOS-only app bundle | 🟡 MEDIUM |
| `camofox_service.rs:58` | `~/Library/Caches/camoufox/...` | Properly `#[cfg]` gated ✅ | ✅ OK |
| `camofox_service.rs:68` | `%LOCALAPPDATA%/camoufox/...` | Properly `#[cfg]` gated ✅ | ✅ OK |
| `camofox_service.rs:82` | `~/.cache/camoufox/...` | Properly `#[cfg]` gated ✅ | ✅ OK |
| `host_state.rs:407` | `/Users/example` | Test-only ✅ | ✅ OK |
| `archive_service/archive_runtime.rs:518-523` | `/Users/example/Documents/...` | Test-only ✅ | ✅ OK |

---

## 8. Summary of All `#[cfg]` Gates

### Properly Gated (✅ Good)

| Location | Gate | Purpose |
|----------|------|---------|
| `camofox_service.rs:52/65/76` | `target_os = "macos"/"windows"/not(any(...))` | Binary discovery — all 3 platforms ✅ |
| `camofox_service.rs:98/104` | `target_os = "windows"` | Profile home fallback ✅ |
| `camofox_integration.rs:29/38/56/65/83` | `target_os = "macos"` / `not(...)` | Overlay positioning with no-op fallback ✅ |
| `camofox_overlay_macos.rs:11` | `target_os = "macos"` | Entire module gated ✅ |
| `lib.rs:556/563/575/579/588/592` | `target_os = "macos"` / `not(...)` | NSView vs Tauri webview ✅ |
| `lib.rs:614/624/633/642` | All 3 + fallback | `browser_native_attach_smoke` ✅ |
| `terminal_service.rs:122/131` | `target_os = "windows"` | `cmd` vs `sh` ✅ |
| `obsidian_service.rs:1013/1016/1019` | All 3 platforms | `open` / `cmd start` / `xdg-open` ✅ |
| `browser_host_service.rs:385/415/437` | `target_os = "macos"` / `not(...)` | Electron framework repair ✅ |

### Missing or Incomplete Gates (❌ Issues)

| Location | What's Missing | Impact |
|----------|---------------|--------|
| `resonator_service.rs` (entire file) | No `#[cfg]` at all — `MacOSControl::new()` everywhere | 🔴 Won't compile on Win/Linux |
| `browser_service.rs:650-657` | Chromium candidate paths lack Win/Linux entries | 🟡 Browser won't auto-discover |
| `browser_service.rs:659` | Playwright cache path is macOS-only | 🟡 Playwright Chromium won't auto-discover |
| `hermes_service.rs:653` | `home_dir()` only checks `$HOME` | 🟡 Wrong dir on Windows |
| `browser_host_service.rs` (Electron resolution) | Candidates are all macOS `.app` bundle paths | 🟠 Visible host won't start on Win/Linux |

---

## 9. Recommended Priorities for Cross-Platform Work

### Priority 1 — Must Fix Before Windows/Linux Release

| # | Issue | Effort | Files |
|---|-------|--------|-------|
| 1 | Add Windows/Linux Chromium binary candidates to `browser_service.rs` | Low (30 min) | `browser_service.rs` |
| 2 | Add Playwright cache paths for Windows/Linux | Low (15 min) | `browser_service.rs` |
| 3 | Fix `hermes_service.rs::home_dir()` to include `$USERPROFILE` fallback | Low (5 min) | `hermes_service.rs` |
| 4 | Add Windows/Linux Electron path candidates to `browser_host_service.rs` | Medium (1 hr) | `browser_host_service.rs` |

### Priority 2 — Required Before Enabling Uncompiled Modules

| # | Issue | Effort | Files |
|---|-------|--------|-------|
| 5 | Platform-abstract `resonator_service.rs` with `#[cfg]` or trait | High (4-8 hrs) | `resonator_service.rs`, new platform impl files |
| 6 | CEF/native browser build for Windows/Linux | Very High (weeks) | `build-native-browser.mjs`, `CMakeLists.txt`, new source files |

### Priority 3 — Nice to Have

| # | Issue | Effort | Files |
|---|-------|--------|-------|
| 7 | Add Windows/Linux OpenCode app-bundle fallback paths | Low (15 min) | `opencode_service.rs` |
| 8 | Change terminal default shell from `zsh` to `/bin/sh` fallback | Trivial (2 min) | `terminal_service.rs` |
| 9 | Cross-platform CamoFox window overlay (wmctrl on Linux, Win32 API) | High (days) | New files, `camofox_integration.rs` |
| 10 | PowerShell version of `setup-camofox.sh` | Medium (2 hrs) | New script |

---

## 10. What's Done Well

1. **`camofox_service.rs`** — Exemplary cross-platform code. All three platforms have proper binary discovery with `#[cfg]` gates.
2. **`obsidian_service.rs`** — `open_external_url()` covers macOS (`open`), Windows (`cmd /C start`), and Linux (`xdg-open`).
3. **`terminal_service.rs`** — Uses `portable-pty` for cross-platform PTY, proper `cmd`/`sh` selection.
4. **`host_state.rs`** — `user_home_dir()` correctly checks both `$HOME` and `$USERPROFILE`.
5. **`lib.rs`** — Native browser attach smoke test covers all 3 platforms plus fallback.
6. **Cargo.toml** — All dependencies are cross-platform; `rustls-tls` avoids OpenSSL dependency.
7. **`browser_service.rs`** non-macOS webview — Complete Tauri `WebviewBuilder` implementation for Windows/Linux.
8. **`paperclip_service.rs`** — Proper `which`/`where` platform selection for binary resolution.

---

## 11. Overall Platform Verdicts

### macOS: ✅ PASS
- All features work
- Primary development and test target
- Native browser embedding via CEF + NSView
- CamoFox overlay via AppleScript
- All binary discovery paths populated

### Windows: ⚠️ CONDITIONAL PASS  
**Conditions for full pass:**
1. Fix `hermes_service.rs::home_dir()` (5 min)
2. Add Chromium candidates for Windows (30 min)
3. Add Electron path candidates for Windows (1 hr)
4. Do NOT enable `resonator_service.rs` without platform abstraction

**What works today:** Core app, terminal, delegation, archive, obsidian, provider service, memory service, paperclip, headless browser (if `RESONANTOS_CHROMIUM_PATH` is set), CamoFox process (no overlay)

**What doesn't work:** Native CEF browser embedding, CamoFox window overlay, visible browser host (without `RESONANTOS_ELECTRON` env), auto Chromium discovery, Hermes (wrong home dir)

### Linux: ⚠️ CONDITIONAL PASS  
**Conditions for full pass:**
1. Add Chromium candidates for Linux (30 min)
2. Add Electron path candidates for Linux (30 min)
3. Add Playwright cache path for Linux (15 min)
4. Do NOT enable `resonator_service.rs` without platform abstraction

**What works today:** Same as Windows, plus: Hermes home directory (Linux has `$HOME`), CamoFox binary discovery works, Unix PTY natively supported

**What doesn't work:** Same as Windows minus the `$HOME` issue

---

## 12. Risk Summary

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|------------|
| Windows build breaks if `resonator_service` enabled | 🔴 Critical | 100% | Don't enable without platform abstraction |
| No headless browser on Win/Linux without env var | 🟠 High | 90% | Add platform-specific binary candidates |
| Visible browser host fails on Win/Linux | 🟠 High | 95% | Add Electron path candidates |
| Hermes uses wrong directory on Windows | 🟡 Medium | 80% | Add `$USERPROFILE` fallback |
| Native CEF browser embedding unavailable | 🟡 Medium | 100% | By design — Tauri fallback exists |
| Bundle step fails from empty native-browser dir | 🟢 Low | 30% | Create empty placeholder or conditionally include |

---

*Report generated by QA-Platform subagent. All 26 Rust source files in `src-tauri/src/` were examined, plus Cargo.toml, tauri.conf.json, vite.config.ts, package.json, and all 3 scripts.*
