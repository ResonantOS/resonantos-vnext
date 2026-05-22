# CodeMap — ResonantOS vNext Repository

Last updated: 2026-05-22

This document is a navigable map of the repository. It describes what lives where, how pieces relate, and where to start depending on intent. It is not an architecture rewrite, not a feature backlog, and not speculative. Observations are based on code inspection as of the current branch.

---

## Repo Tree Overview

```
resonantos-vnext/
├── .github/workflows/        # CI: alpha-build.yml
├── addons/                   # Runtime addon host implementations
├── build/                    # Build artifact staging
├── crates/                   # Rust workspace crates
├── docs/                     # Documentation surface (ADRs, specs, audits, product)
├── examples/                 # Runnable examples (memory service, MCP bridge)
├── public/                   # Static assets + addon manifest catalog
├── scripts/                  # Build/dev tooling scripts
├── server/                   # Hosted Express auth + API proxy backend
├── src/                      # React/TypeScript frontend
├── src-tauri/                # Rust/Tauri desktop host
├── tests/                    # Shell-level integration tests
├── index.html               # Vite/Tauri entry point
├── package.json             # Node.js project manifest
├── tsconfig.json            # TypeScript config
├── vite.config.ts           # Vite bundler config
├── rust-toolchain.toml      # Rust toolchain pin (1.94.1)
├── AGENTS.md                # AI agent working instructions
└── README.md                # Project-level README
```

---

## Subsystem Classification

### `.github/workflows/`
- **Classification:** infra
- **Responsibility:** CI/CD for alpha builds on macOS, Windows, Linux. Runs tests (TypeScript + Rust), checks formatting, produces platform artifacts.
- **Coupling risk:** Low. Changes here affect release pipeline only.
- **Growth pressure:** Obvious. Will need signing steps, notarization, beta release channels.

### `addons/`
- **Classification:** runtime / addon
- **Responsibility:** Addon host implementations that run alongside or within the shell.
  - `resonant-browser-host/` — Node.js browser embedding host and Electron-visible host with tests.
  - `resonant-browser-native/` — C++ native browser bridge (CEF), CMake build, macOS native host, contract validation tests.
  - `insight-engine/` — minimal manifest stub.
- **Coupling risk:** HIGH. Browser addon is the most complex integration, touching native compilation, CEF vendor fetching, platform-specific code.
- **Growth pressure:** High. Browser is a key addon; native host may need Windows/Linux equivalents.

### `build/`
- **Classification:** tooling / generated
- **Responsibility:** Build output staging for the native embedded browser. Currently contains only `.gitkeep`.
- **Coupling risk:** Low.
- **Growth pressure:** Low. Artifacts are gitignored.

### `crates/`
- **Classification:** runtime
- **Responsibility:** Rust workspace crates. Currently only `resonator-control` — a desktop control foundation for macOS backend, used as a dependency by the Tauri host.
- **Coupling risk:** Medium. Directly linked into the Tauri binary.
- **Growth pressure:** Moderate. More crates may be extracted from `src-tauri/src/` to keep host service modules manageable.

### `docs/`
- **Classification:** docs
- **Responsibility:** Primary documentation surface:
  - `architecture/` — 32 ADRs (ADR-001 through ADR-032), module map, system diagram, architecture audit, addon templates, engineer/agent skill docs, runbooks, slides.
  - `product/` — UX specs (app shell, glocal discovery, icon system).
  - `sdk/` — Memory Provider SDK documentation.
  - `specs/` — Future spec stubs (README only).
  - `adr/` — ADR process guidance.
  - `audits/` — Audit process guidance.
  - `agent-workflows/` — AI-assisted development conventions.
  - `working/` — Session context for reloadable working memory.
- **Coupling risk:** Low for runtime. High for drift — keeping docs in sync with code.
- **Growth pressure:** High. ADR count will grow. More product specs needed.

### `examples/`
- **Classification:** examples / sdk
- **Responsibility:** Runnable reference implementations:
  - `living-archive-memory-service.mjs` — local HTTP memory service implementing `POST /memory/{operation}`.
  - `living-archive-mcp.mjs` — MCP (Model Context Protocol) bridge for external AI clients.
  - `reference-memory-service.mjs` — reference memory provider pattern.
  - `addons/` — example addon manifest stubs.
- **Coupling risk:** Low. Examples are standalone services; they reference but do not modify shell internals.
- **Growth pressure:** Moderate. More SDK examples expected.

### `public/`
- **Classification:** sdk / runtime
- **Responsibility:** Static assets and addon manifest catalog.
  - `addons/` — 20 JSON manifest files defining addons known to the shell.
  - `icons/` — app and addon icons.
  - `addons/index.json` — default public addon catalog (curated list of 20 addon filenames).
- **Coupling risk:** Medium. The shell reads `index.json` at startup. Manifest format changes could break addon loading.
- **Growth pressure:** High. Addon count will increase. May need versioned manifests.

### `scripts/`
- **Classification:** tooling
- **Responsibility:** Build automation and dev tooling:
  - `build-native-browser.mjs` — native browser build orchestration.
  - `ensure-dev-server.mjs` — dev server health check.
  - `setup-camofox.sh` — Camofox browser integration setup.
- **Coupling risk:** Low.
- **Growth pressure:** Moderate.

### `server/`
- **Classification:** runtime (hosted service)
- **Responsibility:** Express.js backend for auth, API proxying, invite management, rate limiting, OpenAI proxy, usage tracking. Separate from the desktop app — this is a hosted companion service.
- **Coupling risk:** Low for desktop runtime. Server is independently deployable.
- **Growth pressure:** Moderate. May need companion services for addon store, registry, etc.

### `src/`
- **Classification:** runtime (frontend)
- **Responsibility:** React 19 / TypeScript frontend. See detailed breakdown below.
- **Coupling risk:** See subsystem breakdown.
- **Growth pressure:** HIGH. Largest growth surface — new addon workspaces, new features, UI polish.

#### `src/core/`
- Runtime engine: chat orchestration, compute fabric, context memory, delegation, logician, memory provider, model strategy, policies, provider service, runtime adapter, web transport.
- `contracts.ts` — 2,749 lines: the central type surface. All types, interfaces, enums live here.
- `runtime.ts` — 2,067 lines: Tauri IPC wrapper. Every `#[tauri::command]` has a corresponding invocation here.
- **Coupling risk:** VERY HIGH. `contracts.ts` is a single large file. Changes here ripple everywhere.

#### `src/sdk/addons/`
- Addon SDK V0: manifest validation, registry helpers, public-facing exports.
- `contracts.ts` — SDK-specific types extending core contracts.
- `validation.ts` — manifest validation logic.
- `registry.ts` — addon registry entry creation.
- **Coupling risk:** High. This is the SDK surface consumed by external addon developers. Breaking changes here affect the ecosystem.

#### `src/modules/`
- Feature modules organized by domain:
  - `chat/` — Augmentor/Strategist chat rail.
  - `archive/` — Living Archive workspace.
  - `browser/` — Resonant Browser workspace.
  - `shell/` — Shell boot, hydration, system-slots, selectors.
  - `settings/` — Provider settings, diagnostics.
  - `recovery/` — Emergency recovery dashboard.
  - `strategist/` — Strategist identity management.
  - `delegation/` — Delegation task workspace monitor.
  - `compute/` — Compute fabric workspace.
  - `terminal/` — Terminal workspace.
  - `overview/` — Current home/workbench surface.
  - `addons/` — Addon catalog, capability grants, setup panels.
  - `obsidian/` — Obsidian-compatible workspace.
  - `opencode/` — OpenCode hosted workspace.
  - `paperclip/` — Paperclip organizational workspace.
  - `hermes/` — Hermes compute fabric workspace.
  - `insight-engine/` — Insight engine stub.
- **Coupling risk:** Variable. Chat and archive are tightly coupled to core. Terminal, compute, recovery are more self-contained.

#### `src/components/`
- Shared UI components: `LoginGate`, `Panel`, `TokenGate`.
- **Coupling risk:** Low.

#### `src/styles/`
- Global CSS: base, shell, responsive, workspace cards.
- **Coupling risk:** Low.

### `src-tauri/`
- **Classification:** runtime (native host)
- **Responsibility:** Tauri v2 Rust desktop host. Owns privileged services, IPC, persistence, secrets.
- **Coupling risk:** VERY HIGH. All frontend capabilities flow through here. See detailed breakdown below.

#### `src-tauri/src/lib.rs`
- 1,560 lines: Central command registration. Every `#[tauri::command]` is registered here. This file imports from all service modules and wires them to Tauri's IPC.
- **Risk:** This is a monolithic command hub. If it grows further, consider splitting into domain-specific command registries.

#### `src-tauri/src/host_state.rs`
- App config, runtime state persistence, provider secrets, addon manifest validation/install, capability gate helpers.
- **Risk:** Secrets handling. Must remain audited and small.

#### `src-tauri/src/provider_service.rs`
- Provider execution adapters, diagnostics, local runtime probing, chat/streaming execution, smoke tests, setup probes.
- **Risk:** High. Provider API communication touches external network. Must handle errors, timeouts, fallbacks.

#### `src-tauri/src/archive_service/`
- SQLite-backed Living Archive: runtime status, system memory, source library import/ingest, review queue, TOL bundles, wiki navigation, lint.
- **Risk:** High. Data durability, ingest processing, review/promotion pipeline.

#### `src-tauri/src/browser_service.rs`
- Chromium engine discovery, launch, CDP sessions, open/read/screenshot/close.
- **Risk:** Medium-High. Process management, cross-platform behavior.

#### `src-tauri/src/browser_native_service.rs`
- Native browser embedding (CEF on macOS).
- **Risk:** High. Platform-specific native code.

#### `src-tauri/src/camofox_service.rs` / `camofox_integration.rs` / `camofox_overlay_macos.rs`
- Camofox browser integration (Firefox-based alternative).
- **Risk:** Medium. Redundant with browser_service — possible consolidation target.

#### Other Rust services:
- `terminal_service.rs` — PTY sessions.
- `delegation_service.rs` — Task workspace persistence.
- `recovery_service.rs` — Engineer recovery tool loop.
- `memory_service.rs` — Local memory service launcher.
- `obsidian_service.rs` — Vault bridge.
- `opencode_service.rs` — OpenCode launcher.
- `paperclip_service.rs` — Paperclip connector.
- `hermes_service.rs` — Hermes bridge.
- `telegram_service.rs` — Telegram bot.
- `compute_service.rs` — Local compute, GX10, NAS.
- `resonator_service.rs` — macOS desktop control.
- `marionette_bridge.rs` — Marionette bridge.

### `tests/`
- **Classification:** testing
- **Responsibility:** Shell-level integration test (`resonator-autonomy-test.sh`).
- **Coupling risk:** Low.

---

## Runtime Relationships

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React/TS)                                │
│  src/core/  +  src/modules/  +  src/sdk/            │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  Addon SDK Surface (src/sdk/addons/)         │    │
│  │  • validation  • registry  • contracts       │    │
│  └─────────────────────────────────────────────┘    │
└───────────────────────┬─────────────────────────────┘
                        │ Tauri `invoke()` IPC
                        │ (typed, capability-gated)
┌───────────────────────▼─────────────────────────────┐
│  Tauri Host (Rust)                                  │
│  src-tauri/src/lib.rs  —  command registration      │
│                                                     │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Provider    │ │ Archive      │ │ Browser      │ │
│  │ Service     │ │ Service      │ │ Service      │ │
│  └─────────────┘ └──────────────┘ └──────────────┘ │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Terminal    │ │ Delegation   │ │ Recovery     │ │
│  │ Service     │ │ Service      │ │ Service      │ │
│  └─────────────┘ └──────────────┘ └──────────────┘ │
│  ... more services ...                              │
│                                                     │
│  host_state.rs — secrets, manifests, capability gate│
└───────────────────────┬─────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
    SQLite DB    Managed Memory    External
   (archive.db)   Filesystem       APIs/Providers
```

The ONLY communication path between frontend and native is Tauri's `invoke()` bridge. The frontend does NOT make direct network calls — all provider API communication goes through the Rust host's `provider_service.rs`.

---

## Where to Start

### If you are a new contributor:
1. Read `README.md` — project scope and structure.
2. Read `docs/ARCHITECTURE.md` — first-pass architecture overview.
3. Read `docs/architecture/ADR-001-platform-stack.md` — platform choices.
4. Read `src/core/contracts.ts` — the type system (skimming is fine).
5. Run `npm run tauri:dev` to see the app.

### If you are an addon developer:
1. Read `docs/architecture/ADR-006-addon-runtime-sdk.md` and `ADR-018-addon-sdk-v0.md`.
2. Read `src/sdk/addons/contracts.ts` — SDK types.
3. Study `public/addons/` — existing manifest examples.
4. Study `examples/` — reference implementations.

### If you are working on the Rust host:
1. Read `docs/architecture/ADR-009-rust-service-ipc-boundary.md`.
2. Read `src-tauri/src/lib.rs` — command surface.
3. Read `src-tauri/src/host_state.rs` — state, secrets, capability gates.
4. Read the specific service module for your area.

### If you are an AI coding agent:
1. Read `AGENTS.md` — agent working instructions.
2. Read `docs/architecture/MODULE_MAP.md` — ownership map.
3. Read `docs/PROJECT_STATUS.md` — current checkpoint.
4. Never modify `src/core/contracts.ts` without checking all consumers.

---

## High-Risk Zones

| Zone | Risk | Reason |
|------|------|--------|
| `src/core/contracts.ts` (2,749 lines) | VERY HIGH | Central type surface; a change here cascades through every module, every Rust type mapping, every test. Break cautiously. |
| `src-tauri/src/lib.rs` (1,560 lines) | HIGH | Monolithic command registration hub. Adding a new service requires editing this file. Risk of merge conflicts and missed registrations. |
| `src/App.tsx` (2,954 lines) | HIGH | Shell composition root. Owns too much orchestration. MODULE_MAP explicitly warns against growth here. |
| `src/core/runtime.ts` (2,067 lines) | HIGH | Every Tauri command has a corresponding invoke wrapper here. Tightly coupled to `lib.rs`. |
| `src-tauri/src/provider_service.rs` | HIGH | External API communication, secrets, streaming. Must be robust against provider failures. |
| `src-tauri/src/archive_service/` | HIGH | Data durability, ingest pipeline, review/promotion logic. SQLite schema changes are risky. |
| `src-tauri/src/host_state.rs` | HIGH | Secret storage, capability gate logic. Security-critical. Must remain small and auditable. |
| `addons/resonant-browser-native/` | MEDIUM-HIGH | Native C++ code, CEF integration, platform-specific paths. Hardest to test and debug. |
| `public/addons/index.json` | MEDIUM | Addon catalog loaded at startup. Corrupt manifests can cause shell failures. |
| `src/sdk/addons/contracts.ts` | MEDIUM | SDK surface. Breaking changes affect external addon developers. |

---

## Likely Extension Points

| Extension Point | Location | Notes |
|----------------|----------|-------|
| New addon workspace | `src/modules/<new-addon>/` + `src-tauri/src/<new>_service.rs` | Follow pattern of `obsidian/` or `opencode/`. |
| New provider backend | `src-tauri/src/provider_service.rs` + `src/core/provider-service.ts` | Add new provider type to `contracts.ts` `ProviderType` union. |
| New memory domain | `src-tauri/src/archive_service/` | ADR-013 defines the memory domain model. |
| New system slot | `src/modules/shell/system-slots.ts` | ADR-026 defines replaceable slots. |
| New capability | `src/core/contracts.ts` `Capability` union + `src/sdk/addons/contracts.ts` `ADDON_CAPABILITIES` | Requires Rust-side enforcement in `host_state.rs`. |
| New SDK export | `src/sdk/addons/index.ts` | Keep the public SDK surface narrow. |
| New ADR | `docs/architecture/ADR-XXX-*.md` | Follow ADR template in `docs/adr/README.md`. |

---

## Needs Verification

The following items are marked "Needs verification" because direct runtime evidence was not available during this audit:

| Item | Location | Why |
|------|----------|-----|
| Insight Engine module completeness | `src/modules/insight-engine/`, `addons/insight-engine/` | Manifest exists but module has minimal implementation. Is this planned or abandoned? |
| Hermes compute fabric integration status | `src/modules/hermes/`, `src-tauri/src/hermes_service.rs` | Code exists but requires compute fabric infrastructure to test. ADR-032 is aspirational. |
| Process-level addon sandboxing | `src/sdk/addons/`, `src-tauri/src/host_state.rs` | Capability enforcement is declarative (manifest + runtime checks). Hard process sandboxing is not confirmed. |
| Cross-platform browser embedding parity | `addons/resonant-browser-native/` | Native host code is macOS-only (`.mm` files). Windows/Linux paths are minimal stubs. |
| Server (`server/`) integration status with desktop app | `server/` | Auth/API proxy server exists independently. Connection to desktop app is unclear — is this actively used? |
| `ui/` directory referenced in REPO_INDEX | `src/ui/` | REPO_INDEX mentions `src/ui/` but the directory contains only `icons/resonant-icons.tsx`. Is this still accurate? |
| Rust integration tests | `src-tauri/tests/` | REPO_INDEX mentions this directory but it was not observed. Confirmed absent — tests may be in `src-tauri/src/` as inline `#[cfg(test)]` modules. |
| Camofox vs Chromium browser path consolidation | `src-tauri/src/camofox_*` vs `browser_*` | Two browser integration paths exist. Are both maintained, or is one being deprecated? |
| Recursive MAS addon implementation | `docs/architecture/ADR-030-recursive-mas-runtime-addon.md`, `examples/addons/recursive-mas.json` | ADR exists, manifest stub exists, but runtime implementation is unclear. |
| OpenClaw addon status | `public/addons/openclaw.json` | Manifest exists but this is the legacy Alpha product. Is this addon actively maintained? |

---

## Agent Safety Constraints

### Areas where AI agents should avoid broad refactors:
- `src/core/contracts.ts` — type changes ripple everywhere. Make surgical changes only.
- `src-tauri/src/lib.rs` — command registration is densely coupled. Add commands carefully.
- `src-tauri/src/host_state.rs` — secrets handling. Do not refactor casually.
- `src-tauri/src/archive_service/` — data durability path. SQL schema changes require migration planning.
- `src/sdk/addons/contracts.ts` — SDK surface stability matters for external consumers.

### Areas safe for docs-only contributors:
- `docs/` — any markdown file not marked "generated."
- `README.md`, `AGENTS.md` — project-level guidance.
- `docs/architecture/` ADRs — adding new ADRs is safe.
- `examples/` — adding new examples is safe.

### Areas requiring integration testing before merge:
- Any change to `src-tauri/src/provider_service.rs`
- Any change to `addons/resonant-browser-native/`
- Any change affecting capability enforcement (`host_state.rs`, `policies.ts`)
- Any change to SQLite schema or archive service
- Cross-platform code paths (native browser, PTY, file system paths)
