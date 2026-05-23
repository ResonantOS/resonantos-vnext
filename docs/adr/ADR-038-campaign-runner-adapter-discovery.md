# ADR-038: Campaign Runner Adapter Discovery

## Status

**Proposed.** This ADR records the decision on how Campaign Runner discovers available provider adapters before campaign execution.

## Context

Campaign Runner (`codex_runner` v0.1.0a0) currently has two hardcoded provider backends: codex and claude. Provider selection is done via the `--provider` CLI flag. There is no discovery mechanism — the operator must know which providers are available and specify one explicitly.

The provider adapter contract (ADR-036) defines a separation between core orchestration and provider adapters. With multiple adapter classes (pi, codex, claude, http-json, openrouter, local-llm, noop), Campaign Runner needs a way to:

1. **Discover** which adapters are installed and available on the operator's machine.
2. **Select** the appropriate adapter based on campaign requirements.
3. **Record** the discovery and selection process for auditability.
4. **Fall back** gracefully when the preferred adapter is unavailable.

Without a discovery mechanism, the operator must manually configure adapter selection for every campaign — or Campaign Runner must hardcode provider logic into the core, which violates ADR-036.

The execution smoke test demonstrated that provider availability is not guaranteed: codex had a broken binary, claude produced schema-invalid output. A discovery mechanism would have detected the codex binary issue before execution and selected claude automatically (or warned the operator).

## Decision

**Campaign Runner will discover adapters through a five-tier priority system: explicit campaign config, environment variable, local adapter registry file, built-in adapter defaults, and manual/noop fallback — in that order.**

### Discovery Priority

| Priority | Source | Override Behavior |
|----------|--------|-------------------|
| 1 | Explicit campaign config | Operator's declared backend. Highest authority. No fallback if unavailable — fails explicitly. |
| 2 | Environment variable | `CAMPAIGN_RUNNER_ADAPTER` or config file path. |
| 3 | Local adapter registry | `~/.config/campaign_runner/adapters.yaml` or repo-local. Enables, disables, and prioritizes adapters. |
| 4 | Built-in defaults | pi (if available), codex, claude. Selected by first-available. |
| 5 | Manual / noop | Always available. Human operator provides output. |

### Explicit Campaign Selection Is Absolute

If a campaign explicitly declares `backend_provider: pi`, Campaign Runner uses pi — or fails with a clear error if pi is unavailable. It does NOT silently fall back to claude or codex. The operator's explicit choice is the highest authority and must be respected.

### Discovery Is Recorded

Every campaign run records its discovery path in `run_inputs.json`:
- Which discovery source was used.
- Which adapters were considered, enabled, and available.
- Which adapter was selected and why.
- Adapter command path and detected version.

This provides an audit trail for every campaign execution.

### Discovery Does Not Mean Execution

Discovery identifies candidates. Capability negotiation (ADR-039) determines whether the selected candidate can satisfy campaign requirements. A discovered adapter may still be rejected during negotiation.

## Consequences

### Positive

- Operators can configure their adapter preferences once (registry file) and Campaign Runner respects them across all campaigns.
- Explicit campaign overrides give operators control per campaign without changing global config.
- Environment variable support enables CI/CD and scripted campaign execution.
- Built-in defaults ensure Campaign Runner works out of the box with pi, codex, or claude — no configuration required.
- Manual/noop fallback ensures campaigns can always proceed, even without any installed adapters.
- Full audit trail for every adapter selection decision.

### Negative

- Five-tier priority system adds complexity. Operators must understand which source takes precedence.
- Registry file is another configuration surface to maintain.
- Environment variable and registry file may conflict if not documented clearly.
- Built-in defaults may select an adapter the operator did not intend (mitigated by explicit campaign config taking highest priority).

## Evidence

- [x] Adapter discovery spec documented: `docs/specs/campaign-runner/ADAPTER_DISCOVERY.md`.
- [x] Adapter registry format defined with enable/disable, priority, command, and endpoint fields.
- [x] Discovery audit trail format defined for `run_inputs.json`.
- [x] Execution smoke test demonstrated need for discovery (codex binary broken, would have been detected as `command_not_found`).
- [ ] Adapter discovery implemented in Campaign Runner core (not yet).
- [ ] Registry file schema validated (not yet).
- [ ] Environment variable parsing implemented (not yet).

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Hardcoded codex/claude only (current v0.1.0a0). | Violates ADR-036. Cannot add new adapters without core changes. |
| Auto-detect everything on PATH with no configuration. | No audit trail. Operator cannot control which adapters are used. Security risk (malicious binary on PATH could be selected). |
| Embed Pi as mandatory dependency. | Violates ADR-037 (Pi is preferred, not mandatory). Operators without Pi must still be able to run campaigns. |
| Silently pick first available provider. | No operator control. No audit trail. Violates provider transparency requirement. |
| Single global config file only (no environment variable or campaign override). | Insufficient for CI/CD and per-campaign control. |

## Drift Watch

What future change would make this ADR stale?

- If Campaign Runner adopts a plugin system, adapter discovery may use plugin manifests instead of a registry file.
- If a new discovery source is needed (e.g., cloud-based adapter registry), it would be added as a new priority tier.
- If the ResonantOS provider fabric adds adapter discovery, Campaign Runner may delegate discovery to the fabric.

## Docs to Update If Accepted

- [x] `docs/specs/campaign-runner/ADAPTER_DISCOVERY.md` — Discovery spec.
- [x] `docs/specs/campaign-runner/CAPABILITY_NEGOTIATION.md` — Negotiation spec.
- [ ] `docs/specs/campaign-runner/README.md` — Reference new specs.
- [ ] `docs/agent-workflows/CAMPAIGN_RUNNER_USAGE.md` — Add adapter discovery notes.
