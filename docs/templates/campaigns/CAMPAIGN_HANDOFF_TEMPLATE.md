# Campaign Handoff: <CAMPAIGN_TITLE>

## Campaign Identity

| Field | Value |
|-------|-------|
| **Campaign ID** | `<YYYY-MM-DD::slug::seq3>` |
| **Campaign Slug** | `<slug>` |
| **Campaign Title** | `<human-readable title>` |
| **Operator** | `<name or role>` |
| **Started** | `<YYYY-MM-DD HH:MM UTC>` |
| **Completed** | `<YYYY-MM-DD HH:MM UTC>` |
| **Total Tasks** | `<N>` |
| **Passes** | `<N>` |

## Backend

- **Provider:** `<codex | claude | manual>`
- **Audit model:** `<model_id | unknown>`
- **Compiler model:** `<model_id | unknown>`
- **Task model:** `<model_id | unknown>`

<!-- If multiple providers were used, replace the above with: -->

<!--
| Stage | Provider | Model |
|-------|----------|-------|
| Audit | <provider> | <model> |
| Compile | <provider> | <model> |
| Task execution | <provider> | <model> |

**Switch reason:** <why the provider changed>
-->

## Completion Status

**Status:** `<completed | partially-completed | abandoned>`

**Summary:**

<!-- One paragraph describing overall campaign outcome. -->

<summary>

### Completed

- [x] Task `<TASK-001>`: `<task_title>` — `<brief result>`
- [x] Task `<TASK-002>`: `<task_title>` — `<brief result>`

### Not Completed

- [ ] Task `<TASK-00N>`: `<task_title>` — `<reason: blocked by X, out of scope, deferred>`

## Task Results Summary

| Task ID | Slug | Status | Tests Ran | Decisions | Artifacts |
|---------|------|--------|-----------|-----------|-----------|
| `<TASK-001>` | `<slug>` | `success` | `<N>` | `<N>` | `<paths>` |
| `<TASK-002>` | `<slug>` | `failed` | `<N>` | `<N>` | `<paths>` |
| ... | ... | ... | ... | ... | ... |

## Decisions Ledger

<!-- Every non-trivial decision made during the campaign. -->

| ID | Task | Decision | Rationale | Alternatives Considered | Impact |
|----|------|----------|-----------|------------------------|--------|
| D-001 | `<TASK-001>` | `<decision>` | `<why>` | `<rejected options>` | `<what this affects>` |
| D-002 | `<TASK-002>` | `<decision>` | `<why>` | `<rejected options>` | `<what this affects>` |

## Open Items

<!-- What remains unresolved, blocked, or deferred. -->

- [ ] Item 1 — `<reason>`
- [ ] Item 2 — `<reason>`

## Artifact Inventory

### Transient Artifacts (not committed)

- `docs/_audits/<date>/<audit_id>/` — audit prompts and outputs.
- `docs/_campaign_runs/<date>/<slug>/<run_id>/` — run metadata.
- `docs/_campaign_runs/state/` — campaign state machine.
- `docs/Campaign/CAMPAIGN_<slug>.md` — this campaign brief.
- `docs/tasks/<slug>_<date>_<seq>/` — task markdown artifacts.

### Durable Artifacts (committed after promotion)

- `docs/adr/ADR-0XX-<slug>.md` — ADR for decision D-001.
- `docs/specs/<area>/README.md` — Spec for <feature>.
- `docs/audits/<audit_title>.md` — Audit finding F-001.
- `docs/architecture/<doc>.md` — Architecture update.
- `docs/agent-workflows/<doc>.md` — Workflow convention update.

## Context for Next Campaign

<!-- What a future campaign operator needs to know to continue this work. -->

### If Continuing This Campaign

- Read `<promoted docs>` for the implementation context.
- Key constraint: `<constraint from decisions ledger>`.
- Key warning: `<warning about fragile area>`.

### If Starting a Related Campaign

- Dependency: `<what depends on this campaign's output>`.
- Suggested next campaign: `<slug or goal>`.

## Verification Evidence

<!-- Aggregated test and build results from all tasks. -->

### Tests

```
$ npm test -- --run
✓ <N> passed, 0 failed
```

### Build

```
$ npm run build
✓ built in <X>s
```

### Format / Lint

```
$ cargo fmt --check
(no output — clean)
```

### Git

```
$ git diff --check
(no output — clean)
```

## Archive Intake Candidates

<!-- What should be ingested into the Living Archive. -->

- [ ] Campaign summary (this handoff) — ready for intake.
- [ ] Decision D-001 — candidate for System Architecture Memory.
- [ ] Audit finding F-001 — candidate for `docs/audits/`.
- [ ] Spec for `<feature>` — candidate for `docs/specs/`.

## Operator Sign-Off

- [ ] All tasks completed or explicitly abandoned with reason.
- [ ] All decisions recorded with rationale.
- [ ] Backend declaration is complete and accurate.
- [ ] No silent provider switches (or all switches documented).
- [ ] No forbidden zones modified without explicit justification.
- [ ] Transient artifacts are not committed.
- [ ] Durable artifacts are promoted and committed.
- [ ] `git diff --check` passes.
- [ ] `npm test -- --run` passes.

**Operator:** `<name>`  
**Date:** `<YYYY-MM-DD HH:MM UTC>`
