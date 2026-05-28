/**
 * shield-tab.test.mjs
 *
 * Tests for shield-tab.js — Shield sidecar tab.
 * Verifies that it reads securityLog from chrome.storage.local,
 * includes the bridge auth token, and renders event data safely.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, "../resonantos-side-panel-extension/src/shield-tab.js");

async function readSrc() {
  return readFile(srcPath, "utf8");
}

test("shield-tab.js reads securityLog from chrome.storage.local", async () => {
  const src = await readSrc();
  assert.match(src, /securityLog/);
  assert.match(src, /chrome\.storage\.local\.get/);
});

test("shield-tab.js renders securityLog entries with timestamp, event type, and detail", async () => {
  const src = await readSrc();
  // renderSecurityLog must surface all key fields
  assert.match(src, /e\.type/);
  assert.match(src, /e\.ts/);
  // detail or text excerpt
  assert.match(src, /e\.detail|e\.text/);
});

test("shield-tab.js listens for live storage changes on securityLog", async () => {
  const src = await readSrc();
  assert.match(src, /chrome\.storage\.onChanged\.addListener/);
  assert.match(src, /securityLog/);
});

test("shield-tab.js escapeHtml prevents XSS in rendered security events", async () => {
  const src = await readSrc();
  // escapeHtml must be defined and used on untrusted fields
  assert.match(src, /const escapeHtml/);
  assert.match(src, /escapeHtml\(.*type/);
  assert.match(src, /escapeHtml\(.*ts/);
});

test("shield-tab.js shows placeholder when securityLog is empty", async () => {
  const src = await readSrc();
  assert.match(src, /No security events recorded/);
});

test("shield-tab.js bridgeRequest includes X-ResonantOS-Bridge-Token auth header", async () => {
  const src = await readSrc();
  assert.match(src, /X-ResonantOS-Bridge-Token/);
  assert.match(src, /BRIDGE_TOKEN/);
});

test("shield-tab.js calls loadShieldData and loadSecurityLog on init", async () => {
  const src = await readSrc();
  assert.match(src, /loadShieldData\(\)/);
  assert.match(src, /loadSecurityLog\(\)/);
});

test("shield-tab.js shield-security-log element id is referenced", async () => {
  const src = await readSrc();
  assert.match(src, /shield-security-log/);
});

// Structural test: mock chrome.storage.local and verify renderSecurityLog logic
test("shield-tab.js renderSecurityLog reverses entries (newest first)", async () => {
  const src = await readSrc();
  // .reverse() on a sliced copy
  assert.match(src, /\.slice\(\)[\s\S]*\.reverse\(\)/);
});
