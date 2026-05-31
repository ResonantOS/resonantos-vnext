import assert from "node:assert/strict";
import test from "node:test";

import { summarizeBrowserLaunchLog } from "../host/browser-launch-diagnostics.mjs";

test("browser launch diagnostics proves native Chromium app readiness from launch log", () => {
  const summary = summarizeBrowserLaunchLog(`
{"event":"browser.first.launch_mode","mode":"mac-app-bundle","appBundle":"/private/home/ResonantBrowserNativeHost.app"}
{
  "phantomLoaded": true,
  "pinnedExtensions": [
    "cdpdmmalhmokbfcfgogoepnjplaakgnl",
    "bfnaelmomeimhlpmgjnjophhpkkoljpa"
  ]
}
{"event":"browser.native.appkit_menu.installed","menus":["ResonantOS Browser","File","Edit","View","Assistant","History","Bookmarks","Profiles","Tab","Window","Help"]}
{"event":"browser.native.cef_initialize_ok"}
{"hostId":"resonant-browser-native","engineCandidate":"cef-chrome-runtime"}
{"event":"browser.native.load_end","status":200,"url":"chrome-extension://cdpdmmalhmokbfcfgogoepnjplaakgnl/src/main-workspace.html"}
`);

  assert.equal(summary.status, "ready");
  assert.equal(summary.launchMode, "mac-app-bundle");
  assert.equal(summary.appkitMenu, "installed");
  assert.equal(summary.cefInitialized, true);
  assert.equal(summary.nativeHostStarted, true);
  assert.equal(summary.mainWorkspaceLoaded, true);
  assert.equal(summary.phantomLoaded, true);
  assert.equal(summary.pinnedExtensions.resonantOS, true);
  assert.equal(summary.pinnedExtensions.phantom, true);
  assert.deepEqual(summary.menuNames, [
    "ResonantOS Browser",
    "File",
    "Edit",
    "View",
    "Assistant",
    "History",
    "Bookmarks",
    "Profiles",
    "Tab",
    "Window",
    "Help",
  ]);
});

test("browser launch diagnostics flags direct fallback or missing menu as attention", () => {
  const summary = summarizeBrowserLaunchLog(`
{"event":"browser.first.launch_mode","mode":"direct-native-host","directHost":"/tmp/host"}
{"event":"browser.native.appkit_menu.disabled","reason":"direct-or-smoke-launch"}
{"event":"browser.native.cef_initialize_ok"}
{"hostId":"resonant-browser-native","engineCandidate":"cef-chrome-runtime"}
{"event":"browser.native.load_end","status":200,"url":"chrome-extension://cdpdmmalhmokbfcfgogoepnjplaakgnl/src/main-workspace.html"}
`);

  assert.equal(summary.status, "attention");
  assert.equal(summary.launchMode, "direct-native-host");
  assert.equal(summary.appkitMenu, "disabled");
  assert.equal(summary.phantomLoaded, false);
});
