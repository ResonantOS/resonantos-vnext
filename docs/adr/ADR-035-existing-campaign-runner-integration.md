# ADR-035: Existing Campaign Runner — Integration Decision

## Status

**Proposed.** This ADR records the decision on how to integrate the existing Campaign Runner CLI tool with the ResonantOS vNext repository.

## Context

Campaign Runner (`codex_runner`) is an existing, working Python CLI tool for deterministic audit-to-campaign execution. It is maintained in a separate repository:

**Repo:** https://github.com/Resonant-Jones/Campaign-Runner  
**Version:** `0.1.0a0` (private-alpha friend-share)

It is NOT a ResonantOS addon, runtime service, SDK primitive, or agent workflow convention. It is a standalone CLI tool that operates ON a target git repository — running audits, compiling campaign sets, and executing scoped tasks via AI providers (codex or claude).

A detailed fit-gap review has been performed (`docs/specs/campaign-runner/FIT_GAP_REVIEW.md`). Key findings:

- **Zero conflict with ResonantOS source code.** Campaign Runner writes only to `docs/` subdirectories.
- **Zero conflict with ResonantOS runtime.** Campaign Runner is an external CLI, not a Tauri subprocess.
- **Python 3.11+ required.** ResonantOS is Node/Rust. This is a developer-side dependency, not a runtime dependency.
- **Separate provider invocation.** Campaign Runner calls `codex`/`claude` directly, not through the ResonantOS provider fabric.
- **Optional.** Campaign Runner is a development tool, not required for ResonantOS build, test, or operation.

ResonantOS has three previous ADRs related to this tool:

- **ADR-033** — Initial intake (incorrectly classified Campaign Runner as a convention/addon; since revised after source inspection).
- **ADR-034** — Agent Context Management (verified compatibility between Campaign Runner task prompts and Unified Input Protocol).
- **No ADR** yet exists for the actual integration decision. This ADR fills that gap.

## Decision

**Campaign Runner will be integrated as an external sidecar tool. ResonantOS will add `.gitignore` entries for Campaign Runner's operational output directories. No ResonantOS source code will be modified. No wrapper scripts, npm scripts, or Tauri commands will be added in Phase 0.**

### Phase 0 (This ADR — documentation only)

1. Add `.gitignore` entries for `docs/_audits/` and `docs/_campaign_runs/`.
2. Document integration posture in `docs/specs/campaign-runner/`.
3. No ResonantOS source code changes.

### Phase 1 (Future — after dry-run validation)

If a dry-run against the ResonantOS repo succeeds and proves valuable:

1. Create `scripts/campaign-runner.sh` wrapper with ResonantOS-specific defaults.
2. Add npm scripts (`campaign:dry-run`, `campaign:audit`, `campaign:execute`).
3. Document Campaign Runner usage in `AGENTS.md`.

### Phase 2 (Future — requires separate ADRs)

1. Automated Living Archive intake of campaign output.
2. Campaign task → Delegation Packet mapping.
3. System Architecture Memory enrichment from audit output.

### Binding Rules

- Campaign Runner is NOT embedded in the ResonantOS runtime. It runs as a separate process.
- Campaign Runner is NOT registered as a ResonantOS addon. It has its own CLI surface.
- Campaign Runner is NOT reimplemented inside ResonantOS. The Python tool is the canonical implementation.
- Campaign Runner is NOT required for ResonantOS development, build, test, or operation.
- Campaign Runner output directories (`docs/_audits/`, `docs/_campaign_runs/`) are operational artifacts and must be gitignored.
- Campaign Runner output directories (`docs/Campaign/`, `docs/tasks/`) are documentation artifacts and may be committed.
- Campaign Runner does NOT modify ResonantOS source code. It writes only to `docs/`.
- Campaign Runner's provider invocations do NOT route through the ResonantOS provider fabric.
- Campaign Runner does NOT manage ResonantOS secrets or credentials.
- Campaign Runner branches follow `campaign/<date>/<slug>-<seq>`. These do NOT conflict with ResonantOS branch conventions (`dev`, `main`, `Contribution/*`).

## Consequences

### Positive

- Provides a structured, deterministic audit-and-plan tool without modifying ResonantOS.
- Zero runtime risk — Campaign Runner is external and optional.
- Campaign output enriches the documentation surface with structured repo analysis.
- Clear separation of concerns: ResonantOS is the runtime shell; Campaign Runner is a development planning tool.
- Gitignore entries prevent accidental commits of operational artifacts.

### Negative

- Contributors who want to use Campaign Runner must install Python 3.11+ and a provider binary (`codex` or `claude`). This is an additional developer-side dependency.
- Two separate "audit" concepts exist: Campaign Runner audits (repo structure) and ResonantOS audits (architecture compliance). Potential confusion.
- Campaign Runner's own state (`docs/_campaign_runs/state/`) is separate from and invisible to ResonantOS's runtime state. No automatic synchronization.
- Campaign Runner output may go stale if not regularly executed. Staleness is visible but not enforced.

## Evidence

- [x] Campaign Runner source inspected at https://github.com/Resonant-Jones/Campaign-Runner
- [x] Fit-gap review completed: `docs/specs/campaign-runner/FIT_GAP_REVIEW.md`
- [x] Installation plan documented: `docs/specs/campaign-runner/INSTALLATION_PLAN.md`
- [x] Zero conflict with ResonantOS source directories (writes only to `docs/`)
- [x] Campaign Runner task prompt format compatible with Unified Input Protocol (ADR-034)
- [ ] Dry-run against ResonantOS repo executed (not yet — Phase 1)
- [ ] Campaign Runner output ingested into Living Archive (not yet — Phase 2)

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Embed Campaign Runner as a Tauri subprocess. | Python process management from Rust across macOS/Windows/Linux is complex and fragile. Sidecar model is simpler and preserves the tool's existing CLI surface. |
| Reimplement Campaign Runner in TypeScript or Rust. | Campaign Runner is ~3,500 lines of Python with JSON schema validation, provider dispatch, state machine, and scope enforcement. Reimplementation would diverge and duplicate effort. |
| Ignore Campaign Runner entirely. | Misses the opportunity for structured repo analysis that feeds into Living Archive and System Architecture Memory. |
| Make Campaign Runner a mandatory part of the ResonantOS development workflow. | Violates the optional tool principle. Contributors should not need Python + codex/claude to work on the repo. |
| Add Campaign Runner as an npm dependency. | Campaign Runner is a Python package, not a Node package. npm cannot manage Python dependencies. |

## Drift Watch

What future change would make this ADR stale?

- If Campaign Runner adds a ResonantOS provider fabric adapter, the credential boundary needs revisiting.
- If Campaign Runner output is automatically ingested into the Living Archive, the `.gitignore` decision may change (committed vs gitignored).
- If ResonantOS adopts a different campaign planning tool, this ADR should be superseded.
- If Campaign Runner changes its output directory conventions, `.gitignore` entries need updating.
- If Campaign Runner's schema format changes incompatibly, integration docs need updating.

## Docs to Update If Accepted

- [x] `docs/specs/campaign-runner/FIT_GAP_REVIEW.md` — fit-gap analysis.
- [x] `docs/specs/campaign-runner/INSTALLATION_PLAN.md` — installation plan.
- [ ] `.gitignore` — add `docs/_audits/` and `docs/_campaign_runs/`.
- [ ] `docs/README.md` — add Campaign Runner reference (optional tool).
- [ ] `docs/PROJECT_STATUS.md` — note Campaign Runner as optional external tool.
- [ ] `docs/specs/campaign-runner/README.md` — integration intake (already exists, needs minor update).
