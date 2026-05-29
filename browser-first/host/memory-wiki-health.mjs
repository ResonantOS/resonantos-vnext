import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";

const markdownExtensions = new Set([".md", ".markdown"]);
const ignoredWikiFiles = new Set(["index", "log", "agents"]);

async function listMarkdownFiles(root, limit = 2_000) {
  const output = [];
  async function walk(current) {
    if (output.length >= limit) return;
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (output.length >= limit) return;
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) {
          await walk(filePath);
        }
        continue;
      }
      if (entry.isFile() && markdownExtensions.has(path.extname(entry.name).toLowerCase())) {
        output.push(filePath);
      }
    }
  }
  await walk(root);
  return output;
}

function pageKey(root, filePath) {
  return path.relative(root, filePath)
    .replace(/\\/g, "/")
    .replace(/\.(md|markdown)$/i, "");
}

function slug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/#.*$/, "")
    .replace(/\.(md|markdown)$/i, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/[^a-z0-9/_ -]+/g, "")
    .replace(/\s+/g, "-");
}

function pageTitle(content, fallback) {
  return /^#\s+(.+)$/m.exec(content)?.[1]?.trim() || fallback;
}

function hasPageProvenance(content) {
  return /^sourceArtifact:\s*.+$/m.test(content) ||
    /^reviewArtifact:\s*.+$/m.test(content) ||
    /^source:\s*.+$/m.test(content) ||
    /##\s+Source Provenance/i.test(content) ||
    /##\s+Source Artifact/i.test(content);
}

function contradictionMarkers(content, limit = 5) {
  const markers = [];
  const lines = String(content ?? "").split(/\r?\n/);
  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized || normalized.startsWith("```")) continue;
    if (/\b(contradict|contradiction|conflict|tension|stale|superseded|needs verification|open question|uncertain)\b/i.test(normalized)) {
      markers.push(normalized.slice(0, 240));
    }
    if (markers.length >= limit) break;
  }
  return markers;
}

function extractWikiLinks(content) {
  const links = [];
  for (const match of content.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const target = match[1].split("|")[0].trim();
    if (target) links.push({ target, syntax: "wikilink" });
  }
  for (const match of content.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
    const target = match[1].trim();
    if (/\.md(?:#.*)?$/i.test(target) && !/^[a-z]+:/i.test(target)) {
      links.push({ target, syntax: "markdown" });
    }
  }
  return links;
}

function buildLookup(keys) {
  const lookup = new Map();
  for (const key of keys) {
    const values = new Set([
      key,
      slug(key),
      path.basename(key),
      slug(path.basename(key)),
    ]);
    for (const value of values) {
      if (!value) continue;
      const existing = lookup.get(value) ?? [];
      existing.push(key);
      lookup.set(value, existing);
    }
  }
  return lookup;
}

function resolveLink(sourceKey, link, lookup) {
  const raw = String(link.target ?? "").split("#")[0].trim();
  const candidates = [
    raw,
    slug(raw),
    path.posix.normalize(path.posix.join(path.posix.dirname(sourceKey), raw)),
    slug(path.posix.normalize(path.posix.join(path.posix.dirname(sourceKey), raw))),
    path.posix.basename(raw),
    slug(path.posix.basename(raw)),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const matches = lookup.get(candidate);
    if (matches?.length === 1) return matches[0];
    if (matches?.includes(candidate)) return candidate;
  }
  return "";
}

export async function computeWikiHealth({ wikiRoot, limit = 2_000 } = {}) {
  if (!wikiRoot) {
    throw new Error("Wiki health requires a wiki root.");
  }
  const root = path.resolve(wikiRoot);
  if (!existsSync(root)) {
    return {
      root,
      exists: false,
      score: 0,
      pages: 0,
      issues: [{ severity: "error", type: "missing-wiki-root", message: "AI_MEMORY/wiki does not exist." }],
      brokenLinks: [],
      orphanPages: [],
      missingIndexEntries: [],
      duplicateIndexEntries: [],
      duplicateTitles: [],
      missingProvenancePages: [],
      contradictionPages: [],
      index: { exists: false },
      log: { exists: false },
    };
  }

  const files = await listMarkdownFiles(root, limit);
  const pages = [];
  for (const filePath of files) {
    const content = await readFile(filePath, "utf8").catch(() => "");
    const key = pageKey(root, filePath);
    pages.push({
      key,
      path: path.relative(root, filePath).replace(/\\/g, "/"),
      title: pageTitle(content, path.basename(key)),
      content,
      links: extractWikiLinks(content),
    });
  }

  const keys = pages.map((page) => page.key);
  const lookup = buildLookup(keys);
  const inbound = new Map(keys.map((key) => [key, new Set()]));
  const brokenLinks = [];
  for (const page of pages) {
    for (const link of page.links) {
      const resolved = resolveLink(page.key, link, lookup);
      if (resolved) {
        inbound.get(resolved)?.add(page.key);
      } else {
        brokenLinks.push({
          page: page.path,
          target: link.target,
          syntax: link.syntax,
        });
      }
    }
  }

  const indexPage = pages.find((page) => page.key === "index");
  const logPage = pages.find((page) => page.key === "log");
  const indexTargets = new Set();
  const indexTargetCounts = new Map();
  if (indexPage) {
    for (const link of indexPage.links) {
      const resolved = resolveLink(indexPage.key, link, lookup);
      if (resolved) {
        indexTargets.add(resolved);
        indexTargetCounts.set(resolved, (indexTargetCounts.get(resolved) ?? 0) + 1);
      }
    }
  }

  const contentPages = pages.filter((page) => !ignoredWikiFiles.has(page.key.toLowerCase()));
  const orphanPages = contentPages
    .filter((page) => (inbound.get(page.key)?.size ?? 0) === 0)
    .map((page) => page.path);
  const missingIndexEntries = contentPages
    .filter((page) => !indexTargets.has(page.key))
    .map((page) => page.path);
  const missingProvenancePages = contentPages
    .filter((page) => !hasPageProvenance(page.content))
    .map((page) => page.path);
  const contradictionPages = contentPages
    .map((page) => ({ page: page.path, markers: contradictionMarkers(page.content) }))
    .filter((entry) => entry.markers.length);

  const titleGroups = new Map();
  for (const page of contentPages) {
    const key = slug(page.title);
    const group = titleGroups.get(key) ?? [];
    group.push({ title: page.title, path: page.path });
    titleGroups.set(key, group);
  }
  const duplicateTitles = [...titleGroups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({ title: group[0].title, pages: group.map((entry) => entry.path) }));
  const duplicateIndexEntries = [...indexTargetCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({
      page: `${key}.md`,
      count,
    }));

  const issues = [];
  if (!indexPage) issues.push({ severity: "error", type: "missing-index", message: "index.md is missing." });
  if (!logPage) issues.push({ severity: "error", type: "missing-log", message: "log.md is missing." });
  if (brokenLinks.length) issues.push({ severity: "warning", type: "broken-links", message: `${brokenLinks.length} broken wiki link(s).` });
  if (orphanPages.length) issues.push({ severity: "warning", type: "orphan-pages", message: `${orphanPages.length} page(s) have no inbound wiki links.` });
  if (missingIndexEntries.length) issues.push({ severity: "warning", type: "missing-index-entries", message: `${missingIndexEntries.length} page(s) are missing from index.md.` });
  if (duplicateIndexEntries.length) issues.push({ severity: "warning", type: "duplicate-index-entries", message: `${duplicateIndexEntries.length} page(s) have duplicate index.md entries.` });
  if (duplicateTitles.length) issues.push({ severity: "warning", type: "duplicate-titles", message: `${duplicateTitles.length} duplicate title group(s).` });
  if (missingProvenancePages.length) issues.push({ severity: "warning", type: "missing-provenance", message: `${missingProvenancePages.length} page(s) are missing visible source provenance.` });
  if (contradictionPages.length) issues.push({ severity: "info", type: "open-questions-or-contradictions", message: `${contradictionPages.length} page(s) contain contradiction/open-question markers.` });

  const errorPenalty = issues.filter((issue) => issue.severity === "error").length * 30;
  const warningPenalty = issues.filter((issue) => issue.severity === "warning").length * 10;
  const score = Math.max(0, 100 - errorPenalty - warningPenalty);
  const logStats = logPage ? await stat(path.join(root, logPage.path)).catch(() => null) : null;

  return {
    root,
    exists: true,
    score,
    pages: pages.length,
    issues,
    brokenLinks: brokenLinks.slice(0, 25),
    orphanPages: orphanPages.slice(0, 25),
    missingIndexEntries: missingIndexEntries.slice(0, 25),
    duplicateIndexEntries: duplicateIndexEntries.slice(0, 25),
    duplicateTitles: duplicateTitles.slice(0, 25),
    missingProvenancePages: missingProvenancePages.slice(0, 25),
    contradictionPages: contradictionPages.slice(0, 25),
    index: { exists: Boolean(indexPage), entries: indexTargets.size },
    log: {
      exists: Boolean(logPage),
      modifiedAt: logStats?.mtime?.toISOString?.() ?? "",
    },
    limitReached: files.length >= limit,
  };
}
