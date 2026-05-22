# Documentation Templates

This directory contains reusable documentation templates. Templates are not runtime documentation — they are scaffolds for creating new documents following established patterns.

## Contents

- `addons/` — Addon-related templates.
  - `ADDON_AGENT_CONTRACT_TEMPLATE.md` — contract template for agent addons.
  - `ADDON_AUGMENTOR_SKILL_TEMPLATE.md` — Augmentor skill definition template.
- `agents/` — Agent skill and behavior templates (organized by addon).
  - `augmentor-chat/`, `hermes/`, `living-archive/`, `logician/`, `obsidian/`, `opencode/`, `paperclip/`, `audio2tol/`, `openclaw/`, `r-awareness/`, `recursive-mas/`, `shield/`, `telegram/`, `terminal/` — skill templates per addon.
  - `engineer/` — Engineer agent skill templates.
- `runbooks/` — Engineer setup runbook templates.
  - `ADDON_ENGINEER_SETUP_RUNBOOK_TEMPLATE.md` — generic runbook template.
  - `paperclip/`, `recursive-mas/` — addon-specific runbook templates.
- `audits/` — Audit document templates (currently empty).

## Usage

- When creating a new document that follows an established pattern, start from the appropriate template.
- When a pattern emerges across multiple documents, extract it into a template here.
- Templates should be lightweight and easy to adapt.
