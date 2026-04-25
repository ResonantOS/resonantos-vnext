# UX-001: ResonantOS App Shell Experience

Status: Draft  
Date: 2026-04-25  
Track: UI/UX

## Purpose

This document defines the product direction for the ResonantOS vNext interface. It is the UI/UX source of truth for the app-shell redesign workstream.

The current interface exposes too much system configuration at once. The target experience is not a dashboard full of settings. It is a desktop-first AI operating shell where the user launches add-ons, works inside embedded tools, and keeps the trusted Strategist available as a persistent companion.

## Core Experience

ResonantOS opens into a desktop-style shell:

- Top system bar: thin OS-level bar with ResonantOS identity, active surface, system health, help, emergency recovery, notifications, and time/date.
- Left dock: thin macOS-style app/add-on launcher rail with icon-only touch targets.
- Center workspace: the active work surface, visually closer to an iPad home/workspace than a settings dashboard.
- Right rail: persistent AI chat rail, collapsible and user-resizable.

Shell behavior:

- The left dock is icon-only by default, not an expanded page-navigation sidebar.
- Left dock labels appear on hover/focus through tooltips.
- The right rail can collapse to a slim chat handle.
- The right rail width is user-resizable and must be remembered.
- The center workspace must expand when the chat rail is collapsed.
- The center workspace must remain readable when both rails are open.

## Center Workspace Model

The center workspace is the primary working area.

Default state:

- Show available apps/add-ons as launchable tiles.
- Prioritize user-facing tools over configuration panels.
- Make the first screen feel like a workbench, not a settings page.

When an app/add-on launches:

- The add-on opens in the center workspace.
- The left and right rails remain available unless the user hides them.
- The active app owns the center canvas until the user switches app, closes it, or enters full-screen mode.

Examples:

- OpenClaw in TUI mode opens as an embedded terminal workspace.
- Hermes in TUI mode opens as an embedded terminal workspace.
- Obsidian opens as an embedded pane or app surface.
- OpenCode opens as an embedded app surface.
- Browser opens as an embedded browser surface.
- Future add-ons follow the same launch/open/close/full-screen contract.

## Full-Screen Mode

Any active app or AI workspace can enter full-screen mode.

Rules:

- Full-screen mode covers the ResonantOS side rails and top-level chrome.
- The user can exit back to the normal three-column shell.
- Full-screen is for deep work, not a separate app lifecycle.
- Full-screen state belongs to shell UI state and should be restorable.

## Navigation Philosophy

The previous layout made many pages feel like settings pages. The new navigation must separate work from configuration.

Primary dock items should expose:

- Home / Apps
- Living Archive
- Add-ons
- Agent identity / agent management
- Settings

Settings should become a dedicated area:

- Provider configuration
- Model strategy
- Credentials
- Add-on permissions
- Workspace preferences
- Advanced diagnostics

Settings content should not dominate the home or app workspace experience.

## Add-on Launcher Requirements

The app launcher must show add-ons as first-class applications.

Each app tile should communicate:

- Name
- Category
- Status: installed, enabled, disabled, unavailable, degraded
- Runtime type: embedded app, terminal/TUI, agent, channel, background service
- Primary action: open, install, configure, repair, or enable

Tile groups should support:

- Core apps
- Installed add-ons
- Available curated add-ons
- Sideloaded add-ons
- Recently used
- Running now

## Workspace Types

The center workspace needs a clear contract for different surfaces.

Supported workspace types:

- `launcher`: app grid and recent work
- `embedded-app`: Obsidian, OpenCode, Browser, or other embedded UI
- `terminal-app`: OpenClaw, Hermes, CLI/TUI agent surfaces
- `agent-workspace`: dedicated AI workspace or task surface
- `archive-workspace`: Living Archive operations
- `settings-workspace`: configuration only
- `diagnostic-workspace`: recovery, logs, system health

Each workspace should define:

- title
- owning add-on or core module
- icon
- status
- available actions
- whether it supports full-screen
- whether it requires side rails to remain visible

## Strategist Chat Rail

The right rail remains the persistent AI conversation surface defined in `ADR-004`, but it is not only a static Strategist panel. It is the place where the user chooses which trusted or installed agent they are currently talking with.

Additional UX rules:

- The rail is always available unless collapsed.
- The rail is not the center workspace by default.
- The user can ask Augmentor to open apps, inspect state, or coordinate agents.
- Chat rail collapse must not destroy conversation state.
- The rail width must be resizable by the user and persisted in shell preferences.
- The rail must expose an agent selector for Augmentor, Resonant Engineer, Hermes, and future agents.
- Each agent should have a distinct icon and accent color.
- Chat history/instances must be navigable inside the rail, ideally through a compact expandable history strip.
- In emergency recovery, the rail can be replaced by the Resonant Engineer Agent rail.

Agent color direction:

- Augmentor: ResonantOS green/gold identity palette.
- Resonant Engineer: red emergency/engineering palette.
- Hermes: yellow operations/messenger palette.
- Doctor/medical future agent: blue science/medical palette.
- Future departments may follow a Star Trek-inspired uniform color system, but the meaning must be documented before it becomes binding.

## Left Rail

The left rail is an app dock, not a settings sidebar.

Rules:

- Icon-only by default.
- Thin enough to feel like a launcher, but with touch-friendly targets.
- Shows pinned apps, core surfaces, and currently open apps/workspaces.
- Supports hover/focus labels.
- Supports future pin/unpin behavior.
- Settings is one dock item, not a dominant layout mode.
- The dock must not become a long settings menu.

## Top System Bar

The top bar is a thin OS-level control strip, similar in role to the macOS menu bar.

Initial top bar responsibilities:

- ResonantOS logo/home action on the left.
- Active app/workspace label.
- System health status.
- Runtime/provider summary.
- Help/documentation entry point.
- Emergency Resurrection entry point.
- Notification area.
- Time/date.

The top bar should stay compact. It must not become another dashboard.

## Touch-Screen Direction

ResonantOS should be touch-compatible.

Rules:

- Primary controls should target at least 44px height.
- App tiles should be large enough for touch.
- Side rail collapse/expand controls must be easy to hit.
- Avoid tiny dense controls in the default workspace.
- Dense diagnostic tables should live behind advanced sections.

## What Should Change From The Current UI

Remove from the default home experience:

- Dense status cards that look like configuration.
- Large permission matrices.
- Advanced diagnostic panels.
- Repeated explanatory text blocks.
- Multiple equal-weight panels competing for attention.

Keep but move to deeper areas:

- Provider diagnostics.
- Add-on capability grants.
- Archive trust boundary details.
- Runtime route internals.
- Recovery technical logs.

Bring forward:

- App launcher.
- Recently used apps/workspaces.
- Running apps.
- Clear primary actions.
- Persistent Strategist chat.
- Simple system health indicator.

## Implementation Direction

Near-term UI work should proceed in this order:

1. Create the fixed shell frame: top system bar, icon dock, center workspace, resizable chat rail.
2. Replace the Overview page with a Home / Apps workspace.
3. Add an app/add-on launcher surface in the center workspace.
4. Add active workspace state for opening add-ons in the center.
5. Add placeholder workspace renderers for terminal apps and embedded apps.
6. Move dense overview/settings content into Settings or Diagnostics.
7. Add real agent switching and chat history navigation in the right rail.
8. Add full-screen workspace mode.

## Open Questions

- Which add-ons should appear as installed by default in the first launcher mock: OpenClaw, Hermes, Obsidian, OpenCode, Browser, Audio2TOL, Codex, Claude Code?
- Should the center workspace support multiple open tabs, or only one active app at a time in v1?
- Should terminal/TUI add-ons use the native Rust/Tauri PTY layer first, or start with a safe placeholder shell until the add-on runtime is ready?
- Should Browser be a built-in workspace type or an add-on workspace type?
- What is the preferred default when the app opens: Home / Apps, last active workspace, or Strategist-focused workspace?

## Non-Goals For This Spec

- This document does not define the add-on SDK internals. Use `ADR-006`.
- This document does not define provider routing. Use `ADR-005`.
- This document does not define the Living Archive trust model. Use `ADR-007`, `ADR-011`, `ADR-012`, and `ADR-013`.
- This document does not replace the chat rail rules. Use `ADR-004`.
