# Campaign: <CAMPAIGN_TITLE>

## Metadata

| Field | Value |
|-------|-------|
| **Campaign ID** (`campaign_id`) | `<YYYY-MM-DD::slug::seq3>` |
| **Campaign Slug** (`campaign_slug`) | `<slug>` |
| **Status** (`status`) | `planning` |
| **Passes** (`passes`) | `<N>` |
| **Operator** (`operator`) | `<name or role>` |
| **Created** (`created_at`) | `<YYYY-MM-DD HH:MM UTC>` |
| **Depends On** (`depends_on`) | `<campaign_id or none>` |

## Backend

- **Provider:** `<codex | claude | manual>`
- **Backend version:** `<version | unknown>`
- **Audit model** (`model_audit`): `<model_id | unknown>`
- **Compiler model** (`model_compiler`): `<model_id | unknown>`
- **Task model** (`model_task`): `<model_id | unknown>`
- **Configuration:** `<path to settings or inline summary>`

## Goal

<!-- One sentence describing what this campaign will accomplish. -->

<goal>

## Scope

### In Scope

<!-- What this campaign MAY modify. Use repo-relative paths. -->

- `docs/adr/`
- `docs/specs/<area>/`
- `src/modules/<module>/`
- ...

### Out of Scope

<!-- What this campaign MUST NOT touch. -->

- `src/core/contracts.ts`
- `src-tauri/src/lib.rs`
- `src-tauri/src/host_state.rs`
- `.github/workflows/`
- ...

### Forbidden Zones (always out of scope)

The following zones are forbidden for all campaigns per `docs/specs/campaign-runner/TEMPLATE_CONTRACT.md`:

- `.gitignore`, `package.json` dependencies, `Cargo.toml` dependencies
- `rust-toolchain.toml`, `vite.config.ts`, `tsconfig.json`
- `.github/workflows/`, `src-tauri/capabilities/`
- `src/sdk/addons/index.ts`, `src/core/contracts.ts`
- `src-tauri/src/host_state.rs`
- `server/`, `addons/resonant-browser-native/`

## Success Criteria

<!-- Measurable outcomes that define campaign completion. -->

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] ...

## Sub-Tasks

<!-- Each sub-task becomes a Campaign Runner task in the campaign set. -->

| Task ID | Slug | Area | Risk | Description |
|---------|------|------|------|-------------|
| `<TASK-001>` | `<task_slug>` | `<area>` | `HIGH` / `MED` / `LOW` | `<one-line description>` |
| `<TASK-002>` | `<task_slug>` | `<area>` | `HIGH` / `MED` / `LOW` | `<one-line description>` |
| ... | ... | ... | ... | ... |

## Dependencies

<!-- What must be true before this campaign can start. -->

- [ ] Dependency 1
- [ ] Dependency 2

## Constraints

<!-- Non-negotiable constraints the operator imposes on this campaign. -->

- Constraint 1
- Constraint 2

## Checkpoint Schedule

| Checkpoint | After | Deliverable |
|-----------|-------|-------------|
| Audit checkpoint | Stage A complete | Audit findings summary |
| Compile checkpoint | Stage B complete | Campaign set summary |
| Task checkpoint | Each task complete | Per CAMPAIGN_CHECKPOINT_TEMPLATE.md |
| Completion checkpoint | All tasks done | Per CAMPAIGN_HANDOFF_TEMPLATE.md |

## Operator Review Gates

<!-- Points where the operator must approve before continuing. -->

- [ ] **Gate 1:** Review audit output before compiling campaign set.
- [ ] **Gate 2:** Review campaign set before executing tasks.
- [ ] **Gate 3:** Review first task result before continuing to remaining tasks.
- [ ] **Gate 4:** Review completion handoff before promoting to durable docs.

## Notes

<!-- Free-form notes, context, or rationale. -->

<notes>
