# Campaign Templates

This directory contains copyable markdown templates for campaigns executed against the ResonantOS vNext repository. These templates implement the contract defined in `docs/specs/campaign-runner/TEMPLATE_CONTRACT.md`.

## Templates

| Template | Use |
|----------|-----|
| `CAMPAIGN_TEMPLATE.md` | Create a new campaign definition. |
| `CAMPAIGN_HANDOFF_TEMPLATE.md` | Write a campaign completion handoff packet. |
| `CAMPAIGN_CHECKPOINT_TEMPLATE.md` | Write a per-task checkpoint summary. |

## Usage

1. Copy the relevant template to `docs/Campaign/<campaign_slug>.md` or your working directory.
2. Fill in all fields marked with `<>` placeholders.
3. Remove sections that are not applicable (do not leave empty placeholders).
4. After campaign completion, promote durable artifacts into `docs/adr/`, `docs/specs/`, `docs/audits/`, `docs/architecture/`, or `docs/agent-workflows/`.

## Policy

- These templates are **durable documentation** and are committed to the repository.
- Campaign output files created FROM these templates are **transient** and gitignored (see `.gitignore`).
- Campaign output must be promoted into authoritative docs before it is committed.
- Templates may be updated as the Campaign Runner integration evolves. Changes should be proposed via ADR.
