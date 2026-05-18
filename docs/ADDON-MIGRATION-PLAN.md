# Add-On Migration Plan: OpenClaw Extensions → vNext Add-Ons

**Date:** 2026-05-08
**Author:** Linus (Architecture Subagent)
**Status:** Draft

---

## Overview

This plan covers migrating six OpenClaw extensions from `~/.openclaw/extensions/` to ResonantOS vNext add-on manifests. Three extensions already have vNext equivalents and are excluded:

- `shield-gate` → `addon.shield` (exists)
- `xavier-awareness` → `addon.r-awareness` (exists)
- `tts-enforcer` → `addon.tts-enforcer` (exists)

The stock `addon.browser` covers the native Resonant Browser; `camofox-browser` is a SEPARATE anti-detection interceptor layer and gets its own add-on (see Deliverable 2).

---

## Migration Matrix

| Old Extension | vNext Add-On ID | Category | Runtime Type | Priority |
|---|---|---|---|---|
| `camofox-browser` | `addon.camofox-browser` | `tool` | `local-service` | **HIGH** |
| `coherence-gate` | `addon.coherence-gate` | `security` | `local-service` | **MEDIUM** |
| `heuristic-auditor` | `addon.heuristic-auditor` | `security` | `local-service` | **MEDIUM** |
| `lia-verifier` | `addon.lia-verifier` | `security` | `local-service` | **LOW** |
| `lossless-claw` | `addon.lossless-context` | `memory` | `local-service` | **HIGH** |
| `usage-tracker` | `addon.usage-tracker` | `integration` | `local-service` | **MEDIUM** |

---

## 1. `addon.camofox-browser` — Anti-Detection Browser Interceptor

**Old:** `~/.openclaw/extensions/camofox-browser/` (server.js + openclaw.plugin.json)
**Priority:** HIGH — Active, production-grade, 10 tools, ~1800 LOC server

### vNext Mapping

| Field | Value |
|---|---|
| **ID** | `addon.camofox-browser` |
| **Category** | `tool` |
| **Runtime Type** | `local-service` |
| **Required Capabilities** | `network`, `browser-control`, `ui-embedding` |
| **Service Protocol** | `http-json` (Express server on port 9377) |
| **Surface** | `background-task-monitor` (stealth status indicator) |
| **Delegation** | Accepts `browser-inspection`, `research` task types |

### Architecture Changes from OpenClaw Version

1. **No `before_tool_call` hook** — Camofox doesn't intercept OpenClaw hooks; it's a standalone HTTP service the host routes browser commands to when stealth is needed.
2. **Interceptor concept** — The vNext host's browser routing layer checks if a target URL/domain needs anti-detection, then routes the command to Camofox's HTTP API instead of the stock Chromium browser service.
3. **Install contract** — `detect-existing-or-install` mode: check for Camoufox binary, offer to install via `npx camoufox-js fetch` if missing.
4. **Health endpoint** — Existing `/health` endpoint maps directly to vNext health strategy.
5. **10 tools** → vNext `AddOnToolDefinition[]` with proper `inputSchema`/`outputSchema`/`audit` blocks.

### Implementation Plan

- [x] Manifest: `~/resonantos-vnext/public/addons/camofox-browser.json` (Deliverable 2)
- [ ] Catalog update: add to `index.json`
- [ ] Validation: must pass `validateAddOnManifest()`
- [ ] Host routing integration: browser_host_service.rs needs a "stealth route" decision point
- [ ] Domain list: configurable list of domains requiring anti-detection (Google, Amazon, LinkedIn, CloudFlare-protected)

---

## 2. `addon.coherence-gate` — Task Drift Detection

**Old:** `~/.openclaw/extensions/coherence-gate/` (hooks `before_tool_call`)
**Priority:** MEDIUM — Active, lightweight

### vNext Mapping

| Field | Value |
|---|---|
| **ID** | `addon.coherence-gate` |
| **Category** | `security` |
| **Runtime Type** | `local-service` |
| **Required Capabilities** | `chat-interface`, `notifications` |
| **Service Protocol** | `host-command` |
| **Surface** | `background-task-monitor` (drift alert indicator) |

### Architecture Changes

1. **No `before_tool_call` hook** — vNext doesn't expose OpenClaw's hook system. Coherence-gate becomes an advisory service that the Strategist agent queries before committing to a task change.
2. **Task state tracking** — Moves from in-hook state to a lightweight SQLite or in-memory state tracked by the local service.
3. **Notifications** — Uses vNext `notifications` capability to surface drift alerts in the UI.

### Implementation Plan

- [ ] Write manifest `coherence-gate.json`
- [ ] Port hook logic to a `host-command` service that exposes:
  - `coherence.check_drift` — given current task + proposed action, returns drift score
  - `coherence.set_task` — registers the current task context
  - `coherence.status` — returns current task and drift history
- [ ] Strategist integration: agent queries coherence-gate before context switches
- [ ] Add to `index.json`

---

## 3. `addon.heuristic-auditor` — Post-Response Quality Audit

**Old:** `~/.openclaw/extensions/heuristic-auditor/` (hooks `agent_end`)
**Priority:** MEDIUM — Active, fires after every response

### vNext Mapping

| Field | Value |
|---|---|
| **ID** | `addon.heuristic-auditor` |
| **Category** | `security` |
| **Runtime Type** | `local-service` |
| **Required Capabilities** | `chat-interface`, `providers`, `archive-intake-write`, `notifications` |
| **Service Protocol** | `host-command` |
| **Surface** | `background-task-monitor` (audit status) |

### Architecture Changes

1. **No `agent_end` hook** — vNext add-ons observe chat via the `chat-interface` capability. The auditor subscribes to outbound messages and runs heuristic checks asynchronously.
2. **Model requirement** — Needs `providers` capability to call an LLM for heuristic violation detection.
3. **Violation logging** — Writes audit findings to Living Archive intake (`archive-intake-write`).
4. **Config migration** — `model`, `minResponseTokens` config moves to vNext manifest `configSchema` equivalent (service-level config).

### Implementation Plan

- [ ] Write manifest `heuristic-auditor.json`
- [ ] Port audit logic to service with tools:
  - `auditor.check_response` — manually trigger audit on a response
  - `auditor.status` — recent audit results
  - `auditor.config` — get/set thresholds
- [ ] Subscribe to outbound chat events via `chat-interface`
- [ ] Add to `index.json`

---

## 4. `addon.lia-verifier` — 5-Gate Verification Stack

**Old:** `~/.openclaw/extensions/lia-verifier/` (hooks `agent_end`, calls external stack at port 8095)
**Priority:** LOW — Currently disabled

### vNext Mapping

| Field | Value |
|---|---|
| **ID** | `addon.lia-verifier` |
| **Category** | `security` |
| **Runtime Type** | `local-service` |
| **Required Capabilities** | `chat-interface`, `network`, `providers`, `archive-intake-write`, `notifications` |
| **Service Protocol** | `http-json` (proxies to LIA stack at port 8095) |
| **Surface** | `page` (verification dashboard) |

### Architecture Changes

1. **External dependency** — LIA stack runs as a separate service (port 8095). The vNext add-on acts as a bridge/proxy.
2. **5 gates** — Structural, hallucination, logic, consensus, adversarial checks. Each gate is a separate tool.
3. **Chat observation** — Same pattern as heuristic-auditor: subscribe via `chat-interface`.
4. **Status:** Disabled in OpenClaw, so low priority for migration. Port when the LIA stack itself is stable.

### Implementation Plan

- [ ] Write manifest `lia-verifier.json`
- [ ] Service bridges to external LIA stack with tools:
  - `lia.verify_response` — run all 5 gates
  - `lia.verify_gate` — run a specific gate
  - `lia.status` — stack health + recent results
- [ ] Dashboard surface for viewing verification results
- [ ] Add to `index.json`

---

## 5. `addon.lossless-context` — DAG-Based Context Compression (LCM)

**Old:** `~/.openclaw/extensions/lossless-claw/` (npm: `@martian-engineering/lossless-claw`, occupies `contextEngine` slot)
**Priority:** HIGH — Core infrastructure, active context engine

### vNext Mapping

| Field | Value |
|---|---|
| **ID** | `addon.lossless-context` |
| **Category** | `memory` |
| **Runtime Type** | `local-service` |
| **Required Capabilities** | `memory-provider`, `providers`, `chat-interface` |
| **Service Protocol** | `stdio-json-rpc` or `host-command` |
| **Surface** | `page` (context visualization dashboard) |
| **System Slot** | `memory-system` (replaces built-in compaction) |

### Architecture Changes

1. **Slot → SystemSlot** — OpenClaw's `contextEngine` slot maps to vNext's `memory-system` system slot.
2. **Agent tools preserved** — `lcm_grep`, `lcm_describe`, `lcm_expand`, `lcm_expand_query` become vNext tool definitions.
3. **Config migration** — Rich configSchema (contextThreshold, freshTailCount, incrementalMaxDepth, etc.) maps to service-level config.
4. **DB path** — `~/.openclaw/lcm.db` needs consideration for vNext's data directories.
5. **Provider needs** — LCM calls LLMs for summarization; needs `providers` capability.

### Implementation Plan

- [ ] Write manifest `lossless-context.json`
- [ ] Map system slot: `{ id: "memory-system", role: "default-provider", replaceable: true }`
- [ ] Port 4 agent tools to vNext tool definitions
- [ ] Migrate 20+ config options to service config
- [ ] Preserve backward compat with existing `lcm.db`
- [ ] Add to `index.json`

---

## 6. `addon.usage-tracker` — Token/Cost Tracking

**Old:** `~/.openclaw/extensions/usage-tracker/` (minimal manifest)
**Priority:** MEDIUM — Active, no hooks, passive telemetry

### vNext Mapping

| Field | Value |
|---|---|
| **ID** | `addon.usage-tracker` |
| **Category** | `integration` |
| **Runtime Type** | `local-service` |
| **Required Capabilities** | `chat-interface`, `archive-intake-write` |
| **Service Protocol** | `host-command` |
| **Surface** | `page` (usage dashboard with cost breakdown) |

### Architecture Changes

1. **Chat observation** — Subscribes to `chat-interface` to capture `ProviderUsageTelemetry` from each response.
2. **Storage** — SQLite for usage records (tokens, cost estimates, per-model breakdown).
3. **Dashboard** — Full page surface with daily/weekly/monthly cost views.
4. **Archive integration** — Writes periodic usage summaries to Living Archive intake.

### Implementation Plan

- [ ] Write manifest `usage-tracker.json`
- [ ] Service with tools:
  - `usage.summary` — current period usage
  - `usage.breakdown` — per-model/per-agent breakdown
  - `usage.export` — export CSV/JSON
- [ ] Dashboard page surface
- [ ] Add to `index.json`

---

## Migration Order

| Phase | Add-Ons | Rationale |
|---|---|---|
| **Phase 1** | `addon.camofox-browser`, `addon.lossless-context` | Core infrastructure — browser stealth + context management |
| **Phase 2** | `addon.coherence-gate`, `addon.usage-tracker` | Active quality/observability tools |
| **Phase 3** | `addon.heuristic-auditor` | Post-response auditing |
| **Phase 4** | `addon.lia-verifier` | Currently disabled, port when LIA stack is stable |

---

## Key Architecture Differences: OpenClaw → vNext

| OpenClaw Pattern | vNext Equivalent |
|---|---|
| `before_tool_call` hook | Advisory service queried by Strategist agent |
| `agent_end` hook | `chat-interface` capability (observe outbound messages) |
| `contextEngine` slot | `memory-system` system slot |
| `openclaw.plugin.json` | vNext `AddOnManifest` (full typed manifest) |
| `plugins.entries` in openclaw.json | `installations` in `ResonantShellState` |
| Direct `index.js` hooks | `local-service` with `host-command` or `http-json` protocol |
| Plugin config in openclaw.json | Service-level config via add-on settings |

---

## Validation Checklist (All Manifests)

Every manifest MUST pass `validateAddOnManifest()`:

- [ ] `id` matches `addon.{namespace-name}` pattern
- [ ] `version` is semantic (e.g., `0.1.0`)
- [ ] `category` is valid enum
- [ ] `runtimeType` is valid enum
- [ ] `surfaces` array with unique ids and valid types
- [ ] `requestedCapabilities` array with valid capability/scope/revocationBehavior
- [ ] `providerRequirements.sharedProfiles` is string array
- [ ] `providerRequirements.supportsPrivateCredentials` is boolean
- [ ] `archiveIntegration.canWriteKnowledgePages` is `false`
- [ ] `health.strategy` is non-empty string
- [ ] `installHooks` is object
- [ ] `compatibility.shellVersion` and `compatibility.platforms` present
- [ ] All tool `requiredCapabilities` reference capabilities in `requestedCapabilities`
- [ ] All tool names are unique
- [ ] All tool `inputSchema`, `outputSchema`, `audit` are valid objects
