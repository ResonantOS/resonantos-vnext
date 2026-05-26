// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md
// Intent citation: docs/architecture/ADR-013-living-archive-memory-domains.md

import { useEffect, useState } from "react";
import type { AddOnInstallation, ObsidianNotePayload, ObsidianNoteSummary, ObsidianVaultStatus } from "../../core/contracts";
import {
  requestArchiveIngestRequest,
  requestArchiveIntakeWrite,
  requestObsidianNote,
  requestObsidianNoteList,
  requestObsidianOpenNote,
  requestObsidianVaultFolderSelection,
  requestObsidianVaultStatus,
} from "../../core/runtime";
import {
  ObsidianIntakeHistory,
  ObsidianSyncPanel,
  ObsidianVaultControls,
  ObsidianVaultPane,
  ObsidianVaultStatusBlocks,
} from "./ObsidianAddonSections";
import {
  augmentorPromptForNote,
  buildSyncRecords,
  configuredVaultPath,
  markdownIntakeForNote,
  MAX_BATCH_QUEUE_NOTES,
  mergeQueuedNoteIndex,
  queuedIntakesFromConfig,
  queuedNoteIndexFromConfig,
  safeSlug,
  type ObsidianAugmentorAction,
  type QueuedObsidianIntake,
} from "./obsidian-addon-model";

type ObsidianAddonPanelProps = {
  installation: AddOnInstallation;
  onConfigChange: (config: Record<string, unknown>) => void;
  onAskAugmentor: (message: string) => Promise<void>;
  onGrantArchiveIntake: () => void;
  onOpenArchiveReview: () => void;
};

export function ObsidianAddonPanel({
  installation,
  onConfigChange,
  onAskAugmentor,
  onGrantArchiveIntake,
  onOpenArchiveReview,
}: ObsidianAddonPanelProps) {
  const [vaultPath, setVaultPath] = useState(configuredVaultPath(installation));
  const [status, setStatus] = useState<ObsidianVaultStatus | null>(null);
  const [notes, setNotes] = useState<ObsidianNoteSummary[]>([]);
  const [selectedNote, setSelectedNote] = useState<ObsidianNotePayload | null>(null);
  const [pendingArchiveNote, setPendingArchiveNote] = useState<ObsidianNotePayload | null>(null);
  const [batchQueuePending, setBatchQueuePending] = useState(false);
  const [selectedReviewPaths, setSelectedReviewPaths] = useState<Set<string>>(new Set());
  const [archiveResult, setArchiveResult] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVaultPath(configuredVaultPath(installation));
  }, [installation.config?.vaultPath]);

  const queuedIntakes = queuedIntakesFromConfig(installation);
  const queuedNoteIndex = queuedNoteIndexFromConfig(installation);
  const archiveIntakeGranted = installation.grantedCapabilities.some(
    (grant) => grant.capability === "archive-intake-write" && grant.granted,
  );
  const syncRecords = buildSyncRecords(notes, queuedNoteIndex);
  const syncReadyRecords = syncRecords.filter((record) => record.state === "unqueued" || record.state === "changed");
  const batchQueueCount = Math.min(syncReadyRecords.length, MAX_BATCH_QUEUE_NOTES);
  const visibleReviewPaths = syncReadyRecords.slice(0, MAX_BATCH_QUEUE_NOTES).map((record) => record.note.relativePath);
  const changedCount = syncRecords.filter((record) => record.state === "changed").length;
  const queuedCount = syncRecords.filter((record) => record.state === "queued").length;
  const unqueuedCount = syncRecords.filter((record) => record.state === "unqueued").length;
  const disabled = !installation.enabled;

  const refreshVault = async (path = vaultPath, mode: "scan" | "refresh-changes" = "scan") => {
    const trimmed = path.trim();
    if (!trimmed) {
      setStatus(null);
      setNotes([]);
      setSelectedNote(null);
      return;
    }
    setBusyLabel(mode === "refresh-changes" ? "Refreshing changed notes" : "Scanning vault");
    setError(null);
    try {
      const nextStatus = await requestObsidianVaultStatus(trimmed);
      const nextNotes = await requestObsidianNoteList(trimmed, 200);
      const nextSyncRecords = buildSyncRecords(nextNotes, queuedNoteIndexFromConfig(installation));
      const nextChangedCount = nextSyncRecords.filter((record) => record.state === "changed").length;
      const nextNewCount = nextSyncRecords.filter((record) => record.state === "unqueued").length;
      setStatus(nextStatus);
      setNotes(nextNotes);
      setSelectedNote(null);
      setPendingArchiveNote(null);
      setBatchQueuePending(false);
      setSelectedReviewPaths(new Set());
      setArchiveResult(
        mode === "refresh-changes"
          ? `Refresh complete: ${nextNewCount} new note(s), ${nextChangedCount} changed note(s).`
          : null,
      );
      onConfigChange({ ...(installation.config ?? {}), vaultPath: trimmed, lastVaultRefreshAt: new Date().toISOString() });
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Failed to scan Obsidian vault.");
    } finally {
      setBusyLabel(null);
    }
  };

  const writeNoteToArchiveIntake = async (note: ObsidianNotePayload, index = 0): Promise<QueuedObsidianIntake> => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const batchSuffix = index > 0 ? `-${String(index + 1).padStart(2, "0")}` : "";
    const fileName = `${stamp}${batchSuffix}-${safeSlug(note.title)}.md`;
    const intake = await requestArchiveIntakeWrite({
      actorId: "addon.obsidian",
      bucket: "obsidian-vault-notes",
      fileName,
      content: markdownIntakeForNote(note, vaultPath),
      metadata: {
        origin: "obsidian-addon",
        vaultPath,
        notePath: note.relativePath,
        title: note.title,
        sizeBytes: note.sizeBytes,
        modifiedAt: note.modifiedAt,
        trustBoundary: "raw-intake-only",
      },
    });
    const ingest = await requestArchiveIngestRequest({
      actorId: "addon.obsidian",
      sourcePath: intake.artifactPath,
      sourceType: "obsidian_note",
      sourceRole: "vault-note",
      intent: "review-and-ingest",
      provenance: {
        origin: "obsidian-addon",
        bucket: intake.bucket,
        metadataPath: intake.metadataPath,
        vaultPath,
        notePath: note.relativePath,
      },
    });

    return {
      title: note.title,
      notePath: note.relativePath,
      sourceModifiedAt: note.modifiedAt ?? null,
      sourceSizeBytes: note.sizeBytes,
      artifactPath: intake.artifactPath,
      requestFile: ingest.requestFile,
      queuedAt: ingest.queuedAt,
    };
  };

  const chooseVault = async () => {
    setBusyLabel("Waiting for folder selection");
    setError(null);
    try {
      const selected = await requestObsidianVaultFolderSelection();
      if (selected) {
        setVaultPath(selected);
        await refreshVault(selected);
      }
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Failed to select vault folder.");
    } finally {
      setBusyLabel(null);
    }
  };

  const openNote = async (note: ObsidianNoteSummary) => {
    setBusyLabel("Reading note");
    setError(null);
    try {
      setSelectedNote(await requestObsidianNote(vaultPath, note.relativePath));
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Failed to read Obsidian note.");
    } finally {
      setBusyLabel(null);
    }
  };

  const askAugmentorAboutNote = async (action: ObsidianAugmentorAction) => {
    if (!selectedNote) {
      return;
    }
    setBusyLabel("Handing note to Augmentor");
    setError(null);
    try {
      await onAskAugmentor(augmentorPromptForNote(selectedNote, action));
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "Failed to hand note to Augmentor.");
    } finally {
      setBusyLabel(null);
    }
  };

  const openSelectedNoteInObsidian = async () => {
    if (!selectedNote) {
      return;
    }
    setBusyLabel("Opening Obsidian");
    setError(null);
    try {
      const result = await requestObsidianOpenNote(vaultPath, selectedNote.relativePath);
      setArchiveResult(`Opened in Obsidian: ${result.notePath}`);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Failed to open Obsidian note.");
    } finally {
      setBusyLabel(null);
    }
  };

  const queueSelectedNoteForReview = async () => {
    if (!pendingArchiveNote) {
      return;
    }
    setBusyLabel("Queueing archive review");
    setError(null);
    setArchiveResult(null);
    try {
      const queued = await writeNoteToArchiveIntake(pendingArchiveNote);
      const nextQueuedIntakes = [queued, ...queuedIntakes].slice(0, 8);
      setPendingArchiveNote(null);
      setArchiveResult(`Queued for review: ${queued.requestFile}`);
      onConfigChange({
        ...(installation.config ?? {}),
        vaultPath,
        queuedIntakes: nextQueuedIntakes,
        queuedNoteIndex: mergeQueuedNoteIndex(queuedNoteIndex, [queued]),
      });
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Failed to queue Obsidian note for archive review.");
    } finally {
      setBusyLabel(null);
    }
  };

  const queueBatchForReview = async () => {
    const batchNotes = syncReadyRecords
      .slice(0, MAX_BATCH_QUEUE_NOTES)
      .filter((record) => selectedReviewPaths.has(record.note.relativePath))
      .map((record) => record.note);
    if (!batchNotes.length) {
      setError("Select at least one new or changed note before queueing.");
      return;
    }

    setBusyLabel(`Queueing ${batchNotes.length} note(s)`);
    setError(null);
    setArchiveResult(null);
    try {
      const queued: QueuedObsidianIntake[] = [];
      for (const [index, noteSummary] of batchNotes.entries()) {
        const note = await requestObsidianNote(vaultPath, noteSummary.relativePath);
        queued.push(await writeNoteToArchiveIntake(note, index));
      }

      setBatchQueuePending(false);
      setSelectedReviewPaths(new Set());
      setArchiveResult(`Queued ${queued.length} Obsidian note(s) for Living Archive review.`);
      onConfigChange({
        ...(installation.config ?? {}),
        vaultPath,
        queuedIntakes: [...queued.reverse(), ...queuedIntakes].slice(0, 8),
        queuedNoteIndex: mergeQueuedNoteIndex(queuedNoteIndex, queued),
      });
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Failed to queue Obsidian vault notes for review.");
    } finally {
      setBusyLabel(null);
    }
  };

  const startBatchQueueReview = () => {
    setError(null);
    setBatchQueuePending(true);
    setSelectedReviewPaths(new Set(visibleReviewPaths));
  };

  const cancelBatchQueueReview = () => {
    setBatchQueuePending(false);
    setSelectedReviewPaths(new Set());
  };

  const toggleReviewPath = (path: string) => {
    setSelectedReviewPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else if (visibleReviewPaths.includes(path)) {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <section className="obsidian-addon-panel" aria-label="Resonant Notes vault bridge">
      <div className="obsidian-addon-hero">
        <div>
          <span className="eyebrow">Resonant Notes</span>
          <h3>Vault bridge, not trusted memory writes</h3>
          <p>
            Connect an Obsidian-compatible vault or markdown folder so ResonantOS can inspect notes through scoped filesystem access.
            Living Archive knowledge writes still require the Strategist-owned ingest path.
          </p>
        </div>
        <span className={`tone tone-${installation.enabled ? "active" : "neutral"}`}>
          {installation.enabled ? "enabled" : "disabled"}
        </span>
      </div>

      <ObsidianVaultControls
        vaultPath={vaultPath}
        disabled={disabled}
        busy={Boolean(busyLabel)}
        onChooseVault={chooseVault}
        onVaultPathChange={setVaultPath}
        onScan={() => void refreshVault()}
      />

      <ObsidianVaultStatusBlocks busyLabel={busyLabel} error={error} status={status} archiveResult={archiveResult} />

      <ObsidianSyncPanel
        disabled={disabled}
        busy={Boolean(busyLabel)}
        notesCount={notes.length}
        archiveIntakeGranted={archiveIntakeGranted}
        batchQueuePending={batchQueuePending}
        batchQueueCount={batchQueueCount}
        reviewRecords={syncReadyRecords}
        selectedReviewPaths={selectedReviewPaths}
        unqueuedCount={unqueuedCount}
        changedCount={changedCount}
        queuedCount={queuedCount}
        onGrantArchiveIntake={onGrantArchiveIntake}
        onRefreshChangedNotes={() => void refreshVault(vaultPath, "refresh-changes")}
        onStartBatchQueue={startBatchQueueReview}
        onConfirmBatchQueue={() => void queueBatchForReview()}
        onCancelBatchQueue={cancelBatchQueueReview}
        onToggleReviewPath={toggleReviewPath}
        onSelectAllReviewPaths={() => setSelectedReviewPaths(new Set(visibleReviewPaths))}
        onClearReviewPaths={() => setSelectedReviewPaths(new Set())}
      />

      <ObsidianIntakeHistory queuedIntakes={queuedIntakes} onOpenArchiveReview={onOpenArchiveReview} />

      <ObsidianVaultPane
        syncRecords={syncRecords}
        selectedNote={selectedNote}
        pendingArchiveNote={pendingArchiveNote}
        archiveIntakeGranted={archiveIntakeGranted}
        onOpenNote={(record) => void openNote(record.note)}
        onAskAugmentor={(action) => void askAugmentorAboutNote(action)}
        onOpenInObsidian={() => void openSelectedNoteInObsidian()}
        onQueueSelected={setPendingArchiveNote}
        onGrantArchiveIntake={onGrantArchiveIntake}
        onConfirmSelectedQueue={() => void queueSelectedNoteForReview()}
        onCancelSelectedQueue={() => setPendingArchiveNote(null)}
      />
    </section>
  );
}
