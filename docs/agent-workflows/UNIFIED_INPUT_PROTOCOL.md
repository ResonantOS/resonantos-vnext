# Unified Input Protocol — Agent Workflow Convention

## Status

**Draft.** Companion intake to ADR-034 (Agent Context Management) and `docs/specs/agent-context-management/README.md`. No runtime implementation exists. This document defines the convention for what context an AI agent receives at session start.

**Campaign Runner compatibility:** Campaign Runner's task `activation_prompt` field serves a similar purpose — it provides the execution context for a single task. Campaign Runner's format is a subset of this protocol: task objective, file scope, tests, and constraints. This protocol provides additional layers (campaign context, repo context, prior decisions, etc.) that Campaign Runner could adopt if tighter integration is desired.

---

## Purpose

The Unified Input Protocol defines a standard format for the context packet that an AI coding agent receives when starting a new session, resuming a prior session, or accepting a delegated task.

The goal is to ensure that every agent session begins with sufficient, structured, prioritized context — without requiring the human to manually re-brief the agent each time.

## Principles

1. **Predictable structure** — every session starts with the same context sections, even if some are empty.
2. **Budget-aware** — context is prioritized. If budget is tight, lower-priority sections are trimmed, not crammed.
3. **Source-linked** — every claim in the context packet links back to its source (ADR, conversation turn, file, decision log).
4. **Scoped** — agents receive only context relevant to their task, not the entire repository state.
5. **Recoverable** — context can be reconstructed from archived layers if the active session is lost.

---

## Unified Input Packet Structure

### Required Sections (always present)

#### 1. Task Specification

What the agent is being asked to do.

```
## Task

**Goal:** [One-sentence description of what to accomplish.]

**Scope:**
- Allowed: [What the agent may do.]
- Forbidden: [What the agent must NOT do.]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2

**Estimated Effort:** [small / medium / large / campaign]
```

#### 2. Campaign Context

If this task is part of a campaign, include campaign state.

```
## Campaign

**Campaign:** [Link to campaign file or name.]
**Phase:** [Current campaign phase.]
**Related Sub-tasks:**
- [ ] Sub-task A (pending)
- [x] Sub-task B (completed — see artifacts)
- [ ] Sub-task C (blocked — waiting on X)

**Campaign Decisions (relevant to this task):**
- Decision D-001: [What was decided and why.]
```

If no campaign is active, this section is empty:
```
## Campaign

No active campaign. This is a standalone task.
```

#### 3. Repository Context

Essential architecture and conventions the agent needs.

```
## Repository Context

**Project:** ResonantOS vNext
**Stack:** Tauri v2 (Rust) + React 19 (TypeScript)

**Key Architecture Docs:**
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — current system behavior.
- [CODEMAP.md](docs/architecture/CODEMAP.md) — repo topology.
- [MODULE_MAP.md](docs/architecture/MODULE_MAP.md) — ownership map.
- [SYSTEM_BOUNDARIES.md](docs/architecture/SYSTEM_BOUNDARIES.md) — IPC and trust boundaries.

**Relevant ADRs for this task:**
- [ADR-XXX](link) — [one-line description.]

**Agent Conventions:**
- [AGENTS.md](AGENTS.md) — branch workflow, validation, commit policy.
- [agent-workflows/README.md](docs/agent-workflows/README.md) — workflow rules.
```

#### 4. Prior Decisions

Decisions from prior sessions that constrain this task.

```
## Prior Decisions

| ID | Decision | Rationale | Source | Date |
|----|----------|-----------|--------|------|
| D-001 | Use X pattern for Y | Z was rejected because... | ADR-001 | 2026-04-23 |
| D-002 | Don't touch file A | Fragile seam, needs integration test | Session 2026-05-15 | 2026-05-15 |
```

#### 5. Open Obligations

Active constraints from prior work.

```
## Open Obligations

- [ ] PR #42 is open — this task should not conflict with its changes.
- [ ] The user asked to preserve pattern X when modifying module Y (Session 2026-05-10).
```

#### 6. User Preferences

Style, convention, and constraint preferences the human has expressed.

```
## User Preferences

- Prefer precise edits over file rewrites.
- Never modify contracts.ts without checking all consumers.
- Always validate with `npm test -- --run && npm run build` before committing.
```

#### 7. Artifact References

Pointers to code, docs, or outputs relevant to this task.

```
## Artifact References

- `src/core/contracts.ts` — central type system.
- `src-tauri/src/lib.rs` — Tauri command registration.
- [Prior task output](link) — related work from previous session.
```

### Optional Sections (included when relevant)

#### 8. Provider / Model Context

If the task involves model selection or provider routing.

```
## Provider Context

**Available Providers:**
- shared-minimax (MiniMax M2.7-highspeed) — primary
- shared-openai (gpt-4o) — available

**Routing Policy:** Centralized per ADR-005. Do not hardcode provider selection.
```

#### 9. Compute Context

If the task involves compute fabric nodes.

```
## Compute Context

**Available Nodes:**
- desktop-local (macOS aarch64) — shell runner
- gx10 (remote GPU) — model host

**Policy:** Compute fabric is proposed (ADR-032). Use host-mediated commands only.
```

#### 10. Browser Context

If the task involves browser automation.

```
## Browser Context

**Available Browsers:**
- Chromium (via CDP session)
- Camofox (Firefox-based, macOS)

**Policy:** Browser capability requires `browser-control` grant.
```

---

## Budget Awareness

When context budget is limited, sections are prioritized:

| Priority | Section | Rationale |
|----------|---------|-----------|
| 1 (Critical) | Task Specification | Agent must know what to do. |
| 2 (Critical) | Prior Decisions + Open Obligations | Agent must know constraints. |
| 3 (High) | Repository Context | Agent must understand the codebase. |
| 4 (High) | Campaign Context | Agent must understand campaign state. |
| 5 (Medium) | Artifact References | Helpful but not essential. |
| 6 (Medium) | User Preferences | Important for consistency. |
| 7 (Low) | Provider / Compute / Browser | Only if relevant to task. |

If budget is critically tight, only sections 1-3 are included. The agent is told what was trimmed and where to find it.

---

## Session Recovery

If a session is lost and must be recovered:

1. Reconstruct the unified input packet from the most recent archived context layers (ADR-016).
2. Include a recovery notice:
   ```
   ## Session Recovery Notice

   This session is a recovery from a lost session (last known: 2026-05-22 14:30 UTC).
   Some context may be incomplete. Key artifacts and decisions from the lost session
   are included below. Verify before acting on prior context.
   ```
3. Include any artifacts or decisions captured since the last known good state.

---

## Non-Goals

- The Unified Input Protocol is NOT a typed contract in `contracts.ts`. It is a markdown convention. Typing may follow if programmatic assembly is needed.
- The protocol does NOT enforce itself. Agents are expected to follow it; humans and reviewers verify.
- The protocol does NOT replace the raw transcript or ADR-016 memory layers. It is an assembly format, not a storage format.

---

## Related Docs

- `docs/adr/ADR-016-context-memory-compaction.md` — memory layers.
- `docs/adr/ADR-034-agent-context-management-intake.md` — governance ADR.
- `docs/specs/agent-context-management/README.md` — implementation intake.
- `docs/agent-workflows/CONTEXT_HANDOFF_CONTRACT.md` — context handoff contract.
- `docs/agent-workflows/README.md` — agent workflow conventions.
- `docs/specs/campaign-runner/README.md` — campaign runner intake.
