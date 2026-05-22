# Campaign Runner — Installation Plan

**Date:** 2026-05-22  
**Companion to:** `FIT_GAP_REVIEW.md`, `ADR-035-existing-campaign-runner-integration.md`

This document defines the minimal and deferred installation paths for using Campaign Runner with the ResonantOS vNext repository. No implementation has been performed — this is a planning document.

---

## Pre-Installation Checklist

Before installing Campaign Runner, verify:

- [ ] Python 3.11 or later is installed (`python3 --version`)
- [ ] `git` is on PATH and functional
- [ ] ResonantOS repo is cloned and on a clean working tree
- [ ] Decision: which provider to use (`codex` or `claude`)?
- [ ] Provider binary is installed and authenticated (`codex --version` or `claude --version`)
- [ ] (Optional) `textual` is installed if TUI mode is desired

---

## Path A: Minimal Installation (Recommended First Step)

### Goal
Install Campaign Runner as a standalone CLI tool in a Python virtual environment. Run a single dry-run audit to verify functionality. No ResonantOS files are modified except `.gitignore`.

### Step 1: Clone Campaign Runner

```bash
# Clone alongside, not inside, the ResonantOS repo
cd /path/to/projects
git clone https://github.com/Resonant-Jones/Campaign-Runner.git
cd Campaign-Runner
```

### Step 2: Create virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### Step 3: Install Campaign Runner

```bash
# Minimal install (deterministic CLI only)
python3 -m pip install -e .

# Or with TUI support
python3 -m pip install -e ".[tui]"
```

### Step 4: Verify installation

```bash
codexrun --help
# Expected: "Deterministic Campaign Runner" help text

python -m codex_runner --help
# Expected: same output
```

### Step 5: Add .gitignore entries to ResonantOS repo

```bash
cd /path/to/resonantos-vnext
```

Add to `.gitignore`:
```
# Campaign Runner operational artifacts
docs/_audits/
docs/_campaign_runs/
```

**Rationale:** `docs/_audits/` and `docs/_campaign_runs/` are operational artifacts (prompts, outputs, state machine). They are not documentation intended for human readers. `docs/Campaign/` and `docs/tasks/` ARE documentation artifacts and should be committed.

### Step 6: Run dry-run audit against ResonantOS

```bash
cd /path/to/resonantos-vnext

# Locate Campaign Runner's prompt and schema files
RUNNER_PROMPTS=/path/to/Campaign-Runner/src/codex_runner/prompts
RUNNER_SCHEMAS=/path/to/Campaign-Runner/src/codex_runner/schemas

codexrun --dry-run \
  --repo-root . \
  --provider codex \
  --audit-prompt-file "$RUNNER_PROMPTS/mega_audit.md" \
  --audit-schema-file "$RUNNER_SCHEMAS/mega_audit_output.schema.json" \
  --compiler-prompt-file "$RUNNER_PROMPTS/audit_report_to_campaign_runner.md" \
  --campaign-set-schema-file "$RUNNER_SCHEMAS/campaign_set.schema.json" \
  --task-result-schema-file "$RUNNER_SCHEMAS/task_result.schema.json"
```

### Step 7: Inspect output

```bash
# Check what was generated
ls docs/_audits/
ls docs/_campaign_runs/state/
cat docs/_campaign_runs/state/state.json | python3 -m json.tool | head -50

# Verify clean git
git status --short
# Expected: only docs/_audits/ and docs/_campaign_runs/ are new
# (these are gitignored after step 5, so they should NOT appear)
```

### Step 8: Validation

- [ ] `codexrun --help` produces help text
- [ ] Dry-run completes without errors
- [ ] `docs/_audits/` directory is created with audit output
- [ ] `docs/_campaign_runs/state/state.json` exists and is valid JSON
- [ ] `git status --short` is clean (operational dirs are gitignored)
- [ ] No ResonanceOS source files were modified
- [ ] `npm test -- --run` still passes

---

## Path B: TUI-Assisted Installation

### Goal
Use the interactive TUI to configure and run Campaign Runner with a friendlier interface.

### Prerequisites (in addition to Path A)

```bash
source /path/to/Campaign-Runner/.venv/bin/activate
python3 -m pip install -e ".[tui]"
```

### Launch TUI

```bash
cd /path/to/resonantos-vnext
codexrun --tui
```

The TUI provides:
- Configuration panel (provider, models, passes, execute mode)
- Preset management (save/load named configurations)
- Dry-run and execute modes with visual progress
- Audit output inspection

### Validation

- [ ] TUI launches without import errors
- [ ] Settings can be configured and saved
- [ ] Dry-run can be initiated from TUI
- [ ] Presets can be saved and loaded

---

## Path C: Wrapper Script (Deferred — after Path A validated)

### Goal
Create a convenience wrapper that encodes ResonantOS-specific defaults, so contributors don't need to remember long CLI flags.

### Create `scripts/campaign-runner.sh`

```bash
#!/usr/bin/env bash
# Campaign Runner wrapper for ResonantOS vNext
# Usage: ./scripts/campaign-runner.sh [--execute] [--passes N] [extra args...]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER_DIR="${CAMPAIGN_RUNNER_DIR:-/path/to/Campaign-Runner}"
RUNNER_PROMPTS="$RUNNER_DIR/src/codex_runner/prompts"
RUNNER_SCHEMAS="$RUNNER_DIR/src/codex_runner/schemas"

VENV_PYTHON="$RUNNER_DIR/.venv/bin/python"

if [ ! -f "$VENV_PYTHON" ]; then
  echo "Error: Campaign Runner venv not found at $VENV_PYTHON"
  echo "Set CAMPAIGN_RUNNER_DIR to the Campaign Runner checkout."
  exit 1
fi

MODE="--dry-run"
PASSES="--passes 1"
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute) MODE="--execute"; shift ;;
    --passes) PASSES="--passes $2"; shift 2 ;;
    *) EXTRA_ARGS+=("$1"); shift ;;
  esac
done

exec "$VENV_PYTHON" -m codex_runner \
  --repo-root "$REPO_ROOT" \
  --provider "${CAMPAIGN_PROVIDER:-codex}" \
  --audit-prompt-file "$RUNNER_PROMPTS/mega_audit.md" \
  --audit-schema-file "$RUNNER_SCHEMAS/mega_audit_output.schema.json" \
  --compiler-prompt-file "$RUNNER_PROMPTS/audit_report_to_campaign_runner.md" \
  --campaign-set-schema-file "$RUNNER_SCHEMAS/campaign_set.schema.json" \
  --task-result-schema-file "$RUNNER_SCHEMAS/task_result.schema.json" \
  $PASSES \
  $MODE \
  "${EXTRA_ARGS[@]}"
```

### Make executable

```bash
chmod +x scripts/campaign-runner.sh
```

### Usage

```bash
# Dry-run audit
./scripts/campaign-runner.sh

# Execute mode with 3 passes
./scripts/campaign-runner.sh --execute --passes 3

# With custom model
./scripts/campaign-runner.sh --codex-model-audit gpt-5.1-codex
```

---

## Path D: npm Scripts (Deferred — after Path C validated)

### Goal
Add convenient npm scripts to `package.json` for one-command Campaign Runner invocation.

### Add to `package.json` scripts

```json
{
  "scripts": {
    "campaign:dry-run": "bash scripts/campaign-runner.sh --dry-run",
    "campaign:audit": "bash scripts/campaign-runner.sh --dry-run --passes 1",
    "campaign:execute": "bash scripts/campaign-runner.sh --execute",
    "campaign:tui": "codexrun --tui"
  }
}
```

### Usage

```bash
npm run campaign:dry-run
npm run campaign:execute
```

---

## What Installation Does NOT Do

- Does NOT add Python or Campaign Runner as a ResonantOS dependency.
- Does NOT modify `package.json` dependencies or devDependencies.
- Does NOT modify `Cargo.toml`.
- Does NOT add Campaign Runner to CI/CD pipelines.
- Does NOT register Campaign Runner as a ResonantOS addon.
- Does NOT create Tauri IPC commands for Campaign Runner.
- Does NOT modify any source code under `src/` or `src-tauri/`.
- Does NOT require all contributors to install Campaign Runner.

---

## Rollback Plan

If Campaign Runner integration proves problematic:

### Minimal rollback (Path A)
1. Remove `.gitignore` entries for `docs/_audits/` and `docs/_campaign_runs/`.
2. Delete `docs/_audits/` and `docs/_campaign_runs/` directories from the repo.
3. Delete the Campaign Runner clone and venv.
4. Git history is unaffected — Campaign Runner branches are separate from `dev`/`main`.

### Wrapper script rollback (Path C)
1. Delete `scripts/campaign-runner.sh`.
2. Same as minimal rollback.

### npm script rollback (Path D)
1. Remove `campaign:*` scripts from `package.json`.
2. Same as wrapper script rollback.

### Full rollback (all paths)
1. Remove all `.gitignore` entries.
2. Remove any wrapper scripts.
3. Remove any npm scripts.
4. Delete `docs/_audits/`, `docs/_campaign_runs/`, `docs/Campaign/`, `docs/tasks/` campaign output.
5. Delete campaign branches: `git branch -D campaign/*`.
6. Delete Campaign Runner clone and venv.
7. ResonantOS returns to pre-integration state with zero residual artifacts.

---

## Validation Plan (Post-Installation)

After any installation path, verify:

- [ ] `git diff --check` passes
- [ ] `npm test -- --run` passes (all 168+ tests)
- [ ] `npm run build` passes
- [ ] `cargo fmt --check` passes (from `src-tauri/`)
- [ ] No ResonanceOS source files modified (`git diff --name-only` shows only expected changes)
- [ ] Campaign Runner operational directories are gitignored (if Path A+)
- [ ] `git status --short` is clean outside of planned integration files
- [ ] No Promptnomicon artifacts introduced

---

## Decision Thresholds

| Condition | Action |
|-----------|--------|
| Dry-run succeeds on first attempt | Proceed to Path B (TUI) or Path C (wrapper) |
| Dry-run fails with provider error | Debug provider binary (`codex --version`, auth). Campaign Runner itself is not the issue. |
| Dry-run fails with Python error | Verify Python 3.11+, reinstall venv. |
| Execute mode produces unexpected file changes | Immediately roll back. Review task scope declarations. |
| Campaign Runner commits pollute `dev`/`main` | Campaign Runner should only commit to campaign branches. If it commits to `dev`, verify `--base-ref` setting. |
| Contributors object to Python dependency | Keep Path A as optional. Do not add npm scripts or wrappers. Document as "optional tool for maintainers." |

---

*No installation steps have been executed. This plan is for review before any tooling is added to the ResonantOS repo.*
