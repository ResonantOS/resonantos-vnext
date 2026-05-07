# Hermes Add-on Skill

## Objective

Use Hermes as a delegated communication, coordination, routine research, follow-up, and channel-workflow agent inside ResonantOS. Hermes is an add-on agent, not the Strategist. It works through the user's local Hermes profile when present, or through an explicit user-approved install/onboarding flow when missing.

## When To Use Hermes

- The user asks to delegate communication, coordination, follow-up, email/message drafting, channel workflow, or routine research to Hermes.
- The user opens a Hermes chat or asks to speak directly with Hermes.
- A task should produce a reviewable draft, summary, plan, or approval request before any external action.
- Hermes' own profile, skills, memory, or dashboard are directly relevant.

## When Not To Use Hermes

- Do not use Hermes for core ResonantOS repair, provider recovery, or codebase repair. Use the Resonant Engineer Agent.
- Do not use Hermes to write trusted Living Archive knowledge pages.
- Do not use Hermes to bypass approval gates, capability grants, or provider policy.
- Do not ask Hermes to alter its identity, skills, memory, or config without explicit user approval.
- Do not allow Hermes to send public, external, financial, or identity-sensitive messages without explicit human approval.

## Installation And Audit

1. Audit the local Hermes profile first.
2. If Hermes is missing, explain that ResonantOS can install the official Nous Research Hermes Agent after network and shell grants.
3. Install only after explicit user approval.
4. The installer skips provider credential setup. Tell the user to run `hermes setup` or configure credentials intentionally.
5. Re-run the audit after installation.
6. Treat audit findings as remediation suggestions, not permission to change Hermes automatically.

## Direct Chat Flow

1. Use the Hermes chat bridge only when the Hermes add-on is enabled and shell access is granted.
2. Pass the selected Hermes model from ResonantOS to the local Hermes CLI.
3. If archive-read is granted, include Living Archive context as read-only evidence.
4. Return only Hermes' final reply to the user-facing chat.
5. Attach archive citations in ResonantOS when archive context was used.

## Delegation Flow

1. Create a Hermes delegation workspace for non-immediate communication, routine research, or coordination work.
2. Keep the task approval-gated and reviewable.
3. Require Hermes to return a summary, actions taken, approval needs, residual risks, and verification.
4. Starting a Hermes task does not approve outbound sends.
5. Ask the human to review the result before promotion, follow-up, archive intake, or external delivery.

## Living Archive Boundary

Hermes may receive Living Archive context only as read-only evidence through ResonantOS. Hermes must not claim to write directly to the Living Archive. Any archive write is intake-only and review-gated through ResonantOS.

## Expected Outputs

- Hermes audit finding or installation result.
- Hermes direct reply.
- Hermes delegation workspace.
- Reviewable draft or coordination plan.
- Approval needs and residual risks.
