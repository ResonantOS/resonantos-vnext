# Campaign Runner — Validation Plan

**Status:** Active  
**Applies to:** Every Campaign Runner invocation against the ResonantOS vNext repository.  
**References:** TEMPLATE_CONTRACT.md, CAMPAIGN_RUNNER_USAGE.md, INSTALLATION_PLAN.md

---

## Purpose

This document defines smoke tests that must pass before any campaign output is promoted into authoritative ResonantOS documentation. Tests are designed to be run by a human operator after Campaign Runner installation and before executing a real campaign.

These tests validate that Campaign Runner is correctly installed, its output lands in the expected directories, it respects clean-tree invariants, and it does not modify ResonantOS source code.

---

## Prerequisites

- Campaign Runner installed per `docs/specs/campaign-runner/INSTALLATION_PLAN.md` Path A.
- ResonantOS repo on a clean working tree (`git status --short` is empty).
- `.gitignore` includes Campaign Runner entries (added by ADR-035).
- Provider binary on PATH (`codex` or `claude`).

---

## Test 1: Backend Detection Test

**Goal:** Verify that Campaign Runner can detect and report which provider backend is active.

### Steps

```bash
# Check which provider is available
which codex || echo "codex not found"
which claude || echo "claude not found"

# Verify Campaign Runner can resolve the provider
codexrun --help | grep -i "provider"
```

### Expected Result

- At least one provider binary is on PATH.
- `codexrun --help` shows `--provider {codex,claude}` in its help text.
- If neither binary is available, Campaign Runner is installed but cannot execute tasks. This is a valid state — dry-run mode still works for audit and compile stages.

### Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `codexrun: command not found` | Campaign Runner venv not activated | `source ../Campaign-Runner/.venv/bin/activate` |
| `codexrun --help` works but `codex` not found | Provider not installed | Install codex or claude separately |
| Both providers missing | No AI backend available | Campaign Runner can still dry-run; execute mode unavailable |

---

## Test 2: Help / Config Visibility Test

**Goal:** Verify that Campaign Runner's configuration surface is visible and inspectable.

### Steps

```bash
# Full help output
codexrun --help

# Verify required flags are documented
codexrun --help | grep -E "audit-prompt-file|repo-root|provider|dry-run|execute"

# Check version (if available)
python3 -c "import codex_runner; print(getattr(codex_runner, '__version__', 'no version module'))"
```

### Expected Result

- Help output lists all required flags: `--repo-root`, `--audit-prompt-file`, `--audit-schema-file`, `--compiler-prompt-file`, `--campaign-set-schema-file`, `--task-result-schema-file`.
- Help output lists operational modes: `--dry-run`, `--execute`, `--tui`.
- Help output lists provider options: `--provider {codex,claude}`.
- Help output lists model options: `--codex-model`, `--claude-model`, etc.

### Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Missing required flags | Old version of Campaign Runner | Pull latest from https://github.com/Resonant-Jones/Campaign-Runner |
| Import error | venv not set up correctly | Recreate venv, reinstall |

---

## Test 3: Docs-Only Dry Run

**Goal:** Verify that a dry-run audit writes output only to `docs/_audits/` and `docs/_campaign_runs/`, and that no ResonantOS source files are modified.

### Steps

```bash
cd /path/to/resonantos-vnext

# Capture pre-run state
BEFORE_HASH=$(git rev-parse HEAD)
BEFORE_STATUS=$(git status --short)

RUNNER_PROMPTS=../Campaign-Runner/src/codex_runner/prompts
RUNNER_SCHEMAS=../Campaign-Runner/src/codex_runner/schemas

# Run dry-run
codexrun --dry-run \
  --repo-root . \
  --provider codex \
  --audit-prompt-file "$RUNNER_PROMPTS/mega_audit.md" \
  --audit-schema-file "$RUNNER_SCHEMAS/mega_audit_output.schema.json" \
  --compiler-prompt-file "$RUNNER_PROMPTS/audit_report_to_campaign_runner.md" \
  --campaign-set-schema-file "$RUNNER_SCHEMAS/campaign_set.schema.json" \
  --task-result-schema-file "$RUNNER_SCHEMAS/task_result.schema.json"

# Capture post-run state
AFTER_HASH=$(git rev-parse HEAD)
AFTER_STATUS=$(git status --short)
```

### Expected Result

- Dry-run completes without errors.
- `$BEFORE_HASH` equals `$AFTER_HASH` (no commits were made).
- `$BEFORE_STATUS` equals `$AFTER_STATUS` (no files changed outside gitignored directories).
- `docs/_audits/` directory exists with audit output.
- `docs/_campaign_runs/state/state.json` exists and is valid JSON.
- `git status --short` shows nothing (operational dirs are gitignored).

### Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `RunnerError: git tree is not clean` | Uncommitted changes in repo | Commit or stash changes before running |
| `RunnerError: Missing required JSON file` | Wrong paths to prompts/schemas | Verify `$RUNNER_PROMPTS` and `$RUNNER_SCHEMAS` |
| Provider execution error | codex/claude auth or network issue | Debug provider separately: `codex --help` |
| `docs/_audits/` not created | Dry-run failed before audit stage | Check Campaign Runner stderr for errors |

---

## Test 4: Dirty Tree Refusal Test

**Goal:** Verify that Campaign Runner refuses to run when the git working tree is dirty.

### Steps

```bash
cd /path/to/resonantos-vnext

# Create a dirty working tree
echo "test" > /tmp/dirty_test_file
cp /tmp/dirty_test_file ./dirty_test_marker

# Attempt to run (should fail)
codexrun --dry-run \
  --repo-root . \
  --provider codex \
  --audit-prompt-file "$RUNNER_PROMPTS/mega_audit.md" \
  --audit-schema-file "$RUNNER_SCHEMAS/mega_audit_output.schema.json" \
  --compiler-prompt-file "$RUNNER_PROMPTS/audit_report_to_campaign_runner.md" \
  --campaign-set-schema-file "$RUNNER_SCHEMAS/campaign_set.schema.json" \
  --task-result-schema-file "$RUNNER_SCHEMAS/task_result.schema.json" 2>&1

EXIT_CODE=$?

# Clean up
rm ./dirty_test_marker

# Check result
echo "Exit code: $EXIT_CODE"
```

### Expected Result

- Campaign Runner exits with a non-zero exit code.
- Error message includes "git tree is not clean" or similar.
- No audit output directories are created.

### Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Campaign Runner proceeds despite dirty tree | Campaign Runner version does not enforce clean-tree invariant | Update Campaign Runner; this is a security regression |
| False positive: clean tree incorrectly detected as dirty | `.DS_Store` or other gitignored-but-tracked files | Remove tracked files that should be gitignored |

---

## Test 5: Ignored Output Path Test

**Goal:** Verify that Campaign Runner output directories are correctly gitignored and do not appear in `git status`.

### Steps

```bash
cd /path/to/resonantos-vnext

# After a successful dry-run (Test 3), check git status
git status --short

# Verify gitignore is working
git check-ignore docs/_audits/ docs/_campaign_runs/ docs/Campaign/ docs/tasks/
```

### Expected Result

- `git status --short` is empty (operational dirs are gitignored).
- `git check-ignore` confirms each directory is matched by `.gitignore`.
- `docs/_audits/`, `docs/_campaign_runs/`, `docs/Campaign/`, `docs/tasks/` are all gitignored.

### Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Directories appear in `git status` | `.gitignore` entries missing or incorrect | Verify `.gitignore` has the four Campaign Runner entries |
| Only some directories gitignored | Entries added after directories were created | Run `git rm -r --cached docs/_audits/` etc. to untrack |

---

## Test 6: Handoff Packet Generation Test

**Goal:** Verify that after a campaign completes (or a dry-run produces a campaign plan), a handoff packet can be produced using the template.

### Steps

```bash
cd /path/to/resonantos-vnext

# After dry-run, inspect the campaign set
cat docs/_campaign_runs/state/state.json | python3 -m json.tool | head -80

# Manually produce a handoff packet using the template
cp docs/templates/campaigns/CAMPAIGN_HANDOFF_TEMPLATE.md /tmp/test_handoff.md

# Fill in the template with data from the campaign state
# (This is a manual step in testing — automation comes later)

# Verify the handoff contains required sections
grep -c "## Campaign Identity" /tmp/test_handoff.md
grep -c "## Backend" /tmp/test_handoff.md
grep -c "## Completion Status" /tmp/test_handoff.md
grep -c "## Task Results Summary" /tmp/test_handoff.md
grep -c "## Decisions Ledger" /tmp/test_handoff.md
grep -c "## Open Items" /tmp/test_handoff.md
grep -c "## Artifact Inventory" /tmp/test_handoff.md
grep -c "## Context for Next Campaign" /tmp/test_handoff.md
grep -c "## Verification Evidence" /tmp/test_handoff.md
grep -c "## Archive Intake Candidates" /tmp/test_handoff.md
```

### Expected Result

- Campaign state JSON is readable and contains campaign and task data.
- Handoff template exists at `docs/templates/campaigns/CAMPAIGN_HANDOFF_TEMPLATE.md`.
- Handoff template contains all 10 required sections (each grep returns at least 1).

### Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| State JSON is empty or missing | Dry-run did not produce campaign data | Re-run dry-run, check for errors |
| Handoff template missing sections | Template was not created | Create from `docs/templates/campaigns/CAMPAIGN_HANDOFF_TEMPLATE.md` |
| State JSON unreadable | Campaign Runner wrote malformed JSON | Report bug to Campaign Runner maintainers |

---

## Test 7: No Source Modification Test

**Goal:** Verify that Campaign Runner execution (dry-run or execute) does not modify any ResonantOS source files outside `docs/`.

### Steps

```bash
cd /path/to/resonantos-vnext

# Capture file checksums of all source directories before run
find src/ src-tauri/ server/ addons/ crates/ public/ examples/ tests/ scripts/ -type f \
  -not -path "*/node_modules/*" \
  -not -path "*/target/*" \
  -not -path "*/vendor/*" \
  -not -path "*/build/*" \
  -exec md5 -q {} \; | sort > /tmp/before_hashes.txt

# Run dry-run (or execute)
codexrun --dry-run ... # abbreviated

# Capture checksums after run
find src/ src-tauri/ server/ addons/ crates/ public/ examples/ tests/ scripts/ -type f \
  -not -path "*/node_modules/*" \
  -not -path "*/target/*" \
  -not -path "*/vendor/*" \
  -not -path "*/build/*" \
  -exec md5 -q {} \; | sort > /tmp/after_hashes.txt

# Compare
diff /tmp/before_hashes.txt /tmp/after_hashes.txt
```

### Expected Result

- `diff` produces no output (all source files unchanged).
- Only `docs/` subdirectories may have new files (audit output).

### Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Source files changed | Campaign Runner task modified files outside declared scope | This is a Campaign Runner bug. Stop. Do not commit. Roll back. |
| Checksum mismatch in build artifacts | `cargo build` or `npm install` ran as a side effect | Isolate: Campaign Runner should not invoke build commands unless declared in task tests |

---

## Test 8: Provider/Backend No-Silent-Switch Test

**Goal:** Verify that the campaign records which provider was used, and that any provider switch is documented.

### Steps

```bash
cd /path/to/resonantos-vnext

# After a campaign run, inspect the campaign markdown
CAMPAIGN_FILE=$(ls docs/Campaign/CAMPAIGN_*.md 2>/dev/null | head -1)

if [ -n "$CAMPAIGN_FILE" ]; then
  echo "Campaign file: $CAMPAIGN_FILE"
  echo ""
  echo "=== Backend declaration ==="
  grep -A 5 "## Backend" "$CAMPAIGN_FILE" || echo "MISSING: No backend declaration found"
else
  echo "No campaign file found (dry-run may not produce Campaign/ output)"
fi

# Check run metadata
RUN_META=$(ls docs/_campaign_runs/*/*/run_meta.json 2>/dev/null | head -1)

if [ -n "$RUN_META" ]; then
  echo ""
  echo "=== Run metadata provider ==="
  python3 -c "
import json
with open('$RUN_META') as f:
    data = json.load(f)
print(f\"Provider: {data.get('provider', {}).get('name', 'UNKNOWN')}\")
print(f\"Models: {data.get('provider', {}).get('models', {})}\")
"
fi
```

### Expected Result

- Campaign markdown contains a `## Backend` section with provider and model information.
- Run metadata JSON contains `provider.name` and `provider.models`.
- If multiple providers were used, the campaign markdown documents the switch.

### Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No backend declaration in campaign file | Campaign Runner template did not include it | Add backend declaration to the campaign markdown template |
| Provider metadata missing from run_meta.json | Campaign Runner version does not write provider metadata | Update Campaign Runner |
| Backend declared but no model info | Models were not specified via CLI flags | Re-run with `--codex-model` or `--claude-model` flags, or accept "unknown" |

---

## Validation Checklist (All Tests)

Before promoting any campaign output into authoritative docs, verify:

- [ ] Test 1: Backend detection — at least one provider binary on PATH.
- [ ] Test 2: Help/config visibility — all required flags documented.
- [ ] Test 3: Docs-only dry run — output in gitignored directories, no source changes.
- [ ] Test 4: Dirty tree refusal — Campaign Runner rejects dirty working tree.
- [ ] Test 5: Ignored output path — gitignored directories do not appear in `git status`.
- [ ] Test 6: Handoff packet generation — template exists with all required sections.
- [ ] Test 7: No source modification — zero source files changed outside `docs/`.
- [ ] Test 8: Provider no-silent-switch — backend declaration present and complete.

### Post-Validation

After all smoke tests pass:

- [ ] `git diff --check` passes.
- [ ] `git status --short` is clean.
- [ ] `npm test -- --run` passes (all 168+ tests).
- [ ] `npm run build` passes.
- [ ] No Promptnomicon artifacts introduced.
- [ ] Campaign output has been reviewed by the operator.
- [ ] Promoted docs (ADRs, specs, audits) follow their respective templates.
- [ ] Transient campaign files remain gitignored and uncommitted.

---

## Reference

- `docs/specs/campaign-runner/TEMPLATE_CONTRACT.md` — Template contract.
- `docs/specs/campaign-runner/INSTALLATION_PLAN.md` — Installation plan.
- `docs/agent-workflows/CAMPAIGN_RUNNER_USAGE.md` — Usage conventions.
- `docs/templates/campaigns/` — Copyable campaign templates.
