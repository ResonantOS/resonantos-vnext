// Intent citation: docs/architecture/ADR-035-electron-host-rust-core-runtime.md
//
// Narrow renderer bridge for the Electron migration. The renderer receives a
// typed invoke surface only; Node, filesystem, process, and Electron internals
// remain unavailable to app code and remote browser pages.

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("resonantosElectron", {
  platform: process.platform,
  invoke: (command, args = {}) => ipcRenderer.invoke("resonantos:invoke", command, args),
});
