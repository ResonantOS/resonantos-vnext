// Intent citation: docs/architecture/ADR-025-native-embedded-browser-host.md
//
// This bridge is intentionally in-process. It gives the Rust host a stable
// native boundary before CEF view lifecycle calls are wired into Tauri.

#include "resonant_browser_native_bridge.h"

const char* resonant_browser_native_contract_json(void) {
  return R"json({
    "hostId":"resonant-browser-native",
    "integrationMode":"in-process-native-library",
    "engineCandidate":"cef-chrome-runtime",
    "commands":[
      "browser.native.probe",
      "browser.native.bridge_probe",
      "browser.native.start",
      "browser.native.attach_smoke",
      "browser.native.attach_view",
      "browser.native.set_bounds",
      "browser.native.open_url",
      "browser.native.back",
      "browser.native.forward",
      "browser.native.reload",
      "browser.native.read_page",
      "browser.native.click",
      "browser.native.type",
      "browser.native.scroll",
      "browser.native.extension.install",
      "browser.native.extension.list",
      "browser.native.extension.enable",
      "browser.native.extension.pin",
      "browser.native.extension.disable",
      "browser.native.wallet.confirmation_state",
      "browser.native.close"
    ]
  })json";
}

const char* resonant_browser_native_in_process_status_json(void) {
  return R"json({
    "status":"bridge-ready",
    "embedBoundary":"in-process",
    "externalProcessAttach":"rejected",
    "next":"wire CEF lifecycle calls behind this ABI and link it through the Tauri/Rust host"
  })json";
}
