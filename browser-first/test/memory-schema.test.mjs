import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureLivingArchiveSchema } from "../host/memory-schema.mjs";

test("living archive schema bootstrap creates LLM Wiki directories and schema files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "resonantos-memory-schema-"));
  try {
    const result = await ensureLivingArchiveSchema({
      memoryRoot: root,
      now: "2026-05-29T12:00:00.000Z",
    });

    assert.equal(result.schemaPresent, true);
    assert.ok(result.directories.includes("HUMAN_KNOWLEDGE"));
    assert.ok(result.directories.includes("EXTERNAL_KNOWLEDGE"));
    assert.ok(result.directories.includes("AI_MEMORY/wiki"));
    assert.ok(result.directories.includes("INTAKE/review-queue"));
    assert.deepEqual(
      result.files.filter((file) => file.created).map((file) => file.path).sort(),
      ["AI_MEMORY/wiki/AGENTS.md", "AI_MEMORY/wiki/index.md", "AI_MEMORY/wiki/log.md"],
    );

    const schema = await readFile(path.join(root, "AI_MEMORY", "wiki", "AGENTS.md"), "utf8");
    assert.match(schema, /LLM Wiki pattern/);
    assert.match(schema, /Hermes, OpenCode, browser tools/);

    const index = await readFile(path.join(root, "AI_MEMORY", "wiki", "index.md"), "utf8");
    assert.match(index, /## Pages/);
    assert.match(index, /\[\[AGENTS\|Living Archive LLM Wiki Schema\]\]/);

    const log = await readFile(path.join(root, "AI_MEMORY", "wiki", "log.md"), "utf8");
    assert.match(log, /^## \[2026-05-29T12:00:00\.000Z\] bootstrap \| Living Archive schema/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("living archive schema bootstrap does not overwrite existing schema files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "resonantos-memory-schema-existing-"));
  const wikiRoot = path.join(root, "AI_MEMORY", "wiki");
  await mkdir(wikiRoot, { recursive: true });
  await writeFile(path.join(wikiRoot, "AGENTS.md"), "# Custom Schema\n");
  await writeFile(path.join(wikiRoot, "index.md"), "# Custom Index\n");

  try {
    const result = await ensureLivingArchiveSchema({
      memoryRoot: root,
      now: "2026-05-29T12:00:00.000Z",
    });

    assert.equal(result.files.find((file) => file.path === "AI_MEMORY/wiki/AGENTS.md").created, false);
    assert.equal(result.files.find((file) => file.path === "AI_MEMORY/wiki/index.md").created, false);
    assert.equal(await readFile(path.join(wikiRoot, "AGENTS.md"), "utf8"), "# Custom Schema\n");
    assert.equal(await readFile(path.join(wikiRoot, "index.md"), "utf8"), "# Custom Index\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
