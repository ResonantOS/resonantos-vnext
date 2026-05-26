// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md
// Intent citation: docs/architecture/ADR-013-living-archive-memory-domains.md

import type { ObsidianNotePayload, ObsidianVaultStatus } from "../../core/contracts";
import {
  formatBytes,
  MAX_BATCH_QUEUE_NOTES,
  syncReasonLabel,
  syncStateLabel,
  type ObsidianAugmentorAction,
  type ObsidianNoteSyncRecord,
  type QueuedObsidianIntake,
} from "./obsidian-addon-model";

type VaultControlsProps = {
  vaultPath: string;
  disabled: boolean;
  busy: boolean;
  onChooseVault: () => void;
  onVaultPathChange: (value: string) => void;
  onScan: () => void;
};

export function ObsidianVaultControls({
  vaultPath,
  disabled,
  busy,
  onChooseVault,
  onVaultPathChange,
  onScan,
}: VaultControlsProps) {
  return (
    <div className="obsidian-vault-controls">
      <button type="button" className="button-primary" onClick={onChooseVault} disabled={disabled || busy}>
        Choose vault
      </button>
      <input
        aria-label="Obsidian vault path"
        value={vaultPath}
        onChange={(event) => onVaultPathChange(event.target.value)}
        placeholder="Select or paste an Obsidian vault path"
        disabled={disabled}
      />
      <button type="button" className="button-secondary" onClick={onScan} disabled={disabled || !vaultPath.trim()}>
        Scan
      </button>
    </div>
  );
}

type VaultStatusProps = {
  busyLabel: string | null;
  error: string | null;
  status: ObsidianVaultStatus | null;
  archiveResult: string | null;
};

export function ObsidianVaultStatusBlocks({ busyLabel, error, status, archiveResult }: VaultStatusProps) {
  return (
    <>
      {(busyLabel || error || status) && (
        <div className="obsidian-status-strip">
          {busyLabel && <span className="tone tone-neutral">{busyLabel}...</span>}
          {error && <span className="tone tone-warning">{error}</span>}
          {status && (
            <>
              <span>{status.markdownFiles} markdown note(s)</span>
              <span>{status.obsidianConfigDetected ? ".obsidian detected" : "markdown folder mode"}</span>
            </>
          )}
        </div>
      )}

      {status?.warnings.length ? (
        <div className="obsidian-warning-box">
          {status.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {archiveResult && <div className="obsidian-success-box">{archiveResult}</div>}
    </>
  );
}

type SyncPanelProps = {
  disabled: boolean;
  busy: boolean;
  notesCount: number;
  archiveIntakeGranted: boolean;
  batchQueuePending: boolean;
  batchQueueCount: number;
  reviewRecords: ObsidianNoteSyncRecord[];
  selectedReviewPaths: Set<string>;
  unqueuedCount: number;
  changedCount: number;
  queuedCount: number;
  onGrantArchiveIntake: () => void;
  onRefreshChangedNotes: () => void;
  onStartBatchQueue: () => void;
  onConfirmBatchQueue: () => void;
  onCancelBatchQueue: () => void;
  onToggleReviewPath: (path: string) => void;
  onSelectAllReviewPaths: () => void;
  onClearReviewPaths: () => void;
};

export function ObsidianSyncPanel({
  disabled,
  busy,
  notesCount,
  archiveIntakeGranted,
  batchQueuePending,
  batchQueueCount,
  reviewRecords,
  selectedReviewPaths,
  unqueuedCount,
  changedCount,
  queuedCount,
  onGrantArchiveIntake,
  onRefreshChangedNotes,
  onStartBatchQueue,
  onConfirmBatchQueue,
  onCancelBatchQueue,
  onToggleReviewPath,
  onSelectAllReviewPaths,
  onClearReviewPaths,
}: SyncPanelProps) {
  const visibleReviewRecords = reviewRecords.slice(0, MAX_BATCH_QUEUE_NOTES);
  const selectedReviewCount = visibleReviewRecords.filter((record) => selectedReviewPaths.has(record.note.relativePath)).length;

  return (
    <div className="obsidian-sync-box">
      <div>
        <span className="eyebrow">Vault sync</span>
        <p className="muted-copy">
          Queue scanned notes into raw Living Archive intake for Strategist review. This does not create trusted memory pages.
        </p>
      </div>
      <div className="obsidian-note-actions">
        <button type="button" className="button-secondary" onClick={onRefreshChangedNotes} disabled={disabled || busy}>
          Refresh changed notes
        </button>
        {archiveIntakeGranted ? (
          <button
            type="button"
            className="button-primary"
            onClick={onStartBatchQueue}
            disabled={disabled || busy || batchQueueCount === 0}
          >
            Queue scanned notes
          </button>
        ) : (
          <button type="button" className="button-secondary" onClick={onGrantArchiveIntake} disabled={disabled}>
            Grant intake access
          </button>
        )}
        <span className="muted-copy">
          {batchQueueCount ? `${batchQueueCount} note(s) ready for review queue` : "No changed or unqueued scanned notes"}
        </span>
      </div>
      {notesCount ? (
        <div className="obsidian-sync-status-grid" aria-label="Obsidian sync status">
          <span aria-label={`${unqueuedCount} new Obsidian note(s)`}>
            <strong>{unqueuedCount}</strong> new
          </span>
          <span aria-label={`${changedCount} changed Obsidian note(s)`}>
            <strong>{changedCount}</strong> changed
          </span>
          <span aria-label={`${queuedCount} queued unchanged Obsidian note(s)`}>
            <strong>{queuedCount}</strong> queued unchanged
          </span>
        </div>
      ) : null}
      {batchQueuePending ? (
        <div className="obsidian-confirm-box">
          <strong>Review notes before queueing</strong>
          <p>
            Choose which new or changed markdown notes ResonantOS should copy into raw intake and queue for review.
            Obsidian remains an add-on and cannot write trusted knowledge pages.
          </p>
          <div className="obsidian-review-toolbar">
            <span className="muted-copy">
              {selectedReviewCount} of {visibleReviewRecords.length} selected
            </span>
            <button type="button" className="button-secondary" onClick={onSelectAllReviewPaths}>
              Select all
            </button>
            <button type="button" className="button-secondary" onClick={onClearReviewPaths}>
              Clear
            </button>
          </div>
          <div className="obsidian-review-list" aria-label="Obsidian changed note review list">
            {visibleReviewRecords.map((record) => (
              <article key={record.note.relativePath}>
                <div>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedReviewPaths.has(record.note.relativePath)}
                      onChange={() => onToggleReviewPath(record.note.relativePath)}
                    />
                    <strong>{record.note.title}</strong>
                  </label>
                  <span className={`obsidian-sync-pill ${record.state}`}>{syncStateLabel(record.state)}</span>
                </div>
                <span>{record.note.relativePath}</span>
                <span className="obsidian-review-reason">{syncReasonLabel(record.reason)}</span>
                <small>
                  {formatBytes(record.note.sizeBytes)}
                  {record.note.modifiedAt ? ` · ${record.note.modifiedAt}` : ""}
                </small>
              </article>
            ))}
          </div>
          {reviewRecords.length > MAX_BATCH_QUEUE_NOTES ? (
            <p className="muted-copy">
              Showing the first {MAX_BATCH_QUEUE_NOTES} of {reviewRecords.length} changed/new notes for this V1 batch.
            </p>
          ) : null}
          <div className="obsidian-note-actions">
            <button type="button" className="button-primary" onClick={onConfirmBatchQueue} disabled={selectedReviewCount === 0}>
              Queue reviewed notes
            </button>
            <button type="button" className="button-secondary" onClick={onCancelBatchQueue}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type IntakeHistoryProps = {
  queuedIntakes: QueuedObsidianIntake[];
  onOpenArchiveReview: () => void;
};

export function ObsidianIntakeHistory({ queuedIntakes, onOpenArchiveReview }: IntakeHistoryProps) {
  return (
    <div className="obsidian-intake-history">
      <div className="obsidian-intake-history-head">
        <div>
          <span className="eyebrow">Intake history</span>
          <p className="muted-copy">Recently queued notes waiting for Living Archive review.</p>
        </div>
        <button type="button" className="button-secondary" onClick={onOpenArchiveReview}>
          Open Living Archive Review
        </button>
      </div>
      {queuedIntakes.length ? (
        <div className="obsidian-intake-list">
          {queuedIntakes.map((item, index) => (
            <article key={`${item.requestFile}-${item.notePath}-${index}`}>
              <strong>{item.title}</strong>
              <span>{item.notePath}</span>
              <small>{item.queuedAt}</small>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted-copy">No Obsidian notes have been queued in this workspace yet.</p>
      )}
    </div>
  );
}

type VaultPaneProps = {
  syncRecords: ObsidianNoteSyncRecord[];
  selectedNote: ObsidianNotePayload | null;
  pendingArchiveNote: ObsidianNotePayload | null;
  archiveIntakeGranted: boolean;
  onOpenNote: (record: ObsidianNoteSyncRecord) => void;
  onAskAugmentor: (action: ObsidianAugmentorAction) => void;
  onOpenInObsidian: () => void;
  onQueueSelected: (note: ObsidianNotePayload) => void;
  onGrantArchiveIntake: () => void;
  onConfirmSelectedQueue: () => void;
  onCancelSelectedQueue: () => void;
};

export function ObsidianVaultPane({
  syncRecords,
  selectedNote,
  pendingArchiveNote,
  archiveIntakeGranted,
  onOpenNote,
  onAskAugmentor,
  onOpenInObsidian,
  onQueueSelected,
  onGrantArchiveIntake,
  onConfirmSelectedQueue,
  onCancelSelectedQueue,
}: VaultPaneProps) {
  return (
    <div className="obsidian-vault-pane">
      <aside className="obsidian-note-list">
        <span className="eyebrow">Vault notes</span>
        {syncRecords.length ? (
          <div className="obsidian-note-buttons">
            {syncRecords.map((record) => (
              <button
                key={record.note.relativePath}
                type="button"
                className={selectedNote?.relativePath === record.note.relativePath ? "active" : ""}
                onClick={() => onOpenNote(record)}
              >
                <strong>
                  {record.note.title}
                  <span className={`obsidian-sync-pill ${record.state}`}>{syncStateLabel(record.state)}</span>
                </strong>
                <span>
                  {record.note.relativePath} · {formatBytes(record.note.sizeBytes)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted-copy">Select a vault to preview markdown notes here.</p>
        )}
      </aside>

      <article className="obsidian-note-preview">
        <span className="eyebrow">Read-only preview</span>
        {selectedNote ? (
          <>
            <h3>{selectedNote.title}</h3>
            <p className="muted-copy">
              {selectedNote.relativePath} · {formatBytes(selectedNote.sizeBytes)}
            </p>
            <div className="obsidian-note-actions" aria-label="Augmentor note actions">
              <button type="button" className="button-secondary" onClick={() => onAskAugmentor("summarize")}>
                Summarize with Augmentor
              </button>
              <button type="button" className="button-secondary" onClick={() => onAskAugmentor("organize")}>
                Suggest tags and links
              </button>
              <button type="button" className="button-secondary" onClick={() => onAskAugmentor("intake-plan")}>
                Plan archive intake
              </button>
              <button type="button" className="button-secondary" onClick={onOpenInObsidian}>
                Open in Obsidian
              </button>
              {archiveIntakeGranted ? (
                <button type="button" className="button-primary" onClick={() => onQueueSelected(selectedNote)}>
                  Queue for archive review
                </button>
              ) : (
                <button type="button" className="button-secondary" onClick={onGrantArchiveIntake}>
                  Grant intake access
                </button>
              )}
            </div>
            {pendingArchiveNote?.relativePath === selectedNote.relativePath && (
              <div className="obsidian-confirm-box">
                <strong>Queue this note for Living Archive review?</strong>
                <p>
                  ResonantOS will copy this note into the raw intake area and create a review request. The add-on will
                  not write trusted knowledge pages.
                </p>
                <div className="obsidian-note-actions">
                  <button type="button" className="button-primary" onClick={onConfirmSelectedQueue}>
                    Confirm queue
                  </button>
                  <button type="button" className="button-secondary" onClick={onCancelSelectedQueue}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <pre>{selectedNote.content}</pre>
          </>
        ) : (
          <p className="muted-copy">
            The V1 bridge is intentionally read-only. Editing, wikilink suggestions, and Living Archive intake actions
            should be mediated by Augmentor or the future Obsidian embedded surface.
          </p>
        )}
      </article>
    </div>
  );
}
