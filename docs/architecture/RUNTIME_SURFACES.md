# Runtime Surfaces — ResonantOS vNext

Last updated: 2026-05-22

This document catalogs every runtime surface in the codebase: the code that actually executes when the system runs. It distinguishes between surfaces that are implemented and observable versus those that are stubbed, planned, or unclear.

---

## 1. Frontend Runtime

**Location:** `src/`  
**Runtime:** Vite-bundled React 19 application, loaded in a Tauri webview or browser dev server.  
**Entry point:** `src/main.tsx` → `src/App.tsx`

### 1.1 Core Runtime Engine (`src/core/`)

| Module | Status | Responsibility |
|--------|--------|---------------|
| `contracts.ts` | **Stable** | Central type system. All interfaces, types, enums. 2,749 lines. |
| `runtime.ts` | **Stable** | Tauri IPC wrapper. Every host command has a typed invoke wrapper here. 2,067 lines. |
| `provider-service.ts` | **Stable** | Provider routing, model selection, chat completion orchestration. |
| `model-strategy.ts` | **Stable** | Model selection strategies per workload class. |
| `policies.ts` | **Stable** | Archive write guards, provider selection policy enforcement. |
| `context-memory.ts` | **Stable** | Context budget management, compaction state. |
| `chat.ts` | **Stable** | Chat orchestration, run phases, event tracking. |
| `delegation.ts` | **Stable** | Delegation packet creation and task workspace management. |
| `memory-provider.ts` | **Stable** | Memory provider broker — neutral adapter for Living Archive and HTTP memory providers. |
| `logician.ts` | **Under construction** | Verification policy design engine. |
| `compute-fabric.ts` | **Under construction** | Compute fabric state management. |
| `browser-tools.ts` | **Stable** | Browser tool command wrappers. |
| `provider-credentials.ts` | **Stable** | Provider credential management (resolve from vault or env). |
| `web-transport.ts` | **Stable** | Web-mode transport adapter (browser-only mode, replaces Tauri invoke with HTTP). |
| `runtime-adapter/` | **Stable** | Runtime adapter pattern: native (Tauri) vs web, with registry. |

**Test coverage:** Each module has a corresponding `.test.ts` file. Currently 168 tests pass.

### 1.2 Shell Runtime (`src/modules/shell/`)

| Module | Status | Responsibility |
|--------|--------|---------------|
| `controller.ts` | **Stable** | Shell boot, hydration, first-run setup, addon activation. |
| `selectors.ts` | **Stable** | Derived state selectors for threads, routes, manifests, layout. |
| `system-slots.ts` | **Stable** | ADR-026 replacement-slot resolution. Determines which addon fills `chat-interface`, `memory-system`, etc. |

### 1.3 Chat Runtime (`src/modules/chat/`)

| Module | Status | Responsibility |
|--------|--------|---------------|
| `controller.ts` | **Stable** | Chat execution controller: send messages, handle streaming, manage runs. |
| `StrategistChatRail.tsx` | **Stable** | Primary chat UI component. Augmentor/Strategist rail. |
| `thread-controller.ts` | **Stable** | Thread mutation: branch, delete, edit, pin, compact, switch agent. |
| `composer-controller.ts` | **Stable** | Message composer: attachments, dictation. |
| `archive-context.ts` | **Stable** | Scoped Living Archive context retrieval for chat turns. |
| `archive-intake-controller.ts` | **Stable** | Chat-to-archive intake capture. |
| `chat-route-request.ts` | **Stable** | Route request construction for provider calls. |
| `run-guard.ts` | **Stable** | Run safety guards. |
| `dictation.ts` | **Stable** | Voice dictation support. |
| `types.ts` | **Stable** | Chat-local types. |
| `utils.ts` | **Stable** | Chat utilities. |
| `icons.tsx` | **Stable** | Chat-specific icons. |
| `MessageContent.tsx` | **Stable** | Message rendering with markdown support. |
| `ContextMemoryPanel.tsx` | **Under construction** | Context memory panel (ADR-016 compaction UI). |

### 1.4 Archive Runtime (`src/modules/archive/`)

| Module | Status | Responsibility |
|--------|--------|---------------|
| `controller.ts` | **Stable** | Archive search, read, queue, approval, background sync. |
| `ArchiveWorkspace.tsx` | **Stable** | Living Archive workspace host. |
| `ArchiveSearchPanel.tsx` | **Stable** | Trusted wiki/source search. |
| `ArchiveDocumentReader.tsx` | **Stable** | Guarded document read surface. |
| `ArchiveReviewDesk.tsx` | **Stable** | Ingest queue, review artifact, approval, promotion workflow. |
| `ArchiveSourceScanResults.tsx` | **Stable** | Mapped-source scan results and review queueing. |
| `ArchiveSourceRegistry.tsx` | **Stable** | Imported-library and mapped-source registry. |
| `ArchiveLibraryImporter.tsx` | **Stable** | Folder/vault import surface. |
| `ArchiveClassificationReviewPanel.tsx` | **Stable** | Classification and reorganization review. |
| `ArchiveRecentActivity.tsx` | **Stable** | Archive activity feed. |
| `ArchiveDiagnostics.tsx` | **Stable** | Runtime paths, permission matrix, lint surface. |
| `ArchiveMemoryOverview.tsx` | **Stable** | Memory domain overview. |
| `ArchiveAudio2TolIntake.tsx` | **Under construction** | Optional Audio2TOL addon bridge. Hidden unless addon is active. |
| `archive-action-center.ts` | **Stable** | Archive action orchestration. |
| `archive-ai-memory-jobs.ts` | **Stable** | AI memory build job management. |
| `archive-augmentor-handoff.ts` | **Stable** | Augmentor-to-archive handoff logic. |

### 1.5 Addon Management Runtime (`src/modules/addons/`)

| Module | Status | Responsibility |
|--------|--------|---------------|
| `controller.ts` | **Stable** | Addon install, grant, sideload management. |
| `AddOnsWorkspace.tsx` | **Stable** | Addon catalog, manifest details, capability grant surface. |
| `HermesAddonPanel.tsx` | **Stable** | Hermes addon setup panel. |
| `ObsidianAddonPanel.tsx` | **Stable** | Obsidian vault bridge panel. |
| `ObsidianAddonSections.tsx` | **Stable** | Obsidian panel presentational sections. |
| `obsidian-addon-model.ts` | **Stable** | Obsidian sync-state, prompt, slug, raw-intake serialization. |
| `TelegramAddonPanel.tsx` | **Under construction** | Telegram addon setup panel. |

### 1.6 Other Workspace Runtimes

| Module | Status | Responsibility |
|--------|--------|---------------|
| `browser/BrowserWorkspace.tsx` | **Stable** | Browser workspace: URL bar, screenshot session, controls. |
| `terminal/TerminalWorkspace.tsx` | **Stable** | Terminal workspace: PTY session display. |
| `settings/SettingsWorkspace.tsx` | **Stable** | Settings: providers, shell, memory bridge, diagnostics. |
| `recovery/RecoveryWorkspace.tsx` | **Under construction** | Emergency recovery dashboard. |
| `delegation/DelegationWorkspace.tsx` | **Stable** | Delegation monitor: task workspace listing and review. |
| `strategist/StrategistWorkspace.tsx` | **Stable** | Strategist identity and channel management. |
| `overview/OverviewWorkspace.tsx` | **Stable** | Home/workbench overview (planned migration to app launcher). |
| `compute/ComputeFabricWorkspace.tsx` | **Under construction** | Compute fabric status and controls. |
| `obsidian/ObsidianWorkspace.tsx` | **Stable** | ADR-019 Obsidian-compatible workspace. |
| `opencode/OpenCodeWorkspace.tsx` | **Stable** | OpenCode hosted coding workspace. |
| `paperclip/PaperclipWorkspace.tsx` | **Under construction** | Paperclip organizational runtime workspace. |
| `hermes/HermesWorkspace.tsx` | **Under construction** | Hermes compute fabric workspace. |
| `insight-engine/` | **Unclear** | Insight engine stub. Controller, types, prompts, and tests exist but workspace is minimal. |

### 1.7 SDK Surface (`src/sdk/`)

| Module | Status | Responsibility |
|--------|--------|---------------|
| `addons/index.ts` | **Stable** | Public SDK exports. |
| `addons/contracts.ts` | **Stable** | SDK-specific types, `ADDON_SDK_VERSION`, capability lists. |
| `addons/validation.ts` | **Stable** | Manifest validation: structure, capabilities, scope consistency. |
| `addons/registry.ts` | **Stable** | Registry entry creation and snapshot generation. |

---

## 2. Tauri / Native Runtime

**Location:** `src-tauri/`  
**Runtime:** Rust binary compiled as Tauri v2 desktop application.  
**Entry point:** `src-tauri/src/main.rs` → calls `resonantos_vnext_lib::run()`.

### 2.1 Host Services

| Service | Status | Key Operations |
|---------|--------|---------------|
| `provider_service.rs` | **Stable** | Chat completion, streaming, diagnostics, smoke tests, setup probes, archive ingest probes, recovery route probing. |
| `archive_service/` | **Stable** | Runtime status, system memory, source scan, library import, ingest queue, review/promotion, wiki navigation, lint, AI memory builds. |
| `browser_service.rs` | **Stable** | Chromium engine status/install, open URL, start/close sessions, CDP operations (read, screenshot, click, scroll). |
| `browser_host_service.rs` | **Stable** | Browser host command execution for external browser hosts. |
| `browser_native_service.rs` | **Under construction** | Native CEF embedding (macOS). Show/hide/resize, native bridge probing. |
| `camofox_service.rs` | **Stable** | Camofox Firefox-based browser: start/stop, navigate, screenshot, health, wallet, context injection, scroll. |
| `camofox_integration.rs` | **Stable** | Camofox browser embedding (show/resize/hide). |
| `camofox_overlay_macos.rs` | **Stable** | macOS overlay for Camofox. |
| `terminal_service.rs` | **Stable** | PTY session management: start, write, resize, stop, run command. |
| `delegation_service.rs` | **Stable** | Task workspace CRUD: create, list, read, finish. |
| `recovery_service.rs` | **Under construction** | Engineer recovery turn loop, bounded filesystem/search/command operations. |
| `memory_service.rs` | **Stable** | Local memory service launcher (start/stop/status of the Node.js memory service). |
| `obsidian_service.rs` | **Stable** | Vault bridge: status, list notes, read, open, write (with stale-save protection), create folder/note, move, archive, index. |
| `opencode_service.rs` | **Stable** | OpenCode launcher: status, start/stop scoped sessions, trust event recording. |
| `paperclip_service.rs` | **Under construction** | Paperclip connector: status, start/stop, dashboard snapshot, delegation-to-issue creation. |
| `hermes_service.rs` | **Under construction** | Hermes bridge: status, install, workspace snapshot, dashboard start/stop, chat. |
| `telegram_service.rs` | **Stable** | Telegram bot: save token, start/stop, status. |
| `compute_service.rs` | **Stable** | Local compute: passive diagnostics, safe commands, remote probe, GX10 Llama status/switch, NAS backup status. |
| `host_state.rs` | **Stable** | App config, runtime state persistence, provider secrets, addon manifest validation/install, capability gate helpers, portable user state root resolution. |
| `resonator_service.rs` | **Unclear** | macOS desktop control. Purpose not fully verified. |
| `marionette_bridge.rs` | **Unclear** | Marionette bridge. Purpose not documented. |

### 2.2 IPC Registration

All commands are registered in `src-tauri/src/lib.rs` `run()` function via `tauri::generate_handler![]`. Currently ~85 commands.

**Safety:** Every command that requires capability enforcement calls `assert_addon_capabilities()` or `assert_living_archive_host_access()` before executing.

### 2.3 Native Dependencies

| Crate | Purpose |
|-------|---------|
| `tauri` v2 | Desktop shell framework. |
| `rusqlite` | SQLite for archive database. |
| `reqwest` | HTTP client for provider API calls. |
| `tokio` | Async runtime. |
| `tungstenite` | WebSocket support. |
| `portable-pty` | PTY sessions for terminal. |
| `sha2` | Hashing. |
| `base64` | Encoding. |
| `chrono` | Date/time. |
| `libloading` | Dynamic library loading. |
| `serde` / `serde_json` | Serialization. |
| `resonator-control` | Local crate for macOS desktop control. |
| `tauri-plugin-dialog` | File dialog support. |

---

## 3. Addon Runtime

**Location:** `addons/`, `public/addons/`  
**Runtime model:** Addons are loaded by the shell based on their manifest declarations.

### 3.1 Addon Catalog (`public/addons/`)

20 manifest JSON files registered in `public/addons/index.json`:

| Manifest | Category | Runtime Type | Status |
|----------|----------|-------------|--------|
| `augmentor-chat.json` | agent | ui-module | **Active** (default `primary-agent` + `chat-interface`) |
| `living-archive.json` | memory | ui-module | **Active** (default `memory-system`) |
| `browser.json` | tool | ui-module | **Active** |
| `camofox-browser.json` | tool | ui-module | **Active** |
| `terminal.json` | tool | ui-module | **Active** |
| `obsidian.json` | knowledge | ui-module | **Active** |
| `opencode.json` | tool | ui-module | **Active** |
| `telegram-channel.json` | channel | channel-addon | **Active** |
| `hermes.json` | tool | ui-module | **Under construction** |
| `paperclip.json` | orchestration | ui-module | **Under construction** |
| `audio2tol.json` | tool | ui-module | **Under construction** |
| `coherence-gate.json` | security | ui-module | **Under construction** |
| `shield.json` | security | ui-module | **Under construction** |
| `heuristic-auditor.json` | security | ui-module | **Under construction** |
| `lia-verifier.json` | security | ui-module | **Under construction** |
| `r-awareness.json` | security | ui-module | **Under construction** |
| `logician.json` | security | ui-module | **Under construction** |
| `tts-enforcer.json` | security | ui-module | **Under construction** |
| `usage-tracker.json` | tool | ui-module | **Under construction** |
| `openclaw.json` | tool | ui-module | **Legacy** (OpenClaw Alpha) |
| `architecture-canvas.json` | knowledge | ui-module | **Under construction** |

**Note:** Only manifests listed in `index.json` are loaded by the shell. The catalog is the source of truth for which addons exist in the public preview.

### 3.2 Addon Host Implementations (`addons/`)

| Addon | Runtime | Status |
|-------|---------|--------|
| `resonant-browser-host/` | Node.js | **Active** — browser embedding host, Electron-visible host, with tests. |
| `resonant-browser-native/` | C++ (CMake) | **Active** — native CEF bridge, macOS native host, contract validation. |
| `insight-engine/` | JSON manifest only | **Unclear** — minimal manifest stub, no runtime implementation observed. |

---

## 4. Provider Surface

**Execution flow:**
1. Frontend `provider-service.ts` resolves route.
2. Tauri IPC invokes `provider_service_chat_completion` or `provider_service_chat_completion_stream`.
3. Rust `provider_service.rs` executes the API call.
4. Results streamed back to frontend via Tauri events.

**Implemented providers (observed in defaults.ts):**
- `shared-minimax` — MiniMax M2.7 / M2.7-highspeed (primary).
- `shared-openai` — OpenAI (configurable).
- Additional providers configurable via `providerProfiles` with appropriate credentials.

**Provider operations:**
- `provider_service_chat_completion` — non-streaming chat.
- `provider_service_chat_completion_stream` — streaming chat with abort support.
- `provider_smoke_test` — health check.
- `provider_setup_probe` — setup validation.
- `provider_diagnostics` — diagnostic reports.
- `archive_ingest_probe` — archive-specific provider validation.

---

## 5. Persistence Surface

### 5.1 Runtime State
- **Storage:** `runtime-state.json` in Tauri app config directory.
- **Operations:** `load_runtime_state` / `save_runtime_state` (Tauri commands).
- **Schema:** Arbitrary JSON — no enforced schema beyond what the shell writes.

### 5.2 Provider Secrets
- **Storage:** App config directory (managed by `host_state.rs`).
- **Operations:** `load_provider_secret_statuses` / `save_provider_secret`.
- **Encryption:** Not verified. Secrets appear to be stored as plain JSON — needs verification.

### 5.3 Living Archive
- **Storage:** SQLite (`archive.db`) + managed memory filesystem.
- **Schema:** Defined in `archive_service/` modules (implicit in Rust code, no migration files observed).
- **Operations:** 30+ archive Tauri commands covering search, read, write, ingest, review, promotion, lint, background cycles.

### 5.4 Delegation Task Workspaces
- **Storage:** Filesystem (task workspace JSON files).
- **Operations:** `delegation_create_task_workspace`, `delegation_list_task_workspaces`, `delegation_read_task_workspace`, `delegation_finish_task_workspace`.

---

## 6. Examples / Testing / Runtime Support

### 6.1 Examples (`examples/`)

| Example | Runtime | Purpose |
|---------|---------|---------|
| `living-archive-memory-service.mjs` | Node.js | Local HTTP memory service implementing `POST /memory/{operation}`. Start with `npm run memory-service`. |
| `living-archive-mcp.mjs` | Node.js (stdio) | MCP bridge for external AI clients. |
| `reference-memory-service.mjs` | Node.js | Reference memory provider pattern. |
| `addons/` | JSON manifests | Example addon manifests for SDK validation. |

### 6.2 Test Suite

| Layer | Runner | Count | Command |
|-------|--------|-------|---------|
| TypeScript unit tests | Vitest | 168 tests | `npm test -- --run` |
| Living Archive MCP tests | Node test runner | — | `npm run test:living-archive-mcp` |
| Memory service tests | Node test runner | — | `npm run test:living-archive-memory-service` |
| Browser host tests | Node test runner | — | `npm run test:browser-host` |
| Browser native tests | Node test runner | — | `npm run test:browser-native` |
| Rust unit tests | Cargo test | 100 passed, 3 ignored | `cd src-tauri && cargo test --lib` |
| Shell integration test | Bash | 1 script | `tests/resonator-autonomy-test.sh` |

### 6.3 Build Pipeline

| Step | Command |
|------|---------|
| Frontend build | `npm run build` (tsc + vite build) |
| Rust format check | `cargo fmt --check` (from `src-tauri/`) |
| Full Tauri bundle | `npm run tauri:build` |
| Native browser build | `npm run browser-native:build` |
| Alpha CI | `.github/workflows/alpha-build.yml` (runs tests + builds on macOS, Windows, Linux) |

---

## 7. Surface Stability Classification

### Stable (documented, tested, in use)
- Tauri IPC command surface (85 commands).
- Addon SDK V0 exports (`src/sdk/addons/index.ts`).
- Provider routing pipeline (frontend + backend).
- Living Archive host service boundary.
- Chat rail and message pipeline.
- Terminal PTY session management.
- Browser CDP session management.
- Shell boot and hydration.
- Addon manifest validation.
- Capability grant model.
- Delegation packet / task workspace model.

### Under Construction (partially implemented, gated, or preview)
- Native CEF browser embedding (macOS-only, Windows/Linux stubs).
- Recovery mode / Engineer recovery loop.
- Context memory compaction UI (ADR-016).
- Compute Fabric workspace (ADR-032).
- Paperclip organizational runtime.
- Hermes compute fabric integration.
- Obsidian write/edit workspace (ADR-019).
- Multiple security addons (coherence-gate, shield, heuristic-auditor, lia-verifier, r-awareness, logician, tts-enforcer).

### Unclear / Needs Verification
- Insight Engine: manifest exists, controller exists, but workspace integration is unclear.
- `resonator_service.rs`: exists as a service module, purpose not fully verified.
- `marionette_bridge.rs`: exists, purpose undocumented.
- `server/` relationship to desktop app: server exists, no visible connection path.
- Camofox vs Chromium browser consolidation: two paths, no documented strategy.
- Provider execution adapter completeness: MiniMax is primary, others unclear.
