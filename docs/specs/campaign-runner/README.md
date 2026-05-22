# Campaign Runner — Integration Intake

## Status

**Intake.** Campaign Runner exists as an external tool. This document defines how ResonantOS should interact with it, what integration points exist, and what boundaries must be respected. No ResonantOS source code has been modified.

## Source

Campaign Runner (package name: `codex_runner`) is a standalone Python CLI tool maintained in a separate repository:

**Repo:** https://github.com/Resonant-Jones/Campaign-Runner

**Current version:** `0.1.0a0` (private-alpha friend-share)

**License:** Private-alpha. Not public open source. Not on PyPI.

**Installation:** `python3 -m pip install -e .` from local checkout, or from a built `.whl`.

---

## Classification

**Campaign Runner is an external CLI tool. It is NOT a ResonantOS runtime service, addon, SDK primitive, or agent workflow convention.**

It operates ON a target repository (such as ResonantOS) as an external process. It does not run inside the ResonantOS shell, does not use the addon SDK, and does not route through the provider fabric.

| Question | Answer |
|----------|--------|
| Is it a ResonantOS addon? | **No.** It is a standalone Python package. |
| Is it a core runtime service? | **No.** Completely separate process. |
| Is it an SDK tool? | **No.** It has its own CLI surface. |
| Is it an agent workflow convention? | **No.** It is compiled code with JSON schemas. |
| Is it an external service? | **Yes.** External Python CLI that operates on a target repo. |
| Could it BECOME an addon? | **Unlikely.** Its value is as a standalone deterministic runner. Integration is through filesystem output, not in-process embedding. |

---

## What Campaign Runner Does

Campaign Runner is a **deterministic audit-to-campaign execution runner**:

```
Stage A (Audit)           Stage B (Compile)            Stage C (Execute)
┌──────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│ Run mega-audit    │────▶│ Compile audit into    │────▶│ Execute tasks from    │
│ of target repo    │     │ campaign set (JSON)   │     │ selected campaign     │
│ via provider      │     │ via provider           │     │ via provider          │
│ (codex or claude) │     │ (codex or claude)     │     │ (codex or claude)     │
└──────────────────┘     └──────────────────────┘     └──────────────────────┘
        │                         │                           │
        ▼                         ▼                           ▼
  docs/_audits/              state.json                  git commits
  <date>/<audit_id>/         docs/Campaign/              docs/tasks/<slug>/
  audit_output.json          docs/tasks/                 campaign branches
```

### Key architectural properties:

1. **Deterministic** — requires clean git working tree. Schema-validates all provider outputs. Enforces file-scope guards (tasks cannot modify files outside declared scope).
2. **Provider-agnostic** — supports `codex` and `claude` as interchangeable backends. Each stage can use different models. Provider settings flow through CLI flags, not config files.
3. **Schema-validated** — all provider outputs are validated against JSON schemas (`mega_audit_output.schema.json`, `campaign_set.schema.json`, `task_result.schema.json`).
4. **State machine** — tracks campaigns and tasks in `docs/_campaign_runs/state/state.json` with append-only transition log (`state_transitions.jsonl`).
5. **Campaign selection** — deterministic algorithm: highest high-risk pending task count, then date, then slug.
6. **Branch-per-campaign** — creates `campaign/<date>/<slug>-<seq>` git branches for each executed campaign.
7. **Scope enforcement** — after each task, verifies that only declared files were modified. Out-of-scope changes abort the run.
8. **Audit trail** — every run produces `docs/_audits/<date>/<audit_id>/` with `audit_input_prompt.md`, `audit_output.json`, `compiler_input_prompt.md`, `campaign_set_output.json`, `run_inputs.json`.

### CLI entry point:

```bash
codexrun --dry-run \
  --repo-root /path/to/target-repo \
  --provider codex \
  --audit-prompt-file mega_audit.md \
  --audit-schema-file mega_audit_output.schema.json \
  --compiler-prompt-file audit_report_to_campaign_runner.md \
  --campaign-set-schema-file campaign_set.schema.json \
  --task-result-schema-file task_result.schema.json
```

### Output directories (written into target repo):

| Directory | Content |
|-----------|---------|
| `docs/_audits/<date>/<audit_id>/` | Per-audit prompts, outputs, inputs |
| `docs/_campaign_runs/<date>/<slug>/<run_id>/` | Per-run metadata |
| `docs/_campaign_runs/state/` | State machine (state.json, transitions) |
| `docs/Campaign/` | Materialized campaign markdown docs |
| `docs/tasks/<slug>_<date>_<seq>/` | Materialized task markdown docs |

### Campaign and task ID conventions:

- **Campaign ID:** `YYYY-MM-DD::campaign_slug::seq3` (e.g., `2026-05-22::auth_migration::001`)
- **Task ID:** freeform string, unique within campaign
- **Task slug:** `[a-z0-9_]+`
- **Task risk:** `HIGH`, `MED`, or `LOW`
- **Task status:** `pending`, `success`, `failed`, `blocked`

---

## ResonantOS Integration Points

Campaign Runner is an external tool. ResonantOS does not embed or invoke it directly. Integration is through **filesystem output** — the campaign/task/audit files that Campaign Runner writes into the target repo.

### Candidate integration points:

| Integration | How | Priority |
|-------------|-----|----------|
| **Living Archive intake** | Campaign Runner outputs (campaign docs, task artifacts, audit reports) are candidates for Living Archive ingestion through the existing intake pipeline. | HIGH |
| **Delegation Fabric alignment** | Campaign Runner tasks resemble Delegation Packets. A mapping could allow Campaign Runner tasks to be executed as Delegation Packets, or Delegation Packet results to feed back into Campaign Runner state. | MEDIUM |
| **Provider fabric awareness** | Campaign Runner invokes providers directly (codex, claude). Future integration could route Campaign Runner provider calls through the ResonantOS provider fabric for credential mediation, cost tracking, and fallback. | LOW (requires Campaign Runner changes) |
| **Agent workflow conventions** | The Unified Input Protocol and Context Handoff Contract (companion intakes) can be used BY Campaign Runner when constructing task activation prompts. Campaign Runner's `activation_prompt` field in each task is essentially a mini unified input packet. | MEDIUM |
| **System Architecture Memory** | Campaign Runner audit output could feed System Architecture Memory (ADR-014), giving Augmentor and Engineer awareness of repo structure and risk areas. | MEDIUM |
| **Compute Fabric** | Campaign Runner task execution could be delegated to Compute Fabric nodes (ADR-032) for isolation or GPU access. | LOW (future) |

### What ResonantOS should NOT do:

- Embed Campaign Runner as a subprocess managed by the Rust host.
- Wrap Campaign Runner in a Tauri command.
- Parse Campaign Runner state files directly (use intake pipeline instead).
- Add Campaign Runner as a dependency (it's a Python package; ResonantOS is Node/Rust).
- Reimplement Campaign Runner's deterministic runner in TypeScript or Rust.

---

## Filesystem Conventions

If Campaign Runner is used with the ResonantOS repo, the following directories will exist:

```
resonantos-vnext/
├── docs/
│   ├── _audits/           # Campaign Runner audit output
│   ├── _campaign_runs/    # Campaign Runner run metadata
│   │   └── state/         # Campaign/task state machine
│   ├── Campaign/          # Campaign markdown files
│   └── tasks/             # Task markdown files
```

These directories should be added to `.gitignore` patterns if ResonantOS does not want to commit Campaign Runner artifacts by default. Alternatively, they can be committed as part of the documentation surface.

**Recommendation:** Add `docs/_audits/` and `docs/_campaign_runs/` to `.gitignore` (they are operational artifacts). Commit `docs/Campaign/` and `docs/tasks/` (they are documentation artifacts suitable for Living Archive intake).

---

## Open Questions

1. **Should Campaign Runner be used as the primary planning tool for ResonantOS development?**
   - Recommendation: Use Campaign Runner for structured audit-and-plan cycles. Do not require it for all development.

2. **Should Campaign Runner tasks be mapped to Delegation Packets?**
   - Recommendation: V1 is loose coupling. Campaign Runner writes tasks; Augmentor reads them and creates Delegation Packets. Future: automated mapping if the pattern proves valuable.

3. **Should Campaign Runner provider calls route through ResonantOS provider fabric?**
   - Recommendation: Not for V1. Campaign Runner manages its own provider invocation. Credential mediation could be explored later.

4. **Should Campaign Runner state be ingested into the Living Archive?**
   - Recommendation: Campaign summaries and completed task artifacts should go through the archive intake pipeline. Raw state files should not.

5. **Does Campaign Runner's scope enforcement conflict with ResonantOS capability enforcement?**
   - No conflict. Campaign Runner enforces file scope at the git level. ResonantOS enforces capabilities at the IPC level. They operate at different layers.

6. **What happens when Campaign Runner creates branches that conflict with the ResonantOS branch workflow?**
   - Campaign Runner branches follow `campaign/<date>/<slug>-<seq>`. ResonantOS uses `dev` and `main`. No conflict.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Campaign Runner writes files that conflict with ResonantOS docs conventions. | Low | Campaign Runner output directories (`_audits/`, `_campaign_runs/`, `Campaign/`, `tasks/`) are namespaced and non-overlapping with ResonantOS docs. |
| Campaign Runner provider calls bypass ResonantOS credential management. | Medium | Campaign Runner uses its own provider credentials. Document this boundary. Future: route through provider fabric. |
| Campaign Runner state goes stale if not regularly executed. | Low | State files are append-only. Staleness is visible (timestamps, run IDs). |
| Confusion about whether Campaign Runner is part of ResonantOS. | Medium | This intake document is the authoritative boundary statement. Campaign Runner is external. |

---

## Non-Goals

- Campaign Runner is NOT part of the ResonantOS build pipeline.
- Campaign Runner is NOT required for ResonantOS development.
- Campaign Runner is NOT a replacement for the Delegation Fabric.
- Campaign Runner is NOT a replacement for Augmentor or the Resonant Engineer.
- Campaign Runner is NOT embedded in the ResonantOS shell.
- Campaign Runner's deterministic runner is NOT reimplemented inside ResonantOS.

---

## Related Docs

- **External:** https://github.com/Resonant-Jones/Campaign-Runner — Campaign Runner source.
- `docs/adr/ADR-033-campaign-runner-intake.md` — ADR intake for Campaign Runner.
- `docs/adr/ADR-034-agent-context-management-intake.md` — Companion ADR for context management.
- `docs/adr/ADR-015-delegation-fabric-addon-catalog-native-tools.md` — Delegation Fabric.
- `docs/adr/ADR-016-context-memory-compaction.md` — Context memory layers.
- `docs/adr/ADR-014-system-architecture-memory.md` — System Architecture Memory.
- `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md` — Unified input protocol.
- `docs/agent-workflows/CONTEXT_HANDOFF_CONTRACT.md` — Context handoff contract.
- `docs/specs/agent-context-management/README.md` — Agent context management intake.

---

## Validation Required Before Any Integration Work

- [ ] Decision on whether Campaign Runner output directories should be gitignored or committed.
- [ ] Confirmation that Campaign Runner state files do not conflict with ResonantOS state persistence.
- [ ] Review of Campaign Runner's schema-validated campaign/task format against Delegation Packet format.
- [ ] Decision on whether Living Archive intake of Campaign Runner artifacts is desired.
- [ ] Confirmation that Campaign Runner's provider invocation (direct codex/claude calls) is acceptable alongside ResonantOS provider fabric.
