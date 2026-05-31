#!/usr/bin/env node
// Intent citation: docs/architecture/ADR-037-browser-first-chromium-resonantos.md

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeBrowserLaunchLog } from "../browser-first/host/browser-launch-diagnostics.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "logs", "browser-first-installed-app.log");

const logContent = await readFile(logPath, "utf8").catch((error) => {
  console.error(JSON.stringify({
    status: "missing-log",
    logPath,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
  return "";
});

if (logContent) {
  console.log(JSON.stringify({
    logPath,
    ...summarizeBrowserLaunchLog(logContent),
  }, null, 2));
}
