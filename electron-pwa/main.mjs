/**
 * ResonantOS Electron PWA — main process
 *
 * Lean wrapper (<300 lines) that:
 *   1. Spawns the browser-first bridge server (bridge-only mode)
 *   2. Waits for bridge-config.generated.js to be written
 *   3. Loads the ResonantOS side-panel extension so chrome.* APIs work
 *   4. Opens a frameless BrowserWindow on the extension's main-workspace.html
 *   5. Provides system tray, single-instance lock, window-state persistence
 */

import {
  app,
  BrowserView,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  session,
  Tray,
} from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const extRoot = path.join(repoRoot, "browser-first", "resonantos-side-panel-extension");
const bridgeConfigPath = path.join(extRoot, "src", "bridge-config.generated.js");
const bridgeScript = path.join(repoRoot, "browser-first", "host", "run-browser-first.mjs");
const trayIconPath = path.join(__dirname, "icon-32.png");
const appIconPath = path.join(__dirname, "icon.png");
const preloadPath = path.join(__dirname, "preload.mjs");

// ─── State ────────────────────────────────────────────────────────────────────

let mainWindow = null;
let sidePanelView = null;
let sidePanelVisible = false;
let sidePanelWidth = 420;
const SIDE_PANEL_MIN_WIDTH = 320;
const SIDE_PANEL_MAX_WIDTH = 700;
let tray = null;
let bridgeProcess = null;
let extensionId = null;
app.isQuitting = false;

// ─── Single-instance lock ─────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.error("[electron-pwa] Another instance is already running.");
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ─── Window-state persistence ─────────────────────────────────────────────────

const DEFAULT_BOUNDS = { width: 1280, height: 820 };

async function loadWindowState() {
  try {
    const statePath = path.join(app.getPath("userData"), "pwa-window-state.json");
    const raw = await readFile(statePath, "utf8");
    return { ...DEFAULT_BOUNDS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BOUNDS };
  }
}

async function saveWindowState(win) {
  if (!win || win.isMaximized() || win.isMinimized()) return;
  try {
    const statePath = path.join(app.getPath("userData"), "pwa-window-state.json");
    await writeFile(statePath, JSON.stringify(win.getBounds()), "utf8");
  } catch { /* non-fatal */ }
}

// ─── Bridge process ───────────────────────────────────────────────────────────

/**
 * Start the bridge in bridge-only mode.
 * Resolves once the bridge confirms it has written the config file.
 * Rejects on timeout or non-zero exit before ready.
 */
function startBridge() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    };
    // Pass API key through to bridge
    if (process.env.RESONANTOS_ALPHA_KEY) {
      env.RESONANTOS_ALPHA_KEY = process.env.RESONANTOS_ALPHA_KEY;
    }

    console.log("[electron-pwa] Starting bridge (bridge-only mode)…");
    bridgeProcess = spawn("node", [bridgeScript, "--bridge-only=true"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let resolved = false;
    const done = (err) => {
      if (resolved) return;
      resolved = true;
      if (err) reject(err);
      else resolve();
    };

    bridgeProcess.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      process.stdout.write(`[bridge] ${text}`);
      // Bridge prints this line immediately after writing the config file
      if (text.includes("Bridge config written to:") || text.includes("Bridge-only mode active")) {
        done();
      }
    });

    bridgeProcess.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      process.stderr.write(`[bridge:err] ${text}`);
      // If port is already in use, reuse the existing bridge
      if (text.includes("EADDRINUSE")) {
        console.log("[electron-pwa] Port 47773 already in use — reusing existing bridge");
        try { bridgeProcess.kill(); } catch {}
        bridgeProcess = null;
        const configPath = path.join(extRoot, "src", "bridge-config.generated.js");
        if (existsSync(configPath)) {
          console.log("[electron-pwa] Found existing bridge config — reusing");
        } else {
          console.log("[electron-pwa] Warning: no bridge config found");
        }
        done();
        return;
      }
    });

    bridgeProcess.on("exit", (code, signal) => {
      console.log(`[electron-pwa] Bridge exited (code=${code} signal=${signal})`);
      bridgeProcess = null;
      if (!resolved) done(new Error(`Bridge exited before ready (code=${code})`));
    });

    // Safety timeout
    setTimeout(() => done(new Error("Bridge startup timed out after 15 s")), 15_000);
  });
}

function killBridge() {
  if (bridgeProcess) {
    try { bridgeProcess.kill("SIGTERM"); } catch { /* ignore */ }
    bridgeProcess = null;
  }
}

// ─── Extension loading ────────────────────────────────────────────────────────

async function loadResonantExtension() {
  if (!existsSync(path.join(extRoot, "manifest.json"))) {
    throw new Error(`Extension not found at: ${extRoot}`);
  }
  // allowFileAccess is required for file:// resources inside the extension
  const ext = await session.defaultSession.loadExtension(extRoot, {
    allowFileAccess: true,
  });
  extensionId = ext.id;
  console.log(`[electron-pwa] Extension loaded — id: ${extensionId}`);
  return extensionId;
}

// ─── Main window ─────────────────────────────────────────────────────────────

async function createMainWindow(state) {
  mainWindow = new BrowserWindow({
    icon: nativeImage.createFromPath(appIconPath),
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: "#111827",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // required for extensions
      devTools: !app.isPackaged,
    },
  });

  const workspaceUrl = `chrome-extension://${extensionId}/src/main-workspace.html`;
  console.log(`[electron-pwa] Loading: ${workspaceUrl}`);
  await mainWindow.loadURL(workspaceUrl);

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Minimize to tray on close
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) tray.setToolTip("ResonantOS (running in tray)");
    }
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  // Persist window state
  const persist = () => saveWindowState(mainWindow);
  mainWindow.on("resize", () => { persist(); layoutSidePanel(); });
  mainWindow.on("move", persist);
}

// ─── Side panel (docked right inside main window) ────────────────────────────

function layoutSidePanel() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [winW, winH] = mainWindow.getContentSize();
  if (sidePanelVisible && sidePanelView) {
    const w = Math.min(sidePanelWidth, winW - 400); // leave at least 400px for main
    mainWindow.webContents.executeJavaScript(
      `document.body.style.marginRight = '${w}px';` +
      `document.getElementById('open-sidebar').textContent = 'Close Sidebar'`
    ).catch(() => {});
    sidePanelView.setBounds({ x: winW - w, y: 0, width: w, height: winH });
    // Reposition sidecar if it's open
    if (sidecarActive && sidecarView) {
      sidecarView.setBounds({ x: 0, y: 0, width: winW - w, height: winH });
    }
  } else {
    mainWindow.webContents.executeJavaScript(
      `document.body.style.marginRight = '0';` +
      `document.getElementById('open-sidebar').textContent = 'Open Sidebar'`
    ).catch(() => {});
  }
}

async function openSidePanel() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  if (sidePanelVisible && sidePanelView) {
    // Toggle off
    mainWindow.removeBrowserView(sidePanelView);
    sidePanelVisible = false;
    layoutSidePanel();
    return;
  }
  
  if (!sidePanelView) {
    sidePanelView = new BrowserView({
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    await sidePanelView.webContents.loadURL(`chrome-extension://${extensionId}/src/side-panel.html`);
  }
  
  mainWindow.addBrowserView(sidePanelView);
  sidePanelVisible = true;
  layoutSidePanel();
}

// ─── Sidecar tabs (open inside main window) ──────────────────────────────────

let sidecarView = null;
let sidecarActive = false;

async function openSidecarTab(pagePath) {
  if (!mainWindow || mainWindow.isDestroyed() || !extensionId) return;

  // If same page is already showing, close it (toggle)
  const targetUrl = `chrome-extension://${extensionId}/src/${pagePath}`;
  if (sidecarActive && sidecarView) {
    const currentUrl = sidecarView.webContents.getURL();
    if (currentUrl === targetUrl) {
      mainWindow.removeBrowserView(sidecarView);
      sidecarView.webContents.destroy();
      sidecarView = null;
      sidecarActive = false;
      // Re-establish side panel input (same fix as closeSidecarTab)
      if (sidePanelVisible && sidePanelView && !sidePanelView.webContents.isDestroyed()) {
        mainWindow.removeBrowserView(sidePanelView);
        mainWindow.addBrowserView(sidePanelView);
        layoutSidePanel();
        sidePanelView.webContents.focus();
      }
      return;
    }
  }

  // Create or reuse sidecar view
  if (!sidecarView) {
    sidecarView = new BrowserView({
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
  }

  await sidecarView.webContents.loadURL(targetUrl);

  // Sidecar BrowserView overlays the main content (no need to hide it)

  if (!sidecarActive) {
    mainWindow.addBrowserView(sidecarView);
    sidecarActive = true;
  }

  // Layout: sidecar fills left portion, side panel stays on right
  const [winW, winH] = mainWindow.getContentSize();
  const spWidth = sidePanelVisible ? sidePanelWidth : 0;
  sidecarView.setBounds({ x: 0, y: 0, width: winW - spWidth, height: winH });
}

function closeSidecarTab() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (sidecarActive && sidecarView) {
    mainWindow.removeBrowserView(sidecarView);
    sidecarView.webContents.destroy();
    sidecarView = null;
    sidecarActive = false;
  }
  // Re-establish side panel input after sidecar removal.
  // setTopBrowserView alone is insufficient — the BrowserView z-order
  // may not fully recover after destruction. Remove + re-add forces
  // a clean z-order refresh, then explicit focus restores input.
  if (sidePanelVisible && sidePanelView && !sidePanelView.webContents.isDestroyed()) {
    mainWindow.removeBrowserView(sidePanelView);
    mainWindow.addBrowserView(sidePanelView);
    layoutSidePanel(); // reapply correct bounds after re-add
    sidePanelView.webContents.focus();
  }
}

// Resize side panel via IPC (drag handle in renderer)
function resizeSidePanel(newWidth) {
  sidePanelWidth = Math.max(SIDE_PANEL_MIN_WIDTH, Math.min(SIDE_PANEL_MAX_WIDTH, newWidth));
  layoutSidePanel();
}

// ─── System tray ─────────────────────────────────────────────────────────────

function createTray() {
  const raw = nativeImage.createFromPath(trayIconPath);
  const icon = raw.isEmpty() ? nativeImage.createEmpty() : raw.resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip("ResonantOS");

  const menu = Menu.buildFromTemplate([
    {
      label: "Show ResonantOS",
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      },
    },
    {
      label: "Open Side Panel",
      click: () => openSidePanel(),
    },
    { type: "separator" },
    {
      label: "Quit ResonantOS",
      click: () => {
        app.isQuitting = true;
        killBridge();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.handle("resonantos-pwa:window-controls", (_event, action) => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (!win) return;
  switch (action) {
    case "minimize": win.minimize(); break;
    case "maximize": win.isMaximized() ? win.unmaximize() : win.maximize(); break;
    case "close":    win.hide(); break;
    case "quit":
      app.isQuitting = true;
      killBridge();
      app.quit();
      break;
  }
});

ipcMain.handle("resonantos-pwa:open-side-panel", () => openSidePanel());
ipcMain.handle("resonantos-pwa:open-sidecar-tab", (_e, pagePath) => openSidecarTab(pagePath));
ipcMain.handle("resonantos-pwa:close-sidecar-tab", () => closeSidecarTab());
ipcMain.handle("resonantos-pwa:resize-side-panel", (_e, width) => resizeSidePanel(width));
ipcMain.handle("resonantos-pwa:get-side-panel-state", () => ({ visible: sidePanelVisible, width: sidePanelWidth }));

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    // 1. Start bridge and wait for it to write the config
    await startBridge();

    // Belt-and-suspenders: ensure config file exists before loading extension
    if (!existsSync(bridgeConfigPath)) {
      throw new Error(`Bridge config not found at: ${bridgeConfigPath}`);
    }

    // 2. Load the extension (gives stable chrome-extension:// origin)
    await loadResonantExtension();

    // 3. Set dock icon on macOS (BrowserWindow({ icon }) does NOT set the dock
    //    icon — must be done programmatically via app.dock.setIcon())
    if (process.platform === "darwin" && app.dock) {
      console.log(`[electron-pwa] appIconPath = ${appIconPath}`);
      console.log(`[electron-pwa] icon exists = ${existsSync(appIconPath)}`);
      const dockIcon = nativeImage.createFromPath(appIconPath);
      console.log(`[electron-pwa] dockIcon.isEmpty = ${dockIcon.isEmpty()}`);
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
        console.log("[electron-pwa] Dock icon set.");
      } else {
        console.warn("[electron-pwa] Warning: dock icon image is empty — check path.");
      }
    }

    // 4. Create the main window
    const state = await loadWindowState();
    await createMainWindow(state);

    // 5. Create tray
    createTray();

    console.log("[electron-pwa] Ready.");
  } catch (err) {
    console.error("[electron-pwa] Startup failed:", err);
    killBridge();
    app.quit();
  }
});

// On macOS, re-activate shows the window
app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// Quit cleanly
app.on("before-quit", () => {
  app.isQuitting = true;
  killBridge();
});

// Prevent default quit-on-all-closed so tray keeps app alive
app.on("window-all-closed", () => {
  // Intentionally empty — tray keeps app alive
});
