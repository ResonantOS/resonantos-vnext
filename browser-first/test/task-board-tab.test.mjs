/**
 * task-board-tab.test.mjs
 *
 * Structural tests for the task-board addon.
 * Verifies manifest integrity, required files, and HTML contract.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ADDON_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "addons", "task-board");

describe("task-board addon", () => {
  it("has a valid addon.json manifest", async () => {
    const raw = await readFile(path.join(ADDON_DIR, "addon.json"), "utf8");
    const manifest = JSON.parse(raw);
    assert.equal(manifest.id, "addon.task-board");
    assert.ok(manifest.name);
    assert.ok(manifest.version);
    assert.ok(manifest.description);
    assert.ok(manifest.mode);
    assert.ok(manifest.trust);
    assert.ok(manifest.boundary);
    assert.ok(manifest.entry);
  });

  it("has an HTML entry file", async () => {
    await access(path.join(ADDON_DIR, "task-board.html"));
  });

  it("has a CSS file", async () => {
    await access(path.join(ADDON_DIR, "task-board.css"));
  });

  it("has a JS file", async () => {
    await access(path.join(ADDON_DIR, "task-board.js"));
  });

  it("HTML references the CSS and JS files", async () => {
    const html = await readFile(path.join(ADDON_DIR, "task-board.html"), "utf8");
    assert.ok(html.includes("task-board.css"), "HTML should reference CSS");
    assert.ok(html.includes("task-board.js"), "HTML should reference JS");
  });

  it("manifest trust is host-mediated", async () => {
    const raw = await readFile(path.join(ADDON_DIR, "addon.json"), "utf8");
    const manifest = JSON.parse(raw);
    assert.equal(manifest.trust, "host-mediated");
  });

  it("manifest entry matches the HTML filename", async () => {
    const raw = await readFile(path.join(ADDON_DIR, "addon.json"), "utf8");
    const manifest = JSON.parse(raw);
    assert.equal(manifest.entry, "task-board.html");
  });

  it("manifest capabilities include task-read", async () => {
    const raw = await readFile(path.join(ADDON_DIR, "addon.json"), "utf8");
    const manifest = JSON.parse(raw);
    assert.ok(Array.isArray(manifest.capabilities));
    assert.ok(manifest.capabilities.includes("task-read"), "Should require task-read capability");
  });
});
