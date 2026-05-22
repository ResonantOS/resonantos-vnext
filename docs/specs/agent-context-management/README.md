# Agent Context Management — Implementation Intake

## Status

**Intake.** No code has been written. This document defines intended role, boundaries, integration points, risks, open questions, and non-goals before source code is modified.

---

## Classification

**Agent Context Management is repo infrastructure and agent workflow doctrine.**

It is NOT:
- A new runtime service or addon.
- A replacement for the provider fabric.
- A replacement for context memory compaction (ADR-016).
- An SDK primitive (though it may inform SDK evolution).
- A UI feature or workspace.
- A package dependency.

It IS:
- A set of protocols, conventions, and contracts for how AI agents receive, preserve, compact, and hand off context.
- The governance layer above ADR-016 — defining *when* and *how* context moves between agents, not just *what* layers exist.
- Infrastructure for making agent sessions composable, recoverable, and auditable.

**Classification:** Repo infrastructure + agent workflow doctrine. Lives primarily in `docs/agent-workflows/` and `docs/specs/agent-context-management/`.

---

## Intended Role

Agent Context Management defines how AI coding agents operating in this repository:

1. Receive a **unified input** at session start — a structured context packet that includes task, campaign, repo state, relevant ADRs, constraints, and prior decisions.
2. Maintain **context continuity** across delegation handoffs — when Augmentor delegates to a worker agent, the worker receives sufficient context to operate without re-asking.
3. Apply **structured compaction** — when context grows beyond budget, compaction preserves decisions, intent, and open tasks while reducing raw transcript.
4. Perform a **context handoff** — when a worker returns results, the handoff includes what was done, what was decided, what remains open, and what the next agent needs to know.
5. Respect **information boundaries** — agents should not receive context they are not authorized to see (secrets, private workspace state, unrelated campaign data).

### Relationship to ADR-016

ADR-016 defines the **memory layers** (raw transcript, rolling summary, decision ledger, facts/entities, open tasks, artifact pointers). Agent Context Management defines the **protocols** for:

- **Assembly** — which layers are included in a unified input packet for a new agent session.
- **Handoff** — which layers are passed from delegator to worker.
- **Return** — which layers the worker produces and returns.
- **Compaction triggers** — when to compact and what to preserve.
- **Cross-session recovery** — how a new session reconstructs context from archived layers.

ADR-016 says *what exists*. Agent Context Management says *how it flows*.

---

## Candidate Integration Points

### Existing patterns to compose with:

| Pattern | ADR/Source | How Context Management relates |
|---------|-----------|-------------------------------|
| Context Memory Compaction | ADR-016 | Context Management defines the assembly, handoff, return, and recovery protocols that use ADR-016 memory layers. |
| Delegation Fabric | ADR-015 | Delegation Packets include a context block. Context Management standardizes what goes in that block. |
| System Architecture Memory | ADR-014 | System architecture context is included in unified input so agents understand the codebase. |
| Living Archive | ADR-007, 013 | Campaign and project context may be retrieved from the Living Archive for session initialization. |
| Agent Workflow Conventions | `docs/agent-workflows/` | Context Management is a workflow convention document, not runtime code. |
| Unified Input Protocol | Separate intake | The unified input protocol is the concrete format for context assembly. Context Management defines the governance. |

### Likely affected files/directories:

- `docs/agent-workflows/CONTEXT_HANDOFF_CONTRACT.md` — contract for context handoff between agents.
- `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md` — format for unified input packets.
- `docs/agent-workflows/README.md` — updated to reference context management protocols.
- `docs/specs/agent-context-management/README.md` — this document.
- `src/core/context-memory.ts` — may need updates to expose context assembly functions if programmatic assembly is needed.
- `src/core/contracts.ts` — may need new types for `UnifiedInputPacket`, `ContextHandoff`, `ContextReturn` if these become typed contracts.

### What should NOT be touched:

- Provider fabric / routing.
- Living Archive ingestion pipeline (context management may READ from archive, not write).
- Capability grant model.
- Secrets handling.
- Build system / CI.
- Tauri IPC boundary (context management is a convention, not an IPC surface).

---

## Unified Input Protocol (companion intake)

The Unified Input Protocol defines the concrete format for what an AI agent receives at session start. See `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md`.

At minimum, a unified input packet should include:

1. **Task specification** — what to do, scope, constraints, acceptance criteria.
2. **Campaign context** — if this task is part of a campaign, include campaign state and relationship to other sub-tasks.
3. **Repo context** — relevant architecture docs, ADRs, module ownership map, runtime surfaces.
4. **Prior decisions** — decisions from this session or prior sessions that constrain the current task.
5. **Open obligations** — tasks, promises, or constraints from prior work that are still active.
6. **User preferences** — style, conventions, constraints the human has expressed.
7. **Artifact references** — pointers to relevant code, docs, or prior outputs.
8. **Budget awareness** — how much context budget is available, what to prioritize if budget is tight.

---

## Context Handoff Contract (companion intake)

The Context Handoff Contract defines what a worker agent must produce when returning results to the delegator. See `docs/agent-workflows/CONTEXT_HANDOFF_CONTRACT.md`.

At minimum, a handoff should include:

1. **Completion status** — what was accomplished, what was not.
2. **Decisions made** — what was decided and why.
3. **Open items** — what remains unresolved, blocked, or deferred.
4. **Artifacts produced** — pointers to code, docs, or other outputs.
5. **Context for next agent** — what a subsequent agent needs to know to continue.
6. **Verification evidence** — test results, build output, validation confirmation.
7. **Archive intake candidates** — what should be preserved in the Living Archive.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Context assembly becomes too large and defeats the purpose. | Medium | Budget-awareness is built into the protocol. Agents should receive prioritized context, not exhaustive context. |
| Handoff contracts become bureaucratic overhead for simple tasks. | Low | Handoff contracts should scale: a one-line task gets a one-line handoff. |
| Context Management duplicates ADR-016. | Low | ADR-016 defines layers; Context Management defines protocols. Clear separation in documentation. |
| Agents ignore the protocol. | Medium | The protocol is a convention, not enforced code. Value must be demonstrated, not mandated. |
| Context leaks between unrelated campaigns. | Low | Information boundary rules. Context management should be scoped to the active campaign or task. |

---

## Open Questions

1. **Should the unified input protocol be a typed contract in `contracts.ts` or a markdown convention?**
   - Recommendation: Start as a markdown convention. Type it only if runtime assembly is needed.

2. **How does context management interact with the web transport adapter?**
   - Recommendation: The protocol is transport-agnostic. Tauri IPC and web mode both assemble context the same way.

3. **Should context handoff be append-only (like raw transcript) or mutable?**
   - Recommendation: Handoff artifacts are append-only. Corrections are new entries, not edits.

4. **How does context management handle provider switches mid-campaign?**
   - Recommendation: Context is assembled from structured layers, not from a single provider's opaque state. Provider switches should not lose context.

5. **Does context management need its own ADR, or is it an extension of ADR-016?**
   - Recommendation: Separate ADR (ADR-034) to keep the governance layer distinct from the implementation layer.

6. **Should there be a `context-management` capability grant for addons that need to read/write agent context?**
   - Recommendation: Not yet. Start as a convention. Add a capability only if addons need programmatic context access.

---

## Non-Goals

- Agent Context Management is NOT a replacement for provider prompt caching. Prompt caching is an optimization; context management is governance.
- Agent Context Management is NOT a vector database or RAG system. It defines protocols for context assembly, not retrieval technology.
- Agent Context Management is NOT a chat UI feature. It operates at the agent workflow level, below the chat surface.
- Agent Context Management is NOT a replacement for the human's working memory. It augments, not replaces.

---

## Related Docs

- `docs/adr/ADR-016-context-memory-compaction.md` — Context memory layers.
- `docs/adr/ADR-015-delegation-fabric-addon-catalog-native-tools.md` — Delegation Fabric.
- `docs/adr/ADR-014-system-architecture-memory.md` — System Architecture Memory.
- `docs/adr/ADR-033-campaign-runner-intake.md` — Campaign Runner integration intake.
- `docs/adr/ADR-034-agent-context-management-intake.md` — Companion ADR intake.
- `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md` — Unified input protocol.
- `docs/agent-workflows/CONTEXT_HANDOFF_CONTRACT.md` — Context handoff contract.
- `docs/agent-workflows/README.md` — Agent workflow conventions.
- `docs/specs/campaign-runner/README.md` — Campaign Runner integration intake.

---

## Validation Required Before Implementation

- [ ] Agreement that Context Management is a convention, not runtime code.
- [ ] Confirmation that Context Management does not duplicate ADR-016.
- [ ] Review of unified input protocol format with agent workflow stakeholders.
- [ ] Review of context handoff contract with delegation fabric stakeholders.
- [ ] Decision on whether Context Management needs a typed contract in `contracts.ts`.
- [ ] Confirmation that information boundaries (campaign scope, secret isolation) are respected.
