import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { searchMemoryWiki } from "../host/memory-search.mjs";

test("memory search prioritizes index catalog matches over raw content matches", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "resonantos-memory-search-"));
  const memoryRoot = path.join(root, "Memory");
  const wikiRoot = path.join(memoryRoot, "AI_MEMORY", "wiki");
  await mkdir(wikiRoot, { recursive: true });
  await writeFile(path.join(wikiRoot, "index.md"), [
    "# Wiki Index",
    "",
    "## Pages",
    "",
    "- [[augmentor|Augmentor]] — Strategist orchestration and delegation control.",
  ].join("\n"));
  await writeFile(path.join(wikiRoot, "augmentor.md"), [
    "# Augmentor",
    "",
    "The trusted strategist coordinates user intent.",
  ].join("\n"));
  await writeFile(path.join(wikiRoot, "raw-mention.md"), [
    "# Raw Mention",
    "",
    "This page mentions Augmentor many times. Augmentor Augmentor Augmentor.",
  ].join("\n"));

  try {
    const result = await searchMemoryWiki({ memoryRoot, query: "delegation", limit: 5 });
    assert.equal(result.searchedIndex, true);
    assert.equal(result.matches[0].path, "AI_MEMORY/wiki/augmentor.md");
    assert.equal(result.matches[0].matchSource, "index");
    assert.match(result.matches[0].excerpt, /Strategist orchestration and delegation control/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("memory search falls back to wiki page content when index has no hit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "resonantos-memory-search-content-"));
  const memoryRoot = path.join(root, "Memory");
  const wikiRoot = path.join(memoryRoot, "AI_MEMORY", "wiki");
  await mkdir(wikiRoot, { recursive: true });
  await writeFile(path.join(wikiRoot, "index.md"), "# Wiki Index\n\n## Pages\n");
  await writeFile(path.join(wikiRoot, "cosmodestiny.md"), [
    "# Cosmodestiny",
    "",
    "Cosmodestiny appears in page content even when the index has not caught up.",
  ].join("\n"));

  try {
    const result = await searchMemoryWiki({ memoryRoot, query: "cosmodestiny", limit: 5 });
    assert.equal(result.matches[0].path, "AI_MEMORY/wiki/cosmodestiny.md");
    assert.equal(result.matches[0].matchSource, "content");
    assert.match(result.matches[0].excerpt, /Cosmodestiny appears/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
