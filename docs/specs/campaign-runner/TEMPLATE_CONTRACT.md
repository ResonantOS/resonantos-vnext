# Campaign Runner — Template Contract

**Status:** Active  
**Applies to:** All campaigns executed via Campaign Runner against the ResonantOS vNext repository.  
**References:** ADR-035, CAMPAIGN_RUNNER_USAGE.md, CONTEXT_HANDOFF_CONTRACT.md, UNIFIED_INPUT_PROTOCOL.md

---

## Purpose

This document defines the minimum required structure, metadata, boundaries, and validation expectations for any campaign executed against this repository. Templates implementing this contract are in `docs/templates/campaigns/`.

Campaign Runner is an **external sidecar CLI**. It is not a ResonantOS addon, not routed through the provider fabric, and not part of the runtime. This contract governs how campaign output interacts with the ResonantOS documentation surface.

---

## Required Campaign Metadata

Every campaign must declare the following metadata, either in the campaign markdown file or in the Campaign Runner campaign set payload:

| Field | Required | Description |
|-------|----------|-------------|
| `campaign_id` | Yes | `YYYY-MM-DD::slug::seq3` — unique identifier. |
| `campaign_slug` | Yes | Short machine-readable slug (`[a-z0-9_]+`). |
| `campaign_title` | Yes | Human-readable title. |
| `goal` | Yes | One-sentence description of the campaign objective. |
| `scope` | Yes | Explicit allowed and forbidden zones. |
| `operator` | Yes | Who initiated and owns the campaign. |
| `created_at` | Yes | ISO 8601 timestamp. |
| `backend` | Yes | Which provider executed the campaign (`codex`, `claude`, or `manual`). |
| `backend_version` | If known | Provider version string for traceability. |
| `model_audit` | If known | Model used for audit stage. |
| `model_compiler` | If known | Model used for compile stage. |
| `model_task` | If known | Model used for task execution stage. |
| `passes` | Yes | Number of execution passes. |
| `status` | Yes | `planning`, `in_progress`, `completed`, `abandoned`. |
| `depends_on` | If applicable | List of campaign IDs this campaign depends on. |

---

## Backend Declaration

Every campaign must declare which backend (provider) was used. This declaration must appear in:

1. The campaign markdown file header.
2. The final handoff packet.
3. Any promoted ADR, spec, or audit derived from campaign output.

### Format

```markdown
## Backend

- **Provider:** codex | claude | manual
- **Audit model:** <model_id> | unknown
- **Compiler model:** <model_id> | unknown
- **Task model:** <model_id> | unknown
- **Configuration:** <path to settings or inline summary>
```

### Provider Switch Recording

If the backend changed during the campaign (e.g., codex for audit, claude for task execution), this must be recorded:

```markdown
## Backend (multi-provider)

| Stage | Provider | Model |
|-------|----------|-------|
| Audit | codex | gpt-5.1-codex |
| Compile | codex | gpt-5.1-codex |
| Task execution | claude | claude-sonnet-4-20250514 |

**Switch reason:** <why the provider changed>
```

Silent provider switches are **forbidden**. If a switch occurred and was not recorded, the campaign output must not be promoted into authoritative docs.

---

## Operator Steering Instructions

The operator must be able to inspect and steer the campaign at any point. The campaign must provide:

### Checkpoint Visibility

After each task completes, the operator must be able to see:
- Which task just completed (task ID, slug).
- Task status (`success`, `failed`, `blocked`).
- Summary of changes made.
- Tests run and results.
- Any decisions made during the task.
- Whether the campaign should continue or pause.

### Pause / Resume Gates

The campaign must support pausing after any task. The operator may:
- Inspect results.
- Modify remaining tasks (scope, files, tests, activation prompts).
- Add or remove tasks.
- Change the backend for remaining tasks (must be recorded).
- Resume from the next pending task.
- Abandon the campaign and write a partial handoff.

Campaign Runner's per-task execution model already supports this. The operator stops the runner between tasks and resumes with `--passes` or by running individual tasks.

### Manual Review Gates

Before a campaign proceeds from one phase to the next (audit → compile → execute), the operator should review:
- Audit output: does it correctly identify repo structure, risks, and areas?
- Campaign set: are the proposed campaigns and tasks scoped correctly?
- Task execution: do the first 1-2 tasks produce correct results before continuing?

---

## Scope Boundaries

### Allowed Edit Zones

Campaign Runner tasks may modify files only within their declared file scope (the `files` array in the task definition). By convention, allowed zones for ResonantOS campaigns:

| Zone | Allowed? | Notes |
|------|----------|-------|
| `docs/adr/` | Yes | New ADRs, edits to existing ADRs. |
| `docs/specs/` | Yes | New specs, spec updates. |
| `docs/architecture/` | Yes | Architecture doc updates (but not CODEMAP, SYSTEM_BOUNDARIES, RUNTIME_SURFACES without review). |
| `docs/agent-workflows/` | Yes | Convention doc updates. |
| `docs/audits/` | Yes | New audits. |
| `docs/templates/` | Yes | Template creation and updates. |
| `src/` | Conditional | Only if task explicitly declares source files and risk is LOW or MED. HIGH-risk source changes require operator review before execution. |
| `src-tauri/` | Conditional | Same as `src/`. Additionally, `src-tauri/src/lib.rs` (command registration) should only be modified by tasks with explicit operator approval. |
| `public/addons/` | Conditional | Manifest changes only. Must not break the addon catalog. |
| `examples/` | Yes | Example updates. |

### Forbidden Edit Zones

Campaign Runner tasks must NEVER modify:

| Zone | Why |
|------|-----|
| `.gitignore` | Pattern changes affect all contributors. Campaign Runner's entries were added by ADR-035. |
| `package.json` dependencies | Requires dependency review and lockfile update. |
| `Cargo.toml` dependencies | Requires dependency review and lockfile update. |
| `rust-toolchain.toml` | Toolchain changes affect all platforms. |
| `vite.config.ts` | Build configuration. |
| `tsconfig.json` | Compiler configuration. |
| `.github/workflows/` | CI/CD pipeline. |
| `src-tauri/capabilities/` | Security-critical capability declarations. |
| `src/sdk/addons/index.ts` | SDK public surface. |
| `src/core/contracts.ts` | Central type system (2,749 lines). Changes ripple everywhere. |
| `src-tauri/src/host_state.rs` | Secrets handling and capability gates. |
| `server/` | Hosted service — separate deployment. |
| `addons/resonant-browser-native/` | Native C++ code. |

If a campaign task requires modifying a forbidden zone, the task must be:
1. Marked as `risk: HIGH`.
2. Reviewed by the operator before execution.
3. Documented in the handoff with explicit justification.

---

## Checkpoint Expectations

Every campaign must produce checkpoints at these boundaries:

| Checkpoint | When | Content |
|-----------|------|---------|
| **Audit checkpoint** | After Stage A completes | Summary of audit findings, identified risk areas, repo structure observations. |
| **Compile checkpoint** | After Stage B completes | Campaign set summary: how many campaigns, how many tasks, risk distribution, dependency graph. |
| **Task checkpoint** | After each task completes | Per the CAMPAIGN_CHECKPOINT_TEMPLATE. |
| **Campaign completion checkpoint** | After all tasks complete or campaign is abandoned | Per the CAMPAIGN_HANDOFF_TEMPLATE. |

Use `docs/templates/campaigns/CAMPAIGN_CHECKPOINT_TEMPLATE.md` for per-task checkpoints.

---

## Artifact Output Expectations

### Transient Artifacts (gitignored)

These are produced by Campaign Runner during execution and are **never committed**:

- `docs/_audits/<date>/<audit_id>/` — audit prompts, outputs, run inputs.
- `docs/_campaign_runs/<date>/<slug>/<run_id>/` — run metadata.
- `docs/_campaign_runs/state/` — state machine (state.json, transitions).
- `docs/Campaign/` — campaign markdown briefs.
- `docs/tasks/<slug>_<date>_<seq>/` — task markdown artifacts.

### Durable Artifacts (committed after promotion)

These are produced by the operator after campaign completion, derived from campaign output:

- ADRs in `docs/adr/` — one ADR per architectural decision.
- Specs in `docs/specs/` — one spec per implementation contract.
- Audits in `docs/audits/` — one audit per finding.
- Architecture updates in `docs/architecture/`.
- Agent workflow updates in `docs/agent-workflows/`.
- Template updates in `docs/templates/`.

The promotion path is: **transient campaign output → operator review → durable doc → commit**.

---

## Validation Requirements

Before a campaign is considered complete, the operator must verify:

- [ ] Backend declaration is present and complete.
- [ ] No silent provider switches occurred (or all switches are recorded).
- [ ] All checkpoints are produced (audit, compile, per-task, completion).
- [ ] Handoff packet is complete per CAMPAIGN_HANDOFF_TEMPLATE.
- [ ] No forbidden zones were modified without explicit justification.
- [ ] All task results have verification evidence (test output, build output).
- [ ] Transient artifacts are not committed (verify with `git status --short`).
- [ ] Durable artifacts (promoted docs) follow the relevant template.
- [ ] `git diff --check` passes.
- [ ] `npm test -- --run` passes (all 168+ tests) if source files were modified.

---

## Handoff Packet Requirements

Every completed (or abandoned) campaign must produce a handoff packet following `docs/templates/campaigns/CAMPAIGN_HANDOFF_TEMPLATE.md`.

Minimum required sections:
1. Campaign identity (ID, slug, title, operator, dates).
2. Backend declaration.
3. Completion status (completed, partially-completed, abandoned).
4. Task results summary (per-task status, decisions, artifacts).
5. Decisions ledger (what was decided and why).
6. Open items (what remains unresolved).
7. Artifact inventory (transient paths + promoted doc paths).
8. Context for next campaign (if work continues).
9. Verification evidence (aggregated test/build results).
10. Archive intake candidates (what should go into the Living Archive).

---

## Reference

- `docs/adr/ADR-035-existing-campaign-runner-integration.md` — Integration decision.
- `docs/agent-workflows/CAMPAIGN_RUNNER_USAGE.md` — Usage conventions.
- `docs/agent-workflows/CONTEXT_HANDOFF_CONTRACT.md` — Handoff contract.
- `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md` — Input protocol.
- `docs/specs/campaign-runner/FIT_GAP_REVIEW.md` — Fit-gap analysis.
- `docs/specs/campaign-runner/INSTALLATION_PLAN.md` — Installation plan.
- `docs/specs/campaign-runner/VALIDATION_PLAN.md` — Validation plan.
- `docs/templates/campaigns/` — Copyable campaign templates.

---

*This contract applies to all campaigns executed against the ResonantOS vNext repository. Campaigns that do not satisfy this contract should not have their output promoted into authoritative docs.*
