# Context Handoff Contract — Agent Workflow Convention

## Status

**Draft.** Companion intake to ADR-034 (Agent Context Management) and `docs/specs/agent-context-management/README.md`. No runtime implementation exists. This document defines the convention for what a worker agent must produce when returning results to a delegator.

---

## Purpose

The Context Handoff Contract defines a standard format for what a worker agent produces when completing a delegated task. It ensures that the delegator (Augmentor or another agent) receives sufficient, structured information to:

1. Verify that the task was completed correctly.
2. Understand what decisions were made and why.
3. Know what remains open, blocked, or deferred.
4. Extract artifacts for archive intake or further work.
5. Hand off to the next agent if the work continues.

## Principles

1. **Self-contained** — the handoff should be understandable without re-reading the original task or the worker's raw transcript.
2. **Evidence-backed** — claims require evidence (test output, build logs, runtime proof).
3. **Decision-preserving** — every non-trivial decision includes rationale.
4. **Forward-looking** — the handoff includes what the next agent needs, not just what was done.
5. **Append-only** — corrections are new entries, not edits to prior handoffs.

---

## Context Handoff Structure

### Required Sections (always present)

#### 1. Completion Status

```
## Completion Status

**Status:** [completed / partially-completed / blocked / abandoned]

**Summary:** [One paragraph describing what was accomplished.]

**Completed:**
- [x] Item A — [brief result.]
- [x] Item B — [brief result.]

**Not Completed:**
- [ ] Item C — [reason: blocked by X, deferred to next session, out of scope.]
```

#### 2. Decisions Made

Every non-trivial decision the worker made during the task.

```
## Decisions Made

| ID | Decision | Rationale | Alternatives Considered | Impact |
|----|----------|-----------|------------------------|--------|
| H-001 | Used pattern X instead of Y | Y caused test failure in module Z | Y, Z (rejected) | Affects future work in module Z |
| H-002 | Deferred feature W | W requires ADR-032 implementation first | Implement now (too risky) | Feature W is blocked until ADR-032 lands |
```

#### 3. Artifacts Produced

Pointers to everything the worker created or modified.

```
## Artifacts Produced

**Files Created:**
- `docs/specs/example/README.md` — implementation spec.
- `src/modules/example/controller.ts` — module controller.

**Files Modified:**
- `src/core/contracts.ts` — added `ExampleType` (line 450).
- `docs/FEATURE_BACKLOG.md` — added Example backlog item.

**Test Results:**
- `npm test -- --run`: 170 passed, 0 failed.
- `cargo test --lib`: 102 passed.

**Build Output:**
- `npm run build`: passed.
```

#### 4. Open Items

What remains unresolved.

```
## Open Items

- [ ] Dependency X needs to be updated (pinned version has CVE).
- [ ] Integration test for module Y is missing — manual testing only.
- [ ] Decision H-002 may need revisiting when ADR-032 lands.
```

#### 5. Context for Next Agent

What a subsequent agent needs to know to continue this work.

```
## Context for Next Agent

**If continuing this task:**
- Read `docs/specs/example/README.md` for the implementation spec.
- The module controller (`src/modules/example/controller.ts`) is the entry point.
- Decision H-001 constrains how module Z should be modified.

**Key Constraints:**
- Do not modify `src/core/contracts.ts` without checking all consumers.
- Provider routing must go through the centralized fabric (ADR-005).

**Warnings:**
- `src-tauri/src/lib.rs` is a high-risk zone. Add commands surgically.
```

#### 6. Verification Evidence

Proof that the work was done correctly.

```
## Verification Evidence

**Tests:**
```
$ npm test -- --run
✓ src/core/contracts.test.ts (12 tests)
✓ src/modules/example/controller.test.ts (5 tests)
...
170 passed, 0 failed
```

**Build:**
```
$ npm run build
vite v6.x.x building for production...
✓ built in 4.2s
```

**Lint/Format:**
```
$ cargo fmt --check
(no output — clean)
```
```

### Optional Sections (included when relevant)

#### 7. Archive Intake Candidates

What should be preserved in the Living Archive.

```
## Archive Intake Candidates

- Campaign summary from `campaigns/auth-system.md` — ready for review.
- Decision H-001 — candidate for System Architecture Memory.
- New provider pattern documented in example — candidate for SDK docs.
```

#### 8. Delegation Return

If this task was a Delegation Packet, the return protocol.

```
## Delegation Return

**Delegation Packet:** `delegation/auth-system-001.json`
**Return Artifact:** `delegation/auth-system-001-result.json`
**Status:** Completed. Artifact includes implementation, tests, and handoff notes.
```

---

## Handoff Validation Checklist

Before the worker agent considers the task complete, verify:

- [ ] All acceptance criteria from the original task are addressed (completed or explicitly not completed with reason).
- [ ] Every non-trivial decision is recorded with rationale.
- [ ] All artifacts are listed with file paths.
- [ ] Verification evidence is included (test output, build output).
- [ ] Open items are explicitly listed — nothing is silently abandoned.
- [ ] Context for next agent is sufficient for a new session to continue.
- [ ] Archive intake candidates are identified.

---

## Scaling Rules

The handoff contract should scale with task complexity:

| Task Size | Handoff Expectation |
|-----------|-------------------|
| Trivial (one-line fix) | One-sentence summary + test result. Full sections optional. |
| Small (single module change) | Completion status, artifacts, verification evidence. |
| Medium (multi-file change) | All required sections, condensed. |
| Large (multi-session campaign sub-task) | All required sections, full detail. |
| Campaign completion | Full handoff PLUS campaign summary for archive intake. |

---

## Non-Goals

- The Context Handoff Contract is NOT a typed contract in `contracts.ts`. It is a markdown convention.
- The contract does NOT enforce itself. Agents are expected to follow it; humans and reviewers verify.
- The contract is NOT a replacement for the Delegation Packet return protocol. It supplements it with human/agent-readable context.
- The contract is NOT a chat log or raw transcript. It is a structured summary of what matters.

---

## Related Docs

- `docs/adr/ADR-016-context-memory-compaction.md` — memory layers.
- `docs/adr/ADR-015-delegation-fabric-addon-catalog-native-tools.md` — Delegation Fabric.
- `docs/adr/ADR-034-agent-context-management-intake.md` — governance ADR.
- `docs/specs/agent-context-management/README.md` — implementation intake.
- `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md` — unified input protocol.
- `docs/agent-workflows/README.md` — agent workflow conventions.
- `docs/specs/campaign-runner/README.md` — campaign runner intake.
