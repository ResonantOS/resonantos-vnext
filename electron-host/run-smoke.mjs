// Intent citation: docs/architecture/ADR-035-electron-host-rust-core-runtime.md

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const electronBinary = path.join(repoRoot, "addons", "resonant-browser-host", "node_modules", ".bin", "electron");
const main = path.join(repoRoot, "electron-host", "main.mjs");

const child = spawn(electronBinary, [main, "--smoke"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

const code = await new Promise((resolve) => child.on("exit", resolve));
if (stderr.trim()) {
  process.stderr.write(stderr);
}
process.stdout.write(stdout);

const lines = stdout.trim().split("\n").filter(Boolean);
const lastJson = lines.map((line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}).filter(Boolean).at(-1);

if (code !== 0 || !lastJson?.ok) {
  process.exitCode = code || 1;
} else if (lastJson.browser?.clicked !== true || lastJson.browser?.typed !== true || lastJson.security?.nodeAvailableInPage !== false) {
  process.exitCode = 1;
} else if (lastJson.phantom?.loaded && lastJson.phantom?.providerDetected !== true) {
  process.exitCode = 1;
}
