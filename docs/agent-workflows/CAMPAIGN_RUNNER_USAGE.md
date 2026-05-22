# Campaign Runner Usage — Agent Workflow Convention

**Status:** Active  
**References:** ADR-035, FIT_GAP_REVIEW.md, INSTALLATION_PLAN.md, UNIFIED_INPUT_PROTOCOL.md, CONTEXT_HANDOFF_CONTRACT.md

---

## What Campaign Runner Is

Campaign Runner (`codex_runner`) is an **external repo-local sidecar CLI tool**. It is maintained in a separate repository:

**Repo:** https://github.com/Resonant-Jones/Campaign-Runner  
**Integration ADR:** `docs/adr/ADR-035-existing-campaign-runner-integration.md`

It is:

- A deterministic audit-to-campaign execution runner.
- A standalone Python CLI invoked from outside the ResonantOS runtime.
- An optional development planning tool.

It is NOT:

- Part of the ResonantOS runtime.
- A ResonantOS addon.
- Routed through the ResonantOS provider fabric.
- A Tauri subprocess or IPC command.
- Required for ResonantOS build, test, or operation.

---

## Provider / Backend Model

Campaign Runner invokes external AI providers directly as CLI subprocesses. It does NOT use the ResonantOS provider fabric (ADR-005).

It currently supports:

- **Codex** (`--provider codex`) — invokes the `codex` binary on PATH.
- **Claude** (`--provider claude`) — invokes the `claude` binary on PATH.

Provider selection is a **local configuration decision** made by the operator running Campaign Runner. The ResonantOS shell has no visibility into which backend is active.

### Steerability Requirements Before Handoff

Before any campaign output is promoted into authoritative ResonantOS documentation, the operator must satisfy these steerability requirements:

| Requirement | Why |
|-------------|-----|
| **Operator must know which backend is active.** | Different providers have different capabilities, biases, and output styles. ADRs, specs, and audits derived from campaign output must be traceable to a known provider. |
| **Campaign prompt must declare backend preference when relevant.** | If a campaign task requires a specific provider capability (e.g., long-context reasoning, code generation), the prompt must declare that preference explicitly. Provider-agnostic campaigns should note that any supported backend is acceptable. |
| **Campaign must expose checkpoint summaries.** | Long-running campaigns must produce intermediate checkpoint summaries. These allow human review before the campaign proceeds to the next phase. Without checkpoints, an operator cannot course-correct mid-campaign. |
| **Campaign must allow pause/resume or manual review gates.** | The operator must be able to pause a campaign after any task completes, inspect results, and decide whether to continue. Campaign Runner's dry-run mode and per-task execution model already support this. |
| **Campaign must write a final handoff packet.** | Every completed campaign must produce a handoff summary following the Context Handoff Contract (`docs/agent-workflows/CONTEXT_HANDOFF_CONTRACT.md`). The handoff must include: completion status, decisions made, open items, artifacts produced, verification evidence, and archive intake candidates. |
| **Campaign must distinguish transient artifacts from durable docs.** | Campaign Runner output in `docs/_audits/`, `docs/_campaign_runs/`, `docs/Campaign/`, and `docs/tasks/` is **transient**. It is gitignored. Before any campaign output enters the permanent documentation surface, it must be promoted into an ADR, spec, audit, agent-workflow doc, or architecture doc. |
| **Campaign must not silently switch agents/providers mid-campaign.** | If the operator switches from codex to claude (or vice versa) between campaign tasks, this must be recorded in the campaign state and in the final handoff. Provider switches without documentation create untraceable output. |

---

## Branch Convention

Campaign Runner creates git branches for each campaign it executes:

```
campaign/<date>/<slug>-<seq>
```

Examples:
- `campaign/2026-05-22/auth_migration-001`
- `campaign/2026-05-23/docs_restructure-001`

These branches:

- Are separate from ResonantOS development branches (`dev`, `main`, `Contribution/*`).
- Contain campaign task commits with deterministic commit messages.
- Should be merged or deleted after campaign completion and handoff.
- Must NOT be merged directly into `main` without review.

---

## Output Locations

All Campaign Runner output is written into the `docs/` directory of the target repo. These directories are **gitignored** by default (added to `.gitignore` by this convention).

| Directory | Content | Git Policy |
|-----------|---------|------------|
| `docs/_audits/<date>/<audit_id>/` | Per-audit prompts, outputs, run inputs | **Gitignored** — operational artifacts |
| `docs/_campaign_runs/<date>/<slug>/<run_id>/` | Per-run metadata and state | **Gitignored** — operational artifacts |
| `docs/_campaign_runs/state/` | Campaign/task state machine (state.json, state_transitions.jsonl) | **Gitignored** — operational artifacts |
| `docs/Campaign/` | Materialized campaign markdown briefs | **Gitignored** — transient drafts |
| `docs/tasks/<slug>_<date>_<seq>/` | Materialized task markdown artifacts | **Gitignored** — transient drafts |

### Why These Are Gitignored

Campaign Runner output is **transient planning material**. It is not authoritative documentation. Committing it would:

- Pollute the permanent documentation surface with planning drafts.
- Create confusion about which documents are current and which are campaign artifacts.
- Make it harder to distinguish between hand-authored docs and AI-generated campaign output.

### Promotion Path

To move campaign output into the permanent documentation surface:

1. Review the campaign handoff packet.
2. Extract decisions → write an ADR in `docs/adr/`.
3. Extract specifications → write a spec in `docs/specs/`.
4. Extract findings → write an audit in `docs/audits/`.
5. Extract operational guidance → update `docs/agent-workflows/`.
6. Extract architecture observations → update `docs/architecture/`.
7. The original campaign files remain gitignored and serve as provenance.

---

## Usage Workflow

### 1. Install Campaign Runner (one-time)

Follow `docs/specs/campaign-runner/INSTALLATION_PLAN.md` Path A (Minimal).

```bash
# Clone alongside the ResonantOS repo
git clone https://github.com/Resonant-Jones/Campaign-Runner.git ../Campaign-Runner
cd ../Campaign-Runner
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -e .
```

### 2. Run a dry-run audit

```bash
cd /path/to/resonantos-vnext
RUNNER_PROMPTS=../Campaign-Runner/src/codex_runner/prompts
RUNNER_SCHEMAS=../Campaign-Runner/src/codex_runner/schemas

codexrun --dry-run \
  --repo-root . \
  --provider codex \
  --audit-prompt-file "$RUNNER_PROMPTS/mega_audit.md" \
  --audit-schema-file "$RUNNER_SCHEMAS/mega_audit_output.schema.json" \
  --compiler-prompt-file "$RUNNER_PROMPTS/audit_report_to_campaign_runner.md" \
  --campaign-set-schema-file "$RUNNER_SCHEMAS/campaign_set.schema.json" \
  --task-result-schema-file "$RUNNER_SCHEMAS/task_result.schema.json"
```

### 3. Inspect output

```bash
# View generated campaigns
ls docs/_audits/
cat docs/_campaign_runs/state/state.json | python3 -m json.tool | head -80

# Verify no source files changed
git status --short
# Expected: clean (operational dirs are gitignored)
```

### 4. Execute (if dry-run is acceptable)

```bash
codexrun --execute \
  --repo-root . \
  --provider codex \
  # ... same prompt/schema flags as dry-run ...
```

### 5. Promote results

After campaign completion:

1. Review the campaign handoff packet (`docs/Campaign/CAMPAIGN_*.md`).
2. Write an ADR for each architectural decision.
3. Write a spec for each implementation contract.
4. Write an audit for each finding.
5. Commit the promoted docs (NOT the campaign files).
6. Delete or archive the campaign branch.

---

## Agent Usage Notes

### For AI coding agents operating in this repo

- Campaign Runner is a tool available to the human operator, not to the agent.
- An agent should NOT invoke Campaign Runner unless explicitly instructed.
- If the human mentions campaign output, the agent should read the relevant campaign files from `docs/Campaign/` or `docs/tasks/` to understand the planning context.
- Campaign output is NOT authoritative. The agent should verify claims against the current codebase.
- When an agent produces work that could feed a campaign, it should note this in its handoff under "Archive Intake Candidates."

### For the human operator

- Campaign Runner is your planning tool. It operates outside the agent's sandbox.
- Use dry-run mode first. Inspect campaign plans before executing.
- After campaign completion, promote results into authoritative docs before the agent's next session.
- The agent will use promoted docs (ADRs, specs, audits) as context. It will not read transient campaign files unless you explicitly point it to them.

---

## Related Docs

- `docs/adr/ADR-035-existing-campaign-runner-integration.md` — Integration decision record.
- `docs/specs/campaign-runner/FIT_GAP_REVIEW.md` — Detailed fit-gap analysis.
- `docs/specs/campaign-runner/INSTALLATION_PLAN.md` — Installation plan.
- `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md` — Unified input protocol.
- `docs/agent-workflows/CONTEXT_HANDOFF_CONTRACT.md` — Context handoff contract.
- `docs/agent-workflows/README.md` — General agent workflow conventions.
- `docs/agent-workflows/DOCS_REFACTOR_GUARDRAILS.md` — Docs refactor guardrails.
