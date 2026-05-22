# System Boundaries — ResonantOS vNext

Last updated: 2026-05-22

This document maps every architectural seam, IPC boundary, trust surface, and isolation assumption in the current codebase. It distinguishes verified observations from inferences and explicitly marks unclear areas.

---

## Architecture Seams Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     RESONANTOS vNEXT                          │
│                                                              │
│  ┌────────────────────┐          ┌─────────────────────────┐ │
│  │  React/TS Frontend  │          │  Hosted Server (Express)│ │
│  │  (src/)             │          │  (server/)              │ │
│  │                     │          │  Auth, API proxy,       │ │
│  │  Shell              │          │  rate limiting,         │ │
│  │  Modules            │          │  usage tracking         │ │
│  │  SDK                │          │                         │ │
│  └────────┬───────────┘          └─────────────────────────┘ │
│           │ Tauri invoke() IPC                                 │
│  ┌────────▼───────────┐                                       │
│  │  Rust/Tauri Host    │                                       │
│  │  (src-tauri/)       │                                       │
│  │                     │                                       │
│  │  Provider Service   │──────► External Provider APIs        │
│  │  Archive Service    │──────► SQLite + Filesystem           │
│  │  Browser Service    │──────► Chromium / CEF                │
│  │  Terminal Service   │──────► PTY sessions                  │
│  │  Delegation Svc     │──────► Task workspace files          │
│  │  Host State         │──────► Secrets, manifests, config    │
│  └─────────────────────┘                                       │
│                                                              │
│  ┌─────────────────────┐                                      │
│  │  Local Memory       │◄───── External AI Clients (MCP)     │
│  │  Service (examples/) │                                      │
│  └─────────────────────┘                                      │
└──────────────────────────────────────────────────────────────┘
```

---

## IPC Boundaries

### 1. Frontend ↔ Rust Host (Tauri IPC)

**Status:** Verified  
**Surface:** `#[tauri::command]` functions registered in `src-tauri/src/lib.rs`  
**Frontend invocation:** `src/core/runtime.ts` — typed wrappers around `invoke()` from `@tauri-apps/api/core`  
**Protocol:** JSON-serialized request/response over Tauri's internal IPC channel  
**Direction:** Frontend calls host; host responds. Host can also emit events to frontend via `app.emit()`.  

**Security model:**
- Commands are capability-gated at invocation time via `assert_addon_capabilities()` and `assert_living_archive_host_access()`.
- Capabilities are declared in `public/addons/*.json` manifests.
- Tauri's own capability file (`src-tauri/capabilities/default.json`) grants `core:default`, `core:webview:allow-create-webview-window`, and `dialog:allow-open`.

**Verified commands (non-exhaustive):**
- `load_runtime_state` / `save_runtime_state` — shell state persistence.
- `provider_service_chat_completion` / `provider_service_chat_completion_stream` — AI chat.
- `archive_*` (30+ commands) — Living Archive operations.
- `browser_*` — Browser operations.
- `obsidian_*`, `opencode_*`, `paperclip_*`, `hermes_*`, `terminal_*` — addon host services.
- `sideload_addon_manifest`, `list_sideloaded_addons` — addon management.
- `load_provider_secret_statuses`, `save_provider_secret` — credential management.

**Risk:** The command surface is large (~85 commands). Every command is a potential privilege escalation path. Capability enforcement is declarative (runtime string checks) rather than structural (type-level).

---

### 2. Addon ↔ Shell (SDK Boundary)

**Status:** Verified (SDK surface), Inferred (addon isolation)  
**Surface:** `src/sdk/addons/` exports (`index.ts`)  
**Contract:** Addon manifest JSON + typed contracts from `src/core/contracts.ts`  
**Security model:**
- Addons declare capabilities in manifests.
- Shell validates manifests via `src/sdk/addons/validation.ts`.
- At invocation time, `assert_addon_capabilities()` in `host_state.rs` checks active grants.
- Addons cannot communicate directly with each other — all inter-addon communication is shell-mediated.

**Isolation level:**  
- Addons run in the same React context as the shell. There is NO process-level sandboxing for `ui-module` addons.
- `local-service` addons may run as separate Node processes, but this is NOT enforced by the SDK.
- `agent-addon` and `channel-addon` isolation levels are **unclear** — needs verification.

**Needs verification:**
- Whether `local-service` addons are actually launched as separate processes.
- Whether `agent-addon` type has any runtime isolation.
- Whether the SDK can enforce hard resource limits.

---

### 3. Provider Routing Boundary

**Status:** Verified (implementation exists), Inferred (completeness)  
**Surface:** `src/core/provider-service.ts` (frontend routing) + `src-tauri/src/provider_service.rs` (host execution)  
**Decision authority:** Centralized in the ResonantOS policy engine per ADR-005.

**Flow:**
1. Addon/agent declares provider requirements (provider type, model preferences, latency/locality).
2. Frontend `provider-service.ts` resolves route based on `model-strategy.ts`, `policies.ts`, and current provider status.
3. Resolved route is passed to the Rust host via `provider_service_chat_completion` / `provider_service_chat_completion_stream`.
4. Rust host executes the actual API call, handles streaming, and returns results.

**Provider types supported:** `openai`, `anthropic`, `google`, `minimax`, `openai-compatible`, `local`, `custom` (per `contracts.ts`).

**Auth sources:** `shared-vault`, `addon-private`, `manual`.

**Fallback:** ADR-005 specifies resurrect/panic fallback. Implemented via `recovery_route_candidates` and `engineer_recovery_turn` in `recovery_service.rs`.

**Needs verification:**
- Whether ALL provider types have complete execution adapters.
- Whether `local` and `custom` providers have full fallback chain support.
- Whether the MiniMax-specific paths in `defaults.ts` are the ONLY fully implemented provider.

---

### 4. Persistence Boundary (Living Archive)

**Status:** Verified  
**Surface:** `src-tauri/src/archive_service/` (Rust) + `src/modules/archive/` (TypeScript)  

**Storage layers:**
1. **SQLite database** (`archive.db`) — archive stats, recent activity, review queue, ingest requests, memory build jobs.
2. **Managed Memory filesystem** — wiki pages, intake artifacts, review artifacts, imported libraries.
   - `Human Knowledge/` — user-curated knowledge.
   - `External Knowledge/` — imported third-party knowledge.
   - `AI Memory/` — AI-generated memory artifacts.
   - `Mixed Library/` — staging for classification review.
   - `Intake/` — raw ingest queue.
   - `Review/` — pending review artifacts.
3. **Runtime state** (`runtime-state.json`) — shell state persisted via `host_state.rs`.
4. **Provider secrets** — encrypted storage in app config directory.

**Memory domains (ADR-013):** Human Knowledge, External Knowledge, AI Memory, Mixed Library.

**Approval tiers (ADR-012):** Trusted wiki promotion defaults to Strategist review, not blanket human review.

**External access (ADR-029):** MCP bridge + local memory service in `examples/`.

---

### 5. Memory Service / MCP Bridge Boundary

**Status:** Verified (examples exist), Inferred (production status)  
**Surface:** `examples/living-archive-memory-service.mjs` + `examples/living-archive-mcp.mjs`  

**Living Archive Memory Service:**
- Standalone Node.js HTTP service implementing `POST /memory/{operation}`.
- Operations: status, search, read, intake, ingest-request, review-listing, lint.
- Portable: works with `ResonantOS_User/Memory` folder without requiring the desktop shell.
- Deliberately rejects provider-only operations (trusted wiki promotion, semantic lint) — those require the full desktop host.

**MCP Bridge:**
- Standalone stdio MCP bridge for external AI clients.
- Proxies to the memory service when `RESONANTOS_MEMORY_SERVICE_URL` is available.
- Falls back to direct filesystem access via `RESONANTOS_MEMORY_ROOT`.

**Boundary enforcement:** The memory service cannot write trusted wiki pages directly. All trusted writes must go through the host-mediated archive review/promotion pipeline.

**Needs verification:**
- Whether these services are used in production or are reference implementations only.
- Whether the MCP bridge is distributed or remains an internal example.

---

### 6. Local vs Hosted Assumptions

**Status:** Verified (desktop is local-first), Verified (server is hosted)  

**Desktop app (`src-tauri/` + `src/`):**
- Local-first. All data in SQLite + filesystem.
- Provider API calls go through the Rust host (no direct browser-to-API communication).
- Secrets stored locally in app config directory.

**Server (`server/`):**
- Independent Express.js backend.
- Provides auth (JWT), API proxying (OpenAI), invite management, rate limiting, usage tracking.
- Uses its own SQLite database (`better-sqlite3`).
- **Relationship to desktop app:** Unclear. The desktop app does not appear to connect to this server in any visible code path. This may be a future companion service or an artifact from a different deployment model.

**Needs verification:**
- Whether `server/` is actively used or is a planning artifact.
- Whether the desktop app has a companion server connection path.

---

### 7. SDK vs App Distinction

**Status:** Verified  
**Separation:**
- `src/sdk/` is the PUBLIC surface consumed by addon developers.
- `src/core/`, `src/modules/`, `src-tauri/` is the INTERNAL app implementation.
- SDK exports flow through `src/sdk/addons/index.ts`.
- SDK types extend `src/core/contracts.ts` types but the core contracts are NOT exported as a stable SDK surface.

**Implication:** Addon developers should depend on `src/sdk/addons/` exports ONLY. Core contracts may change without notice.

---

### 8. Trust / Capability Surfaces

**Status:** Verified (declared), Inferred (enforcement completeness)  

**Capability types (from `contracts.ts`):**
`filesystem`, `archive-read`, `archive-intake-write`, `chat-interface`, `memory-provider`, `providers`, `shell`, `network`, `ui-embedding`, `browser-control`, `agent-delegation`, `notifications`, `device-integration`.

**Enforcement layers:**
1. **Manifest declaration** — addon declares requested capabilities and scopes.
2. **Validation** — `src/sdk/addons/validation.ts` checks manifest structure.
3. **Grant approval** — user inspects and approves grants.
4. **Runtime enforcement** — `assert_addon_capabilities()` in `host_state.rs` checks at command invocation.
5. **Policy layer** — `src/core/policies.ts` applies archive write guards and provider selection rules.

**Provenance tiers (ADR-006):**
- `bundled-core` — shipped with the shell.
- `curated-signed` — distributed through curated registry.
- `sideloaded-unverified` — manually installed; starts from minimal trust.
- `enterprise-signed` — future tier.

**Revocation behaviors:** `hard-stop`, `degrade`, `hide-surface`.

**Needs verification:**
- Whether capability enforcement covers ALL commands, or if there are un-gated paths.
- Whether provenance tiers affect runtime behavior beyond warnings.
- Whether revocation is implemented for all capability types.

---

### 9. Browser Integration Boundaries

**Status:** Verified (two paths exist), Inferred (consolidation plan)  

**Path 1 — Chromium (`browser_service.rs`):**
- CDP-based session management.
- Open URL, screenshot, read page, click, scroll, close session.
- Engine install via host command.

**Path 2 — Native CEF (`browser_native_service.rs`):**
- macOS-native CEF embedding.
- Show/hide/resize embedded browser.
- Native bridge probing.

**Path 3 — Camofox (`camofox_service.rs`):**
- Firefox-based browser integration.
- Start/stop, navigate, screenshot, health check, wallet connect.
- Context injection via Resonant Context SDK.

**Risk:** Three browser integration paths. Maintenance burden. Likely consolidation target.

**Needs verification:**
- Which path(s) are actively maintained vs deprecated.
- Whether Camofox is a temporary bridge or a long-term option.

---

### 10. Rust ↔ TypeScript IPC Boundaries (Detail)

**Status:** Verified  
**Direction:** TypeScript calls Rust via Tauri `invoke()`. Rust emits events to TypeScript via Tauri `emit()`.

**Observed events:** `runtime-state-updated` — emitted when `save_runtime_state` is called.

**Type mappings:** TypeScript types in `contracts.ts` map to Rust structs in service modules. Mapping is manual (not generated). Mismatches between TypeScript and Rust types are a known fragility risk.

**Needs verification:**
- Whether there is an automated test that validates TypeScript ↔ Rust type parity.
- Whether the event emitter path is used for anything beyond `runtime-state-updated`.

---

## Unclear Boundary Areas

| Boundary | Status | Why Unclear |
|----------|--------|-------------|
| `server/` ↔ desktop app | Unclear | Server exists but no connection path is visible in desktop code. |
| Camofox ↔ Chromium consolidation | Unclear | Two browser integration paths; no documented deprecation plan. |
| Addon process isolation | Unclear | SDK docs imply isolation but code suggests same-process execution for `ui-module` types. |
| Provider execution adapter completeness | Unclear | MiniMax paths are primary; unclear if all provider types have complete execution adapters. |
| `resonator-control` crate usage | Inferred | Crate exists with macOS desktop control; appears to be a dependency but its runtime role is not fully clear. |
| `marionette_bridge.rs` purpose | Inferred | File exists but its role and relationship to other services is not documented. |
| Insight Engine addon status | Unclear | Manifest exists; module has a controller, types, prompts, and tests. But is it actively maintained? |
| Compute Fabric runtime | Inferred | ADR-032 defines compute fabric architecture; `compute_service.rs` exists but scope is limited to local diagnostics, GX10, and NAS probing. |
