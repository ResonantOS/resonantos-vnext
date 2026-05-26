// Intent citation: docs/architecture/ADR-019-obsidian-addon-embedded-workspace.md
// Intent citation: docs/architecture/ADR-020-resonant-notes-clean-room-workspace.md

import { Suspense, lazy, useEffect, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import type {
  AddOnInstallation,
  AddOnManifest,
  ObsidianNotePayload,
  ObsidianNoteSummary,
  ObsidianVaultIndex,
  ObsidianWriteNoteResult,
} from "../../core/contracts";
import {
  requestObsidianArchiveNote,
  requestObsidianCreateFolder,
  requestObsidianCreateNote,
  requestObsidianMoveNote,
  requestObsidianNote,
  requestObsidianNoteList,
  requestObsidianVaultIndex,
  requestObsidianVaultStatus,
  requestObsidianWriteNote,
} from "../../core/runtime";
import { ObsidianMetadataPanel } from "./ObsidianMetadataPanel";
import { ObsidianVaultTree } from "./ObsidianVaultTree";
import type { ObsidianTreeNode } from "./ObsidianVaultTree";
import { ObsidianVaultIndexPanel } from "./ObsidianVaultIndexPanel";
import {
  configuredObsidianVaultPath,
  hasObsidianGrant,
  noteIsDirty,
  parseObsidianMetadata,
  renderMarkdownPreview,
} from "./obsidian-workspace-model";
import "./obsidian-workspace.css";

const ObsidianEditor = lazy(() => import("./ObsidianEditor").then((module) => ({ default: module.ObsidianEditor })));

type SidebarView = "files" | "search" | "backlinks";
type ObsidianIconSource = "vendor" | "resonant";
type PendingCreate = { type: "note" | "folder"; path: string } | null;
type PendingRename = { fromPath: string; path: string; expectedModifiedAt?: string } | null;
type WorkspaceContextMenu = {
  node: ObsidianTreeNode;
  x: number;
  y: number;
} | null;

type ObsidianWorkspaceProps = {
  manifest?: AddOnManifest;
  installation?: AddOnInstallation;
  onConfigureAddon: () => void;
  onGrantWorkspaceAccess: () => void | Promise<void>;
};

function ObsidianIcon({ source = "vendor", name }: { source?: ObsidianIconSource; name: string }) {
  const sprite = source === "resonant" ? "/icons/resonant.svg" : "/icons/vendor-ui.svg";
  const prefix = source === "resonant" ? "ros" : "tabler";
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <use href={`${sprite}#${prefix}-${name}`} />
    </svg>
  );
}

const openFoldersStorageKey = (vaultPath: string) => `resonantos.obsidian.openFolders.${vaultPath}`;
const selectedNoteStorageKey = (vaultPath: string) => `resonantos.obsidian.selectedNote.${vaultPath}`;
const openTabsStorageKey = (vaultPath: string) => `resonantos.obsidian.openTabs.${vaultPath}`;

export function ObsidianWorkspace({
  manifest,
  installation,
  onConfigureAddon,
  onGrantWorkspaceAccess,
}: ObsidianWorkspaceProps) {
  const vaultPath = configuredObsidianVaultPath(installation);
  const filesystemGranted = hasObsidianGrant(installation, "filesystem");
  const embeddingGranted = hasObsidianGrant(installation, "ui-embedding");
  const workspaceReady = Boolean(installation?.enabled && filesystemGranted && embeddingGranted && vaultPath);
  const [notes, setNotes] = useState<ObsidianNoteSummary[]>([]);
  const [vaultIndex, setVaultIndex] = useState<ObsidianVaultIndex | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNote, setSelectedNote] = useState<ObsidianNotePayload | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [readingViewOpen, setReadingViewOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<SidebarView>("files");
  const [busyLabel, setBusyLabel] = useState("");
  const [pendingCreate, setPendingCreate] = useState<PendingCreate>(null);
  const [pendingRename, setPendingRename] = useState<PendingRename>(null);
  const [contextMenu, setContextMenu] = useState<WorkspaceContextMenu>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set());
  const [gateBusyLabel, setGateBusyLabel] = useState("");
  const [gateError, setGateError] = useState("");
  const [error, setError] = useState("");
  const [saveResult, setSaveResult] = useState<ObsidianWriteNoteResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceReady) {
      return;
    }
    const loadVault = async () => {
      await requestObsidianVaultStatus(vaultPath);
      const nextNotes = await requestObsidianNoteList(vaultPath, 500);
      if (cancelled) {
        return;
      }
      setNotes(nextNotes);
      setSaveResult(null);
      const storedNotePath = window.localStorage.getItem(selectedNoteStorageKey(vaultPath));
      const noteToRestore = nextNotes.find((note) => note.relativePath === storedNotePath);
      if (!noteToRestore) {
        setSelectedNote(null);
        setDraftContent("");
        return;
      }
      const restoredNote = await requestObsidianNote(vaultPath, noteToRestore.relativePath);
      if (!cancelled) {
        setSelectedNote(restoredNote);
        setDraftContent(restoredNote.content);
        openParentFolder(restoredNote.relativePath);
      }
    };
    setBusyLabel("Loading vault");
    setError("");
    void loadVault()
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load Obsidian workspace.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusyLabel("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady) {
      setOpenFolders(new Set());
      setOpenTabs([]);
      return;
    }
    try {
      const stored = window.localStorage.getItem(openFoldersStorageKey(vaultPath));
      setOpenFolders(new Set(stored ? (JSON.parse(stored) as string[]) : []));
    } catch {
      setOpenFolders(new Set());
    }
  }, [vaultPath, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady) {
      setOpenTabs([]);
      return;
    }
    try {
      const stored = window.localStorage.getItem(openTabsStorageKey(vaultPath));
      setOpenTabs(stored ? (JSON.parse(stored) as string[]) : []);
    } catch {
      setOpenTabs([]);
    }
  }, [vaultPath, workspaceReady]);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceReady) {
      setVaultIndex(null);
      return;
    }
    setBusyLabel("Indexing vault");
    requestObsidianVaultIndex(vaultPath, searchQuery, 200)
      .then((nextIndex) => {
        if (!cancelled) {
          setVaultIndex(nextIndex);
        }
      })
      .catch((indexError) => {
        if (!cancelled) {
          setError(indexError instanceof Error ? indexError.message : "Failed to index Obsidian-compatible vault.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusyLabel("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, workspaceReady, searchQuery]);

  const openNote = async (note: ObsidianNoteSummary) => {
    if (noteIsDirty(selectedNote, draftContent)) {
      setError("Save or discard the current note before opening another note.");
      return;
    }
    setBusyLabel("Opening note");
    setError("");
    setSaveResult(null);
    try {
      const payload = await requestObsidianNote(vaultPath, note.relativePath);
      setSelectedNote(payload);
      setDraftContent(payload.content);
      window.localStorage.setItem(selectedNoteStorageKey(vaultPath), payload.relativePath);
      rememberOpenTabs([...openTabs.filter((path) => path !== payload.relativePath), payload.relativePath]);
      openParentFolder(payload.relativePath);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Failed to open Obsidian note.");
    } finally {
      setBusyLabel("");
    }
  };

  const openNotePath = (notePath: string) => {
    const note =
      notes.find((item) => item.relativePath === notePath) ??
      vaultIndex?.notes.find((item) => item.relativePath === notePath);
    if (!note) {
      setError(`Note is not available in the current vault index: ${notePath}`);
      return;
    }
    void openNote(note);
  };

  const refreshWorkspace = async () => {
    const [nextNotes, nextIndex] = await Promise.all([
      requestObsidianNoteList(vaultPath, 500),
      requestObsidianVaultIndex(vaultPath, searchQuery, 200),
    ]);
    setNotes(nextNotes);
    setVaultIndex(nextIndex);
    return nextNotes;
  };

  const rememberOpenTabs = (nextTabs: string[]) => {
    const dedupedTabs = [...new Set(nextTabs)].filter(Boolean).slice(-8);
    setOpenTabs(dedupedTabs);
    window.localStorage.setItem(openTabsStorageKey(vaultPath), JSON.stringify(dedupedTabs));
  };

  const rememberOpenFolders = (nextOpenFolders: Set<string>) => {
    setOpenFolders(nextOpenFolders);
    window.localStorage.setItem(openFoldersStorageKey(vaultPath), JSON.stringify([...nextOpenFolders]));
  };

  const toggleFolder = (folderPath: string, open: boolean) => {
    const nextOpenFolders = new Set(openFolders);
    if (open) {
      nextOpenFolders.add(folderPath);
    } else {
      nextOpenFolders.delete(folderPath);
    }
    rememberOpenFolders(nextOpenFolders);
  };

  const openParentFolder = (notePath: string) => {
    const folders = notePath.split("/").slice(0, -1);
    if (!folders.length) {
      return;
    }
    const nextOpenFolders = new Set(openFolders);
    folders.reduce((parent, folder) => {
      const folderPath = parent ? `${parent}/${folder}` : folder;
      nextOpenFolders.add(folderPath);
      return folderPath;
    }, "");
    rememberOpenFolders(nextOpenFolders);
  };

  const saveNote = async () => {
    if (!selectedNote || !noteIsDirty(selectedNote, draftContent)) {
      return;
    }
    setBusyLabel("Saving note");
    setError("");
    setSaveResult(null);
    try {
      const result = await requestObsidianWriteNote({
        vaultPath,
        notePath: selectedNote.relativePath,
        content: draftContent,
        expectedModifiedAt: selectedNote.modifiedAt,
        actorId: "addon.obsidian",
      });
      setSaveResult(result);
      setSelectedNote({
        ...selectedNote,
        content: draftContent,
        sizeBytes: result.sizeBytes,
        modifiedAt: result.modifiedAt,
      });
      setNotes((current) =>
        current.map((note) =>
          note.relativePath === result.notePath
            ? {
                ...note,
                sizeBytes: result.sizeBytes,
                modifiedAt: result.modifiedAt,
              }
          : note,
        ),
      );
      setVaultIndex(await requestObsidianVaultIndex(vaultPath, searchQuery, 200));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save Obsidian note.");
    } finally {
      setBusyLabel("");
    }
  };

  const discardDraft = () => {
    if (!selectedNote) {
      return;
    }
    setDraftContent(selectedNote.content);
    setError("");
  };

  const normaliseNotePath = (rawPath: string) => {
    const trimmed = rawPath.trim().replace(/^\/+/, "");
    return trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
  };

  const defaultCreatePath = (type: "note" | "folder") => {
    const defaultFolder = selectedNote?.relativePath.includes("/") ? selectedNote.relativePath.split("/").slice(0, -1).join("/") : "";
    if (type === "note") {
      return defaultFolder ? `${defaultFolder}/Untitled.md` : "Untitled.md";
    }
    return defaultFolder ? `${defaultFolder}/New Folder` : "New Folder";
  };

  const startCreate = (type: "note" | "folder") => {
    if (dirty) {
      setError("Save or discard the current note before changing the vault structure.");
      return;
    }
    setSidebarView("files");
    setPendingCreate({ type, path: defaultCreatePath(type) });
    setPendingRename(null);
    setError("");
  };

  const startRename = (note: ObsidianNoteSummary | ObsidianNotePayload | null = selectedNote) => {
    if (!note) {
      return;
    }
    if (dirty) {
      setError("Save or discard the current note before renaming or moving it.");
      return;
    }
    setSidebarView("files");
    setPendingCreate(null);
    setContextMenu(null);
    setPendingRename({ fromPath: note.relativePath, path: note.relativePath, expectedModifiedAt: note.modifiedAt });
    setError("");
  };

  const createNote = async (requestedPath: string) => {
    if (dirty) {
      setError("Save or discard the current note before creating another note.");
      return;
    }
    setBusyLabel("Creating note");
    setError("");
    setSaveResult(null);
    try {
      const notePath = normaliseNotePath(requestedPath);
      const result = await requestObsidianCreateNote({
        vaultPath,
        notePath,
        content: `# ${notePath.split("/").at(-1)?.replace(/\.md$/i, "") ?? "Untitled"}\n`,
        actorId: "addon.obsidian",
      });
      const nextNotes = await refreshWorkspace();
      openParentFolder(notePath);
      const createdNote = nextNotes.find((note) => note.relativePath === result.notePath);
      if (createdNote) {
        await openNote(createdNote);
      }
      setPendingCreate(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create Obsidian note.");
    } finally {
      setBusyLabel("");
    }
  };

  const createFolder = async (requestedPath: string) => {
    setBusyLabel("Creating folder");
    setError("");
    setSaveResult(null);
    try {
      await requestObsidianCreateFolder({
        vaultPath,
        folderPath: requestedPath.trim().replace(/^\/+/, ""),
        actorId: "addon.obsidian",
      });
      await refreshWorkspace();
      openParentFolder(`${requestedPath.trim().replace(/^\/+/, "")}/placeholder.md`);
      setPendingCreate(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create Obsidian folder.");
    } finally {
      setBusyLabel("");
    }
  };

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingCreate?.path.trim()) {
      setError("Enter a path before creating a vault item.");
      return;
    }
    if (pendingCreate.type === "note") {
      void createNote(pendingCreate.path);
    } else {
      void createFolder(pendingCreate.path);
    }
  };

  const moveNote = async (requestedPath: string) => {
    if (!pendingRename) {
      return;
    }
    if (dirty) {
      setError("Save or discard the current note before renaming or moving it.");
      return;
    }
    if (!requestedPath || requestedPath.trim() === pendingRename.fromPath) {
      setPendingRename(null);
      return;
    }
    setBusyLabel("Moving note");
    setError("");
    setSaveResult(null);
    try {
      const result = await requestObsidianMoveNote({
        vaultPath,
        fromNotePath: pendingRename.fromPath,
        toNotePath: normaliseNotePath(requestedPath),
        expectedModifiedAt: pendingRename.expectedModifiedAt,
        actorId: "addon.obsidian",
      });
      const nextNotes = await refreshWorkspace();
      const movedNotePath = result.notePath ?? normaliseNotePath(requestedPath);
      openParentFolder(movedNotePath);
      const movedNote = nextNotes.find((note) => note.relativePath === movedNotePath);
      if (movedNote) {
        await openNote(movedNote);
      }
      rememberOpenTabs(openTabs.map((path) => (path === pendingRename.fromPath ? movedNotePath : path)));
      setPendingRename(null);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Failed to move Obsidian note.");
    } finally {
      setBusyLabel("");
    }
  };

  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingRename?.path.trim()) {
      setError("Enter a note path before renaming.");
      return;
    }
    void moveNote(pendingRename.path);
  };

  const startCreateInFolder = (type: "note" | "folder", folderPath: string) => {
    if (dirty) {
      setError("Save or discard the current note before changing the vault structure.");
      return;
    }
    const basePath = folderPath.replace(/\/+$/, "");
    setSidebarView("files");
    setPendingRename(null);
    setContextMenu(null);
    setPendingCreate({
      type,
      path: type === "note" ? `${basePath}/Untitled.md` : `${basePath}/New Folder`,
    });
    openParentFolder(`${basePath}/placeholder.md`);
  };

  const archiveNotePath = async (note: ObsidianNoteSummary | ObsidianNotePayload) => {
    if (dirty) {
      setError("Save or discard the current note before archiving it.");
      return;
    }
    setContextMenu(null);
    if (!window.confirm(`Archive ${note.relativePath}? The file will move to the vault .resonantos trash.`)) {
      return;
    }
    setBusyLabel("Archiving note");
    setError("");
    setSaveResult(null);
    try {
      await requestObsidianArchiveNote({
        vaultPath,
        notePath: note.relativePath,
        expectedModifiedAt: note.modifiedAt,
        actorId: "addon.obsidian",
      });
      await refreshWorkspace();
      const nextTabs = openTabs.filter((path) => path !== note.relativePath);
      rememberOpenTabs(nextTabs);
      if (selectedNote?.relativePath === note.relativePath) {
        window.localStorage.removeItem(selectedNoteStorageKey(vaultPath));
        setSelectedNote(null);
        setDraftContent("");
      }
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Failed to archive Obsidian note.");
    } finally {
      setBusyLabel("");
    }
  };

  const openContextMenu = (event: MouseEvent, node: ObsidianTreeNode) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ node, x: event.clientX, y: event.clientY });
  };

  const closeTab = (notePath: string) => {
    if (selectedNote?.relativePath === notePath && dirty) {
      setError("Save or discard the current note before closing its tab.");
      return;
    }
    const nextTabs = openTabs.filter((path) => path !== notePath);
    rememberOpenTabs(nextTabs);
    if (selectedNote?.relativePath === notePath) {
      window.localStorage.removeItem(selectedNoteStorageKey(vaultPath));
      setSelectedNote(null);
      setDraftContent("");
    }
  };

  const archiveNote = async () => {
    if (!selectedNote) {
      return;
    }
    if (dirty) {
      setError("Save or discard the current note before archiving it.");
      return;
    }
    await archiveNotePath(selectedNote);
  };

  const connectWorkspace = async () => {
    setGateBusyLabel("Opening vault picker");
    setGateError("");
    try {
      await onGrantWorkspaceAccess();
    } catch (connectError) {
      setGateError(connectError instanceof Error ? connectError.message : "Failed to connect the Obsidian workspace.");
    } finally {
      setGateBusyLabel("");
    }
  };

  const dirty = noteIsDirty(selectedNote, draftContent);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        Boolean(target?.closest("[contenteditable='true']"));
      const modifierPressed = event.metaKey || event.ctrlKey;
      if (modifierPressed && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNote();
        return;
      }
      if (isEditableTarget) {
        return;
      }
      if (modifierPressed && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        startCreate("folder");
        return;
      }
      if (modifierPressed && event.key.toLowerCase() === "n") {
        event.preventDefault();
        startCreate("note");
        return;
      }
      if (event.key === "F2") {
        event.preventDefault();
        startRename();
        return;
      }
      if (event.key === "Escape") {
        setPendingCreate(null);
        setPendingRename(null);
        setContextMenu(null);
        setError("");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("blur", closeContextMenu);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("blur", closeContextMenu);
    };
  }, [contextMenu]);

  if (!workspaceReady) {
    const missingRequirements = [
      !installation?.enabled ? "enable the add-on" : "",
      !filesystemGranted ? "grant filesystem access" : "",
      !embeddingGranted ? "grant workspace embedding" : "",
      !vaultPath ? "choose a markdown vault or folder" : "",
    ].filter(Boolean);
    return (
      <section className="obsidian-workspace obsidian-workspace-gate" data-testid="obsidian-workspace">
        <div>
          <span className="eyebrow">Resonant Notes Workspace</span>
          <h3>Connect a vault before editing inside ResonantOS.</h3>
          <p>
            {manifest?.name ?? "Resonant Notes"} needs an enabled add-on, a selected vault, filesystem access, and the
            embedded workspace grant. The existing vault bridge remains available from Add-ons.
          </p>
          {missingRequirements.length ? (
            <p className="obsidian-workspace-gate-requirements">Next: {missingRequirements.join(", ")}.</p>
          ) : null}
          {gateBusyLabel ? <p className="obsidian-workspace-gate-status">{gateBusyLabel}...</p> : null}
          {gateError ? <p className="obsidian-workspace-gate-error">{gateError}</p> : null}
        </div>
        <div className="obsidian-workspace-actions">
          <button type="button" className="button-primary" onClick={() => void connectWorkspace()} disabled={Boolean(gateBusyLabel)}>
            {vaultPath ? "Grant workspace access" : "Connect workspace"}
          </button>
          <button type="button" className="button-secondary" onClick={onConfigureAddon}>
            Open Notes settings
          </button>
        </div>
      </section>
    );
  }

  const metadata = parseObsidianMetadata(draftContent);
  const selectedIndexedNote = selectedNote
    ? vaultIndex?.notes.find((note) => note.relativePath === selectedNote.relativePath)
    : undefined;
  const selectedFolder = selectedNote?.relativePath.includes("/")
    ? selectedNote.relativePath.split("/").slice(0, -1).join(" / ")
    : "Vault root";
  const vaultName = vaultPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "Vault";
  const wordCount = draftContent.trim() ? draftContent.trim().split(/\s+/).length : 0;
  const characterCount = draftContent.length;
  const noteTitleForPath = (notePath: string) =>
    notes.find((note) => note.relativePath === notePath)?.title ?? notePath.split("/").at(-1)?.replace(/\.md$/i, "") ?? notePath;

  return (
    <section className={`obsidian-workspace ${error ? "has-alert" : ""}`} data-testid="obsidian-workspace">
      <header className="obsidian-workspace-header">
        <div className="obsidian-window-tabs" aria-label="Resonant Notes tabs">
          <button type="button" className="obsidian-window-tab">
            {vaultName}
          </button>
          {openTabs.length ? (
            openTabs.map((notePath) => (
              <button
                key={notePath}
                type="button"
                className={`obsidian-window-tab ${selectedNote?.relativePath === notePath ? "active" : ""}`}
                onClick={() => openNotePath(notePath)}
              >
                <span>{noteTitleForPath(notePath)}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Close ${noteTitleForPath(notePath)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(notePath);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      closeTab(notePath);
                    }
                  }}
                >
                  ×
                </span>
              </button>
            ))
          ) : (
            <button type="button" className="obsidian-window-tab active">
              Select a note
            </button>
          )}
        </div>
        <div className="obsidian-workspace-actions">
          {busyLabel ? <span className="obsidian-state-pill">{busyLabel}...</span> : null}
          {dirty ? <span className="obsidian-state-pill warning">unsaved</span> : <span className="obsidian-state-pill active">synced</span>}
          <button
            type="button"
            className="obsidian-icon-button"
            onClick={() => setReadingViewOpen((current) => !current)}
            aria-label={readingViewOpen ? "Editing view" : "Reading view"}
            title={readingViewOpen ? "Editing view" : "Reading view"}
          >
            <ObsidianIcon name={readingViewOpen ? "pencil" : "eye"} />
          </button>
          <button type="button" className="obsidian-icon-button" onClick={discardDraft} disabled={!dirty} aria-label="Discard" title="Discard">
            <ObsidianIcon source="resonant" name="delete" />
          </button>
          <button
            type="button"
            className="obsidian-icon-button primary"
            onClick={() => void saveNote()}
            disabled={!dirty || Boolean(busyLabel)}
            aria-label="Save"
            title="Save"
          >
            <ObsidianIcon source="resonant" name="save-archive" />
          </button>
        </div>
      </header>

      {error ? <div className="obsidian-workspace-alert">{error}</div> : null}

      <div className="obsidian-workspace-grid">
        <nav className="obsidian-side-icons" aria-label="Resonant Notes tools">
          <button
            type="button"
            className={sidebarView === "files" ? "active" : ""}
            onClick={() => setSidebarView("files")}
            aria-label="Show file explorer"
            title="Files"
          >
            <ObsidianIcon name="folder" />
          </button>
          <button
            type="button"
            className={sidebarView === "search" ? "active" : ""}
            onClick={() => setSidebarView("search")}
            aria-label="Show search"
            title="Search"
          >
            <ObsidianIcon name="search" />
          </button>
          <button
            type="button"
            className={sidebarView === "backlinks" ? "active" : ""}
            onClick={() => setSidebarView("backlinks")}
            aria-label="Show backlinks"
            title="Backlinks"
          >
            <ObsidianIcon name="git-branch" />
          </button>
        </nav>

        <aside className="obsidian-workspace-tree" aria-label="Resonant Notes vault note list">
          <div className="obsidian-workspace-tree-header">
            <span className="eyebrow">{sidebarView === "files" ? vaultName : sidebarView}</span>
            {sidebarView === "files" ? (
              <div className="obsidian-tree-actions" aria-label="Vault file actions">
                <button type="button" className="obsidian-icon-button" onClick={() => startCreate("note")} disabled={Boolean(busyLabel)} aria-label="New note" title="New note">
                  <ObsidianIcon name="message-plus" />
                </button>
                <button
                  type="button"
                  className="obsidian-icon-button"
                  onClick={() => startCreate("folder")}
                  disabled={Boolean(busyLabel)}
                  aria-label="New folder"
                  title="New folder"
                >
                  <ObsidianIcon name="folder-plus" />
                </button>
                <button
                  type="button"
                  className="obsidian-icon-button"
                  onClick={() => startRename()}
                  disabled={!selectedNote || Boolean(busyLabel)}
                  aria-label="Rename"
                  title="Rename or move"
                >
                  <ObsidianIcon name="pencil" />
                </button>
                <button
                  type="button"
                  className="obsidian-icon-button danger"
                  onClick={() => void archiveNote()}
                  disabled={!selectedNote || Boolean(busyLabel)}
                  aria-label="Archive"
                  title="Archive note"
                >
                  <ObsidianIcon name="archive" />
                </button>
              </div>
            ) : null}
            <small>{notes.length} note(s)</small>
          </div>
          {sidebarView === "files" ? (
            <>
              {pendingCreate ? (
                <form className="obsidian-create-inline" onSubmit={submitCreate}>
                  <label>
                    <span>{pendingCreate.type === "note" ? "Note path" : "Folder path"}</span>
                    <input
                      autoFocus
                      aria-label={pendingCreate.type === "note" ? "New note path" : "New folder path"}
                      value={pendingCreate.path}
                      onChange={(event) => setPendingCreate({ ...pendingCreate, path: event.target.value })}
                    />
                  </label>
                  <div>
                    <button type="submit" className="obsidian-icon-button primary" aria-label="Create" title="Create">
                      <ObsidianIcon source="resonant" name="plus" />
                    </button>
                    <button type="button" className="obsidian-icon-button" onClick={() => setPendingCreate(null)} aria-label="Cancel" title="Cancel">
                      <ObsidianIcon source="resonant" name="delete" />
                    </button>
                  </div>
                </form>
              ) : null}
              {pendingRename ? (
                <form className="obsidian-create-inline" onSubmit={submitRename}>
                  <label>
                    <span>Rename path</span>
                    <input
                      autoFocus
                      aria-label="Rename note path"
                      value={pendingRename.path}
                      onChange={(event) => setPendingRename({ ...pendingRename, path: event.target.value })}
                    />
                  </label>
                  <div>
                    <button type="submit" className="obsidian-icon-button primary" aria-label="Apply rename" title="Apply rename">
                      <ObsidianIcon source="resonant" name="save-archive" />
                    </button>
                    <button type="button" className="obsidian-icon-button" onClick={() => setPendingRename(null)} aria-label="Cancel rename" title="Cancel">
                      <ObsidianIcon source="resonant" name="delete" />
                    </button>
                  </div>
                </form>
              ) : null}
              <ObsidianVaultTree
                notes={notes}
                selectedPath={selectedNote?.relativePath}
                openFolders={openFolders}
                onOpenNote={(note) => void openNote(note)}
                onContextMenu={openContextMenu}
                onToggleFolder={toggleFolder}
              />
            </>
          ) : (
            <ObsidianVaultIndexPanel
              index={vaultIndex}
              selectedNote={selectedIndexedNote}
              searchQuery={searchQuery}
              busy={busyLabel === "Indexing vault"}
              mode={sidebarView}
              onSearchQueryChange={setSearchQuery}
              onOpenNotePath={openNotePath}
            />
          )}
        </aside>

        <main className="obsidian-note-main">
          <div className="obsidian-note-breadcrumb">
            <span>{selectedFolder}</span>
            <strong>{selectedNote?.title ?? "No note selected"}</strong>
          </div>
          <ObsidianMetadataPanel metadata={metadata} />
          {readingViewOpen ? (
            <article className="obsidian-preview-panel" aria-label="Resonant Notes markdown preview">
              {selectedNote ? (
                <div dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(draftContent) }} />
              ) : (
                <p className="muted-copy">Preview appears after selecting a note.</p>
              )}
            </article>
          ) : (
            <article className="obsidian-editor-panel" aria-label="Resonant Notes markdown editor">
              {selectedNote ? (
                <Suspense
                  fallback={
                    <div className="obsidian-empty-editor">
                      <p>Loading markdown editor...</p>
                    </div>
                  }
                >
                  <ObsidianEditor value={draftContent} onChange={setDraftContent} disabled={Boolean(busyLabel)} />
                </Suspense>
              ) : (
                <div className="obsidian-empty-editor">
                  <h4>Select a note to edit.</h4>
                  <p>Writes are audited and versioned before ResonantOS overwrites the vault file.</p>
                </div>
              )}
            </article>
          )}
          <footer className="obsidian-status-bar" aria-label="Resonant Notes workspace status">
            {busyLabel ? <span>{busyLabel}...</span> : null}
            {saveResult ? <span>Saved with audit</span> : null}
            <span>{selectedIndexedNote?.backlinks.length ?? 0} backlinks</span>
            <span>{readingViewOpen ? "Reading view" : "Editing view"}</span>
            <span>{wordCount.toLocaleString()} words</span>
            <span>{characterCount.toLocaleString()} characters</span>
          </footer>
        </main>
      </div>
      {contextMenu ? (
        <div
          className="obsidian-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          aria-label="Resonant Notes context menu"
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.node.kind === "note" ? (
            <>
              <button type="button" role="menuitem" onClick={() => contextMenu.node.kind === "note" && void openNote(contextMenu.node.note)}>
                Open
              </button>
              <button type="button" role="menuitem" onClick={() => contextMenu.node.kind === "note" && startRename(contextMenu.node.note)}>
                Rename / move
              </button>
              <button type="button" role="menuitem" onClick={() => contextMenu.node.kind === "note" && void archiveNotePath(contextMenu.node.note)}>
                Archive
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => startCreateInFolder("note", contextMenu.node.path)}>
                New note
              </button>
              <button type="button" role="menuitem" onClick={() => startCreateInFolder("folder", contextMenu.node.path)}>
                New folder
              </button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
