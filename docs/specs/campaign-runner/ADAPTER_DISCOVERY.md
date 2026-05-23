# Adapter Discovery — Campaign Runner

**Status:** Proposed  
**Applies to:** Campaign Runner provider adapter resolution.  
**References:** PROVIDER_ADAPTER_CONTRACT.md, ADR-036, ADR-038

---

## Purpose

This document defines how Campaign Runner discovers available provider adapters before campaign execution. Discovery identifies candidates — it does not execute them. Capability negotiation (separate document) determines which candidate is selected.

---

## Discovery Priority Order

Campaign Runner resolves adapters in strict priority order. Higher-priority sources override lower-priority ones. Only the highest-priority source that produces a valid adapter configuration is used.

| Priority | Source | Description |
|----------|--------|-------------|
| **1** | Explicit campaign config | The campaign definition declares which adapter to use (`backend_provider` field in CAMPAIGN_TEMPLATE.md). |
| **2** | Environment variable | `CAMPAIGN_RUNNER_ADAPTER` or `CAMPAIGN_RUNNER_ADAPTER_CONFIG` points to a config file. |
| **3** | Local adapter registry file | `~/.config/campaign_runner/adapters.yaml` or `./campaign_runner.adapters.yaml` in the target repo root. |
| **4** | Built-in adapter defaults | Campaign Runner ships with known adapter defaults (pi, codex, claude). |
| **5** | Manual / noop adapter | Always available as a fallback. Requires human operator to provide output. |

### Resolution Flow

```
Campaign Start
      │
      ▼
┌─ Priority 1: Explicit campaign config ─────────────────────┐
│  campaign.backend_provider = "pi"                          │
│  → Use pi adapter. Skip remaining priorities.              │
└────────────────────────────────────────────────────────────┘
      │ (if not set)
      ▼
┌─ Priority 2: Environment variable ─────────────────────────┐
│  CAMPAIGN_RUNNER_ADAPTER = "claude"                        │
│  → Use claude adapter. Skip remaining priorities.          │
└────────────────────────────────────────────────────────────┘
      │ (if not set)
      ▼
┌─ Priority 3: Local adapter registry ───────────────────────┐
│  adapters.yaml: pi (priority 10), claude (priority 30)     │
│  → Select highest-priority enabled adapter: pi             │
└────────────────────────────────────────────────────────────┘
      │ (if no adapters enabled)
      ▼
┌─ Priority 4: Built-in defaults ────────────────────────────┐
│  Try pi (if command found), then codex, then claude.       │
│  → Select first available.                                 │
└────────────────────────────────────────────────────────────┘
      │ (if no built-in available)
      ▼
┌─ Priority 5: Manual / noop ────────────────────────────────┐
│  Always available. Operator provides output manually.      │
└────────────────────────────────────────────────────────────┘
```

---

## Local Adapter Registry Format

The registry file (`adapters.yaml`) lives at `~/.config/campaign_runner/adapters.yaml` or `./campaign_runner.adapters.yaml` in the target repo root. Repo-local overrides user-global.

```yaml
# Campaign Runner Adapter Registry
# ~/.config/campaign_runner/adapters.yaml

adapters:
  - id: pi
    enabled: true
    command: pi
    priority: 10
    config_ref: campaign-runner.pi
    description: "Pi agent harness — lightweight local broker"

  - id: claude
    enabled: false
    command: claude
    priority: 30
    config_ref: campaign-runner.claude
    description: "Anthropic Claude Code CLI"

  - id: codex
    enabled: false
    command: codex
    priority: 40
    config_ref: campaign-runner.codex
    description: "OpenAI Codex CLI"

  - id: openrouter
    enabled: false
    command: null
    endpoint: "https://openrouter.ai/api/v1/chat/completions"
    priority: 50
    config_ref: campaign-runner.openrouter
    description: "OpenRouter API gateway"

  - id: local-ollama
    enabled: false
    command: ollama
    endpoint: "http://localhost:11434"
    priority: 60
    config_ref: campaign-runner.local-ollama
    description: "Local Ollama inference"
```

### Registry Field Definitions

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique adapter identifier. Must match an adapter class name. |
| `enabled` | Yes | Whether this adapter is eligible for discovery. Disabled adapters are skipped. |
| `command` | No | CLI command or binary name. Validated via `which` or equivalent. |
| `endpoint` | No | HTTP endpoint for API-based adapters. |
| `priority` | Yes | Lower number = higher priority. Used to select among enabled adapters. |
| `config_ref` | No | Reference to adapter-specific configuration section. |
| `description` | No | Human-readable description. |

---

## Adapter Enable/Disable Semantics

| State | Meaning |
|-------|---------|
| `enabled: true` | Adapter is eligible for discovery. It may still fail validation (command not found, endpoint unreachable). |
| `enabled: false` | Adapter is explicitly disabled. It will not be considered, even if its command is available. |
| Adapter missing from registry | Treated as `enabled: false` for that adapter. Built-in defaults may still apply. |

### Command/Path Validation

When an adapter specifies a `command`:

1. Campaign Runner resolves the command using `PATH` lookup (or absolute path if specified).
2. If the command is not found, the adapter is marked `unavailable` with reason `command_not_found`.
3. If the command is found, the adapter attempts version detection: `<command> --version`.
4. If version detection succeeds, `backend_version` is populated.
5. If version detection fails, `backend_version` is `unknown` — this is a warning, not a failure.

When an adapter specifies an `endpoint`:

1. Campaign Runner performs a lightweight health check (HEAD or GET to the endpoint root).
2. If the endpoint is unreachable, the adapter is marked `unavailable` with reason `endpoint_unreachable`.
3. No credentials are sent during discovery health checks.

---

## How Missing Adapters Fail

| Scenario | Behavior |
|----------|----------|
| Explicit campaign config names an adapter, but adapter is disabled | **Error.** Campaign cannot proceed. Operator must enable the adapter or change the campaign config. |
| Explicit campaign config names an adapter, but adapter command is not found | **Error.** Campaign cannot proceed. Operator must install the adapter or change the campaign config. |
| Registry-based discovery finds no enabled adapters with valid commands | **Fall through to Priority 4 (built-in defaults).** |
| Built-in defaults find no available adapters | **Fall through to Priority 5 (manual/noop).** Campaign can proceed with human operator. |
| Manual/noop adapter is the only option | **Warning.** Campaign proceeds with manual execution. Operator is prompted to provide output. |

---

## How Explicit Campaign Selection Overrides Discovery

When a campaign explicitly declares a backend (CAMPAIGN_TEMPLATE.md Backend section):

```markdown
## Backend

- **Provider:** pi
```

Campaign Runner:

1. Skips Priority 2-4 entirely.
2. Looks up `pi` in the adapter registry.
3. If `pi` is enabled and its command/endpoint validates, uses it.
4. If `pi` is disabled or unavailable, **fails with an error** — does not fall back to other adapters.
5. Records the discovery path in campaign artifacts: `discovery_source: explicit_campaign_config`.

This ensures the operator's explicit choice is respected. Silent fallback from an explicitly chosen adapter is forbidden.

---

## How Discovery Is Recorded in Campaign Artifacts

Every campaign run records its discovery path in `run_inputs.json`:

```json
{
  "adapter_discovery": {
    "source": "local_registry",
    "registry_path": "~/.config/campaign_runner/adapters.yaml",
    "candidates_considered": ["pi", "claude", "codex"],
    "candidates_enabled": ["pi"],
    "candidates_available": ["pi"],
    "selected_adapter": "pi",
    "selection_reason": "highest_priority_enabled_available",
    "adapter_command": "/usr/local/bin/pi",
    "adapter_version": "1.0.0"
  }
}
```

| Field | Description |
|-------|-------------|
| `source` | Which discovery source was used (`explicit_campaign_config`, `environment`, `local_registry`, `builtin_defaults`, `manual`). |
| `registry_path` | Path to the registry file, if applicable. |
| `candidates_considered` | All adapters evaluated during discovery. |
| `candidates_enabled` | Subset that were `enabled: true`. |
| `candidates_available` | Subset that passed command/endpoint validation. |
| `selected_adapter` | The adapter chosen for execution. |
| `selection_reason` | Why this adapter was selected. |
| `adapter_command` | Resolved command path. |
| `adapter_version` | Detected version. |

---

## Discovery Does Not Mean Execution

Discovery identifies candidate adapters. It does not:

- Invoke the adapter.
- Negotiate capabilities (that's a separate step — see CAPABILITY_NEGOTIATION.md).
- Execute a campaign.
- Validate that the adapter can satisfy campaign requirements.

A discovered adapter may still be rejected during capability negotiation if it cannot meet campaign requirements.

---

## Reference

- `docs/specs/campaign-runner/CAPABILITY_NEGOTIATION.md` — Capability negotiation.
- `docs/specs/campaign-runner/PROVIDER_ADAPTER_CONTRACT.md` — Adapter contract.
- `docs/adr/ADR-038-campaign-runner-adapter-discovery.md` — ADR for this spec.
- `docs/adr/ADR-036-campaign-runner-provider-adapter-contract.md` — Adapter contract ADR.
- `docs/adr/ADR-037-campaign-runner-pi-provider-broker.md` — Pi broker ADR.
