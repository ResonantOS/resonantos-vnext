# Repo Index

A map of the visible repository structure for contributors and agents navigating the codebase.

## `.github/workflows`

- **Path:** `.github/workflows/`
- **Likely responsibility:** CI/CD pipeline definitions.
- **Contents observed:** `alpha-build.yml` — an alpha build workflow for producing platform artifacts (macOS, Windows, Linux).
- **Inspect for:** build automation, signing steps, platform matrix, artifact publishing, and release triggers.

## `addons`

- **Path:** `addons/`
- **Likely responsibility:** Add-on implementations and host integrations that run within or alongside the shell.
- **Subdirectories observed:**
  - `resonant-browser-host/` — browser embedding host (tests, scripts).
  - `resonant-browser-native/` — native browser build pipeline (CEF/vendor fetch, build scripts).
  - `insight-engine/` — insight engine add-on (Needs verification).
- **Inspect for:** add-on manifests, capability declarations, native binaries, and add-on-specific build tooling.

## `build/native-browser`

- **Path:** `build/native-browser/`
- **Likely responsibility:** Build output staging for the native embedded browser.
- **Contents observed:** `.gitkeep` placeholder; build artifacts are gitignored.
- **Inspect for:** browser build artifacts after a `npm run browser-native:build` run.

## `docs`

- **Path:** `docs/`
- **Likely responsibility:** Primary documentation surface — architecture decisions, project status, product specs, feature backlog, and agent workflows.
- **Key contents observed:**
  - `README.md` — docs entrypoint.
  - `PROJECT_STATUS.md` — implementation checkpoint and known gaps.
  - `FEATURE_BACKLOG.md` — active feature backlog.
  - `architecture/` — 30+ ADRs, module map, system diagrams, architecture audits, add-on templates, and operator KB.
  - `product/` — UX specs (app shell, glocal discovery, icon system).
  - `working/` — session context for reloadable working memory.
- **Inspect for:** current-state documentation, architectural decisions, and guidance for contributors.

## `examples`

- **Path:** `examples/`
- **Likely responsibility:** Runnable examples and reference implementations, primarily for the Living Archive MCP bridge and memory services.
- **Key contents observed:**
  - `living-archive-mcp.mjs` / `living-archive-mcp.test.mjs` — MCP bridge example and tests.
  - `living-archive-memory-service.mjs` / `living-archive-memory-service.test.mjs` — local memory service example and tests.
  - `reference-memory-service.mjs` — reference memory service implementation.
  - `addons/` — example add-on manifests (Needs verification).
- **Inspect for:** patterns for integrating with the Living Archive, MCP clients, and memory service consumers.

## `public`

- **Path:** `public/`
- **Likely responsibility:** Static assets served by the frontend dev server and bundled with the Tauri app.
- **Key contents observed:**
  - `addons/` — public add-on catalog manifests loaded at runtime (24+ manifest JSON files).
  - `icons/` — app and add-on icons.
- **Inspect for:** the add-on catalog registry, default add-on manifests, and capability declarations visible to the shell.

## `scripts`

- **Path:** `scripts/`
- **Likely responsibility:** Build automation and development tooling scripts.
- **Key contents observed:**
  - `build-native-browser.mjs` — native browser build orchestration.
  - `ensure-dev-server.mjs` — dev server health check.
  - `setup-camofox.sh` — Camofox browser integration setup.
- **Inspect for:** build pipeline entrypoints and environment setup.

## `src`

- **Path:** `src/`
- **Likely responsibility:** React/TypeScript frontend — the UI shell, core runtime logic, and add-on workspace host.
- **Key contents observed:**
  - `main.tsx` — application entrypoint.
  - `App.tsx` / `App.test.tsx` — root application component and tests.
  - `components/` — shared UI components (LoginGate, Panel, TokenGate).
  - `core/` — core runtime: chat engine, compute fabric, context memory, contracts, defaults, delegation, logician, memory provider, model strategy, policies, provider service, runtime, web transport.
  - `modules/` — feature modules: addons, archive, browser, chat, compute, delegation, hermes, insight-engine, obsidian, opencode, overview, paperclip, recovery, settings, shell, strategist, terminal.
  - `sdk/` — add-on SDK surface and resonant-context.
  - `styles/` — CSS modules and global styles.
  - `ui/` — UI primitives (Needs verification).
- **Inspect for:** frontend architecture, add-on workspace hosting, provider routing, and the runtime adapter pattern.

## `src-tauri`

- **Path:** `src-tauri/`
- **Likely responsibility:** Tauri v2 Rust backend — the native shell, host services, and IPC boundary.
- **Key contents observed:**
  - `Cargo.toml` — Rust crate manifest; depends on tauri 2, rusqlite, reqwest, tokio, tungstenite, portable-pty, sha2, resonator-control.
  - `tauri.conf.json` — Tauri app configuration.
  - `src/main.rs` — Rust entrypoint.
  - `src/lib.rs` — Tauri command registration and plugin setup.
  - `src/` — host services: archive_service, browser_host_service, browser_native_service, browser_service, camofox_service, compute_service, delegation_service, hermes_service, host_state, marionette_bridge, memory_service, obsidian_service, opencode_service, paperclip_service, provider_service, recovery_service, resonator_service, telegram_service, terminal_service.
  - `capabilities/` — Tauri capability declarations.
  - `icons/` — platform app icons.
  - `tests/` — Rust integration tests (Needs verification).
- **Inspect for:** the Rust host boundary, IPC commands, native service implementations, and capability/permission model.

## Root Configuration Files

| File | Likely Responsibility |
|------|----------------------|
| `package.json` | Node.js project manifest, scripts, dependencies (React 19, Tauri CLI, Vite, Vitest, Playwright, CodeMirror, xterm). |
| `tsconfig.json` | TypeScript compiler configuration. |
| `vite.config.ts` | Vite bundler configuration for the React frontend. |
| `index.html` | HTML entry point for the Vite dev server / Tauri webview. |
| `rust-toolchain.toml` | Rust toolchain version pinning. |
| `AGENTS.md` | Agent instructions — branch workflow, validation commands, commit policy. |
| `README.md` | Project-level README. |

---

*This index reflects the repo as observed. Entries marked "Needs verification" indicate areas not yet fully inspected. Update this file when new top-level directories are added or when responsibilities change.*
