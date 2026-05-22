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

## `crates`

- **Path:** `crates/`
- **Likely responsibility:** Rust workspace crates.
- **Contents observed:** `resonator-control/` — desktop control foundation for macOS backend.
- **Inspect for:** Rust-level desktop control integrations.

## `docs`

- **Path:** `docs/`
- **Likely responsibility:** Primary documentation surface.
- **Key contents observed:**
  - `README.md` — docs entrypoint with navigation and reading order.
  - `ARCHITECTURE.md` — current system behavior overview.
  - `PROJECT_STATUS.md` — implementation checkpoint and known gaps.
  - `FEATURE_BACKLOG.md` — active feature backlog.
  - `DOCUMENT_AUTHORITY_MODEL.md` — authority lanes and conflict resolution.
  - `KNOWLEDGE_RECONSTRUCTION_PLAN.md` — identified gaps, overlaps, and consolidation candidates.
  - `REPO_INDEX.md` — this file.
  - `adr/` — 32 Architecture Decision Records (ADR-001 through ADR-032).
  - `architecture/` — system topology docs: CODEMAP, MODULE_MAP, SYSTEM_BOUNDARIES, RUNTIME_SURFACES, VNEXT_SYSTEM_DIAGRAM, AUDIO2TOL_INTAKE_ANALYSIS, OPERATOR_KNOWLEDGE_BASE.
  - `templates/` — reusable documentation templates (addons, agents, runbooks, audits).
  - `audits/` — audit snapshots and audit process guidance.
  - `product/` — UX specs (app shell, glocal discovery, icon system).
  - `specs/` — formal specifications (currently a README stub).
  - `sdk/` — SDK documentation (Memory Provider SDK).
  - `agent-workflows/` — AI-assisted development conventions and docs refactor guardrails.
  - `working/` — session context for reloadable working memory.
  - `legacy/` — historical documents preserved for context (reports, QA, planning, experiments).
- **Inspect for:** current-state documentation, architectural decisions, historical context, and guidance for contributors.

## `examples`

- **Path:** `examples/`
- **Likely responsibility:** Runnable examples and reference implementations, primarily for the Living Archive MCP bridge and memory services.
- **Key contents observed:**
  - `living-archive-mcp.mjs` / `living-archive-mcp.test.mjs` — MCP bridge example and tests.
  - `living-archive-memory-service.mjs` / `living-archive-memory-service.test.mjs` — local memory service example and tests.
  - `reference-memory-service.mjs` — reference memory service implementation.
  - `addons/` — example add-on manifests.
- **Inspect for:** patterns for integrating with the Living Archive, MCP clients, and memory service consumers.

## `public`

- **Path:** `public/`
- **Likely responsibility:** Static assets served by the frontend dev server and bundled with the Tauri app.
- **Key contents observed:**
  - `addons/` — public add-on catalog manifests loaded at runtime (20+ manifest JSON files).
  - `icons/` — app and add-on icons.
- **Inspect for:** the add-on catalog registry, default add-on manifests, and capability declarations.

## `scripts`

- **Path:** `scripts/`
- **Likely responsibility:** Build automation and development tooling scripts.
- **Key contents observed:**
  - `build-native-browser.mjs` — native browser build orchestration.
  - `ensure-dev-server.mjs` — dev server health check.
  - `setup-camofox.sh` — Camofox browser integration setup.
- **Inspect for:** build pipeline entrypoints and environment setup.

## `server`

- **Path:** `server/`
- **Likely responsibility:** Hosted Express.js auth + API proxy backend (separate from the desktop app).
- **Inspect for:** companion service architecture, auth flow, API proxying.

## `src`

- **Path:** `src/`
- **Likely responsibility:** React/TypeScript frontend — the UI shell, core runtime logic, and add-on workspace host.
- **Key contents observed:**
  - `main.tsx` — application entrypoint.
  - `App.tsx` / `App.test.tsx` — root application component and tests.
  - `components/` — shared UI components (LoginGate, Panel, TokenGate).
  - `core/` — core runtime: chat engine, compute fabric, context memory, contracts (2,749 line type system), defaults, delegation, logician, memory provider, model strategy, policies, provider service, runtime (Tauri IPC wrappers), web transport.
  - `modules/` — feature modules: addons, archive, browser, chat, compute, delegation, hermes, insight-engine, obsidian, opencode, overview, paperclip, recovery, settings, shell, strategist, terminal.
  - `sdk/` — add-on SDK surface and resonant-context.
  - `styles/` — CSS modules and global styles.
- **Inspect for:** frontend architecture, add-on workspace hosting, provider routing, and the runtime adapter pattern.

## `src-tauri`

- **Path:** `src-tauri/`
- **Likely responsibility:** Tauri v2 Rust backend — the native shell, host services, and IPC boundary.
- **Key contents observed:**
  - `Cargo.toml` — Rust crate manifest.
  - `src/main.rs` — Rust entrypoint.
  - `src/lib.rs` — Tauri command registration (~85 commands, 1,560 lines).
  - `src/` — host services: archive_service, browser_service, browser_native_service, camofox_service, compute_service, delegation_service, hermes_service, host_state, memory_service, obsidian_service, opencode_service, paperclip_service, provider_service, recovery_service, terminal_service, and more.
  - `capabilities/` — Tauri capability declarations.
  - `icons/` — platform app icons.
- **Inspect for:** the Rust host boundary, IPC commands, native service implementations, and capability/permission model.

## `tests`

- **Path:** `tests/`
- **Likely responsibility:** Shell-level integration tests.
- **Inspect for:** end-to-end test scenarios.

## Root Configuration Files

| File | Responsibility |
|------|---------------|
| `package.json` | Node.js project manifest, scripts, dependencies (React 19, Tauri CLI, Vite, Vitest, Playwright). |
| `tsconfig.json` | TypeScript compiler configuration. |
| `vite.config.ts` | Vite bundler configuration for the React frontend. |
| `index.html` | HTML entry point for the Vite dev server / Tauri webview. |
| `rust-toolchain.toml` | Rust toolchain version pin (1.94.1). |
| `AGENTS.md` | Agent instructions — branch workflow, validation commands, commit policy. |
| `README.md` | Project-level README — onboarding, scope, quick start. |

---

*This index reflects the repo as observed after the 2026-05-22 documentation normalization pass. Entries marked "Needs verification" indicate areas not yet fully inspected. Update this file when new top-level directories are added or when responsibilities change.*
