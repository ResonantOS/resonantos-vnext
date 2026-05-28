/**
 * living-archive.mjs — Living Archive integration for ResonantOS Browser-First.
 * Provides memory search, archive intake, status, and recent intakes.
 * ESM module, no external dependencies.
 */

import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";

// ── Path helpers ──────────────────────────────────────────────────────────────

function memoryRoot() {
  return path.join(os.homedir(), "ResonantOS_User", "Memory");
}

function aiMemoryRoot() {
  return path.join(memoryRoot(), "AI_MEMORY");
}

function intakeBrowserDir() {
  return path.join(memoryRoot(), "INTAKE", "browser");
}

// ── Internal utilities ────────────────────────────────────────────────────────

function safeFileSlug(value) {
  return String(value ?? "item")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

async function listFilesRecursive(root, predicate, limit = 500) {
  const files = [];
  async function walk(current) {
    if (files.length >= limit || !existsSync(current)) return;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= limit || entry.name.startsWith(".")) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && predicate(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  await walk(root);
  return files;
}

async function countFiles(root, predicate) {
  return (await listFilesRecursive(root, predicate, 10_000)).length;
}

async function pathSummary(filePath) {
  if (!existsSync(filePath)) return { exists: false, path: filePath };
  const details = await stat(filePath);
  return {
    exists: true,
    path: filePath,
    bytes: details.size,
    modifiedAt: details.mtime.toISOString(),
  };
}

const isMarkdown = (p) => /\.(md|markdown)$/i.test(p);

// ── Public: searchMemory ──────────────────────────────────────────────────────

/**
 * searchMemory(query, limit) → { query, matches: [{ path, title, excerpt }] }
 *
 * Recursively searches ~/ResonantOS_User/Memory/AI_MEMORY/ for markdown files
 * that contain the query string (case-insensitive substring match).
 */
export async function searchMemory(query, limit = 8) {
  const q = String(query ?? "").trim().toLowerCase();
  if (q.length < 2) throw new Error("Memory search requires at least two characters.");

  const root = aiMemoryRoot();
  const files = await listFilesRecursive(root, isMarkdown, 600);
  const matches = [];

  for (const filePath of files) {
    if (matches.length >= Number(limit)) break;
    const content = await readFile(filePath, "utf8").catch(() => "");
    const index = content.toLowerCase().indexOf(q);
    if (index < 0) continue;
    const start = Math.max(0, index - 160);
    const end = Math.min(content.length, index + q.length + 220);
    matches.push({
      path: path.relative(memoryRoot(), filePath),
      title: path.basename(filePath, path.extname(filePath)),
      excerpt: content.slice(start, end).replace(/\s+/g, " ").trim(),
    });
  }

  return { query: q, matches };
}

// ── Public: intakeToArchive ───────────────────────────────────────────────────

/**
 * intakeToArchive({ title, content, url, source }) → { path, bytes }
 *
 * Saves a note to ~/ResonantOS_User/Memory/INTAKE/browser/ with YAML frontmatter.
 */
export async function intakeToArchive({ title, content, url, source } = {}) {
  const noteTitle = String(title ?? "Browser note").trim().slice(0, 180);
  const noteContent = String(content ?? "").trim();
  if (!noteContent) throw new Error("Archive intake requires content.");

  const dir = intakeBrowserDir();
  await mkdir(dir, { recursive: true });

  const now = new Date();
  const fileName = `${now.toISOString().replace(/[:.]/g, "-")}-${safeFileSlug(noteTitle)}.md`;
  const filePath = path.join(dir, fileName);

  const frontmatter = {
    source: source ?? "resonantos-browser-first",
    actor: "augmentor.browser",
    title: noteTitle,
    createdAt: now.toISOString(),
    url: url ?? null,
  };

  const body = [
    "---",
    ...Object.entries(frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`),
    "---",
    "",
    `# ${noteTitle}`,
    "",
    noteContent,
    "",
  ].join("\n");

  await writeFile(filePath, body);

  // Append to rolling intake log.
  const logPath = path.join(dir, "log.md");
  await appendFile(
    logPath,
    `## [${now.toISOString()}] browser-intake | ${noteTitle}\n- file: ${fileName}\n\n`
  );

  return { path: path.relative(memoryRoot(), filePath), bytes: Buffer.byteLength(body, "utf8") };
}

// ── Public: getMemoryStatus ───────────────────────────────────────────────────

/**
 * getMemoryStatus() → object summarising wiki, intake, and review directories.
 */
export async function getMemoryStatus() {
  const root = memoryRoot();
  const wikiRoot = path.join(aiMemoryRoot(), "wiki");
  const intakeRoot = path.join(root, "INTAKE");
  const reviewRoot = path.join(root, "REVIEW");
  const indexPath = path.join(wikiRoot, "index.md");
  const logPath = path.join(wikiRoot, "log.md");

  return {
    root,
    exists: existsSync(root),
    wiki: {
      root: wikiRoot,
      pages: await countFiles(wikiRoot, isMarkdown),
      index: await pathSummary(indexPath),
      log: await pathSummary(logPath),
    },
    intake: {
      root: intakeRoot,
      artifacts: await countFiles(intakeRoot, () => true),
    },
    review: {
      root: reviewRoot,
      requests: await countFiles(path.join(reviewRoot, "requests"), () => true),
      artifacts: await countFiles(path.join(reviewRoot, "artifacts"), () => true),
    },
  };
}

// ── Public: listRecentIntakes ─────────────────────────────────────────────────

/**
 * listRecentIntakes(limit) → Array of recent intake file descriptors, newest first.
 * Each entry: { name, path, bytes, modifiedAt }
 */
export async function listRecentIntakes(limit = 10) {
  const dir = intakeBrowserDir();
  const files = await listFilesRecursive(dir, isMarkdown, 500);

  const detailed = await Promise.all(
    files.map(async (filePath) => {
      const details = await stat(filePath).catch(() => null);
      if (!details) return null;
      return {
        name: path.basename(filePath),
        path: path.relative(memoryRoot(), filePath),
        bytes: details.size,
        modifiedAt: details.mtime.toISOString(),
      };
    })
  );

  return detailed
    .filter(Boolean)
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, Number(limit));
}
