import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const required = process.env.RESONANT_BUILD_NATIVE_BROWSER === "1" || args.has("--required");
const forcedSkip = process.env.RESONANT_SKIP_NATIVE_BROWSER === "1" || args.has("--skip");
const addonRoot = path.join(root, "addons", "resonant-browser-native");
const cefPlatform = detectCefPlatform();
const cefRoot = path.join(
  addonRoot,
  "vendor",
  "cef",
  `cef_binary_147.0.10+gd58e84d+chromium-147.0.7727.118_${cefPlatform ?? "unsupported"}`,
);
const nativeHostSource = path.join(addonRoot, "native_host");
const buildDir = path.join(addonRoot, "build");
const bridgeDylib = path.join(buildDir, "libResonantBrowserNativeBridgeShared.dylib");
const hostApp = path.join(buildDir, "ResonantBrowserNativeHost.app");
const stagedResourceDir = path.join(root, "build", "native-browser");
const stagedBridgeDylib = path.join(stagedResourceDir, "libResonantBrowserNativeBridgeShared.dylib");
const stagedHostZip = path.join(stagedResourceDir, "ResonantBrowserNativeHost.app.zip");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function adHocSignAppBundle(appPath) {
  // Intent citation: docs/architecture/ADR-037-browser-first-chromium-resonantos.md
  // Browser-first launches the native Chromium host as a macOS .app bundle so
  // AppKit owns the real desktop menu bar. Launch Services rejects CEF bundles
  // with stale copied signatures, so every local build gets a fresh ad-hoc
  // signature after CMake/CEF framework staging completes.
  run("codesign", ["--force", "--deep", "--sign", "-", appPath]);
}

function skip(message) {
  if (required) {
    console.error(message);
    process.exit(1);
  }
  mkdirSync(stagedResourceDir, { recursive: true });
  rmSync(stagedBridgeDylib, { force: true });
  rmSync(stagedHostZip, { force: true });
  console.warn(`${message} Skipping native Browser staging for this build.`);
  process.exit(0);
}

function detectCefPlatform() {
  const platformName = os.platform();
  const arch = os.arch();
  if (platformName === "darwin" && arch === "arm64") return "macosarm64";
  if (platformName === "darwin" && arch === "x64") return "macosx64";
  return null;
}

if (os.platform() !== "darwin") {
  skip("Native Browser staging currently supports only macOS CEF artifacts.");
}

if (forcedSkip) {
  skip("Native Browser staging disabled by RESONANT_SKIP_NATIVE_BROWSER.");
}

if (!existsSync(cefRoot)) {
  skip(
    `CEF binary distribution missing: ${cefRoot}. Run: node addons/resonant-browser-native/scripts/fetch-cef.mjs --download.`,
  );
}

run("cmake", ["-S", nativeHostSource, "-B", buildDir, `-DCEF_ROOT=${cefRoot}`]);
run("cmake", [
  "--build",
  buildDir,
  "--target",
  "ResonantBrowserNativeBridgeShared",
  "ResonantBrowserNativeBridge",
  "ResonantBrowserNativeHost",
  "-j",
  "4",
]);

if (!existsSync(bridgeDylib) || !existsSync(hostApp)) {
  console.error("Native Browser build completed but required artifacts are missing.");
  process.exit(1);
}

writeFileSync(path.join(hostApp, "Contents", "PkgInfo"), "APPL????");
adHocSignAppBundle(hostApp);

mkdirSync(stagedResourceDir, { recursive: true });
copyFileSync(bridgeDylib, stagedBridgeDylib);
rmSync(stagedHostZip, { force: true });

// Intent citation: docs/architecture/ADR-025-native-embedded-browser-host.md
// The Chromium .framework bundle must stay structurally intact; Tauri resource
// recursion rewrites framework internals, so packaged builds carry the host as a
// zip and Rust unpacks it before initializing CEF.
run("/usr/bin/ditto", [
  "-c",
  "-k",
  "--sequesterRsrc",
  "--keepParent",
  hostApp,
  stagedHostZip,
]);

if (!existsSync(stagedBridgeDylib) || !existsSync(stagedHostZip)) {
  console.error("Native Browser staging failed; packaged resources are missing.");
  process.exit(1);
}

console.log(`Native Browser assets staged for Tauri packaging: ${stagedResourceDir}`);
