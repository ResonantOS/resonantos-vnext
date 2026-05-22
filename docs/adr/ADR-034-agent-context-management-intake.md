# ADR-034: Agent Context Management — Intake Decision

## Status

**Proposed.** This ADR records the intake decision for Agent Context Management before implementation begins. It is not an acceptance of implementation scope — it is a boundary-setting document.

## Context

ADR-016 defines the **memory layers** that ResonantOS preserves across conversations: raw transcript, rolling summary, decision ledger, facts/entities, user preferences, open tasks, artifact pointers, and recent conversation window. These layers exist — but no document defines the **protocols** for how context flows between agents, sessions, and delegation handoffs.

Currently, context assembly and handoff are ad hoc. Augmentor manually constructs context for Delegation Packets. Worker agents return results without a standardized handoff format. New agent sessions start with whatever context the human or previous agent chose to include. There is no unified input protocol, no handoff contract, and no governance for what context crosses which boundary.

This creates several recurring problems:

- **Context loss on delegation** — worker agents receive insufficient context and must re-ask or guess.
- **Context bloat on return** — worker results include raw transcript that overwhelms the delegator's budget.
- **Session amnesia** — new agent sessions cannot reliably reconstruct what was in progress.
- **Information leakage** — agents may receive context they are not authorized to see (unrelated campaign data, secrets, private workspace state).

The legacy migration plan referenced `addon.lossless-context` as core infrastructure for "context management." That addon was never implemented, but the need it identified remains. Agent Context Management is the formalization of that need — not as a single addon, but as a governance layer above the memory system.

## Decision

**Agent Context Management will be introduced as repo infrastructure and agent workflow doctrine — a set of conventions, protocols, and contracts that govern how context flows between agents, sessions, and delegation handoffs. It does not require new runtime code.**

### What It Defines

1. **Unified Input Protocol** — what context an agent receives at session start. See `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md`.
2. **Context Handoff Contract** — what a worker agent must produce when returning results. See `docs/agent-workflows/CONTEXT_HANDOFF_CONTRACT.md`.
3. **Assembly Rules** — which ADR-016 memory layers are included in which context packet, prioritized by budget.
4. **Information Boundaries** — what context crosses which boundary (delegator→worker, worker→delegator, session→session, campaign→campaign).
5. **Compaction Triggers** — when to compact and what to preserve (extends ADR-016 with protocol-level guidance).
6. **Recovery Protocol** — how a new session reconstructs context from archived layers.

### Relationship to ADR-016

ADR-016 defines the **substance** (memory layers). Agent Context Management defines the **movement** (protocols).

| Concern | ADR-016 | Agent Context Management |
|---------|---------|------------------------|
| What exists | Memory layers (transcript, summary, ledger, etc.) | — |
| How layers are assembled | — | Unified Input Protocol |
| How context crosses agents | — | Context Handoff Contract |
| When to compact | Implicit in budget limits | Explicit compaction triggers |
| What crosses boundaries | — | Information boundary rules |
| How to recover | Implicit in layer design | Recovery Protocol |

ADR-016 is not replaced or superseded. Agent Context Management extends it with operational protocols.

### Binding Rules

- Agent Context Management is a convention, not runtime code. It lives in `docs/agent-workflows/` and `docs/specs/agent-context-management/`.
- Agent Context Management does NOT require new IPC commands, Tauri commands, or Rust services.
- Agent Context Management does NOT modify the capability grant model.
- Agent Context Management does NOT bypass Living Archive ingestion approval.
- Agent Context Management does NOT hold or manage secrets.
- Information boundary rules are guidance, not enforced security boundaries. Enforcement may come later if context management becomes programmatic.
- Context handoff artifacts are append-only. Corrections are new entries, not edits.
- Provider switches must not cause context loss. Context is assembled from structured layers, not from a single provider's opaque state.

### Future Scope (if conventions prove insufficient)

If agent context management conventions prove valuable but insufficient for programmatic enforcement:

1. Context assembly could become a typed contract in `src/core/contracts.ts` (`UnifiedInputPacket`, `ContextHandoff`, `ContextReturn`).
2. Context assembly could become a programmatic function in `src/core/context-memory.ts` (`assembleUnifiedInput()`, `validateHandoff()`).
3. A `context-management` capability grant could be added for addons needing programmatic context access.
4. Information boundary enforcement could move from convention to runtime checks.

## Consequences

### Positive

- Reduces context loss on delegation — workers receive standardized, sufficient context.
- Enables session recovery — new agents can reconstruct prior state from archived layers.
- Prevents information leakage — agents see only context relevant to their task.
- Complements ADR-016 without replacing it — governance layer above implementation layer.
- Zero runtime risk — conventions only; no code to break.

### Negative

- Another set of conventions for contributors to learn.
- Conventions may be ignored without enforcement — value must be demonstrated, not mandated.
- Potential confusion about relationship to ADR-016 — clear separation needed in docs.
- Conventions may become stale if not practiced regularly.

## Evidence

No implementation evidence exists yet (this is an intake decision). Evidence will be collected during convention testing:

- [ ] Unified input protocol format is usable by agents without human curation.
- [ ] Context handoff contracts reduce re-asking by worker agents.
- [ ] Session recovery from archived context layers works for at least one common scenario.
- [ ] Information boundary rules prevent a documented example of context leakage.
- [ ] Compaction triggers preserve decisions and open tasks through a simulated long conversation.

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Implement `addon.lossless-context` as originally planned. | A single addon cannot govern all context flow; the need is cross-cutting. Conventions are more appropriate. |
| Extend ADR-016 with protocol details inline. | ADR-016 is already large. A separate governance ADR keeps concerns separated. |
| Make context management programmatic from the start. | Premature. Conventions should prove value before code is written. |
| Do nothing — rely on agent intelligence for context management. | Current ad hoc approach causes documented context loss and re-briefing overhead. |

## Drift Watch

What future change would make this ADR stale?

- If ADR-016 is revised to include protocol-level governance, this ADR may merge into it.
- If a new SDK primitive or addon provides superior context management, conventions should integrate or be superseded.
- If context management becomes programmatic (typed contracts, runtime assembly), this ADR should be superseded by an implementation ADR.
- If the unified input protocol or context handoff contract proves unworkable in practice, conventions should be revised.

## Docs to Update If Accepted

- [ ] `docs/specs/agent-context-management/README.md` — implementation intake (companion to this ADR).
- [ ] `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md` — unified input protocol.
- [ ] `docs/agent-workflows/CONTEXT_HANDOFF_CONTRACT.md` — context handoff contract.
- [ ] `docs/agent-workflows/README.md` — add context management protocol references.
- [ ] `docs/FEATURE_BACKLOG.md` — track convention documentation as a backlog item.
- [ ] `docs/PROJECT_STATUS.md` — note Agent Context Management as planned convention.
