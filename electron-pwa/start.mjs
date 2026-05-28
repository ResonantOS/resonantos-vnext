/**
 * ResonantOS Electron PWA — dev launcher
 *
 * Usage:
 *   node electron-pwa/start.mjs
 *
 * Or via npm script:
 *   npm run electron-pwa:dev
 *
 * Finds the local electron binary (installed in electron-pwa/node_modules)
 * and launches the main process.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve electron binary from local install inside electron-pwa/
const require = createRequire(new URL("./package.json", import.meta.url));
let electronBin;
try {
  electronBin = require("electron");
} catch {
  console.error(
    "[start] electron not found. Run: cd electron-pwa && npm install"
  );
  process.exit(1);
}

const mainPath = path.join(__dirname, "main.mjs");
console.log(`[start] Launching Electron: ${electronBin} ${mainPath}`);

const child = spawn(electronBin, [mainPath], {
  stdio: "inherit",
  env: { ...process.env },
  cwd: __dirname,
});

child.on("exit", (code) => process.exit(code ?? 0));
