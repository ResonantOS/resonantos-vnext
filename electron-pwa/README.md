# ResonantOS Electron PWA

Lightweight Electron wrapper that runs the ResonantOS browser-first extension as a
standalone desktop app. PWA-style — frameless, native feel.

## What this is

This is **not** the full Tauri/React desktop shell. It wraps the existing
`browser-first/resonantos-side-panel-extension` code so you can use ResonantOS
without a browser.

## How it works

```
Electron main process
  ├─ Spawns: browser-first/host/run-browser-first.mjs --bridge-only=true
  │    └─ Writes:  browser-first/.../src/bridge-config.generated.js
  │    └─ Listens: http://127.0.0.1:47773  (bridge API)
  │
  ├─ Loads extension: session.defaultSession.loadExtension(extRoot)
  │    └─ Gives stable chrome-extension://ID/... origin
  │    └─ All chrome.* APIs (storage, runtime, etc.) are live
  │
  └─ Opens BrowserWindow → chrome-extension://ID/src/main-workspace.html
       └─ Frameless, traffic-light controls on macOS
       └─ System tray (minimize to tray, right-click menu)
       └─ Window state persisted across restarts
```

## Install deps

```bash
cd electron-pwa
npm install
```

## Run (dev)

From the repo root:

```bash
npm run electron-pwa:dev
```

Or directly:

```bash
node electron-pwa/start.mjs
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `RESONANTOS_ALPHA_KEY` | API key forwarded to the bridge (Groq / OpenRouter) |
| `RESONANTOS_BROWSER_FIRST_BRIDGE_PORT` | Override bridge port (default: 47773) |

## Build / package

```bash
npm run electron-pwa:build
# or
bash electron-pwa/build.sh
```

Output lands in `dist/electron-pwa/`.

## Architecture decisions

| Decision | Rationale |
|----------|-----------|
| `session.defaultSession.loadExtension()` | Full chrome.* API support with no shimming |
| `bridge-only=true` mode | Starts HTTP bridge without browser; Electron is the browser |
| Frameless + titleBarStyle hidden | Native PWA feel on macOS |
| Tray instead of full quit on close | App stays alive for background tasks |
| Single instance lock | Prevent two competing bridge processes |
| No `nodeIntegration: true` | Security; all extension code stays in its sandbox |
| `sandbox: false` | Required for extension loading to work correctly |

## Security notes

- `nodeIntegration: false` everywhere
- `contextIsolation: true` everywhere
- The preload script exposes only: `platform`, `windowControl()`, `openSidePanel()`
- Bridge server binds to `127.0.0.1` only
- Extension loaded from local filesystem only

## Side panel

Click **Open Sidebar** inside the workspace, or right-click the tray icon →
**Open Side Panel**. This opens a secondary 420×760 window loaded from
`chrome-extension://ID/src/side-panel.html`.

## Troubleshooting

**Bridge timeout:** Make sure `browser-first/host/run-browser-first.mjs` can find
Node.js on `$PATH`. The bridge is spawned as `node <script> --bridge-only=true`.

**Extension not loading:** Check that
`browser-first/resonantos-side-panel-extension/manifest.json` exists.

**White window:** Open DevTools (`Cmd+Option+I`) and check the console for CSP
errors or missing resources.
