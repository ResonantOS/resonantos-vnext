/**
 * ResonantOS Electron PWA — preload script
 *
 * Exposes ONLY the narrow bridge that renderer pages need:
 *   - Platform identifier (for conditional UI)
 *   - Window control actions (minimize / maximize / close)
 *   - Side-panel opener
 *
 * Node, filesystem, IPC internals, and Electron APIs are NOT exposed.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("resonantosElectronPWA", {
  /** e.g. "darwin" | "win32" | "linux" */
  platform: process.platform,

  /**
   * Send a window-control action to the main process.
   * @param {"minimize"|"maximize"|"close"|"quit"} action
   */
  windowControl: (action) =>
    ipcRenderer.invoke("resonantos-pwa:window-controls", action),

  /** Toggle the side-panel (docked right) */
  openSidePanel: () =>
    ipcRenderer.invoke("resonantos-pwa:open-side-panel"),

  /** Resize the side panel (drag handle) */
  resizeSidePanel: (width) =>
    ipcRenderer.invoke("resonantos-pwa:resize-side-panel", width),

  /** Get current side panel state */
  getSidePanelState: () =>
    ipcRenderer.invoke("resonantos-pwa:get-side-panel-state"),

  /** Open a sidecar tab inside the main window */
  openSidecarTab: (pagePath) =>
    ipcRenderer.invoke("resonantos-pwa:open-sidecar-tab", pagePath),

  /** Close the current sidecar tab and return to main workspace */
  closeSidecarTab: () =>
    ipcRenderer.invoke("resonantos-pwa:close-sidecar-tab"),
});
