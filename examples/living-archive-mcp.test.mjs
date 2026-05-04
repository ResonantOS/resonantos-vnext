// Intent citation: docs/architecture/ADR-029-living-archive-mcp-bridge.md

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import test from "node:test";
import assert from "node:assert/strict";
import { createLivingArchiveBridge, handleJsonRpc } from "./living-archive-mcp.mjs";

const makeMemoryRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), "resonantos-memory-mcp-"));
  await mkdir(join(root, "HUMAN_KNOWLEDGE", "sources"), { recursive: true });
  await mkdir(join(root, "AI_MEMORY", "wiki"), { recursive: true });
  await writeFile(
    join(root, "HUMAN_KNOWLEDGE", "sources", "oracle.md"),
    "---\nresonantos.ownership: human\n---\n# Portable Oracle\nThis note explains portable ResonantOS memory.",
    "utf8",
  );
  await writeFile(
    join(root, "AI_MEMORY", "wiki", "architecture.md"),
    "# Architecture Memory\nLiving Archive uses file truth with a local index.",
    "utf8",
  );
  return root;
};

test("Living Archive MCP bridge exposes scoped status, search, read, intake, and ingest request tools", async () => {
  const root = await makeMemoryRoot();
  try {
    const bridge = createLivingArchiveBridge({ memoryRoot: root, maxSearchBytes: 1024 * 1024, readonly: false });

    const tools = await handleJsonRpc(bridge, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    assert.equal(tools.result.tools.some((tool) => tool.name === "living_archive_search"), true);

    const status = await bridge.callTool("living_archive_status");
    assert.equal(status.status, "ready");
    assert.equal(status.boundary.trustedKnowledgeWrites, false);

    const search = await bridge.callTool("living_archive_search", { query: "portable", limit: 5 });
    assert.equal(search.results.length, 1);
    assert.equal(search.results[0].path, "HUMAN_KNOWLEDGE/sources/oracle.md");

    const document = await bridge.callTool("living_archive_read", {
      path: "HUMAN_KNOWLEDGE/sources/oracle.md",
    });
    assert.equal(document.title, "Portable Oracle");
    assert.equal(document.frontmatter["resonantos.ownership"], "human");

    await assert.rejects(
      () => bridge.callTool("living_archive_read", { path: "../Secrets/plaintext.txt" }),
      /escapes the configured Living Archive memory root/,
    );

    const intake = await bridge.callTool("living_archive_write_intake", {
      actorId: "external.agent",
      bucket: "community",
      fileName: "artifact.md",
      content: "# External Artifact",
      metadata: { source: "test" },
    });
    assert.equal(intake.artifactPath, "INTAKE/mcp/community/artifact.md");

    const ingest = await bridge.callTool("living_archive_request_ingest", {
      actorId: "external.agent",
      sourcePath: intake.artifactPath,
      sourceType: "markdown",
      intent: "Review external artifact.",
    });
    assert.match(ingest.requestFile, /^INTAKE\/review-queue\/.+\.json$/);

    const queued = JSON.parse(await readFile(join(root, ingest.requestFile), "utf8"));
    assert.equal(queued.boundary.trustedKnowledgeWrite, false);
    assert.equal(queued.boundary.requiresStrategistOwnedIngest, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Living Archive MCP bridge proxies full V1 memory-provider operations through live HTTP backend", async () => {
  const calls = [];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const operation = request.url?.replace(/^\/memory\//, "") ?? "";
      const input = body ? JSON.parse(body) : {};
      calls.push({ operation, input });
      const payloads = {
        status: {
          status: "ready",
          mode: "live",
          managedRoot: "/portable/Memory",
          recentActivity: [],
        },
        search: { query: input.query, pages: [{ title: "Live Memory", filePath: "live://memory" }], sources: [] },
        read: { path: input.path, title: "Live Memory", frontmatter: {}, content: "Live content" },
        "intake-write": { actorId: input.actorId, bucket: input.bucket, artifactPath: "live://intake/artifact.md" },
        "ingest-request": { requestFile: "live://review/request.json", queuedAt: "2026-05-03T00:00:00.000Z" },
        "review-queue": [{ requestFile: "live://review/request.json" }],
        "review-artifacts": [{ artifactFile: "live://review/artifact.json", decision: { status: "pending" } }],
        "process-ingest-request": { requestFile: input.requestFile, reviewArtifactFile: "live://review/artifact.json" },
        "decide-review": { artifactFile: input.artifactFile, status: input.action === "approve" ? "approved" : input.action },
        "promote-review-artifact": { artifactFile: input.artifactFile, pagesWritten: [{ title: "Live Memory" }] },
        "maintenance-cycle": { processed: [], promoted: [], errors: [] },
        "background-cycle": { queuedRequestFiles: [], skippedQueueSources: [] },
        lint: { findings: [] },
        "semantic-lint": { findings: [], repairRequestFiles: [] },
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payloads[operation] ?? { operation, input }));
    });
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  const endpoint = `http://127.0.0.1:${address.port}`;

  try {
    const bridge = createLivingArchiveBridge({ memoryRoot: "", memoryServiceUrl: endpoint, maxSearchBytes: 1024, readonly: false });
    const status = await bridge.callTool("living_archive_status");
    assert.equal(status.backend, "host-http");
    assert.equal(status.boundary.trustedKnowledgeWrites, "host-mediated-review-only");

    await bridge.callTool("living_archive_search", { query: "live", limit: 1 });
    await bridge.callTool("living_archive_read", { path: "live://memory" });
    await bridge.callTool("living_archive_write_intake", {
      actorId: "external.agent",
      bucket: "live",
      fileName: "artifact.md",
      content: "# Live",
    });
    await bridge.callTool("living_archive_request_ingest", {
      actorId: "external.agent",
      sourcePath: "live://intake/artifact.md",
      sourceType: "markdown",
      intent: "review",
    });
    await bridge.callTool("living_archive_review_queue");
    await bridge.callTool("living_archive_review_artifacts");
    await bridge.callTool("living_archive_process_ingest_request", { requestFile: "live://review/request.json" });
    await bridge.callTool("living_archive_decide_review", {
      artifactFile: "live://review/artifact.json",
      actorId: "strategist.core",
      action: "approve",
    });
    await bridge.callTool("living_archive_promote_review_artifact", {
      artifactFile: "live://review/artifact.json",
      actorId: "strategist.core",
    });
    await bridge.callTool("living_archive_maintenance_cycle", { maxRequests: 1 });
    await bridge.callTool("living_archive_background_cycle", { maxRequests: 1 });
    await bridge.callTool("living_archive_lint");
    await bridge.callTool("living_archive_semantic_lint", { maxCandidates: 1 });

    assert.deepEqual(
      calls.map((call) => call.operation),
      [
        "status",
        "search",
        "read",
        "intake-write",
        "ingest-request",
        "review-queue",
        "review-artifacts",
        "process-ingest-request",
        "decide-review",
        "promote-review-artifact",
        "maintenance-cycle",
        "background-cycle",
        "lint",
        "semantic-lint",
      ],
    );
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("Living Archive MCP stdio server follows initialize, tools/list, and tools/call JSON-RPC flow", async () => {
  const root = await makeMemoryRoot();
  const serverPath = resolve("examples", "living-archive-mcp.mjs");
  const child = spawn(process.execPath, [serverPath, "--memory-root", root], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const responses = [];
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        responses.push(JSON.parse(line));
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });

  const send = (message) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "node-test", version: "0.1.0" },
      },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "living_archive_search",
        arguments: { query: "architecture", limit: 2 },
      },
    });

    const deadline = Date.now() + 3000;
    while (responses.length < 3 && Date.now() < deadline) {
      await new Promise((resolveReady) => setTimeout(resolveReady, 25));
    }

    assert.equal(responses[0].result.serverInfo.name, "resonantos-living-archive-mcp");
    assert.equal(responses[1].result.tools.some((tool) => tool.name === "living_archive_read"), true);
    assert.equal(responses[2].result.structuredContent.results[0].path, "AI_MEMORY/wiki/architecture.md");
  } finally {
    child.kill();
    await once(child, "exit");
    await rm(root, { recursive: true, force: true });
  }
});
