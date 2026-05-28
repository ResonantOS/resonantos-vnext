#!/usr/bin/env node
/**
 * install-browser-first-app.mjs
 *
 * Installs the ResonantOS Browser.app wrapper on macOS (and the equivalent
 * launcher on other platforms).  The app is a thin shell that launches a
 * Chromium-family browser profile pre-loaded with the ResonantOS side-panel
 * extension and a registered native messaging host.
 *
 * Usage:
 *   node scripts/install-browser-first-app.mjs [--dry-run]
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const repoRoot = path.resolve(import.meta.dirname, "..");
const platform = process.platform;
const dryRun = process.argv.includes("--dry-run");

function log(msg) {
  console.log(`[install-browser-first-app] ${msg}`);
}

function run(cmd, opts = {}) {
  if (dryRun) {
    log(`[dry-run] ${cmd}`);
    return;
  }
  execSync(cmd, { stdio: "inherit", ...opts });
}

// ── App name & paths ────────────────────────────────────────────────────────

const APP_NAME = "ResonantOS Browser.app";
const APP_BUNDLE_ID = "ai.resonantos.browser-first";

const installDir =
  platform === "darwin"
    ? "/Applications"
    : platform === "win32"
      ? path.join(process.env.LOCALAPPDATA ?? "C:\\Users\\Default\\AppData\\Local", "ResonantOS")
      : path.join(os.homedir(), ".local", "share", "resonantos");

const appPath = path.join(installDir, APP_NAME);

// ── Native messaging host manifest ─────────────────────────────────────────

const nativeHostName = "ai.resonantos.browser_native";
const nativeHostBinary = path.join(
  repoRoot,
  "addons",
  "resonant-browser-native",
  "build",
  "resonant_browser_native_host",
);

const nativeHostManifest = {
  name: nativeHostName,
  description: "ResonantOS native messaging host for the browser-first extension",
  path: nativeHostBinary,
  type: "stdio",
  allowed_origins: [
    "chrome-extension://bfnaelmomeimhlpmgjnjophhpkkoljpa/",
    "chrome-extension://cdpdmmalhmokbfcfgogoepnjplaakgnl/",
  ],
};

function installNativeHostManifest() {
  let manifestDir;

  if (platform === "darwin") {
    manifestDir = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "NativeMessagingHosts",
    );
  } else if (platform === "linux") {
    manifestDir = path.join(os.homedir(), ".config", "google-chrome", "NativeMessagingHosts");
  } else {
    log("Native host manifest: Windows registry path — skipping (run install script as administrator)");
    return;
  }

  const manifestPath = path.join(manifestDir, `${nativeHostName}.json`);
  log(`Installing native host manifest → ${manifestPath}`);

  if (!dryRun) {
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(nativeHostManifest, null, 2) + "\n", "utf8");
  }
}

// ── macOS .app bundle ───────────────────────────────────────────────────────

function createMacAppBundle() {
  const contentsDir = path.join(appPath, "Contents");
  const macOSDir = path.join(contentsDir, "MacOS");
  const resourcesDir = path.join(contentsDir, "Resources");

  log(`Creating ${APP_NAME} bundle at ${appPath}`);

  if (!dryRun) {
    mkdirSync(macOSDir, { recursive: true });
    mkdirSync(resourcesDir, { recursive: true });
  }

  // Info.plist
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${APP_BUNDLE_ID}</string>
  <key>CFBundleName</key>
  <string>ResonantOS Browser</string>
  <key>CFBundleDisplayName</key>
  <string>ResonantOS Browser</string>
  <key>CFBundleExecutable</key>
  <string>resonantos-browser-first</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;

  if (!dryRun) {
    writeFileSync(path.join(contentsDir, "Info.plist"), plist, "utf8");
  }

  // Launcher shim — delegates to the npm run-browser-first script
  const launcherSh = `#!/bin/bash
# ResonantOS Browser.app launcher shim
REPO_ROOT="${repoRoot}"
exec node "$REPO_ROOT/browser-first/host/run-browser-first.mjs" "$@"
`;

  const launcherPath = path.join(macOSDir, "resonantos-browser-first");
  if (!dryRun) {
    writeFileSync(launcherPath, launcherSh, { encoding: "utf8", mode: 0o755 });
  }

  log(`${APP_NAME} bundle created.`);
}

// ── Main ────────────────────────────────────────────────────────────────────

log(`Platform: ${platform}`);
log(`Install target: ${appPath}`);

if (platform === "darwin") {
  createMacAppBundle();
} else {
  log(`Non-macOS platform (${platform}) — skipping .app bundle, native host manifest only.`);
}

installNativeHostManifest();

log("Done. Launch with: npm run browser-first:dev");
