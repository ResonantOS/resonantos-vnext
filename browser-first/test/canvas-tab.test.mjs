/**
 * canvas-tab.test.mjs
 *
 * Structural tests for the canvas addon.
 * Verifies manifest integrity, required files, HTML contract,
 * and presence of canvas element references.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ADDON_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "addons", "canvas");

describe("canvas addon", () => {
  it("has a valid addon.json manifest", async () => {
    const raw = await readFile(path.join(ADDON_DIR, "addon.json"), "utf8");
    const manifest = JSON.parse(raw);
    assert.equal(manifest.id, "addon.canvas");
    assert.ok(manifest.name);
    assert.ok(manifest.version);
    assert.ok(manifest.description);
    assert.ok(manifest.mode);
    assert.ok(manifest.trust);
    assert.ok(manifest.boundary);
    assert.ok(manifest.entry);
  });

  it("has an HTML entry file", async () => {
    await access(path.join(ADDON_DIR, "canvas.html"));
  });

  it("has a CSS file", async () => {
    await access(path.join(ADDON_DIR, "canvas.css"));
  });

  it("has a JS file", async () => {
    await access(path.join(ADDON_DIR, "canvas.js"));
  });

  it("HTML references the CSS and JS files", async () => {
    const html = await readFile(path.join(ADDON_DIR, "canvas.html"), "utf8");
    assert.ok(html.includes("canvas.css"), "HTML should reference CSS");
    assert.ok(html.includes("canvas.js"), "HTML should reference JS");
  });

  it("manifest trust is host-mediated", async () => {
    const raw = await readFile(path.join(ADDON_DIR, "addon.json"), "utf8");
    const manifest = JSON.parse(raw);
    assert.equal(manifest.trust, "host-mediated");
  });

  it("HTML contains a canvas element reference", async () => {
    const html = await readFile(path.join(ADDON_DIR, "canvas.html"), "utf8");
    assert.ok(
      html.includes("<canvas") || html.includes("canvas-surface") || html.includes("id=\"canvas\""),
      "HTML should contain a canvas element or canvas container"
    );
  });

  it("manifest capabilities include canvas", async () => {
    const raw = await readFile(path.join(ADDON_DIR, "addon.json"), "utf8");
    const manifest = JSON.parse(raw);
    assert.ok(Array.isArray(manifest.capabilities));
    assert.ok(manifest.capabilities.includes("canvas"), "Should require canvas capability");
  });

  it("manifest entry matches the HTML filename", async () => {
    const raw = await readFile(path.join(ADDON_DIR, "addon.json"), "utf8");
    const manifest = JSON.parse(raw);
    assert.equal(manifest.entry, "canvas.html");
  });
});
