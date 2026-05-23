# Pi Adapter Contract — Campaign Runner

**Status:** Proposed  
**Applies to:** Pi provider-broker adapter for Campaign Runner.  
**References:** PROVIDER_ADAPTER_CONTRACT.md, ADR-037

---

## Purpose

This document defines Pi as a lightweight provider-broker adapter for Campaign Runner. Pi satisfies the generic `PROVIDER_ADAPTER_CONTRACT.md` and adds broker-specific capabilities: route resolution, provider transparency, and low-footprint execution.

---

## What Pi Is

Pi is a **local coding agent harness** that can also serve as a provider broker. When used as a Campaign Runner adapter:

- Pi receives a prompt and schema from Campaign Runner.
- Pi resolves which backend provider to use (internal model routing).
- Pi invokes the resolved provider, collects the output, and returns it with a backend receipt.
- Campaign Runner sees only the adapter interface — not which provider Pi used internally.

### Identity Boundaries

| Claim | Truth |
|-------|-------|
| Pi is Campaign Runner core | **No.** Pi is an adapter. Campaign Runner core owns the pipeline. |
| Pi is ResonantOS runtime | **No.** Pi is external to the ResonantOS shell. |
| Pi is a provider fabric replacement | **No.** Pi is a broker for Campaign Runner tasks. The ResonantOS provider fabric (ADR-005) is a separate runtime system. |
| Pi is an execution broker layer | **Yes.** Pi sits between Campaign Runner and the actual inference provider. |
| Pi is OpenRouter | **No.** Pi is a local harness, not a hosted API gateway. Pi may internally route to providers including those accessible via OpenRouter, but Pi itself is not an API service. |

---

## Pi Route Resolution

Pi maintains an internal route table mapping task requirements to available providers. Route resolution is transparent to Campaign Runner — the core sees only the resolved backend receipt.

### Route Resolution Flow

```
Campaign Runner                Pi Adapter                  Provider
      │                            │                          │
      │── execute(stage, prompt,   │                          │
      │          schema, config) ─▶│                          │
      │                            │── resolve_route()        │
      │                            │   • check availability   │
      │                            │   • match model reqs     │
      │                            │   • apply cost policy    │
      │                            │   • select provider      │
      │                            │── invoke(provider,       │
      │                            │          prompt, schema)─▶│
      │                            │                          │── inference
      │                            │◀── raw_output ──────────│
      │                            │── validate_schema()      │
      │                            │── build_receipt()        │
      │◀── backend_receipt ───────│                          │
      │◀── structured_output ─────│                          │
```

### Route Resolution Rules

- Pi may internally support many providers. Campaign Runner depends only on the adapter contract, not on Pi's internal route table.
- Pi internals are replaceable. The operator may configure Pi's route table without changing Campaign Runner.
- Route resolution failures must be reported with `error_detail` including attempted routes.
- Pi must not silently downgrade model quality. If the requested model is unavailable, Pi must report the mismatch rather than substituting a weaker model without notice.

---

## Required Backend Receipt

Pi must return the following backend receipt after each execution stage:

```yaml
backend_provider: "pi"
backend_version: "<pi_version>"          # e.g., "1.0.0"
pi_route: "<route_identifier>"           # e.g., "claude-sonnet-direct", "openai-gpt5"
resolved_provider: "<actual_provider>"   # e.g., "anthropic", "openai", "local"
resolved_model: "<model_id>"             # e.g., "claude-sonnet-4-20250514"
schema_mode: "<structured | unstructured>"
execution_mode: "<dry-run | execute>"
```

### Example Receipts

```yaml
# Pi routing to Anthropic Claude directly
backend_provider: "pi"
backend_version: "1.0.0"
pi_route: "claude-sonnet-direct"
resolved_provider: "anthropic"
resolved_model: "claude-sonnet-4-20250514"
schema_mode: "structured"
execution_mode: "execute"
```

```yaml
# Pi routing to OpenAI via local config
backend_provider: "pi"
backend_version: "1.0.0"
pi_route: "openai-gpt5-codex"
resolved_provider: "openai"
resolved_model: "gpt-5.1-codex"
schema_mode: "structured"
execution_mode: "dry-run"
```

```yaml
# Pi routing to local Ollama model
backend_provider: "pi"
backend_version: "1.0.0"
pi_route: "local-ollama-qwen"
resolved_provider: "local"
resolved_model: "qwen3:4b"
schema_mode: "unstructured"
execution_mode: "execute"
```

---

## Schema Enforcement Expectations

Pi must enforce the same schema contract as any other adapter:

1. Pi receives the output schema from Campaign Runner (e.g., `mega_audit_output.schema.json`).
2. Pi configures the resolved provider for structured output when supported.
3. If the provider supports native JSON schema mode, Pi passes the schema directly.
4. If the provider does not support native schema mode, Pi instructs the provider to output JSON and validates the response against the schema before returning to Campaign Runner.
5. Schema-invalid output must be rejected. Pi may retry with explicit schema adherence instructions.

---

## Lightweight Dependency Advantages

Pi provides several advantages over heavy CLI adapters (codex, claude):

| Aspect | Pi Adapter | CLI Adapter (codex/claude) |
|--------|-----------|---------------------------|
| **RAM footprint** | Minimal (Pi runs as existing process) | 200-500MB per CLI binary + Node.js runtime |
| **Startup latency** | Near-zero (already running) | 1-3 seconds (Node.js + binary load) |
| **Provider plurality** | Single adapter, many backends | One binary per provider |
| **Configuration surface** | Single config file or env vars | Per-provider config, auth, and flags |
| **Cross-platform** | Runs wherever the agent harness runs | Platform-specific binaries |
| **Update cadence** | Decoupled from provider releases | Tied to provider CLI release cycles |
| **Offline/air-gap** | Can route to local models | Typically requires cloud API access |

### When to use Pi vs CLI Adapters

| Scenario | Recommended Adapter |
|----------|-------------------|
| Operator already has codex/claude installed and configured | CLI adapter (lower abstraction overhead) |
| Operator wants provider flexibility without installing multiple CLIs | Pi adapter |
| Operator is running in a resource-constrained environment | Pi adapter |
| Operator needs local model fallback | Pi adapter (with local route) |
| Operator needs maximum determinism (single known provider) | CLI adapter |
| Operator wants provider transparency (visible route resolution) | Pi adapter |

---

## Failure Behaviors

| Failure Mode | Pi Adapter Behavior |
|-------------|-------------------|
| Provider unavailable | Report `error_detail` with attempted provider. Attempt fallback if configured in Pi's route table. Log fallback chain. |
| Schema-invalid response | Retry with schema adherence instructions (up to configured max). Report retry count. If all retries fail, return error to core. |
| Route resolution failure | Report `error_detail` listing attempted routes. Do not fabricate a route. |
| Backend mismatch | Pi must not produce a mismatched receipt. If the resolved provider does not match the requested provider, Pi must report this explicitly rather than substituting silently. |
| Timeout | Report timeout duration. Offer retry with configurable longer timeout. |
| Partial output | Reject. Do not return partial data. Report truncation point. |

---

## Non-Goals

- Pi is NOT required for Campaign Runner operation. CLI adapters (codex, claude) remain supported.
- Pi is NOT a replacement for the ResonantOS provider fabric. Pi brokers provider calls for Campaign Runner specifically. The provider fabric handles runtime provider routing for the ResonantOS shell.
- Pi does NOT manage provider credentials. Pi may read credentials from environment or config, but it does not store, rotate, or secure them.
- Pi is NOT OpenRouter-as-a-service. Pi is a local harness, not a hosted API gateway.

---

## Reference

- `docs/specs/campaign-runner/PROVIDER_ADAPTER_CONTRACT.md` — Generic provider adapter contract.
- `docs/adr/ADR-037-campaign-runner-pi-provider-broker.md` — ADR for Pi as preferred adapter.
- `docs/adr/ADR-036-campaign-runner-provider-adapter-contract.md` — ADR for adapter contract.
- `docs/adr/ADR-035-existing-campaign-runner-integration.md` — Integration decision.
