import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  lineDiffSummary,
  listSourceFileVersions,
  recordSourceFileIntakeArtifact,
  reserveSourceFileVersion,
  sourceContentHash,
} from "../host/memory-source-versioning.mjs";

test("source file versioning increments only when content changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "resonantos-source-versioning-"));
  const manifestPath = path.join(root, "Memory", "CONFIG", "source-file-versions.json");
  try {
    const firstHash = sourceContentHash("# First\n");
    const first = await reserveSourceFileVersion({
      manifestPath,
      sourceId: "source-vault",
      relativeFile: "notes/identity.md",
      contentHash: firstHash,
      sourceModifiedAt: "2026-05-29T10:00:00.000Z",
      now: "2026-05-29T10:01:00.000Z",
    });
    assert.deepEqual(first, {
      changed: true,
      version: 1,
      contentHash: firstHash,
      previousHash: "",
      previousVersion: 0,
    });

    const duplicate = await reserveSourceFileVersion({
      manifestPath,
      sourceId: "source-vault",
      relativeFile: "notes/identity.md",
      contentHash: firstHash,
      sourceModifiedAt: "2026-05-29T10:00:00.000Z",
      now: "2026-05-29T10:02:00.000Z",
    });
    assert.equal(duplicate.changed, false);
    assert.equal(duplicate.version, 1);
    assert.equal(duplicate.previousHash, firstHash);

    const secondHash = sourceContentHash("# First\n\nUpdated.\n");
    const second = await reserveSourceFileVersion({
      manifestPath,
      sourceId: "source-vault",
      relativeFile: "notes/identity.md",
      contentHash: secondHash,
      sourceModifiedAt: "2026-05-29T11:00:00.000Z",
      now: "2026-05-29T11:01:00.000Z",
    });
    assert.equal(second.changed, true);
    assert.equal(second.version, 2);
    assert.equal(second.previousHash, firstHash);
    assert.equal(second.previousVersion, 1);

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const entry = manifest.files["source-vault::notes/identity.md"];
    assert.equal(entry.latestHash, secondHash);
    assert.equal(entry.latestVersion, 2);
    assert.equal(entry.history.length, 2);

    const recorded = await recordSourceFileIntakeArtifact({
      manifestPath,
      sourceId: "source-vault",
      relativeFile: "notes/identity.md",
      version: 2,
      intakePath: "INTAKE/sources/identity-v2.md",
    });
    assert.equal(recorded.latestIntakePath, "INTAKE/sources/identity-v2.md");

    const listed = await listSourceFileVersions({ manifestPath, sourceId: "source-vault" });
    assert.equal(listed.entries.length, 1);
    assert.equal(listed.entries[0].sourceFile, "notes/identity.md");
    assert.equal(listed.entries[0].latestVersion, 2);
    assert.equal(listed.entries[0].latestIntakePath, "INTAKE/sources/identity-v2.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("line diff summary returns bounded added and removed lines", () => {
  const diff = lineDiffSummary("A\nB\nC", "A\nBee\nC\nD", { limit: 10 });
  assert.equal(diff.changed, true);
  assert.equal(diff.previousLines, 3);
  assert.equal(diff.currentLines, 4);
  assert.deepEqual(diff.changes, [
    { type: "removed", line: 2, text: "B" },
    { type: "added", line: 2, text: "Bee" },
    { type: "added", line: 4, text: "D" },
  ]);
});
