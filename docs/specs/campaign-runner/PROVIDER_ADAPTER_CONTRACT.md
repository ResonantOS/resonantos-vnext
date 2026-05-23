# Provider Adapter Contract — Campaign Runner

**Status:** Proposed  
**Applies to:** All provider integrations with Campaign Runner.  
**References:** ADR-035, ADR-036, TEMPLATE_CONTRACT.md

---

## Purpose

This document defines the contract between Campaign Runner's **core orchestration layer** and **provider adapters**. It ensures Campaign Runner remains provider-agnostic while supporting multiple backends through a standardized adapter interface.

---

## Separation of Concerns

### Campaign Runner Core (owns)

The core orchestration layer is responsible for:

| Concern | Description |
|---------|-------------|
| **Campaign lifecycle** | Audit → compile → execute pipeline orchestration. |
| **Schema validation** | Validating provider output against JSON schemas (`mega_audit_output.schema.json`, `campaign_set.schema.json`, `task_result.schema.json`). |
| **Artifact isolation** | Ensuring output is written only to declared, gitignored paths. |
| **Git safety** | Enforcing clean-tree invariant. Managing campaign branches. Committing task artifacts. |
| **Checkpoint enforcement** | Requiring audit, compile, per-task, and completion checkpoints. |
| **Handoff generation** | Producing handoff packets per `CAMPAIGN_HANDOFF_TEMPLATE.md`. |
| **Forbidden-zone enforcement** | Verifying no files were modified outside declared scope. |
| **State machine** | Tracking campaign/task status in `state.json`. |

### Provider Adapter (owns)

The adapter layer is responsible for:

| Concern | Description |
|---------|-------------|
| **Prompt execution** | Sending the rendered prompt to the provider and collecting the response. |
| **Backend invocation** | Launching the provider binary, HTTP client, or broker. |
| **Backend metadata reporting** | Returning `backend_provider`, `backend_version`, `resolved_provider`, `resolved_model` to the core. |
| **Retry policy** | Deciding whether and how to retry on failure. |
| **Structured output mode** | Configuring the provider for structured (JSON schema) output. |
| **Provider-specific configuration** | Managing auth, endpoints, model selection, and provider-specific flags. |
| **Model routing** | Selecting which model to use for each stage (audit, compile, task). |

### Provider (external)

The actual inference execution is owned by the provider:

| Provider | Interface |
|----------|-----------|
| OpenAI / Codex | CLI binary or HTTP API. |
| Anthropic / Claude | CLI binary or HTTP API. |
| Pi (local broker) | STDIO JSON-RPC or HTTP. |
| OpenRouter | HTTP API. |
| Local LLM (Ollama, llama.cpp) | HTTP API. |
| Manual / Noop | Human operator provides output. |

The Campaign Runner core never invokes a provider directly. All provider communication goes through an adapter.

---

## Required Adapter Outputs

Every adapter must return the following backend receipt to the core after each execution stage:

```yaml
# Backend Receipt (required)
backend_provider: "<adapter name>"        # e.g., "pi", "codex", "claude"
backend_version: "<version>"              # e.g., "2.1.50", "0.1.0"
resolved_provider: "<actual provider>"    # e.g., "anthropic", "openai", "local"
resolved_model: "<model_id>"             # e.g., "claude-sonnet-4-20250514"
schema_mode: "<structured | unstructured>" # Whether schema output was used
execution_mode: "<dry-run | execute>"     # From campaign config
passes: <N>                               # Pass count for this stage
```

### Optional Adapter Outputs

```yaml
# Extended Receipt (recommended)
retry_count: <N>                          # Number of retries before success
fallback_chain: ["<adapter1>", "..."]     # If fallback was used
latency_ms: <N>                           # Round-trip time
token_usage: {input: <N>, output: <N>}   # If available
error_detail: "<message>"                 # If failed
```

---

## Binding Rules

### No Silent Provider Switching
If the adapter changes the actual provider between stages or tasks, this must be recorded in the backend receipt. The core must reject a backend receipt where `resolved_provider` changes without explicit documentation.

### Backend Declaration Mandatory
Every campaign must declare its intended backend before execution. The adapter must confirm or reject the declared backend. If the adapter cannot match the declared backend, it must fail explicitly rather than silently substituting a different provider.

### Schema-Invalid Output Rejection
If the provider produces output that does not conform to the required JSON schema, the core must reject it. The adapter may retry with schema-adherence instructions, but it must not silently accept invalid output.

### Retry Behavior Must Be Explicit
If the adapter retries a failed invocation, it must report the retry count and reason. Silent retries are forbidden. The core may enforce a maximum retry count.

### Fallback Chains Must Be Logged
If the adapter uses a fallback chain (e.g., primary provider unavailable → fallback provider), every step in the chain must be logged in the backend receipt's `fallback_chain` field.

### Adapters Are Optional and Replaceable
No single adapter is mandatory. The core must function with any adapter that satisfies this contract. Adapters are integrations, not architecture. The Campaign Runner core does not depend on any specific adapter implementation.

---

## Recommended Adapter Classes

| Adapter Class | Interface | Typical Use |
|--------------|-----------|-------------|
| **pi** | STDIO JSON-RPC or HTTP | Lightweight local broker. Routes to multiple providers. Low RAM footprint. |
| **codex** | CLI subprocess (`codex exec`) | OpenAI Codex CLI. Schema-aware output mode. |
| **claude** | CLI subprocess (`claude -p`) | Anthropic Claude Code CLI. JSON output with schema flag. |
| **http-json** | HTTP POST with JSON body | Direct API access (OpenAI, Anthropic, OpenRouter). |
| **openrouter** | HTTP API via OpenRouter | Multi-provider routing through a single API key. |
| **local-llm** | HTTP API (Ollama, llama.cpp) | Local model inference. |
| **noop / manual** | Human operator provides output | Dry-run inspection. Manual campaign steering. |

### Adapter Implementation Guidance

- Each adapter is a single module or plugin.
- Adapters do not depend on each other.
- Adapters may share utility code (HTTP client, JSON schema helpers) but not orchestration logic.
- Adapters must not modify Campaign Runner core files.
- Adapters must not bypass the backend receipt contract.

---

## Adapter Lifecycle

```
Core                    Adapter                 Provider
  │                        │                       │
  │── render_prompt() ──▶  │                       │
  │── execute(stage) ────▶ │                       │
  │                        │── invoke() ─────────▶ │
  │                        │                       │── inference ──
  │                        │◀── raw_output ─────── │
  │                        │── validate_schema()   │
  │                        │── (retry if invalid)  │
  │◀── backend_receipt ─── │                       │
  │◀── structured_output ─ │                       │
  │── validate_output()    │                       │
  │── (reject if invalid)  │                       │
```

---

## Failure Behaviors

| Failure Mode | Core Behavior | Adapter Behavior |
|-------------|---------------|-----------------|
| Provider unavailable | Abort stage. Record failure. | Report `error_detail`. Offer fallback if configured. |
| Schema-invalid response | Reject output. Do not proceed to next stage. | Retry with schema adherence instructions (if configured). Report retry count. |
| Route resolution failure | Abort stage. Record failure. | Report `error_detail`. Log attempted routes. |
| Backend mismatch | Reject backend receipt. Abort stage. | Must not produce mismatched receipt. |
| Timeout | Abort stage. Record failure. | Report timeout duration. Offer retry with longer timeout. |
| Partial output (stream interrupted) | Reject output. Do not use partial data. | Report truncation point. Do not fabricate missing data. |

---

## Non-Goals

- Provider adapters are NOT a replacement for the ResonantOS provider fabric (ADR-005). Campaign Runner is a development tool; the provider fabric is a runtime system.
- Provider adapters do NOT manage credentials. Credential management is the provider's responsibility.
- Provider adapters do NOT implement inference. They are invocation wrappers, not AI runtimes.
- Provider adapters are NOT required to support all providers. An adapter may support exactly one backend.

---

## Reference

- `docs/adr/ADR-036-campaign-runner-provider-adapter-contract.md` — ADR for this contract.
- `docs/adr/ADR-037-campaign-runner-pi-provider-broker.md` — Pi adapter ADR.
- `docs/specs/campaign-runner/PI_ADAPTER_CONTRACT.md` — Pi-specific adapter contract.
- `docs/specs/campaign-runner/TEMPLATE_CONTRACT.md` — Campaign template contract.
- `docs/adr/ADR-035-existing-campaign-runner-integration.md` — Integration decision.
