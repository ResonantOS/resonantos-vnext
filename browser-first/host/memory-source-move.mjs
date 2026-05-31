import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, copyFile, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MAX_MOVE_FILES = 25_000;

function safeSlug(value) {
  return String(value ?? "source")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "source";
}

function pathHash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function contentHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function ensureInside(child, parent, message) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(message);
  }
}

function isSameOrInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function memoryDomainForOwnership(ownership) {
  if (ownership === "human-knowledge") return path.join("HUMAN_KNOWLEDGE", "sources");
  if (ownership === "external-knowledge") return path.join("EXTERNAL_KNOWLEDGE", "sources");
  return path.join("INTAKE", "imports", "mixed");
}

export function moveConfirmationPhrase(preflight) {
  return `MOVE ${preflight.sourceName}`;
}

export function assertSafeMoveSource(sourcePath, memoryRoot) {
  const source = path.resolve(sourcePath);
  const root = path.parse(source).root;
  const home = path.resolve(os.homedir());
  const memory = path.resolve(memoryRoot);
  if (!source || source === root) {
    throw new Error("Move import cannot target a filesystem root.");
  }
  if (source === home) {
    throw new Error("Move import cannot target the user's home folder.");
  }
  if (isSameOrInside(source, memory)) {
    throw new Error("Move import cannot move a folder that is already inside ResonantOS Memory.");
  }
  const protectedNames = new Set(["Applications", "Library", "System", "Volumes", "bin", "dev", "etc", "private", "sbin", "usr", "var"]);
  const parts = source.split(path.sep).filter(Boolean);
  if (process.platform === "darwin" && parts.length === 1 && protectedNames.has(parts[0])) {
    throw new Error("Move import cannot target a protected system folder.");
  }
  const relativeToHome = path.relative(home, source);
  if (!relativeToHome.startsWith("..") && !path.isAbsolute(relativeToHome) && relativeToHome.split(path.sep).filter(Boolean).length < 1) {
    throw new Error("Move import requires a specific source folder, not a broad user root.");
  }
}

async function listMoveEntries(sourcePath, limit = MAX_MOVE_FILES) {
  const source = path.resolve(sourcePath);
  const files = [];
  const directories = [];
  const blocked = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true }).catch((error) => {
      blocked.push({ path: path.relative(source, current).replace(/\\/g, "/") || ".", reason: error.message });
      return [];
    });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relative = path.relative(source, fullPath).replace(/\\/g, "/");
      const info = await lstat(fullPath).catch((error) => {
        blocked.push({ path: relative, reason: error.message });
        return null;
      });
      if (!info) continue;
      if (info.isSymbolicLink()) {
        blocked.push({ path: relative, reason: "symlink-blocked" });
        continue;
      }
      if (entry.isDirectory()) {
        directories.push(fullPath);
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        blocked.push({ path: relative, reason: "non-regular-file-blocked" });
        continue;
      }
      files.push({
        absolutePath: fullPath,
        relativePath: relative,
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
        hidden: relative.split("/").some((part) => part.startsWith(".")),
      });
      if (files.length > limit) {
        blocked.push({ path: relative, reason: `file-limit-${limit}-exceeded` });
        return;
      }
    }
  }
  await walk(source);
  return { files, directories, blocked };
}

async function moveFileAcrossVolumes(sourcePath, destinationPath) {
  try {
    await rename(sourcePath, destinationPath);
    return "rename";
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }
    await copyFile(sourcePath, destinationPath);
    await rm(sourcePath, { force: true });
    return "copy-unlink";
  }
}

export async function buildMoveImportPreflight({ sourcePath, memoryRoot, kind = "folder", ownership = "mixed-library" }) {
  const source = path.resolve(sourcePath);
  assertSafeMoveSource(source, memoryRoot);
  if (!existsSync(source)) {
    throw new Error("Move import source does not exist.");
  }
  const details = await stat(source);
  if (!details.isDirectory()) {
    throw new Error("Move import source must be a folder.");
  }
  const sourceName = path.basename(source) || "source";
  const destinationRoot = path.join(
    path.resolve(memoryRoot),
    memoryDomainForOwnership(ownership),
    `${safeSlug(sourceName)}-${pathHash(source)}`,
  );
  if (isSameOrInside(destinationRoot, source)) {
    throw new Error("Move import destination cannot be inside the source folder.");
  }
  const { files, directories, blocked: traversalBlocked } = await listMoveEntries(source);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const hiddenFiles = files.filter((file) => file.hidden).length;
  const blocked = [...traversalBlocked];
  if (existsSync(destinationRoot)) {
    blocked.push({ path: destinationRoot, reason: "destination-already-exists" });
  }
  return {
    okToMove: blocked.length === 0,
    sourcePath: source,
    sourceName,
    destinationRoot,
    kind,
    ownership,
    importMode: "move-on-import",
    fileCount: files.length,
    directoryCount: directories.length,
    totalBytes,
    hiddenFiles,
    blocked,
    confirmationPhrase: `MOVE ${sourceName}`,
    files: files.slice(0, 25).map((file) => ({
      relativePath: file.relativePath,
      size: file.size,
      modifiedAt: file.modifiedAt,
      hidden: file.hidden,
    })),
  };
}

export async function executeMoveImport({
  sourcePath,
  memoryRoot,
  kind = "folder",
  ownership = "mixed-library",
  confirmation,
  actor = "resonantos-browser-first",
}) {
  const preflight = await buildMoveImportPreflight({ sourcePath, memoryRoot, kind, ownership });
  if (!preflight.okToMove) {
    throw new Error(`Move import preflight failed: ${preflight.blocked.map((entry) => entry.reason).join(", ")}`);
  }
  if (String(confirmation ?? "").trim() !== moveConfirmationPhrase(preflight)) {
    throw new Error(`Move import requires confirmation phrase: ${moveConfirmationPhrase(preflight)}`);
  }
  const now = new Date().toISOString();
  const moveId = `move-${Date.now()}-${pathHash(`${preflight.sourcePath}-${now}`)}`;
  const metadataRoot = path.join(path.resolve(memoryRoot), "CONFIG", "move-imports", moveId);
  const ledgerPath = path.join(metadataRoot, "move-ledger.jsonl");
  const manifestPath = path.join(metadataRoot, "manifest.json");
  await mkdir(metadataRoot, { recursive: true });
  await mkdir(preflight.destinationRoot, { recursive: true });
  const { files, directories, blocked } = await listMoveEntries(preflight.sourcePath);
  if (blocked.length) {
    throw new Error(`Move import source changed after preflight: ${blocked.map((entry) => entry.reason).join(", ")}`);
  }
  const manifest = {
    moveId,
    actor,
    startedAt: now,
    sourcePath: preflight.sourcePath,
    destinationRoot: preflight.destinationRoot,
    kind,
    ownership,
    importMode: "move-on-import",
    fileCount: files.length,
    directoryCount: directories.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    ledgerPath,
    status: "running",
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

  const moved = [];
  const failed = [];
  for (const file of files) {
    const destination = path.join(preflight.destinationRoot, file.relativePath);
    ensureInside(destination, preflight.destinationRoot, "Move import destination escaped managed memory root.");
    await mkdir(path.dirname(destination), { recursive: true });
    const bytes = await readFile(file.absolutePath);
    const beforeHash = contentHash(bytes);
    const ledgerEntry = {
      moveId,
      at: new Date().toISOString(),
      action: "move-file",
      sourcePath: file.absolutePath,
      destinationPath: destination,
      relativePath: file.relativePath,
      size: file.size,
      beforeHash,
      status: "pending",
    };
    try {
      ledgerEntry.moveMethod = await moveFileAcrossVolumes(file.absolutePath, destination);
      ledgerEntry.status = "moved";
      moved.push(ledgerEntry);
    } catch (error) {
      ledgerEntry.status = "failed";
      ledgerEntry.error = error.message;
      failed.push(ledgerEntry);
    }
    await appendFile(ledgerPath, `${JSON.stringify(ledgerEntry)}\n`, { mode: 0o600 });
    if (failed.length) break;
  }

  for (const directory of directories.sort((a, b) => b.length - a.length)) {
    await rm(directory, { recursive: false, force: true }).catch(() => undefined);
  }
  await rm(preflight.sourcePath, { recursive: true, force: true }).catch(() => undefined);

  const finishedAt = new Date().toISOString();
  const finalManifest = {
    ...manifest,
    finishedAt,
    movedCount: moved.length,
    failedCount: failed.length,
    status: failed.length ? "partial-failure" : "moved",
  };
  await writeFile(manifestPath, `${JSON.stringify(finalManifest, null, 2)}\n`, { mode: 0o600 });
  return {
    ...finalManifest,
    ledgerPath,
    manifestPath,
    source: {
      path: preflight.destinationRoot,
      kind,
      ownership,
      importMode: "move-on-import",
      originalPath: preflight.sourcePath,
      moveId,
      manifestPath,
      ledgerPath,
    },
    failures: failed.map((entry) => ({ relativePath: entry.relativePath, error: entry.error })),
  };
}

export async function rollbackMoveImport({ ledgerPath, confirmation }) {
  const resolvedLedger = path.resolve(ledgerPath);
  if (!existsSync(resolvedLedger)) {
    throw new Error("Move import rollback ledger was not found.");
  }
  if (String(confirmation ?? "").trim() !== "ROLLBACK MOVE") {
    throw new Error("Move import rollback requires confirmation phrase: ROLLBACK MOVE");
  }
  const lines = (await readFile(resolvedLedger, "utf8")).split(/\r?\n/).filter(Boolean);
  const moved = lines.map((line) => JSON.parse(line)).filter((entry) => entry.status === "moved").reverse();
  const restored = [];
  const skipped = [];
  for (const entry of moved) {
    if (!existsSync(entry.destinationPath)) {
      skipped.push({ relativePath: entry.relativePath, reason: "destination-missing" });
      continue;
    }
    if (existsSync(entry.sourcePath)) {
      skipped.push({ relativePath: entry.relativePath, reason: "source-path-already-exists" });
      continue;
    }
    await mkdir(path.dirname(entry.sourcePath), { recursive: true });
    await rename(entry.destinationPath, entry.sourcePath);
    restored.push({ relativePath: entry.relativePath, sourcePath: entry.sourcePath });
  }
  const report = {
    rolledBackAt: new Date().toISOString(),
    ledgerPath: resolvedLedger,
    restoredCount: restored.length,
    skippedCount: skipped.length,
    restored,
    skipped,
  };
  await writeFile(path.join(path.dirname(resolvedLedger), "rollback-report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return report;
}
