// Intent citation: docs/architecture/ADR-018-addon-sdk-v0.md

import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { AddOnInstallation, AddOnManifest, CapabilityGrant } from "../../core/contracts";
import {
  requestTerminalResizePty,
  requestTerminalStartPty,
  requestTerminalStopPty,
  requestTerminalWritePty,
} from "../../core/runtime";
import "./terminal.css";

type TerminalWorkspaceProps = {
  manifest?: AddOnManifest;
  installation?: AddOnInstallation;
  onConfigureAddon: () => void;
  onGrantWorkspaceAccess?: () => void;
};

type TerminalPtyDataEvent = {
  sessionId: string;
  data: string;
};

type TerminalTab = {
  id: string;
  label: string;
};

type TerminalStatus = "running" | "exited";

type TerminalPersistedState = {
  tabs: TerminalTab[];
  activeTabId: string;
  nextTabIndex: number;
};

type TerminalContextMenu = {
  tabId: string;
  x: number;
  y: number;
};

const TERMINAL_STORAGE_KEY = "resonantos.terminal.workspace.v1";
const DEFAULT_TERMINAL_STATE: TerminalPersistedState = {
  tabs: [{ id: "terminal-main", label: "Terminal 1" }],
  activeTabId: "terminal-main",
  nextTabIndex: 2,
};

const hasTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const hasGrant = (installation: AddOnInstallation | undefined, capability: CapabilityGrant["capability"]): boolean =>
  Boolean(installation?.enabled && installation.grantedCapabilities.some((grant) => grant.capability === capability && grant.granted));

const canUseStorage = (): boolean => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const loadPersistedTerminalState = (): TerminalPersistedState => {
  if (!canUseStorage()) {
    return DEFAULT_TERMINAL_STATE;
  }
  try {
    const raw = window.localStorage.getItem(TERMINAL_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_TERMINAL_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<TerminalPersistedState>;
    const tabs =
      Array.isArray(parsed.tabs) && parsed.tabs.length
        ? parsed.tabs.filter((tab) => typeof tab.id === "string" && typeof tab.label === "string")
        : DEFAULT_TERMINAL_STATE.tabs;
    const activeTabId =
      typeof parsed.activeTabId === "string" && tabs.some((tab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : tabs[0].id;
    const nextTabIndex =
      typeof parsed.nextTabIndex === "number" && Number.isFinite(parsed.nextTabIndex)
        ? Math.max(2, Math.floor(parsed.nextTabIndex))
        : tabs.length + 1;
    return { tabs, activeTabId, nextTabIndex };
  } catch {
    return DEFAULT_TERMINAL_STATE;
  }
};

const savePersistedTerminalState = (state: TerminalPersistedState): void => {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(TERMINAL_STORAGE_KEY, JSON.stringify(state));
};

let terminalState = loadPersistedTerminalState();

export function TerminalWorkspace({ manifest, installation, onConfigureAddon, onGrantWorkspaceAccess }: TerminalWorkspaceProps) {
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [tabs, setTabs] = useState<TerminalTab[]>(terminalState.tabs);
  const [activeTabId, setActiveTabId] = useState(terminalState.activeTabId);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [terminalStatuses, setTerminalStatuses] = useState<Record<string, TerminalStatus>>({});
  const [contextMenu, setContextMenu] = useState<TerminalContextMenu | null>(null);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const shellGranted = hasGrant(installation, "shell");
  const embeddingGranted = hasGrant(installation, "ui-embedding");
  const ready = Boolean(installation?.enabled && shellGranted && embeddingGranted);
  const missingRequirements = useMemo(
    () =>
      [
        !installation?.enabled ? "enable the add-on" : "",
        !shellGranted ? "grant shell" : "",
        !embeddingGranted ? "grant workspace embedding" : "",
      ].filter(Boolean),
    [embeddingGranted, installation?.enabled, shellGranted],
  );

  const persistTerminalState = (
    nextTabs: TerminalTab[],
    nextActiveTabId: string,
    nextTabIndex = terminalState.nextTabIndex,
  ) => {
    terminalState = {
      tabs: nextTabs,
      activeTabId: nextActiveTabId,
      nextTabIndex,
    };
    savePersistedTerminalState(terminalState);
    setTabs(nextTabs);
    setActiveTabId(nextActiveTabId);
  };

  const createTab = () => {
    const index = terminalState.nextTabIndex;
    const tab = { id: `terminal-${Date.now()}-${index}`, label: `Terminal ${index}` };
    persistTerminalState([...tabs, tab], tab.id, index + 1);
  };

  const selectTab = (tabId: string) => {
    persistTerminalState(tabs, tabId);
  };

  const tabIsLive = (tabId: string): boolean => terminalStatuses[tabId] !== "exited";

  const closeTab = (tabId: string, force = false) => {
    if (tabs.length === 1) {
      return;
    }
    if (!force && tabIsLive(tabId) && !window.confirm("Close this terminal tab and stop its running shell?")) {
      return;
    }
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    const nextActiveTabId =
      activeTabId === tabId ? nextTabs[Math.max(0, tabs.findIndex((tab) => tab.id === tabId) - 1)]?.id ?? nextTabs[0].id : activeTabId;
    void requestTerminalStopPty(tabId).catch(() => undefined);
    setTerminalStatuses((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    persistTerminalState(nextTabs, nextActiveTabId);
  };

  const duplicateTab = (tab: TerminalTab) => {
    const index = terminalState.nextTabIndex;
    const duplicate = { id: `terminal-${Date.now()}-${index}`, label: `${tab.label} copy` };
    persistTerminalState([...tabs, duplicate], duplicate.id, index + 1);
  };

  const closeOtherTabs = (tabId: string) => {
    const closingTabs = tabs.filter((tab) => tab.id !== tabId);
    const hasLiveTabs = closingTabs.some((tab) => tabIsLive(tab.id));
    if (hasLiveTabs && !window.confirm("Close other terminal tabs and stop their running shells?")) {
      return;
    }
    closingTabs.forEach((tab) => void requestTerminalStopPty(tab.id).catch(() => undefined));
    setTerminalStatuses((current) => {
      const target = current[tabId];
      return target ? { [tabId]: target } : {};
    });
    persistTerminalState(tabs.filter((tab) => tab.id === tabId), tabId);
  };

  const startRenamingTab = (tab: TerminalTab) => {
    setEditingTabId(tab.id);
    setEditingLabel(tab.label);
  };

  const commitRenamingTab = () => {
    if (!editingTabId) {
      return;
    }
    const trimmed = editingLabel.trim();
    const nextTabs = tabs.map((tab) => (tab.id === editingTabId ? { ...tab, label: trimmed || tab.label } : tab));
    persistTerminalState(nextTabs, activeTabId);
    setEditingTabId(null);
    setEditingLabel("");
  };

  const cancelRenamingTab = () => {
    setEditingTabId(null);
    setEditingLabel("");
  };

  useEffect(() => {
    const closeMenus = () => {
      setContextMenu(null);
    };
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);

  useEffect(() => {
    if (!ready || !hasTauri() || !terminalHostRef.current || !activeTab) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.24,
      scrollback: 6000,
      theme: {
        background: "#0c0f0e",
        foreground: "#d9f6df",
        cursor: "#93e7aa",
        selectionBackground: "#2f5f42",
        black: "#0c0f0e",
        red: "#ff8b7d",
        green: "#93e7aa",
        yellow: "#e8d98e",
        blue: "#82b9ff",
        magenta: "#d7a1ff",
        cyan: "#78dcc7",
        white: "#f1f5ec",
        brightBlack: "#65716b",
        brightRed: "#ffb4a8",
        brightGreen: "#b8f7c7",
        brightYellow: "#fff1a8",
        brightBlue: "#a8d1ff",
        brightMagenta: "#e7c3ff",
        brightCyan: "#a5f0df",
        brightWhite: "#ffffff",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalHostRef.current);
    fitAddon.fit();
    terminal.focus();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const syncSize = () => {
      if (!fitAddonRef.current || !terminalRef.current) {
        return;
      }
      fitAddonRef.current.fit();
      void requestTerminalResizePty({
        sessionId: activeTab.id,
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows,
      }).catch(() => undefined);
    };

    terminal.onData((data) => {
      void requestTerminalWritePty({ sessionId: activeTab.id, data }).catch((error) => {
        terminal.writeln(`\r\n[terminal input failed: ${error instanceof Error ? error.message : "unknown error"}]`);
      });
    });

    void (async () => {
      try {
        unlisten = await listen<TerminalPtyDataEvent>("terminal-pty-data", (event) => {
          if (event.payload.sessionId === activeTab.id && terminalRef.current) {
            terminalRef.current.write(event.payload.data);
            if (event.payload.data.includes("[terminal session closed]")) {
              setTerminalStatuses((current) => ({ ...current, [activeTab.id]: "exited" }));
            }
          }
        });
        const session = await requestTerminalStartPty({
          sessionId: activeTab.id,
          cols: terminal.cols,
          rows: terminal.rows,
        });
        if (!disposed) {
          setTerminalStatuses((current) => ({ ...current, [activeTab.id]: "running" }));
          terminal.focus();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Terminal PTY failed to start.";
        terminal.writeln(`[${message}]`);
      }
    })();

    resizeObserverRef.current = new ResizeObserver(syncSize);
    resizeObserverRef.current.observe(terminalHostRef.current);
    window.addEventListener("resize", syncSize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", syncSize);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      unlisten?.();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [activeTab, ready]);

  if (!ready) {
    return (
      <section className="terminal-workspace terminal-gate" data-testid="terminal-workspace">
        <div>
          <span className="eyebrow">{manifest?.name ?? "Terminal"} add-on</span>
          <h3>Terminal workspace is gated.</h3>
          <p>Next: {missingRequirements.join(", ") || "configure the add-on"}.</p>
        </div>
        <button type="button" className="button-secondary" onClick={onConfigureAddon}>
          Configure
        </button>
        {onGrantWorkspaceAccess ? (
          <button type="button" className="button-primary" onClick={onGrantWorkspaceAccess}>
            Grant access
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="terminal-workspace" data-testid="terminal-workspace">
      <div className="terminal-tab-strip" role="tablist" aria-label="Terminal tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={tab.id === activeTabId}
            className={`terminal-tab ${tab.id === activeTabId ? "active" : ""}`}
            onClick={() => selectTab(tab.id)}
            onDoubleClick={() => startRenamingTab(tab)}
            onContextMenu={(event) => {
              event.preventDefault();
              selectTab(tab.id);
              setContextMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
            }}
            onKeyDown={(event) => {
              if (editingTabId) {
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectTab(tab.id);
              }
            }}
          >
            {editingTabId === tab.id ? (
              <input
                className="terminal-tab-input"
                value={editingLabel}
                autoFocus
                onChange={(event) => setEditingLabel(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={commitRenamingTab}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRenamingTab();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelRenamingTab();
                  }
                }}
                aria-label={`Rename ${tab.label}`}
              />
            ) : (
              <>
                <span className={`terminal-tab-status ${terminalStatuses[tab.id] === "exited" ? "exited" : "running"}`} />
                <span>{tab.label}</span>
              </>
            )}
            {tabs.length > 1 ? (
              <button
                type="button"
                aria-label={`Close ${tab.label}`}
                className="terminal-tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeTab(tab.id);
                  }
                }}
              >
                x
              </button>
            ) : null}
          </div>
        ))}
        <button type="button" className="terminal-tab-add" onClick={createTab} aria-label="New terminal tab">
          +
        </button>
      </div>
      {contextMenu ? (
        <div
          className="terminal-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => {
            const tab = tabs.find((item) => item.id === contextMenu.tabId);
            if (tab) {
              startRenamingTab(tab);
            }
            setContextMenu(null);
          }}>
            Rename
          </button>
          <button type="button" onClick={() => {
            const tab = tabs.find((item) => item.id === contextMenu.tabId);
            if (tab) {
              duplicateTab(tab);
            }
            setContextMenu(null);
          }}>
            Duplicate
          </button>
          <button type="button" disabled={tabs.length === 1} onClick={() => {
            closeTab(contextMenu.tabId);
            setContextMenu(null);
          }}>
            Close
          </button>
          <button type="button" disabled={tabs.length === 1} onClick={() => {
            closeOtherTabs(contextMenu.tabId);
            setContextMenu(null);
          }}>
            Close Others
          </button>
        </div>
      ) : null}
      <div ref={terminalHostRef} className="terminal-pty-host" aria-label="ResonantOS terminal PTY" />
    </section>
  );
}
