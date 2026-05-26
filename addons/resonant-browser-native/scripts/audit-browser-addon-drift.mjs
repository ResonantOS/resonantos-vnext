import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const addonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(addonRoot, "..", "..");

const publicManifest = JSON.parse(await readFile(path.join(repoRoot, "public", "addons", "browser.json"), "utf8"));
const nativeContract = JSON.parse(await readFile(path.join(addonRoot, "native-browser-host.contract.json"), "utf8"));
const adr = await readFile(path.join(repoRoot, "docs", "architecture", "ADR-025-native-embedded-browser-host.md"), "utf8");

const serializedManifest = JSON.stringify(publicManifest);

assert.equal(publicManifest.id, "addon.browser");
assert.equal(publicManifest.runtimeType, "local-service");
assert.equal(publicManifest.service?.protocol, "host-command");
assert.equal(publicManifest.service?.entrypoint, "addons/resonant-browser-native/native-browser-host.contract.json");
assert.equal(publicManifest.service?.healthCommand, "browser.native.probe");
assert.equal(publicManifest.service?.shutdownCommand, "browser.native.close");

for (const rejected of nativeContract.rejectedForProduct) {
  assert.ok(serializedManifest.includes(rejected) === false, `Browser manifest still references rejected product path: ${rejected}`);
}

assert.ok(!/Electron/i.test(serializedManifest), "Browser manifest must not advertise Electron as the product Browser path.");
assert.ok(!/load_unpacked|unpacked/i.test(serializedManifest), "Browser manifest must not present local unpacked extension loading as the product install path.");

for (const command of nativeContract.commands) {
  assert.ok(adr.includes(command), `ADR-025 is missing native Browser command ${command}.`);
}

for (const expectedTool of [
  "browser.native.extension.install",
  "browser.native.extension.list",
  "browser.native.extension.pin",
  "browser.native.extension.disable",
]) {
  assert.ok(
    publicManifest.tools.some((tool) => tool.name === expectedTool),
    `Browser manifest is missing native extension tool ${expectedTool}.`,
  );
}

console.log(
  JSON.stringify(
    {
      driftAuditOk: true,
      addonId: publicManifest.id,
      protocol: publicManifest.service.protocol,
      nativeContract: publicManifest.service.entrypoint,
      checkedCommands: nativeContract.commands.length,
    },
    null,
    2,
  ),
);
