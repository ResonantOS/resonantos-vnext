const resonantExtensionId = "cdpdmmalhmokbfcfgogoepnjplaakgnl";
const phantomExtensionId = "bfnaelmomeimhlpmgjnjophhpkkoljpa";

function parseJsonLines(logContent = "") {
  const events = [];
  for (const line of String(logContent).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        events.push(parsed);
      }
    } catch {
      // Multi-line pretty-printed blocks are intentionally ignored here.
      // The diagnostics below also checks stable string markers from those blocks.
    }
  }
  return events;
}

function lastMatching(events, predicate) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (predicate(events[index])) {
      return events[index];
    }
  }
  return null;
}

export function summarizeBrowserLaunchLog(logContent = "") {
  const content = String(logContent);
  const events = parseJsonLines(content);
  const launchModeEvent = lastMatching(events, (event) => event.event === "browser.first.launch_mode");
  const bridgeStartedEvent = lastMatching(events, (event) => event.event === "browser.first.bridge_started");
  const bridgeFailedEvent = lastMatching(events, (event) => event.event === "browser.first.bridge_failed");
  const menuInstalledEvent = lastMatching(events, (event) => event.event === "browser.native.appkit_menu.installed");
  const menuDisabledEvent = lastMatching(events, (event) => event.event === "browser.native.appkit_menu.disabled");
  const loadEndEvent = lastMatching(events, (event) => event.event === "browser.native.load_end");

  const phantomPinned = content.includes(phantomExtensionId);
  const resonantPinned = content.includes(resonantExtensionId);
  const phantomLoaded = /"phantomLoaded"\s*:\s*true/.test(content) ||
    events.some((event) => event.event === "browser.native.phantom_provider_detection" && event.detected === true);
  const cefInitialized = events.some((event) => event.event === "browser.native.cef_initialize_ok");
  const nativeHostStarted = content.includes("\"hostId\":\"resonant-browser-native\"") ||
    content.includes('"hostId": "resonant-browser-native"');
  const mainWorkspaceLoaded = events.some((event) =>
    event.event === "browser.native.load_end" &&
    String(event.url ?? "").includes(`${resonantExtensionId}/src/main-workspace.html`)
  );

  const appkitMenu = menuInstalledEvent
    ? "installed"
    : menuDisabledEvent
      ? "disabled"
      : "unknown";
  const launchMode = launchModeEvent?.mode ?? (menuInstalledEvent ? "mac-app-bundle" : "unknown");
  const status = appkitMenu === "installed" &&
    cefInitialized &&
    nativeHostStarted &&
    mainWorkspaceLoaded &&
    phantomLoaded &&
    resonantPinned
    ? "ready"
    : "attention";

  return {
    status,
    launchMode,
    appkitMenu,
    menuNames: Array.isArray(menuInstalledEvent?.menus) ? menuInstalledEvent.menus : [],
    nativeHostStarted,
    cefInitialized,
    mainWorkspaceLoaded,
    phantomLoaded,
    bridge: bridgeStartedEvent
      ? {
          status: "started",
          requestedPort: bridgeStartedEvent.requestedPort,
          attemptedPort: bridgeStartedEvent.attemptedPort,
          actualPort: bridgeStartedEvent.actualPort,
          recovered: Boolean(bridgeStartedEvent.recovered),
        }
      : bridgeFailedEvent
        ? {
            status: "failed",
            requestedPort: bridgeFailedEvent.requestedPort,
            code: bridgeFailedEvent.code,
            message: bridgeFailedEvent.message,
          }
        : { status: "unknown" },
    pinnedExtensions: {
      resonantOS: resonantPinned,
      phantom: phantomPinned,
    },
    lastLoadedUrl: loadEndEvent?.url ?? "",
    lastEvents: events
      .filter((event) => typeof event.event === "string")
      .slice(-12)
      .map((event) => ({
        event: event.event,
        mode: event.mode,
        status: event.status,
        url: event.url,
        title: event.title,
        reason: event.reason,
      })),
  };
}
