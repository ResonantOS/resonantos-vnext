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
const launcherSourcePath = path.join(resourcesDir, `${executableName}.c`);
const logPath = path.join(repoRoot, "logs", "browser-first-installed-app.log");
const launchScriptPath = path.join(repoRoot, "browser-first", "host", "run-browser-first.mjs");

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
  int log_fd = open(${cString(logPath)}, O_CREAT | O_WRONLY | O_APPEND, 0644);
  if (log_fd >= 0) {
    dup2(log_fd, STDOUT_FILENO);
    dup2(log_fd, STDERR_FILENO);
    close(log_fd);
  }
  pid_t pid = fork();
  if (pid < 0) {
    return 72;
  }
  if (pid == 0) {
    setsid();
    execlp("node", "node", ${cString(launchScriptPath)}, (char*)0);
    _exit(71);
  }
  return 0;
}
`;

await rm(targetApp, { recursive: true, force: true });
await mkdir(macosDir, { recursive: true });
await mkdir(resourcesDir, { recursive: true });
await writeFile(path.join(contentsDir, "Info.plist"), plist);
await writeFile(path.join(contentsDir, "PkgInfo"), "APPL????");
await writeFile(launcherSourcePath, launcherSource);
const compile = spawnSync("clang", [launcherSourcePath, "-o", executablePath], { stdio: "pipe" });
if (compile.status !== 0) {
  throw new Error(`Failed to compile app launcher: ${compile.stderr?.toString() || compile.stdout?.toString()}`);
}
await chmod(executablePath, 0o755);
const sign = spawnSync("codesign", ["--force", "--deep", "--sign", "-", targetApp], { stdio: "pipe" });
if (sign.status !== 0) {
  throw new Error(`Failed to sign app launcher: ${sign.stderr?.toString() || sign.stdout?.toString()}`);
}

console.log(JSON.stringify({ ok: true, targetApp, executablePath, repoRoot, logPath }, null, 2));
