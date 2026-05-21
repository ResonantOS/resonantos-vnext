# Agent Workflows

## Purpose

This directory captures repo-local conventions for AI-assisted development. It defines the operating scaffold that coding agents and human contributors follow when working in this repository — how tasks are framed, what evidence is required, and what guardrails prevent drift.

These conventions are specific to this codebase. They describe the workflow discipline expected of both human and AI contributors.

## Core Rules

### One Focused Task Per Change

Every change must address a single, bounded goal. A task that touches the chat engine, the add-on SDK, and the provider fabric in one diff is too large. Split it. Each commit should tell one coherent story.

### Inspect Current Files Before Editing

Before modifying any file, read it first. Do not assume the contents of a file based on its name or a prior session. The repo is the source of truth — not memory, not an LLM's training data, not convention.

### No Runtime Claims Without Evidence

A claim that "the endpoint returns 200" requires a captured response. A claim that "the add-on loads correctly" requires a log or screenshot. A claim that "the build passes" requires the build output. No evidence, no claim.

Evidence layers, in order of strength:
1. **Runtime proof** — observed working behavior in a real environment.
2. **Test evidence** — automated checks passing with captured output.
3. **Implementation evidence** — a diff showing the code change.

A plan is not evidence. An intention is not evidence. "The agent said it works" is not evidence.

### No Committed Temporary Scaffolding

Temporary files, scaffolding scripts, downloaded source material, and extraction folders must not be committed. If a file was needed only to generate something else, it belongs in `.agent-local/` (which is excluded from version control via `.git/info/exclude`).

### No Hidden Architecture Changes

Any change that modifies:
- The add-on SDK surface
- A capability boundary
- The IPC contract between frontend and Rust host
- Provider routing or model selection
- Memory domain separation

must be accompanied by an updated ADR, an updated architecture doc, or an explicit note in the commit message explaining the change. Silent architecture drift is the fastest path to an illegible codebase.

### Validation Results Must Be Reported

Every task must conclude with a validation report:

- What commands were run (`npm test -- --run`, `npm run build`, `cargo test`, etc.).
- What output was observed (pasted, not summarized).
- Whether the output indicates success, failure, or uncertainty.
- What was not tested and why.

If the repo defines no docs lint command, state: "No automated tests apply; docs-only scaffold."

## Task Lifecycle

```
Prompt → Inspect → Plan → Execute → Validate → Report
```

1. **Prompt** — The task is defined with a clear goal, scope (allowed/forbidden), and acceptance criteria.
2. **Inspect** — Read all relevant files before planning. Understand the current state.
3. **Plan** — Produce a plan that fits the scope. If the plan expands beyond the scope, stop and report.
4. **Execute** — Make the smallest coherent change. Prefer precise edits over rewrites.
5. **Validate** — Run verification commands and capture output.
6. **Report** — Provide a summary of what was done, what was observed, and what remains uncertain.

## Working with ADRs

- Read existing ADRs before making a structural decision.
- Write a new ADR when a decision affects runtime semantics, add-on contracts, capability boundaries, provider behavior, persistence, or release posture.
- Never silently edit an existing ADR. Supersede it with a new one.
- See `docs/adr/README.md` for the ADR template and lifecycle.

## Working with the Repo Index

- Consult `docs/REPO_INDEX.md` when navigating unfamiliar parts of the codebase.
- Update the index when new top-level directories are added or responsibilities change.

## Safety Checks

Before completing any task, verify:

- [ ] No secrets or credentials in the diff.
- [ ] No files modified outside the approved scope.
- [ ] No hallucinated APIs, files, or components.
- [ ] Temporary scaffolding removed (check `git status --short`).

---

*These conventions are living rules. If a pattern consistently causes friction, update this file. The goal is a codebase that remains legible to both humans and agents over time.*
