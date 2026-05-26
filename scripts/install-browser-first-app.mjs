import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installRoot = process.env.RESONANTOS_BROWSER_INSTALL_ROOT ?? "/Applications";
const targetApp = path.join(installRoot, "ResonantOS Browser.app");
const contentsDir = path.join(targetApp, "Contents");
const macosDir = path.join(contentsDir, "MacOS");
const resourcesDir = path.join(contentsDir, "Resources");
const executableName = "ResonantOSBrowserLauncher";
const executablePath = path.join(macosDir, executableName);
const launcherSourcePath = path.join(macosDir, `${executableName}.c`);
const logPath = path.join(repoRoot, "logs", "browser-first-installed-app.log");

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>English</string>
  <key>CFBundleExecutable</key>
  <string>${executableName}</string>
  <key>CFBundleIdentifier</key>
  <string>com.resonantos.browser-first.launcher</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>ResonantOS Browser</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;

const cString = (value) => JSON.stringify(value);
const launcherSource = `#include <fcntl.h>
#include <stdlib.h>
#include <unistd.h>

int main(void) {
  setenv("PATH", "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", 1);
  if (chdir(${cString(repoRoot)}) != 0) {
    return 70;
  }
  system("mkdir -p logs");
  system("pkill -9 -x ResonantBrowserNativeHost >/dev/null 2>&1 || true");
  system("pkill -9 -x 'ResonantBrowserNativeHost Helper' >/dev/null 2>&1 || true");
  system("pkill -9 -x 'ResonantBrowserNativeHost Helper (Renderer)' >/dev/null 2>&1 || true");
  system("pkill -9 -x 'ResonantBrowserNativeHost Helper (GPU)' >/dev/null 2>&1 || true");
  system("pkill -9 -x 'ResonantBrowserNativeHost Helper (Alerts)' >/dev/null 2>&1 || true");
  system("pkill -9 -x 'ResonantBrowserNativeHost Helper (Plugin)' >/dev/null 2>&1 || true");
  int log_fd = open(${cString(logPath)}, O_CREAT | O_WRONLY | O_APPEND, 0644);
  if (log_fd >= 0) {
    dup2(log_fd, STDOUT_FILENO);
    dup2(log_fd, STDERR_FILENO);
    close(log_fd);
  }
  execlp("node", "node", "browser-first/host/run-browser-first.mjs", (char*)0);
  return 71;
}
`;

await rm(targetApp, { recursive: true, force: true });
await mkdir(macosDir, { recursive: true });
await mkdir(resourcesDir, { recursive: true });
await writeFile(path.join(contentsDir, "Info.plist"), plist);
await writeFile(launcherSourcePath, launcherSource);
const compile = spawnSync("clang", [launcherSourcePath, "-o", executablePath], { stdio: "pipe" });
if (compile.status !== 0) {
  throw new Error(`Failed to compile app launcher: ${compile.stderr?.toString() || compile.stdout?.toString()}`);
}
await chmod(executablePath, 0o755);

console.log(JSON.stringify({ ok: true, targetApp, executablePath, repoRoot, logPath }, null, 2));
