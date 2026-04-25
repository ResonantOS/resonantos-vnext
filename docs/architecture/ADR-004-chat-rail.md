# ADR-004: Strategist Chat Rail

Status: Accepted  
Date: 2026-04-23

## Decision

The Strategist chat is a persistent right-side rail in the ResonantOS shell.

## UX Principles

- The left side is navigation.
- The center is the active workspace surface.
- The right side is the persistent Strategist conversation rail.
- The chat rail may be collapsed, but it remains a first-class working surface.

## Composer Rules

- Composer controls sit on the same lane under the input area.
- Send uses a compact icon button with accent emphasis.
- File attach and dictate use minimal icon buttons.
- Model and depth selectors remain present but visually quiet.
- Context usage is shown as an estimate until real compaction and tokenizer-aware accounting exist.
- Hover text must explain what the context indicator means and what it does not mean yet.

## Trust Rules

- The chat rail represents the main trusted Strategist relationship.
- It is not a generic demo chat box.
- Provider failures and capability gaps should surface honestly in the rail.

## Implementation Implication

- The chat rail belongs to `src/modules/chat/`.
- Shell composition may place it, but shell files should not own its internal rendering.
