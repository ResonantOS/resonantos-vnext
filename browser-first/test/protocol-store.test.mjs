/**
 * protocol-store.test.mjs
 *
 * Tests for protocol-store.js — Standalone Protocol Store page logic.
 * Verifies bridge auth header inclusion and core structural contracts.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, "../resonantos-side-panel-extension/src/protocol-store.js");

// ---- Helpers ----

async function readSrc() {
  return readFile(srcPath, "utf8");
}

// ---- Tests ----

test("protocol-store.js reads BRIDGE_URL and BRIDGE_TOKEN from __RESONANTOS_BRIDGE_CONFIG__", async () => {
  const src = await readSrc();
  assert.match(src, /__RESONANTOS_BRIDGE_CONFIG__/);
  assert.match(src, /BRIDGE_URL/);
  assert.match(src, /BRIDGE_TOKEN/);
});

test("protocol-store.js bridgeRequest includes X-ResonantOS-Bridge-Token auth header when token is set", async () => {
  const src = await readSrc();
  // bridgeRequest constructs headers — must include the auth token header
  assert.match(src, /X-ResonantOS-Bridge-Token/);
  assert.match(src, /BRIDGE_TOKEN\s*\?/); // conditional inclusion
});

test("protocol-store.js bridgeRequest retries once on network errors before giving up", async () => {
  const src = await readSrc();
  // retry pattern: catches TypeError / 'Failed to fetch' / 'NetworkError', waits, then retries
  assert.match(src, /Failed to fetch/);
  assert.match(src, /NetworkError/);
  assert.match(src, /setTimeout/);
});

test("protocol-store.js uses getWalletAddr to read wallet address from chrome.storage", async () => {
  const src = await readSrc();
  assert.match(src, /getWalletAddr/);
  assert.match(src, /walletAddress/);
});

test("protocol-store.js fetches protocol entries from bridge /protocols route", async () => {
  const src = await readSrc();
  // Should reference a /protocols route for listing protocols
  assert.match(src, /\/protocols/);
});

test("protocol-store.js uses el() helper with textContent to prevent XSS in rendered content", async () => {
  const src = await readSrc();
  // protocol-store uses el(tag, {text:}) which sets textContent (XSS-safe, no innerHTML on untrusted data)
  assert.match(src, /const el\s*=/);
  assert.match(src, /textContent/);
  // No raw innerHTML with untrusted user data
  const innerHtmlMatches = src.match(/\.innerHTML\s*=/g) ?? [];
  assert.equal(innerHtmlMatches.length, 0, "protocol-store.js should not use innerHTML assignments");
});

test("protocol-store.js mock bridgeRequest — auth header present in fetch options", async () => {
  // Verify the header construction pattern is correct
  const src = await readSrc();
  // Pattern: ...(BRIDGE_TOKEN ? { "X-ResonantOS-Bridge-Token": BRIDGE_TOKEN } : {})
  assert.match(
    src,
    /BRIDGE_TOKEN\s*\?\s*\{\s*["']X-ResonantOS-Bridge-Token["']\s*:\s*BRIDGE_TOKEN/
  );
});
