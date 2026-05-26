import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const addonRoot = path.resolve(import.meta.dirname, "..");
const hostBinary = path.join(
  addonRoot,
  "build",
  "ResonantBrowserNativeHost.app",
  "Contents",
  "MacOS",
  "ResonantBrowserNativeHost",
);
const phantomExtensionRoot = path.join(
  process.env.HOME ?? "",
  "Library",
  "Application Support",
  "Google",
  "Chrome",
  "Default",
  "Extensions",
  "bfnaelmomeimhlpmgjnjophhpkkoljpa",
);

function parseJsonEvents(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"))
    .map((line) => JSON.parse(line));
}

function latestPhantomExtensionDir() {
  if (!phantomExtensionRoot || !existsSync(phantomExtensionRoot)) {
    return null;
  }
  const versions = readdirSync(phantomExtensionRoot)
    .filter((entry) => existsSync(path.join(phantomExtensionRoot, entry, "manifest.json")))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  return versions.length ? path.join(phantomExtensionRoot, versions[0]) : null;
}

test(
  "native CEF Chrome Runtime host initializes and loads a real page",
  { skip: !existsSync(hostBinary) && "Build the native host before running the CEF smoke test." },
  async () => {
    const { stdout } = await execFileAsync(hostBinary, ["--resonantos-smoke", "--url=https://example.com"], {
      cwd: addonRoot,
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    });

    const events = parseJsonEvents(stdout);
    assert.ok(
      events.some((event) => event.event === "browser.native.cef_initialize_ok"),
      "CEF must initialize before the smoke test can be trusted.",
    );

    const loadEnd = events.find((event) => event.event === "browser.native.load_end");
    assert.ok(loadEnd, "CEF smoke must emit a main-frame load_end event.");
    assert.equal(loadEnd.status, 200);
    assert.equal(loadEnd.url, "https://example.com/");
  },
);

test(
  "native CEF Chrome Runtime host records extension entrypoint readiness",
  { skip: !existsSync(hostBinary) && "Build the native host before running the CEF extension smoke test." },
  async () => {
    const { stdout } = await execFileAsync(hostBinary, ["--resonantos-extension-entrypoint-smoke"], {
      cwd: addonRoot,
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 2,
    });

    const events = parseJsonEvents(stdout);
    assert.ok(
      events.some((event) => event.event === "browser.native.cef_initialize_ok"),
      "CEF must initialize before extension entrypoint compatibility can be trusted.",
    );
    assert.ok(
      events.some((event) => event.event === "browser.native.extension_entrypoint_smoke_started"),
      "Extension entrypoint smoke must start explicitly.",
    );

    const verdict = events.find((event) => event.event === "browser.native.extension_entrypoints");
    assert.ok(verdict, "Extension entrypoint smoke must emit a final verdict.");
    assert.equal(verdict.chromeExtensionsLoaded, true);
    assert.ok(
      verdict.chromeWebStoreLoaded || verdict.chromeWebStoreConsentGate,
      "Chrome Web Store must either load directly or be identified as consent-gated.",
    );
    assert.match(verdict.verdict, /entrypoints-ready|chrome-web-store-consent-gated/);
  },
);

test(
  "native CEF Chrome Runtime host executes a local unpacked extension",
  { skip: !existsSync(hostBinary) && "Build the native host before running the CEF local extension smoke test." },
  async () => {
    const extensionRoot = path.join(tmpdir(), `resonant-browser-extension-smoke-${Date.now()}`);
    mkdirSync(extensionRoot, { recursive: true });
    writeFileSync(
      path.join(extensionRoot, "manifest.json"),
      JSON.stringify(
        {
          manifest_version: 3,
          name: "Resonant Browser Extension Smoke",
          version: "0.0.1",
          content_scripts: [
            {
              matches: ["https://example.com/*"],
              js: ["content.js"],
              run_at: "document_idle",
            },
          ],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(extensionRoot, "content.js"),
      `document.title = "resonant-extension-loaded";`,
    );

    const { stdout } = await execFileAsync(
      hostBinary,
      [
        "--resonantos-local-extension-smoke",
        `--resonantos-extension-dir=${extensionRoot}`,
        "--url=https://example.com",
      ],
      {
        cwd: addonRoot,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 2,
      },
    );

    const events = parseJsonEvents(stdout);
    assert.ok(
      events.some((event) => event.event === "browser.native.local_extension_smoke_started"),
      "Local extension smoke must start explicitly.",
    );
    const execution = events.find((event) => event.event === "browser.native.local_extension_execution");
    assert.ok(execution, "Local extension smoke must prove content script execution.");
    assert.equal(execution.contentScriptExecuted, true);
    assert.equal(execution.verdict, "local-extension-ready");
  },
);

test(
  "native CEF Chrome Runtime host loads Phantom and injects the Solana provider",
  {
    skip:
      !existsSync(hostBinary) || !latestPhantomExtensionDir()
        ? "Build the native host and install Phantom in Chrome before running the Phantom CEF smoke test."
        : false,
  },
  async () => {
    const extensionRoot = latestPhantomExtensionDir();
    const manifest = JSON.parse(readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
    assert.equal(manifest.name, "Phantom");
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.equal(manifest.manifest_version, 3);
    assert.ok(
      manifest.content_scripts?.some(
        (script) =>
          script.matches?.includes("https://*/*") &&
          script.js?.includes("solana.js") &&
          script.js?.includes("phantom.js"),
      ),
      "Phantom manifest must declare the HTTPS Solana provider content scripts.",
    );

    const { stdout } = await execFileAsync(
      hostBinary,
      [
        "--resonantos-phantom-extension-smoke",
        `--resonantos-extension-dir=${extensionRoot}`,
        "--url=https://example.com",
      ],
      {
        cwd: addonRoot,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 2,
      },
    );

    const events = parseJsonEvents(stdout);
    assert.ok(
      events.some((event) => event.event === "browser.native.phantom_extension_smoke_started"),
      "Phantom smoke must start explicitly.",
    );
    const detection = events.find((event) => event.event === "browser.native.phantom_provider_detection");
    assert.ok(detection, "Phantom smoke must emit provider detection.");
    assert.equal(detection.extensionId, "bfnaelmomeimhlpmgjnjophhpkkoljpa");
    assert.equal(detection.providerInjected, true);
    assert.equal(detection.verdict, "phantom-provider-ready");
  },
);
