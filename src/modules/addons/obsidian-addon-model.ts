// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md
// Intent citation: docs/architecture/ADR-013-living-archive-memory-domains.md

import type { AddOnInstallation, ObsidianNotePayload, ObsidianNoteSummary } from "../../core/contracts";

export type ObsidianAugmentorAction = "summarize" | "organize" | "intake-plan";

export type QueuedObsidianIntake = {
  title: string;
  notePath: string;
  sourceModifiedAt?: string | null;
  sourceSizeBytes?: number;
  artifactPath: string;
  requestFile: string;
  queuedAt: string;
};

export type ObsidianNoteSyncState = "unqueued" | "changed" | "queued";
export type ObsidianNoteSyncReason = "new-note" | "timestamp-changed" | "size-changed" | "timestamp-and-size-changed" | "unchanged";

export type ObsidianNoteSyncRecord = {
  note: ObsidianNoteSummary;
  state: ObsidianNoteSyncState;
  reason: ObsidianNoteSyncReason;
  intake?: QueuedObsidianIntake;
};

export const MAX_BATCH_QUEUE_NOTES = 20;
export const MAX_SYNC_INDEX_NOTES = 1_000;

export const configuredVaultPath = (installation: AddOnInstallation): string =>
  typeof installation.config?.vaultPath === "string" ? installation.config.vaultPath : "";

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }
  return `${Math.round(bytes / 104_857.6) / 10} MB`;
};

export const queuedIntakesFromConfig = (installation: AddOnInstallation): QueuedObsidianIntake[] => {
  const value = installation.config?.queuedIntakes;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is QueuedObsidianIntake => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const candidate = item as Record<string, unknown>;
    return (
      typeof candidate.title === "string" &&
      typeof candidate.notePath === "string" &&
      (candidate.sourceModifiedAt === undefined ||
        candidate.sourceModifiedAt === null ||
        typeof candidate.sourceModifiedAt === "string") &&
      (candidate.sourceSizeBytes === undefined || typeof candidate.sourceSizeBytes === "number") &&
      typeof candidate.artifactPath === "string" &&
      typeof candidate.requestFile === "string" &&
      typeof candidate.queuedAt === "string"
    );
  });
};

export const queuedNoteIndexFromConfig = (installation: AddOnInstallation): QueuedObsidianIntake[] => {
  const value = installation.config?.queuedNoteIndex;
  if (!Array.isArray(value)) {
    return queuedIntakesFromConfig(installation);
  }
  return queuedIntakesFromConfig({ ...installation, config: { queuedIntakes: value } });
};

const latestIntakeByNotePath = (queuedIntakes: QueuedObsidianIntake[]): Map<string, QueuedObsidianIntake> => {
  const latest = new Map<string, QueuedObsidianIntake>();
  for (const intake of queuedIntakes) {
    if (!latest.has(intake.notePath)) {
      latest.set(intake.notePath, intake);
    }
  }
  return latest;
};

const changeReasonSinceQueue = (note: ObsidianNoteSummary, intake: QueuedObsidianIntake): ObsidianNoteSyncReason => {
  const sizeChanged = typeof intake.sourceSizeBytes === "number" && intake.sourceSizeBytes !== note.sizeBytes;
  const timestampChanged = Boolean(intake.sourceModifiedAt && note.modifiedAt && intake.sourceModifiedAt !== note.modifiedAt);

  if (sizeChanged && timestampChanged) {
    return "timestamp-and-size-changed";
  }
  if (timestampChanged) {
    return "timestamp-changed";
  }
  if (sizeChanged) {
    return "size-changed";
  }
  return "unchanged";
};

export const buildSyncRecords = (
  notes: ObsidianNoteSummary[],
  queuedNoteIndex: QueuedObsidianIntake[],
): ObsidianNoteSyncRecord[] => {
  const latestQueued = latestIntakeByNotePath(queuedNoteIndex);
  return notes.map((note) => {
    const intake = latestQueued.get(note.relativePath);
    if (!intake) {
      return { note, state: "unqueued", reason: "new-note" };
    }
    const reason = changeReasonSinceQueue(note, intake);
    if (reason !== "unchanged") {
      return { note, state: "changed", reason, intake };
    }
    return { note, state: "queued", reason, intake };
  });
};

export const syncStateLabel = (state: ObsidianNoteSyncState): string => {
  if (state === "changed") {
    return "changed";
  }
  if (state === "queued") {
    return "queued";
  }
  return "new";
};

export const syncReasonLabel = (reason: ObsidianNoteSyncReason): string => {
  if (reason === "timestamp-and-size-changed") {
    return "modified time and size changed";
  }
  if (reason === "timestamp-changed") {
    return "modified time changed";
  }
  if (reason === "size-changed") {
    return "file size changed";
  }
  if (reason === "unchanged") {
    return "already queued and unchanged";
  }
  return "not queued yet";
};

export const mergeQueuedNoteIndex = (
  existing: QueuedObsidianIntake[],
  nextQueued: QueuedObsidianIntake[],
): QueuedObsidianIntake[] => {
  const merged = new Map<string, QueuedObsidianIntake>();
  for (const intake of [...nextQueued, ...existing]) {
    if (!merged.has(intake.notePath)) {
      merged.set(intake.notePath, intake);
    }
  }
  return Array.from(merged.values()).slice(0, MAX_SYNC_INDEX_NOTES);
};

export const safeSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "obsidian-note";

export const markdownIntakeForNote = (note: ObsidianNotePayload, vaultPath: string): string => `---
source_type: obsidian_note
source_role: vault-note
origin: obsidian-addon
review_required: true
---

# ${note.title}

Source path: \`${note.relativePath}\`
Vault path: \`${vaultPath}\`

> This is a raw Obsidian note intake artifact. It is not trusted Living Archive knowledge until reviewed by the Strategist-owned ingest service.

${note.content}
`;

const noteExcerpt = (note: ObsidianNotePayload): string =>
  note.content.length > 12_000 ? `${note.content.slice(0, 12_000)}\n\n[Truncated for chat handoff.]` : note.content;

export const augmentorPromptForNote = (note: ObsidianNotePayload, action: ObsidianAugmentorAction): string => {
  const header = `Obsidian note handoff from ResonantOS V1 vault bridge.

Note: ${note.title}
Path: ${note.relativePath}
Size: ${note.sizeBytes} bytes

Important boundary:
- Treat this as read-only source material.
- Do not claim it has been written to the Living Archive.
- If Living Archive intake is needed, propose a review-safe plan and ask for approval.`;

  const content = `\n\nNote content:\n\n${noteExcerpt(note)}`;

  if (action === "summarize") {
    return `${header}

Task:
Summarize this note for the user. Extract the main ideas, unresolved questions, and any useful links to existing ResonantOS concepts if they are evident from the text.${content}`;
  }

  if (action === "organize") {
    return `${header}

Task:
Suggest Obsidian-compatible organization improvements for this note. Propose tags, possible wikilinks, title improvements, and structure changes. Do not rewrite the note unless the user asks.${content}`;
  }

  return `${header}

Task:
Create a Living Archive intake plan for this note. Classify whether it appears to be Human Knowledge, External Knowledge, or AI Memory candidate material. Identify what should stay raw, what needs human approval, and what the Strategist-owned ingest service should review next.${content}`;
};
