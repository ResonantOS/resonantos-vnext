import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";

export const livingArchiveSchemaVersion = 1;

export const memoryDomainRoots = [
  "HUMAN_KNOWLEDGE",
  "EXTERNAL_KNOWLEDGE",
  "AI_MEMORY/wiki",
  "AI_MEMORY/provenance",
  "AI_MEMORY/backups",
  "INTAKE/browser",
  "INTAKE/mcp",
  "INTAKE/review-queue",
  "REVIEW/requests",
  "REVIEW/artifacts",
  "REVIEW/verifications",
  "CONFIG",
  "LOGS",
  "MANIFESTS",
];

export function livingArchiveSchemaText() {
  return [
    "# Living Archive LLM Wiki Schema",
    "",
    `schemaVersion: ${livingArchiveSchemaVersion}`,
    "",
    "## Intent",
    "",
    "The Living Archive implements the LLM Wiki pattern: raw sources are preserved, AI Memory is an LLM-maintained markdown wiki, and schema rules discipline how agents ingest, query, lint, and maintain that wiki.",
    "",
    "## Memory Layers",
    "",
    "- `HUMAN_KNOWLEDGE/`: user-owned source material. Preserve original meaning and provenance.",
    "- `EXTERNAL_KNOWLEDGE/`: non-user-owned references, research, meetings, business/project documents, and third-party materials.",
    "- `INTAKE/`: raw artifacts, add-on outputs, browser captures, MCP deposits, and source bundles awaiting review.",
    "- `REVIEW/`: draft wiki updates, verifier results, revisions, promotion artifacts, and rollback evidence.",
    "- `AI_MEMORY/wiki/`: trusted AI-curated markdown pages. Only the host-mediated Strategist-owned ingest/review/promote path writes here.",
    "",
    "## Wiki Page Rules",
    "",
    "- Every trusted page must be markdown.",
    "- Every trusted page must keep source provenance through frontmatter or a visible source section.",
    "- Prefer wikilinks for entities, concepts, claims, comparisons, synthesis pages, and source summaries.",
    "- Do not flatten all concepts into the same importance level; record whether a page is source, entity, concept, claim, comparison, synthesis, or open question.",
    "- When names are similar, flag duplicate candidates instead of silently creating parallel concepts.",
    "- When new evidence conflicts with old claims, add a contradiction/open-question note instead of erasing the conflict.",
    "",
    "## Operations",
    "",
    "- Ingest: read intake, draft source summary and relevant concept/entity/claim updates, verify, then promote through the host.",
    "- Query: read `index.md` first, then drill into relevant wiki pages and cite page/source paths.",
    "- Lint: check broken links, orphans, missing index entries, duplicate titles, duplicate index entries, stale claims, contradiction markers, missing provenance, and duplicate concept candidates.",
    "- Log: append chronological events to `log.md`; do not use `log.md` as the content catalog.",
    "- Index: maintain `index.md` as a deduplicated content catalog with one-line summaries.",
    "",
    "## External Agent Boundary",
    "",
    "Hermes, OpenCode, browser tools, and other add-ons may read scoped archive context and write intake artifacts when granted. They must not write trusted AI Memory pages directly.",
    "",
  ].join("\n");
}

function defaultIndexText(now) {
  return [
    "# Wiki Index",
    "",
    "This is the content-oriented catalog for AI Memory. Agents should read this before drilling into pages.",
    "",
    "## Pages",
    "",
    `- [[AGENTS|Living Archive LLM Wiki Schema]] — Operating schema for AI Memory maintainers. (updated ${now})`,
    "",
  ].join("\n");
}

function defaultLogText(now) {
  return [
    `## [${now}] bootstrap | Living Archive schema`,
    "- initialized schema, index, and log files",
    "",
  ].join("\n");
}

async function writeIfMissing(filePath, body, mode = 0o600) {
  if (existsSync(filePath)) {
    return { path: filePath, created: false };
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body, { mode });
  await chmod(filePath, mode).catch(() => undefined);
  return { path: filePath, created: true };
}

export async function ensureLivingArchiveSchema({ memoryRoot, now = new Date().toISOString() } = {}) {
  if (!memoryRoot) throw new Error("Living Archive schema requires a memory root.");
  const root = path.resolve(memoryRoot);
  const directories = [];
  for (const relativeDir of memoryDomainRoots) {
    const dirPath = path.join(root, relativeDir);
    await mkdir(dirPath, { recursive: true });
    directories.push(path.relative(root, dirPath).replace(/\\/g, "/"));
  }

  const wikiRoot = path.join(root, "AI_MEMORY", "wiki");
  const files = [];
  files.push(await writeIfMissing(path.join(wikiRoot, "AGENTS.md"), livingArchiveSchemaText()));
  files.push(await writeIfMissing(path.join(wikiRoot, "index.md"), defaultIndexText(now)));
  files.push(await writeIfMissing(path.join(wikiRoot, "log.md"), defaultLogText(now)));

  const schemaPath = path.join(wikiRoot, "AGENTS.md");
  const schemaContent = await readFile(schemaPath, "utf8").catch(() => "");
  return {
    root,
    schemaVersion: livingArchiveSchemaVersion,
    directories,
    files: files.map((entry) => ({
      path: path.relative(root, entry.path).replace(/\\/g, "/"),
      created: entry.created,
    })),
    schemaPath: path.relative(root, schemaPath).replace(/\\/g, "/"),
    schemaPresent: schemaContent.includes("Living Archive LLM Wiki Schema"),
  };
}
