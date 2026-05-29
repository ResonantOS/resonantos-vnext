import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const markdownExtensions = new Set([".md", ".markdown"]);

async function listMarkdownFiles(root, limit = 600) {
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
        if (!entry.name.startsWith(".")) await walk(filePath);
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

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\.(md|markdown)$/i, "")
    .toLowerCase();
}

function pageTitle(content, fallback) {
  return /^#\s+(.+)$/m.exec(String(content ?? ""))?.[1]?.trim() || fallback;
}

function compactExcerpt(content, query, radius = 220) {
  const normalized = String(content ?? "").replace(/\s+/g, " ").trim();
  const index = normalized.toLowerCase().indexOf(String(query ?? "").toLowerCase());
  if (index < 0) return normalized.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(normalized.length, index + String(query ?? "").length + radius);
  return normalized.slice(start, end).trim();
}

function extractLinkedTargets(line) {
  const targets = [];
  for (const match of String(line ?? "").matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]+)?\]\]/g)) {
    targets.push(match[1].trim());
  }
  for (const match of String(line ?? "").matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
    const target = match[1].trim();
    if (!/^[a-z]+:/i.test(target)) targets.push(target);
  }
  return targets;
}

function buildFileLookup(aiMemoryRoot, files) {
  const lookup = new Map();
  for (const filePath of files) {
    const relativeAi = path.relative(aiMemoryRoot, filePath).replace(/\\/g, "/");
    const relativeWiki = relativeAi.replace(/^wiki\//, "");
    for (const alias of [
      relativeAi,
      relativeWiki,
      path.basename(relativeAi),
      path.basename(relativeWiki),
      normalizeKey(relativeAi),
      normalizeKey(relativeWiki),
      normalizeKey(path.basename(relativeAi)),
    ]) {
      if (alias && !lookup.has(alias)) lookup.set(alias, filePath);
    }
  }
  return lookup;
}

function resolveTarget(target, lookup) {
  const normalized = normalizeKey(target);
  return lookup.get(target) ??
    lookup.get(normalized) ??
    lookup.get(`${normalized}.md`) ??
    lookup.get(path.posix.basename(normalized)) ??
    null;
}

function scoreContent({ content, indexLine = "", query, relativePath, title }) {
  const haystacks = {
    title: String(title ?? "").toLowerCase(),
    path: String(relativePath ?? "").toLowerCase(),
    index: String(indexLine ?? "").toLowerCase(),
    content: String(content ?? "").toLowerCase(),
  };
  const needle = String(query ?? "").toLowerCase();
  let score = 0;
  if (haystacks.index.includes(needle)) score += 80;
  if (haystacks.title.includes(needle)) score += 40;
  if (haystacks.path.includes(needle)) score += 20;
  const occurrences = haystacks.content.split(needle).length - 1;
  score += Math.min(30, occurrences * 6);
  return score;
}

export async function searchMemoryWiki({ memoryRoot, query, limit = 8 } = {}) {
  const normalizedQuery = String(query ?? "").trim();
  if (normalizedQuery.length < 2) {
    throw new Error("Memory search requires at least two characters.");
  }
  const aiMemoryRoot = path.join(memoryRoot, "AI_MEMORY");
  const files = await listMarkdownFiles(aiMemoryRoot, 600);
  const lookup = buildFileLookup(aiMemoryRoot, files);
  const indexPath = path.join(aiMemoryRoot, "wiki", "index.md");
  const indexContent = existsSync(indexPath) ? await readFile(indexPath, "utf8").catch(() => "") : "";
  const indexHits = new Map();
  for (const line of indexContent.split(/\r?\n/)) {
    if (!line.toLowerCase().includes(normalizedQuery.toLowerCase())) continue;
    for (const target of extractLinkedTargets(line)) {
      const resolved = resolveTarget(target, lookup);
      if (resolved) indexHits.set(resolved, line.trim());
    }
  }

  const matches = [];
  for (const filePath of files) {
    const relativePath = path.relative(memoryRoot, filePath).replace(/\\/g, "/");
    const content = await readFile(filePath, "utf8").catch(() => "");
    const title = pageTitle(content, path.basename(filePath, path.extname(filePath)));
    const indexLine = indexHits.get(filePath) ?? "";
    const score = scoreContent({ content, indexLine, query: normalizedQuery, relativePath, title });
    if (score <= 0) continue;
    matches.push({
      path: relativePath,
      title,
      excerpt: indexLine || compactExcerpt(content, normalizedQuery),
      matchSource: indexLine ? "index" : "content",
      score,
    });
  }
  matches.sort((left, right) =>
    right.score - left.score ||
    String(left.path).localeCompare(String(right.path))
  );
  return {
    query: normalizedQuery.toLowerCase(),
    matches: matches.slice(0, Math.max(1, Math.min(50, Number(limit ?? 8)))),
    searchedIndex: Boolean(indexContent),
  };
}
