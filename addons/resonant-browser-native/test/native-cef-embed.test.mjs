import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const addonRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(addonRoot, "..", "..");
const bridgeDylib = path.join(addonRoot, "build", "libResonantBrowserNativeBridgeShared.dylib");
const cefFramework = path.join(
  addonRoot,
  "vendor",
  "cef",
  "cef_binary_147.0.10+gd58e84d+chromium-147.0.7727.118_macosarm64",
  "Release",
  "Chromium Embedded Framework.framework",
);
const helper = path.join(
  addonRoot,
  "build",
  "ResonantBrowserNativeHost.app",
  "Contents",
  "Frameworks",
  "ResonantBrowserNativeHost Helper.app",
  "Contents",
  "MacOS",
  "ResonantBrowserNativeHost Helper",
);
const phantomExtensionRoot = path.join(
  process.env.HOME ?? "",
  "Library",
  "Application Support",
  "Google",
  "Chrome",
  "Default",
  "Extensions",
  "bfnaelmomeimhlpmgjnjophhpkkoljpa",
);
const latestPhantomExtensionDir = existsSync(phantomExtensionRoot)
  ? path
      .resolve(
        phantomExtensionRoot,
        (await import("node:fs"))
          .readdirSync(phantomExtensionRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
          .at(0) ?? "",
      )
  : "";

test(
  "native CEF bridge embeds into a real macOS NSView and loads a page",
  {
    skip:
      process.platform !== "darwin" || !existsSync(bridgeDylib) || !existsSync(cefFramework) || !existsSync(helper)
        ? "macOS native bridge, CEF framework, and helper app are required for embedded smoke."
        : false,
  },
  async () => {
    const harnessSource = path.join(tmpdir(), "resonant_browser_embed_harness.mm");
    const harnessBinary = path.join(tmpdir(), "resonant_browser_embed_harness");
    writeFileSync(
      harnessSource,
      `
#import <Cocoa/Cocoa.h>
#include <chrono>
#include <iostream>
#include <string>

extern "C" const char* resonant_browser_native_prepare_macos_application_json(void);
extern "C" const char* resonant_browser_native_initialize_json(const char*, const char*, const char*);
extern "C" const char* resonant_browser_native_attach_macos_ns_view_json(void*, int, int, int, int, const char*);
extern "C" const char* resonant_browser_native_status_json(void);
extern "C" const char* resonant_browser_native_close_json(void);

int main() {
  @autoreleasepool {
    std::cout << resonant_browser_native_prepare_macos_application_json() << std::endl;
    std::cout << resonant_browser_native_initialize_json("${cefFramework}", "${helper}", "${path.join(
        tmpdir(),
        "resonantos-native-browser-harness-cache",
      )}") << std::endl;

    NSRect frame = NSMakeRect(0, 0, 900, 700);
    NSWindow* window = [[NSWindow alloc] initWithContentRect:frame
                                                   styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable)
                                                     backing:NSBackingStoreBuffered
                                                       defer:NO];
    [window setTitle:@"Resonant Browser Native Harness"];
    [window makeKeyAndOrderFront:nil];
    NSView* view = [window contentView];
    std::cout << resonant_browser_native_attach_macos_ns_view_json((__bridge void*)view, 0, 0, 900, 700, "https://example.com") << std::endl;

    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(15);
    std::string last;
    while (std::chrono::steady_clock::now() < deadline) {
      @autoreleasepool {
        NSDate* until = [NSDate dateWithTimeIntervalSinceNow:0.05];
        [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:until];
      }
      last = resonant_browser_native_status_json();
      if (last.find("httpStatus") != std::string::npos && last.find(":200") != std::string::npos) {
        std::cout << last << std::endl;
        std::cout << resonant_browser_native_close_json() << std::endl;
        return 0;
      }
    }
    std::cerr << "Timed out waiting for embedded CEF load. Last status: " << last << std::endl;
    std::cout << resonant_browser_native_close_json() << std::endl;
    return 2;
  }
}
`,
    );

    await execFileAsync(
      "clang++",
      [
        "-std=c++20",
        "-fobjc-arc",
        "-framework",
        "Cocoa",
        harnessSource,
        `-L${path.dirname(bridgeDylib)}`,
        "-lResonantBrowserNativeBridgeShared",
        `-Wl,-rpath,${path.dirname(bridgeDylib)}`,
        "-o",
        harnessBinary,
      ],
      { cwd: repoRoot, timeout: 20000, maxBuffer: 1024 * 1024 },
    );

    const { stdout } = await execFileAsync(harnessBinary, [], {
      cwd: repoRoot,
      timeout: 25000,
      maxBuffer: 1024 * 1024 * 4,
    });
    assert.match(stdout, /"stage":"prepare-application"/);
    assert.match(stdout, /"detail":"CEF initialized in the ResonantOS process\."/);
    assert.match(stdout, /"stage":"attach-view"/);
    assert.match(stdout, /"httpStatus":200/);
    assert.match(stdout, /"url":"https:\/\/example\.com\//);
  },
);

test(
  "native CEF bridge sends click, type, and scroll to the same embedded session",
  {
    skip:
      process.platform !== "darwin" || !existsSync(bridgeDylib) || !existsSync(cefFramework) || !existsSync(helper)
        ? "macOS native bridge, CEF framework, and helper app are required for same-session input smoke."
        : false,
  },
  async () => {
    const harnessSource = path.join(tmpdir(), "resonant_browser_input_harness.mm");
    const harnessBinary = path.join(tmpdir(), "resonant_browser_input_harness");
    const page = encodeURIComponent(`<!doctype html>
<html>
  <body style="margin:0; height:2400px;">
    <button id="target" style="position:absolute; left:20px; top:20px; width:140px; height:40px;"
      onclick="document.title='clicked-same-session'">Click</button>
    <input id="field" style="position:absolute; left:20px; top:90px; width:220px; height:40px;"
      onfocus="document.title='focused-input'"
      oninput="document.title='typed-' + this.value" />
    <script>
      window.addEventListener('wheel', (event) => { document.title = 'scrolled-' + Math.round(event.deltaY); });
    </script>
  </body>
</html>`);
    writeFileSync(
      harnessSource,
      `
#import <Cocoa/Cocoa.h>
#include <chrono>
#include <iostream>
#include <string>

extern "C" const char* resonant_browser_native_prepare_macos_application_json(void);
extern "C" const char* resonant_browser_native_initialize_json(const char*, const char*, const char*);
extern "C" const char* resonant_browser_native_attach_macos_ns_view_json(void*, int, int, int, int, const char*);
extern "C" const char* resonant_browser_native_click_json(int, int);
extern "C" const char* resonant_browser_native_type_text_json(const char*);
extern "C" const char* resonant_browser_native_scroll_json(int, int, int, int);
extern "C" const char* resonant_browser_native_status_json(void);
extern "C" const char* resonant_browser_native_close_json(void);

bool pump_until_contains(const std::string& needle, int seconds) {
  auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(seconds);
  std::string last;
  while (std::chrono::steady_clock::now() < deadline) {
    @autoreleasepool {
      NSDate* until = [NSDate dateWithTimeIntervalSinceNow:0.05];
      [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:until];
    }
    last = resonant_browser_native_status_json();
    if (last.find(needle) != std::string::npos) {
      std::cout << last << std::endl;
      return true;
    }
  }
  std::cerr << "Timed out waiting for " << needle << ". Last status: " << last << std::endl;
  return false;
}

int main() {
  @autoreleasepool {
    std::cout << resonant_browser_native_prepare_macos_application_json() << std::endl;
    std::cout << resonant_browser_native_initialize_json("${cefFramework}", "${helper}", "${path.join(
        tmpdir(),
        "resonantos-native-browser-input-harness-cache",
      )}") << std::endl;

    NSRect frame = NSMakeRect(0, 0, 900, 700);
    NSWindow* window = [[NSWindow alloc] initWithContentRect:frame
                                                   styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable)
                                                     backing:NSBackingStoreBuffered
                                                       defer:NO];
    [window setTitle:@"Resonant Browser Native Input Harness"];
    [window makeKeyAndOrderFront:nil];
    NSView* view = [window contentView];
    std::cout << resonant_browser_native_attach_macos_ns_view_json((__bridge void*)view, 0, 0, 900, 700, "data:text/html,${page}") << std::endl;
    if (!pump_until_contains("\\"httpStatus\\":200", 15)) {
      std::cout << resonant_browser_native_close_json() << std::endl;
      return 2;
    }

    std::cout << resonant_browser_native_click_json(45, 35) << std::endl;
    if (!pump_until_contains("\\"title\\":\\"clicked-same-session", 5)) {
      std::cout << resonant_browser_native_close_json() << std::endl;
      return 3;
    }

    std::cout << resonant_browser_native_click_json(45, 110) << std::endl;
    if (!pump_until_contains("\\"title\\":\\"focused-input", 5)) {
      std::cout << resonant_browser_native_close_json() << std::endl;
      return 4;
    }
    std::cout << resonant_browser_native_type_text_json("abc") << std::endl;
    if (!pump_until_contains("\\"title\\":\\"typed-abc", 5)) {
      std::cout << resonant_browser_native_close_json() << std::endl;
      return 5;
    }

    std::cout << resonant_browser_native_scroll_json(200, 200, 0, 420) << std::endl;
    if (!pump_until_contains("\\"title\\":\\"scrolled-", 5)) {
      std::cout << resonant_browser_native_close_json() << std::endl;
      return 6;
    }

    std::cout << resonant_browser_native_close_json() << std::endl;
    return 0;
  }
}
`,
    );

    await execFileAsync(
      "clang++",
      [
        "-std=c++20",
        "-fobjc-arc",
        "-framework",
        "Cocoa",
        harnessSource,
        `-L${path.dirname(bridgeDylib)}`,
        "-lResonantBrowserNativeBridgeShared",
        `-Wl,-rpath,${path.dirname(bridgeDylib)}`,
        "-o",
        harnessBinary,
      ],
      { cwd: repoRoot, timeout: 20000, maxBuffer: 1024 * 1024 },
    );

    const { stdout } = await execFileAsync(harnessBinary, [], {
      cwd: repoRoot,
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 4,
    });
    assert.match(stdout, /"stage":"click"/);
    assert.match(stdout, /"title":"clicked-same-session/);
    assert.match(stdout, /"stage":"type-text"/);
    assert.match(stdout, /"title":"typed-abc/);
    assert.match(stdout, /"stage":"scroll"/);
    assert.match(stdout, /"title":"scrolled-/);
  },
);

test(
  "native CEF bridge loads Phantom into the embedded product session",
  {
    skip:
      process.platform !== "darwin" ||
      !existsSync(bridgeDylib) ||
      !existsSync(cefFramework) ||
      !existsSync(helper) ||
      !existsSync(path.join(latestPhantomExtensionDir, "manifest.json"))
        ? "macOS native bridge, CEF framework, helper app, and local Phantom extension are required."
        : false,
  },
  async () => {
    const harnessSource = path.join(tmpdir(), "resonant_browser_phantom_embed_harness.mm");
    const harnessBinary = path.join(tmpdir(), "resonant_browser_phantom_embed_harness");
    writeFileSync(
      harnessSource,
      `
#import <Cocoa/Cocoa.h>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <string>

extern "C" const char* resonant_browser_native_prepare_macos_application_json(void);
extern "C" const char* resonant_browser_native_initialize_json(const char*, const char*, const char*);
extern "C" const char* resonant_browser_native_attach_macos_ns_view_json(void*, int, int, int, int, const char*);
extern "C" const char* resonant_browser_native_probe_phantom_json(void);
extern "C" const char* resonant_browser_native_status_json(void);
extern "C" const char* resonant_browser_native_close_json(void);

bool pump_until_contains(const std::string& needle, int seconds) {
  auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(seconds);
  std::string last;
  while (std::chrono::steady_clock::now() < deadline) {
    @autoreleasepool {
      NSDate* until = [NSDate dateWithTimeIntervalSinceNow:0.05];
      [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:until];
    }
    last = resonant_browser_native_status_json();
    if (last.find(needle) != std::string::npos) {
      std::cout << last << std::endl;
      return true;
    }
  }
  std::cerr << "Timed out waiting for " << needle << ". Last status: " << last << std::endl;
  return false;
}

int main() {
  @autoreleasepool {
    setenv("RESONANTOS_PHANTOM_EXTENSION_DIR", "${latestPhantomExtensionDir}", 1);
    std::cout << resonant_browser_native_prepare_macos_application_json() << std::endl;
    std::cout << resonant_browser_native_initialize_json("${cefFramework}", "${helper}", "${path.join(
        tmpdir(),
        "resonantos-native-browser-phantom-embed-cache",
      )}") << std::endl;

    NSRect frame = NSMakeRect(0, 0, 900, 700);
    NSWindow* window = [[NSWindow alloc] initWithContentRect:frame
                                                   styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable)
                                                     backing:NSBackingStoreBuffered
                                                       defer:NO];
    [window setTitle:@"Resonant Browser Native Phantom Harness"];
    [window makeKeyAndOrderFront:nil];
    NSView* view = [window contentView];
    std::cout << resonant_browser_native_attach_macos_ns_view_json((__bridge void*)view, 0, 0, 900, 700, "https://example.com") << std::endl;
    if (!pump_until_contains("\\"httpStatus\\":200", 15)) {
      std::cout << resonant_browser_native_close_json() << std::endl;
      return 2;
    }

    std::cout << resonant_browser_native_probe_phantom_json() << std::endl;
    if (!pump_until_contains("resonant-phantom-provider-detected", 15)) {
      std::cout << resonant_browser_native_close_json() << std::endl;
      return 3;
    }

    std::cout << resonant_browser_native_close_json() << std::endl;
    return 0;
  }
}
`,
    );

    await execFileAsync(
      "clang++",
      [
        "-std=c++20",
        "-fobjc-arc",
        "-framework",
        "Cocoa",
        harnessSource,
        `-L${path.dirname(bridgeDylib)}`,
        "-lResonantBrowserNativeBridgeShared",
        `-Wl,-rpath,${path.dirname(bridgeDylib)}`,
        "-o",
        harnessBinary,
      ],
      { cwd: repoRoot, timeout: 20000, maxBuffer: 1024 * 1024 },
    );

    const { stdout } = await execFileAsync(harnessBinary, [], {
      cwd: repoRoot,
      timeout: 35000,
      maxBuffer: 1024 * 1024 * 4,
    });
    assert.match(stdout, /"stage":"probe-phantom"/);
    assert.match(stdout, /resonant-phantom-provider-detected/);
  },
);
