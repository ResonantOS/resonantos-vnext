// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md
// Intent citation: docs/architecture/ADR-017-resonant-browser-addon.md

import { useEffect, useRef, useState } from "react";
import type { FormEvent, WheelEvent } from "react";
import type {
  AddOnInstallation,
  AddOnManifest,
  BrowserExtensionState,
  BrowserInteractionResult,
  BrowserNativeWebviewBounds,
  BrowserNativeWebviewResult,
  BrowserOpenUrlResult,
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
  onOpenNativeWebview?: (url: string, bounds: BrowserNativeWebviewBounds) => Promise<BrowserNativeWebviewResult | void>;
  onResizeNativeWebview?: (bounds: BrowserNativeWebviewBounds) => Promise<BrowserNativeWebviewResult | void>;
  onHideNativeWebview?: () => Promise<void>;
  onOpenLiveWebview?: (url: string, bounds: BrowserNativeWebviewBounds) => Promise<void>;
  onResizeLiveWebview?: (bounds: BrowserNativeWebviewBounds) => Promise<void>;
  onHideLiveWebview?: () => Promise<void>;
  onOpenInternalPreview?: (
    url: string,
    viewport?: { viewportWidth?: number; viewportHeight?: number },
  ) => Promise<BrowserOpenUrlResult>;
  onScrollInternalPreview?: (
    sessionId: string,
    deltaX: number,
    deltaY: number,
    viewport?: { viewportWidth?: number; viewportHeight?: number },
  ) => Promise<BrowserInteractionResult>;
  onReadActivePage?: (url: string) => Promise<string>;
  onProbeNativeBrowser?: () => Promise<NativeBrowserProbeResult>;
  onSmokeTestNativeAttach?: () => Promise<NativeBrowserAttachSmokeResult>;
  onProbeNativeBridge?: () => Promise<NativeBrowserBridgeProbeResult>;
  onLoadPriorityExtension?: (target: "phantom" | "bitwarden") => Promise<string>;
  onOpenWalletBrowserHost?: (url: string) => Promise<string>;
  onReadWalletBrowserHost?: () => Promise<string>;
  onInspectWalletDappGate?: () => Promise<string>;
  onListVisibleExtensions?: () => Promise<BrowserExtensionState[]>;
  onSetExtensionPinned?: (extensionId: string, pinned: boolean) => Promise<BrowserExtensionState[]>;
  onDisableExtension?: (extensionId: string) => Promise<BrowserExtensionState[]>;
};

const DEFAULT_BROWSER_URL = "https://resonantos.com";
const CHROME_WEB_STORE_URL = "https://chromewebstore.google.com/category/extensions";
const PHANTOM_CHROME_WEB_STORE_URL = "https://chromewebstore.google.com/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa";
const PHANTOM_EXTENSION_ID = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const PHANTOM_POPUP_URL = `chrome-extension://${PHANTOM_EXTENSION_ID}/popup.html`;
const BROWSER_MENU_ITEMS = ["File", "Edit", "View", "History", "Bookmarks", "Profiles", "Tab", "Window", "Help"] as const;
type BrowserMenuName = (typeof BROWSER_MENU_ITEMS)[number];
const BROWSER_BOOKMARK_ITEMS = [
  { label: "ResonantOS", url: "https://resonantos.com" },
  { label: "Search", url: "https://google.com" },
  { label: "Chrome Web Store", url: CHROME_WEB_STORE_URL },
  { label: "Manolo Remiddi", url: "https://manoloremiddi.com" },
];
const INTERNAL_BROWSER_SCROLL_GAIN = 5;
const INTERNAL_BROWSER_SCROLL_THROTTLE_MS = 25;
const amplifyBrowserScrollDelta = (delta: number): number => Math.trunc(delta * INTERNAL_BROWSER_SCROLL_GAIN);
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
  if (trimmed === PHANTOM_POPUP_URL) {
    return trimmed;
  }
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }
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
    return parsed.protocol === "https:" || parsed.protocol === "http:" || url === PHANTOM_POPUP_URL;
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
  onOpenNativeWebview,
  onResizeNativeWebview,
  onHideNativeWebview,
  onOpenLiveWebview,
  onResizeLiveWebview,
  onHideLiveWebview,
  onOpenInternalPreview,
  onScrollInternalPreview,
  onReadActivePage,
  onProbeNativeBrowser,
  onSmokeTestNativeAttach,
  onProbeNativeBridge,
  onLoadPriorityExtension,
  onOpenWalletBrowserHost,
  onReadWalletBrowserHost,
  onInspectWalletDappGate,
  onListVisibleExtensions,
  onSetExtensionPinned,
  onDisableExtension,
}: BrowserWorkspaceProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLFormElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const scrollInFlightRef = useRef(false);
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
  const [preview, setPreview] = useState<BrowserOpenUrlResult | null>(null);
  const activeSurfaceRef = useRef<"native-chromium" | "tauri-webview" | null>(null);
  const hostCallbacksRef = useRef({
    onOpenNativeWebview,
    onResizeNativeWebview,
    onHideNativeWebview,
    onOpenLiveWebview,
    onResizeLiveWebview,
    onHideLiveWebview,
    onListVisibleExtensions,
    onProbeNativeBrowser,
  });
  hostCallbacksRef.current = {
    onOpenNativeWebview,
    onResizeNativeWebview,
    onHideNativeWebview,
    onOpenLiveWebview,
    onResizeLiveWebview,
    onHideLiveWebview,
    onListVisibleExtensions,
    onProbeNativeBrowser,
  };

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
    if (!browserReady || !hostCallbacksRef.current.onListVisibleExtensions) {
      return;
    }
    let cancelled = false;
    void hostCallbacksRef.current.onListVisibleExtensions()
      .then((nextExtensions) => {
        if (!cancelled) {
          setExtensions(nextExtensions);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [browserReady]);

  const viewportFromBounds = (bounds: BrowserNativeWebviewBounds | null) =>
    bounds
      ? {
          viewportWidth: Math.max(320, Math.round(bounds.width)),
          viewportHeight: Math.max(240, Math.round(bounds.height)),
        }
      : undefined;

  const openInternalPreview = async (url: string) => {
    if (!onOpenInternalPreview) {
      return;
    }
    setControlledActionStatus("Opening internal Chromium preview...");
    const result = await onOpenInternalPreview(url, viewportFromBounds(measureNativeBounds()));
    setPreview(result);
    setControlledActionStatus(`Internal Browser loaded: ${result.title || result.finalUrl}`);
  };

  useEffect(() => {
    const callbacks = hostCallbacksRef.current;
    if (!browserReady || !activeTab || (!callbacks.onOpenNativeWebview && !callbacks.onOpenLiveWebview)) {
      return;
    }
    let cancelled = false;
    const animationFrame = window.requestAnimationFrame(() => {
      const bounds = measureNativeBounds();
      if (!bounds) {
        return;
      }
      setError("");
      const openSurface = async () => {
        const latest = hostCallbacksRef.current;
        if (latest.onOpenNativeWebview) {
          try {
            await latest.onOpenNativeWebview(activeTab.url, bounds);
            activeSurfaceRef.current = "native-chromium";
            await latest.onHideLiveWebview?.();
            return `Native Chromium Browser ready: ${activeTab.url}`;
          } catch (error) {
            if (!latest.onOpenLiveWebview) {
              throw error;
            }
            console.warn("Native Chromium Browser unavailable, falling back to Tauri WebView.", error);
          }
        }
        if (!latest.onOpenLiveWebview) {
          throw new Error("No Browser surface is available.");
        }
        await latest.onOpenLiveWebview(activeTab.url, bounds);
        activeSurfaceRef.current = "tauri-webview";
        await latest.onHideNativeWebview?.();
        return `Tauri WebView fallback ready: ${activeTab.url}`;
      };
      void openSurface()
        .then(() => {
          if (!cancelled) {
            setControlledActionStatus(activeSurfaceRef.current === "native-chromium" ? `Native Chromium Browser ready: ${activeTab.url}` : `Tauri WebView fallback ready: ${activeTab.url}`);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setControlledActionStatus("");
            setError(error instanceof Error ? error.message : "Live Browser navigation failed.");
          }
        });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [activeTab?.id, activeTab?.url, browserReady]);

  useEffect(() => {
    const callbacks = hostCallbacksRef.current;
    if (!browserReady || (!callbacks.onResizeNativeWebview && !callbacks.onResizeLiveWebview)) {
      return;
    }
    const element = viewportRef.current;
    if (!element) {
      return;
    }
    const syncBounds = () => {
      const bounds = measureNativeBounds();
      if (bounds) {
        const latest = hostCallbacksRef.current;
        const resize =
          activeSurfaceRef.current === "native-chromium" && latest.onResizeNativeWebview
            ? latest.onResizeNativeWebview
            : latest.onResizeLiveWebview;
        void resize?.(bounds).catch(() => undefined);
      }
    };
    syncBounds();
    const observer = new ResizeObserver(syncBounds);
    observer.observe(element);
    window.addEventListener("resize", syncBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
    };
  }, [browserReady]);

  useEffect(() => {
    return () => {
      void hostCallbacksRef.current.onHideLiveWebview?.().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    return () => {
      void hostCallbacksRef.current.onHideNativeWebview?.().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (browserReady || !hostCallbacksRef.current.onHideNativeWebview) {
      return;
    }
    void hostCallbacksRef.current.onHideNativeWebview().catch(() => undefined);
  }, [browserReady]);

  useEffect(() => {
    if (!browserReady || !hostCallbacksRef.current.onProbeNativeBrowser) {
      return;
    }
    let cancelled = false;
    void hostCallbacksRef.current.onProbeNativeBrowser()
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
  }, [browserReady]);

  const commitBrowserState = (nextTabs: BrowserWorkspaceTabState[], nextActiveTabId = activeTabId) => {
    onWorkspaceStateChange({
      activeTabId: nextTabs.some((tab) => tab.id === nextActiveTabId) ? nextActiveTabId : nextTabs[0]?.id ?? "tab-1",
      tabs: nextTabs.length ? nextTabs : [createBrowserTab("tab-1")],
      controlledSession: workspaceState.controlledSession,
    });
  };

  const openWalletBrowserHostUrl = async (url: string) => {
    if (!onOpenWalletBrowserHost) {
      setControlledActionStatus("Wallet Browser host is not available in this runtime.");
      return;
    }
    setError("");
    setPreview(null);
    setControlledActionStatus("Opening dedicated Chrome/Brave wallet Browser host...");
    try {
      setControlledActionStatus(await onOpenWalletBrowserHost(url));
    } catch (error) {
      setControlledActionStatus("");
      setError(error instanceof Error ? error.message : "Wallet Browser host failed to open.");
    }
  };

  const navigateNativeWebview = (url: string) => {
    void openWalletBrowserHostUrl(url);
  };

  const navigateTo = (url: string, mode: "push" | "replace") => {
    const nextUrl = normalizeBrowserUrl(url);
    if (!isSafeBrowserUrl(nextUrl)) {
      setError("Browser only accepts http, https, and the reviewed Phantom wallet popup URL in this version.");
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

  const readActivePageWithAugmentor = async () => {
    if (!activeTab || !onReadActivePage) {
      return;
    }
    setControlledActionStatus("Reading active page through the internal Browser...");
    setError("");
    try {
      const summary = await onReadActivePage(activeTab.url);
      setControlledActionStatus(summary);
    } catch (error) {
      setControlledActionStatus("");
      setError(error instanceof Error ? error.message : "Internal Browser read failed.");
    }
  };

  const scrollInternalPreview = (event: WheelEvent<HTMLElement>) => {
    if (!onScrollInternalPreview || !workspaceState.controlledSession.sessionId || scrollInFlightRef.current) {
      return;
    }
    event.preventDefault();
    scrollInFlightRef.current = true;
    setError("");
    const sessionId = workspaceState.controlledSession.sessionId;
    const viewport = viewportFromBounds(measureNativeBounds());
    void onScrollInternalPreview(
      sessionId,
      amplifyBrowserScrollDelta(event.deltaX),
      amplifyBrowserScrollDelta(event.deltaY),
      viewport,
    )
      .then((result) => {
        setPreview((current) => ({
          sessionId: result.sessionId,
          requestedUrl: current?.requestedUrl ?? activeTab?.url ?? result.finalUrl,
          finalUrl: result.finalUrl,
          title: result.title,
          status: "session-active",
          engine: current?.engine ?? "chromium-cdp",
          screenshotDataUrl: result.screenshotDataUrl,
          audit: result.audit,
        }));
      })
      .catch((error) => {
        setError(error instanceof Error ? error.message : "Internal Browser scroll failed.");
      })
      .finally(() => {
        window.setTimeout(() => {
          scrollInFlightRef.current = false;
        }, INTERNAL_BROWSER_SCROLL_THROTTLE_MS);
      });
  };

  const openBrowserUrl = (url: string) => {
    navigateTo(url, "push");
  };

  const focusAddressBar = () => {
    urlInputRef.current?.focus();
    urlInputRef.current?.select();
  };

  const selectAddressBarUrl = () => {
    window.requestAnimationFrame(() => {
      urlInputRef.current?.select();
    });
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

  const openWalletBrowserHost = async () => {
    if (!activeTab) {
      return;
    }
    await openWalletBrowserHostUrl(activeTab.url);
  };

  const readWalletBrowserHost = async () => {
    if (!onReadWalletBrowserHost) {
      return;
    }
    setError("");
    setControlledActionStatus("Reading the real Chrome/Brave wallet Browser host...");
    try {
      setControlledActionStatus(await onReadWalletBrowserHost());
    } catch (error) {
      setControlledActionStatus("");
      setError(error instanceof Error ? error.message : "Wallet Browser read failed.");
    }
  };

  const inspectWalletDappGate = async () => {
    if (!onInspectWalletDappGate) {
      return;
    }
    setError("");
    setControlledActionStatus("Inspecting dApp wallet gate. Approval remains human-only.");
    try {
      setControlledActionStatus(await onInspectWalletDappGate());
    } catch (error) {
      setControlledActionStatus("");
      setError(error instanceof Error ? error.message : "Wallet gate inspection failed.");
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

  const phantomExtension = extensions.find((extension) => extension.extensionId === PHANTOM_EXTENSION_ID || /phantom/i.test(extension.name));
  const phantomLoaded = Boolean(phantomExtension);
  const phantomUnsupported = phantomExtension?.compatibilityState === "unsupported-in-electron";
  const phantomStatusLabel = phantomUnsupported || !phantomLoaded ? "use wallet host" : "experimental Electron load";
  const extensionCompatibility = [
    {
      id: "phantom",
      name: "Phantom Wallet",
      purpose: "Solana DAO onboarding and wallet connection.",
      source: "Official Chrome Web Store ID only: bfnaelmomeimhlpmgjnjophhpkkoljpa.",
      installed: phantomLoaded,
      unsupported: phantomUnsupported,
    },
    {
      id: "bitwarden",
      name: "Bitwarden",
      purpose: "Password autofill and secure credential access.",
      source: "Official Bitwarden browser extension source only.",
      installed: extensions.some((extension) => /bitwarden/i.test(extension.name)),
      unsupported: false,
    },
  ] as const;

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
            onFocus={selectAddressBarUrl}
            onClick={selectAddressBarUrl}
            onMouseUp={(event) => event.preventDefault()}
            aria-label="Browser URL"
            placeholder="https://resonantos.com"
            title={draftUrl}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
          />
          <div className="browser-nav-cluster browser-nav-cluster-right">
            <button
              type="button"
              className="browser-ai-mode-pill"
              aria-label="Ask Augmentor to read this page"
              onClick={() => void readActivePageWithAugmentor()}
              disabled={!onReadActivePage}
              title="Reads the current Browser page into Augmentor context. It does not click, type, submit forms, or control wallets."
            >
              Read Page
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
          <span
            className={`browser-extension-note ${phantomLoaded && !phantomUnsupported ? "browser-extension-note-loaded" : ""} ${phantomUnsupported ? "browser-extension-note-blocked" : ""}`}
            title={phantomExtension?.compatibilityNotes?.join(" ") ?? undefined}
          >
            Phantom {phantomStatusLabel}
          </span>
          {phantomLoaded && !phantomUnsupported ? (
            <button type="button" className="browser-bookmark-action" onClick={() => openBrowserUrl(PHANTOM_POPUP_URL)}>
              Open Phantom Experimental
            </button>
          ) : null}
          <button type="button" className="browser-bookmark-action browser-wallet-host-action" onClick={() => void openWalletBrowserHost()}>
            Open Wallet Browser
          </button>
        </div>

        <div ref={viewportRef} className="browser-v2-host browser-native-webview-mount" aria-label="Native embedded Chromium target">
          <section className="browser-wallet-host-panel" aria-label="Resonant Browser Host control surface">
            <div>
              <span className="eyebrow">Resonant Browser Host</span>
              <h3>Real Chrome/Brave profile for wallet-capable work</h3>
              <p>
                ResonantOS controls a dedicated external browser profile through CDP. Phantom and other wallets run in
                that real browser, while Augmentor, memory, add-ons, and task monitoring stay here as the sidecar.
              </p>
            </div>
            <div className="browser-wallet-host-actions">
              <button type="button" className="button-primary touch-action" onClick={() => void openWalletBrowserHost()}>
                Open Current Page In Wallet Browser
              </button>
              <button type="button" className="button-secondary touch-action" onClick={() => void readWalletBrowserHost()} disabled={!onReadWalletBrowserHost}>
                Read Wallet Browser
              </button>
              <button type="button" className="button-secondary touch-action" onClick={() => void inspectWalletDappGate()} disabled={!onInspectWalletDappGate}>
                Inspect Wallet Gate
              </button>
            </div>
            <div className="browser-wallet-host-rules">
              <strong>Human-only safety boundary</strong>
              <span>Augmentor may navigate, read, and explain. It may not approve, sign, export keys, or reveal secrets.</span>
            </div>
          </section>

          <section className="browser-v2-hero browser-native-placeholder browser-native-diagnostics">
            <span className="eyebrow">Experimental native bridge</span>
            <h3>Native embedded CEF is disabled by default</h3>
            <p>
              The product Browser now uses the controlled internal Chromium preview path because the in-process CEF
              bridge has crashed the desktop shell. Keep native CEF behind manual probes until it passes real app
              stability testing.
            </p>
            <div className="browser-v2-actions">
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
                <h4>Wallet and credential extensions</h4>
              </div>
              <p>
                Electron extension loading is experimental. Phantom and wallet approvals belong in the dedicated real
                Chrome/Brave Wallet Browser host so wallet APIs, popups, and human approval flows work as expected.
              </p>
            </div>
            <div className="browser-extension-priority-grid" aria-label="Priority Browser extension compatibility">
              {extensionCompatibility.map((target) => (
                <article key={target.id} className={target.installed ? "installed" : ""}>
                  <div className="browser-extension-target-title">
                    <strong>{target.name}</strong>
                    <span className={`tone tone-${target.unsupported ? "warning" : target.installed ? "active" : "neutral"}`}>
                      {target.unsupported ? "blocked" : target.installed ? "loaded" : "needed"}
                    </span>
                  </div>
                  <p>{target.purpose}</p>
                  <small>{target.source}</small>
                  <span className="browser-extension-target-status">
                    {target.unsupported
                      ? "Loaded experimentally, but Electron cannot run the Phantom wallet UI. Use a real Chrome/Brave wallet host."
                      : target.installed
                        ? "Loaded experimentally in Electron"
                        : target.id === "phantom"
                          ? "Install and unlock inside the Wallet Browser host"
                          : "Experimental Electron extension host available"}
                  </span>
                  {target.id === "phantom" && phantomExtension?.compatibilityNotes?.length ? (
                    <ul className="browser-extension-warning-list">
                      {phantomExtension.compatibilityNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="browser-extension-row-actions">
                    {target.id === "phantom" && !target.unsupported && target.installed ? (
                      <>
                        <button
                          type="button"
                          className="button-secondary touch-action"
                          onClick={() => openBrowserUrl(PHANTOM_POPUP_URL)}
                        >
                          Open Phantom
                        </button>
                        <button
                          type="button"
                          className="button-secondary touch-action"
                          onClick={() => openBrowserUrl(PHANTOM_CHROME_WEB_STORE_URL)}
                        >
                          Official listing
                        </button>
                      </>
                    ) : null}
                    {target.id === "phantom" ? (
                      <button type="button" className="button-secondary touch-action" onClick={() => void openWalletBrowserHost()}>
                        Open wallet-capable Chrome/Brave host
                      </button>
                    ) : null}
                    {target.id !== "phantom" ? (
                      <button
                        type="button"
                        className="button-secondary touch-action"
                        onClick={() => void loadPriorityExtension(target.id as "phantom" | "bitwarden")}
                        disabled={!onLoadPriorityExtension}
                      >
                        Load unpacked experimental
                      </button>
                    ) : null}
                  </div>
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
