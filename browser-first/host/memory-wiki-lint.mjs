import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { computeWikiHealth } from "./memory-wiki-health.mjs";

function timestampSlug(value) {
  return String(value ?? new Date().toISOString()).replace(/[:.]/g, "-");
}

function sectionList(title, values, formatter = (value) => `- ${value}`) {
  const items = Array.isArray(values) ? values : [];
  if (!items.length) return `## ${title}\n\nNo findings.\n`;
  return `## ${title}\n\n${items.map(formatter).join("\n")}\n`;
}

function lintMarkdown({ health, actor, reason, now }) {
  const issueLines = (health.issues ?? []).map((issue) =>
    `- ${issue.severity ?? "info"} · ${issue.type ?? "issue"} · ${issue.message ?? "Review this issue."}`
  );
  return [
    "---",
    `kind: wiki-lint-report`,
    `createdAt: ${JSON.stringify(now)}`,
    `actor: ${JSON.stringify(actor)}`,
    `score: ${Number(health.score ?? 0)}`,
    `pages: ${Number(health.pages ?? 0)}`,
    `issueCount: ${Number(health.issues?.length ?? 0)}`,
    "---",
    "",
    "# Living Archive Wiki Lint Report",
    "",
    `Reason: ${reason || "scheduled/manual wiki lint"}`,
    "",
    `Health: ${health.exists ? `${health.score}/100 across ${health.pages} page(s)` : "AI_MEMORY/wiki missing"}.`,
    "",
    sectionList("Issues", issueLines, (line) => line),
    sectionList("Broken Links", health.brokenLinks, (entry) => `- ${entry.page} -> ${entry.target} (${entry.syntax})`),
    sectionList("Missing Index Entries", health.missingIndexEntries),
    sectionList("Duplicate Index Entries", health.duplicateIndexEntries, (entry) => `- ${entry.page} appears ${entry.count} time(s)`),
    sectionList("Orphan Pages", health.orphanPages),
    sectionList("Missing Provenance", health.missingProvenancePages),
    sectionList("Open Questions Or Contradictions", health.contradictionPages, (entry) =>
      `- ${entry.page}: ${entry.markers.join(" | ")}`
    ),
    "## Boundary",
    "",
    "This lint report is a review artifact. It does not modify trusted AI Memory pages.",
    "",
  ].join("\n");
}

export async function runWikiLint({ memoryRoot, actor = "resonantos-browser-first", reason = "manual wiki lint", now = new Date().toISOString() } = {}) {
  if (!memoryRoot) {
    throw new Error("Wiki lint requires a memory root.");
  }
  const root = path.resolve(memoryRoot);
  const wikiRoot = path.join(root, "AI_MEMORY", "wiki");
  const health = await computeWikiHealth({ wikiRoot });
  const lintRoot = path.join(root, "REVIEW", "lint");
  await mkdir(lintRoot, { recursive: true });
  const artifactPath = path.join(lintRoot, `wiki-lint-${timestampSlug(now)}.md`);
  const content = lintMarkdown({ health, actor, reason, now });
  await writeFile(artifactPath, content, { mode: 0o600 });
  if (health.exists) {
    const logPath = path.join(wikiRoot, "log.md");
    await appendFile(logPath, `\n## [${now}] lint | Wiki health\n- score: ${health.score}/100\n- artifact: REVIEW/lint/${path.basename(artifactPath)}\n`, { mode: 0o600 });
  }
  return {
    ok: true,
    artifactPath,
    relativeArtifactPath: path.relative(root, artifactPath).replace(/\\/g, "/"),
    health,
  };
}
