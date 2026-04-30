# ADR-025: Native Embedded Browser Host

## Status

Accepted on 2026-04-29.

## Decision

Resonant Browser will move to a **native embedded Chromium host** that renders inside the ResonantOS center workspace. The Electron sidecar is not a product implementation because it opens a separate OS window and cannot satisfy the embedded workspace requirement.

The selected direction is Option B: a native browser host integrated with the Tauri shell through a narrow Rust-owned boundary. The first candidate is CEF with Chrome Runtime enabled, but CEF is not automatically accepted as the final engine until Phantom Wallet and Bitwarden compatibility are proven.

## Why

The Browser add-on has three non-negotiable requirements:

- It must be visually embedded inside the ResonantOS center workspace.
- The human and Augmentor must operate the same live browser session.
- Phantom Wallet and Bitwarden must work as first-class browser extensions.

Electron proved useful as a control and packaging spike, but it failed the embedded requirement. Tauri WebView can embed in the workspace, but it is not full Chromium and cannot provide Chrome extension compatibility. CEF can embed Chromium, but extension support is limited unless the Chrome Runtime path satisfies the specific target extensions.

## Binding Rules

- Do not ship an Electron sidecar as Resonant Browser.
- Do not present screenshots, iframes, or external windows as the product browser.
- Do not claim Phantom or Bitwarden compatibility until a deterministic host test loads and exercises them.
- The native host must expose one live session shared by user input and AI control.
- Extension install and wallet actions must remain host-mediated and auditable.
- Browser implementation must remain an add-on, not a core ResonantOS dependency.

## Required Native Host Contract

The native host must expose:

- `browser.native.probe`
- `browser.native.bridge_probe`
- `browser.native.start`
- `browser.native.attach_smoke`
- `browser.native.attach_view`
- `browser.native.set_bounds`
- `browser.native.open_url`
- `browser.native.back`
- `browser.native.forward`
- `browser.native.reload`
- `browser.native.read_page`
- `browser.native.click`
- `browser.native.type`
- `browser.native.scroll`
- `browser.native.extension.install`
- `browser.native.extension.list`
- `browser.native.extension.enable`
- `browser.native.extension.pin`
- `browser.native.extension.disable`
- `browser.native.wallet.confirmation_state`
- `browser.native.close`

## Acceptance Tests

The Browser add-on is not complete until deterministic tests prove:

- The browser renders inside the ResonantOS center workspace, not in a separate window.
- The same live session accepts human clicks, human typing, and host-mediated AI actions.
- Navigation, tabs, scroll, zoom, and address-bar state work at 100% page scale.
- Chrome Web Store or equivalent trusted extension install path works.
- Phantom Wallet installs, opens, persists state, and exposes Solana wallet connection flows.
- Bitwarden installs, opens, persists state, and exposes login/autofill flows.
- Wallet signing requests require explicit human approval and are audited.
- Browser state survives workspace switching.
- macOS, Windows, and Linux packaging include all native runtime assets.

## Implementation Consequences

The current Electron host may remain only as a temporary research harness. It must not be launched automatically from the Browser workspace or represented as embedded.

The next implementation work is a native host spike that proves the hardest constraint first: embedded rendering plus Phantom/Bitwarden compatibility. If CEF cannot satisfy that, the Browser engine decision must escalate to a Chromium-source or Chrome-compatible host strategy before more UI is built.

Current implementation guardrail: ResonantOS exposes `browser_native_probe` and `browser_native_attach_smoke` before the native host is product-ready. The native add-on directory contains the CEF Chrome Runtime source scaffold, source-contract tests, and a locally buildable macOS ARM64 host binary.

The macOS ARM64 host now has real native CEF smoke tests. One boots the external CEF probe app, loads `https://example.com/`, verifies a main-frame HTTP 200 load, and exits with status `0`. Another opens Chromium extension entry points and records whether `chrome://extensions` and the Chrome Web Store are ready, blocked, or consent-gated. Another loads a temporary unpacked Manifest V3 extension and verifies content-script execution through a native title-change event. A final smoke loads the shared in-process bridge, creates a real macOS `NSWindow`/`NSView`, attaches CEF into that view, runs the Cocoa loop, verifies a main-frame HTTP 200 load, and exits with status `0`.

This proves native embedded CEF rendering is viable on the target machine, Rust/Tauri has a concrete C ABI to call, and the CEF candidate can execute a basic unpacked Manifest V3 extension. It does not yet prove Chrome Web Store installation, extension popup behavior, Phantom Wallet, or Bitwarden. On the current test machine, `chrome://extensions` loads but the Chrome Web Store target redirects to Google's consent gate, so Phantom Wallet and Bitwarden install/persistence remain blocked until dedicated extension install and persistence smokes pass.

Important CEF finding: CEF logs `Chrome style is not supported for this browser` when using the child-view embed path. Therefore the embedded path currently proves Chromium rendering, not full Chrome Runtime UI/extension behavior. Phantom Wallet and Bitwarden remain blocked until an extension-capable embedded strategy passes deterministic tests.

The smoke host disables macOS Keychain integration with Chromium's mock-keychain/basic-password-store flags. This is required for deterministic testing because CEF initialization can otherwise block inside macOS Keychain lookup. This does not grant production credential access; wallet and password-manager actions remain subject to the Browser add-on capability model.

The attach smoke test records a hard boundary discovered on macOS: Tauri can expose the app `NSView`, but that object pointer is process-local. An external CEF executable cannot safely attach to it. Therefore the compiled external host is useful only as a CEF build/probe artifact; the product Browser direction must move CEF/Chromium embedding into the Tauri process or another platform-native in-process integration.

The native add-on now includes an in-process C ABI bridge target. Rust/Tauri loads this bridge, prepares the macOS application before the Tauri shell starts, and calls attach/resize/close through narrow host commands. The probe must keep product readiness blocked until Phantom/Bitwarden smoke tests are present.

Packaging rule: the native host app must not be added directly to `tauri.conf.json` resources. Tauri's resource recursion can corrupt or misread Chromium `.framework` internals. The accepted packaging path is `npm run browser-native:build`, which stages the bridge dylib and a zipped `ResonantBrowserNativeHost.app` under `build/native-browser/`. ResonantOS bundles that stable staging directory and Rust unpacks the host zip before CEF initialization.

Alpha packaging rule: native Browser assets are optional until the host has cross-platform deterministic packaging. `npm run browser-native:build` may skip staging when the platform or ignored CEF vendor bundle is unavailable, allowing ResonantOS alpha packages to build without pretending the native Browser is product-ready. CI or local alpha builds may also set `RESONANT_SKIP_NATIVE_BROWSER=1` for an explicit skip. Dedicated native Browser verification must use `npm run browser-native:build:required` or set `RESONANT_BUILD_NATIVE_BROWSER=1`; in that mode missing CEF assets or unsupported platforms fail hard.
