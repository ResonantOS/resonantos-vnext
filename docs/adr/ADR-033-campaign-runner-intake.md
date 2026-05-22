# ADR-033: Campaign Runner — Integration Intake

## Status

**Superseded by ADR-035.** This ADR recorded the initial intake classification for Campaign Runner. ADR-035 (`existing-campaign-runner-integration`) supersedes it with the final integration decision based on source code inspection and fit-gap review. This ADR is retained for historical context — it captures the initial classification as an external tool, which was correct, but the detailed integration posture is now in ADR-035.

## Context

Campaign Runner (package name: `codex_runner`) is a deterministic audit-to-campaign execution runner maintained as a standalone Python CLI tool in a separate repository:

**Repo:** https://github.com/Resonant-Jones/Campaign-Runner
**Version:** `0.1.0a0` (private-alpha friend-share)
**License:** Private-alpha. Not public open source.

Campaign Runner operates on a target repository as an external process. It:
1. Runs a "mega audit" of the target repo via a provider (codex or claude) — Stage A.
2. Compiles the audit into a campaign set (campaigns with tasks) — Stage B.
3. Executes tasks from the selected campaign via a provider — Stage C.

It is deterministic: clean-git-only, schema-validated, scope-guarded. It writes campaign/task/audit artifacts into the target repo's `docs/` directory and manages state in `docs/_campaign_runs/state/`.

ResonantOS currently has no integration with Campaign Runner. No ResonantOS code references it. No ResonantOS addon wraps it. This ADR defines the integration posture.

## Decision

**Campaign Runner is an external tool. ResonantOS will integrate with it through filesystem output and documented conventions, not through in-process embedding or Tauri command wrapping.**

### Integration Posture

1. **Filesystem integration** — Campaign Runner writes campaign/task/audit files into the ResonantOS repo. ResonantOS reads these files through existing mechanisms (Living Archive intake, Delegation Fabric, System Architecture Memory).
2. **No embedding** — Campaign Runner is NOT wrapped as a Tauri command, NOT invoked from the Rust host, NOT bundled as a dependency.
3. **No reimplementation** — Campaign Runner's deterministic runner, state machine, and schema validation are NOT reimplemented inside ResonantOS.
4. **Optional** — Campaign Runner is a tool that MAY be used with ResonantOS repos. It is not required for ResonantOS development, build, or operation.

### Filesystem Conventions

When Campaign Runner is used with the ResonantOS repo, these directories exist:

```
resonantos-vnext/
├── docs/
│   ├── _audits/           # Per-audit prompts, outputs, run inputs
│   ├── _campaign_runs/    # Per-run metadata and state machine
│   │   └── state/
│   │       ├── state.json           # Campaign/task state
│   │       └── state_transitions.jsonl  # Append-only transition log
│   ├── Campaign/          # Materialized campaign markdown docs
│   │   └── CAMPAIGN_<date>_<SLUG>_<seq>.md
│   └── tasks/             # Materialized task markdown docs
│       └── <slug>_<date>_<seq>/
│           └── TASK_<slug>_<date>.md
```

These directories do NOT conflict with ResonantOS documentation conventions. `_audits/` and `_campaign_runs/` are operational artifacts (recommend `.gitignore`). `Campaign/` and `tasks/` are documentation artifacts suitable for Living Archive intake and version control.

### Relationship to Existing Systems

| ResonantOS System | Relationship |
|-------------------|-------------|
| Delegation Fabric (ADR-015) | Campaign Runner tasks are NOT Delegation Packets, but they are semantically similar. Campaign Runner tasks could be mapped to Delegation Packets if automated execution is desired. |
| Living Archive (ADR-007, 011, 012, 013) | Campaign Runner output (campaign summaries, completed task artifacts, audit reports) are candidates for Living Archive intake through the existing ingestion pipeline. |
| System Architecture Memory (ADR-014) | Campaign Runner audit output could feed System Architecture Memory, giving Augmentor awareness of repo structure and risk areas. |
| Provider Fabric (ADR-005) | Campaign Runner invokes providers directly (codex, claude). It does NOT route through ResonantOS provider fabric. This is a known boundary — future integration could add fabric routing. |
| Compute Fabric (ADR-032) | Campaign Runner task execution could be delegated to Compute Fabric nodes for isolation or GPU access. Low priority. |
| Agent Workflow Conventions | Campaign Runner task activation prompts are compatible with the Unified Input Protocol (separate intake). The Context Handoff Contract could be used for task-to-task handoff within a campaign. |
| Minimal Kernel (ADR-026) | Campaign Runner is NOT a kernel service. It is completely external. |

### What ResonantOS Must NOT Do

- Embed Campaign Runner as a subprocess managed by the Rust host.
- Wrap Campaign Runner in a `#[tauri::command]`.
- Parse Campaign Runner state files from Rust or TypeScript (use intake pipeline instead).
- Add Campaign Runner as a dependency (Python package vs Node/Rust project).
- Reimplement Campaign Runner's deterministic runner in TypeScript or Rust.
- Require Campaign Runner for ResonantOS development or build.

## Consequences

### Positive

- Provides a structured, deterministic audit-and-plan tool that can be used with ResonantOS repos without coupling.
- Campaign Runner output enriches the Living Archive with structured repo analysis.
- Campaign/task model aligns conceptually with the Delegation Fabric, creating a natural mapping path.
- Zero runtime risk — Campaign Runner is external and optional.

### Negative

- Two separate provider invocation paths (Campaign Runner direct vs ResonantOS provider fabric). Credential management is duplicated.
- Campaign Runner state and ResonantOS state are separate. No automatic synchronization.
- Potential confusion about whether Campaign Runner is "part of" ResonantOS. This ADR is the authoritative boundary statement.
- Campaign Runner's output directories (`_audits/`, `_campaign_runs/`) add clutter to the docs folder if not gitignored.

## Evidence

Campaign Runner exists as a working tool. Evidence comes from its own repository, not from ResonantOS integration:

- [x] Campaign Runner repo: https://github.com/Resonant-Jones/Campaign-Runner
- [x] Schema-validated campaign/task model: `campaign_set.schema.json`, `task_result.schema.json`
- [x] Deterministic runner implementation: `src/codex_runner/runner.py` (~2,090 lines)
- [x] Provider-agnostic: supports codex and claude
- [x] State machine: `state.json` + `state_transitions.jsonl`
- [ ] Campaign Runner has been run against the ResonantOS repo (not yet verified).
- [ ] Campaign Runner output has been ingested into the Living Archive (not yet attempted).

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Embed Campaign Runner as a ResonantOS addon. | Campaign Runner is a Python CLI tool. Wrapping it in a Tauri addon adds complexity without benefit. Filesystem integration is simpler and more robust. |
| Reimplement Campaign Runner in Rust inside the Tauri host. | Massive duplication of effort. Campaign Runner's value is as a standalone deterministic runner. Reimplementation would diverge. |
| Require Campaign Runner for ResonantOS development. | Violates the optional tool principle. Contributors should not need Python + codex/claude to work on the repo. |
| Ignore Campaign Runner — no integration. | Misses the opportunity to feed structured repo analysis into the Living Archive and System Architecture Memory. |

## Drift Watch

What future change would make this ADR stale?

- If Campaign Runner adds a provider fabric adapter that routes through ResonantOS, the credential boundary needs revisiting.
- If Campaign Runner tasks are automatically mapped to Delegation Packets, the integration moves from convention to code.
- If ResonantOS adds its own deterministic campaign runner (unlikely given this ADR's non-reimplementation stance), this ADR would be superseded.
- If Campaign Runner's output format changes incompatibly, intake pipeline mappings need updating.

## Docs to Update If Accepted

- [x] `docs/specs/campaign-runner/README.md` — integration intake (companion to this ADR).
- [ ] `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md` — note Campaign Runner compatibility.
- [ ] `docs/agent-workflows/CONTEXT_HANDOFF_CONTRACT.md` — note Campaign Runner compatibility.
- [ ] `docs/FEATURE_BACKLOG.md` — track Living Archive intake integration.
- [ ] `docs/PROJECT_STATUS.md` — note Campaign Runner as external integration.
- [ ] `.gitignore` — optionally add `docs/_audits/` and `docs/_campaign_runs/`.
