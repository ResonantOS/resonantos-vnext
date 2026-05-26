// Intent citation: docs/architecture/ADR-017-resonant-browser-addon.md
// Intent citation: docs/architecture/ADR-018-addon-sdk-v0.md

import { stat } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const DEFAULT_HOME_URL = "https://resonantos.com";
const DEFAULT_BOUNDS = { width: 1440, height: 1000 };
const ENTRYPOINT_PATH = fileURLToPath(import.meta.url);
const MAX_TEXT_CHARS = 12000;
const MAX_LINKS = 80;

export const ELECTRON_BROWSER_MENU_LABELS = [
  "File",
  "Edit",
  "View",
  "History",
  "Bookmarks",
  "Profiles",
  "Tab",
  "Window",
  "Help",
];

function nowIso() {
  return new Date().toISOString();
}

function createSessionId() {
  return `electron-browser-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function assertSafeHttpUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Electron Browser host only accepts valid http or https URLs.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Electron Browser host only accepts http and https URLs.");
  }

  return parsed.toString();
}

function sanitizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
}

async function assertExtensionDirectory(path) {
  if (!path || typeof path !== "string") {
    throw new Error("Extension loading requires an unpacked extension directory path.");
  }
  const stats = await stat(path);
  if (!stats.isDirectory()) {
    throw new Error(`Extension path is not a directory: ${path}`);
  }
  return realpathSync(path);
}

export function toBrowserExtensionState(extension, pinned = false) {
  return {
    extensionId: String(extension?.id ?? ""),
    name: String(extension?.name ?? extension?.id ?? "Unnamed extension"),
    version: String(extension?.version ?? "unknown"),
    installed: true,
    pinned,
    enabled: true,
    source: "local-unpacked",
    requestedCapabilities: Array.isArray(extension?.permissions) ? extension.permissions : [],
  };
}

export function createApplicationMenuTemplate(actions = {}) {
  return [
    {
      label: "File",
      submenu: [
        { label: "New Tab", accelerator: "CmdOrCtrl+T", click: actions.newTab },
        { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: actions.closeTab },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "History",
      submenu: [
        { label: "Back", accelerator: "CmdOrCtrl+[", click: actions.back },
        { label: "Forward", accelerator: "CmdOrCtrl+]", click: actions.forward },
      ],
    },
    {
      label: "Bookmarks",
      submenu: [
        { label: "ResonantOS", click: () => actions.openUrl?.(DEFAULT_HOME_URL) },
        { label: "Google", click: () => actions.openUrl?.("https://google.com") },
        { label: "Chrome Web Store", click: () => actions.openUrl?.("https://chromewebstore.google.com/category/extensions") },
      ],
    },
    {
      label: "Profiles",
      submenu: [{ label: "Default Resonant Browser Profile", enabled: false }],
    },
    {
      label: "Tab",
      submenu: [
        { label: "New Tab", accelerator: "CmdOrCtrl+T", click: actions.newTab },
        { label: "Reload Tab", accelerator: "CmdOrCtrl+R", click: actions.reload },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Resonant Browser",
          click: actions.about,
        },
      ],
    },
  ];
}

export class ResonantElectronBrowserHost {
  constructor(options = {}) {
    this.electronApi = options.electronApi ?? null;
    this.window = null;
    this.sessionId = null;
    this.audit = [];
    this.pinnedExtensionIds = new Set();
  }

  record(event, details = {}) {
    const entry = {
      at: nowIso(),
      event,
      sessionId: this.sessionId,
      details,
    };
    this.audit.push(entry);
    return entry;
  }

  recentAudit() {
    return this.audit.slice(-80);
  }

  async electron() {
    if (this.electronApi) {
      return this.electronApi;
    }
    if (!process.versions.electron) {
      throw new Error("Electron Browser host must be launched by Electron, not plain Node.");
    }
    this.electronApi = await import("electron");
    return this.electronApi;
  }

  async start(params = {}) {
    if (this.window && !this.window.isDestroyed?.()) {
      if (params.defaultUrl) {
        return this.openUrl({ url: params.defaultUrl });
      }
      return this.health();
    }

    const electron = await this.electron();
    await electron.app.whenReady();
    this.sessionId = createSessionId();

    const actions = {
      openUrl: (url) => void this.openUrl({ url }),
      back: () => void this.back(),
      forward: () => void this.forward(),
      reload: () => void this.reload(),
      newTab: () => void this.openUrl({ url: DEFAULT_HOME_URL }),
      closeTab: () => void this.close(),
      about: () => this.record("menu.about", { product: "Resonant Browser" }),
    };
    const menu = electron.Menu.buildFromTemplate(createApplicationMenuTemplate(actions));
    electron.Menu.setApplicationMenu(menu);

    const bounds = params.bounds ?? DEFAULT_BOUNDS;
    this.window = new electron.BrowserWindow({
      width: bounds.width ?? DEFAULT_BOUNDS.width,
      height: bounds.height ?? DEFAULT_BOUNDS.height,
      title: "Resonant Browser",
      backgroundColor: "#101112",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    this.window.webContents.setZoomFactor(1);
    this.record("electron.window.created", { engine: "electron-chromium" });
    await this.openUrl({ url: params.defaultUrl ?? DEFAULT_HOME_URL });
    return this.health();
  }

  requireWindow() {
    if (!this.window || this.window.isDestroyed?.()) {
      throw new Error("Electron Browser session is not started.");
    }
    return this.window;
  }

  async openUrl(params = {}) {
    const window = this.requireWindow();
    const url = assertSafeHttpUrl(params.url ?? DEFAULT_HOME_URL);
    await window.loadURL(url);
    const title = window.webContents.getTitle();
    const finalUrl = window.webContents.getURL();
    window.webContents.setZoomFactor(1);
    this.record("page.opened", { requestedUrl: url, finalUrl, title });
    return {
      sessionId: this.sessionId,
      finalUrl,
      title,
      status: "loaded",
      engine: "electron-chromium",
      audit: this.recentAudit(),
    };
  }

  async readPage(params = {}) {
    const window = this.requireWindow();
    const result = await window.webContents.executeJavaScript(
      `(() => {
        const selector = ${JSON.stringify(params.selector ?? null)};
        const root = selector ? document.querySelector(selector) : document.body;
        const text = (root?.innerText ?? document.body?.innerText ?? "").slice(0, ${MAX_TEXT_CHARS});
        const links = Array.from(document.querySelectorAll("a[href]"))
          .slice(0, ${MAX_LINKS})
          .map((link) => ({
            label: (link.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 160),
            href: link.href,
          }));
        return { text, links };
      })()`,
      true,
    );
    const payload = {
      sessionId: this.sessionId,
      finalUrl: window.webContents.getURL(),
      title: window.webContents.getTitle(),
      text: sanitizeText(result?.text),
      links: Array.isArray(result?.links) ? result.links : [],
      audit: this.recentAudit(),
    };
    this.record("page.read", { url: payload.finalUrl, selector: params.selector ?? null, textChars: payload.text.length });
    return { ...payload, audit: this.recentAudit() };
  }

  async click(params = {}) {
    const window = this.requireWindow();
    if (params.selector) {
      const clicked = await window.webContents.executeJavaScript(
        `(() => {
          const element = document.querySelector(${JSON.stringify(params.selector)});
          if (!element) return false;
          element.scrollIntoView({ block: "center", inline: "center" });
          element.click();
          return true;
        })()`,
        true,
      );
      if (!clicked) {
        throw new Error(`Visible Browser could not find selector to click: ${params.selector}`);
      }
      this.record("page.clicked", { selector: params.selector });
    } else if (Number.isFinite(params.x) && Number.isFinite(params.y)) {
      window.webContents.sendInputEvent({ type: "mouseDown", x: params.x, y: params.y, button: "left", clickCount: 1 });
      window.webContents.sendInputEvent({ type: "mouseUp", x: params.x, y: params.y, button: "left", clickCount: 1 });
      this.record("page.clicked", { x: params.x, y: params.y });
    } else {
      throw new Error("Click requires either selector or x/y coordinates.");
    }
    return this.health();
  }

  async type(params = {}) {
    const window = this.requireWindow();
    if (!params.selector) {
      throw new Error("Type requires a selector.");
    }
    if (typeof params.text !== "string") {
      throw new Error("Type requires text.");
    }
    const typed = await window.webContents.executeJavaScript(
      `(() => {
        const element = document.querySelector(${JSON.stringify(params.selector)});
        if (!element) return false;
        element.scrollIntoView({ block: "center", inline: "center" });
        element.focus();
        const value = ${JSON.stringify(params.text)};
        if ("value" in element) {
          element.value = value;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          element.textContent = value;
          element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
        }
        return true;
      })()`,
      true,
    );
    if (!typed) {
      throw new Error(`Visible Browser could not find selector to type into: ${params.selector}`);
    }
    this.record("page.typed", { selector: params.selector, chars: params.text.length, sensitive: Boolean(params.sensitive) });
    return this.health();
  }

  async back() {
    const window = this.requireWindow();
    if (window.webContents.canGoBack()) {
      window.webContents.goBack();
      this.record("page.back", {});
    }
    return this.health();
  }

  async forward() {
    const window = this.requireWindow();
    if (window.webContents.canGoForward()) {
      window.webContents.goForward();
      this.record("page.forward", {});
    }
    return this.health();
  }

  async reload() {
    const window = this.requireWindow();
    window.webContents.reload();
    this.record("page.reload", {});
    return this.health();
  }

  async listExtensions() {
    const electron = await this.electron();
    const extensions =
      typeof electron.session.defaultSession.getAllExtensions === "function"
        ? electron.session.defaultSession.getAllExtensions()
        : [];
    return {
      sessionId: this.sessionId,
      extensions: extensions.map((extension) => toBrowserExtensionState(extension, this.pinnedExtensionIds.has(extension.id))),
      audit: this.recentAudit(),
    };
  }

  async loadUnpackedExtension(params = {}) {
    const electron = await this.electron();
    const extensionPath = await assertExtensionDirectory(params.path);
    const extension = await electron.session.defaultSession.loadExtension(extensionPath, {
      allowFileAccess: Boolean(params.allowFileAccess),
    });
    if (params.pinned) {
      this.pinnedExtensionIds.add(extension.id);
    }
    this.record("extension.loaded", { extensionId: extension.id, name: extension.name, path: extensionPath, pinned: Boolean(params.pinned) });
    return {
      sessionId: this.sessionId,
      extension: toBrowserExtensionState(extension, Boolean(params.pinned)),
      audit: this.recentAudit(),
    };
  }

  async setExtensionPinned(params = {}) {
    if (!params.extensionId) {
      throw new Error("Pinning an extension requires extensionId.");
    }
    if (params.pinned === false) {
      this.pinnedExtensionIds.delete(params.extensionId);
    } else {
      this.pinnedExtensionIds.add(params.extensionId);
    }
    this.record("extension.pin.updated", { extensionId: params.extensionId, pinned: params.pinned !== false });
    return this.listExtensions();
  }

  async disableExtension(params = {}) {
    if (!params.extensionId) {
      throw new Error("Disabling an extension requires extensionId.");
    }
    const electron = await this.electron();
    if (typeof electron.session.defaultSession.removeExtension !== "function") {
      throw new Error("Electron runtime does not expose extension removal.");
    }
    electron.session.defaultSession.removeExtension(params.extensionId);
    this.pinnedExtensionIds.delete(params.extensionId);
    this.record("extension.disabled", { extensionId: params.extensionId });
    return this.listExtensions();
  }

  async health() {
    const active = this.window && !this.window.isDestroyed?.();
    return {
      ready: Boolean(active),
      sessionId: this.sessionId,
      engine: "electron-chromium",
      url: active ? this.window.webContents.getURL() : null,
      title: active ? this.window.webContents.getTitle() : null,
      menuLabels: ELECTRON_BROWSER_MENU_LABELS,
      extensionSupport: "local-unpacked",
      audit: this.recentAudit(),
    };
  }

  async close() {
    const sessionId = this.sessionId;
    if (this.window && !this.window.isDestroyed?.()) {
      this.window.close();
    }
    this.record("electron.window.closed", { sessionId });
    this.window = null;
    this.sessionId = null;
    return {
      sessionId,
      closed: true,
      audit: this.recentAudit(),
    };
  }

  async quitRuntime() {
    if (!process.versions.electron) {
      return;
    }
    const electron = await this.electron();
    electron.app.quit();
  }
}

const methodMap = {
  "browser.start": "start",
  "browser.open_url": "openUrl",
  "browser.read_page": "readPage",
  "browser.click": "click",
  "browser.type": "type",
  "browser.back": "back",
  "browser.forward": "forward",
  "browser.reload": "reload",
  "browser.extensions.list": "listExtensions",
  "browser.extensions.load_unpacked": "loadUnpackedExtension",
  "browser.extensions.set_pinned": "setExtensionPinned",
  "browser.extensions.disable": "disableExtension",
  "browser.health": "health",
  "browser.close": "close",
  "browser.close_session": "close",
};

export async function handleElectronJsonRpcLine(host, line) {
  const request = JSON.parse(line);
  const method = methodMap[request.method];
  if (!method || typeof host[method] !== "function") {
    throw new Error(`Unknown Electron Browser host method: ${request.method}`);
  }
  return {
    id: request.id ?? null,
    result: await host[method](request.params ?? {}),
  };
}

async function runStdioServer() {
  const host = new ResonantElectronBrowserHost();
  const input = createInterface({ input: process.stdin, terminal: false });

  for await (const line of input) {
    if (!line.trim()) {
      continue;
    }
    try {
      const response = await handleElectronJsonRpcLine(host, line);
      process.stdout.write(`${JSON.stringify(response)}\n`);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({
          id: null,
          error: { message: error instanceof Error ? error.message : String(error) },
        })}\n`,
      );
    }
  }

  await host.close().catch(() => undefined);
  await host.quitRuntime().catch(() => undefined);
}

if (process.argv.some((argument) => argument === ENTRYPOINT_PATH || argument.endsWith("/electron-visible-host.mjs"))) {
  runStdioServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
