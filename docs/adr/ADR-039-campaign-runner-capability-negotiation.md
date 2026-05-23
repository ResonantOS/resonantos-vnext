# ADR-039: Campaign Runner Capability Negotiation

## Status

**Proposed.** This ADR records the decision that Campaign Runner must negotiate capabilities with provider adapters before execution, rather than trusting adapter claims without validation.

## Context

The provider adapter contract (ADR-036) defines a separation between Campaign Runner core and provider adapters. Adapters declare what they can do; campaigns declare what they need. But without a formal negotiation step, the core has no way to:

1. **Verify** that an adapter's declared capabilities match what the campaign requires.
2. **Reject** adapters that cannot satisfy campaign requirements.
3. **Warn** when an adapter meets requirements but lacks preferred capabilities.
4. **Record** the negotiation result for auditability.

The execution smoke test demonstrated that provider capabilities are not guaranteed. Claude produced schema-invalid output despite being invoked with `--json-schema`. The adapter claimed schema support, but runtime behavior did not match. Capability negotiation based on declared capabilities would have accepted claude — and the runtime failure would have been caught by schema validation. This is the correct two-layer defense: negotiate on declared capabilities, validate on observed behavior.

Without capability negotiation, Campaign Runner would either:

- Trust all adapter claims blindly (risk of runtime failures).
- Require the operator to manually verify adapter capabilities before every campaign (high friction).
- Hardcode known capability profiles into the core (violates ADR-036).

## Decision

**Campaign Runner will negotiate capabilities with discovered adapters before execution. Adapters declare their capabilities. Campaigns declare their requirements. The runner matches them and rejects adapters that cannot satisfy required capabilities.**

### Capability Model

Adapters declare capabilities in a structured format:

```yaml
capabilities:
  schema_mode: true
  retry: true
  fallback: true
  max_context_tokens: 200000
  supported_output_modes: [json, markdown]
  no_silent_provider_switch: true
  # ... additional capabilities
```

Campaigns declare requirements:

```yaml
requires:
  schema_mode: true       # Hard requirement — adapter must satisfy
  retry: true             # Hard requirement
  max_context_tokens: 50000

prefers:
  fallback: true          # Soft preference — warning if unmet
  streaming: false
```

### Required vs Preferred

| Type | Unmet Behavior |
|------|---------------|
| `requires` | **Reject adapter.** Campaign cannot proceed. |
| `prefers` | **Warn.** Campaign proceeds with warning. Operator may override. |

### Built-in Capability Profiles

Campaign Runner ships with known capability profiles for built-in adapters (pi, codex, claude). These are embedded in the core and updated with each release. Custom adapters (http-json, openrouter, local-llm) declare capabilities in the adapter registry or via a `capabilities` subcommand.

### Rejection Is Recorded

Every rejected adapter is recorded in the negotiation result with the specific capabilities it failed to satisfy. This creates an audit trail: the operator can see WHY claude was rejected and WHAT would need to change to make it eligible.

### Runtime Validation Is Separate

Capability negotiation evaluates **declared** capabilities. Runtime behavior is validated separately through:

1. Schema validation (core enforces this for all adapters).
2. Execution smoke tests (VALIDATION_PLAN.md).
3. Backend receipt verification (adapter reports actual provider/model used).

An adapter that passes negotiation but fails at runtime is a contract violation. The adapter's declared capabilities are considered untrustworthy and the adapter should be disabled until fixed.

## Consequences

### Positive

- Campaigns cannot proceed with adapters that lack required capabilities — no silent degradation.
- Operators can see WHY an adapter was rejected and WHAT to change.
- Preferred capabilities provide flexibility without hard constraints.
- Built-in profiles mean pi, codex, and claude work out of the box with known capability sets.
- Two-layer defense: negotiate on declarations, validate on observations.

### Negative

- Capability declarations can drift from reality (claude claims schema support but produces invalid output). Mitigated by runtime validation.
- Adding a new capability requires updating the capability model, built-in profiles, and campaign requirement templates.
- Operators must understand the distinction between `requires` and `prefers`.
- Custom adapters must implement capability declaration — either static, dynamic, or configured.

## Evidence

- [x] Capability negotiation spec documented: `docs/specs/campaign-runner/CAPABILITY_NEGOTIATION.md`.
- [x] Built-in capability profiles defined for pi, codex, and claude.
- [x] Negotiation result format defined with qualified/rejected adapters and reasons.
- [x] Execution smoke test demonstrated capability mismatch (claude schema output invalid — would pass negotiation on declared capability, caught by runtime validation).
- [ ] Capability negotiation implemented in Campaign Runner core (not yet).
- [ ] Dynamic capability detection (`<adapter> capabilities --json`) implemented (not yet).
- [ ] Negotiation result recorded in `run_inputs.json` (not yet).

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Trust adapter claims without validation. | Execution smoke test showed claims can be wrong. Need runtime validation as second layer. |
| Skip capability negotiation entirely. Run with whatever adapter is available. | Silent degradation. Campaign may fail mid-execution with unclear errors. |
| Let providers silently degrade structured output. | Violates schema enforcement principle. Invalid output must be rejected, not silently accepted. |
| Allow fallback to a different adapter without recording the switch. | Violates provider transparency requirement. Adapter switches must be auditable. |
| Hardcode capability requirements into the core (no campaign-level control). | Different campaigns have different needs. A docs-only campaign doesn't need retry; a source-mutation campaign does. |

## Drift Watch

What future change would make this ADR stale?

- If adapters gain the ability to auto-detect their capabilities at runtime, static profiles may become unnecessary.
- If a new capability dimension is needed (e.g., `multi_modal: true` for image-aware campaigns), the model must be extended.
- If capability negotiation moves to a plugin/extension system, the negotiation protocol may change.
- If the ResonantOS provider fabric integrates with Campaign Runner, capability negotiation may route through the fabric.

## Docs to Update If Accepted

- [x] `docs/specs/campaign-runner/CAPABILITY_NEGOTIATION.md` — Negotiation spec.
- [x] `docs/specs/campaign-runner/ADAPTER_DISCOVERY.md` — Discovery spec (cross-reference).
- [ ] `docs/specs/campaign-runner/README.md` — Reference new specs.
- [ ] `docs/specs/campaign-runner/PROVIDER_ADAPTER_CONTRACT.md` — Add capability declaration to adapter contract.
