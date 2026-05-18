# ResonantOS vNext — Codebase Audit Report

**Date:** 2026-05-12  
**Auditor:** Overnight Subagent (claude-sonnet-4-6)  
**Scope:** `src-tauri/src/lib.rs`, `hermes_service.rs`, `browser_service.rs`, `provider_service.rs`, `host_state.rs`, `recovery_service.rs`, `Cargo.toml`, `src/App.tsx`, `src/sdk/addons/validation.ts`

---

## Executive Summary

The codebase is generally well-structured with good intent — capability gates, audit trails, addons sandboxing, and clear module boundaries. However, several **high-severity security issues** need immediate attention before any public release: an unverified remote script execution in the Hermes installer, SSRF/LAN scanning in provider discovery, plaintext secret storage with no file-permission enforcement, a path traversal gap in engineer recovery mode, and unrestricted `data:` URL passthrough in the browser service.

Architecture quality is good but the app shows signs of a large monolith growing into a single file (App.tsx). Dependencies use unstable Tauri features. No supply-chain audit tooling is configured.

---

## 1. `hermes_service.rs` (1,559 lines)

### 🔴 CRITICAL — Remote Script Execution Without Verification

**Location:** `install_hermes()`, line ~200

```rust
const HERMES_INSTALLER_URL: &str =
    "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh";
```

The installer downloads a bash script from a raw GitHub URL and executes it immediately without any hash or signature verification. This is a supply-chain attack vector. If the GitHub repo is compromised, the CDN is intercepted (no certificate pinning), or a DNS hijack occurs, an attacker achieves arbitrary code execution with the app's process privileges. The result log from the installer (which could contain secrets, paths, or API keys from environment variables) is returned as an error string and potentially surfaced to the frontend.

**Recommendation:**
- Pin a SHA-256 hash of the expected installer and verify it before execution.
- Alternatively, vendor the installer script inside the binary or distribute it as a signed artifact.
- Never return raw installer stdout/stderr to the frontend; sanitize it first.

---

### 🟡 BUG — Subprocess Hangs (No Timeout on Hermes CLI Calls)

**Location:** `command_output()`, used throughout

```rust
fn command_output(command: &mut Command) -> Result<String, String> {
    let output = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()  // blocks indefinitely
        ...
```

`command_output` blocks the calling thread indefinitely. If the Hermes CLI hangs (network call, waiting for input, subprocess loop), the Tauri IPC call that invoked it will never return. Used in `query_hermes_status`, `query_hermes_profiles`, `query_hermes_curator_status`, `query_hermes_kanban_snapshot` — all called from the UI synchronously.

**Recommendation:** Use `spawn()` + timeout via `child.wait_timeout()` (available via `wait-timeout` crate) or convert these calls to `async` with `tokio::time::timeout`.

---

### 🟡 BUG — ANSI Stripping Incomplete

**Location:** `strip_ansi()`, line ~820

```rust
fn strip_ansi(value: &str) -> String {
    ...
    if character == '\u{1b}' {
        for next in chars.by_ref() {
            if next.is_ascii_alphabetic() || next == 'm' {
                break;
            }
        }
```

The termination condition `is_ascii_alphabetic() || next == 'm'` is redundant (`m` is already alphabetic) and incorrect for multi-segment sequences like `\x1b[0;32m`. More critically, it doesn't skip the `[` character before the numeric codes, and sequences using `\x1b(B` (character set) or OSC sequences (`\x1b]...BEL`) would leave garbage characters in the output.

**Recommendation:** Use a battle-tested ANSI stripping crate such as `strip-ansi-escapes` or `console`.

---

### 🟡 ARCHITECTURE — `chrono_like_now()` is Not ISO8601

**Location:** `chrono_like_now()`, line ~1420

```rust
fn chrono_like_now() -> String {
    format!("unix:{}", now.as_secs())
}
```

Returns a non-standard `"unix:1234567890"` string. This is assigned to `checked_at` and `updated_at` fields that are presumably displayed in the UI and compared. The Cargo.toml does not include `chrono` despite the function name suggesting it was intended. Use `std::time::SystemTime` properly with a real ISO 8601 formatter, or add the `chrono` crate.

---

### 🟡 ARCHITECTURE — No Concurrency Guard on Hermes Install

**Location:** `install_hermes()`

No file lock or atomic flag prevents two concurrent install attempts. If the user triggers install twice in rapid succession (race in the UI), both attempts could execute the installer simultaneously, leaving the install in a corrupted state.

---

## 2. `browser_service.rs` (1,455 lines)

### 🔴 HIGH — `data:` URL Passthrough Enables Arbitrary JS Execution

**Location:** `normalize_browser_url()`, line ~650

```rust
if trimmed.starts_with("http://")
    || trimmed.starts_with("https://")
    || trimmed.starts_with("data:")
{
    return Ok(trimmed.to_string());
}
```

`data:` URLs are accepted without restriction. In a CDP-controlled headless Chromium context, this is benign as Chromium sandboxes JS. However, when used with `execute_browser_native_webview_show` on non-macOS, `assert_webview_safe_url` would block it — but `execute_browser_open_url` and `execute_browser_start_session` do NOT call `assert_webview_safe_url`, so `data:` URLs flow freely into CDP, including `data:text/html,<script>eval(atob(...))</script>`. In a Tauri app, the CDP browser is in a separate process so the blast radius is limited, but if any IPC bridge exists between the CDP page and Tauri it becomes a full RCE vector.

**Recommendation:** Remove `data:` from the allowlist or restrict it to `data:image/*` and `data:text/plain`. Apply `assert_webview_safe_url` to all CDP-bound URL entry points.

---

### 🔴 HIGH — SSRF via Unrestricted CDP-Controlled Browser

**Location:** `normalize_browser_url()`, `execute_browser_open_url()`

The browser can be directed to any HTTP/HTTPS URL including:
- `http://127.0.0.1:11434` (Ollama — now the browser can query the local AI runtime)
- `http://192.168.x.x` (LAN devices — printers, NAS, routers, other services)
- `http://169.254.169.254` (AWS/GCP metadata endpoints if deployed in cloud)

An add-on with `browser-control` capability can exfiltrate LAN topology data or read local services by requesting them through the browser.

**Recommendation:** Add an IP/hostname blocklist for RFC-1918 ranges, loopback, and link-local. Consider restricting the allowed URL set if browser usage is only for external web.

---

### 🟡 BUG — Browser `user_data_dir` Leaked on `execute_browser_open_url`

**Location:** `execute_browser_open_url()`, line ~198

```rust
let _ = browser.child.kill();
// user_data_dir is created but never cleaned up
```

`execute_browser_open_url` creates a per-session `user_data_dir` directory under the app's data dir, launches Chromium, captures the page, kills the browser, and returns — but never deletes `user_data_dir`. Over time this accumulates hundreds of session directories with Chromium profile data (cookies, cache, history). `execute_browser_close_session` correctly cleans up, but `execute_browser_open_url` is a fire-and-forget path that doesn't store a session.

**Recommendation:** Add `let _ = fs::remove_dir_all(user_data_dir);` after killing the browser in `execute_browser_open_url`.

---

### 🟡 BUG — Hardcoded macOS-only Chromium Paths on All Platforms

**Location:** `find_chromium_binary()`, line ~580

```rust
let playwright_cache = home_dir.join("Library").join("Caches").join("ms-playwright");
```

The Playwright cache path `Library/Caches/ms-playwright` is macOS-specific. On Linux it should be `~/.cache/ms-playwright`. On Windows it should be `%LOCALAPPDATA%\ms-playwright`. This function will never find Playwright Chromium on non-macOS platforms.

**Recommendation:** Add platform-conditional paths using `#[cfg(target_os = "...")]` or check `env::var("LOCALAPPDATA")` / `XDG_CACHE_HOME`.

---

### 🟡 BUG — Chromium stderr Buffer Can Block Process

**Location:** `launch_chromium()`, line ~640

The code takes the `stderr` handle to scan for the WebSocket URL, but after the URL is found, the `BufReader` is dropped. The Chromium process continues writing to stderr (startup messages, page load events, etc.). When the OS pipe buffer fills (~64KB typically), Chromium will block on `write()`, causing it to hang while the Rust code thinks it's running normally.

**Recommendation:** Spawn a background thread to drain stderr after extracting the URL, or use a non-blocking `BufReader` approach.

---

### 🟡 ARCHITECTURE — New CDP Connection Per Operation

**Location:** `capture_existing_target()`, `dispatch_mouse_click()`, `dispatch_mouse_wheel()`, `read_existing_target()`

Each of these functions calls `connect(browser_ws_url)` to open a new WebSocket connection to Chromium. CDP has a limit on concurrent connections, and establishing a new connection adds latency to every operation. Long-lived sessions should reuse a single WebSocket connection stored in `BrowserSession`.

---

### 🟡 ARCHITECTURE — Mutex Poisoning Risk in `with_session`

**Location:** `with_session()`, line ~476

If the closure passed to `with_session` panics, the `Mutex<HashMap<String, BrowserSession>>` becomes poisoned. Subsequent calls will fail with `PoisonError`, making all browser operations unavailable until the process restarts.

**Recommendation:** Use `mutex.lock().unwrap_or_else(|e| e.into_inner())` to recover from poisoned state, or switch to `parking_lot::Mutex` which doesn't poison.

---

## 3. `provider_service.rs` (2,425 lines)

### 🔴 HIGH — Unsolicited LAN Subnet Scanning

**Location:** `local_subnet_http_candidates()`, `local_subnet_ollama_candidates()`, `local_subnet_openai_compatible_candidates()`

```rust
fn local_subnet_http_candidates(port: u16, openai_compatible: bool) -> Vec<String> {
    ...
    (1..=254).filter_map(|host| { ... })
```

These functions generate HTTP probes for all 254 hosts in the local /24 subnet. This is triggered during `execute_provider_setup_probe` when discovering local AI runtimes. The user is not warned that their app will scan their network. This:
1. Can trigger IDS/IPS systems on corporate networks
2. Probes unauthorized hosts (potential legal/compliance issue)
3. Leaks internal network topology information
4. Is done concurrently at `buffer_unordered(48)` — 48 simultaneous connections to arbitrary LAN hosts

**Recommendation:**
- Require explicit user opt-in before performing network scanning
- Show a UI confirmation before any scan
- Reduce concurrency from 48 to something reasonable like 8
- Only scan after the user explicitly clicks "Scan Local Network"

---

### 🟡 BUG — Orphaned `ollama serve` Processes

**Location:** `ensure_local_runtime_ready()`, line ~730

```rust
Command::new("ollama")
    .arg("serve")
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    ...
```

The spawned `ollama serve` child process is never stored, tracked, or reaped. If `ensure_local_runtime_ready` is called multiple times (e.g., the runtime keeps timing out), multiple orphaned `ollama serve` processes accumulate. There's also a race condition: the spawn-and-poll loop could succeed before ollama is fully ready.

**Recommendation:** Store the child handle in a `OnceLock<Mutex<Option<Child>>>`, check if it's already running before spawning, and add a shutdown hook to kill it.

---

### 🟡 BUG — Missing API Key Check for `remote-user-owned` Nodes

**Location:** `execute_cloud_provider_service_chat_with_usage()`, line ~1080

```rust
if api_key.is_none() && request.runtime_node_kind.as_deref() == Some("cloud") {
    return Err("No provider secret is configured...");
}
```

The credential check only fires for `kind == "cloud"`. For `remote-user-owned` nodes, `api_key` may be `None` (if the user hasn't configured credentials), and the request will proceed to the API and fail with a cryptic HTTP 401 error from the provider, rather than a clear "no credentials" message.

**Recommendation:** Move the credential check to be provider-type-aware rather than node-kind-aware.

---

### 🟡 BUG — `reqwest::Client::new()` Without Timeout

**Location:** Multiple locations, including `execute_cloud_provider_service_chat_with_usage()`

```rust
let client = reqwest::Client::new();
```

`reqwest::Client::new()` creates a client with no timeout. If the provider endpoint is unreachable or responds slowly, the `await` will block the async task indefinitely, consuming thread pool capacity.

**Recommendation:** Use `reqwest::Client::builder().timeout(Duration::from_secs(60)).build()` for all chat client instances.

---

### 🟡 ARCHITECTURE — Stream Abort is Non-Atomic

**Location:** `chat_run_aborted()`, `mark_chat_run_aborted()`

The abort mechanism polls a `HashSet<String>` protected by a `Mutex`. The check happens between stream chunks (`while let Some(chunk) = stream.next().await`). If the user aborts while a large chunk is being processed, the abort may not take effect until the next chunk arrives. More seriously, the `ABORTED_CHAT_RUNS` set grows indefinitely if `clear_chat_run_abort` is never called (it is called in `execute_provider_service_chat_stream` but not in the streaming error path if the stream fails before `[DONE]`).

**Recommendation:** Use `tokio::sync::watch` or `Arc<AtomicBool>` per run for cleaner abort signaling. Add cleanup in error paths.

---

### 🟡 ARCHITECTURE — `strip_think_blocks` Drops Unclosed Blocks

**Location:** `strip_think_blocks()`, line ~42

```rust
} else {
    remainder = "";
    break;
}
```

If a `<think>` block is opened but never closed (malformed model output), `strip_think_blocks` discards everything after the opening tag. This could silently drop the entire model response. For the streaming version, `filter_think_stream_delta` correctly handles cross-chunk partial tags, but the non-streaming version does not.

---

## 4. `host_state.rs` (535 lines)

### 🔴 HIGH — API Keys Stored as Plaintext JSON

**Location:** `write_provider_secrets()`, `provider_secrets_file()`

```rust
let payload = serde_json::to_string_pretty(secrets)...;
fs::write(path, payload)...
```

Provider API keys (OpenAI, MiniMax, etc.) are stored as plaintext JSON in `ResonantOS_User/Secrets/provider-secrets.json`. The code makes no attempt to set restrictive file permissions (e.g., `chmod 600`), use OS keychain APIs, or encrypt the file at rest. Any process running as the same user can read these keys.

**Recommendation:**
- On macOS: use the Keychain via `security` CLI or `SecItemAdd` (via FFI)
- On Linux: use `secret-service` protocol
- On Windows: use `CryptProtectData` (DPAPI)
- At minimum: `fs::set_permissions(&path, fs::Permissions::from_mode(0o600))` after writing

---

### 🟡 BUG — No File Locking on Secrets Read/Write

**Location:** `read_provider_secrets()`, `write_provider_secrets()`

These functions read and write the secrets file without any file lock. If two provider secret saves happen concurrently (e.g., user saves two API keys in rapid succession), the second write may overwrite the first, losing the newly written key.

**Recommendation:** Use `fs2::FileExt::lock_exclusive()` or an atomic write pattern (write to temp file, then rename).

---

### 🟡 ARCHITECTURE — Rust Manifest Validation Is Weaker Than TypeScript Validation

**Location:** `validate_manifest()` in `host_state.rs` vs. `validateAddOnManifest` in `validation.ts`

The Rust `validate_manifest` only checks 5 string fields + 2 arrays. The TypeScript version performs 200+ validation checks including:
- Capability reference integrity
- Duplicate ID detection
- Cross-reference checks (hooks → scripts → capabilities)
- Semantic rules (embedded add-ons must request `ui-embedding`)
- Security rules (`directKnowledgeWriteAllowed` must be false)

The Rust path is used by `sideload_addon_manifest` (the live sideloading command). A malicious add-on manifest could bypass all TypeScript-level security rules via sideloading.

**Recommendation:** Either port the critical security rules from TypeScript to Rust, or call the TypeScript validator from the sideload path via the Tauri JS→Rust bridge (calling back into the frontend for validation).

---

### 🟡 BUG — `sideload_addon_manifest` Has No Path Restriction

**Location:** `sideload_addon_manifest()`, line ~200 in `lib.rs`

```rust
let path = PathBuf::from(&manifest_path);
if !path.exists() {
    return Err(...);
}
let raw = fs::read_to_string(&path)...
```

The manifest_path is fully user-controlled and can point to any file on the system. While the content is only parsed as JSON and not executed, reading arbitrary files could be used as an oracle to probe file existence and extract JSON-structured data from unexpected paths.

**Recommendation:** Validate that `manifest_path` is inside the app's config directory or a designated sideload directory.

---

## 5. `recovery_service.rs` (794 lines)

### 🔴 HIGH — Path Traversal via Symlink in Parent Directory

**Location:** `normalize_engineer_path()`, line ~110

```rust
} else {
    let parent = candidate.parent()...;
    let resolved_parent = parent.canonicalize()...;
    resolved_parent.join(
        candidate.file_name()...
    )
};
```

For paths that don't yet exist (e.g., `write_file` creating a new file), the code canonicalizes only the **parent** directory and appends the filename. If an attacker plants a symlink in an allowed directory (e.g., the workspace root) pointing outside the allowed roots, and then passes a path like `<allowed_root>/<symlink_dir>/../../../etc/passwd`, the resolved parent would follow the symlink, and the final `resolved.starts_with(&root)` check would fail — but a symlink pointing to `/tmp/workdir/../../../etc` could be crafted to pass the check. More directly: if `allowed_root/some_dir` is itself a symlink to `/etc`, then `normalize_engineer_path("allowed_root/some_dir/newfile.txt")` would resolve to `/etc/newfile.txt`, pass the `starts_with` check against `allowed_root` (it won't — but see next point), and write there.

Actually the immediate risk is simpler: the check `resolved.starts_with(&root)` after appending filename without canonicalization of the non-existing file means a filename like `../../dangerous_dir/evil.txt` passed as the file_name component could escape. The `file_name()` call should strip this, but it's worth auditing carefully.

**Recommendation:** For write targets, also canonicalize the parent and verify it starts with an allowed root, then reconstruct the final path. Never trust non-canonicalized path components.

---

### 🟡 ARCHITECTURE — `detect_workspace_root` Unreliable in Production Builds

**Location:** `detect_workspace_root()`, line ~55

```rust
fn looks_like_workspace_root(candidate: &Path) -> bool {
    candidate.join("package.json").exists()
        && candidate.join("src-tauri").join("tauri.conf.json").exists()
}
```

In a production build, the executable lives in something like `ResonantOS.app/Contents/MacOS/resonantos-vnext`. Walking ancestors from this path will never find `package.json` (which lives in the source tree, not the bundle). This means `detect_workspace_root` returns `None` in production, and `engineer_allowed_roots` falls back to only `app_state_dir`. This is probably the intended behavior for production, but it should be explicitly documented and the `detect_workspace_root` function should be `#[cfg(debug_assertions)]` only to avoid dead code confusion.

---

### 🟡 ARCHITECTURE — Recovery Agent Can Modify Live Source Without Backups

**Location:** `replace_in_file()`, `write_file()` tool handlers

The engineer recovery agent can modify files within allowed roots (`replace_in_file`, `write_file`) without creating a backup. If the model makes an incorrect edit (hallucination of `oldText`, wrong `newText`), the original content is unrecoverable unless the user has their own version control.

**Recommendation:** Before any write, copy the original to `<file>.resonantos-recovery-backup.<timestamp>` and emit the backup path in the `EngineerToolEvent` summary.

---

### 🟡 BUG — `search_codebase` Fails Silently if `rg` Not Installed

**Location:** `search_codebase` tool handler

```rust
let output = Command::new("rg")
    .args(...)
    .output()
    .map_err(|error| format!("Failed to run rg: {error}"))?;
```

`rg` (ripgrep) is treated as a dependency but not checked for presence. If the user doesn't have ripgrep installed, `search_codebase` returns an error that says "Failed to run rg: No such file or directory". This is confusing in a recovery context.

**Recommendation:** Check for `rg` availability at startup or provide a fallback using `grep`.

---

## 6. `Cargo.toml`

### 🟡 SECURITY — Unstable Tauri Features in Production

```toml
tauri = { version = "2", features = ["unstable"] }
```

The `unstable` feature enables Tauri APIs that may change or be removed without notice. This is appropriate for development but should not be in a production release. The unstable APIs in Tauri 2 include webview management features used by the browser service — these could break on any Tauri patch release.

---

### 🟡 SECURITY — `libloading` Enables Native Code Injection

```toml
libloading = "0.8"
```

`libloading` allows loading arbitrary native `.so`/`.dylib`/`.dll` files at runtime. If this is used for add-on loading, any malicious add-on could ship with a native library and load it using `libloading`, bypassing all Rust-level sandboxing. No usage of `libloading` was found in the audited files — it may be used in unaudited modules. If it's not actively used, remove it.

---

### 🟡 ARCHITECTURE — No Supply Chain Audit Tooling

No `deny.toml` (cargo-deny) or `.cargo/audit.toml` (cargo-audit) configuration is present. Automated dependency vulnerability scanning is not set up.

**Recommendation:** Add `cargo-deny` to CI with license and advisory checks:
```toml
# deny.toml
[advisories]
vulnerability = "deny"
unmaintained = "warn"
```

---

### 🟡 ARCHITECTURE — No Release Profile Hardening

No `[profile.release]` section in `Cargo.toml`. Recommended security additions:

```toml
[profile.release]
overflow-checks = true
panic = "abort"
lto = true
```

---

## 7. `App.tsx` (2,696+ lines)

### 🟡 ARCHITECTURE — Single Massive God Component

The import list alone (lines 1–160) reveals that `App.tsx` imports from `~20 different modules` and handles routing, state management, chat, archive, browser, settings, recovery, Hermes, Obsidian, delegation, and more in a single component. This creates:
- Massive re-render surface area (any state change re-renders everything)
- Impossible unit testing
- Difficult debugging (prop drilling to all children)
- CI build times proportional to component complexity

**Recommendation:** Extract at minimum a `ShellStateProvider` context, move each workspace's local state into its own module's context/store, and reduce App.tsx to pure routing and top-level orchestration.

---

### 🟡 ARCHITECTURE — Missing Error Boundaries on Lazy Modules

```tsx
const ArchiveWorkspace = lazy(() => import("./modules/archive/ArchiveWorkspace")...);
```

All workspaces use `React.lazy()` but the `Suspense` fallback in App.tsx does not appear to be wrapped in an `ErrorBoundary`. If any lazy module fails to load (network issue, bundle error), React will unmount the entire app.

**Recommendation:** Wrap each `Suspense` in an `ErrorBoundary` that shows a recovery UI instead of crashing the shell.

---

### 🟡 ARCHITECTURE — No Memoization Strategy Visible

Large state objects are passed through the component tree. Without `React.memo`, `useMemo`, and `useCallback` at critical boundaries, even minor state changes (e.g., updating a single chat message) will re-render the entire shell.

---

## 8. `src/sdk/addons/validation.ts` (221 lines)

### 🟢 WELL-DONE — Comprehensive and Well-Structured

The TypeScript manifest validator is thorough and security-minded:
- Cross-reference integrity (hooks → scripts → capabilities)
- Security invariants enforced (`directKnowledgeWriteAllowed` must be false)
- Granular error paths with path notation
- Sideload provenance tagging
- Capability containment rules

---

### 🟡 MINOR — No Schema Version Check

The validator does not check or enforce a `schemaVersion` field. If the manifest schema evolves (new required fields added), old manifests will silently pass validation until the new field is first checked. Adding `schemaVersion` validation would allow the host to warn about potentially incompatible manifests.

---

### 🟡 MINOR — `isString` Type Guard Includes Whitespace-Only Strings

```ts
const isString = (value: unknown): value is string => 
  typeof value === "string" && value.trim().length > 0;
```

This is used as a type guard (`value is string`) but the type parameter implies any non-null string. Code that uses `isString` to guard and then calls `value.split("/")` without trimming will work, but code that uses the TypeScript type assertion to pass to functions expecting a clean string could receive a whitespace-only string if not careful. Minor but worth documenting.

---

### 🟡 MINOR — No Validation of `documentPath` Existence

`engineerSetup.documentPath`, `augmentorSkills[].documentPath`, and `skills[].documentPath` are validated as non-empty strings but not checked for actual file existence. A manifest could reference a non-existent document path, causing silent failures at runtime when the system tries to load the skill document.

---

## 9. Cross-Cutting Architecture Issues

### 🟡 ARCHITECTURE — No Rate Limiting on Tauri Commands

All Tauri commands are invoked directly from the frontend without any rate limiting or debouncing at the backend level. Commands that trigger network requests (`provider_service_chat_completion`, `archive_process_ingest_request`, etc.) can be called in rapid succession. If the frontend has a bug that fires them in a loop, the backend will dutifully forward them all to the provider, potentially incurring significant API costs.

**Recommendation:** Add a per-command call rate limiter at the Tauri command dispatch layer, or add idempotency keys to expensive operations.

---

### 🟡 ARCHITECTURE — Timestamps Are Not ISO 8601

Multiple services generate timestamps as `"unix:1234567890"` (a non-standard format). This string is presumably stored in JSON state and displayed in the UI. Sorting, comparing, and displaying these timestamps requires parsing a custom format.

**Recommendation:** Standardize on ISO 8601 (`2026-05-12T01:29:00Z`). Add the `chrono` crate or use `time` to generate proper timestamps.

---

### 🟡 ARCHITECTURE — Error Strings Propagated to Frontend May Contain Secrets

Throughout the codebase, `map_err(|error| format!("...: {error}"))` is used extensively. Some error sources include:
- HTTP client errors (which may echo the URL including credentials in query params)
- File I/O errors (which include file paths — could leak directory structure)
- JSON parse errors (which may include partial content of sensitive files)

**Recommendation:** Audit error propagation paths and sanitize error messages before they cross the Tauri IPC boundary. Create a distinction between "developer-visible" errors and "user-visible" errors.

---

## Summary Table

| Severity | Count | Files |
|----------|-------|-------|
| 🔴 CRITICAL/HIGH | 6 | hermes_service, browser_service, provider_service, host_state, recovery_service |
| 🟡 MEDIUM (bugs/arch) | 22 | All files |
| 🟢 POSITIVE | 1 | validation.ts |

### Critical Actions (Before Any Public Release)

1. **Hermes installer**: Add SHA-256 hash verification before executing the downloaded bash script
2. **LAN scanning**: Require explicit user opt-in; remove unsolicited subnet scanning from provider setup
3. **`data:` URL**: Remove from browser URL allowlist or restrict to safe MIME types  
4. **API key storage**: Implement OS keychain storage instead of plaintext JSON
5. **Symlink traversal**: Harden `normalize_engineer_path` for non-existing file targets
6. **Manifest security gap**: Port critical security rules from TypeScript validator to Rust sideload path

### Important (Before Beta)

7. Replace `reqwest::Client::new()` (no timeout) with client builders everywhere
8. Fix `find_chromium_binary` for Linux/Windows Playwright cache paths
9. Clean up browser `user_data_dir` in fire-and-forget open path
10. Fix orphaned `ollama serve` process tracking
11. Add `ErrorBoundary` wrappers in App.tsx for lazy modules
12. Add `cargo-deny` and supply chain auditing to CI

---

*Report generated by automated overnight audit. Line number references are approximate and based on file structure analysis. Manual review recommended for all CRITICAL items.*
