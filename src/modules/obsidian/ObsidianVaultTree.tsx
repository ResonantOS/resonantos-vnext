// Intent citation: docs/architecture/ADR-020-resonant-notes-clean-room-workspace.md

import type { ObsidianNoteSummary } from "../../core/contracts";
import type { CSSProperties, MouseEvent } from "react";

export type ObsidianTreeNode =
  | {
      kind: "folder";
      name: string;
      path: string;
      children: ObsidianTreeNode[];
    }
  | {
      kind: "note";
      name: string;
      path: string;
      note: ObsidianNoteSummary;
    };

type ObsidianVaultTreeProps = {
  notes: ObsidianNoteSummary[];
  selectedPath?: string;
  openFolders: Set<string>;
  onOpenNote: (note: ObsidianNoteSummary) => void;
  onContextMenu: (event: MouseEvent, node: ObsidianTreeNode) => void;
  onToggleFolder: (folderPath: string, open: boolean) => void;
};

export function buildObsidianVaultTree(notes: ObsidianNoteSummary[]): ObsidianTreeNode[] {
  const root: ObsidianTreeNode[] = [];

  for (const note of notes) {
    const parts = note.relativePath.split("/").filter(Boolean);
    let currentLevel = root;
    let folderPath = "";

    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      if (isLeaf) {
        currentLevel.push({
          kind: "note",
          name: part.replace(/\.md$/i, ""),
          path: note.relativePath,
          note,
        });
        return;
      }

      folderPath = folderPath ? `${folderPath}/${part}` : part;
      let folder = currentLevel.find((node) => node.kind === "folder" && node.path === folderPath);
      if (!folder || folder.kind !== "folder") {
        folder = {
          kind: "folder",
          name: part,
          path: folderPath,
          children: [],
        };
        currentLevel.push(folder);
      }
      currentLevel = folder.children;
    });
  }

  return sortTree(root);
}

export function ObsidianVaultTree({ notes, selectedPath, openFolders, onOpenNote, onContextMenu, onToggleFolder }: ObsidianVaultTreeProps) {
  const tree = buildObsidianVaultTree(notes);
  return (
    <div className="obsidian-vault-tree" aria-label="Resonant Notes file explorer">
      {tree.map((node) => (
        <ObsidianVaultTreeNode
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          openFolders={openFolders}
          level={0}
          onOpenNote={onOpenNote}
          onContextMenu={onContextMenu}
          onToggleFolder={onToggleFolder}
        />
      ))}
    </div>
  );
}

function ObsidianVaultTreeNode({
  node,
  selectedPath,
  openFolders,
  level,
  onOpenNote,
  onContextMenu,
  onToggleFolder,
}: {
  node: ObsidianTreeNode;
  selectedPath?: string;
  openFolders: Set<string>;
  level: number;
  onOpenNote: (note: ObsidianNoteSummary) => void;
  onContextMenu: (event: MouseEvent, node: ObsidianTreeNode) => void;
  onToggleFolder: (folderPath: string, open: boolean) => void;
}) {
  const indent = { "--tree-depth": level } as CSSProperties;

  if (node.kind === "folder") {
    return (
      <details
        className="obsidian-tree-folder"
        open={openFolders.has(node.path)}
        style={indent}
        onContextMenu={(event) => onContextMenu(event, node)}
        onToggle={(event) => {
          if (event.currentTarget === event.target) {
            onToggleFolder(node.path, event.currentTarget.open);
          }
        }}
      >
        <summary>
          <span aria-hidden="true">›</span>
          {node.name}
        </summary>
        <div>
          {node.children.map((child) => (
            <ObsidianVaultTreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              openFolders={openFolders}
              level={level + 1}
              onOpenNote={onOpenNote}
              onContextMenu={onContextMenu}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      </details>
    );
  }

  return (
    <button
      type="button"
      className={`obsidian-tree-note ${selectedPath === node.path ? "active" : ""}`}
      style={indent}
      onClick={() => onOpenNote(node.note)}
      onContextMenu={(event) => onContextMenu(event, node)}
    >
      {node.name}
    </button>
  );
}

function sortTree(nodes: ObsidianTreeNode[]): ObsidianTreeNode[] {
  return nodes
    .map((node) => (node.kind === "folder" ? { ...node, children: sortTree(node.children) } : node))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "folder" ? -1 : 1;
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
}
