# Campaign Runner — Implementation Intake

## Status

**Intake.** No code has been written. This document defines intended role, boundaries, integration points, risks, open questions, and non-goals before source code is modified.

---

## Classification

**Campaign Runner is an agent workflow convention and candidate addon.**

It is NOT:
- A core runtime service (like provider fabric or archive service).
- A replacement for the Delegation Fabric (ADR-015).
- A replacement for the Compute Fabric (ADR-032).
- A replacement for Augmentor or the Resonant Engineer.
- An external hosted service.
- A package dependency.

It IS:
- An opinionated pattern for how agents coordinate multi-step, multi-session work.
- A structured way to track campaign state, sub-tasks, artifacts, and decisions across agent invocations.
- A candidate for implementation as either:
  - An **agent workflow convention** (`docs/agent-workflows/`) — lightweight, convention-only.
  - An **addon** (`addon.campaign-runner`) — with runtime state tracking, UI surface, and capability grants.
  - A **core SDK primitive** — if the pattern proves universal enough to belong in the SDK surface.

**Recommended initial classification:** Agent workflow convention with a path to becoming an addon if runtime state tracking is needed.

---

## Intended Role

Campaign Runner defines how a human operator (via Augmentor) initiates, tracks, and completes a **campaign** — a bounded, multi-step body of work that may span multiple agent invocations, sessions, and delegation targets.

A campaign is larger than a single Delegation Packet but smaller than an ongoing product roadmap. It is the unit of "what are we trying to accomplish this week/month."

### What Campaign Runner provides:

1. **Campaign definition** — a structured document declaring the campaign goal, scope, constraints, success criteria, and estimated duration.
2. **Sub-task decomposition** — breaking the campaign into discrete Delegation Packets that can be assigned to worker agents.
3. **State tracking** — which sub-tasks are pending, in-progress, blocked, completed, or abandoned.
4. **Artifact collection** — gathering outputs from completed sub-tasks into a campaign-level artifact store.
5. **Decision ledger** — recording decisions made during the campaign, linked to context and rationale.
6. **Continuity handoff** — enabling a new agent session to pick up campaign state without human re-briefing.
7. **Completion review** — a structured wrap-up that produces a campaign summary, lessons learned, and archive intake.

---

## Candidate Integration Points

### Existing patterns to compose with:

| Pattern | ADR | How Campaign Runner relates |
|---------|-----|---------------------------|
| Delegation Fabric | ADR-015 | Campaign Runner decomposes campaigns into Delegation Packets. It does NOT replace the Delegation Fabric; it sits above it as a planning layer. |
| Context Memory Compaction | ADR-016 | Campaign state should survive compaction. Campaign-relevant decisions, preferences, and open sub-tasks must be preserved in structured memory. |
| Living Archive | ADR-007, 011, 012, 013 | Campaign artifacts and summaries can be ingested into the Living Archive. Campaign Runner should integrate with archive intake. |
| Compute Fabric | ADR-032 | Long-running campaign sub-tasks may execute on compute nodes. Campaign Runner should be aware of compute node availability but not manage nodes directly. |
| Paperclip | ADR-028 | Paperclip maps Delegation Packets to organizational issues. Campaign Runner could map campaigns to project-level tracking in Paperclip. |
| Recursive MAS | ADR-030 | Campaign sub-tasks requiring deep reasoning may route to RecursiveMAS runtime nodes. Campaign Runner should not choose the runtime; provider fabric routes. |
| Minimal Kernel | ADR-026 | Campaign Runner is NOT a kernel service. It must be disableable and replaceable. |

### Likely affected files/directories:

If implemented as an **agent workflow convention:**
- `docs/agent-workflows/CAMPAIGN_RUNNER_CONVENTION.md` — the convention document.
- `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md` — unified input protocol (separate intake).

If implemented as an **addon:**
- `public/addons/campaign-runner.json` — manifest.
- `src/modules/campaign-runner/` — workspace UI.
- `src-tauri/src/campaign_runner_service.rs` — host service (if state persistence is needed).
- `src/sdk/addons/` — no SDK changes unless a new capability is needed.

If the pattern proves fundamental, it may touch:
- `src/core/contracts.ts` — new types for `Campaign`, `CampaignSubTask`, `CampaignState`.
- `src/core/delegation.ts` — campaign-aware delegation packet enrichment.

---

## What Should NOT Be Touched

- **Provider fabric / routing** — Campaign Runner does not route model calls.
- **Living Archive ingestion pipeline** — Campaign Runner may feed artifacts into intake but does not bypass review/approval.
- **Capability grant model** — if Campaign Runner becomes an addon, it follows existing grant patterns.
- **Secrets handling** — Campaign Runner does not hold or manage secrets.
- **Build system / CI** — no changes to build config.
- **Tauri IPC registration (`src-tauri/src/lib.rs`)** — unless a host service is needed, and even then, add surgically.
- **`src/App.tsx`** — do not grow the shell composition root for a campaign UI.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Campaign Runner becomes a bottleneck — every task requires campaign setup overhead. | Medium | Keep lightweight: a campaign can be a single markdown file. Formal tracking is opt-in. |
| Campaign Runner duplicates the Delegation Fabric. | Medium | Campaign Runner decomposes INTO Delegation Packets; it does not replace them. Clear separation of concerns. |
| Campaign state survives compaction but becomes stale. | Medium | Campaign state must declare freshness. Stale campaigns should degrade visibly. |
| Campaign Runner requires UI surface that competes with the shell. | Low | Keep the convention-first approach. UI can follow later as an addon workspace. |
| Over-specifying before implementation. | Medium | This intake document is a boundary, not a spec. Implementation can refine. |

---

## Open Questions

1. **Is a campaign a file, a database record, or a runtime state?**
   - Recommendation: Start as a markdown file in a `campaigns/` directory at the repo or user-state root. Evolve to structured state if needed.

2. **Who creates campaigns? Human, Augmentor, or both?**
   - Recommendation: Human initiates, Augmentor refines and decomposes.

3. **Can campaigns span multiple repos/projects?**
   - Recommendation: V1 is single-project. Multi-project campaigns require portable user state resolution (ADR-022).

4. **Does Campaign Runner need its own capability grant?**
   - Recommendation: Not for V1 convention. If it becomes an addon, it may need `agent-delegation` and `archive-intake-write`.

5. **How does Campaign Runner interact with the unified input protocol?**
   - Recommendation: A campaign is a top-level input to agent sessions. The unified input protocol (separate intake) should include campaign context.

6. **Is Campaign Runner a ResonantOS feature or a repo-level convention?**
   - Recommendation: Start as a repo-level agent workflow convention. If the pattern proves essential, promote to an addon or SDK primitive.

---

## Non-Goals

- Campaign Runner is NOT a project management tool. It does not replace Linear, Jira, or Paperclip.
- Campaign Runner is NOT a replacement for the human's judgment. It tracks state; the human decides.
- Campaign Runner is NOT a CI/CD orchestration system. It does not schedule builds, run tests, or deploy artifacts.
- Campaign Runner is NOT a multi-agent coordination protocol. It does not manage agent-to-agent communication (that is the shell's role).

---

## Related Docs

- `docs/adr/ADR-015-delegation-fabric-addon-catalog-native-tools.md` — Delegation Fabric.
- `docs/adr/ADR-016-context-memory-compaction.md` — Context compaction and memory layers.
- `docs/adr/ADR-026-minimal-kernel-replaceable-default-addons.md` — Kernel/addon distinction.
- `docs/adr/ADR-028-paperclip-addon-organizational-runtime.md` — Organizational runtime (Paperclip).
- `docs/adr/ADR-030-recursive-mas-runtime-addon.md` — Specialist reasoning runtime.
- `docs/adr/ADR-032-resonantos-compute-fabric.md` — Compute Fabric.
- `docs/agent-workflows/README.md` — Agent workflow conventions.
- `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md` — Unified input protocol (separate intake).
- `docs/specs/campaign-runner/README.md` — This document.
- `docs/specs/agent-context-management/README.md` — Companion intake for context management.

---

## Validation Required Before Implementation

- [ ] Decision on convention vs addon classification.
- [ ] Agreement on campaign file format (markdown, JSON, structured state).
- [ ] Confirmation that campaign state does not conflict with context memory layers (ADR-016).
- [ ] Confirmation that campaign decomposition into Delegation Packets is workable.
- [ ] Review of interaction with Paperclip organizational runtime (avoid duplication).
- [ ] Agreement on V1 scope: single-project, human-initiated, markdown-based campaigns.
