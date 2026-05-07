## Session Start Protocol (EVERY SESSION — NO EXCEPTIONS)

Before doing ANY work, every session must:
1. Run `git pull --ff-only` to sync latest changes from GitHub
2. Read this CLAUDE.md and any relevant docs referenced in it
3. Read the most recent transcript in `transcripts/` to understand current state
4. State what you understand the current state to be and confirm with Josh before proceeding

Do not skip this. Sessions that skip the startup protocol produce errors and harmful advice.

## Primary Directives (MANDATORY — no exceptions unless Josh approves)

1. **Tell the truth. Always.** If you don't know something, say "I don't know." DO NOT GUESS OR MAKE THINGS UP. Ever.
2. **No guessing. Ever.** Do not guess function signatures, file paths, argument names, API behavior, config values, or system state. If you don't know, READ THE SOURCE. If you can't read it, say "I don't know" and ask. Guessing wastes Josh's time and produces broken code. This applies to everything — code, infrastructure, facts, claims.
3. **Read before touching.** Read live files before proposing or making any change. Never edit from memory or inference.
4. **Backup before changing.** Always create backups before modifying files, configs, containers, or infrastructure.
5. **Test after changing.** Run end-to-end verification after every change to confirm success. Do not assume it worked.
6. **Facts require proof.** Only state facts that can be proven with data. Distinguish verified from believed. Flag uncertainty as UNVERIFIED.
7. **Scrutinize before executing.** Before executing any plan or presenting any output, review your own decision as an outside observer and code review expert. Then provide revised content/actions.
8. **Scope gate.** "Analyze X" does not mean "write a spec for X." Propose, wait for Josh's approval, then build. Never exceed the requested scope.

## Stop When Confused

If something is unclear, contradictory, or ambiguous — **stop.** Name what's confusing. Ask.

- If two sources contradict each other (e.g. CLAUDE.md vs memory), flag the discrepancy before proceeding. CLAUDE.md wins (Directive #9).
- If multiple interpretations of a request exist, present them — don't pick silently.
- If you're about to assert a fact you haven't verified this session, stop and verify it first.
- State assumptions explicitly. Push back when warranted.

## Execution Model

Every change follows this sequence — no shortcuts:

**Read → Propose → Confirm with Josh → Execute → Verify → Next step**

For multi-step tasks, transform the request into verifiable goals before starting:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Coding Discipline

### Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the request.

## Quick Reference

| Node | Tailscale IP | SSH | Role |
|------|-------------|-----|------|
| Godmode | 100.115.28.98 | `ssh godmode` (port 2222) | Agent host, a0-godmode container |
| Jarvis | 100.121.18.23 | `ssh jarvis` (port 2222) | Agent host (stripped 2026-04-10): peer-openclaw container :18789, shared-sync.sh cron (1m rsync ↔ Godmode), full desktop (xrdp :3389) |
| Frankenmeiner | 100.100.128.52 | port 2222 | State + observability: a0-postgres, a0-redis, a0-qdrant, a0-searxng, a0-social :5200, memory-query :5100, Langfuse stack (6 containers), NFS+SMB model shares → Maclovin, RAID NAS, Obsidian vault, Claude Code workstation |
| Maclovin | 100.118.125.26 | `ssh maclovin` (port 22) | Mac Studio M3 Ultra 96GB — LiteLLM :4042, LM Studio :1234, local inference |
| Legion | 100.103.148.63 | `ssh legion` (port 2222) | NixOS — Hermes-agent (flake), hermes-control-interface :10272 |

- Tailnet: `greyhound-tilapia.ts.net` (free, HTTPS enabled)
- LiteLLM: `http://100.118.125.26:4042` (Maclovin, always Tailscale IP, never localhost)
- Memory query: `http://100.100.128.52:5100` (Frankenmeiner)
- GUI: `https://godmode.greyhound-tilapia.ts.net`
- Watchdog health: `/health/liveliness` (NOT `/health` — cost leak)
- PG superuser on Jarvis: `litellm` (not `postgres`)

## Critical Rules
- **`git pull --ff-only` before any commit or push** — another session on a different machine may have pushed since session start. Pull first to detect divergence safely. If ff-only fails, stop and ask Josh.

## Session Transcript SOP

Write a condensed transcript to `transcripts/YYYY-MM-DD-<short-topic>.md` BEFORE the session ends. Do not wait to be asked. Do not skip. Do not "forget." This is not optional.

Contents:
- Front matter: title, date, commits, files_changed, summary
- What was requested, what was done, what was decided
- All commits pushed during the session
- Key findings or discussion points
- Open items or unresolved issues carried forward

### Multi-phase sessions (post-commit drift)

If a session continues after an intermediate commit and completes work that was marked "PENDING", "deferred", or "next phase of this session" in the committed docs, do not leave the vault claiming the old state. Before session end:

1. **Re-scan canonical docs you touched in the commit** for claims that are now stale. Typical culprits: status tables in `architecture.md`, rows in `open-items.md`, transcript narrative, "Open Items Carried Forward" sections.
2. **Submit a follow-up commit** updating those claims to match verified reality. Do NOT rewrite history — no `--amend`, no force-push. The superseded commit stands as an accurate timestamped moment; a new commit supersedes the claim.
3. **Transcripts**: append a `## Postscript — <what happened after commit>` section to the transcript file instead of editing the narrative in place. Include the Postscript in the follow-up commit.

Principle: every commit on `main` must be internally consistent with reality at its timestamp. Drift created by sequential work within a single session is still drift — treat it the same as multi-day drift. Applies equally to non-deployment work: if an initial commit says "investigation pending" and the investigation completes later in the session, follow up.

## Self-Review Requirement

Before presenting any output to Josh:
1. Re-read your own output for accuracy against sources
2. Check every factual claim against the source you derived it from
3. Flag uncertain claims as UNVERIFIED
4. For file changes, infrastructure, or security work — present plan for approval first
5. Never present inference as fact

Do NOT skip this step. Quality over speed, always.

## Hallucination & Synthesis Drift Prevention

<investigate_before_answering>
Never speculate about code, configs, or infrastructure you have not read in this session. If a file, service, or component is referenced, READ it before answering. Use grep/read to investigate relevant files BEFORE answering questions about the codebase or proposing changes. Never make claims about code, state, or prior decisions without tool-verified evidence.
</investigate_before_answering>

<prior_decisions_gate>
Before proposing any architecture change that spans services or introduces new integrations:
1. Grep `docs/`, `CLAUDE.md`, and `docs/known-issues.md` for each component name in the proposal
2. Include results as "Prior decisions checked: <cites>" in the proposal
3. If a prior decision CONSTRAINS the proposal, respect the constraint or explicitly flag the conflict and ask Josh before proceeding
4. An empty cite list means the search was incomplete — widen the grep before finalizing
</prior_decisions_gate>

## Opus 4.7 Compatibility

When running on Opus 4.7 (or any model that defaults to reasoning over tool use):
- **Increase tool usage explicitly.** 4.7 prefers reasoning over tool calls. For this vault, tool-based verification is mandatory — do not substitute synthesis for grepping docs.
- **Follow ALL rules at full scope.** 4.7 interprets prompts more literally and won't generalize a rule from one domain to another. Every rule in this file applies to ALL relevant scenarios unless explicitly scoped otherwise.
- **Use xhigh effort for sprint/agentic work.** The `max` effort setting can produce overthinking that feels convincing but skips verification. Reserve `max` for intelligence-demanding single-turn tasks.
- **Prior decisions checked is non-negotiable.** The `<prior_decisions_gate>` above exists specifically because 4.7's stronger synthesis lowers the felt-need to verify against settled decisions.

## Documentation Hierarchy

When docs contradict each other, verify live state before acting. The reality-audit-2026-04-18.md found global CLAUDE.md was entirely pre-migration state — wrong IPs, wrong roles, wrong endpoints.

