// Intent citation: docs/architecture/ADR-035-electron-host-rust-core-runtime.md
//
// Electron product-host scaffold for ResonantOS. This hosts the existing React
// shell and provides a real embedded Chromium BrowserView behind narrow IPC.

import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { app, BrowserView, BrowserWindow, dialog, ipcMain, session } from "electron";
import { runWalletBrowserCommand } from "./wallet-browser-host.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(__dirname, "preload.mjs");
const distIndex = path.join(repoRoot, "dist", "index.html");
const distRoot = path.join(repoRoot, "dist");
const DEFAULT_URL = "https://resonantos.com";
const PHANTOM_EXTENSION_ID = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const PHANTOM_POPUP_URL = `chrome-extension://${PHANTOM_EXTENSION_ID}/popup.html`;
const MAX_TEXT_CHARS = 12000;
const MAX_LINKS = 80;
const PROVIDER_IDS_WITH_ENV_FALLBACK = {
  "shared-minimax": "MINIMAX_API_KEY",
  "shared-openai": "OPENAI_API_KEY",
};

let mainWindow = null;
let browserView = null;
let browserSessionId = null;
let browserVisible = false;
let appStaticServer = null;
let browserNavigationQueue = Promise.resolve();
let floatingChatWindow = null;
const pinnedExtensionIds = new Set();
const loadedExtensionPaths = new Map();
let phantomAutoloadResult = null;
const productSmoke = process.argv.includes("--product-smoke");
const experimentalElectronPhantom = process.env.RESONANTOS_EXPERIMENTAL_ELECTRON_PHANTOM === "1";
if (productSmoke) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
}

function smokeLog(stage) {
  if (productSmoke) {
    process.stderr.write(`[electron-product-smoke] ${stage}\n`);
  }
}

async function waitForShellCondition(predicateSource, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const passed = await mainWindow.webContents.executeJavaScript(`Boolean((${predicateSource})())`, true).catch(() => false);
    if (passed) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function startSmokeFixtureServer() {
  const server = createServer((_, response) => {
    response.writeHead(200, {
      "content-type": "text/html",
      "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    });
    response.end(`<!doctype html>
<html>
  <head><title>ResonantOS Browser Fixture</title></head>
  <body>
    <h1>ResonantOS Browser Fixture</h1>
    <button id="fixture-button" onclick="document.body.dataset.clicked='true'">Click</button>
    <input id="fixture-input" />
  </body>
</html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function startDistStaticServer() {
  if (appStaticServer) {
    return appStaticServer;
  }
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const decodedPath = decodeURIComponent(requestUrl.pathname);
      const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
      const candidate = path.resolve(distRoot, relativePath);
      if (!candidate.startsWith(distRoot)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      const fileStats = await stat(candidate).catch(() => null);
      if (!fileStats?.isFile()) {
        const index = await readFile(distIndex);
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(index);
        return;
      }
      response.writeHead(200, {
        "content-type": contentTypeFor(candidate),
        "cache-control": "no-store",
      });
      createReadStream(candidate).pipe(response);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  appStaticServer = { server, url: `http://127.0.0.1:${address.port}/` };
  return appStaticServer;
}

function assertSafeHttpUrl(url) {
  const parsed = new URL(url || DEFAULT_URL);
  if (parsed.toString() === PHANTOM_POPUP_URL) {
    return parsed.toString();
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("ResonantOS Browser accepts only http and https URLs.");
  }
  return parsed.toString();
}

function homeDir() {
  return process.env.HOME || process.env.USERPROFILE || app.getPath("home");
}

function portableUserStateRoot() {
  return process.env.RESONANTOS_USER_STATE_ROOT || process.env.RESONANT_USER_STATE_ROOT || path.join(homeDir(), "ResonantOS_User");
}

function tauriAppStateRoot() {
  if (process.platform === "darwin") {
    return path.join(homeDir(), "Library", "Application Support", "com.resonantos.vnext");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(homeDir(), "AppData", "Roaming"), "com.resonantos.vnext");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homeDir(), ".config"), "com.resonantos.vnext");
}

function runtimeStatePath() {
  return path.join(tauriAppStateRoot(), "runtime-state.json");
}

function providerSecretsPath() {
  return path.join(portableUserStateRoot(), "Secrets", "provider-secrets.json");
}

function chromeExtensionProfileRoots() {
  const home = homeDir();
  const browserRoots =
    process.platform === "darwin"
      ? [
          path.join(home, "Library", "Application Support", "Google", "Chrome"),
          path.join(home, "Library", "Application Support", "Google", "Chrome Canary"),
          path.join(home, "Library", "Application Support", "Chromium"),
          path.join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser"),
        ]
      : process.platform === "win32"
        ? [
            path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Google", "Chrome", "User Data"),
            path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Chromium", "User Data"),
            path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "BraveSoftware", "Brave-Browser", "User Data"),
          ]
        : [
            path.join(home, ".config", "google-chrome"),
            path.join(home, ".config", "chromium"),
            path.join(home, ".config", "BraveSoftware", "Brave-Browser"),
          ];

  return browserRoots.flatMap((root) => {
    if (!existsSync(root)) {
      return [];
    }
    const profileNames = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && (entry.name === "Default" || /^Profile \d+$/i.test(entry.name)))
      .map((entry) => entry.name);
    return profileNames.map((profile) => path.join(root, profile, "Extensions"));
  });
}

function newestManifestDirectory(root) {
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

function findLocalPhantomExtensionDir() {
  if (process.env.RESONANTOS_PHANTOM_EXTENSION_DIR) {
    const override = path.resolve(process.env.RESONANTOS_PHANTOM_EXTENSION_DIR);
    if (existsSync(path.join(override, "manifest.json"))) {
      return override;
    }
  }

  for (const extensionsRoot of chromeExtensionProfileRoots()) {
    const candidate = newestManifestDirectory(path.join(extensionsRoot, PHANTOM_EXTENSION_ID));
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

async function loadPhantomIfPresent() {
  if (phantomAutoloadResult) {
    return phantomAutoloadResult;
  }
  const phantomDir = findLocalPhantomExtensionDir();
  if (!phantomDir) {
    phantomAutoloadResult = { loaded: false, reason: "local Phantom extension directory not found" };
    return phantomAutoloadResult;
  }
  const existing = allExtensions().extensions.find((extension) => extension.extensionId === PHANTOM_EXTENSION_ID);
  if (existing) {
    pinnedExtensionIds.add(existing.extensionId);
    loadedExtensionPaths.set(existing.extensionId, phantomDir);
    phantomAutoloadResult = { loaded: true, extension: existing, path: phantomDir, alreadyLoaded: true };
    return phantomAutoloadResult;
  }
  const loaded = await loadUnpackedExtension({ path: phantomDir, pinned: true, allowFileAccess: false });
  phantomAutoloadResult = { loaded: true, extension: loaded.extension, path: phantomDir, alreadyLoaded: false };
  return phantomAutoloadResult;
}

async function readJsonFile(filePath, fallback) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const raw = await readFile(filePath, "utf8");
      return raw.trim() ? JSON.parse(raw) : fallback;
    } catch (error) {
      if (error?.code === "ENOENT") {
        return fallback;
      }
      if (error instanceof SyntaxError && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        continue;
      }
      throw error;
    }
  }
  return fallback;
}

async function writeJsonFileAtomic(filePath, value, options = {}) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(value, null, 2), options);
  await rename(tempPath, filePath);
}

async function readRuntimeState() {
  return readJsonFile(runtimeStatePath(), null);
}

async function writeRuntimeState(state) {
  await writeJsonFileAtomic(runtimeStatePath(), state);
}

async function readProviderSecrets() {
  return readJsonFile(providerSecretsPath(), {});
}

async function writeProviderSecrets(secrets) {
  await writeJsonFileAtomic(providerSecretsPath(), secrets, { mode: 0o600 });
}

async function resolveProviderSecret(providerId) {
  const secrets = await readProviderSecrets();
  if (typeof secrets[providerId] === "string" && secrets[providerId].trim()) {
    return secrets[providerId];
  }
  const envKey = PROVIDER_IDS_WITH_ENV_FALLBACK[providerId];
  return envKey ? process.env[envKey] || null : null;
}

function stripThinkBlocks(content) {
  let output = "";
  let remainder = String(content ?? "");
  while (remainder.includes("<think>")) {
    const start = remainder.indexOf("<think>");
    output += remainder.slice(0, start);
    const afterStart = remainder.slice(start + "<think>".length);
    const end = afterStart.indexOf("</think>");
    if (end < 0) {
      remainder = "";
      break;
    }
    remainder = afterStart.slice(end + "</think>".length);
  }
  return `${output}${remainder}`.trim();
}

function providerWireModel(providerType, model) {
  if (providerType === "minimax" && model === "MiniMax-M2.7-highspeed") {
    return "MiniMax-M2.7";
  }
  return model;
}

function providerBaseUrl(input = {}) {
  if (input.runtimeNodeEndpoint) return input.runtimeNodeEndpoint;
  if (input.apiBaseUrl) return input.apiBaseUrl;
  if (input.providerType === "minimax") return "https://api.minimax.io/v1";
  if (input.providerType === "openai" || input.providerType === "openai-compatible") return "https://api.openai.com/v1";
  throw new Error(`Unsupported Electron provider type: ${input.providerType}`);
}

function providerMessagesWithSystemPrompt(systemPrompt, messages = []) {
  const requestMessages = [];
  if (String(systemPrompt ?? "").trim()) {
    requestMessages.push({ role: "system", content: String(systemPrompt).trim() });
  }
  for (const message of messages) {
    const role = String(message?.role ?? "").trim();
    const content = String(message?.content ?? "").trim();
    if (role && content) {
      requestMessages.push({ role, content });
    }
  }
  if (requestMessages.filter((message) => message.role !== "system").length === 0) {
    throw new Error("Provider chat request has no non-empty user or assistant messages.");
  }
  return requestMessages;
}

function extractAssistantContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || part?.content || "").filter(Boolean).join("\n");
  }
  throw new Error("Model response did not include assistant content.");
}

function sanitizeAssistantContent(providerType, content) {
  return providerType === "minimax" ? stripThinkBlocks(content) : String(content ?? "").trim();
}

async function providerDiagnostics(providerId = null) {
  const state = await readRuntimeState();
  const providers = Array.isArray(state?.providers) ? state.providers : [];
  const runtimeNodes = Array.isArray(state?.runtimeNodes) ? state.runtimeNodes : [];
  const checkedAt = new Date().toISOString();
  const reports = [];
  for (const provider of providers) {
    if (providerId && provider.id !== providerId) continue;
    if (provider.id === "shared-local") continue;
    const credentialConfigured = Boolean(await resolveProviderSecret(provider.id));
    const node = runtimeNodes.find((candidate) => candidate.providerProfileId === provider.id);
    reports.push({
      providerId: provider.id,
      providerLabel: provider.label ?? provider.id,
      providerType: provider.providerType,
      authMethod: provider.authMethod ?? "api-key",
      authTier: provider.authTier ?? "supported",
      executionAdapter: node?.kind === "remote-user-owned" ? "local-ollama" : provider.providerType === "minimax" ? "cloud-minimax-compatible" : "cloud-openai-compatible",
      credentialConfigured,
      status: credentialConfigured || node?.kind === "desktop-local" || node?.kind === "remote-user-owned" ? "ready" : "blocked",
      summary: credentialConfigured ? "Credential configured in portable provider vault." : "Credentials are not configured for this provider.",
      checkedAt,
      primaryModel: provider.primaryModel,
      fallbackModel: provider.fallbackModel ?? null,
      runtimeDiagnostics: [],
    });
  }
  return reports;
}

async function providerChatCompletion(input = {}) {
  const apiKey = await resolveProviderSecret(input.providerId);
  if (!apiKey && input.runtimeNodeKind === "cloud") {
    throw new Error("No provider secret is configured for this Strategist profile.");
  }
  const baseUrl = providerBaseUrl(input);
  const wireModel = providerWireModel(input.providerType, input.model);
  const requestMessages = providerMessagesWithSystemPrompt(input.systemPrompt, input.messages);
  const body =
    input.providerType === "openai"
      ? { model: wireModel, messages: requestMessages, reasoning_effort: input.reasoningEffort }
      : { model: wireModel, messages: requestMessages };
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Provider request failed with HTTP ${response.status}.`);
  }
  return sanitizeAssistantContent(input.providerType, extractAssistantContent(payload));
}

function createSessionId() {
  return `electron-browser-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeBounds(input = {}) {
  const x = Math.max(0, Math.round(Number(input.x) || 0));
  const y = Math.max(0, Math.round(Number(input.y) || 0));
  const width = Math.max(64, Math.round(Number(input.width) || 800));
  const height = Math.max(64, Math.round(Number(input.height) || 600));
  return { x, y, width, height };
}

function getOwnerWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
}

function ensureBrowserView(ownerWindow = mainWindow) {
  if (!ownerWindow) {
    throw new Error("ResonantOS main window is not available.");
  }
  if (browserView && !browserView.webContents.isDestroyed()) {
    return browserView;
  }
  browserSessionId = createSessionId();
  browserView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  browserView.webContents.setZoomFactor(1);
  if (typeof browserView.setBackgroundColor === "function") {
    browserView.setBackgroundColor("#ffffff");
  }
  ownerWindow.setBrowserView(browserView);
  if (typeof ownerWindow.setTopBrowserView === "function") {
    ownerWindow.setTopBrowserView(browserView);
  }
  return browserView;
}

async function showBrowserView(event, request = {}) {
  const ownerWindow = getOwnerWindow(event);
  const view = ensureBrowserView(ownerWindow);
  const bounds = normalizeBounds(request);
  ownerWindow.setBrowserView(view);
  if (typeof ownerWindow.setTopBrowserView === "function") {
    ownerWindow.setTopBrowserView(view);
  }
  view.setBounds(bounds);
  view.setAutoResize({ width: false, height: false, horizontal: false, vertical: false });
  browserVisible = true;

  if (request.navigate !== false || !view.webContents.getURL()) {
    const targetUrl = assertSafeHttpUrl(request.url ?? DEFAULT_URL);
    browserNavigationQueue = browserNavigationQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          await view.webContents.loadURL(targetUrl);
        } catch (error) {
          if (!view.webContents || view.webContents.isDestroyed()) {
            return;
          }
          const currentUrl = view.webContents.getURL();
          const aborted = error?.code === "ERR_ABORTED" || String(error?.message ?? error).includes("ERR_ABORTED");
          if (!aborted || currentUrl !== targetUrl) {
            throw error;
          }
        }
      });
    await browserNavigationQueue;
  }

  return {
    label: "electron-browser-view",
    url: view.webContents && !view.webContents.isDestroyed() ? view.webContents.getURL() : null,
    visible: true,
    status: view.webContents && !view.webContents.isDestroyed() ? "ready" : "not-started",
  };
}

function resizeBrowserView(request = {}) {
  if (!browserView || browserView.webContents.isDestroyed()) {
    return { label: "electron-browser-view", url: null, visible: false, status: "not-started" };
  }
  browserView.setBounds(normalizeBounds(request));
  return {
    label: "electron-browser-view",
    url: browserView.webContents.getURL(),
    visible: browserVisible,
    status: "ready",
  };
}

function hideBrowserView(event) {
  const ownerWindow = getOwnerWindow(event);
  if (browserView && ownerWindow && !ownerWindow.isDestroyed()) {
    ownerWindow.removeBrowserView(browserView);
  }
  browserVisible = false;
  return {
    label: "electron-browser-view",
    url: browserView && !browserView.webContents.isDestroyed() ? browserView.webContents.getURL() : null,
    visible: false,
    status: "hidden",
  };
}

function requireBrowserView(event) {
  return ensureBrowserView(getOwnerWindow(event));
}

async function readPage(view, selector = null) {
  const result = await view.webContents.executeJavaScript(
    `(() => {
      const selector = ${JSON.stringify(selector)};
      const root = selector ? document.querySelector(selector) : document.body;
      const text = (root?.innerText ?? document.body?.innerText ?? "").slice(0, ${MAX_TEXT_CHARS});
      const links = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, ${MAX_LINKS})
        .map((link) => ({ text: (link.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 160), href: link.href }));
      return { text, links };
    })()`,
    true,
  );
  return {
    sessionId: browserSessionId,
    finalUrl: view.webContents.getURL(),
    title: view.webContents.getTitle(),
    text: String(result?.text ?? ""),
    links: Array.isArray(result?.links) ? result.links : [],
    audit: [],
  };
}

function extensionState(extension, pinned = false) {
  const extensionId = String(extension?.id ?? "");
  const extensionPath = loadedExtensionPaths.get(extensionId) ?? (typeof extension?.path === "string" ? extension.path : null);
  const manifestPath = extensionPath ? path.join(extensionPath, "manifest.json") : null;
  const manifest = manifestPath && existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  const manifestPermissions = Array.isArray(manifest.permissions) ? manifest.permissions.map(String) : [];
  const unsupportedElectronPermissions = manifestPermissions.filter((permission) => ["identity", "sidePanel"].includes(permission));
  const isPhantom = extensionId === PHANTOM_EXTENSION_ID || /phantom/i.test(String(extension?.name ?? ""));
  const manifestVersion = Number(manifest.manifest_version ?? 0);
  const hasMv3ServiceWorker = manifestVersion === 3 && Boolean(manifest.background?.service_worker);
  const compatibilityState =
    isPhantom && (unsupportedElectronPermissions.length > 0 || hasMv3ServiceWorker)
      ? "unsupported-in-electron"
      : unsupportedElectronPermissions.length > 0
        ? "degraded"
        : "supported";
  const compatibilityNotes =
    compatibilityState === "unsupported-in-electron"
      ? [
          "Phantom loads as an unpacked extension, but its popup crashes in Electron because required Chrome extension APIs are unavailable.",
          "Use a real Chrome/Brave wallet session for Phantom until ResonantOS ships a dedicated wallet browser host.",
        ]
      : unsupportedElectronPermissions.length > 0
        ? [`Unsupported Electron extension permissions: ${unsupportedElectronPermissions.join(", ")}.`]
        : [];
  return {
    extensionId,
    name: String(extension?.name ?? extension?.id ?? "Unnamed extension"),
    version: String(extension?.version ?? "unknown"),
    installed: true,
    pinned,
    enabled: true,
    source: "local-unpacked",
    requestedCapabilities: manifestPermissions,
    compatibilityState,
    compatibilityNotes,
  };
}

function allExtensions() {
  const extensions =
    typeof session.defaultSession.extensions?.getAllExtensions === "function"
      ? session.defaultSession.extensions.getAllExtensions()
      : typeof session.defaultSession.getAllExtensions === "function"
        ? session.defaultSession.getAllExtensions()
        : [];
  return {
    sessionId: browserSessionId,
    extensions: extensions.map((extension) => extensionState(extension, pinnedExtensionIds.has(extension.id))),
    audit: [],
  };
}

async function loadUnpackedExtension(params = {}) {
  if (!params.path && params.expectedTarget === "phantom") {
    const autoload = await loadPhantomIfPresent();
    if (!autoload.loaded) {
      throw new Error(autoload.reason || "Local Phantom extension directory not found.");
    }
    return { sessionId: browserSessionId, extension: autoload.extension, audit: [] };
  }
  if (!params.path || typeof params.path !== "string") {
    throw new Error("Loading an extension requires an unpacked extension folder path.");
  }
  const manifestPath = path.join(params.path, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Extension manifest not found: ${manifestPath}`);
  }
  const extension = session.defaultSession.extensions?.loadExtension
    ? await session.defaultSession.extensions.loadExtension(params.path, { allowFileAccess: Boolean(params.allowFileAccess) })
    : await session.defaultSession.loadExtension(params.path, { allowFileAccess: Boolean(params.allowFileAccess) });
  loadedExtensionPaths.set(extension.id, params.path);
  if (params.pinned) {
    pinnedExtensionIds.add(extension.id);
  }
  return { sessionId: browserSessionId, extension: extensionState(extension, Boolean(params.pinned)), audit: [] };
}

async function runBrowserCommand(event, request = {}) {
  const method = request.method ?? "browser.health";
  const params = request.params ?? {};
  if (method.startsWith("browser.wallet_host.")) {
    return runWalletBrowserCommand(method, params);
  }
  const view = method === "browser.health" || method === "browser.extensions.list" ? browserView : requireBrowserView(event);

  if (method === "browser.start") {
    const started = await showBrowserView(event, { url: params.defaultUrl ?? params.url ?? DEFAULT_URL, x: 0, y: 0, width: 1000, height: 700, navigate: true });
    return { ready: true, sessionId: browserSessionId, engine: "electron-chromium", url: started.url, title: browserView.webContents.getTitle(), extensionSupport: "local-unpacked", audit: [] };
  }
  if (method === "browser.open_url") {
    const targetUrl = assertSafeHttpUrl(params.url ?? DEFAULT_URL);
    try {
      await requireBrowserView(event).webContents.loadURL(targetUrl);
    } catch (error) {
      const currentUrl = browserView && !browserView.webContents.isDestroyed() ? browserView.webContents.getURL() : "";
      const aborted = error?.code === "ERR_ABORTED" || String(error?.message ?? error).includes("ERR_ABORTED");
      if (!aborted || currentUrl !== targetUrl) {
        throw error;
      }
    }
    return {
      sessionId: browserSessionId,
      finalUrl: browserView.webContents.getURL(),
      title: browserView.webContents.getTitle(),
      status: null,
      audit: [],
    };
  }
  if (method === "browser.read_page") {
    return readPage(requireBrowserView(event), params.selector ?? null);
  }
  if (method === "browser.click") {
    if (params.selector) {
      const clicked = await view.webContents.executeJavaScript(
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
        throw new Error(`Browser could not find selector: ${params.selector}`);
      }
    } else if (Number.isFinite(params.x) && Number.isFinite(params.y)) {
      view.webContents.sendInputEvent({ type: "mouseDown", x: params.x, y: params.y, button: "left", clickCount: 1 });
      view.webContents.sendInputEvent({ type: "mouseUp", x: params.x, y: params.y, button: "left", clickCount: 1 });
    } else {
      throw new Error("Browser click requires selector or x/y coordinates.");
    }
    return { sessionId: browserSessionId, finalUrl: view.webContents.getURL(), title: view.webContents.getTitle(), audit: [] };
  }
  if (method === "browser.type") {
    if (!params.selector || typeof params.text !== "string") {
      throw new Error("Browser type requires selector and text.");
    }
    const typed = await view.webContents.executeJavaScript(
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
      throw new Error(`Browser could not find selector: ${params.selector}`);
    }
    return { sessionId: browserSessionId, finalUrl: view.webContents.getURL(), title: view.webContents.getTitle(), audit: [] };
  }
  if (method === "browser.extensions.list") {
    return allExtensions();
  }
  if (method === "browser.extensions.load_unpacked") {
    return loadUnpackedExtension(params);
  }
  if (method === "browser.extensions.set_pinned") {
    if (params.pinned === false) {
      pinnedExtensionIds.delete(params.extensionId);
    } else {
      pinnedExtensionIds.add(params.extensionId);
    }
    return allExtensions();
  }
  if (method === "browser.extensions.disable") {
    if (typeof session.defaultSession.removeExtension !== "function") {
      throw new Error("Electron runtime does not expose extension removal.");
    }
    session.defaultSession.removeExtension(params.extensionId);
    pinnedExtensionIds.delete(params.extensionId);
    return allExtensions();
  }
  if (method === "browser.health") {
    return {
      ready: Boolean(view && !view.webContents.isDestroyed()),
      sessionId: browserSessionId,
      engine: "electron-chromium",
      url: view && !view.webContents.isDestroyed() ? view.webContents.getURL() : null,
      title: view && !view.webContents.isDestroyed() ? view.webContents.getTitle() : null,
      extensionSupport: "local-unpacked",
      audit: [],
    };
  }
  throw new Error(`Unsupported Electron Browser command: ${method}`);
}

async function handleInvoke(event, command, args = {}) {
  if (command === "load_runtime_state") {
    const state = await readRuntimeState();
    if (productSmoke && state?.uiPreferences) {
      return {
        ...state,
        uiPreferences: {
          ...state.uiPreferences,
          activeSection: "home",
        },
      };
    }
    return state;
  }
  if (command === "save_runtime_state") {
    if (productSmoke) {
      return null;
    }
    await writeRuntimeState(args.state);
    return null;
  }
  if (command === "load_provider_secret_statuses") {
    const secrets = await readProviderSecrets();
    return Object.fromEntries(
      await Promise.all(
        Object.keys({ ...secrets, ...PROVIDER_IDS_WITH_ENV_FALLBACK }).map(async (providerId) => [
          providerId,
          Boolean(await resolveProviderSecret(providerId)),
        ]),
      ),
    );
  }
  if (command === "save_provider_secret") {
    const secrets = await readProviderSecrets();
    const providerId = String(args.providerId ?? "");
    const apiKey = String(args.apiKey ?? "").trim();
    if (!providerId) {
      throw new Error("Provider secret save requires providerId.");
    }
    if (apiKey) {
      secrets[providerId] = apiKey;
    } else {
      delete secrets[providerId];
    }
    await writeProviderSecrets(secrets);
    return null;
  }
  if (command === "provider_diagnostics") {
    return providerDiagnostics(args.providerId ?? null);
  }
  if (command === "provider_service_chat_completion") {
    return providerChatCompletion(args);
  }
  if (command === "provider_service_chat_completion_stream") {
    return providerChatCompletion(args);
  }
  if (command === "browser_native_webview_show") {
    return showBrowserView(event, args.request ?? {});
  }
  if (command === "browser_native_webview_resize") {
    return resizeBrowserView(args.request ?? {});
  }
  if (command === "browser_native_webview_hide") {
    return hideBrowserView(event);
  }
  if (command === "browser_visible_host_command" || command === "browser_host_command") {
    return runBrowserCommand(event, args.request ?? {});
  }
  if (command === "browser_extension_folder_select") {
    const result = await dialog.showOpenDialog(getOwnerWindow(event), {
      title: "Choose an unpacked Chrome extension folder",
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  }
  if (command === "open_floating_chat_window") {
    return openFloatingChatWindow(args.url ?? "/?surface=floating-chat");
  }
  throw new Error(`Electron host command is not implemented yet: ${command}`);
}

async function openFloatingChatWindow(surfaceUrl) {
  await app.whenReady();
  if (floatingChatWindow && !floatingChatWindow.isDestroyed()) {
    floatingChatWindow.focus();
    return null;
  }

  const parentUrl = mainWindow?.webContents.getURL();
  const target = new URL(String(surfaceUrl || "/?surface=floating-chat"), parentUrl || "http://127.0.0.1/");
  target.searchParams.set("surface", "floating-chat");

  floatingChatWindow = new BrowserWindow({
    width: 620,
    height: 860,
    minWidth: 420,
    minHeight: 620,
    title: "Augmentor Chat",
    backgroundColor: "#101112",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });
  floatingChatWindow.on("closed", () => {
    floatingChatWindow = null;
  });
  await floatingChatWindow.loadURL(target.toString());
  return null;
}

async function createMainWindow() {
  smokeLog("app.whenReady");
  await app.whenReady();
  if (experimentalElectronPhantom) {
    await loadPhantomIfPresent().catch((error) => {
      smokeLog(`phantom-autoload-failed:${error instanceof Error ? error.message : String(error)}`);
    });
  } else {
    phantomAutoloadResult = {
      loaded: false,
      reason: "Electron Phantom autoload is disabled; use the dedicated Chrome/Brave Wallet Browser host.",
    };
  }
  smokeLog("create-main-window");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 700,
    title: "ResonantOS",
    backgroundColor: "#101112",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });
  mainWindow.setMaxListeners(0);

  if (process.env.RESONANTOS_ELECTRON_URL) {
    await mainWindow.loadURL(process.env.RESONANTOS_ELECTRON_URL);
  } else {
    const staticServer = await startDistStaticServer();
    smokeLog(`load-url:${staticServer.url}`);
    await mainWindow.loadURL(staticServer.url);
  }
  smokeLog("main-window-loaded");
}

ipcMain.handle("resonantos:invoke", handleInvoke);

async function runProductSmoke() {
  const fixture = await startSmokeFixtureServer();
  try {
    smokeLog("fixture-ready");
    await createMainWindow();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const shellShot = await mainWindow.webContents.capturePage();
    const shellScreenshotPath = path.join(app.getPath("temp"), `resonantos-electron-shell-${Date.now()}.png`);
    await writeFile(shellScreenshotPath, shellShot.toPNG());
    const shellPixel = await mainWindow.webContents.executeJavaScript(
      `(() => {
        const root = document.querySelector("#root");
        const bodyText = (document.body?.innerText || "").trim();
        const rootRect = root?.getBoundingClientRect();
        const elements = document.body ? document.body.querySelectorAll("*").length : 0;
        return {
          bodyTextLength: bodyText.length,
          bodyTextSample: bodyText.slice(0, 240),
          rootChildCount: root?.childElementCount ?? 0,
          rootWidth: rootRect?.width ?? 0,
          rootHeight: rootRect?.height ?? 0,
          elementCount: elements,
          background: getComputedStyle(document.body).backgroundColor,
        };
      })()`,
      true,
    );
    if (
      shellPixel.bodyTextSample.includes("BOOT FAILED") ||
      shellPixel.bodyTextLength < 20 ||
      shellPixel.rootChildCount < 1 ||
      shellPixel.rootWidth < 100 ||
      shellPixel.rootHeight < 100
    ) {
      throw new Error(`Electron shell rendered blank: ${JSON.stringify({ ...shellPixel, shellScreenshotPath })}`);
    }
    smokeLog("read-renderer-bridge");
    const page = await mainWindow.webContents.executeJavaScript(
      `({ title: document.title, nodeAvailable: typeof process !== "undefined" || typeof require !== "undefined", bridgeAvailable: typeof window.resonantosElectron?.invoke === "function" })`,
      true,
    );
    smokeLog("show-browser-view");
    const browser = await handleInvoke({ sender: mainWindow.webContents }, "browser_native_webview_show", {
      request: { url: fixture.url, x: 20, y: 80, width: 900, height: 560, navigate: true },
    });
    await waitForShellCondition(
      `() => !(document.body?.innerText || "").includes("Preparing browser controls") && !(document.body?.innerText || "").includes("Loading Browser")`,
      6000,
    );
    await handleInvoke({ sender: mainWindow.webContents }, "browser_visible_host_command", {
      request: { method: "browser.open_url", params: { url: fixture.url }, humanApproved: true },
    });
    smokeLog("read-browser-view");
    const read = await handleInvoke({ sender: mainWindow.webContents }, "browser_visible_host_command", {
      request: { method: "browser.read_page", params: {} },
    });
    if (read.finalUrl !== fixture.url || !read.text.includes("ResonantOS Browser Fixture")) {
      throw new Error(`Electron browser failed deterministic fixture read: ${JSON.stringify({ expected: fixture.url, read })}`);
    }
    const browserShot = browserView && !browserView.webContents.isDestroyed() ? await browserView.webContents.capturePage() : null;
    const browserScreenshotPath = path.join(app.getPath("temp"), `resonantos-electron-browser-${Date.now()}.png`);
    if (browserShot) {
      await writeFile(browserScreenshotPath, browserShot.toPNG());
    }
    const providerStatus = await handleInvoke({ sender: mainWindow.webContents }, "load_provider_secret_statuses", {});
    const diagnostics = await handleInvoke({ sender: mainWindow.webContents }, "provider_diagnostics", {});
    const extensions = await handleInvoke({ sender: mainWindow.webContents }, "browser_visible_host_command", {
      request: { method: "browser.extensions.list", params: {} },
    });
    const phantomPopup =
      extensions.extensions?.some((extension) => extension.extensionId === PHANTOM_EXTENSION_ID)
        ? await handleInvoke({ sender: mainWindow.webContents }, "browser_visible_host_command", {
            request: { method: "browser.open_url", params: { url: PHANTOM_POPUP_URL }, humanApproved: true },
          })
        : null;
    if (phantomPopup) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    const phantomPopupShot = phantomPopup && browserView && !browserView.webContents.isDestroyed() ? await browserView.webContents.capturePage() : null;
    const phantomPopupScreenshotPath = path.join(app.getPath("temp"), `resonantos-electron-phantom-${Date.now()}.png`);
    if (phantomPopupShot) {
      await writeFile(phantomPopupScreenshotPath, phantomPopupShot.toPNG());
    }
    const providerSmoke =
      process.env.RESONANTOS_PROVIDER_SMOKE === "1"
        ? await handleInvoke({ sender: mainWindow.webContents }, "provider_service_chat_completion", {
            requestId: "electron-provider-smoke",
            providerId: "shared-minimax",
            providerType: "minimax",
            runtimeNodeKind: "cloud",
            model: "MiniMax-M2.7-highspeed",
            reasoningEffort: "minimal",
            systemPrompt: "Reply with exactly: ResonantOS provider smoke OK",
            messages: [{ role: "user", content: "Run the smoke test." }],
          })
        : null;
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        page,
        shellPixel,
        shellScreenshotPath,
        browserScreenshotPath: browserShot ? browserScreenshotPath : null,
        browser,
        read,
        extensions,
        phantomPopup,
        phantomPopupScreenshotPath: phantomPopupShot ? phantomPopupScreenshotPath : null,
        phantomAutoloadResult,
        providerStatus,
        diagnostics,
        providerSmoke,
      })}\n`,
    );
  } finally {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
    }
    await new Promise((resolve) => fixture.server.close(resolve));
    if (appStaticServer) {
      await new Promise((resolve) => appStaticServer.server.close(resolve));
      appStaticServer = null;
    }
    app.quit();
  }
}

app.on("window-all-closed", () => {
  if (appStaticServer) {
    appStaticServer.server.close();
    appStaticServer = null;
  }
  app.quit();
});

if (productSmoke) {
  runProductSmoke().catch((error) => {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.stack : String(error) })}\n`);
    app.quit();
    process.exitCode = 1;
  });
} else {
  createMainWindow().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    app.quit();
    process.exitCode = 1;
  });
}
