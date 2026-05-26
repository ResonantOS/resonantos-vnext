// Intent citation: docs/architecture/ADR-035-electron-host-rust-core-runtime.md
//
// Electron host spike for ResonantOS. This is a migration proof, not the
// production shell. It intentionally keeps browser control typed and narrow.

import { createServer } from "node:http";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { app, BrowserWindow, session } from "electron";

const PHANTOM_EXTENSION_ID = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const MAX_TEXT_CHARS = 12000;

function jsonLine(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function safeHttpUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Electron host spike only accepts http and https URLs.");
  }
  return parsed.toString();
}

function findLocalPhantomExtensionDir() {
  if (process.env.RESONANTOS_PHANTOM_EXTENSION_DIR) {
    const override = path.resolve(process.env.RESONANTOS_PHANTOM_EXTENSION_DIR);
    if (existsSync(path.join(override, "manifest.json"))) {
      return override;
    }
  }

  const root = path.join(
    process.env.HOME ?? "",
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    "Default",
    "Extensions",
    PHANTOM_EXTENSION_ID,
  );
  if (!existsSync(root)) {
    return null;
  }
  const versions = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(root, name, "manifest.json")))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  return versions[0] ? path.join(root, versions[0]) : null;
}

async function startFixtureServer() {
  const server = createServer((request, response) => {
    const headers = {
      "content-type": "text/html",
      "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
    };
    if (request.url === "/dao") {
      response.writeHead(200, headers);
      response.end(`<!doctype html>
<html>
  <head><title>ResonantOS DAO Fixture</title></head>
  <body>
    <h1>ResonantOS DAO Fixture</h1>
    <p id="status">Waiting</p>
    <button id="connect" onclick="document.querySelector('#status').textContent='Clicked DAO connect'">Connect Wallet</button>
    <input id="memo" oninput="document.querySelector('#typed').textContent=this.value" />
    <p id="typed"></p>
    <script>
      window.__phantomReady = false;
      const check = () => {
        const provider = globalThis.phantom?.solana || globalThis.solana;
        window.__phantomReady = Boolean(provider?.isPhantom);
        document.body.dataset.phantomReady = String(window.__phantomReady);
      };
      setInterval(check, 250);
      check();
    </script>
  </body>
</html>`);
      return;
    }

    response.writeHead(200, headers);
    response.end(`<!doctype html>
<html>
  <head><title>ResonantOS Electron Host Fixture</title></head>
  <body>
    <h1>ResonantOS Electron Host Fixture</h1>
    <p id="status">Waiting</p>
    <button id="change-status" onclick="document.querySelector('#status').textContent='Clicked'">Change status</button>
    <input id="field" oninput="document.querySelector('#typed').textContent=this.value" />
    <p id="typed"></p>
  </body>
</html>`);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function createWindow(url) {
  const userData = await mkdtemp(path.join(tmpdir(), "resonantos-electron-host-"));
  app.setPath("userData", userData);
  await app.whenReady();

  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    backgroundColor: "#101112",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  await window.loadURL(safeHttpUrl(url));
  return window;
}

async function readPage(window) {
  return window.webContents.executeJavaScript(
    `(() => ({
      title: document.title,
      url: location.href,
      text: (document.body?.innerText ?? "").slice(0, ${MAX_TEXT_CHARS}),
      nodeAvailable: typeof process !== "undefined" || typeof require !== "undefined",
      isolated: typeof window.electron !== "object"
    }))()`,
    true,
  );
}

async function click(window, selector) {
  return window.webContents.executeJavaScript(
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.click();
      return true;
    })()`,
    true,
  );
}

async function type(window, selector, text) {
  return window.webContents.executeJavaScript(
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element || !("value" in element)) return false;
      element.focus();
      element.value = ${JSON.stringify(text)};
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(text)} }));
      return true;
    })()`,
    true,
  );
}

async function loadPhantomIfPresent() {
  await app.whenReady();
  const phantomDir = findLocalPhantomExtensionDir();
  if (!phantomDir) {
    return { loaded: false, reason: "local Phantom extension directory not found" };
  }
  const extension = session.defaultSession.extensions?.loadExtension
    ? await session.defaultSession.extensions.loadExtension(phantomDir, { allowFileAccess: false })
    : await session.defaultSession.loadExtension(phantomDir, { allowFileAccess: false });
  return {
    loaded: true,
    extensionId: extension.id,
    name: extension.name,
    version: extension.version,
    path: phantomDir,
  };
}

async function waitForPhantom(window) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(
      `Boolean((globalThis.phantom?.solana || globalThis.solana)?.isPhantom)`,
      true,
    );
    if (ready) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function runSmoke() {
  const fixture = await startFixtureServer();
  let window;
  try {
    const phantom = await loadPhantomIfPresent();
    window = await createWindow(`${fixture.baseUrl}/`);
    const initial = await readPage(window);
    const clicked = await click(window, "#change-status");
    const typed = await type(window, "#field", "Augmentor controls Electron Chromium");
    const after = await readPage(window);
    const screenshotPath = path.join(tmpdir(), `resonantos-electron-host-${Date.now()}.png`);
    const png = await window.webContents.capturePage();
    await writeFile(screenshotPath, png.toPNG());
    const screenshotStats = await stat(screenshotPath);

    await window.loadURL(`${fixture.baseUrl}/dao`);
    const phantomProviderDetected = phantom.loaded ? await waitForPhantom(window) : false;

    jsonLine({
      ok: true,
      engine: "electron-chromium",
      security: {
        nodeAvailableInPage: initial.nodeAvailable,
        contextIsolationExpected: true,
        sandboxExpected: true,
      },
      browser: {
        loadedTitle: initial.title,
        clicked,
        typed,
        afterText: after.text,
        screenshotPath,
        screenshotBytes: screenshotStats.size,
      },
      phantom: {
        ...phantom,
        providerDetected: phantomProviderDetected,
      },
    });
  } finally {
    if (window && !window.isDestroyed()) {
      window.close();
    }
    await new Promise((resolve) => fixture.server.close(resolve));
    app.quit();
  }
}

if (process.argv.includes("--smoke")) {
  runSmoke().catch((error) => {
    jsonLine({ ok: false, error: error instanceof Error ? error.stack : String(error) });
    app.quit();
    process.exitCode = 1;
  });
}
