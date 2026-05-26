# Resonant Browser Host

Intent citation: `docs/architecture/ADR-017-resonant-browser-addon.md`

This package is the Browser add-on's controlled Chromium service foundation. It is intentionally separate from the React shell so Browser control can be installed, disabled, replaced, and tested as an add-on boundary.

V0 capabilities:

- start a Chromium session
- open `http` / `https` URLs only
- read title, URL, page text, and links
- click by selector or coordinates
- type by selector
- capture screenshot evidence
- return append-only audit events
- expose the same contract over newline-delimited JSON-RPC style stdio messages

Current limitation:

The visible Browser workspace and this host do not yet share one live session. The visible workspace gives the human an immediate browser surface; this host gives Augmentor and future delegated agents a deterministic Chromium control contract. The next architecture step is to embed or launch this controlled Chromium session as the visible Browser add-on surface.
