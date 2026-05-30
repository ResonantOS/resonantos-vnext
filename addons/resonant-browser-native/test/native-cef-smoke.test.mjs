import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function smokeProfileArgs(name) {
  const profileRoot = path.join(tmpdir(), `resonantos-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(profileRoot, { recursive: true });
  return {
    args: [`--resonantos-user-data-dir=${profileRoot}`],
    cleanup: () => rmSync(profileRoot, { force: true, recursive: true }),
  };
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
    const profile = smokeProfileArgs("cef-page-smoke");
    try {
      const { stdout } = await execFileAsync(hostBinary, ["--resonantos-smoke", "--url=https://example.com", ...profile.args], {
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
    } finally {
      profile.cleanup();
    }
  },
);

test(
  "native CEF Chrome Runtime host records extension entrypoint readiness",
  { skip: !existsSync(hostBinary) && "Build the native host before running the CEF extension smoke test." },
  async () => {
    const profile = smokeProfileArgs("cef-extension-entrypoint-smoke");
    try {
      const { stdout } = await execFileAsync(hostBinary, ["--resonantos-extension-entrypoint-smoke", ...profile.args], {
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
    } finally {
      profile.cleanup();
    }
  },
);

test(
  "native CEF Chrome Runtime host saves downloads through ResonantOS download policy",
  { skip: !existsSync(hostBinary) && "Build the native host before running the CEF download smoke test." },
  async () => {
    const body = "resonantos download smoke\n";
    const server = createServer((request, response) => {
      if (request.url === "/download.txt") {
        response.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
          "Content-Disposition": 'attachment; filename="resonantos-download-smoke.txt"',
        });
        response.end(body);
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>download smoke</title>");
    });
    const address = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const downloadDir = path.join(tmpdir(), `resonantos-download-smoke-${Date.now()}`);
    const profile = smokeProfileArgs("cef-download-smoke");
    rmSync(downloadDir, { force: true, recursive: true });
    mkdirSync(downloadDir, { recursive: true });

    try {
      const { stdout } = await execFileAsync(
        hostBinary,
        [
          "--resonantos-download-smoke",
          `--url=${baseUrl}/`,
          `--resonantos-download-url=${baseUrl}/download.txt`,
          `--resonantos-download-dir=${downloadDir}`,
          ...profile.args,
        ],
        {
          cwd: addonRoot,
          timeout: 30000,
          maxBuffer: 1024 * 1024 * 2,
        },
      );

      const events = parseJsonEvents(stdout);
      assert.ok(
        events.some((event) => event.event === "browser.native.download_smoke_started"),
        "Download smoke must start explicitly.",
      );
      assert.ok(
        events.some((event) => event.event === "browser.native.download_can_download" && event.allowed),
        "Download policy must explicitly allow the download.",
      );
      const before = events.find((event) => event.event === "browser.native.download_before");
      assert.ok(before, "Download handler must set a ResonantOS-owned target path.");
      assert.equal(path.dirname(before.path), downloadDir);
      const completed = events.find((event) => event.event === "browser.native.download_updated" && event.complete);
      assert.ok(completed, "Download handler must emit a completed download event.");
      assert.equal(readFileSync(path.join(downloadDir, "resonantos-download-smoke.txt"), "utf8"), body);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      rmSync(downloadDir, { force: true, recursive: true });
      profile.cleanup();
    }
  },
);

test(
  "native CEF Chrome Runtime host denies privileged page permissions by default",
  { skip: !existsSync(hostBinary) && "Build the native host before running the CEF permission smoke test." },
  async () => {
    const server = createServer((request, response) => {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <title>permission-smoke</title>
        <script>
          navigator.geolocation.getCurrentPosition(
            () => { document.title = "permission-allowed"; },
            (error) => { document.title = "permission-denied-" + error.code; }
          );
        </script>`);
    });
    const address = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const profile = smokeProfileArgs("cef-permission-smoke");

    try {
      const { stdout } = await execFileAsync(
        hostBinary,
        ["--resonantos-permission-smoke", `--url=${baseUrl}/`, ...profile.args],
        {
          cwd: addonRoot,
          timeout: 30000,
          maxBuffer: 1024 * 1024 * 2,
        },
      );

      const events = parseJsonEvents(stdout);
      assert.ok(
        events.some((event) => event.event === "browser.native.permission_smoke_started"),
        "Permission smoke must start explicitly.",
      );
      assert.ok(
        events.some((event) => event.event === "browser.native.permission.prompt" && event.decision === "deny"),
        "Permission prompts must be mediated and denied by default.",
      );
      assert.ok(
        events.some((event) => event.event === "browser.native.permission.dismissed" && event.result === "deny"),
        "Permission prompts must close with a denied result.",
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      profile.cleanup();
    }
  },
);

test(
  "native CEF Chrome Runtime host exposes real page context menus",
  { skip: !existsSync(hostBinary) && "Build the native host before running the CEF context-menu smoke test." },
  async () => {
    const server = createServer((request, response) => {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <title>context-menu-smoke</title>
        <style>
          body { margin: 0; }
          a { display: block; position: absolute; left: 20px; top: 20px; width: 220px; height: 42px; }
        </style>
        <a id="target" href="/linked-target">Resonant linked target</a>`);
    });
    const address = await listen(server);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const profile = smokeProfileArgs("cef-context-menu-smoke");

    try {
      const { stdout } = await execFileAsync(
        hostBinary,
        ["--resonantos-context-menu-smoke", `--url=${baseUrl}/`, ...profile.args],
        {
          cwd: addonRoot,
          timeout: 30000,
          maxBuffer: 1024 * 1024 * 2,
        },
      );

      const events = parseJsonEvents(stdout);
      assert.ok(
        events.some((event) => event.event === "browser.native.context_menu_smoke_started"),
        "Context-menu smoke must start explicitly.",
      );
      const before = events.find((event) => event.event === "browser.native.context_menu.before");
      assert.ok(before, "Context-menu handler must observe the right-click target.");
      assert.equal(before.linkUrl, `${baseUrl}/linked-target`);
      assert.equal(before.pageUrl, `${baseUrl}/`);
      assert.equal(before.modelCount > 0, true);
      const run = events.find((event) => event.event === "browser.native.context_menu.run");
      assert.ok(run, "Context-menu display must run through the native handler.");
      assert.equal(run.modelCount > 0, true);
      assert.ok(
        run.items.some((item) => item.commandId === 50100 || item.commandId === 50104),
        "Link context menus must include Chromium link actions.",
      );
      assert.ok(
        events.some((event) => event.event === "browser.native.context_menu.dismissed"),
        "Context-menu smoke must dismiss the menu cleanly.",
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      profile.cleanup();
    }
  },
);

test(
  "native CEF Chrome Runtime host executes a local unpacked extension",
  { skip: !existsSync(hostBinary) && "Build the native host before running the CEF local extension smoke test." },
  async () => {
    const extensionRoot = path.join(tmpdir(), `resonant-browser-extension-smoke-${Date.now()}`);
    const profile = smokeProfileArgs("cef-local-extension-smoke");
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
        ...profile.args,
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
    profile.cleanup();
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
    const profile = smokeProfileArgs("cef-phantom-extension-smoke");
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
        ...profile.args,
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
    profile.cleanup();
  },
);
