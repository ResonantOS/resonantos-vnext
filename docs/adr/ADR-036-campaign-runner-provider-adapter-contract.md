# ADR-036: Campaign Runner Provider Adapter Contract

## Status

**Proposed.** This ADR records the decision to separate Campaign Runner's core orchestration from provider-specific invocation through a standardized adapter contract.

## Context

Campaign Runner (`codex_runner` v0.1.0a0) currently has two provider backends hardcoded in `runner.py`: `codex` and `claude`. Each is invoked through provider-specific CLI flags (`--codex-model`, `--claude-settings`), provider-specific subprocess calls (`run_codex_exec`, `run_claude_exec`), and provider-specific output parsing (`_parse_json_with_fallback`).

This works for two providers but creates several problems:

1. **Adding a new provider requires modifying core orchestration code.** Every new backend means new CLI flags, new subprocess wrapper functions, and new output parsing logic in `runner.py`.
2. **Provider assumptions leak into the core.** The core knows about `--codex-config` and `--claude-settings`. It dispatches on provider name strings. It has separate model flags per provider.
3. **No provider transparency.** The current backend receipt is implicit (stored in `run_inputs.json`). There is no structured receipt returned from the adapter to the core.
4. **No retry/fallback policy.** If a provider fails, the core has no standardized way to retry or fall back.
5. **Provider-specific configuration is command-line coupling.** Adding HTTP-based providers (OpenRouter, local Ollama) would require entirely new CLI flag surfaces.

The execution smoke test (campaign-runner-execution-smoke-test) revealed that provider failures are real: codex had a broken binary, claude produced schema-invalid output. These failures were handled at the core level rather than at an adapter level, making retry and fallback logic impossible without modifying core orchestration code.

## Decision

**Campaign Runner will use a provider adapter abstraction layer. The core orchestration will communicate with providers exclusively through a standardized adapter contract. Provider-specific invocation logic will live in adapter modules, not in the core orchestration layer.**

### Adapter Contract

The contract is defined in `docs/specs/campaign-runner/PROVIDER_ADAPTER_CONTRACT.md`. Key elements:

1. **Backend receipt** — every adapter must return structured metadata after each execution stage: `backend_provider`, `backend_version`, `resolved_provider`, `resolved_model`, `schema_mode`, `execution_mode`, `passes`.
2. **Standardized failure modes** — provider unavailable, schema-invalid response, route resolution failure, backend mismatch, timeout, partial output. Each has defined core and adapter behavior.
3. **No silent provider switching** — if the adapter changes providers, it must be recorded.
4. **Explicit retry** — retry count and reason must be reported. Silent retries are forbidden.
5. **Fallback chain logging** — if the adapter uses a fallback, every step must be logged.

### What Changes in Campaign Runner Core

| Current (v0.1.0a0) | Future (with adapter contract) |
|--------------------|-------------------------------|
| `run_codex_exec()` and `run_claude_exec()` hardcoded in `runner.py` | Single `run_provider_exec()` that dispatches to adapter |
| Provider-specific CLI flags (`--codex-model`, `--claude-settings`) | Generic `--adapter` flag + adapter-specific config |
| Provider dispatch via string comparison | Adapter registry with capability negotiation |
| Implicit backend metadata in `run_inputs.json` | Structured backend receipt returned by adapter |
| No retry/fallback in core | Core enforces retry policy from adapter receipt |

### What Does NOT Change

- Campaign lifecycle (audit → compile → execute).
- Schema validation.
- Artifact isolation and git safety.
- Checkpoint enforcement.
- Handoff generation.
- Forbidden-zone enforcement.
- State machine.
- Output directory conventions.

### Explicitly Rejected

| Rejected | Why |
|----------|-----|
| Hard dependency on Codex | Violates provider-agnostic principle. Lock-in to one vendor. |
| Hard dependency on Claude | Same. Providers are interchangeable execution engines. |
| Provider-specific logic in core orchestration layer | The core should not know about `--codex-config` or `--claude-settings`. Adapters encapsulate that. |
| Single universal adapter that wraps all providers | Complexity sink. Better to have focused adapters that each do one thing well. |
| Removing existing CLI adapter support | Backward compatibility. codex and claude CLI adapters remain supported as first-class adapters. |

## Consequences

### Positive

- Adding a new provider (OpenRouter, local Ollama, Pi broker) requires only a new adapter module — zero changes to core orchestration.
- Provider failures are handled at the adapter level with standardized error reporting to the core.
- Backend receipts provide audit-grade transparency about which provider executed each stage.
- Retry and fallback become configurable per adapter without touching core logic.
- Provider-specific configuration (auth, endpoints, model selection) is isolated in adapter config, not CLI flags.
- The core becomes smaller, more testable, and easier to maintain.

### Negative

- Adds an abstraction layer. For the two-provider case, this is more code than direct invocation.
- Backward compatibility: existing `--codex-model` and `--claude-settings` flags must be preserved or migrated.
- Adapter authors must implement the backend receipt contract. Non-compliant adapters break the pipeline.
- The adapter registry must be discoverable and configurable. A plugin or configuration mechanism is needed.

## Evidence

- [x] Campaign Runner execution smoke test demonstrated real provider failures (codex ENOENT, claude schema-invalid). These failures would benefit from adapter-level retry/fallback.
- [x] Provider adapter contract documented: `docs/specs/campaign-runner/PROVIDER_ADAPTER_CONTRACT.md`.
- [x] Pi adapter contract documented: `docs/specs/campaign-runner/PI_ADAPTER_CONTRACT.md`.
- [ ] Adapter contract implemented in Campaign Runner core (not yet — this ADR is the decision to proceed).
- [ ] Existing codex/claude backends migrated to adapter modules (not yet).
- [ ] Adapter registry mechanism designed (not yet).

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Keep current hardcoded provider dispatch. | Adding providers requires modifying core orchestration. Provider-specific logic leaks into `runner.py`. |
| Use a single universal HTTP adapter for all providers. | Not all providers speak HTTP (codex/claude are CLI binaries). One-size-fits-all creates complexity. |
| Make adapters external plugins loaded at runtime. | Premature. Start with adapter modules in the Campaign Runner package. Plugin system can follow if needed. |
| Delegate all provider logic to Pi and remove other adapters. | Violates provider-agnostic principle. Pi is preferred, not mandatory. |

## Drift Watch

What future change would make this ADR stale?

- If Campaign Runner adopts a plugin system for adapters, the adapter registry mechanism may need revision.
- If a new provider protocol emerges that doesn't fit the adapter contract, the contract may need extension.
- If the ResonantOS provider fabric (ADR-005) adds a Campaign Runner integration point, the adapter may route through the fabric.
- If Campaign Runner core is rewritten in a different language, adapter interfaces may need porting.

## Docs to Update If Accepted

- [x] `docs/specs/campaign-runner/PROVIDER_ADAPTER_CONTRACT.md` — Adapter contract.
- [x] `docs/specs/campaign-runner/PI_ADAPTER_CONTRACT.md` — Pi adapter contract.
- [x] `docs/adr/ADR-037-campaign-runner-pi-provider-broker.md` — Pi broker ADR.
- [ ] `docs/specs/campaign-runner/README.md` — Reference new contracts.
- [ ] Campaign Runner source (`runner.py`) — implement adapter dispatch (future implementation task).
