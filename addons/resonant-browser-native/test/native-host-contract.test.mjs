import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const addonRoot = path.resolve(import.meta.dirname, "..");

test("native Browser host source satisfies the ADR-025 contract markers", async () => {
  const { stdout } = await execFileAsync("node", [path.join(addonRoot, "scripts", "probe-native-host.mjs")], {
    cwd: addonRoot,
  });
  const result = JSON.parse(stdout);

  assert.equal(result.hostId, "resonant-browser-native");
  assert.equal(result.engineCandidate, "cef-chrome-runtime");
  assert.equal(result.sourceContractOk, true);
  assert.deepEqual(result.failures, []);
});

test("bundled Browser add-on manifest stays aligned with the native product path", async () => {
  const { stdout } = await execFileAsync("node", [path.join(addonRoot, "scripts", "audit-browser-addon-drift.mjs")], {
    cwd: addonRoot,
  });
  const result = JSON.parse(stdout);

  assert.equal(result.driftAuditOk, true);
  assert.equal(result.addonId, "addon.browser");
  assert.equal(result.protocol, "host-command");
});
