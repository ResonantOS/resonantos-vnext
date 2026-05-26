// Intent citation: docs/architecture/ADR-035-electron-host-rust-core-runtime.md

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tauriRoot = path.join(repoRoot, "src-tauri");

const child = spawn("cargo", ["run", "--quiet", "--bin", "electron_core_ipc"], {
  cwd: tauriRoot,
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

const lines = createInterface({ input: child.stdout });
const firstLine = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Timed out waiting for Rust core IPC response.")), 20000);
  lines.once("line", (line) => {
    clearTimeout(timeout);
    resolve(line);
  });
  child.once("error", reject);
  child.once("exit", (code) => {
    if (code !== 0) {
      reject(new Error(`Rust core IPC exited before responding with code ${code}.`));
    }
  });
});

child.stdin.write(`${JSON.stringify({ id: "health-1", method: "core.health", params: {} })}\n`);

let response;
try {
  response = JSON.parse(await firstLine);
} finally {
  child.stdin.end();
}

await new Promise((resolve) => child.once("exit", resolve));

if (stderr.trim()) {
  process.stderr.write(stderr);
}
process.stdout.write(`${JSON.stringify({ ok: true, rustCore: response })}\n`);

if (
  response?.id !== "health-1" ||
  response?.result?.ready !== true ||
  response?.result?.privilegedBoundary !== "rust" ||
  response?.result?.secretsExposed !== false
) {
  process.exitCode = 1;
}
