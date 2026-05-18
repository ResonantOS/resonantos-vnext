// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md
// Intent citation: docs/architecture/ADR-017-resonant-browser-addon.md

import { FormEvent, useEffect, useRef, useState, MouseEvent as ReactMouseEvent } from "react";
import { isWebMode, webInvoke } from "../../core/web-transport";
import type {
  AddOnInstallation,
  AddOnManifest,
  BrowserExtensionState,
  BrowserNativeWebviewBounds,
  BrowserWorkspaceState,
  BrowserWorkspaceTabState,
  CapabilityGrant,
  NativeBrowserAttachSmokeResult,
  NativeBrowserBridgeProbeResult,
  NativeBrowserProbeResult,
} from "../../core/contracts";

type BrowserWorkspaceProps = {
  manifest?: AddOnManifest;
  installation?: AddOnInstallation;
  workspaceState: BrowserWorkspaceState;
  onWorkspaceStateChange: (state: BrowserWorkspaceState) => void;
  onConfigureAddon: () => void;
  onGrantVisibleAccess?: () => void;
  onShowNativeWebview?: (input: { url: string; bounds: BrowserNativeWebviewBounds; navigate: boolean }) => Promise<string>;
  onResizeNativeWebview?: (bounds: BrowserNativeWebviewBounds) => Promise<void>;
  onHideNativeWebview?: () => Promise<void>;
  onSyncControlledSession?: (url: string) => Promise<string>;
  onReadActivePage?: (url: string) => Promise<string>;
  onProbeNativeBrowser?: () => Promise<NativeBrowserProbeResult>;
  onSmokeTestNativeAttach?: () => Promise<NativeBrowserAttachSmokeResult>;
  onProbeNativeBridge?: () => Promise<NativeBrowserBridgeProbeResult>;
  onLoadPriorityExtension?: (target: "phantom" | "bitwarden") => Promise<string>;
  onListVisibleExtensions?: () => Promise<BrowserExtensionState[]>;
  onSetExtensionPinned?: (extensionId: string, pinned: boolean) => Promise<BrowserExtensionState[]>;
  onDisableExtension?: (extensionId: string) => Promise<BrowserExtensionState[]>;
};

// ---------------------------------------------------------------------------
// CloudBrowserView — mobile-friendly cloud browser for isWebMode()
// ---------------------------------------------------------------------------

function normalizeCloudUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "https://resonantos.com";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// API response shapes (server uses camelCase)
type CloudSession = { sessionId: string; url?: string; status?: string };
type CloudScreenshot = { imageDataBase64: string; mimeType?: string; status?: string };

function CloudBrowserView() {
  const [draftUrl, setDraftUrl] = useState("https://resonantos.com");
  const [liveUrl, setLiveUrl] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Not connected");
  const imgRef = useRef<HTMLImageElement>(null);

  const captureScreenshot = async (sid: string) => {
    try {
      const res = await webInvoke<CloudScreenshot>("browser_session_screenshot", { sessionId: sid });
      if (res.imageDataBase64) {
        const mime = res.mimeType ?? "image/jpeg";
        setScreenshot(`data:${mime};base64,${res.imageDataBase64}`);
      }
    } catch {
      // screenshot may not be ready yet; silently ignore
    }
  };

  const doNavigate = async (targetUrl: string, existingSession?: string) => {
    const normalized = normalizeCloudUrl(targetUrl);
    setLoading(true);
    setError("");
    setStatus("Connecting…");
    try {
      let sid = existingSession ?? sessionId;
      if (!sid) {
        const res = await webInvoke<CloudSession>("browser_start_session", { url: normalized });
        sid = res.sessionId;
        setSessionId(sid);
        setStatus("Session started");
      } else {
        await webInvoke("browser_session_open_url", { sessionId: sid, url: normalized });
        setStatus("Navigating…");
      }
      setLiveUrl(normalized);
      setDraftUrl(normalized);
      // Give the page a moment to render before screenshotting
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await captureScreenshot(sid!);
      setStatus("Ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Browser error";
      setError(msg);
      setStatus("Error");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void doNavigate(draftUrl);
  };

  const handleRefresh = () => {
    if (liveUrl) void doNavigate(liveUrl);
  };

  const handleImgClick = async (e: ReactMouseEvent<HTMLImageElement>) => {
    if (!sessionId || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    // Map touch/click coords to 1280×800 browser viewport
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1280);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 800);
    try {
      await webInvoke("browser_session_click", { sessionId, x, y });
      await new Promise((resolve) => setTimeout(resolve, 800));
      await captureScreenshot(sessionId);
    } catch {
      // ignore click errors
    }
  };

  return (
    <div className="cloud-browser" data-testid="cloud-browser">
      <div className="cloud-browser-header">
        <form className="cloud-browser-url-form" onSubmit={handleSubmit}>
          <input
            className="cloud-browser-url-input"
            type="url"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="https://resonantos.com"
            aria-label="Browser URL"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="cloud-browser-go" aria-label="Navigate" disabled={loading}>
            {loading ? "…" : "Go"}
          </button>
        </form>
        <button
          type="button"
          className="cloud-browser-refresh"
          aria-label="Refresh"
          onClick={handleRefresh}
          disabled={loading || !liveUrl}
        >
          ↻
        </button>
      </div>

      <div className="cloud-browser-status-bar">
        <span className={`cloud-browser-status-dot ${error ? "error" : loading ? "loading" : sessionId ? "ready" : ""}`} />
        <span className="cloud-browser-status-text">{error || status}</span>
        {liveUrl ? <span className="cloud-browser-live-url">{liveUrl}</span> : null}
      </div>

      <div className="cloud-browser-viewport">
        {screenshot ? (
          <img
            ref={imgRef}
            src={screenshot}
            alt="Browser viewport"
            className="cloud-browser-screenshot"
            onClick={handleImgClick}
            draggable={false}
          />
        ) : (
          <div className="cloud-browser-empty">
            {loading ? (
              <>
                <div className="cloud-browser-spinner" />
                <p>Starting CamoFox…</p>
              </>
            ) : (
              <>
                <p>Enter a URL and tap <strong>Go</strong> to browse.</p>
                <button
                  type="button"
                  className="cloud-browser-start-btn"
                  onClick={() => void doNavigate(draftUrl)}
                >
                  Open Browser
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop BrowserWorkspace — unchanged below
// ---------------------------------------------------------------------------

const DEFAULT_BROWSER_URL = "https://resonantos.com";
const CHROME_WEB_STORE_URL = "https://chromewebstore.google.com/category/extensions";
const BROWSER_MENU_ITEMS = ["File", "Edit", "View", "History", "Bookmarks", "Profiles", "Tab", "Window", "Help"] as const;
type BrowserMenuName = (typeof BROWSER_MENU_ITEMS)[number];
const BROWSER_BOOKMARK_ITEMS = [
  { label: "ResonantOS", url: "https://resonantos.com" },
  { label: "Search", url: "https://google.com" },
  { label: "Chrome Web Store", url: CHROME_WEB_STORE_URL },
  { label: "Manolo Remiddi", url: "https://manoloremiddi.com" },
];
const createBrowserTab = (id: string, url = DEFAULT_BROWSER_URL): BrowserWorkspaceTabState => ({
  id,
  label: labelFromUrl(url),
  url,
  history: [url],
  historyIndex: 0,
});

const hasGrant = (installation: AddOnInstallation | undefined, capability: CapabilityGrant["capability"]): boolean =>
  Boolean(installation?.enabled && installation.grantedCapabilities.some((grant) => grant.capability === capability && grant.granted));

const normalizeBrowserUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_BROWSER_URL;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

function labelFromUrl(url: string): string {
  try {
    return new URL(url).hostname || "Browser";
  } catch {
    return "Browser";
  }
}

function isSafeBrowserUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function BrowserWorkspace({
  manifest,
  installation,
  workspaceState,
  onWorkspaceStateChange,
  onConfigureAddon,
  onGrantVisibleAccess,
  onShowNativeWebview,
  onResizeNativeWebview,
  onHideNativeWebview,
  onSyncControlledSession,
  onReadActivePage,
  onProbeNativeBrowser,
  onSmokeTestNativeAttach,
  onProbeNativeBridge,
  onLoadPriorityExtension,
  onListVisibleExtensions,
  onSetExtensionPinned,
  onDisableExtension,
}: BrowserWorkspaceProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLFormElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const tabs = workspaceState.tabs.length ? workspaceState.tabs : [createBrowserTab("tab-1")];
  const activeTabId = tabs.some((tab) => tab.id === workspaceState.activeTabId) ? workspaceState.activeTabId : tabs[0].id;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const [draftUrl, setDraftUrl] = useState(activeTab?.url ?? DEFAULT_BROWSER_URL);
  const [error, setError] = useState("");
  const [controlledActionStatus, setControlledActionStatus] = useState("");
  const [openMenu, setOpenMenu] = useState<BrowserMenuName | null>(null);
  const [extensions, setExtensions] = useState<BrowserExtensionState[]>([]);
  const [nativeProbe, setNativeProbe] = useState<NativeBrowserProbeResult | null>(null);
  const [nativeAttachSmoke, setNativeAttachSmoke] = useState<NativeBrowserAttachSmokeResult | null>(null);
  const [nativeBridgeProbe, setNativeBridgeProbe] = useState<NativeBrowserBridgeProbeResult | null>(null);

  const networkGranted = hasGrant(installation, "network");
  const embeddingGranted = hasGrant(installation, "ui-embedding");
  const browserControlGranted = hasGrant(installation, "browser-control");
  const filesystemGranted = hasGrant(installation, "filesystem");
  const browserReady = networkGranted && embeddingGranted && browserControlGranted && filesystemGranted;
  const canGoBack = Boolean(activeTab && activeTab.historyIndex > 0);
  const canGoForward = Boolean(activeTab && activeTab.historyIndex < activeTab.history.length - 1);

  const measureNativeBounds = (): BrowserNativeWebviewBounds | null => {
    const element = viewportRef.current;
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    // Intent citation: ADR-017. The native child webview is mounted inside this
    // viewport. Adding browser-chrome padding here creates the false top margin
    // and oversized page feel the user reported.
    const safeTop = rect.top;
    const safeLeft = rect.left + 1;
    return {
      x: safeLeft,
      y: safeTop,
      width: Math.max(1, rect.right - safeLeft - 1),
      height: Math.max(1, rect.bottom - safeTop - 1),
    };
  };

  useEffect(() => {
    setDraftUrl(activeTab?.url ?? DEFAULT_BROWSER_URL);
  }, [activeTab?.url]);

  useEffect(() => {
    if (!browserReady || !activeTab || !onShowNativeWebview) {
      return;
    }

    let cancelled = false;
    const showNativeWebview = async (navigate: boolean) => {
      const bounds = measureNativeBounds();
      if (!bounds) {
        return;
      }
      try {
        const status = await onShowNativeWebview({ url: activeTab.url, bounds, navigate });
        if (!cancelled) {
          setControlledActionStatus(status);
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Native Browser webview failed to open.");
        }
      }
    };

    const animationFrame = window.requestAnimationFrame(() => {
      void showNativeWebview(workspaceState.controlledSession.status !== "ready");
    });

    const resizeNativeWebview = () => {
      const bounds = measureNativeBounds();
      if (bounds && onResizeNativeWebview) {
        void onResizeNativeWebview(bounds).catch(() => undefined);
      }
    };
    const observer =
      typeof ResizeObserver === "undefined" || !viewportRef.current ? null : new ResizeObserver(resizeNativeWebview);
    if (observer && viewportRef.current) {
      observer.observe(viewportRef.current);
    }
    window.addEventListener("resize", resizeNativeWebview);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener("resize", resizeNativeWebview);
      if (onHideNativeWebview) {
        void onHideNativeWebview().catch(() => undefined);
      }
    };
  }, [activeTab?.id, browserReady]);

  useEffect(() => {
    if (browserReady || !onHideNativeWebview) {
      return;
    }
    void onHideNativeWebview().catch(() => undefined);
  }, [browserReady, onHideNativeWebview]);

  useEffect(() => {
    if (!browserReady || !onProbeNativeBrowser) {
      return;
    }
    let cancelled = false;
    void onProbeNativeBrowser()
      .then((result) => {
        if (!cancelled) {
          setNativeProbe(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Native Browser probe failed.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [browserReady, onProbeNativeBrowser]);

  const commitBrowserState = (nextTabs: BrowserWorkspaceTabState[], nextActiveTabId = activeTabId) => {
    onWorkspaceStateChange({
      activeTabId: nextTabs.some((tab) => tab.id === nextActiveTabId) ? nextActiveTabId : nextTabs[0]?.id ?? "tab-1",
      tabs: nextTabs.length ? nextTabs : [createBrowserTab("tab-1")],
      controlledSession: workspaceState.controlledSession,
    });
  };

  const navigateNativeWebview = (url: string) => {
    if (!onShowNativeWebview) {
      return;
    }
    const bounds = measureNativeBounds();
    if (bounds) {
      void onShowNativeWebview({ url, bounds, navigate: true }).catch((error) => {
        setError(error instanceof Error ? error.message : "Native Browser navigation failed.");
      });
    }
  };

  const navigateTo = (url: string, mode: "push" | "replace") => {
    const nextUrl = normalizeBrowserUrl(url);
    if (!isSafeBrowserUrl(nextUrl)) {
      setError("Browser only accepts http and https URLs in this version.");
      return;
    }
    setError("");
    commitBrowserState(
      tabs.map((tab) => {
        if (tab.id !== activeTabId) {
          return tab;
        }
        const nextHistory =
          mode === "push"
            ? [...tab.history.slice(0, tab.historyIndex + 1), nextUrl]
            : tab.history.length
              ? tab.history.map((entry, index) => (index === tab.historyIndex ? nextUrl : entry))
              : [nextUrl];
        return {
          ...tab,
          label: labelFromUrl(nextUrl),
          url: nextUrl,
          history: nextHistory,
          historyIndex: mode === "push" ? nextHistory.length - 1 : Math.max(0, tab.historyIndex),
        };
      }),
    );
    if (onSyncControlledSession) {
      // Intent citation: ADR-025. The native webview is the visible Browser.
      // Legacy controlled-session sync is telemetry only and must not overlay
      // false error toasts on a working page.
      void onSyncControlledSession(nextUrl).catch(() => undefined);
    }
    navigateNativeWebview(nextUrl);
  };

  const submitNavigation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigateTo(draftUrl, "push");
  };

  const addTab = () => {
    const id = `tab-${Date.now()}`;
    const tab = createBrowserTab(id);
    commitBrowserState([...tabs, tab], id);
    navigateNativeWebview(tab.url);
  };

  const selectTab = (tab: BrowserWorkspaceTabState) => {
    commitBrowserState(tabs, tab.id);
    navigateNativeWebview(tab.url);
  };

  const closeTab = (tabId: string) => {
    const nextTabs = tabs.length > 1 ? tabs.filter((tab) => tab.id !== tabId) : [createBrowserTab("tab-1")];
    commitBrowserState(nextTabs, tabId === activeTabId ? nextTabs[0].id : activeTabId);
  };

  const goToHistoryOffset = (offset: -1 | 1) => {
    if (!activeTab) {
      return;
    }
    const targetIndex = activeTab.historyIndex + offset;
    const targetUrl = activeTab.history[targetIndex];
    if (!targetUrl) {
      return;
    }
    setError("");
    commitBrowserState(tabs.map((tab) => (tab.id === activeTab.id ? { ...tab, url: targetUrl, historyIndex: targetIndex } : tab)));
    navigateNativeWebview(targetUrl);
  };

  const readActivePageWithHost = async () => {
    if (!activeTab || !onReadActivePage) {
      return;
    }
    setControlledActionStatus("Reading active page through governed Browser host...");
    setError("");
    try {
      const summary = await onReadActivePage(activeTab.url);
      setControlledActionStatus(summary);
    } catch (error) {
      setControlledActionStatus("");
      setError(error instanceof Error ? error.message : "Controlled Browser read failed.");
    }
  };

  const openBrowserUrl = (url: string) => {
    navigateTo(url, "push");
  };

  const focusAddressBar = () => {
    urlInputRef.current?.focus();
    urlInputRef.current?.select();
  };

  const copyCurrentUrl = async () => {
    if (!activeTab) {
      return;
    }
    setOpenMenu(null);
    setError("");
    try {
      await navigator.clipboard?.writeText(activeTab.url);
      setControlledActionStatus("Current URL copied.");
    } catch {
      focusAddressBar();
      setControlledActionStatus("Current URL selected.");
    }
  };

  const openMenuUrl = (url: string) => {
    setOpenMenu(null);
    openBrowserUrl(url);
  };

  const runBrowserMenuCommand = (command: string) => {
    setOpenMenu(null);
    switch (command) {
      case "new-tab":
        addTab();
        break;
      case "close-tab":
        if (activeTab) {
          closeTab(activeTab.id);
        }
        break;
      case "open-location":
        focusAddressBar();
        break;
      case "copy-url":
        void copyCurrentUrl();
        break;
      case "reload":
        navigateTo(activeTab?.url ?? draftUrl, "replace");
        break;
      case "back":
        goToHistoryOffset(-1);
        break;
      case "forward":
        goToHistoryOffset(1);
        break;
      case "home":
        openBrowserUrl(DEFAULT_BROWSER_URL);
        break;
      case "zoom-reset":
        setControlledActionStatus("Browser viewport reset to 100%.");
        break;
      case "extensions":
        openMenuUrl(CHROME_WEB_STORE_URL);
        break;
      case "help":
        openMenuUrl("https://support.google.com/chrome");
        break;
      default:
        setControlledActionStatus("This command requires the native Chromium host.");
    }
  };

  const runNativeProbe = async () => {
    if (!onProbeNativeBrowser) {
      return;
    }
    setError("");
    setControlledActionStatus("Checking native embedded Chromium readiness...");
    try {
      const result = await onProbeNativeBrowser();
      setNativeProbe(result);
      setControlledActionStatus(
        result.status === "ready"
          ? "Native embedded Browser host is ready."
          : result.status === "partial"
            ? "Native Browser host is present but not verified."
            : "Native embedded Browser host is blocked.",
      );
    } catch (error) {
      setControlledActionStatus("");
      setError(error instanceof Error ? error.message : "Native Browser probe failed.");
    }
  };

  const runNativeAttachSmoke = async () => {
    if (!onSmokeTestNativeAttach) {
      return;
    }
    setError("");
    setControlledActionStatus("Running native Browser attach smoke test...");
    try {
      const result = await onSmokeTestNativeAttach();
      setNativeAttachSmoke(result);
      setControlledActionStatus(
        result.status === "attached"
          ? "Native Browser attach smoke passed."
          : "Native Browser attach smoke blocked product embedding.",
      );
    } catch (error) {
      setControlledActionStatus("");
      setError(error instanceof Error ? error.message : "Native Browser attach smoke test failed.");
    }
  };

  const runNativeBridgeProbe = async () => {
    if (!onProbeNativeBridge) {
      return;
    }
    setError("");
    setControlledActionStatus("Checking in-process native Browser bridge...");
    try {
      const result = await onProbeNativeBridge();
      setNativeBridgeProbe(result);
      setControlledActionStatus(
        result.status === "ready"
          ? "In-process native Browser bridge is ready."
          : "In-process native Browser bridge is not ready.",
      );
    } catch (error) {
      setControlledActionStatus("");
      setError(error instanceof Error ? error.message : "Native Browser bridge probe failed.");
    }
  };

  const loadPriorityExtension = async (target: "phantom" | "bitwarden") => {
    if (!onLoadPriorityExtension) {
      return;
    }
    setError("");
    setControlledActionStatus(`Choose the unpacked ${target === "phantom" ? "Phantom" : "Bitwarden"} extension folder.`);
    try {
      const status = await onLoadPriorityExtension(target);
      setControlledActionStatus(status);
      if (onListVisibleExtensions) {
        setExtensions(await onListVisibleExtensions());
      }
    } catch (error) {
      setControlledActionStatus("");
      setError(error instanceof Error ? error.message : "Extension load failed.");
    }
  };

  const refreshExtensions = async () => {
    if (!onListVisibleExtensions) {
      return;
    }
    setError("");
    try {
      setExtensions(await onListVisibleExtensions());
      setControlledActionStatus("Browser v2 extensions refreshed.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to list Browser v2 extensions.");
    }
  };

  const setExtensionPinned = async (extension: BrowserExtensionState, pinned: boolean) => {
    if (!onSetExtensionPinned) {
      return;
    }
    setError("");
    try {
      setExtensions(await onSetExtensionPinned(extension.extensionId, pinned));
      setControlledActionStatus(`${extension.name} ${pinned ? "pinned" : "unpinned"}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to update extension pin state.");
    }
  };

  const disableExtension = async (extension: BrowserExtensionState) => {
    if (!onDisableExtension) {
      return;
    }
    setError("");
    try {
      setExtensions(await onDisableExtension(extension.extensionId));
      setControlledActionStatus(`${extension.name} disabled for this Browser v2 session.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to disable extension.");
    }
  };

  const extensionCompatibility = [
    {
      id: "phantom",
      name: "Phantom Wallet",
      purpose: "Solana DAO onboarding and wallet connection.",
      source: "Official Phantom download only. Fake wallet extensions can steal funds.",
      installed: extensions.some((extension) => /phantom/i.test(extension.name)),
    },
    {
      id: "bitwarden",
      name: "Bitwarden",
      purpose: "Password autofill and secure credential access.",
      source: "Official Bitwarden browser extension source only.",
      installed: extensions.some((extension) => /bitwarden/i.test(extension.name)),
    },
  ] as const;

  // Cloud / mobile mode: skip native browser stack entirely
  if (isWebMode()) {
    return <CloudBrowserView />;
  }

  if (!browserReady) {
    return (
      <div className="browser-workspace" data-testid="browser-workspace">
        <section className="browser-gate">
          <div>
            <span className="eyebrow">Capability gate</span>
            <h4>Enable Browser before opening web sessions.</h4>
            <p>
              Browser v2 needs network, UI embedding, browser-control, and reviewed filesystem grants before the
              extension-compatible Chromium host can be launched.
            </p>
          </div>
          <button type="button" className="button-primary touch-action" onClick={onGrantVisibleAccess ?? onConfigureAddon}>
            {onGrantVisibleAccess ? "Install and grant browser access" : "Configure Browser Add-on"}
          </button>
          <button type="button" className="button-secondary touch-action" onClick={onConfigureAddon}>
            Open Add-on Settings
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="browser-workspace" data-testid="browser-workspace">
      <section className="browser-live-session" aria-label="Resonant Browser live session">
        <div className="browser-menu-bar" aria-label="Browser application menu">
          <strong>{manifest?.name ?? "Resonant Browser"}</strong>
          {BROWSER_MENU_ITEMS.map((item) => (
            <div key={item} className="browser-menu-item">
              <button
                type="button"
                aria-label={`${item} menu`}
                aria-expanded={openMenu === item}
                onClick={() => setOpenMenu(openMenu === item ? null : item)}
              >
                {item}
              </button>
              {openMenu === item ? (
                <div className="browser-menu-popover" role="menu" aria-label={`${item} commands`}>
                  {item === "File" ? (
                    <>
                      <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("new-tab")}>
                        New Tab
                      </button>
                      <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("open-location")}>
                        Open Location
                      </button>
                      <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("close-tab")}>
                        Close Tab
                      </button>
                    </>
                  ) : null}
                  {item === "Edit" ? (
                    <>
                      <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("open-location")}>
                        Edit Address
                      </button>
                      <button type="button" role="menuitem" onClick={() => void copyCurrentUrl()}>
                        Copy Current URL
                      </button>
                    </>
                  ) : null}
                  {item === "View" ? (
                    <>
                      <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("reload")}>
                        Reload Page
                      </button>
                      <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("zoom-reset")}>
                        Actual Size
                      </button>
                    </>
                  ) : null}
                  {item === "History" ? (
                    <>
                      <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("back")} disabled={!canGoBack}>
                        Back
                      </button>
                      <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("forward")} disabled={!canGoForward}>
                        Forward
                      </button>
                    </>
                  ) : null}
                  {item === "Bookmarks" ? (
                    BROWSER_BOOKMARK_ITEMS.map((bookmark) => (
                      <button key={bookmark.url} type="button" role="menuitem" onClick={() => openMenuUrl(bookmark.url)}>
                        {bookmark.label}
                      </button>
                    ))
                  ) : null}
                  {item === "Profiles" ? (
                    <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("profiles")}>
                      Profiles require native Chromium profile support
                    </button>
                  ) : null}
                  {item === "Tab" ? (
                    <>
                      <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("new-tab")}>
                        New Tab
                      </button>
                      <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("reload")}>
                        Reload Tab
                      </button>
                    </>
                  ) : null}
                  {item === "Window" ? (
                    <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("window")}>
                      Window commands are owned by ResonantOS shell
                    </button>
                  ) : null}
                  {item === "Help" ? (
                    <>
                      <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("help")}>
                        Chrome Help
                      </button>
                      <button type="button" role="menuitem" onClick={() => runBrowserMenuCommand("extensions")}>
                        Chrome Web Store
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          {error || controlledActionStatus ? (
            <span className={`browser-menu-status ${error ? "browser-menu-status-error" : ""}`} role={error ? "alert" : "status"}>
              {error || controlledActionStatus}
            </span>
          ) : null}
        </div>

        <div className="browser-tab-strip" aria-label="Browser tabs">
          {tabs.map((tab) => (
            <div key={tab.id} className={`browser-tab ${tab.id === activeTabId ? "active" : ""}`}>
              <button type="button" onClick={() => selectTab(tab)} aria-label={`Open tab ${tab.label}`}>
                {tab.label}
              </button>
              <button
                type="button"
                aria-label={`Close tab ${tab.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="browser-icon-button" aria-label="New tab" onClick={addTab}>
            +
          </button>
        </div>

        <form className="browser-toolbar" ref={toolbarRef} onSubmit={submitNavigation}>
          <div className="browser-nav-cluster" aria-label="Browser navigation controls">
            <button type="button" className="browser-icon-button" aria-label="Back" onClick={() => goToHistoryOffset(-1)} disabled={!canGoBack}>
              ‹
            </button>
            <button type="button" className="browser-icon-button" aria-label="Forward" onClick={() => goToHistoryOffset(1)} disabled={!canGoForward}>
              ›
            </button>
          </div>
          <input
            ref={urlInputRef}
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            aria-label="Browser URL"
            placeholder="https://resonantos.com"
          />
          <div className="browser-nav-cluster browser-nav-cluster-right">
            <button
              type="button"
              className="browser-ai-mode-pill"
              aria-label="Read active page with Augmentor"
              onClick={() => void readActivePageWithHost()}
              disabled={!onReadActivePage}
            >
              AI Mode
            </button>
            <button type="button" className="browser-icon-button" aria-label="Reload" onClick={() => navigateTo(activeTab?.url ?? draftUrl, "replace")}>
              ↻
            </button>
            <button
              type="button"
              className="browser-icon-button browser-extension-button"
              aria-label="Extensions"
              onClick={() => setOpenMenu(openMenu === "Help" ? null : "Help")}
              title="Open Browser extension commands."
            >
              ◧
            </button>
            <button type="submit" className="browser-icon-button browser-go-button" aria-label="Open address">
              →
            </button>
          </div>
        </form>

        <div className="browser-bookmarks-bar" aria-label="Browser bookmarks bar">
          <button type="button" className="browser-apps-button" aria-label="Browser apps" onClick={() => openBrowserUrl(CHROME_WEB_STORE_URL)}>
            ▦
          </button>
          {BROWSER_BOOKMARK_ITEMS.map((bookmark) => (
            <button key={bookmark.url} type="button" onClick={() => openBrowserUrl(bookmark.url)}>
              {bookmark.label}
            </button>
          ))}
          <span className="browser-extension-note">Extensions require the native Chromium host.</span>
        </div>

        <div ref={viewportRef} className="browser-v2-host browser-native-webview-mount" aria-label="Native embedded Chromium target">
          <section className="browser-v2-hero browser-native-placeholder">
            <span className="eyebrow">Browser v2 target</span>
            <h3>Native embedded Chromium, not an Electron sidecar</h3>
            <p>
              Resonant Browser must render inside this center workspace and support the same live session for the human
              and Augmentor. The previous Electron sidecar is no longer treated as product Browser because it opens a
              separate window instead of embedding in ResonantOS.
            </p>
            <div className="browser-v2-actions">
              <button type="button" className="button-primary touch-action" onClick={() => openBrowserUrl(CHROME_WEB_STORE_URL)}>
                Open Chrome Web Store
              </button>
              <button type="button" className="button-secondary touch-action" onClick={() => void runNativeProbe()}>
                Run Native Host Probe
              </button>
              <button type="button" className="button-secondary touch-action" onClick={() => void runNativeAttachSmoke()}>
                Run Attach Smoke Test
              </button>
              <button type="button" className="button-secondary touch-action" onClick={() => void runNativeBridgeProbe()}>
                Run Bridge Probe
              </button>
            </div>
          </section>

          {nativeProbe ? (
            <section className={`browser-native-probe browser-native-probe-${nativeProbe.status}`} aria-label="Native Browser host probe">
              <div>
                <span className="eyebrow">Host probe</span>
                <h4>
                  Native embedded host{" "}
                  {nativeProbe.status === "ready" ? "ready" : nativeProbe.status === "partial" ? "partial" : "blocked"}
                </h4>
                <p>
                  Candidate: {nativeProbe.engineCandidate} · source {nativeProbe.sourceScaffoldStatus} · host{" "}
                  {nativeProbe.hostBinaryStatus} · embedded view {nativeProbe.embeddedViewStatus} · extensions{" "}
                  {nativeProbe.extensionCompatibilityStatus}
                </p>
              </div>
              <div className="browser-native-probe-grid">
                <span>Phantom: {nativeProbe.phantomStatus}</span>
                <span>Bitwarden: {nativeProbe.bitwardenStatus}</span>
              </div>
              {nativeProbe.blockers.length ? (
                <ul>
                  {nativeProbe.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {nativeAttachSmoke ? (
            <section
              className={`browser-native-probe browser-native-probe-${nativeAttachSmoke.status}`}
              aria-label="Native Browser attach smoke test"
            >
              <div>
                <span className="eyebrow">Attach smoke</span>
                <h4>
                  Native attach{" "}
                  {nativeAttachSmoke.status === "attached"
                    ? "passed"
                    : nativeAttachSmoke.status === "unsupported"
                      ? "unsupported"
                      : "blocked"}
                </h4>
                <p>
                  Platform: {nativeAttachSmoke.platform} · parent {nativeAttachSmoke.parentHandleKind}{" "}
                  {nativeAttachSmoke.parentHandlePresent ? "present" : "missing"} · mode{" "}
                  {nativeAttachSmoke.hostIntegrationMode}
                </p>
              </div>
              {nativeAttachSmoke.blocker ? <p>{nativeAttachSmoke.blocker}</p> : null}
              {nativeAttachSmoke.nextActions.length ? (
                <ul>
                  {nativeAttachSmoke.nextActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {nativeBridgeProbe ? (
            <section
              className={`browser-native-probe browser-native-probe-${nativeBridgeProbe.status}`}
              aria-label="Native Browser in-process bridge probe"
            >
              <div>
                <span className="eyebrow">Bridge probe</span>
                <h4>
                  In-process bridge{" "}
                  {nativeBridgeProbe.status === "ready"
                    ? "ready"
                    : nativeBridgeProbe.status === "partial"
                      ? "partial"
                      : "missing"}
                </h4>
                <p>
                  Mode: {nativeBridgeProbe.integrationMode} · library {nativeBridgeProbe.bridgeLibraryStatus} · C ABI{" "}
                  {nativeBridgeProbe.cAbiStatus}
                </p>
                {nativeBridgeProbe.bridgeLibraryPath ? <p>{nativeBridgeProbe.bridgeLibraryPath}</p> : null}
              </div>
              {nativeBridgeProbe.exportedSymbols.length ? (
                <div className="browser-native-probe-grid">
                  {nativeBridgeProbe.exportedSymbols.slice(0, 4).map((symbol) => (
                    <span key={symbol}>{symbol}</span>
                  ))}
                </div>
              ) : null}
              {nativeBridgeProbe.blockers.length ? (
                <ul>
                  {nativeBridgeProbe.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <section className="browser-extension-manager" aria-label="Browser extension manager">
            <div className="browser-extension-manager-head">
              <div>
                <span className="eyebrow">Extension Manager</span>
                <h4>Priority compatibility targets</h4>
              </div>
              <p>
                Phantom and Bitwarden are acceptance requirements, not demo placeholders. CEF/native Chromium work must
                prove extension API compatibility before this add-on can be marked ready.
              </p>
            </div>
            <div className="browser-extension-priority-grid" aria-label="Priority Browser extension compatibility">
              {extensionCompatibility.map((target) => (
                <article key={target.id} className={target.installed ? "installed" : ""}>
                  <div className="browser-extension-target-title">
                    <strong>{target.name}</strong>
                    <span className={`tone tone-${target.installed ? "active" : "neutral"}`}>
                      {target.installed ? "loaded" : "needed"}
                    </span>
                  </div>
                  <p>{target.purpose}</p>
                  <small>{target.source}</small>
                  <span className="browser-extension-target-status">Native host compatibility required</span>
                </article>
              ))}
            </div>
          </section>

          <section className="browser-extension-list" aria-label="Loaded Browser extensions">
            <span className="eyebrow">Loaded extensions</span>
            {extensions.length ? (
              <ul>
                {extensions.map((extension) => (
                  <li key={extension.extensionId}>
                    <div>
                      <strong>{extension.name}</strong>
                      <span>
                        {extension.version} · {extension.pinned ? "pinned" : "not pinned"} · {extension.source}
                      </span>
                    </div>
                    <div className="browser-extension-row-actions">
                      <button
                        type="button"
                        className="button-secondary touch-action"
                        onClick={() => void setExtensionPinned(extension, !extension.pinned)}
                      >
                        {extension.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        type="button"
                        className="button-secondary touch-action"
                        onClick={() => void disableExtension(extension)}
                      >
                        Disable
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No Browser v2 extensions loaded in the current host session.</p>
            )}
          </section>

        </div>
      </section>
    </div>
  );
}
