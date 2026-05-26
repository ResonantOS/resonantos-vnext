#!/usr/bin/env node
// Intent citation: docs/architecture/ADR-026-minimal-kernel-replaceable-default-addons.md

import { createServer } from "node:http";

const port = Number.parseInt(process.env.REFERENCE_MEMORY_PORT ?? "4888", 10);

const pages = [
  {
    pageId: "reference-memory-index",
    title: "Reference Memory Index",
    pageType: "summary",
    filePath: "reference://memory/index",
    stage: "reference",
    updated: new Date(0).toISOString(),
    score: 1,
    snippet: "Reference Memory is a minimal third-party memory provider used to test replaceable memory.",
    content:
      "Reference Memory proves ResonantOS can route memory search, reads, intake, ingest requests, and review calls through a non-Living Archive provider.",
  },
];

const json = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, accept",
  });
  response.end(JSON.stringify(payload));
};

const readBody = async (request) =>
  new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });

const handlers = {
  status: () => ({
    status: "ready",
    vaultRoot: "reference://memory",
    managedRoot: "reference://memory",
    wikiRoot: "reference://memory/wiki",
    dbPath: "reference://memory/index",
    stats: {
      pagesTotal: pages.length,
      pagesByType: { summary: pages.length },
      linksTotal: 0,
      sourcesTotal: 0,
      sourcesUnprocessed: 0,
      activity7d: 0,
    },
    recentActivity: [],
    warnings: [],
  }),
  search: ({ query = "", limit = 12 }) => ({
    query,
    pages: pages
      .filter((page) => `${page.title} ${page.content}`.toLowerCase().includes(String(query).toLowerCase()))
      .slice(0, limit)
      .map(({ content: _content, ...page }) => page),
    sources: [],
  }),
  read: ({ path }) => {
    const page = pages.find((item) => item.filePath === path);
    if (!page) {
      throw new Error(`Reference Memory page not found: ${path}`);
    }
    return {
      path: page.filePath,
      title: page.title,
      docType: page.pageType,
      frontmatter: { provider: "reference-memory" },
      content: page.content,
    };
  },
  "intake-write": ({ actorId = "unknown", bucket = "default", fileName = "artifact.md" }) => ({
    actorId,
    bucket,
    artifactPath: `reference://intake/${bucket}/${fileName}`,
    metadataPath: null,
  }),
  "ingest-request": () => ({
    requestFile: `reference://review/requests/${Date.now()}.json`,
    queuedAt: new Date().toISOString(),
  }),
  "review-queue": () => [],
  "review-artifacts": () => [],
  "process-ingest-request": ({ requestFile }) => ({
    requestFile,
    archivedRequestFile: requestFile,
    reviewArtifactFile: `reference://review/artifacts/${Date.now()}.json`,
    summary: "Reference Memory processed the request as a no-op test artifact.",
    checkedAt: new Date().toISOString(),
    reviewArtifact: {
      artifactFile: `reference://review/artifacts/${Date.now()}.json`,
      checkedAt: new Date().toISOString(),
      requestFile,
      sourcePath: "reference://source",
      sourceType: "reference",
      sourceRole: null,
      intent: "test",
      providerId: "reference-memory",
      model: "reference-memory",
      summary: "No-op reference review.",
      confidence: "high",
      doctrineSensitivity: "low",
      recommendedTier: "auto-approve",
      recommendationReason: "Reference test only.",
      proposedPages: [],
      decision: {
        status: "pending",
        action: null,
        actorId: null,
        decidedAt: null,
        tierApplied: null,
        notes: null,
      },
    },
  }),
  "maintenance-cycle": () => ({
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    processed: [],
    promoted: [],
    navigation: {
      refreshedAt: new Date().toISOString(),
      indexPath: "reference://memory/wiki/index.md",
      logPath: "reference://memory/wiki/log.md",
      pagesIndexed: pages.length,
      activityEntries: 0,
    },
    lint: {
      checkedAt: new Date().toISOString(),
      reportPath: "reference://memory/review/lint/latest.md",
      pagesChecked: pages.length,
      sourcesChecked: 0,
      findings: [],
    },
    skipped: [],
    errors: [],
  }),
  "background-cycle": () => ({
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    scan: {
      scannedAt: new Date().toISOString(),
      rootsScanned: 0,
      filesSeen: 0,
      newFiles: 0,
      changedFiles: 0,
      unchangedFiles: 0,
      skippedFiles: 0,
      records: [],
      indexPath: "reference://memory/source-watch-index.json",
    },
    queuedRequestFiles: [],
    skippedQueueSources: [],
    maintenance: operations["maintenance-cycle"](),
  }),
  lint: () => ({
    checkedAt: new Date().toISOString(),
    reportPath: "reference://memory/review/lint/latest.md",
    pagesChecked: pages.length,
    sourcesChecked: 0,
    findings: [],
  }),
  "semantic-lint": () => ({
    checkedAt: new Date().toISOString(),
    reportPath: "reference://memory/review/lint/semantic-latest.md",
    providerId: "reference-memory",
    model: "reference-memory",
    sourceLintReportPath: "reference://memory/review/lint/latest.md",
    candidatesReviewed: 0,
    findings: [],
    summary: "Reference Memory semantic lint is a no-op.",
    repairRequestFiles: [],
  }),
  "decide-review": ({ artifactFile, action, actorId }) => ({
    artifactFile,
    status: action === "approve" ? "approved" : action,
    action,
    actorId,
    decidedAt: new Date().toISOString(),
    tierApplied: "reference",
    summary: "Reference Memory recorded a no-op decision.",
  }),
  "promote-review-artifact": ({ artifactFile, actorId }) => ({
    artifactFile,
    promotedAt: new Date().toISOString(),
    actorId,
    pagesWritten: [],
    skippedPages: [],
  }),
};

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    json(response, 204, {});
    return;
  }
  if (request.method !== "POST" || !request.url?.startsWith("/memory/")) {
    json(response, 404, { error: "Use POST /memory/{operation}." });
    return;
  }
  const operation = request.url.slice("/memory/".length);
  const handler = handlers[operation];
  if (!handler) {
    json(response, 404, { error: `Unknown memory operation: ${operation}` });
    return;
  }
  try {
    json(response, 200, handler(await readBody(request)));
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : "Reference Memory error." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Reference Memory service listening on http://127.0.0.1:${port}`);
});
