# Docs Refactor Guardrails — Agent Workflows

Last updated: 2026-05-22

This document defines safety guardrails for AI agents and human contributors performing documentation reorganization, refactoring, or consolidation in this repository. It supplements the general agent workflow rules in `docs/agent-workflows/README.md`.

---

## Core Principles

### Preserve Information
Every document move, rename, or restructure must preserve the original content. No information may be deleted during reorganization. If a document appears redundant, do not remove it — move it to `docs/legacy/` with a README explaining why.

### Avoid Destructive Edits
Do not rewrite document content during reorganization passes. Structural changes (moves, renames, directory creation) are safe. Content changes (rewriting paragraphs, removing sections, changing technical claims) require separate justification and should not be bundled with structural moves.

### Move Before Merge
When two documents overlap, move them into the same directory first. Consolidation is a separate, more careful operation that requires:
- Verifying both documents against the current codebase.
- Identifying which claims are current and which are historical.
- Preserving superseded content in a clearly marked legacy form.
- Updating all cross-references.

### Classify Before Consolidating
Before merging overlapping documents, classify each one:
- **Authoritative** (current source of truth)
- **Overlapping** (covers similar ground to authoritative)
- **Historical** (describes past state)
- **Draft** (incomplete or in-progress)
- **Unknown** (classification unclear)

Only merge authoritative and overlapping documents after verification.

### Verify Before Declaring Authoritative
A document should not be declared authoritative without:
- Runtime evidence (observed behavior matching documented claims).
- Test evidence (tests that validate documented contracts).
- Or explicit acknowledgment that it describes intent, not current state.

### Distinguish Inferred vs Verified
Every document should clearly mark:
- **Verified** — observed in code, tests, or runtime.
- **Inferred** — deduced from structure but not directly confirmed.
- **Unclear** — genuine uncertainty requiring investigation.

Never upgrade "inferred" to "verified" without new evidence.

### Avoid Speculative Architecture Claims
Do not add architecture documentation that:
- Describes a feature that does not exist in code yet.
- Assumes a future refactor will land without evidence.
- Extrapolates from a partial implementation to a full system.
- Claims a boundary exists when code shows otherwise.

If describing planned architecture, use explicit markers: "Planned," "Under construction," or "Not yet implemented."

---

## Specific Guardrails for Docs Reorganization

### Moving Files
- Always use `git mv` to preserve history.
- Update all cross-references in active docs (not legacy docs).
- Add README.md in any new directory explaining its purpose.
- Never leave empty directories behind (clean them up after moves).

### Creating Legacy Zones
- Every legacy directory must have a README.md explaining why documents were archived.
- Frame legacy documents as "historical/contextual material" — never as "obsolete" or "irrelevant."
- Do not modify legacy document content during migration. Preserve the original text as-is.
- Legacy documents may contain outdated paths or references — that's intentional; they capture a moment in time.

### Updating Cross-References
- When moving a document, search for all references to its old path.
- Update references in active docs (ADRs, architecture docs, READMEs, backlog, status).
- Do NOT update references in legacy docs — those capture historical state.
- Do NOT modify application source code references unless the task explicitly authorizes it.

### Handling Ambiguous Documents
If a document's classification is unclear:
1. Mark it with "Needs verification" header.
2. Place it in the directory that best fits its apparent purpose.
3. Add it to the ambiguous documents list in the commit message or report.
4. Do not fabricate a classification to resolve ambiguity.

### Validation Checks
After any docs reorganization:
- [ ] `git diff --check` passes.
- [ ] No orphaned cross-references in active docs.
- [ ] No empty directories left behind.
- [ ] All new directories have README.md.
- [ ] No Promptnomicon artifacts remain.
- [ ] No documents deleted — only moved to legacy or preserved in-place.

---

## Relationship to General Agent Workflows

These guardrails extend the general rules in `docs/agent-workflows/README.md`. The general rules apply to all agent work. These guardrails add documentation-specific constraints for reorganization passes.

When in doubt, favor preservation over cleanup. A messy but complete documentation archive is better than a tidy but incomplete one.
