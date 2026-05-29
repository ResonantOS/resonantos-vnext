/**
 * addon-discovery.mjs — Dynamic Add-on Discovery
 *
 * Scans browser-first/addons/ for subdirectories containing addon.json.
 * Returns validated addon descriptors compatible with /addons/status API.
 *
 * Manolo's built-in addons (Hermes, OpenCode, Living Archive) are NOT affected.
 * This function only discovers addons in the addons/ directory.
 *
 * Security hardening:
 *  - Path traversal: all resolved paths are checked to be inside addonsRoot
 *  - Symlink protection: realpath check ensures no symlink escapes the boundary
 *  - Manifest size limit: manifests >64KB are rejected
 *  - Trust allowlist: unknown trust values are rejected
 *  - ID collision: duplicate ids emit a warning; last-wins (first occurrence wins)
 *  - HTML/script injection: description and boundary fields are plain-text only
 *    (no HTML interpretation happens here — callers must escape before rendering)
 *  - Circular requires: detected and warned; does not block discovery
 */

import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/** Maximum manifest file size in bytes (64 KB). Prevents DoS via giant JSON. */
const MAX_MANIFEST_BYTES = 64 * 1024;

/** Required fields for a valid addon.json. */
const REQUIRED_FIELDS = ["id", "name", "version", "description", "mode", "trust", "boundary"];

/**
 * Allowed trust values. Unknown values are rejected to prevent privilege escalation
 * via a malicious addon claiming to be "core-agent" or similar.
 */
const ALLOWED_TRUST_VALUES = new Set([
  "host-mediated",
  "page-observer",
  "page-overlay",
  "add-on agent",
  "explicit grants required",
  "host-mediated memory provider",
]);

/**
 * Allowed mode values. Open-ended but validated to catch typos and injection attempts.
 */
const ALLOWED_MODE_VALUES = new Set([
  "visual-surface",
  "awareness-engine",
  "visual-guide",
  "security-monitor",
  "memory-system",
  "delegation-addon",
  "coding-addon",
  "page-observer",
  "utility",
]);

/**
 * Resolves the addons directory relative to this file's location.
 * Override with RESONANTOS_ADDONS_DIR env var (tests use this).
 *
 * @returns {string} Absolute path to the addons directory.
 */
export function resolveAddonsRoot() {
  if (process.env.RESONANTOS_ADDONS_DIR) {
    return path.resolve(process.env.RESONANTOS_ADDONS_DIR);
  }
  return path.resolve(import.meta.dirname, "..", "addons");
}

/**
 * Checks whether a resolved path is safely inside a root directory.
 * Prevents path traversal attacks via ".." in addon names.
 *
 * @param {string} root - Absolute root path (already resolved).
 * @param {string} target - Absolute path to check.
 * @returns {boolean}
 */
function isInsideRoot(root, target) {
  const rel = path.relative(root, target);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Validates a parsed manifest object. Returns an array of error strings.
 * Empty array = valid.
 *
 * @param {unknown} manifest - Parsed JSON value.
 * @returns {string[]} Validation errors.
 */
export function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["Manifest must be a JSON object."];
  }

  for (const field of REQUIRED_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === null) {
      errors.push(`Missing required field: "${field}".`);
    }
  }

  if (typeof manifest.id === "string" && !manifest.id.startsWith("addon.")) {
    errors.push(`Field "id" must start with "addon." — got "${manifest.id}".`);
  }

  if (typeof manifest.trust === "string" && !ALLOWED_TRUST_VALUES.has(manifest.trust)) {
    errors.push(
      `Field "trust" has disallowed value "${manifest.trust}". ` +
      `Allowed values: ${[...ALLOWED_TRUST_VALUES].join(", ")}.`
    );
  }

  if (typeof manifest.mode === "string" && !ALLOWED_MODE_VALUES.has(manifest.mode)) {
    errors.push(
      `Field "mode" has disallowed value "${manifest.mode}". ` +
      `Allowed values: ${[...ALLOWED_MODE_VALUES].join(", ")}.`
    );
  }

  if (typeof manifest.boundary === "string" && manifest.boundary.trim() === "") {
    errors.push(`Field "boundary" must not be empty.`);
  }

  // Detect HTML/script content in string fields (injection hardening)
  for (const field of ["description", "boundary", "name"]) {
    if (typeof manifest[field] === "string" && /<[a-z!]/i.test(manifest[field])) {
      errors.push(`Field "${field}" must not contain HTML markup.`);
    }
  }

  // Validate entry: if present, must not escape the addon folder
  if (manifest.entry != null) {
    if (typeof manifest.entry !== "string") {
      errors.push(`Field "entry" must be a string or null.`);
    } else {
      const normalized = path.normalize(manifest.entry);
      if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
        errors.push(`Field "entry" must not escape the addon directory — got "${manifest.entry}".`);
      }
    }
  }

  // Validate contentScripts array entries
  if (manifest.contentScripts !== undefined) {
    if (!Array.isArray(manifest.contentScripts)) {
      errors.push(`Field "contentScripts" must be an array.`);
    } else {
      for (const script of manifest.contentScripts) {
        if (typeof script !== "string") {
          errors.push(`All entries in "contentScripts" must be strings.`);
          break;
        }
        const normalized = path.normalize(script);
        if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
          errors.push(`"contentScripts" entry must not escape the addon directory — got "${script}".`);
        }
      }
    }
  }

  return errors;
}

/**
 * Detects circular requires chains using DFS.
 *
 * @param {Map<string, string[]>} requiresMap - Map of id → requires[].
 * @returns {string[]} Array of cycle descriptions.
 */
function detectCircularRequires(requiresMap) {
  const cycles = [];
  const visited = new Set();
  const stack = new Set();

  function dfs(id, chain) {
    if (stack.has(id)) {
      const cycleStart = chain.indexOf(id);
      cycles.push(`Circular dependency: ${chain.slice(cycleStart).concat(id).join(" → ")}`);
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    stack.add(id);
    for (const dep of (requiresMap.get(id) ?? [])) {
      dfs(dep, [...chain, id]);
    }
    stack.delete(id);
  }

  for (const id of requiresMap.keys()) {
    dfs(id, []);
  }
  return cycles;
}

/**
 * Discovers and validates addons from the addons/ directory.
 *
 * Never throws. Always returns an array (empty if nothing found or on error).
 *
 * Each returned descriptor matches the shape of Manolo's built-in addons:
 * ```
 * {
 *   id: string,
 *   name: string,
 *   version: string,
 *   description: string,
 *   author: string | undefined,
 *   mode: string,
 *   trust: string,
 *   entry: string | null,
 *   contentScripts: string[],
 *   commands: string[],
 *   messageChannel: string | undefined,
 *   capabilities: string[],
 *   requires: string[],
 *   boundary: string,
 *   available: true,       // always true — presence = available
 *   addonDir: string,      // absolute path to addon folder (for host use)
 * }
 * ```
 *
 * @param {string} [addonsRootOverride] - Optional override for the addons root (tests).
 * @returns {Promise<object[]>} Validated addon descriptors.
 */
export async function discoverAddons(addonsRootOverride) {
  const addonsRoot = addonsRootOverride ?? resolveAddonsRoot();

  if (!existsSync(addonsRoot)) {
    console.warn(`[addon-discovery] addons directory not found: ${addonsRoot}`);
    return [];
  }

  let entries;
  try {
    entries = await readdir(addonsRoot, { withFileTypes: true });
  } catch (err) {
    console.warn(`[addon-discovery] Failed to read addons directory: ${err.message}`);
    return [];
  }

  const subdirs = entries.filter((e) => e.isDirectory());

  if (subdirs.length === 0) {
    return [];
  }

  const descriptors = [];
  const seenIds = new Map(); // id → addonDir, for collision detection
  const requiresMap = new Map(); // id → requires[], for cycle detection

  for (const subdir of subdirs) {
    const addonDir = path.join(addonsRoot, subdir.name);

    // ── Symlink protection ────────────────────────────────────────────────────
    // Resolve the real path to detect symlinks that escape the addons root.
    let realAddonDir;
    try {
      realAddonDir = await realpath(addonDir);
    } catch {
      console.warn(`[addon-discovery] Cannot resolve realpath for "${subdir.name}" — skipping.`);
      continue;
    }

    let realAddonsRoot;
    try {
      realAddonsRoot = await realpath(addonsRoot);
    } catch {
      realAddonsRoot = addonsRoot;
    }

    if (!isInsideRoot(realAddonsRoot, realAddonDir)) {
      console.warn(
        `[addon-discovery] Addon "${subdir.name}" resolved outside addons root (symlink attack?) — skipping.`
      );
      continue;
    }

    // ── Manifest path ─────────────────────────────────────────────────────────
    const manifestPath = path.join(addonDir, "addon.json");

    // Verify manifest path doesn't escape (belt-and-suspenders)
    if (!isInsideRoot(addonsRoot, manifestPath)) {
      console.warn(`[addon-discovery] Manifest path for "${subdir.name}" escapes root — skipping.`);
      continue;
    }

    // ── File existence ────────────────────────────────────────────────────────
    let manifestStat;
    try {
      manifestStat = await stat(manifestPath);
    } catch {
      // No addon.json — silently skip (not an addon folder)
      continue;
    }

    // ── Manifest size limit (64 KB) ───────────────────────────────────────────
    if (manifestStat.size > MAX_MANIFEST_BYTES) {
      console.warn(
        `[addon-discovery] Manifest for "${subdir.name}" exceeds size limit ` +
        `(${manifestStat.size} > ${MAX_MANIFEST_BYTES} bytes) — skipping.`
      );
      continue;
    }

    // ── Read and parse ────────────────────────────────────────────────────────
    let manifest;
    try {
      const raw = await readFile(manifestPath, "utf8");
      manifest = JSON.parse(raw);
    } catch (err) {
      console.warn(`[addon-discovery] Failed to parse manifest for "${subdir.name}": ${err.message} — skipping.`);
      continue;
    }

    // ── Validate ──────────────────────────────────────────────────────────────
    const errors = validateManifest(manifest);
    if (errors.length > 0) {
      console.warn(
        `[addon-discovery] Invalid manifest for "${subdir.name}":\n` +
        errors.map((e) => `  • ${e}`).join("\n") +
        "\n  Skipping."
      );
      continue;
    }

    // ── ID collision detection ────────────────────────────────────────────────
    if (seenIds.has(manifest.id)) {
      console.warn(
        `[addon-discovery] ID collision: "${manifest.id}" already registered from ` +
        `"${seenIds.get(manifest.id)}" — skipping duplicate at "${subdir.name}".`
      );
      continue;
    }
    seenIds.set(manifest.id, subdir.name);

    // ── Build descriptor ──────────────────────────────────────────────────────
    const descriptor = {
      id:             manifest.id,
      name:           manifest.name,
      version:        manifest.version,
      description:    manifest.description,
      author:         manifest.author ?? undefined,
      mode:           manifest.mode,
      trust:          manifest.trust,
      entry:          manifest.entry ?? null,
      contentScripts: Array.isArray(manifest.contentScripts) ? manifest.contentScripts : [],
      commands:       Array.isArray(manifest.commands) ? manifest.commands : [],
      messageChannel: manifest.messageChannel ?? undefined,
      capabilities:   Array.isArray(manifest.capabilities) ? manifest.capabilities : [],
      requires:       Array.isArray(manifest.requires) ? manifest.requires : [],
      boundary:       manifest.boundary,
      available:      true,
      addonDir:       realAddonDir,
    };

    descriptors.push(descriptor);
    requiresMap.set(descriptor.id, descriptor.requires);
  }

  // ── Circular requires check ───────────────────────────────────────────────
  const cycles = detectCircularRequires(requiresMap);
  for (const cycle of cycles) {
    console.warn(`[addon-discovery] ${cycle}`);
  }

  return descriptors;
}
