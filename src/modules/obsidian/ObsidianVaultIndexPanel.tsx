// Intent citation: docs/architecture/ADR-020-resonant-notes-clean-room-workspace.md

import type { ObsidianIndexedNote, ObsidianVaultIndex } from "../../core/contracts";

type ObsidianVaultIndexPanelProps = {
  index: ObsidianVaultIndex | null;
  selectedNote?: ObsidianIndexedNote;
  searchQuery: string;
  busy: boolean;
  mode: "search" | "backlinks";
  onSearchQueryChange: (value: string) => void;
  onOpenNotePath: (notePath: string) => void;
};

export function ObsidianVaultIndexPanel({
  index,
  selectedNote,
  searchQuery,
  busy,
  mode,
  onSearchQueryChange,
  onOpenNotePath,
}: ObsidianVaultIndexPanelProps) {
  return (
    <section className="obsidian-index-panel" aria-label="Resonant Notes vault index">
      {mode === "search" ? (
        <div className="obsidian-index-search">
          <label>
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search notes, tags, links"
              aria-label="Search Obsidian-compatible vault"
            />
          </label>
          <p className="obsidian-index-count">
            {busy
              ? "Indexing vault..."
              : `${index?.notes.length ?? 0} shown from ${index?.noteCount ?? 0} indexed note(s).`}
          </p>
        </div>
      ) : null}

      {mode === "backlinks" ? (
        <div className="obsidian-index-section">
          <span className="eyebrow">Backlinks</span>
          {selectedNote?.backlinks.length ? (
            <div className="obsidian-index-list">
              {selectedNote.backlinks.map((backlink) => (
                <button key={backlink.sourcePath} type="button" onClick={() => onOpenNotePath(backlink.sourcePath)}>
                  <strong>{backlink.sourceTitle}</strong>
                  <span>{backlink.sourcePath}</span>
                </button>
              ))}
            </div>
          ) : (
            <p>No backlinks for the selected note.</p>
          )}
        </div>
      ) : null}

      {mode === "search" ? (
        <div className="obsidian-index-section">
          <span className="eyebrow">Results</span>
          {index?.notes.length ? (
            <div className="obsidian-index-results">
              {index.notes.slice(0, 8).map((note) => (
                <button key={note.relativePath} type="button" onClick={() => onOpenNotePath(note.relativePath)}>
                  <strong>{note.title}</strong>
                  <span>{note.relativePath}</span>
                  {note.excerpt ? <p>{note.excerpt}</p> : null}
                </button>
              ))}
            </div>
          ) : (
            <p>No matching notes.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
