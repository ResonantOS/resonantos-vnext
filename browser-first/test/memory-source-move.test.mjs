import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  assertSafeMoveSource,
  buildMoveImportPreflight,
  executeMoveImport,
  rollbackMoveImport,
} from "../host/memory-source-move.mjs";

async function fixtureRoot(name) {
  return mkdtemp(path.join(os.tmpdir(), `resonantos-${name}-`));
}

test("move import preflight rejects broad user root and existing memory root", async () => {
  const root = await fixtureRoot("move-safety");
  const memoryRoot = path.join(root, "ResonantOS_User", "Memory");
  await mkdir(memoryRoot, { recursive: true });
  try {
    assert.throws(() => assertSafeMoveSource(os.homedir(), memoryRoot), /home folder/);
    assert.throws(() => assertSafeMoveSource(memoryRoot, memoryRoot), /already inside ResonantOS Memory/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("move import preflight preserves hidden Obsidian structure in counts", async () => {
  const root = await fixtureRoot("move-preflight");
  const source = path.join(root, "Knowledge Vault");
  const memoryRoot = path.join(root, "ResonantOS_User", "Memory");
  await mkdir(path.join(source, ".obsidian"), { recursive: true });
  await mkdir(memoryRoot, { recursive: true });
  await writeFile(path.join(source, "note.md"), "# Note\n");
  await writeFile(path.join(source, ".obsidian", "app.json"), "{}\n");
  try {
    const preflight = await buildMoveImportPreflight({
      sourcePath: source,
      memoryRoot,
      kind: "obsidian-vault",
      ownership: "human-knowledge",
    });
    assert.equal(preflight.okToMove, true);
    assert.equal(preflight.fileCount, 2);
    assert.equal(preflight.hiddenFiles, 1);
    assert.match(preflight.destinationRoot, /HUMAN_KNOWLEDGE/);
    assert.equal(preflight.confirmationPhrase, "MOVE Knowledge Vault");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("move import preflight blocks symlinked content", async (t) => {
  const root = await fixtureRoot("move-symlink");
  const source = path.join(root, "Vault");
  const memoryRoot = path.join(root, "ResonantOS_User", "Memory");
  await mkdir(source, { recursive: true });
  await mkdir(memoryRoot, { recursive: true });
  await writeFile(path.join(root, "outside.txt"), "outside\n");
  try {
    try {
      await symlink(path.join(root, "outside.txt"), path.join(source, "linked.txt"));
    } catch (error) {
      t.skip(`symlink unavailable in this environment: ${error.message}`);
      return;
    }
    const preflight = await buildMoveImportPreflight({
      sourcePath: source,
      memoryRoot,
      ownership: "human-knowledge",
    });
    assert.equal(preflight.okToMove, false);
    assert.deepEqual(preflight.blocked, [{ path: "linked.txt", reason: "symlink-blocked" }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("move import executes into managed memory and rollback restores originals", async () => {
  const root = await fixtureRoot("move-execute");
  const source = path.join(root, "Research");
  const nested = path.join(source, "nested");
  const memoryRoot = path.join(root, "ResonantOS_User", "Memory");
  await mkdir(nested, { recursive: true });
  await mkdir(memoryRoot, { recursive: true });
  await writeFile(path.join(source, "index.md"), "# Research\n");
  await writeFile(path.join(nested, "paper.txt"), "paper notes\n");

  try {
    const result = await executeMoveImport({
      sourcePath: source,
      memoryRoot,
      ownership: "external-knowledge",
      confirmation: "MOVE Research",
    });
    assert.equal(result.status, "moved");
    assert.equal(result.movedCount, 2);
    assert.equal(existsSync(source), false);
    assert.equal(existsSync(path.join(result.destinationRoot, "index.md")), true);
    assert.equal(existsSync(path.join(result.destinationRoot, "nested", "paper.txt")), true);
    const ledger = await readFile(result.ledgerPath, "utf8");
    assert.match(ledger, /"status":"moved"/);
    assert.match(ledger, /"afterHash":/);
    assert.match(result.destinationRoot, /EXTERNAL_KNOWLEDGE/);

    const rollback = await rollbackMoveImport({
      ledgerPath: result.ledgerPath,
      confirmation: "ROLLBACK MOVE",
    });
    assert.equal(rollback.restoredCount, 2);
    assert.equal(existsSync(path.join(source, "index.md")), true);
    assert.equal(existsSync(path.join(source, "nested", "paper.txt")), true);
    assert.equal(existsSync(path.join(result.destinationRoot, "index.md")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("move import supports verified copy-unlink relocation", async () => {
  const root = await fixtureRoot("move-copy-unlink");
  const source = path.join(root, "Cross Volume");
  const memoryRoot = path.join(root, "ResonantOS_User", "Memory");
  await mkdir(source, { recursive: true });
  await mkdir(memoryRoot, { recursive: true });
  await writeFile(path.join(source, "note.md"), "copy me\n");
  try {
    const result = await executeMoveImport({
      sourcePath: source,
      memoryRoot,
      confirmation: "MOVE Cross Volume",
      moveFile: async (sourcePath, destinationPath) => {
        const bytes = await readFile(sourcePath);
        await writeFile(destinationPath, bytes);
        await rm(sourcePath, { force: true });
        return "copy-unlink";
      },
    });
    assert.equal(result.status, "moved");
    assert.equal(existsSync(source), false);
    assert.equal(existsSync(path.join(result.destinationRoot, "note.md")), true);
    assert.match(await readFile(result.ledgerPath, "utf8"), /"moveMethod":"copy-unlink"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("move import rejects destination hash mismatch and keeps original source", async () => {
  const root = await fixtureRoot("move-hash-mismatch");
  const source = path.join(root, "Hash Guard");
  const memoryRoot = path.join(root, "ResonantOS_User", "Memory");
  await mkdir(source, { recursive: true });
  await mkdir(memoryRoot, { recursive: true });
  await writeFile(path.join(source, "note.md"), "correct bytes\n");
  try {
    const result = await executeMoveImport({
      sourcePath: source,
      memoryRoot,
      confirmation: "MOVE Hash Guard",
      moveFile: async (_sourcePath, destinationPath) => {
        await writeFile(destinationPath, "corrupt bytes\n");
        return "bad-copy";
      },
    });
    assert.equal(result.status, "partial-failure-rolled-back");
    assert.equal(result.failedCount, 1);
    assert.equal(existsSync(path.join(source, "note.md")), true);
    assert.equal(existsSync(path.join(result.destinationRoot, "note.md")), false);
    assert.match(result.failures[0].error, /destination hash mismatch/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("move import automatically rolls back earlier files after a later move fails", async () => {
  const root = await fixtureRoot("move-auto-rollback");
  const source = path.join(root, "Rollback Guard");
  const memoryRoot = path.join(root, "ResonantOS_User", "Memory");
  await mkdir(source, { recursive: true });
  await mkdir(memoryRoot, { recursive: true });
  await writeFile(path.join(source, "a.md"), "first\n");
  await writeFile(path.join(source, "b.md"), "second\n");
  let calls = 0;
  try {
    const result = await executeMoveImport({
      sourcePath: source,
      memoryRoot,
      confirmation: "MOVE Rollback Guard",
      moveFile: async (sourcePath, destinationPath) => {
        calls += 1;
        if (calls === 2) {
          throw new Error("simulated move failure");
        }
        const bytes = await readFile(sourcePath);
        await writeFile(destinationPath, bytes);
        await rm(sourcePath, { force: true });
        return "test-move";
      },
    });
    assert.equal(result.status, "partial-failure-rolled-back");
    assert.equal(result.movedCount, 1);
    assert.equal(result.failedCount, 1);
    assert.equal(result.rollbackRestoredCount, 1);
    assert.equal(existsSync(path.join(source, "a.md")), true);
    assert.equal(existsSync(path.join(source, "b.md")), true);
    assert.equal(existsSync(path.join(result.destinationRoot, "a.md")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("move rollback refuses to restore corrupted destination bytes", async () => {
  const root = await fixtureRoot("move-rollback-hash");
  const source = path.join(root, "Rollback Hash");
  const memoryRoot = path.join(root, "ResonantOS_User", "Memory");
  await mkdir(source, { recursive: true });
  await mkdir(memoryRoot, { recursive: true });
  await writeFile(path.join(source, "note.md"), "trusted bytes\n");
  try {
    const result = await executeMoveImport({
      sourcePath: source,
      memoryRoot,
      confirmation: "MOVE Rollback Hash",
    });
    await writeFile(path.join(result.destinationRoot, "note.md"), "tampered bytes\n");
    const rollback = await rollbackMoveImport({
      ledgerPath: result.ledgerPath,
      confirmation: "ROLLBACK MOVE",
    });
    assert.equal(rollback.restoredCount, 0);
    assert.equal(rollback.skippedCount, 1);
    assert.equal(rollback.skipped[0].reason, "destination-hash-mismatch");
    assert.equal(existsSync(path.join(source, "note.md")), false);
    assert.equal(existsSync(path.join(result.destinationRoot, "note.md")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("move import requires exact human confirmation phrase", async () => {
  const root = await fixtureRoot("move-confirmation");
  const source = path.join(root, "UnsafeMove");
  const memoryRoot = path.join(root, "ResonantOS_User", "Memory");
  await mkdir(source, { recursive: true });
  await mkdir(memoryRoot, { recursive: true });
  await writeFile(path.join(source, "note.md"), "note\n");
  try {
    await assert.rejects(
      () => executeMoveImport({ sourcePath: source, memoryRoot, confirmation: "yes" }),
      /requires confirmation phrase/
    );
    assert.equal(existsSync(path.join(source, "note.md")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
