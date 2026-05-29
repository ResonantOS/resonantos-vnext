# ResonantOS Browser-First Add-on Specification

**Version:** 1.0.0  
**Status:** Active  
**Audience:** Third-party addon developers, ResonantOS contributors

---

## What Is an Add-on?

A ResonantOS add-on is a self-contained module that extends the browser-first extension. Add-ons live in `browser-first/addons/` and are automatically discovered by the bridge server at startup. Each add-on declares its capabilities, trust boundary, and integration points via a manifest file (`addon.json`).

Add-ons are **additive only** — they do not modify existing ResonantOS code. They hook into the system through declared channels, content scripts, and the bridge API.

---

## Directory Structure

```
browser-first/addons/
  <addon-name>/
    addon.json          ← Required manifest (described below)
    <entry>.html        ← Optional: tab UI (if mode has a visual surface)
    <scripts>.js        ← Optional: content scripts or UI logic
    <styles>.css        ← Optional: styles for the addon UI
    README.md           ← Optional: developer notes
```

Each add-on gets its **own subdirectory**. The directory name is arbitrary (use a slug matching the addon `id` suffix, e.g., `blackboard` for `addon.blackboard`).

**Do not place any add-on files at the top level of `browser-first/addons/`.** Only subdirectories are scanned.

---

## `addon.json` Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✅ | Unique identifier. Must start with `"addon."`. Example: `"addon.blackboard"`. |
| `name` | `string` | ✅ | Human-readable name. Plain text only — no HTML. |
| `version` | `string` | ✅ | Semantic version. Example: `"1.0.0"`. |
| `description` | `string` | ✅ | One-line description. Plain text only — no HTML. |
| `author` | `string` | ❌ | Who built the addon. |
| `mode` | `string` | ✅ | Addon mode (see modes below). |
| `trust` | `string` | ✅ | Trust level (see trust model below). |
| `entry` | `string \| null` | ❌ | HTML file to open as a tab. Must be relative to the addon folder. Cannot traverse above the addon directory. |
| `contentScripts` | `string[]` | ❌ | JS files injected into pages. Each must be relative to the addon folder. Cannot traverse above the addon directory. |
| `commands` | `string[]` | ❌ | Slash commands this addon handles. Example: `["/blackboard", "/draw"]`. |
| `messageChannel` | `string` | ❌ | `chrome.runtime.onMessage` channel name for cross-component messaging. |
| `capabilities` | `string[]` | ❌ | Declared capability strings. Used for routing and UI display. |
| `requires` | `string[]` | ❌ | Array of addon `id`s this addon depends on. Discovery warns on circular deps. |
| `boundary` | `string` | ✅ | Human-readable trust boundary. Non-empty. Plain text — describes what the addon cannot do. |

---

## Add-on Modes

| Mode | Description | Example |
|------|-------------|---------|
| `visual-surface` | Full visual display surface (canvas, docs, embeds) | Blackboard |
| `awareness-engine` | Page context observation and analysis | Resonant Context SDK |
| `visual-guide` | Overlay layer that guides the user visually | Resonator |
| `security-monitor` | Security auditing and permission monitoring | Shield |
| `memory-system` | Memory storage, retrieval, and export | Living Archive |
| `delegation-addon` | Delegate tasks to a sub-agent | Hermes, Protocol Store |
| `coding-addon` | Delegate coding tasks to an external tool | OpenCode |
| `page-observer` | Read-only page observation | (custom) |
| `utility` | General utility, doesn't fit other modes | Wallet Adapter |

---

## Trust Model

Trust defines what the add-on is **allowed to do** and what remains **host-mediated**. The bridge server enforces trust boundaries.

| Trust Level | Meaning |
|-------------|---------|
| `host-mediated` | The addon operates through the bridge host. Provider secrets, wallet actions, and memory writes go through the host — not directly from the extension. |
| `page-observer` | Read-only page observation. No DOM writes, no network requests. |
| `page-overlay` | May add overlay elements to the page (CSS/DOM). Cannot read page data or make network requests. |
| `add-on agent` | Runs as a governed sub-agent. Receives task packets only. Secrets and wallet remain host-mediated. |
| `explicit grants required` | Sensitive operations (wallet signing, protocol installation) require explicit user approval per action. |

**Security note:** The discovery engine validates `trust` against this allowlist. Manifests claiming unknown trust values (e.g., `"core-agent"`, `"admin"`, `"trusted"`) are **rejected**. Do not attempt to claim elevated trust — it will not be granted and your addon will be skipped.

---

## How Discovery Works

At bridge server startup, `discoverAddons()` scans `browser-first/addons/`:

1. **Subdirectory scan** — only directories are considered.
2. **Symlink protection** — each folder's real path is resolved; folders that point outside `addons/` are rejected.
3. **`addon.json` presence** — directories without `addon.json` are silently skipped.
4. **Size check** — manifests larger than 64 KB are rejected (DoS protection).
5. **JSON parse** — malformed JSON is skipped with a warning.
6. **Validation** — required fields, trust allowlist, mode allowlist, path traversal checks.
7. **ID deduplication** — if two addons declare the same `id`, the second is skipped.
8. **Circular dependency check** — `requires` chains are analyzed; cycles are warned but don't block discovery.
9. **Descriptor returned** — valid addons are merged into the `/addons/status` API response.

Discovery **never throws**. It always returns an array (empty if nothing is found or errors occur).

---

## Testing Your Add-on

### 1. Validate the manifest

```bash
node -e "
  import('./host/addon-discovery.mjs').then(({ validateManifest }) => {
    const m = JSON.parse(require('fs').readFileSync('browser-first/addons/<your-addon>/addon.json', 'utf8'));
    const errors = validateManifest(m);
    if (errors.length === 0) console.log('✅ Valid');
    else errors.forEach(e => console.error('❌', e));
  });
"
```

### 2. Run discovery against your addon

```bash
RESONANTOS_ADDONS_DIR=browser-first/addons \
  node -e "
    import('./browser-first/host/addon-discovery.mjs').then(({ discoverAddons }) =>
      discoverAddons().then(addons => console.log(JSON.stringify(addons, null, 2)))
    );
  "
```

### 3. Run the addon-discovery test suite

```bash
node --test browser-first/test/addon-discovery.test.mjs
```

### 4. Run all browser-first tests

```bash
node --test browser-first/test/*.test.mjs
```

### 5. Security checks

```bash
# Must be ZERO
grep -ri "electron" browser-first/addons/

# Must be ZERO  
grep -r "rpa_[A-Z]\|gsk_[a-z]\|sk-ant\|sk-proj" browser-first/addons/

# Must be ZERO
find browser-first/addons/ -name "bridge-config.generated.js"
find browser-first/addons/ -name "dist" -type d
find browser-first/addons/ -name "*.zip"
```

---

## Example `addon.json` for Each Mode

### `visual-surface` — Display Tab

```json
{
  "id": "addon.my-display",
  "name": "My Display",
  "version": "1.0.0",
  "description": "Renders rich visual content in a dedicated tab",
  "author": "Your Name",
  "mode": "visual-surface",
  "trust": "host-mediated",
  "entry": "display.html",
  "contentScripts": [],
  "commands": ["/display"],
  "messageChannel": "resonantos.my-display",
  "capabilities": ["render", "export"],
  "requires": [],
  "boundary": "Visual display only. No page modification, no network access."
}
```

### `page-observer` — Read-Only Observer

```json
{
  "id": "addon.my-observer",
  "name": "My Observer",
  "version": "1.0.0",
  "description": "Observes page content and reports structured context",
  "author": "Your Name",
  "mode": "page-observer",
  "trust": "page-observer",
  "entry": null,
  "contentScripts": ["observer.js"],
  "commands": [],
  "messageChannel": "resonantos.my-observer",
  "capabilities": ["observe"],
  "requires": [],
  "boundary": "Read-only page observation. No DOM modification, no network writes."
}
```

### `delegation-addon` — Sub-agent Task Delegation

```json
{
  "id": "addon.my-agent",
  "name": "My Agent",
  "version": "1.0.0",
  "description": "Delegates research tasks to a governed sub-agent",
  "author": "Your Name",
  "mode": "delegation-addon",
  "trust": "add-on agent",
  "entry": "agent-tab.html",
  "contentScripts": [],
  "commands": ["/delegate"],
  "messageChannel": "resonantos.my-agent",
  "capabilities": ["research", "summarize"],
  "requires": [],
  "boundary": "Task packets only. Provider secrets, wallet actions, and trusted memory writes remain host-mediated."
}
```

### `utility` — General Purpose with Explicit Grants

```json
{
  "id": "addon.my-utility",
  "name": "My Utility",
  "version": "1.0.0",
  "description": "Provides utility functions requiring user consent",
  "author": "Your Name",
  "mode": "utility",
  "trust": "explicit grants required",
  "entry": null,
  "contentScripts": ["utility.js"],
  "commands": [],
  "messageChannel": "resonantos.my-utility",
  "capabilities": ["export"],
  "requires": [],
  "boundary": "All sensitive operations require explicit user approval per action."
}
```

---

## Hello World Addon

The minimal addon that discovery accepts:

**`browser-first/addons/hello-world/addon.json`**

```json
{
  "id": "addon.hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "Minimal addon that does nothing but exist",
  "mode": "utility",
  "trust": "host-mediated",
  "boundary": "No capabilities. Proof of concept only."
}
```

That's it. No entry, no scripts, no commands. Discovery will pick it up, validate it, and include it in the `/addons/status` response.

---

## Security Checklist

Before submitting an addon for review:

- [ ] `id` starts with `addon.`
- [ ] `trust` is one of the allowed values (no invented trust levels)
- [ ] `boundary` accurately describes what your addon **cannot** do
- [ ] No `entry` or `contentScripts` paths contain `..` or absolute paths
- [ ] `description` and `boundary` contain no HTML markup
- [ ] No secrets, API keys, or tokens in any addon file
- [ ] No `dist/` directory, no bundled output, no `.zip` files
- [ ] No `bridge-config.generated.js` (that file is generated at runtime, not committed)
- [ ] No Electron imports or Node.js built-ins in browser-side scripts
- [ ] `requires` does not create circular dependencies

---

## API Shape (for bridge server integration)

Discovered addons are merged into the `/addons/status` response. Each descriptor has this shape:

```typescript
interface AddonDescriptor {
  id: string;                  // "addon.blackboard"
  name: string;                // "Resonant Blackboard"
  version: string;             // "1.0.0"
  description: string;         // one-line description
  author?: string;             // optional
  mode: string;                // "visual-surface" | ...
  trust: string;               // "host-mediated" | ...
  entry: string | null;        // "blackboard.html" or null
  contentScripts: string[];    // ["script.js"]
  commands: string[];          // ["/blackboard"]
  messageChannel?: string;     // "resonantos.blackboard"
  capabilities: string[];      // ["canvas", "document"]
  requires: string[];          // [] or ["addon.other"]
  boundary: string;            // trust boundary description
  available: true;             // always true (presence = available)
  addonDir: string;            // absolute path to addon folder
}
```
