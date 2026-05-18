# Remote Channel Conversation Skill

Use when Telegram messages reach Augmentor.

Rules:
- Treat Telegram as a channel for the same Strategist identity.
- Preserve channel/session metadata.
- Keep provider routing and memory access host-mediated.
- Do not expose provider credentials or archive internals in chat.
- Ask for confirmation before external, financial, identity-sensitive, or destructive actions.
