// Intent citation: docs/architecture/ADR-035-electron-host-rust-core-runtime.md

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const electronBinary = path.join(repoRoot, "addons", "resonant-browser-host", "node_modules", ".bin", "electron");
const main = path.join(repoRoot, "electron-host", "product-main.mjs");

const child = spawn(electronBinary, [main, "--product-smoke"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const timeout = setTimeout(() => {
  child.kill("SIGKILL");
}, 30000);

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

const code = await new Promise((resolve) => child.on("exit", resolve));
clearTimeout(timeout);
if (stderr.trim()) {
  process.stderr.write(stderr);
}
process.stdout.write(stdout);

const result = stdout
  .trim()
  .split("\n")
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .at(-1);

if (
  code !== 0 ||
  result?.ok !== true ||
  result?.page?.bridgeAvailable !== true ||
  result?.page?.nodeAvailable !== false ||
  result?.browser?.visible !== true ||
  result?.browser?.status !== "ready"
) {
  process.exitCode = code || 1;
}
