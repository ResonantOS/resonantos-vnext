// Intent citation: docs/architecture/ADR-035-electron-host-rust-core-runtime.md

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const electronBinary = path.join(repoRoot, "addons", "resonant-browser-host", "node_modules", ".bin", "electron");
const main = path.join(repoRoot, "electron-host", "product-main.mjs");

const child = spawn(electronBinary, [main], {
  cwd: repoRoot,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
