/**
 * addon-discovery.test.mjs — Tests for Dynamic Add-on Discovery
 *
 * Uses Node's built-in test runner (node --test).
 * Creates temporary directories for each test to ensure isolation.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { discoverAddons, validateManifest } from "../host/addon-discovery.mjs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTmpDir() {
  return mkdtemp(path.join(os.tmpdir(), "addon-discovery-test-"));
}

async function writeAddon(root, name, manifest) {
  const addonDir = path.join(root, name);
  await mkdir(addonDir, { recursive: true });
  await writeFile(
    path.join(addonDir, "addon.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  return addonDir;
}

const MINIMAL_VALID = {
  id: "addon.test",
  name: "Test Addon",
  version: "1.0.0",
  description: "A test addon",
  mode: "utility",
  trust: "host-mediated",
  boundary: "Test boundary only.",
};

// ─── validateManifest() unit tests ────────────────────────────────────────────

describe("validateManifest()", () => {
  it("accepts a minimal valid manifest", () => {
    const errors = validateManifest({ ...MINIMAL_VALID });
    assert.deepEqual(errors, []);
  });

  it("rejects null input", () => {
    const errors = validateManifest(null);
    assert.ok(errors.length > 0);
    assert.ok(errors[0].includes("JSON object"));
  });

  it("rejects array input", () => {
    const errors = validateManifest([]);
    assert.ok(errors.length > 0);
  });

  it("rejects missing required fields", () => {
    for (const field of ["id", "name", "version", "description", "mode", "trust", "boundary"]) {
      const m = { ...MINIMAL_VALID };
      delete m[field];
      const errors = validateManifest(m);
      assert.ok(errors.some((e) => e.includes(field)), `Should report missing field: ${field}`);
    }
  });

  it("rejects id that does not start with 'addon.'", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, id: "my-addon" });
    assert.ok(errors.some((e) => e.includes("addon.")));
  });

  it("rejects disallowed trust value", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, trust: "core-agent" });
    assert.ok(errors.some((e) => e.includes("trust")));
  });

  it("rejects disallowed trust value 'admin'", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, trust: "admin" });
    assert.ok(errors.some((e) => e.includes("trust")));
  });

  it("rejects disallowed mode value", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, mode: "unknown-mode" });
    assert.ok(errors.some((e) => e.includes("mode")));
  });

  it("rejects empty boundary", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, boundary: "   " });
    assert.ok(errors.some((e) => e.includes("boundary")));
  });

  it("rejects HTML in description", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, description: "Hello <script>evil()</script>" });
    assert.ok(errors.some((e) => e.includes("description")));
  });

  it("rejects HTML in boundary", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, boundary: "<b>Not safe</b>" });
    assert.ok(errors.some((e) => e.includes("boundary")));
  });

  it("rejects HTML in name", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, name: "<script>alert(1)</script>" });
    assert.ok(errors.some((e) => e.includes("name")));
  });

  it("rejects path traversal in entry", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, entry: "../../etc/passwd" });
    assert.ok(errors.some((e) => e.includes("entry")));
  });

  it("rejects absolute path in entry", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, entry: "/etc/passwd" });
    assert.ok(errors.some((e) => e.includes("entry")));
  });

  it("rejects path traversal in contentScripts", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, contentScripts: ["../../malicious.js"] });
    assert.ok(errors.some((e) => e.includes("contentScripts")));
  });

  it("accepts valid entry path", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, entry: "index.html" });
    assert.deepEqual(errors, []);
  });

  it("accepts null entry", () => {
    const errors = validateManifest({ ...MINIMAL_VALID, entry: null });
    assert.deepEqual(errors, []);
  });

  it("accepts all allowed trust values", () => {
    const allowedTrust = [
      "host-mediated",
      "page-observer",
      "page-overlay",
      "add-on agent",
      "explicit grants required",
      "host-mediated memory provider",
    ];
    for (const trust of allowedTrust) {
      const errors = validateManifest({ ...MINIMAL_VALID, trust });
      assert.deepEqual(errors, [], `Trust value "${trust}" should be allowed`);
    }
  });

  it("accepts all allowed mode values", () => {
    const allowedModes = [
      "visual-surface",
      "awareness-engine",
      "visual-guide",
      "security-monitor",
      "memory-system",
      "delegation-addon",
      "coding-addon",
      "page-observer",
      "utility",
    ];
    for (const mode of allowedModes) {
      const errors = validateManifest({ ...MINIMAL_VALID, mode });
      assert.deepEqual(errors, [], `Mode "${mode}" should be allowed`);
    }
  });
});

// ─── discoverAddons() integration tests ───────────────────────────────────────

describe("discoverAddons()", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ── Core discovery ─────────────────────────────────────────────────────────

  it("discovers a valid addon from a directory", async () => {
    await writeAddon(tmpDir, "my-addon", {
      ...MINIMAL_VALID,
      id: "addon.my-addon",
    });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 1);
    assert.equal(addons[0].id, "addon.my-addon");
    assert.equal(addons[0].name, "Test Addon");
    assert.equal(addons[0].available, true);
    assert.ok(typeof addons[0].addonDir === "string");
  });

  it("discovers multiple valid addons", async () => {
    await writeAddon(tmpDir, "addon-a", { ...MINIMAL_VALID, id: "addon.a", name: "A" });
    await writeAddon(tmpDir, "addon-b", { ...MINIMAL_VALID, id: "addon.b", name: "B" });
    await writeAddon(tmpDir, "addon-c", { ...MINIMAL_VALID, id: "addon.c", name: "C" });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 3);
    const ids = addons.map((a) => a.id).sort();
    assert.deepEqual(ids, ["addon.a", "addon.b", "addon.c"]);
  });

  it("skips directories without addon.json", async () => {
    await mkdir(path.join(tmpDir, "no-manifest"), { recursive: true });
    await mkdir(path.join(tmpDir, "also-no-manifest"), { recursive: true });
    await writeAddon(tmpDir, "valid", { ...MINIMAL_VALID, id: "addon.valid" });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 1);
    assert.equal(addons[0].id, "addon.valid");
  });

  it("skips invalid JSON gracefully", async () => {
    const addonDir = path.join(tmpDir, "bad-json");
    await mkdir(addonDir, { recursive: true });
    await writeFile(path.join(addonDir, "addon.json"), "{ this is not json", "utf8");

    await writeAddon(tmpDir, "valid", { ...MINIMAL_VALID, id: "addon.valid" });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 1);
    assert.equal(addons[0].id, "addon.valid");
  });

  it("validates required fields and skips invalid manifests", async () => {
    // Missing 'boundary' — invalid
    await writeAddon(tmpDir, "invalid", {
      id: "addon.invalid",
      name: "Invalid",
      version: "1.0.0",
      description: "Missing boundary",
      mode: "utility",
      trust: "host-mediated",
      // boundary intentionally missing
    });

    await writeAddon(tmpDir, "valid", { ...MINIMAL_VALID, id: "addon.valid" });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 1);
    assert.equal(addons[0].id, "addon.valid");
  });

  it("handles missing addons/ directory", async () => {
    const nonExistent = path.join(tmpDir, "does-not-exist");

    const addons = await discoverAddons(nonExistent);

    assert.deepEqual(addons, []);
  });

  it("handles empty addons/ directory", async () => {
    const addons = await discoverAddons(tmpDir);

    assert.deepEqual(addons, []);
  });

  // ── API shape ──────────────────────────────────────────────────────────────

  it("returns correct shape matching Manolo's API", async () => {
    await writeAddon(tmpDir, "full", {
      id: "addon.full",
      name: "Full Addon",
      version: "2.1.0",
      description: "A fully specified addon",
      author: "Test Author",
      mode: "visual-surface",
      trust: "host-mediated",
      entry: "index.html",
      contentScripts: ["script.js"],
      commands: ["/full"],
      messageChannel: "resonantos.full",
      capabilities: ["render"],
      requires: [],
      boundary: "Display only.",
    });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 1);
    const a = addons[0];

    // Manolo's built-in shape
    assert.equal(typeof a.id, "string");
    assert.equal(typeof a.name, "string");
    assert.equal(typeof a.mode, "string");
    assert.equal(typeof a.trust, "string");
    assert.equal(a.available, true);

    // Extended fields
    assert.equal(a.version, "2.1.0");
    assert.equal(a.author, "Test Author");
    assert.equal(a.entry, "index.html");
    assert.deepEqual(a.contentScripts, ["script.js"]);
    assert.deepEqual(a.commands, ["/full"]);
    assert.equal(a.messageChannel, "resonantos.full");
    assert.deepEqual(a.capabilities, ["render"]);
    assert.deepEqual(a.requires, []);
    assert.equal(a.boundary, "Display only.");
    assert.equal(typeof a.addonDir, "string");
    assert.ok(existsSync(a.addonDir));
  });

  it("defaults optional array fields to empty arrays", async () => {
    await writeAddon(tmpDir, "minimal", { ...MINIMAL_VALID, id: "addon.minimal" });

    const addons = await discoverAddons(tmpDir);
    const a = addons[0];

    assert.deepEqual(a.contentScripts, []);
    assert.deepEqual(a.commands, []);
    assert.deepEqual(a.capabilities, []);
    assert.deepEqual(a.requires, []);
  });

  it("defaults entry to null when not specified", async () => {
    await writeAddon(tmpDir, "no-entry", { ...MINIMAL_VALID, id: "addon.no-entry" });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons[0].entry, null);
  });

  // ── Security: ID collision ─────────────────────────────────────────────────

  it("handles ID collision — first-seen wins, duplicate skipped", async () => {
    // Both declare "addon.same-id" — first alphabetically wins (readdir order)
    await writeAddon(tmpDir, "aaa-first", { ...MINIMAL_VALID, id: "addon.same-id", name: "First" });
    await writeAddon(tmpDir, "zzz-second", { ...MINIMAL_VALID, id: "addon.same-id", name: "Second" });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 1);
    assert.equal(addons[0].id, "addon.same-id");
  });

  // ── Security: path traversal ───────────────────────────────────────────────

  it("rejects manifest with path traversal in entry field", async () => {
    await writeAddon(tmpDir, "traversal", {
      ...MINIMAL_VALID,
      id: "addon.traversal",
      entry: "../../etc/passwd",
    });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 0);
  });

  it("rejects manifest with path traversal in contentScripts", async () => {
    await writeAddon(tmpDir, "traversal-scripts", {
      ...MINIMAL_VALID,
      id: "addon.traversal-scripts",
      contentScripts: ["../../secrets.js"],
    });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 0);
  });

  // ── Security: disallowed trust ─────────────────────────────────────────────

  it("rejects manifest with disallowed trust value", async () => {
    await writeAddon(tmpDir, "bad-trust", {
      ...MINIMAL_VALID,
      id: "addon.bad-trust",
      trust: "core-agent",
    });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 0);
  });

  it("rejects manifest claiming 'trusted' trust level", async () => {
    await writeAddon(tmpDir, "trusted-claim", {
      ...MINIMAL_VALID,
      id: "addon.trusted-claim",
      trust: "trusted",
    });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 0);
  });

  // ── Security: oversized manifest ──────────────────────────────────────────

  it("rejects manifest exceeding 64 KB size limit", async () => {
    const addonDir = path.join(tmpDir, "giant");
    await mkdir(addonDir, { recursive: true });

    // Build a manifest that exceeds 64KB
    const giant = {
      ...MINIMAL_VALID,
      id: "addon.giant",
      description: "A".repeat(70 * 1024), // 70 KB description
    };
    await writeFile(path.join(addonDir, "addon.json"), JSON.stringify(giant), "utf8");

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 0);
  });

  // ── Security: HTML injection ───────────────────────────────────────────────

  it("rejects manifest with HTML in description", async () => {
    await writeAddon(tmpDir, "html-desc", {
      ...MINIMAL_VALID,
      id: "addon.html-desc",
      description: "<script>alert('xss')</script>",
    });

    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 0);
  });

  // ── Circular requires ──────────────────────────────────────────────────────

  it("still returns addons when circular requires are detected", async () => {
    // A → B → A
    await writeAddon(tmpDir, "addon-a", {
      ...MINIMAL_VALID,
      id: "addon.a",
      name: "A",
      requires: ["addon.b"],
    });
    await writeAddon(tmpDir, "addon-b", {
      ...MINIMAL_VALID,
      id: "addon.b",
      name: "B",
      requires: ["addon.a"],
    });

    // Should not throw and should still return both addons
    const addons = await discoverAddons(tmpDir);

    assert.equal(addons.length, 2);
    const ids = addons.map((a) => a.id).sort();
    assert.deepEqual(ids, ["addon.a", "addon.b"]);
  });

  // ── Real addons/ directory ─────────────────────────────────────────────────

  it("discovers all 8 real addons from browser-first/addons/", async () => {
    // Uses the real addons directory (no override)
    const addons = await discoverAddons();

    const expectedIds = [
      "addon.blackboard",
      "addon.resonant-context",
      "addon.resonator",
      "addon.shield",
      "addon.archive",
      "addon.awareness",
      "addon.protocol-store",
      "addon.wallet-adapter",
    ];

    assert.equal(addons.length, expectedIds.length,
      `Expected ${expectedIds.length} addons, got ${addons.length}: ${addons.map(a => a.id).join(", ")}`
    );

    for (const id of expectedIds) {
      assert.ok(
        addons.some((a) => a.id === id),
        `Missing expected addon: ${id}`
      );
    }

    // All should have required fields
    for (const addon of addons) {
      assert.ok(addon.available === true, `${addon.id} should be available`);
      assert.ok(typeof addon.boundary === "string" && addon.boundary.length > 0,
        `${addon.id} should have a non-empty boundary`);
    }
  });
});
