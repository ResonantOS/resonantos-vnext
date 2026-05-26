# ICON-001: ResonantOS SVG Icon System

## Decision

ResonantOS uses first-party standalone SVG files for product concepts, a symbol sprite for app runtime usage, and curated third-party open-source SVGs for generic UI or brand affordances.

The first-party standalone icons are:

- `public/icons/custom/`

The runtime sprite is:

- `public/icons/resonant.svg`

The React entrypoint is:

- `src/ui/icons/resonant-icons.tsx`

The third-party open-source icon library is:

- `public/icons/third-party/`

The current primary UI/action family is Tabler Icons:

- `public/icons/third-party/tabler/`
- `public/icons/vendor-ui.svg`

The preview page is:

- `public/icons/icon-preview.html`

## Rules

- Custom icons are monochrome by default and inherit `currentColor`.
- Icons use a `24x24` viewBox and `1.75` stroke weight unless a specific filled shape is needed.
- Icons must not carry product state by color alone. State color belongs to the component using the icon.
- Icons must be touch-friendly in placement. The SVG can be `16-22px`, but the clickable target should stay at least `40px`.
- New icons should be added to the sprite first, then exposed through the typed `ResonantIconName` union.
- Standalone custom icons should also exist when the icon is a real product concept, so the asset can be previewed directly.
- Third-party icons must retain license files and source provenance.
- Chat action icons should use `public/icons/vendor-ui.svg` unless a custom icon is explicitly needed.
- Left launcher rail icons must use MIT open-source vendor icons through `public/icons/vendor-ui.svg`; do not add inline hand-drawn SVGs in `App.tsx`.

## Current Set

- Custom product icons: `augmentor`, `engineer`, `living-archive`, `archive-intake`, `human-knowledge`, `ai-memory`, `external-knowledge`, `provider-fabric`, `resurrect`, `shield`, `logician`, `obsidian-vault`, `audio2tol`, `wallet`, `workspace`
- Runtime sprite shell icons: `home`, `archive`, `living-archive`, `addons`, `settings`, `help`, `resurrect`, `health`, `notification`
- Agents: `agent`, `augmentor`, `engineer`
- Add-ons: `terminal`, `browser`, `obsidian`, `audio`
- Chat: `plus`, `search`, `project`, `pin`, `more`, `copy`, `edit`, `delete`, `branch`, `regenerate`, `save-archive`, `send`, `stop`, `mic`, `context`, `model`, `telemetry`, `chevron-down`
- Third-party sets: Tabler Icons, Lucide, Heroicons, Simple Icons.

## React Usage

```tsx
import { ResonantIcon } from "../ui/icons/resonant-icons";

<ResonantIcon name="augmentor" title="Augmentor" />
<ResonantIcon name="send" />
```

## Static SVG Usage

```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
  <use href="/icons/resonant.svg#ros-send"></use>
</svg>
```

## Implementation Consequences

Existing module-local icons can be migrated gradually. Feature work should avoid creating new inline icon functions unless the icon is temporary or module-private.
