// Intent citation: docs/architecture/ADR-029-living-archive-mcp-bridge.md

import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createLivingArchiveBridge } from "./living-archive-mcp.mjs";
import { createLivingArchiveMemoryService } from "./living-archive-memory-service.mjs";

const makeMemoryRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), "resonantos-memory-service-"));
  await mkdir(join(root, "HUMAN_KNOWLEDGE", "sources"), { recursive: true });
  await mkdir(join(root, "EXTERNAL_KNOWLEDGE", "research"), { recursive: true });
  await mkdir(join(root, "AI_MEMORY", "wiki"), { recursive: true });
  await writeFile(
    join(root, "HUMAN_KNOWLEDGE", "sources", "identity.md"),
    "---\nresonantos.ownership: human\n---\n# Human Identity\nPortable memory preserves original human knowledge.",
    "utf8",
  );
  await writeFile(
    join(root, "AI_MEMORY", "wiki", "system.md"),
    "# System Memory\nThe AI curated memory is promoted only through review.",
    "utf8",
  );
  return root;
};

const listen = async (server) => {
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
};

const postMemory = async (endpoint, operation, input = {}) => {
  const response = await fetch(`${endpoint}/memory/${operation}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json();
  return { response, payload };
};

test("Living Archive memory service exposes portable status, search, read, intake, review queue, and lint", async () => {
  const root = await makeMemoryRoot();
  const server = createLivingArchiveMemoryService({ memoryRoot: root, readonly: false });
  const endpoint = await listen(server);

  try {
    const status = await postMemory(endpoint, "status");
    assert.equal(status.response.status, 200);
    assert.equal(status.payload.status, "ready");
    assert.equal(status.payload.backend, "portable-folder");

    const search = await postMemory(endpoint, "search", { query: "human knowledge", limit: 4 });
    assert.equal(search.response.status, 200);
    assert.equal(search.payload.results[0].path, "HUMAN_KNOWLEDGE/sources/identity.md");

    const read = await postMemory(endpoint, "read", { path: "AI_MEMORY/wiki/system.md" });
    assert.equal(read.response.status, 200);
    assert.equal(read.payload.title, "System Memory");

    const intake = await postMemory(endpoint, "intake-write", {
      actorId: "external.agent",
      bucket: "obsidian",
      fileName: "note.md",
      content: "# External Note\nBridge this into review.",
      metadata: { source: "test" },
    });
    assert.equal(intake.response.status, 200);
    assert.equal(intake.payload.artifactPath, "INTAKE/mcp/obsidian/note.md");

    const ingest = await postMemory(endpoint, "ingest-request", {
      actorId: "external.agent",
      sourcePath: intake.payload.artifactPath,
      sourceType: "markdown",
      intent: "Prepare review artifact.",
    });
    assert.equal(ingest.response.status, 200);
    assert.match(ingest.payload.requestFile, /^INTAKE\/review-queue\/.+\.json$/);

    const reviewQueue = await postMemory(endpoint, "review-queue");
    assert.equal(reviewQueue.response.status, 200);
    assert.equal(reviewQueue.payload.length, 1);
    assert.equal(reviewQueue.payload[0].boundary.requiresStrategistOwnedIngest, true);

    const queued = JSON.parse(await readFile(join(root, ingest.payload.requestFile), "utf8"));
    assert.equal(queued.boundary.trustedKnowledgeWrite, false);

    const processed = await postMemory(endpoint, "process-ingest-request", {
      requestFile: ingest.payload.requestFile,
    });
    assert.equal(processed.response.status, 200);
    assert.match(processed.payload.reviewArtifactFile, /^AI_MEMORY\/provenance\/review-artifacts\/.+\.json$/);

    const reviewArtifacts = await postMemory(endpoint, "review-artifacts");
    assert.equal(reviewArtifacts.response.status, 200);
    assert.equal(reviewArtifacts.payload.length, 1);
    assert.equal(reviewArtifacts.payload[0].status, "pending");
    assert.equal(reviewArtifacts.payload[0].boundary.trustedKnowledgeWrite, false);

    const decided = await postMemory(endpoint, "decide-review", {
      artifactFile: processed.payload.reviewArtifactFile,
      actorId: "strategist.core",
      action: "approve",
      notes: "Approved by deterministic service test.",
    });
    assert.equal(decided.response.status, 200);
    assert.equal(decided.payload.status, "approved");

    const promoted = await postMemory(endpoint, "promote-review-artifact", {
      artifactFile: processed.payload.reviewArtifactFile,
      actorId: "strategist.core",
    });
    assert.equal(promoted.response.status, 200);
    assert.equal(promoted.payload.status, "promoted");
    assert.equal(promoted.payload.promotedPage, "AI_MEMORY/wiki/external-note.md");

    const promotedPage = await readFile(join(root, promoted.payload.promotedPage), "utf8");
    assert.match(promotedPage, /# External Note/);
    assert.match(promotedPage, /Source Provenance/);
    assert.equal(
      await readFile(join(root, "INTAKE", "mcp", "obsidian", "note.md"), "utf8"),
      "# External Note\nBridge this into review.",
    );

    const wikiSearch = await postMemory(endpoint, "search", { query: "Bridge this into review", limit: 4, domains: ["AI_MEMORY"] });
    assert.equal(wikiSearch.response.status, 200);
    assert.equal(wikiSearch.payload.results[0].path, "AI_MEMORY/wiki/external-note.md");
    assert.equal(wikiSearch.payload.searchMode, "index-first-wiki");

    const log = await readFile(join(root, "AI_MEMORY", "wiki", "log.md"), "utf8");
    assert.match(log, /trusted_wiki_promote/);
    const index = await readFile(join(root, "AI_MEMORY", "wiki", "index.md"), "utf8");
    assert.match(index, /\[\[external-note\|External Note\]\]/);

    const lint = await postMemory(endpoint, "lint");
    assert.equal(lint.response.status, 200);
    assert.equal(Array.isArray(lint.payload.findings), true);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(root, { recursive: true, force: true });
  }
});

test("Living Archive MCP bridge can use the local memory service as its live backend", async () => {
  const root = await makeMemoryRoot();
  const server = createLivingArchiveMemoryService({ memoryRoot: root, readonly: false });
  const endpoint = await listen(server);

  try {
    const bridge = createLivingArchiveBridge({
      memoryRoot: "",
      memoryServiceUrl: endpoint,
      maxSearchBytes: 1024 * 1024,
      readonly: false,
    });

    const status = await bridge.callTool("living_archive_status");
    assert.equal(status.backend, "host-http");
    assert.equal(status.boundary.directExternalKnowledgeWrites, false);

    const search = await bridge.callTool("living_archive_search", { query: "curated", limit: 2 });
    assert.equal(search.results[0].path, "AI_MEMORY/wiki/system.md");

    const intake = await bridge.callTool("living_archive_write_intake", {
      actorId: "external.agent",
      bucket: "hermes",
      fileName: "hermes-note.md",
      content: "# Hermes Note\nHermes can queue knowledge for trusted review.",
      metadata: { source: "hermes-test" },
    });
    const ingest = await bridge.callTool("living_archive_request_ingest", {
      actorId: "external.agent",
      sourcePath: intake.artifactPath,
      sourceType: "markdown",
      intent: "Review Hermes artifact.",
    });
    const processed = await bridge.callTool("living_archive_process_ingest_request", {
      requestFile: ingest.requestFile,
    });
    await bridge.callTool("living_archive_decide_review", {
      artifactFile: processed.reviewArtifactFile,
      actorId: "strategist.core",
      action: "approve",
    });
    const promoted = await bridge.callTool("living_archive_promote_review_artifact", {
      artifactFile: processed.reviewArtifactFile,
      actorId: "strategist.core",
    });
    assert.equal(promoted.status, "promoted");
    const readBack = await bridge.callTool("living_archive_read", { path: promoted.promotedPage });
    assert.match(readBack.content, /Hermes can queue knowledge/);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(root, { recursive: true, force: true });
  }
});
