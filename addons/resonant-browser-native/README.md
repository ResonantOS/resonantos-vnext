# Resonant Browser Native Host

Intent citation: `docs/architecture/ADR-025-native-embedded-browser-host.md`

This add-on directory is reserved for the native embedded Chromium Browser host.

The goal is not to launch an external browser window. The host must attach a Chromium-class view inside the ResonantOS center workspace and expose a single live session shared by the human and Augmentor.

## Hard Requirements

- Embedded center-workspace rendering.
- Shared human/AI live session.
- Deterministic control tools: open, read, click, type, scroll, capture, close.
- Extension lifecycle tools: install, list, enable, disable, pin where supported.
- Phantom Wallet compatibility.
- Bitwarden compatibility.
- Human approval and audit for wallet/signing and credential-sensitive actions.
- Cross-platform packaging for macOS, Windows, and Linux.

## Candidate Engine

Initial candidate: CEF with Chrome Runtime enabled.

CEF is accepted as the primary macOS implementation candidate only to the level currently proven by deterministic tests: embedded rendering, basic Manifest V3 content-script execution, and Phantom provider injection. If CEF cannot satisfy extension popups, wallet confirmation, persistent state, Bitwarden, or cross-platform packaging, this add-on must move to a Chromium-source or Chrome-compatible host strategy rather than hiding the limitation behind UI.

## Current Status

The first macOS ARM64 CEF host binary now compiles locally and passes deterministic native smoke tests.

The external smoke test boots CEF Chrome Runtime, loads `https://example.com/`, observes a main-frame HTTP 200, and exits with status `0`.

The embedded smoke test loads `libResonantBrowserNativeBridgeShared.dylib`, creates a real macOS `NSWindow`/`NSView`, attaches CEF into that view, observes a main-frame HTTP 200, and exits with status `0`.

The extension-entrypoint smoke test opens `chrome://extensions` and the Chrome Web Store target. On the current test machine, `chrome://extensions` loads successfully, while the Chrome Web Store redirects to Google's consent gate before extension browsing.

The local extension smoke test loads a temporary unpacked Manifest V3 extension through Chromium's extension flags, opens `https://example.com`, and verifies that the extension content script executes by observing the page title change from the native host. This proves the CEF candidate can execute at least a basic unpacked Chrome extension.

The Phantom smoke test loads the locally installed Phantom unpacked extension (`bfnaelmomeimhlpmgjnjophhpkkoljpa`) and verifies Solana provider injection on `https://example.com` through `window.phantom.solana.isPhantom` / `window.solana.isPhantom`. This proves the minimum browser-extension mechanism DAO pages need in order to detect Phantom.

It is still not product-ready because the extension UI, account persistence, wallet-connection approval, signing confirmation, and Bitwarden credential flows have not been proven. The embedded CEF path currently logs that Chrome style is not supported for the child browser, so popup and confirmation behavior require dedicated tests before DAO wallet workflows can be considered safe.

ResonantOS now routes the Browser workspace to the native CEF bridge first. The Tauri OS webview remains only a fallback when `browser_native_webview_show` fails. Any regression that makes the default Browser path use the Tauri webview or screenshot preview should fail tests.

The in-process bridge now exposes same-session input primitives:

- `resonant_browser_native_click_json`
- `resonant_browser_native_type_text_json`
- `resonant_browser_native_scroll_json`

Rust/Tauri exposes these as host commands:

- `browser_native_webview_click`
- `browser_native_webview_type_text`
- `browser_native_webview_scroll`

The native input smoke test proves those actions operate on the same embedded CEF session by loading one local HTML page, clicking a button, focusing an input, typing text, scrolling, and verifying page-observed state changes. Text insertion currently uses a host-mediated DOM insertion path after focus is established; sensitive typing must remain human-approved.

The current attach smoke test intentionally blocks the external-host path on macOS. Tauri can expose the app `NSView`, but an external CEF executable cannot safely attach to that process-local view pointer. The next product implementation must move from an external executable to in-process CEF/native integration owned by the Tauri process.

This directory now contains the first CEF Chrome Runtime source scaffold:

- `native_host/CMakeLists.txt`
- `native_host/include/resonant_browser_native_bridge.h`
- `native_host/src/resonant_browser_native_bridge.cc`
- `native_host/src/resonant_browser_native_host.cc`
- `native_host/src/resonant_browser_native_host_mac.mm`
- `scripts/probe-native-host.mjs`
- `scripts/audit-browser-addon-drift.mjs`
- `test/native-cef-smoke.test.mjs`
- `test/native-cef-embed.test.mjs`
- `test/native-host-contract.test.mjs`

macOS note: the native host uses Chromium's `use-mock-keychain` and `password-store=basic` flags for deterministic smoke/probe boot. Without that guard, CEF can block during `CefInitialize` on macOS Keychain lookup, which makes the test non-deterministic. Production credential and wallet flows must still go through explicit ResonantOS capability gates.

The next accepted implementation step is validating the bridge inside the packaged ResonantOS/Tauri window, then proving Phantom/Bitwarden compatibility. This directory exists to prevent new Browser work from drifting back into Electron sidecar or Tauri WebView workarounds.

Run the deterministic source-contract check with:

```bash
npm run test:browser-native
```

The native test suite currently includes:

- external CEF page-load smoke
- in-process macOS `NSView` embed smoke
- same-session click/type/scroll input smoke
- extension entrypoint smoke
- temporary unpacked Manifest V3 content-script smoke
- Phantom provider-injection smoke
- ADR/native-host contract checks

Resolve the current CEF binary candidate without downloading it:

```bash
npm run browser-native:cef:plan
```

Download/extract CEF only when ready to build the native host:

```bash
node addons/resonant-browser-native/scripts/fetch-cef.mjs --download
```

Compile work requires the extracted CEF binary distribution and `CEF_ROOT`:

```bash
cmake -S addons/resonant-browser-native/native_host -B addons/resonant-browser-native/build -DCEF_ROOT=/path/to/cef_binary
cmake --build addons/resonant-browser-native/build
```

The build now creates both the external CEF probe app and the in-process bridge library:

Current local build output:

```text
addons/resonant-browser-native/build/ResonantBrowserNativeHost.app/Contents/MacOS/ResonantBrowserNativeHost
addons/resonant-browser-native/build/libResonantBrowserNativeBridge.a
addons/resonant-browser-native/build/libResonantBrowserNativeBridgeShared.dylib
```

Build and stage packaged assets with:

```bash
npm run browser-native:build
```

This command writes Tauri-ready generated artifacts into `build/native-browser/`:

```text
build/native-browser/libResonantBrowserNativeBridgeShared.dylib
build/native-browser/ResonantBrowserNativeHost.app.zip
```

The host app is intentionally zipped. Chromium's `.framework` bundle must stay structurally intact, and direct Tauri resource recursion can mis-handle framework internals. Rust unpacks the zip at runtime before initializing CEF.

Run the native smoke directly:

```bash
addons/resonant-browser-native/build/ResonantBrowserNativeHost.app/Contents/MacOS/ResonantBrowserNativeHost --resonantos-smoke --url=https://example.com
```
