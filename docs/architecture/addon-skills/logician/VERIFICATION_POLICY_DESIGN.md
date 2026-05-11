# Verification Policy Design Skill

Use when a workflow needs deterministic verification.

Rules:
- Identify what must be checked deterministically instead of left to an LLM.
- Define pass/fail criteria, required evidence, and failure policy.
- Prefer scripts/hooks for schema, tests, lint, capability, and artifact checks.
- Escalate high-impact uncertainty to the human or Engineer.
- Return a verification report suitable for task completion review.
