# Campaign Runner — Fit-Gap Review

**Date:** 2026-05-22  
**Source:** https://github.com/Resonant-Jones/Campaign-Runner  
**Version reviewed:** `0.1.0a0` (private-alpha friend-share)  
**Review type:** External tool integration assessment — NOT a ResonantOS addon or runtime service.

---

## 1. What the Existing Campaign Runner Already Does

Campaign Runner (`codex_runner`) is a deterministic audit-to-campaign execution runner. It operates as a standalone Python CLI on a target git repository.

### Pipeline (3 stages)

```
Stage A (Audit)              Stage B (Compile)              Stage C (Execute)
┌──────────────────┐        ┌───────────────────────┐      ┌──────────────────────┐
│ Run mega-audit    │───────▶│ Compile audit into     │─────▶│ Execute tasks from     │
│ via provider       │        │ campaign set (JSON)    │      │ selected campaign      │
│ → audit_output.json│        │ → campaign_set.json    │      │ via provider           │
└──────────────────┘        └───────────────────────┘      └──────────────────────┘
```

### Key capabilities

| Capability | Details |
|-----------|---------|
| **Audit** | Runs a "mega audit" prompt against the target repo via `codex` or `claude`. Output validated against `mega_audit_output.schema.json`. |
| **Compile** | Compiles audit output into a campaign set (campaigns with tasks, dependencies, risk levels, file scopes, test commands). Schema: `campaign_set.schema.json`. |
| **Execute** | Selects a campaign (deterministic: highest high-risk pending count, then date, then slug). Executes selected campaign's tasks via provider. Schema: `task_result.schema.json`. |
| **State machine** | Tracks campaign/task status in `docs/_campaign_runs/state/state.json`. Append-only transition log in `state_transitions.jsonl`. |
| **Scope enforcement** | After each task, verifies that only declared files were modified. Out-of-scope changes abort the run. |
| **Branch management** | Creates `campaign/<date>/<slug>-<seq>` git branches per campaign. Commits task artifacts with deterministic messages. |
| **Dry-run mode** | Default. Inspects plans without executing file-mutating tasks. |

### What it writes into the target repo

| Directory | Content | Gitignored? |
|-----------|---------|-------------|
| `docs/_audits/<date>/<audit_id>/` | audit_input_prompt.md, audit_output.json, compiler_input_prompt.md, campaign_set_output.json, run_inputs.json | Recommended |
| `docs/_campaign_runs/<date>/<slug>/<run_id>/` | run_inputs.json, run_meta.json | Recommended |
| `docs/_campaign_runs/state/` | state.json, state_transitions.jsonl | Recommended |
| `docs/Campaign/` | `CAMPAIGN_<date>_<SLUG>_<seq>.md` campaign briefs | Commit |
| `docs/tasks/<slug>_<date>_<seq>/` | `TASK_<slug>_<date>.md` task artifacts | Commit |

### Campaign/task ID conventions

- **Campaign ID:** `YYYY-MM-DD::campaign_slug::seq3` (e.g., `2026-05-22::auth_migration::001`)
- **Task ID:** Freeform, unique within campaign
- **Task risk:** `HIGH`, `MED`, `LOW`
- **Task status:** `pending`, `success`, `failed`, `blocked`
- **Campaign status:** `open`, `completed`

---

## 2. Runtime / Dependency Assumptions

### Runtime
- **Language:** Python 3.11+
- **Execution model:** CLI subprocess. Invoked via `codexrun` or `python -m codex_runner`.
- **Standard library only:** No mandatory pip dependencies. The runner uses only Python stdlib (`argparse`, `json`, `subprocess`, `hashlib`, `pathlib`, `tempfile`, `dataclasses`, `re`, `fnmatch`).
- **Optional TUI:** `textual>=0.70.0` (only needed for interactive `--tui` mode).

### External binaries (must be on PATH)

| Binary | Required? | Purpose |
|--------|-----------|---------|
| `codex` | If `--provider codex` | AI provider execution |
| `claude` | If `--provider claude` | AI provider execution |
| `git` | Always | Repository operations |

### Environment variables

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `CODEX_MODEL` | No | Default model for codex provider (fallback: `~/.codex/config.toml`, then `"unknown"`) |
| `OPENAI_MODEL` | No | Alternative env var for model ID |
| `CI` | No | If `"1"`, `"true"`, `"yes"`, or `"on"`: enables verify mode, disables TUI auto-launch |
| `PATH` | Always | Used to locate `codex`, `claude`, `git` binaries |

### Config files (read, not written by runner)

| File | Purpose |
|------|---------|
| `~/.codex/config.toml` | Codex default model (read by `model_id_helper.py`) |

### Config files (written by runner)

| File | Purpose |
|------|---------|
| `~/.config/campaign_runner/settings.toml` | Persisted TUI settings and presets |

### NO secrets management
- Campaign Runner does NOT store, read, or manage API keys or provider secrets.
- Provider authentication is delegated to the `codex` / `claude` binaries, which manage their own credentials.
- No `.env` file is used.

---

## 3. Classification (ResonantOS Perspective)

| Question | Answer |
|----------|--------|
| Is it a repo-local tool? | **Yes.** It operates ON the local repo checkout. |
| Is it a ResonantOS addon? | **No.** It is a standalone Python package. |
| Is it an SDK utility? | **No.** It has its own CLI surface. |
| Is it an external service? | **No.** It is a CLI subprocess that runs locally. |
| Is it a Tauri-side (Rust) service? | **No.** Completely separate process, not managed by the Rust host. |
| Is it a frontend module? | **No.** No TypeScript/React code. |
| Could it become an addon? | **No.** Wrapping a Python CLI inside a Tauri addon adds complexity without benefit. Sidecar model is correct. |

**Recommended classification:** External repo-local CLI tool, used as a sidecar to ResonantOS development.

---

## 4. Integration Fit Analysis

### What fits well

| Aspect | Fit |
|--------|-----|
| **Output location** | Campaign Runner writes to `docs/` subdirectories. ResonantOS docs live in `docs/`. No path conflict — directories are namespaced (`_audits/`, `_campaign_runs/`, `Campaign/`, `tasks/`). |
| **Git workflow** | Campaign Runner creates `campaign/<date>/<slug>-<seq>` branches. ResonantOS uses `dev`, `main`, and `Contribution/*` branches. No naming conflict. |
| **Clean-tree requirement** | Campaign Runner requires a clean git tree. ResonantOS agent workflow (`AGENTS.md`) also requires clean-tree validation before commits. Compatible. |
| **Provider model** | Campaign Runner uses `codex` or `claude` directly. ResonantOS provider fabric (ADR-005) routes through centralized policy. These are separate concerns — Campaign Runner is a development tool, not a runtime provider consumer. |
| **No secrets in code** | Campaign Runner has no hardcoded secrets. Provider auth is external. ResonantOS secrets handling (ADR-009) is not affected. |
| **Documentation compatibility** | Campaign Runner output (campaign briefs, task artifacts) is markdown. ResonantOS docs are markdown. Living Archive intake can consume both. |

### Gaps / Tensions

| Gap | Severity | Mitigation |
|-----|----------|-----------|
| **Python dependency** | Low | ResonantOS is Node/Rust. Campaign Runner requires Python 3.11+. This is a developer-side dependency, not a runtime dependency. Contributors who want to use Campaign Runner install Python separately. |
| **Provider binary requirement** | Low | `codex` or `claude` must be on PATH. Same as above — developer-side, not runtime. |
| **No ResonantOS provider fabric integration** | Low | Campaign Runner does not route through the ResonantOS provider fabric. This is acceptable — it's a development tool, not a runtime consumer. |
| **Output directories not gitignored** | Medium | If Campaign Runner output directories are not gitignored, they will appear in `git status` and may be committed accidentally. **Add `.gitignore` entries.** |
| **State file conflicts** | Low | Campaign Runner state (`docs/_campaign_runs/state/`) is separate from ResonantOS state (`runtime-state.json` in app config). No conflict. |
| **Branch proliferation** | Low | Campaign Runner creates one branch per campaign. Active campaigns may create 1-3 branches. Acceptable for development repos. |
| **No ResonantOS audit trail integration** | Low | Campaign Runner has its own audit trail (`docs/_audits/`). ResonantOS audit trail is in `docs/audits/`. Separate; no conflict. |
| **Duplicate audit concern** | Low | Both Campaign Runner and ResonantOS have "audit" concepts but at different layers. Campaign Runner audits repo structure. ResonantOS audits architecture compliance. |

---

## 5. Files Likely Affected (by integration)

### Minimal installation (recommended first step)

| File | Change | Risk |
|------|--------|------|
| `.gitignore` | Add `docs/_audits/`, `docs/_campaign_runs/` | None |
| `docs/README.md` | Add Campaign Runner reference in navigation | None |
| `docs/specs/campaign-runner/INSTALLATION_PLAN.md` | This document | None |

### Deferred installation (if proven valuable)

| File | Change | Risk |
|------|--------|------|
| `scripts/campaign-runner.sh` | Wrapper script with ResonantOS-specific defaults | Low |
| `package.json` | Add `"campaign:dry-run"`, `"campaign:audit"` npm scripts | Low |
| `AGENTS.md` | Add Campaign Runner usage guidance for AI agents | Low |
| `docs/FEATURE_BACKLOG.md` | Track Living Archive intake of campaign output | Low |
| `docs/agent-workflows/UNIFIED_INPUT_PROTOCOL.md` | Reference campaign context as input source | None (already compatible) |

### What could NOT be affected without an ADR change

| File | Why not |
|------|---------|
| `src/core/contracts.ts` | No new types needed for a sidecar tool |
| `src-tauri/src/lib.rs` | No Tauri commands needed |
| `src-tauri/Cargo.toml` | No Rust dependencies needed |
| `public/addons/index.json` | Not an addon |
| `src/sdk/addons/` | Not an SDK consumer |
| `server/` | Not a hosted service |

---

## 6. Files That MUST NOT Be Touched

- Any file under `src/` (TypeScript frontend)
- Any file under `src-tauri/` (Rust host)
- `package.json` dependencies (Campaign Runner is NOT a Node dependency)
- `Cargo.toml` or `rust-toolchain.toml`
- `vite.config.ts` or `tsconfig.json`
- `public/addons/` (Campaign Runner is NOT an addon)
- `.github/workflows/` (Campaign Runner is NOT part of CI)
- `server/` (Campaign Runner is NOT a hosted service)
- `addons/` (Campaign Runner has its own repo)
- `crates/` (Campaign Runner is Python, not Rust)

---

## 7. Integration Risks

| Risk | Severity | Description | Mitigation |
|------|----------|-------------|-----------|
| Developer confusion | Medium | Contributors may think Campaign Runner is required or part of ResonantOS. | Clear documentation: optional tool, sidecar model. |
| Python version skew | Low | Different contributors may have different Python versions. | Document minimum Python 3.11 in installation plan. |
| Provider binary availability | Medium | Not all contributors have `codex` or `claude` installed. | Dry-run mode works without a provider (generates plan only). Execute mode requires provider. |
| Output directory clutter | Low | `docs/_audits/` and `docs/_campaign_runs/` add directories. | Gitignore them. |
| State drift | Low | If Campaign Runner is used infrequently, state goes stale. | State files are timestamped. Staleness is visible. |
| Git history pollution | Low | Campaign Runner creates commits with deterministic messages. | Commits are on campaign branches, not `dev`/`main`. Can be squashed. |
| Security of provider invocations | Low | Campaign Runner invokes `codex`/`claude` as subprocesses. Provider binary security is the user's responsibility. | Campaign Runner does not manage secrets. Standard subprocess invocation. |

---

## 8. Integration Mode Recommendation

**Recommendation: Sidecar model.**

Campaign Runner is installed separately (Python venv or `pip install`), invoked as an external CLI, and writes output into the ResonantOS repo's `docs/` directory. ResonantOS does not embed, wrap, or manage Campaign Runner.

### Why sidecar over embedding

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Sidecar** (recommended) | Zero ResonantOS code changes. Natural CLI tool usage. | Requires separate install step. | ✅ Go |
| **npm script wrapper** | Convenient one-command invocation. | Still needs Python + Campaign Runner installed. Adds noise to package.json. | ⬜ Defer |
| **Shell wrapper script** | Encodes ResonantOS-specific defaults. | Same as npm script but in a script file. | ⬜ Defer |
| **Tauri subprocess** | Managed lifecycle. | Major complexity. Python process management from Rust. Cross-platform edge cases. | ❌ No |
| **Rewrite in Rust/TS** | Would integrate natively. | Massive duplication. Campaign Runner is 3,500+ lines of Python with schema validation and provider dispatch. | ❌ No |

---

## 9. What Campaign Runner CANNOT Do (ResonantOS-specific gaps)

| Limitation | Impact | Workaround |
|-----------|--------|-----------|
| Cannot invoke ResonantOS's provider fabric | Campaign Runner tasks use `codex`/`claude` directly, bypassing ResonantOS provider routing. | Acceptable. Campaign Runner is a dev tool, not a runtime consumer. |
| Cannot produce Delegation Packets | Campaign Runner tasks are NOT Delegation Packets. No automatic mapping exists. | Manual mapping: Augmentor reads campaign tasks and creates Delegation Packets. |
| Cannot write to Living Archive | Campaign Runner writes to `docs/`, not to the Living Archive ingestion pipeline. | Manual or scripted intake: run `archive_request_ingest` on campaign output files. |
| Cannot enforce ResonantOS capability grants | Campaign Runner enforces file scope, not ResonantOS capabilities. | Separate layers. File scope is stricter than capability grants. |
| Cannot participate in ResonantOS context management | Campaign Runner constructs its own activation prompts. | Compatible format (verified in ADR-034). Integration is convention-level, not code-level. |

---

## 10. Next Steps (staged)

### Phase 0: Documentation (this pass)
- [x] FIT_GAP_REVIEW.md (this document)
- [x] INSTALLATION_PLAN.md (companion document)
- [x] ADR-035 (integration decision record)

### Phase 1: Minimal Installation (recommended immediate next)
- [ ] Add `.gitignore` entries for `docs/_audits/` and `docs/_campaign_runs/`
- [ ] Verify Campaign Runner dry-run against ResonantOS repo
- [ ] Document results in PROJECT_STATUS.md

### Phase 2: Deferred Integration (if Phase 1 proves valuable)
- [ ] Create `scripts/campaign-runner.sh` wrapper
- [ ] Add npm scripts for convenience
- [ ] Add Campaign Runner guidance to AGENTS.md
- [ ] Living Archive intake of campaign output (script or manual)

### Phase 3: Deep Integration (requires separate ADRs)
- [ ] Automated Delegation Packet mapping from campaign tasks
- [ ] Provider fabric routing for Campaign Runner provider calls
- [ ] Campaign Runner output → System Architecture Memory

---

*No ResonantOS source code has been modified. This review is based on inspection of the Campaign Runner source at https://github.com/Resonant-Jones/Campaign-Runner (commit at time of review).*
