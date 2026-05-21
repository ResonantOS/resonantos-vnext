# Architecture Overview

A first-pass architecture overview based on the current repository, not aspiration. This document describes what exists in code and documentation today.

## Tauri Shell

ResonantOS vNext runs inside a **Tauri v2** desktop shell. The shell provides:

- A native Rust host process (`src-tauri/`) that owns privileged services and IPC.
- A React/TypeScript webview frontend (`src/`) that renders the UI.
- Tauri command invocations bridge the two layers via the `#[tauri::command]` boundary in `src-tauri/src/lib.rs`.

The Rust host owns: file system access, child process management, network requests, SQLite persistence, terminal/PTY sessions, browser embedding, and capability enforcement.

## React Frontend

The frontend (`src/`) is a Vite-bundled React 19 application. Key structural boundaries:

- **`src/core/`** — Runtime engine: chat orchestration, compute fabric, context memory management, provider routing, delegation fabric, model strategy selection, policy enforcement, and the runtime adapter.
- **`src/modules/`** — Feature modules organized by domain: `chat/`, `archive/`, `browser/`, `shell/`, `settings/`, `recovery/`, `strategist/`, `terminal/`, plus add-on workspace hosts (`obsidian/`, `opencode/`, `paperclip/`, `hermes/`, `insight-engine/`).
- **`src/sdk/`** — The add-on SDK surface exposed to add-on developers.
- **`src/components/`** — Shared UI components (LoginGate, Panel, TokenGate).

The frontend communicates with the Rust host exclusively through Tauri's invoke bridge.

## Add-on SDK

The SDK (`src/sdk/`) defines the contract surface that add-ons use to integrate with the shell:

- Add-on lifecycle hooks (load, unload, activate, deactivate).
- Capability request and grant mechanisms.
- Workspace embedding APIs.
- Access to core services (chat, memory, providers, delegation) through scoped interfaces.

SDK consumers are add-ons that register in the public catalog and declare their required capabilities.

## Add-on Manifest / Catalog Model

Add-ons are declared via JSON manifest files in `public/addons/`. Each manifest specifies:

- Add-on identity (id, name, version, description).
- Required capabilities (e.g., chat access, memory read/write, browser embedding, file system).
- Entry points and resource declarations.
- Icons and metadata for the catalog UI.

The shell reads the catalog at startup and enforces capability grants before activating add-ons. See ADR-006, ADR-023, and ADR-026 for the governance model.

## Capability Grants

Capabilities are gated by:

- **Manifest declarations** — add-ons declare what they need.
- **Tauri capability files** (`src-tauri/capabilities/`) — native permissions for privileged operations.
- **Runtime policy enforcement** — `src/core/policies.ts` validates requests at invocation time.

Add-ons cannot exceed their declared capabilities. The shell enforces this at the SDK boundary.

## Default Add-ons

The system ships with a set of default add-ons that implement core product features:

- **Augmentor Chat** — the primary AI chat interface (strategist rail, delegation, multi-model routing).
- **Living Archive** — persistent knowledge storage with memory domains, approval policies, and LLM Wiki compliance.
- **Resonant Browser** — embedded browser with native rendering (CEF on macOS, platform-native elsewhere).
- **Resonant Notes / Obsidian** — clean-room workspace for notes and knowledge work.
- **OpenCode** — hosted coding workspace.
- **Paperclip** — organizational runtime.
- **Insight Engine** — data analysis and visualization (Needs verification).
- **Hermes** — compute fabric integration (Needs verification).

These defaults are replaceable per ADR-026 (minimal kernel, replaceable default add-ons).

## Local Memory / MCP Bridge

The Living Archive exposes memory through two local pathways:

- **Living Archive MCP Bridge** (`examples/living-archive-mcp.mjs`) — a Model Context Protocol bridge allowing external AI clients to query scoped Living Archive memory.
- **Local Memory Service** (`examples/living-archive-memory-service.mjs`) — a local memory service for the shell and add-ons.

The memory architecture separates Human Knowledge, External Knowledge, AI Memory, and Mixed Library staging (ADR-013). Memory domains have tiered approval policies (ADR-012).

## Provider Model

The provider fabric (`src/core/provider-service.ts`, `src-tauri/src/provider_service.rs`) implements:

- Centralized provider routing with model selection strategies (`src/core/model-strategy.ts`).
- Multiple provider backends (Rust-side provider service handles API communication).
- Credential management (`src/core/provider-credentials.ts`).
- Fallback and recovery routing (ADR-005).

The frontend provider service selects models; the Rust host executes provider API calls.

## Current Boundaries

These boundaries are enforced in the current code:

| Boundary | Enforcement |
|----------|-------------|
| Rust host ↔ React frontend | Tauri invoke bridge only. |
| Add-on ↔ Shell | SDK surface + capability declarations. |
| Add-on ↔ Add-on | No direct cross-add-on communication; mediated by shell. |
| Frontend ↔ External network | Through Rust host provider service (not direct fetch). |
| Memory domains | Separated by domain type; Living Archive host service controls access. |
| File system | Tauri capability-gated; add-ons request file access via manifest. |

## Do Not Assume Yet

The following areas are not yet fully characterized and should not be assumed:

- **Complete add-on isolation** — the current SDK may not enforce hard process-level sandboxing for all add-on types. Needs verification.
- **Production readiness of all providers** — provider routing and fallback are implemented but may not cover all edge cases. Needs verification.
- **Cross-platform parity** — browser embedding, PTY handling, and file system paths may differ between macOS, Windows, and Linux. Needs verification.
- **Performance characteristics under load** — no load-testing evidence exists yet. Needs verification.
- **Security audit of capability enforcement** — the policy layer exists but has not been externally audited. Needs verification.
- **Add-on SDK stability** — the SDK surface may change. Add-on developers should pin to a version once stabilized.
- **Living Archive durability guarantees** — SQLite-backed but no durability-level SLAs yet. Needs verification.

---

*This overview describes the repository as observed. Update when architectural changes land, and run a drift review after each significant refactor.*
