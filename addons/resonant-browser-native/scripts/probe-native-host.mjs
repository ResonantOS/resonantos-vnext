import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "native-browser-host.contract.json");
const sourcePath = path.join(root, "native_host", "src", "resonant_browser_native_host.cc");
const macSourcePath = path.join(root, "native_host", "src", "resonant_browser_native_host_mac.mm");
const bridgeMacSourcePath = path.join(root, "native_host", "src", "resonant_browser_native_bridge_mac.mm");
const bridgeSourcePath = path.join(root, "native_host", "src", "resonant_browser_native_bridge.cc");
const bridgeHeaderPath = path.join(root, "native_host", "include", "resonant_browser_native_bridge.h");
const cmakePath = path.join(root, "native_host", "CMakeLists.txt");
const infoPlistTemplatePath = path.join(root, "native_host", "mac", "Info.plist.in");

const contract = JSON.parse(await readFile(contractPath, "utf8"));
const source = `${await readFile(sourcePath, "utf8")}\n${await readFile(macSourcePath, "utf8")}\n${await readFile(
  bridgeMacSourcePath,
  "utf8",
)}`;
const bridgeSource = await readFile(bridgeSourcePath, "utf8");
const bridgeHeader = await readFile(bridgeHeaderPath, "utf8");
const cmake = await readFile(cmakePath, "utf8");
const infoPlistTemplate = await readFile(infoPlistTemplatePath, "utf8");

const requiredSourceMarkers = [
  "enable-chrome-runtime",
  "use-mock-keychain",
  "password-store",
  "CefScopedLibraryLoader",
  "chrome://extensions",
  "chromewebstore.google.com",
  "window_info.SetAsChild",
  "CefBrowserHost::CreateBrowser",
  "ResonantBrowserApplication",
  "ResonantInstallMainMenu",
  "setMainMenu",
  "ExecuteNativeMenuCommand",
  "resonant_browser_native_execute_menu_command",
  "ExecuteChromeCommandByName",
  "cef_id_for_command_id_name",
  "IDC_NEW_TAB",
  "IDC_SHOW_HISTORY",
  "IDC_BOOKMARK_THIS_TAB",
  "IDC_MANAGE_CHROME_PROFILES",
  "Assistant",
  "Bookmarks",
  "Profiles",
  "Phantom Wallet",
  "Bitwarden",
  "browser.native.attach_view",
  "browser.native.attach_smoke",
  "browser.native.bridge_probe",
  "browser.native.extension.pin",
  "browser.native.wallet.confirmation_state",
  "CefKeyboardHandler",
  "CefDownloadHandler",
  "GetDownloadHandler",
  "OnBeforeDownload",
  "OnDownloadUpdated",
  "browser.native.download_updated",
  "EVENTFLAG_COMMAND_DOWN",
  "EVENTFLAG_CONTROL_DOWN",
  "IsPrimaryBrowserShortcut",
  "OpenNewBrowserSurface",
  "CloseAllBrowserSurfaces",
  "resonant_browser_native_prepare_macos_application_json",
  "resonant_browser_native_initialize_json",
  "resonant_browser_native_attach_macos_ns_view_json",
  "resonant_browser_native_status_json",
];

const forbiddenProductMarkers = ["Electron", "BrowserWindow", "Tauri WebView", "screenshot surface", "iframe"];

const failures = [];

for (const command of contract.commands) {
  if (!source.includes(command)) {
    failures.push(`Native host source does not expose contract command ${command}.`);
  }
}

for (const marker of requiredSourceMarkers) {
  if (!source.includes(marker)) {
    failures.push(`Native host source is missing required marker: ${marker}.`);
  }
}

for (const marker of forbiddenProductMarkers) {
  if (source.includes(marker)) {
    failures.push(`Native host source includes rejected product marker: ${marker}.`);
  }
}

if (!cmake.includes("CEF_ROOT")) {
  failures.push("Native host CMake project must require CEF_ROOT.");
}

if (!cmake.includes("MACOSX_BUNDLE")) {
  failures.push("Native host CMake project must declare a macOS bundle target.");
}

if (!infoPlistTemplate.includes("<string>ResonantBrowserNativeHost</string>")) {
  failures.push("Native host Info.plist must declare the concrete app executable.");
}

if (!infoPlistTemplate.includes("<string>ResonantOS Browser</string>")) {
  failures.push("Native host Info.plist must declare the installable app name.");
}

for (const marker of ["CEF_HELPER_APP_SUFFIXES", "process_helper_mac.cc", "COPY_MAC_FRAMEWORK"]) {
  if (!cmake.includes(marker)) {
    failures.push(`Native host CMake project is missing required macOS CEF bundle marker: ${marker}.`);
  }
}

if (!cmake.includes("ResonantBrowserNativeBridge")) {
  failures.push("Native host CMake project must build the in-process bridge library target.");
}

for (const marker of ["extern \"C\"", "resonant_browser_native_contract_json", "in-process-native-library"]) {
  if (!bridgeHeader.includes(marker) && !bridgeSource.includes(marker)) {
    failures.push(`Native bridge is missing required marker: ${marker}.`);
  }
}

const result = {
  hostId: contract.hostId,
  engineCandidate: "cef-chrome-runtime",
  sourceContractOk: failures.length === 0,
  failures,
  checkedAt: new Date().toISOString(),
};

console.log(JSON.stringify(result, null, 2));

if (failures.length) {
  process.exitCode = 1;
}
