/**
 * awareness-tab.test.mjs
 *
 * Tests for awareness-tab.js — R-Awareness sidecar tab.
 * Verifies bridge auth header inclusion and structural contracts.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, "../resonantos-side-panel-extension/src/awareness-tab.js");

async function readSrc() {
  return readFile(srcPath, "utf8");
}

test("awareness-tab.js reads BRIDGE_URL and BRIDGE_TOKEN from __RESONANTOS_BRIDGE_CONFIG__", async () => {
  const src = await readSrc();
  assert.match(src, /__RESONANTOS_BRIDGE_CONFIG__/);
  assert.match(src, /BRIDGE_URL/);
  assert.match(src, /BRIDGE_TOKEN/);
});

test("awareness-tab.js bridgeRequest includes X-ResonantOS-Bridge-Token auth header", async () => {
  const src = await readSrc();
  assert.match(src, /X-ResonantOS-Bridge-Token/);
  assert.match(
    src,
    /BRIDGE_TOKEN\s*\?\s*\{\s*["']X-ResonantOS-Bridge-Token["']\s*:\s*BRIDGE_TOKEN/
  );
});

test("awareness-tab.js retries bridge requests on network errors", async () => {
  const src = await readSrc();
  assert.match(src, /Failed to fetch/);
  assert.match(src, /NetworkError/);
});

test("awareness-tab.js defines el() DOM helper", async () => {
  const src = await readSrc();
  assert.match(src, /const el\s*=/);
  assert.match(src, /createElement/);
});

test("awareness-tab.js escapeHtml present to prevent XSS in rendered content", async () => {
  const src = await readSrc();
  assert.match(src, /escapeHtml/);
});

test("awareness-tab.js reads page context via content script read_page message (not bridge route)", async () => {
  const src = await readSrc();
  // awareness-tab reads context from content script, not a bridge endpoint
  assert.match(src, /resonantos\.browser_first\.content/);
  assert.match(src, /read_page/);
  assert.match(src, /resonantContext/);
});

test("awareness-tab.js getWalletAddr reads walletAddress from chrome.storage", async () => {
  const src = await readSrc();
  assert.match(src, /getWalletAddr/);
  assert.match(src, /walletAddress/);
});
