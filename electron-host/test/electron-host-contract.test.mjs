// Intent citation: docs/architecture/ADR-035-electron-host-rust-core-runtime.md

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

test("Electron host spike is isolated from the Tauri shell", () => {
  assert.equal(existsSync(path.join(repoRoot, "electron-host", "main.mjs")), true);
  assert.equal(existsSync(path.join(repoRoot, "electron-host", "run-smoke.mjs")), true);
  assert.equal(existsSync(path.join(repoRoot, "electron-host", "rust-core-ipc-smoke.mjs")), true);
  assert.equal(existsSync(path.join(repoRoot, "electron-host", "product-main.mjs")), true);
  assert.equal(existsSync(path.join(repoRoot, "electron-host", "preload.mjs")), true);
  assert.equal(existsSync(path.join(repoRoot, "electron-host", "run-product-smoke.mjs")), true);
  assert.equal(existsSync(path.join(repoRoot, "src-tauri", "src", "bin", "electron_core_ipc.rs")), true);
  assert.equal(existsSync(path.join(repoRoot, "addons", "resonant-browser-host", "node_modules", ".bin", "electron")), true);
});

test("Electron host ADR records the runtime split and security boundary", async () => {
  const adr = await import("node:fs/promises").then((fs) =>
    fs.readFile(path.join(repoRoot, "docs", "architecture", "ADR-035-electron-host-rust-core-runtime.md"), "utf8"),
  );
  assert.match(adr, /Electron owns the desktop shell/);
  assert.match(adr, /Rust owns privileged services/);
  assert.match(adr, /nodeIntegration: false/);
  assert.match(adr, /Phantom Wallet/);
  assert.match(adr, /core\.health/);
});

test("Electron product host preserves renderer and browser trust boundaries", async () => {
  const [main, preload, html] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(path.join(repoRoot, "electron-host", "product-main.mjs"), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(path.join(repoRoot, "electron-host", "preload.mjs"), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(path.join(repoRoot, "index.html"), "utf8")),
  ]);

  assert.match(preload, /contextBridge\.exposeInMainWorld\("resonantosElectron"/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /browser_native_webview_show/);
  assert.match(main, /browser\.wallet_host\./);
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(preload, /exposeInMainWorld\([^,]+,\s*process/);
});

test("Wallet browser ADR blocks false Electron wallet readiness", async () => {
  const adr = await import("node:fs/promises").then((fs) =>
    fs.readFile(path.join(repoRoot, "docs", "architecture", "ADR-036-wallet-capable-browser-host.md"), "utf8"),
  );
  assert.match(adr, /must not treat Electron `BrowserView`/);
  assert.match(adr, /Chrome DevTools Protocol/);
  assert.match(adr, /remain human-only/i);
});
