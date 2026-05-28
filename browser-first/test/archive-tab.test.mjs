/**
 * archive-tab.test.mjs
 *
 * Tests for archive-tab.js — Living Archive sidecar tab.
 * Verifies bridge auth header inclusion and structural contracts.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, "../resonantos-side-panel-extension/src/archive-tab.js");

async function readSrc() {
  return readFile(srcPath, "utf8");
}

test("archive-tab.js reads BRIDGE_URL and BRIDGE_TOKEN from __RESONANTOS_BRIDGE_CONFIG__", async () => {
  const src = await readSrc();
  assert.match(src, /__RESONANTOS_BRIDGE_CONFIG__/);
  assert.match(src, /BRIDGE_URL/);
  assert.match(src, /BRIDGE_TOKEN/);
});

test("archive-tab.js bridgeRequest includes X-ResonantOS-Bridge-Token auth header", async () => {
  const src = await readSrc();
  assert.match(src, /X-ResonantOS-Bridge-Token/);
  assert.match(
    src,
    /BRIDGE_TOKEN\s*\?\s*\{\s*["']X-ResonantOS-Bridge-Token["']\s*:\s*BRIDGE_TOKEN/
  );
});

test("archive-tab.js retries bridge requests on network errors", async () => {
  const src = await readSrc();
  assert.match(src, /Failed to fetch/);
  assert.match(src, /NetworkError/);
});

test("archive-tab.js defines el() DOM helper for safe element creation", async () => {
  const src = await readSrc();
  assert.match(src, /const el\s*=/);
  assert.match(src, /createElement/);
});

test("archive-tab.js escapeHtml present to prevent XSS", async () => {
  const src = await readSrc();
  assert.match(src, /escapeHtml/);
});

test("archive-tab.js references /archive or /memories bridge route", async () => {
  const src = await readSrc();
  assert.match(src, /\/archive|\/memories|\/entries/);
});

test("archive-tab.js getWalletAddr reads walletAddress from chrome.storage", async () => {
  const src = await readSrc();
  assert.match(src, /getWalletAddr/);
  assert.match(src, /walletAddress/);
});
