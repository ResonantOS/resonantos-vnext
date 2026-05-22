# Architecture Decision Records

## Purpose

Architecture Decision Records (ADRs) capture significant architectural decisions, the context that forced them, the options considered, and the consequences accepted. They serve as a durable institutional memory of *why* the system is shaped the way it is.

ADRs are not implementation docs. They record decisions, not how-to guides. They are not status reports. They capture the moment a structural choice was made.

## Where ADRs Live

Existing ADRs are in this directory (`docs/adr/`), named `ADR-NNN-<slug>.md`. There are 32 ADRs covering platform stack, modular codebase, chat rail, provider fabric, add-on SDK, Living Archive, wallet security, recovery, compute fabric, and more.

New ADRs should follow the same naming convention and live alongside existing ADRs in `docs/adr/`.

## When to Write an ADR

Write an ADR when a decision affects:

- **Runtime semantics** — how the system behaves at execution time (provider routing, fallback, memory compaction).
- **Add-on contracts** — what add-ons can depend on the shell to provide (SDK surface, capability grants, workspace hosting).
- **Capability boundaries** — what is allowed or denied at a security-relevant interface.
- **Provider behavior** — how the system interacts with external AI providers.
- **Persistence** — what is durable, where, and with what guarantees.
- **Release posture** — what is considered stable, experimental, or deprecated.

Do not write an ADR for minor refactors, cosmetic changes, or decisions that have no structural consequence.

## ADR Template

```markdown
# ADR-XXX: [Title]

## Status
[Proposed / Accepted / Superseded / Deprecated]

## Context
[What changed? What pressure forced a decision? What were the alternatives considered?]

## Decision
[The decision, in one clear paragraph. Be specific about what was chosen and what was rejected.]

## Consequences

**Positive:**
- [Benefit 1]
- [Benefit 2]

**Negative:**
- [Cost or risk 1]
- [Cost or risk 2]

## Evidence
- [Proof artifact — e.g., test results, runtime observation, benchmarks]
- [Related issue/PR]

## Alternatives Considered

| Alternative | Why rejected |
|-------------|--------------|
| [Option A] | [Reason] |
| [Option B] | [Reason] |

## Drift Watch

What future change would make this ADR stale?

- [Condition 1]
- [Condition 2]

## Docs to Update If Accepted
- [ ] [Doc A]
- [ ] [Doc B]
```

## ADR Lifecycle

1. **Proposed** — ADR is written and under review. Not yet accepted.
2. **Accepted** — Decision is agreed upon and in effect. Implementation may follow.
3. **Superseded** — A newer ADR replaces this decision. Link to the superseding ADR.
4. **Deprecated** — The decision is no longer relevant (feature removed, approach abandoned).

Never delete an ADR. Supersede or deprecate it so the historical record is preserved.

---

*ADRs are living documents. When a decision changes, write a new ADR and mark the old one as superseded — do not silently edit.*
