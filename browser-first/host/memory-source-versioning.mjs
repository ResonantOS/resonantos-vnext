import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export function sourceContentHash(content) {
  return createHash("sha256").update(String(content ?? ""), "utf8").digest("hex");
}

function sourceFileKey(sourceId, relativeFile) {
  return `${String(sourceId ?? "").trim()}::${String(relativeFile ?? "").replace(/\\/g, "/")}`;
}

async function readManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    return { version: 1, files: {} };
  }
  const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  return {
    version: 1,
    ...parsed,
    files: parsed && typeof parsed.files === "object" && parsed.files ? parsed.files : {},
  };
}

export async function listSourceFileVersions({ manifestPath, sourceId = "", limit = 100 } = {}) {
  if (!manifestPath) throw new Error("Source file version listing requires a manifest path.");
  const manifest = await readManifest(manifestPath);
  const normalizedSourceId = String(sourceId ?? "").trim();
  const entries = Object.values(manifest.files ?? {})
    .filter((entry) => !normalizedSourceId || entry.sourceId === normalizedSourceId)
    .map((entry) => ({
      sourceId: entry.sourceId,
      sourceFile: entry.sourceFile,
      latestHash: entry.latestHash,
      latestVersion: entry.latestVersion,
      latestIntakePath: entry.latestIntakePath ?? "",
      latestModifiedAt: entry.latestModifiedAt,
      updatedAt: entry.updatedAt,
      history: Array.isArray(entry.history) ? entry.history : [],
    }))
    .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));
  return {
    manifestVersion: manifest.version ?? 1,
    updatedAt: manifest.updatedAt ?? "",
    entries: entries.slice(0, Math.max(1, Math.min(500, Number(limit ?? 100)))),
  };
}

export async function reserveSourceFileVersion({
  manifestPath,
  sourceId,
  relativeFile,
  contentHash,
  sourceModifiedAt,
  now = new Date().toISOString(),
}) {
  if (!manifestPath) throw new Error("Source file versioning requires a manifest path.");
  if (!sourceId) throw new Error("Source file versioning requires a source id.");
  if (!relativeFile) throw new Error("Source file versioning requires a relative source file.");
  if (!contentHash) throw new Error("Source file versioning requires a content hash.");

  const manifest = await readManifest(manifestPath);
  const key = sourceFileKey(sourceId, relativeFile);
  const previous = manifest.files[key] ?? null;
  if (previous?.latestHash === contentHash) {
    return {
      changed: false,
      version: previous.latestVersion ?? 1,
      contentHash,
      previousHash: previous.latestHash,
      previousVersion: previous.latestVersion ?? 1,
    };
  }

  const version = Number(previous?.latestVersion ?? 0) + 1;
  const entry = {
    sourceId,
    sourceFile: String(relativeFile).replace(/\\/g, "/"),
    latestHash: contentHash,
    latestVersion: version,
    latestModifiedAt: sourceModifiedAt || "",
    updatedAt: now,
    history: [
      ...(Array.isArray(previous?.history) ? previous.history : []),
      {
        version,
        contentHash,
        previousHash: previous?.latestHash ?? "",
        sourceModifiedAt: sourceModifiedAt || "",
        intakePath: "",
        recordedAt: now,
      },
    ].slice(-100),
  };

  manifest.files[key] = entry;
  manifest.updatedAt = now;
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await chmod(manifestPath, 0o600).catch(() => undefined);

  return {
    changed: true,
    version,
    contentHash,
    previousHash: previous?.latestHash ?? "",
    previousVersion: previous?.latestVersion ?? 0,
  };
}

export async function recordSourceFileIntakeArtifact({
  manifestPath,
  sourceId,
  relativeFile,
  version,
  intakePath,
  now = new Date().toISOString(),
}) {
  if (!manifestPath) throw new Error("Source file artifact recording requires a manifest path.");
  if (!sourceId) throw new Error("Source file artifact recording requires a source id.");
  if (!relativeFile) throw new Error("Source file artifact recording requires a relative source file.");
  if (!intakePath) throw new Error("Source file artifact recording requires an intake path.");
  const manifest = await readManifest(manifestPath);
  const key = sourceFileKey(sourceId, relativeFile);
  const entry = manifest.files[key];
  if (!entry) {
    throw new Error("Source file version entry was not found.");
  }
  const numericVersion = Number(version ?? entry.latestVersion ?? 0);
  entry.latestIntakePath = String(intakePath).replace(/\\/g, "/");
  entry.updatedAt = now;
  entry.history = (Array.isArray(entry.history) ? entry.history : []).map((historyEntry) =>
    Number(historyEntry.version) === numericVersion
      ? { ...historyEntry, intakePath: entry.latestIntakePath }
      : historyEntry
  );
  manifest.files[key] = entry;
  manifest.updatedAt = now;
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await chmod(manifestPath, 0o600).catch(() => undefined);
  return {
    sourceId: entry.sourceId,
    sourceFile: entry.sourceFile,
    latestVersion: entry.latestVersion,
    latestIntakePath: entry.latestIntakePath,
  };
}

export function lineDiffSummary(previousContent, currentContent, { limit = 80 } = {}) {
  const previous = String(previousContent ?? "").split(/\r?\n/);
  const current = String(currentContent ?? "").split(/\r?\n/);
  const maxLines = Math.max(previous.length, current.length);
  const changes = [];
  for (let index = 0; index < maxLines; index += 1) {
    const before = previous[index] ?? "";
    const after = current[index] ?? "";
    if (before === after) continue;
    if (before) {
      changes.push({ type: "removed", line: index + 1, text: before });
    }
    if (after) {
      changes.push({ type: "added", line: index + 1, text: after });
    }
    if (changes.length >= limit) break;
  }
  return {
    changed: changes.length > 0 || previous.length !== current.length,
    previousLines: previous.length,
    currentLines: current.length,
    truncated: changes.length >= limit,
    changes,
  };
}
