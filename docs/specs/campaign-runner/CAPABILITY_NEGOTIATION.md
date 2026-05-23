# Capability Negotiation — Campaign Runner

**Status:** Proposed  
**Applies to:** Adapter selection after discovery, before campaign execution.  
**References:** ADAPTER_DISCOVERY.md, PROVIDER_ADAPTER_CONTRACT.md, ADR-036, ADR-039

---

## Purpose

This document defines how Campaign Runner negotiates capabilities with discovered provider adapters. After discovery identifies candidates, capability negotiation determines which candidate can satisfy the campaign's requirements — and rejects those that cannot.

---

## Adapter Capability Declaration

Every adapter must declare its capabilities. The declaration is either:

1. **Static** — embedded in the adapter module (for built-in adapters: pi, codex, claude).
2. **Dynamic** — returned by the adapter on startup (`<adapter> capabilities --json`).
3. **Configured** — declared in the adapter registry entry.

### Capability Declaration Format

```yaml
adapter_id: pi
adapter_version: "1.0.0"
declared_at: "2026-05-22T23:00:00Z"
capabilities:
  # Schema and output
  schema_mode: true              # Can produce schema-validated JSON output
  supported_output_modes:        # Output formats the adapter can produce
    - json
    - markdown
  structured_output_native: true # Provider supports native JSON schema mode

  # Reliability
  retry: true                    # Adapter can retry on failure
  max_retries: 3                 # Maximum retry attempts
  fallback: true                 # Adapter can fall back to alternative providers
  fallback_chain_recorded: true  # Fallback steps are logged in backend receipt

  # Performance
  streaming: false               # Adapter supports streaming output
  max_context_tokens: 200000     # Maximum context window
  avg_latency_ms: 2000           # Expected round-trip latency (approximate)

  # Execution
  local_execution: true          # Can execute via local provider
  hosted_execution: true         # Can execute via hosted/cloud provider
  offline_capable: true          # Can execute without internet (via local models)
  tools: false                   # Adapter supports tool use during execution
  parallel_tasks: false          # Can execute multiple tasks concurrently

  # Compliance
  no_silent_provider_switch: true # Guarantees provider switch recording
  schema_validation: true         # Adapter validates output against schema
  timeout_configurable: true      # Timeout can be configured per stage
```

### Built-in Adapter Capability Declarations

These are the known capability profiles for built-in adapters. They are embedded in Campaign Runner core and updated with each release.

```yaml
# pi adapter (v1.0.0)
adapter_id: pi
capabilities:
  schema_mode: true
  supported_output_modes: [json, markdown]
  structured_output_native: false   # Pi does not pass schema to provider natively
  retry: true
  max_retries: 3
  fallback: true
  fallback_chain_recorded: true
  streaming: true
  max_context_tokens: 200000
  local_execution: true
  hosted_execution: true
  offline_capable: true
  tools: true                       # Pi supports tool use (read, bash, edit, write)
  parallel_tasks: false
  no_silent_provider_switch: true
  schema_validation: true
  timeout_configurable: true

# codex adapter (v0.1.0a0)
adapter_id: codex
capabilities:
  schema_mode: true
  supported_output_modes: [json]
  structured_output_native: true    # codex exec --output-schema
  retry: false                      # No built-in retry
  max_retries: 0
  fallback: false                   # No provider fallback
  fallback_chain_recorded: false
  streaming: false
  max_context_tokens: 200000
  local_execution: false            # Cloud-only
  hosted_execution: true
  offline_capable: false
  tools: false
  parallel_tasks: false
  no_silent_provider_switch: true   # Single provider, no switch possible
  schema_validation: false          # Relies on provider's native schema mode
  timeout_configurable: false

# claude adapter (v0.1.0a0)
adapter_id: claude
capabilities:
  schema_mode: true
  supported_output_modes: [json]
  structured_output_native: true    # claude --json-schema
  retry: false
  max_retries: 0
  fallback: false
  fallback_chain_recorded: false
  streaming: false
  max_context_tokens: 200000
  local_execution: false
  hosted_execution: true
  offline_capable: false
  tools: false
  parallel_tasks: false
  no_silent_provider_switch: true
  schema_validation: false
  timeout_configurable: false
```

---

## Campaign Requirements Declaration

Campaigns declare what they need from an adapter. Requirements are either:

1. **Explicit** — declared in the campaign definition (CAMPAIGN_TEMPLATE.md or campaign set JSON).
2. **Implicit** — derived from the campaign's schema validation, retry policy, and execution mode.

### Campaign Requirements Format

```yaml
# In campaign definition or derived by the runner
requires:
  schema_mode: true                # Campaign requires schema-validated output
  retry: true                      # Campaign requires retry capability
  max_context_tokens: 50000        # Campaign needs at least 50K context
  output_mode: json                # Campaign expects JSON output
  no_silent_provider_switch: true  # Campaign forbids silent provider changes
  max_latency_ms: 30000            # Campaign tolerates up to 30s latency
  offline_capable: false           # Campaign does not require offline capability

prefers:
  fallback: true                   # Campaign prefers fallback capability
  streaming: false                 # Campaign does not need streaming
  local_execution: false           # Campaign does not need local execution
  tools: false                     # Campaign does not require tool use
```

### Required vs Preferred

| Type | Behavior if unmet |
|------|------------------|
| **Required** (`requires`) | Adapter is **rejected**. Campaign cannot proceed with this adapter. |
| **Preferred** (`prefers`) | Adapter is **warned**. Campaign can proceed, but a warning is recorded. Operator may override. |

---

## Negotiation Result

After evaluating all discovered adapters against campaign requirements, Campaign Runner produces a negotiation result:

```yaml
negotiation_result:
  selected_adapter: pi
  selection_reason: "satisfies all required capabilities; highest priority among qualified"
  negotiation_timestamp: "2026-05-22T23:00:00Z"

  qualified_adapters:
    - id: pi
      score: 95
      unmet_required: []
      unmet_preferred: []

  rejected_adapters:
    - id: claude
      reason: "required capability unmet: retry"
      unmet_required: [retry]
    - id: codex
      reason: "command unavailable"
      unmet_required: [retry, fallback]
```

### Scoring

Qualified adapters are scored to break ties when multiple adapters satisfy all requirements:

| Factor | Weight | Description |
|--------|--------|-------------|
| Priority (from registry) | High | Lower priority number = higher score |
| Preferred capabilities matched | Medium | Each matched `prefers` field adds points |
| Latency estimate | Low | Lower latency = higher score |
| Provider transparency | Medium | `no_silent_provider_switch: true` adds points |

---

## Hard Fail vs Warning Behavior

| Scenario | Behavior |
|----------|----------|
| No adapter satisfies all `requires` | **Hard fail.** Campaign aborts. Error lists which requirements no adapter could satisfy. |
| Selected adapter satisfies all `requires` but misses some `prefers` | **Warning.** Campaign proceeds. Warning recorded in run_inputs. Operator can review and override. |
| Selected adapter satisfies all `requires` and all `prefers` | **Clean proceed.** No warnings. |
| Discovery found no adapters at all | **Fall through to manual/noop.** Campaign can proceed with human operator. |

---

## Fallback Rules

### Adapter-Level Fallback

If the selected adapter supports `fallback: true` (e.g., Pi), the adapter manages its own fallback chain internally. Campaign Runner does not participate in adapter-level fallback beyond receiving the `fallback_chain` field in the backend receipt.

### Runner-Level Fallback

If the selected adapter fails at runtime (not during capability negotiation), Campaign Runner may fall back to the next qualified adapter from the negotiation result. This is only permitted if:

1. The failure occurs before any file mutation (safe to retry with a different adapter).
2. The campaign's `requires` does not forbid adapter-level fallback.
3. The fallback is recorded in the campaign's backend receipt with `fallback_reason`.

Runner-level fallback is NOT the same as adapter-level fallback. The runner switches adapters; the adapter switches providers within itself.

---

## Provider Switch Disclosure

### Within a single adapter

If an adapter (e.g., Pi) switches providers internally:

1. The adapter records the switch in the backend receipt's `fallback_chain`.
2. The adapter must not silently switch. Every switch is logged.
3. If the campaign requires `no_silent_provider_switch: true`, the adapter must satisfy this capability.

### Between adapters (runner-level fallback)

If Campaign Runner switches adapters:

1. The switch is recorded in `run_inputs.json` with `adapter_fallback` event.
2. Each adapter's execution gets its own backend receipt.
3. The handoff packet documents the adapter chain.

---

## Schema-Mode Compatibility

| Adapter Schema Mode | Campaign Requires Schema | Result |
|--------------------|------------------------|--------|
| `schema_mode: true` + `structured_output_native: true` | `schema_mode: true` | ✅ Best case: provider enforces schema natively |
| `schema_mode: true` + `structured_output_native: false` | `schema_mode: true` | ✅ Acceptable: adapter validates schema post-hoc |
| `schema_mode: false` | `schema_mode: true` | ❌ Reject: adapter cannot guarantee schema compliance |
| `schema_mode: true` | schema not required | ✅ Proceed: schema capability is unused |

---

## Timeout Handling

| Campaign Requirement | Adapter Capability | Behavior |
|---------------------|-------------------|----------|
| `max_latency_ms: 30000` | `timeout_configurable: true` | Adapter configured with 30s timeout |
| `max_latency_ms: 30000` | `timeout_configurable: false` | Warning if adapter's `avg_latency_ms > 30000`. Campaign proceeds but may time out. |
| No latency requirement | Any | No timeout enforcement. Adapter default applies. |

---

## Context Budget Handling

| Campaign Requirement | Adapter Capability | Behavior |
|---------------------|-------------------|----------|
| `max_context_tokens: 50000` | `max_context_tokens: 200000` | ✅ Proceed. 50K fits in 200K. |
| `max_context_tokens: 50000` | `max_context_tokens: 32000` | ❌ Reject. Campaign requires more context than adapter provides. |
| No context requirement | Any | Proceed. Adapter default applies. |

---

## How Capability Mismatch Is Reported

Every capability mismatch is recorded in the negotiation result and in campaign artifacts:

```json
{
  "capability_negotiation": {
    "campaign_requires": {
      "schema_mode": true,
      "retry": true,
      "max_context_tokens": 50000
    },
    "adapter_evaluated": "claude",
    "result": "rejected",
    "unmet_required": ["retry"],
    "detail": "claude adapter does not support retry. Campaign requires retry: true."
  }
}
```

---

## Non-Goals

- Capability negotiation does NOT test adapter behavior at runtime. It evaluates declared capabilities only. Runtime validation is a separate concern (execution smoke tests, schema validation).
- Capability negotiation does NOT manage provider credentials. That is the adapter's responsibility.
- Capability negotiation does NOT select models. Model selection is internal to the adapter and reported via backend receipt.

---

## Reference

- `docs/specs/campaign-runner/ADAPTER_DISCOVERY.md` — Adapter discovery.
- `docs/specs/campaign-runner/PROVIDER_ADAPTER_CONTRACT.md` — Adapter contract.
- `docs/adr/ADR-039-campaign-runner-capability-negotiation.md` — ADR for this spec.
- `docs/adr/ADR-036-campaign-runner-provider-adapter-contract.md` — Adapter contract ADR.
- `docs/adr/ADR-037-campaign-runner-pi-provider-broker.md` — Pi broker ADR.
- `docs/adr/ADR-038-campaign-runner-adapter-discovery.md` — Discovery ADR.
