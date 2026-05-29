import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { computeWikiHealth } from "../host/memory-wiki-health.mjs";

test("wiki health detects missing index entries, broken links, orphans, and duplicate titles", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "resonantos-wiki-health-"));
  const wikiRoot = path.join(root, "AI_MEMORY", "wiki");
  await mkdir(path.join(wikiRoot, "concepts"), { recursive: true });
  await writeFile(path.join(wikiRoot, "index.md"), [
    "# Index",
    "",
    "- [[concepts/augmentatism]]",
  ].join("\n"));
  await writeFile(path.join(wikiRoot, "log.md"), "## [2026-05-29] ingest | seed\n");
  await writeFile(path.join(wikiRoot, "concepts", "augmentatism.md"), [
    "# Augmentatism",
    "",
    "## Source Provenance",
    "- source artifact: `INTAKE/source.md`",
    "",
    "Connects to [[concepts/cosmodestiny]] and [[missing-page]].",
  ].join("\n"));
  await writeFile(path.join(wikiRoot, "concepts", "cosmodestiny.md"), "# Cosmodestiny\n");
  await writeFile(path.join(wikiRoot, "orphan.md"), "# Orphan\n");
  await writeFile(path.join(wikiRoot, "duplicate-a.md"), "# Duplicate\n");
  await writeFile(path.join(wikiRoot, "duplicate-b.md"), "# Duplicate\n");

  try {
    const health = await computeWikiHealth({ wikiRoot });
    assert.equal(health.exists, true);
    assert.equal(health.index.exists, true);
    assert.equal(health.log.exists, true);
    assert.equal(health.pages, 7);
    assert.ok(health.score < 100);
    assert.deepEqual(health.brokenLinks.map((entry) => entry.target), ["missing-page"]);
    assert.ok(health.missingIndexEntries.includes("concepts/cosmodestiny.md"));
    assert.ok(health.orphanPages.includes("orphan.md"));
    assert.equal(health.duplicateTitles[0].title, "Duplicate");
    assert.ok(health.issues.some((issue) => issue.type === "broken-links"));
    assert.ok(health.issues.some((issue) => issue.type === "orphan-pages"));
    assert.ok(health.issues.some((issue) => issue.type === "missing-index-entries"));
    assert.ok(health.issues.some((issue) => issue.type === "duplicate-titles"));
    assert.ok(health.issues.some((issue) => issue.type === "missing-provenance"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("wiki health detects duplicate index catalog entries", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "resonantos-wiki-health-index-"));
  const wikiRoot = path.join(root, "AI_MEMORY", "wiki");
  await mkdir(wikiRoot, { recursive: true });
  await writeFile(path.join(wikiRoot, "index.md"), [
    "# Index",
    "",
    "## Pages",
    "",
    "- [[resonantos]] — old summary",
    "- [[resonantos|ResonantOS]] — newer summary",
  ].join("\n"));
  await writeFile(path.join(wikiRoot, "log.md"), "## [2026-05-29] trusted_wiki_promote | ResonantOS\n");
  await writeFile(path.join(wikiRoot, "resonantos.md"), "# ResonantOS\n");

  try {
    const health = await computeWikiHealth({ wikiRoot });
    assert.deepEqual(health.duplicateIndexEntries, [{ page: "resonantos.md", count: 2 }]);
    assert.ok(health.issues.some((issue) => issue.type === "duplicate-index-entries"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("wiki health detects missing provenance and contradiction markers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "resonantos-wiki-health-provenance-"));
  const wikiRoot = path.join(root, "AI_MEMORY", "wiki");
  await mkdir(wikiRoot, { recursive: true });
  await writeFile(path.join(wikiRoot, "index.md"), [
    "# Index",
    "",
    "- [[claim]]",
  ].join("\n"));
  await writeFile(path.join(wikiRoot, "log.md"), "## [2026-05-29] lint | seed\n");
  await writeFile(path.join(wikiRoot, "claim.md"), [
    "# Claim",
    "",
    "This is an open question and needs verification against newer sources.",
  ].join("\n"));

  try {
    const health = await computeWikiHealth({ wikiRoot });
    assert.deepEqual(health.missingProvenancePages, ["claim.md"]);
    assert.equal(health.contradictionPages[0].page, "claim.md");
    assert.match(health.contradictionPages[0].markers[0], /open question/);
    assert.ok(health.issues.some((issue) => issue.type === "missing-provenance"));
    assert.ok(health.issues.some((issue) => issue.type === "open-questions-or-contradictions"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("wiki health treats AGENTS.md as schema, not source-backed memory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "resonantos-wiki-health-agents-"));
  const wikiRoot = path.join(root, "AI_MEMORY", "wiki");
  await mkdir(wikiRoot, { recursive: true });
  await writeFile(path.join(wikiRoot, "index.md"), [
    "# Index",
    "",
    "- [[AGENTS|Living Archive schema]]",
    "- [[claim]]",
  ].join("\n"));
  await writeFile(path.join(wikiRoot, "log.md"), "## [2026-05-29] bootstrap | schema\n");
  await writeFile(path.join(wikiRoot, "AGENTS.md"), "# Living Archive Schema\n\nOperational conventions.\n");
  await writeFile(path.join(wikiRoot, "claim.md"), [
    "# Claim",
    "",
    "## Source Provenance",
    "- source artifact: `INTAKE/source.md`",
  ].join("\n"));

  try {
    const health = await computeWikiHealth({ wikiRoot });
    assert.equal(health.pages, 4);
    assert.equal(health.issues.some((issue) => issue.type === "missing-provenance"), false);
    assert.equal(health.missingIndexEntries.includes("AGENTS.md"), false);
    assert.equal(health.orphanPages.includes("AGENTS.md"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("wiki health returns a safe missing-root result", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "resonantos-wiki-health-missing-"));
  const wikiRoot = path.join(root, "AI_MEMORY", "wiki");
  try {
    const health = await computeWikiHealth({ wikiRoot });
    assert.equal(health.exists, false);
    assert.equal(health.score, 0);
    assert.equal(health.issues[0].type, "missing-wiki-root");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
