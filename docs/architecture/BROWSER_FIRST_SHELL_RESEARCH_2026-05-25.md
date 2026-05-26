# Browser-First Shell Research - 2026-05-25

Intent citation: `docs/architecture/ADR-037-browser-first-chromium-resonantos.md`

## Decision Question

Which browser shell strategy should ResonantOS use to become one Comet-style browser app that contains ResonantOS functionality and supports Phantom Wallet in the same browser profile?

## Product Gates

The shell candidate must satisfy these gates before product adoption:

- one browser app, not an external browser controlled by ResonantOS
- real tabs, address bar, navigation, scrolling, clicking, typing, profile persistence
- Chrome-compatible extension install/load path
- Phantom extension UI opens inside the browser chrome
- Phantom injects `window.phantom.solana` into a local dApp fixture
- wallet connect/sign requests require human approval
- Augmentor can read/navigate/click/type the active tab through typed audited tools
- macOS, Windows, and Linux packaging is plausible

## Source Evidence

### Comet Direction

Perplexity Comet's help center states that Comet is built on Chromium and compatible with most Chrome Web Store extensions. This supports the product model: a Chromium browser with AI capabilities inside browser chrome, not a dashboard with a weak embedded browser.

Source: <https://comet-help.perplexity.ai/en/articles/11734716-extensions>

### Phantom Requirement

Phantom's official documentation says Phantom is a browser extension, recommends Google Chrome, and says it works in other Chromium-based browsers such as Brave, Opera, and Microsoft Edge, though those are not officially supported at the same level as Chrome. Phantom also expects a toolbar icon and extension UI.

Source: <https://help.phantom.com/hc/en-us/articles/4412436271635-How-to-download-Phantom-on-desktop>

### Chrome Side Panel Model

Chrome's side panel API is MV3-only, requires the `sidePanel` permission, and hosts extension UI alongside web content. This matches the ResonantOS side-panel architecture for Augmentor.

Source: <https://developer.chrome.com/docs/extensions/reference/sidePanel/>

### Electron Limitation

Electron's official documentation says Electron supports only a subset of Chrome extension APIs and that matching Chrome extension implementation perfectly is a non-goal. It also supports only unpacked extensions and does not remember loaded extensions automatically unless the app loads them again.

Source: <https://www.electronjs.org/docs/latest/api/extensions/>

### WebView2 Limitation

Microsoft WebView2 can add unpacked extensions to a profile, but official API documentation says extensions with UI interactions can be loaded yet have missing UI entry points because WebView2 lacks browser UI elements to host them. That is a blocker for Phantom as a wallet extension with popup/toolbar UI.

Source: <https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2profile7>

### Qt WebEngine State

Qt WebEngine now exposes `QWebEngineExtensionManager` for filesystem-loaded Chrome extensions, but this is a newer API surface and does not by itself prove Chrome Web Store, Phantom popup, or wallet signing compatibility. Older Qt documentation and project history show extension support was historically incomplete or internal.

Sources:

- <https://doc.qt.io/qt-6/qwebengineextensionmanager.html>
- <https://wiki.qt.io/QtWebEngine/ScriptsAndExtensions>

### CEF / Chrome Runtime

CEF's runtime documentation distinguishes Chrome Runtime from Alloy Runtime. Chrome Runtime provides Chrome UI/browser functionality, while Alloy provides less default browser functionality. This makes CEF Chrome Runtime a plausible candidate, but the exact extension UI and wallet approval flows must be tested.

Source: <https://cef-builds.spotifycdn.com/docs/126.1/cef__types__runtime_8h.html>

### Chromium Source

Chromium source contains the core extension system and Chrome-specific extension code. A Chromium-source browser shell is the most complete path for Chrome extension compatibility, but it has the highest build, maintenance, update, security, and packaging cost.

Source: <https://chromium.googlesource.com/chromium/src/+/HEAD/extensions/>

## Local Deterministic Evidence

Command run:

```bash
npm run test:browser-native
```

Result:

- 9 tests passed.
- CEF bridge embeds into a real macOS `NSView` and loads a page.
- Same embedded session accepts click, type, and scroll.
- CEF bridge loads Phantom into the embedded product session.
- CEF Chrome Runtime initializes and loads a real page.
- CEF records extension entrypoint readiness.
- CEF executes a local unpacked MV3 extension.
- CEF loads Phantom and injects the Solana provider.

Important limitation: these tests prove provider injection and same-session control. They do not yet prove Phantom popup UI, account persistence, wallet connect approval, or signing approval.

## Candidate Matrix

| Candidate | Phantom Extension Fit | One-App Browser Fit | AI Control Fit | Cross-Platform Fit | Risk |
|---|---:|---:|---:|---:|---|
| Chromium source browser fork | Highest | Highest | Highest | Medium | Very high maintenance |
| CEF Chrome Runtime shell | Medium-high, locally promising | High if embedded correctly | High | Medium | Extension popup/signing unknown |
| Electron BrowserView | Low | Medium | High | High | Officially incomplete extension API |
| WebView2 | Low-medium on Windows only | Low cross-platform | Medium | Low | Missing extension UI entry points |
| Qt WebEngine | Unknown/medium | Medium | Medium | Medium | New extension API, Phantom unproven |
| External Chrome/Brave CDP | High | Fails product requirement | High | Medium | Not one app |

## Recommendation

Use a two-step evidence ladder:

1. Continue the CEF Chrome Runtime proof because local tests already pass the hardest known low-level gates: embedded rendering, same-session control, MV3 content script execution, and Phantom provider injection.
2. If CEF fails Phantom popup, persistence, wallet connect, or signing approval tests, escalate to Chromium source browser fork. Do not return to Electron, WebView2, Tauri WebView, screenshots, or external Chrome as product solutions.

This is data-driven because CEF is the only candidate with local deterministic evidence inside this codebase, while Chromium source is the highest-confidence fallback if CEF cannot satisfy wallet UI.

## Next Tests Required

CEF must pass these before it can be selected as the implementation base:

- open Phantom extension UI inside the same browser app
- create/import/unlock a test Phantom wallet in a disposable profile
- persist the wallet state across restart
- load a local Solana dApp fixture
- detect `window.phantom.solana.isPhantom`
- trigger `connect()`
- trigger a signing request
- prove Augmentor can observe/block but cannot approve/sign
- run the same tests on Windows and Linux or document platform-specific blockers

## Interim Rule

Until those tests pass, the implementation base is **CEF Chrome Runtime candidate**, not final product architecture. The final fallback is **Chromium source browser fork**, not Electron or external Chrome.
