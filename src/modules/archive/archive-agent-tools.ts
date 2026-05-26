// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-027-living-archive-llm-wiki-compliance.md

import type { ArchiveImportedLibrarySummary, ArchiveLibraryPreflightCount } from "../../core/contracts";
import { requestArchiveDocument, requestArchiveLibraryPreflight } from "../../core/runtime";

type ImportedLibraryManifestRecord = {
  canonicalPath?: string;
  originalPath?: string;
  sourceType?: string;
};

type ImportedLibraryManifest = {
  canonicalRoot?: string;
  originalPath?: string;
  records?: ImportedLibraryManifestRecord[];
};

const coverageIntentPattern =
  /\b(check|inspect|compare|audit|verify|missing|not added|hasn'?t been added|sub[\s-]?folders?|folders?|source main folder|indexed|imported)\b/i;

const topLabel = (path: string, root: string): string => {
  const normalizedRoot = root.replace(/\/+$/, "");
  const normalizedPath = path.replace(/\/+$/, "");
  const relative = normalizedPath.startsWith(`${normalizedRoot}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : normalizedPath;
  return relative.split("/").filter(Boolean)[0] ?? "(root)";
};

const countRecordsByTopFolder = (records: ImportedLibraryManifestRecord[], root: string): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const record of records) {
    const path = record.canonicalPath || record.originalPath;
    if (!path) {
      continue;
    }
    const label = topLabel(path, root);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
};

const formatCounts = (counts: ArchiveLibraryPreflightCount[], limit = 12): string =>
  counts.length
    ? counts
        .slice(0, limit)
        .map((item) => `- ${item.label}: ${item.count.toLocaleString()} file(s)`)
        .join("\n")
    : "- none";

const formatImportedCounts = (counts: Map<string, number>, limit = 16): string => {
  const entries = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  return entries.length
    ? entries
        .slice(0, limit)
        .map(([label, count]) => `- ${label}: ${count.toLocaleString()} imported record(s)`)
        .join("\n")
    : "- none";
};

export const shouldInspectImportedLibraryCoverage = (message: string): boolean => coverageIntentPattern.test(message);

const managedRootCandidates = (library: ArchiveImportedLibrarySummary, manifest: ImportedLibraryManifest): string[] => {
  const candidates: string[] = [
    library.canonicalRoot,
    manifest.canonicalRoot,
    library.manifestPath.replace(/\/metadata\/[^/]+-manifest\.json$/, `/sources/${library.libraryId}`),
    library.canonicalRoot.replace("/Documents/ResonantOS_User/Memory/", "/ResonantOS_User/Memory/"),
    (manifest.canonicalRoot ?? "").replace("/Documents/ResonantOS_User/Memory/", "/ResonantOS_User/Memory/"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return [...new Set(candidates)];
};

const preflightFirstExisting = async (candidates: string[]) => {
  const firstCandidate = candidates[0];
  if (!firstCandidate) {
    throw new Error("No managed source root candidates are available for this imported library.");
  }
  let fallback = await requestArchiveLibraryPreflight(firstCandidate);
  if (fallback.exists) {
    return fallback;
  }
  for (const candidate of candidates.slice(1)) {
    const result = await requestArchiveLibraryPreflight(candidate);
    if (result.exists) {
      return result;
    }
    fallback = result;
  }
  return fallback;
};

export const inspectImportedLibraryCoverage = async (library: ArchiveImportedLibrarySummary): Promise<string> => {
  const manifestDocument = await requestArchiveDocument(library.manifestPath);
  const manifest = JSON.parse(manifestDocument.content) as ImportedLibraryManifest;
  const managedPreflight = await preflightFirstExisting(managedRootCandidates(library, manifest));
  const originalPreflight =
    library.originalPath && library.originalPath !== managedPreflight.sourcePath
      ? await requestArchiveLibraryPreflight(library.originalPath).catch(() => null)
      : null;
  const records = manifest.records ?? [];
  const canonicalRoot = manifest.canonicalRoot || library.canonicalRoot;
  const importedByTopFolder = countRecordsByTopFolder(records, canonicalRoot);
  const supportedManagedFolders = new Set(managedPreflight.supportedByTopFolder.map((item) => item.label));
  const foldersWithSupportedFilesButNoManifestRecord = [...supportedManagedFolders]
    .filter((label) => !importedByTopFolder.has(label))
    .sort();

  return [
    "Host archive coverage inspection already ran for this turn. Use these facts directly; do not say you will run a listing later.",
    "",
    `Library: ${library.libraryName}`,
    `Managed source root: ${managedPreflight.sourcePath}`,
    managedPreflight.sourcePath !== library.canonicalRoot
      ? `Registered managed root was stale or migrated: ${library.canonicalRoot}`
      : "",
    `Original source root: ${library.originalPath || "not recorded"}`,
    `Manifest path: ${library.manifestPath}`,
    `Manifest records: ${records.length.toLocaleString()}`,
    `Imported files reported by registry: ${library.filesImported.toLocaleString()}`,
    `Skipped files reported by registry: ${library.skippedFiles.toLocaleString()}`,
    "",
    "Imported manifest records by top folder:",
    formatImportedCounts(importedByTopFolder),
    "",
    "Current managed source root scan, supported files by top folder:",
    formatCounts(managedPreflight.supportedByTopFolder),
    "",
    "Current managed source root scan, skipped/unsupported files by top folder:",
    formatCounts(managedPreflight.skippedByTopFolder),
    "",
    "Managed folders with supported files but no manifest record:",
    foldersWithSupportedFilesButNoManifestRecord.length
      ? foldersWithSupportedFilesButNoManifestRecord.map((label) => `- ${label}`).join("\n")
      : "- none detected",
    "",
    originalPreflight
      ? [
          "Original source root scan, supported files by top folder:",
          formatCounts(originalPreflight.supportedByTopFolder),
          "",
          "Original source root scan, skipped/unsupported files by top folder:",
          formatCounts(originalPreflight.skippedByTopFolder),
        ].join("\n")
      : "Original source root scan: unavailable or not distinct from managed source root.",
    "",
    "Interpretation rules:",
    "- If a folder appears in original skipped/unsupported counts, it was discovered but not imported as AI-readable source.",
    "- If a folder appears in original supported counts but not in manifest records, that is a likely import coverage issue.",
    "- If a folder appears only in skipped/unsupported counts, do not call it missing from the Living Archive; explain that the importer skipped unsupported/generated data.",
  ].join("\n");
};
