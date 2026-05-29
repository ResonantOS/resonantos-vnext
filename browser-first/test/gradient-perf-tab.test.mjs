/**
 * gradient-perf-tab.test.mjs
 *
 * Structural tests for the gradient-perf addon.
 * Verifies manifest integrity, required files, HTML contract, and JS structure.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ADDON_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "addons", "gradient-perf");

describe("gradient-perf addon", () => {
  it("has a valid addon.json manifest", async () => {
    const raw = await readFile(path.join(ADDON_DIR, "addon.json"), "utf8");
    const manifest = JSON.parse(raw);
    assert.equal(manifest.id, "addon.gradient-perf");
    assert.ok(manifest.name);
    assert.ok(manifest.version);
    assert.ok(manifest.description);
    assert.ok(manifest.mode);
    assert.ok(manifest.trust);
    assert.ok(manifest.boundary);
    assert.ok(manifest.entry);
  });

  it("has an HTML entry file", async () => {
    await access(path.join(ADDON_DIR, "gradient-perf.html"));
  });

  it("has a CSS file", async () => {
    await access(path.join(ADDON_DIR, "gradient-perf.css"));
  });

  it("has a JS file", async () => {
    await access(path.join(ADDON_DIR, "gradient-perf.js"));
  });

  it("HTML references the CSS and JS files", async () => {
    const html = await readFile(path.join(ADDON_DIR, "gradient-perf.html"), "utf8");
    assert.ok(html.includes("gradient-perf.css"), "HTML should reference CSS");
    assert.ok(html.includes("gradient-perf.js"), "HTML should reference JS");
  });

  it("manifest trust is host-mediated", async () => {
    const raw = await readFile(path.join(ADDON_DIR, "addon.json"), "utf8");
    const manifest = JSON.parse(raw);
    assert.equal(manifest.trust, "host-mediated");
  });

  it("manifest entry matches the HTML filename", async () => {
    const raw = await readFile(path.join(ADDON_DIR, "addon.json"), "utf8");
    const manifest = JSON.parse(raw);
    assert.equal(manifest.entry, "gradient-perf.html");
  });

  it("HTML has a CSP meta tag", async () => {
    const html = await readFile(path.join(ADDON_DIR, "gradient-perf.html"), "utf8");
    assert.ok(
      html.includes("Content-Security-Policy"),
      "HTML should include a CSP meta tag"
    );
  });

  it("HTML defines three tabs: Training, Benchmarks, Fleet Speed", async () => {
    const html = await readFile(path.join(ADDON_DIR, "gradient-perf.html"), "utf8");
    assert.ok(html.includes("training"),    "HTML should include training tab");
    assert.ok(html.includes("benchmarks"), "HTML should include benchmarks tab");
    assert.ok(html.includes("fleet-speed") || html.includes("Fleet Speed"), "HTML should include fleet-speed tab");
  });

  it("JS exports init, switchTab, renderTraining, renderBenchmarks, renderFleetSpeed, updateLastUpdated functions", async () => {
    const src = await readFile(path.join(ADDON_DIR, "gradient-perf.js"), "utf8");
    assert.ok(src.includes("function init("),          "JS should define init()");
    assert.ok(src.includes("function switchTab("),     "JS should define switchTab()");
    assert.ok(src.includes("function renderTraining("), "JS should define renderTraining()");
    assert.ok(src.includes("function renderBenchmarks("), "JS should define renderBenchmarks()");
    assert.ok(src.includes("function renderFleetSpeed("), "JS should define renderFleetSpeed()");
    assert.ok(src.includes("function updateLastUpdated("), "JS should define updateLastUpdated()");
  });

  it("JS contains auto-refresh logic", async () => {
    const src = await readFile(path.join(ADDON_DIR, "gradient-perf.js"), "utf8");
    assert.ok(src.includes("setInterval") || src.includes("refreshInterval"), "JS should include auto-refresh interval logic");
  });

  it("JS includes mock training run data", async () => {
    const src = await readFile(path.join(ADDON_DIR, "gradient-perf.js"), "utf8");
    assert.ok(src.includes("Ternary 1.5B") || src.includes("Ternary 7B"), "JS should include mock training run data");
  });

  it("JS includes benchmark comparison data", async () => {
    const src = await readFile(path.join(ADDON_DIR, "gradient-perf.js"), "utf8");
    assert.ok(src.includes("Fleet v3") || src.includes("GPT-4o"), "JS should include benchmark comparison data");
  });

  it("JS includes fleet speed per machine data", async () => {
    const src = await readFile(path.join(ADDON_DIR, "gradient-perf.js"), "utf8");
    assert.ok(src.includes("M4 Mac Mini") || src.includes("Guardian"), "JS should include fleet speed data");
  });
});
