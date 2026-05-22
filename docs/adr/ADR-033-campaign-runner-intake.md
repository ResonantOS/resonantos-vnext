# ADR-033: Campaign Runner — Intake Decision

## Status

**Proposed.** This ADR records the intake decision for Campaign Runner before implementation begins. It is not an acceptance of implementation scope — it is a boundary-setting document.

## Context

ResonantOS currently supports structured delegation through the Delegation Fabric (ADR-015), context memory compaction (ADR-016), and organizational runtime through Paperclip (ADR-028). However, no existing mechanism provides a first-class pattern for coordinating multiple Delegation Packets across sessions into a coherent, multi-step body of work.

A "campaign" — a bounded, multi-step effort with a defined goal, sub-tasks, decision tracking, and artifact collection — is a recurring pattern in AI-assisted development. Humans naturally think in campaigns ("build the authentication system," "migrate to the new provider API," "audit the addon security surface"). Agents need structured support for this pattern.

The legacy `TASK.md` pattern (from the pre-vNext era) proved that high-quality delegation requires context, scope, and a clear return protocol. The Delegation Fabric improved on `TASK.md` by adding structured enrichment from System Architecture Memory, Living Archive context, and policy. Campaign Runner extends this further: from single-task delegation to multi-task campaign coordination.

## Decision

**Campaign Runner will be introduced as an agent workflow convention with a documented path to becoming an optional addon if runtime state tracking proves necessary.**

### V1 Scope (Convention)

1. A campaign is defined as a markdown file at `campaigns/<slug>.md` in the repo root or user-state root.
2. The campaign file declares: goal, scope, constraints, success criteria, sub-tasks (as Delegation Packet stubs), status per sub-task, decision log, artifact references.
3. Augmentor reads the campaign file at session start (via unified input protocol) to understand active campaigns.
4. Augmentor decomposes campaign sub-tasks into Delegation Packets using the existing Delegation Fabric.
5. Completed sub-tasks update the campaign file with results and artifact pointers.
6. A completed campaign produces a summary suitable for Living Archive intake.

### Future Scope (Addon)

If the convention pattern proves valuable but insufficient:

1. `addon.campaign-runner` manifests as an `orchestration`-category addon, similar to Paperclip.
2. Campaign state moves from markdown files to structured persistence (SQLite or host-mediated state).
3. A workspace UI provides campaign overview, sub-task status dashboard, and artifact browser.
4. Campaign Runner integrates with Paperclip for organizational tracking and with the Compute Fabric for long-running sub-task execution.

### Binding Rules

- Campaign Runner is NOT a kernel service. It must be disableable and replaceable (ADR-026).
- Campaign Runner does NOT replace the Delegation Fabric. It decomposes campaigns INTO Delegation Packets.
- Campaign Runner does NOT route model calls or choose providers. Provider fabric remains the routing authority (ADR-005).
- Campaign Runner does NOT bypass Living Archive ingestion approval (ADR-012).
- Campaign Runner does NOT hold secrets or manage credentials.
- Campaign Runner may declare capability needs (`agent-delegation`, `archive-intake-write`) if it becomes an addon.
- Campaign Runner must not duplicate Paperclip's organizational tracking. If Paperclip is active, Campaign Runner should integrate, not compete.

## Consequences

### Positive

- Provides a first-class pattern for multi-step AI-assisted work that is currently handled ad hoc.
- Reduces human re-briefing overhead across sessions.
- Creates a natural unit for Living Archive intake (campaign summary + artifacts).
- Aligns with the Delegation Fabric investment — campaigns are composition over delegation.
- Convention-first approach minimizes implementation risk.

### Negative

- Another document pattern for contributors to learn.
- Risk of over-formalization: simple tasks should not require campaign overhead.
- Campaign files may go stale if agents don't maintain them.
- Potential confusion with Paperclip's organizational tracking if boundaries are not clear.

## Evidence

No implementation evidence exists yet (this is an intake decision). Evidence will be collected during V1 convention testing:

- [ ] Campaign markdown format is usable by agents without human hand-holding.
- [ ] Campaign state survives context compaction without data loss.
- [ ] Campaign decomposition into Delegation Packets produces correct `TASK.md` artifacts.
- [ ] Campaign summaries are suitable for Living Archive intake.

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Add Paperclip-only campaign tracking. | Paperclip is an optional addon. Campaigns should work without it. Convention-first is more portable. |
| Extend Delegation Packets to support multi-step campaigns natively. | Delegation Packets are single-task. Composition (campaign of packets) is cleaner than extension. |
| Make Campaign Runner a core runtime service. | Violates ADR-026 minimal kernel principle. Campaigns are not essential for shell operation. |
| Do nothing — let agents handle campaigns ad hoc. | Current ad hoc approach causes context loss, repeated re-briefing, and missed handoffs. |

## Drift Watch

What future change would make this ADR stale?

- If Paperclip evolves to natively support campaign-level tracking, the convention may become redundant.
- If the Delegation Fabric adds native multi-step support, campaign decomposition may need rethinking.
- If a new addon or external tool provides superior campaign tracking, Campaign Runner should integrate rather than compete.
- If the unified input protocol (separate intake) evolves to include campaign context natively, the convention format may need updating.

## Docs to Update If Accepted

- [ ] `docs/specs/campaign-runner/README.md` — implementation intake (companion to this ADR).
- [ ] `docs/agent-workflows/README.md` — add campaign runner convention reference.
- [ ] `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md` — include campaign context in input packet.
- [ ] `docs/FEATURE_BACKLOG.md` — track V1 convention implementation.
- [ ] `docs/PROJECT_STATUS.md` — note Campaign Runner as planned convention.
