#!/usr/bin/env node
// Intent citation: docs/architecture/ADR-029-living-archive-mcp-bridge.md

import { createServer } from "node:http";
import { resolve } from "node:path";
import { createLivingArchiveBridge } from "./living-archive-mcp.mjs";

const defaultPort = 4888;
const maxBodyBytes = 5 * 1024 * 1024;

const parseArgs = (argv = process.argv.slice(2), env = process.env) => {
  let memoryRoot = env.RESONANTOS_MEMORY_ROOT ?? "";
  let port = Number.parseInt(env.RESONANTOS_MEMORY_SERVICE_PORT ?? String(defaultPort), 10);
  let host = env.RESONANTOS_MEMORY_SERVICE_HOST ?? "127.0.0.1";
  let readonly = env.RESONANTOS_MCP_READONLY === "1" || env.RESONANTOS_MEMORY_SERVICE_READONLY === "1";
  let maxSearchBytes = Number.parseInt(env.RESONANTOS_MCP_MAX_SEARCH_BYTES ?? "1048576", 10);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--memory-root") {
      memoryRoot = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--port") {
      port = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
      continue;
    }
    if (arg === "--host") {
      host = argv[index + 1] ?? host;
      index += 1;
      continue;
    }
    if (arg === "--max-search-bytes") {
      maxSearchBytes = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
      continue;
    }
    if (arg === "--readonly") {
      readonly = true;
    }
  }

  return {
    memoryRoot: memoryRoot ? resolve(memoryRoot) : "",
    port: Number.isFinite(port) && port >= 0 ? port : defaultPort,
    host: host || "127.0.0.1",
    readonly,
    maxSearchBytes: Number.isFinite(maxSearchBytes) && maxSearchBytes > 0 ? maxSearchBytes : 1_048_576,
  };
};

export const memoryOperationToTool = {
  status: "living_archive_status",
  search: "living_archive_search",
  read: "living_archive_read",
  "intake-write": "living_archive_write_intake",
  "ingest-request": "living_archive_request_ingest",
  "review-queue": "living_archive_review_queue",
  "review-artifacts": "living_archive_review_artifacts",
  lint: "living_archive_lint",
};

export const providerOnlyOperations = new Set([
  "process-ingest-request",
  "decide-review",
  "promote-review-artifact",
  "maintenance-cycle",
  "background-cycle",
  "semantic-lint",
]);

const jsonResponse = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "access-control-allow-origin": "http://localhost",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, accept",
    "content-type": "application/json",
  });
  response.end(JSON.stringify(payload));
};

const readJsonBody = (request) =>
  new Promise((resolveBody, rejectBody) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBodyBytes) {
        rejectBody(new Error("Request body exceeds the Living Archive memory service limit."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(body));
      } catch {
        rejectBody(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", rejectBody);
  });

export const createLivingArchiveMemoryService = (options = {}) => {
  const config = {
    memoryRoot: options.memoryRoot ? resolve(options.memoryRoot) : "",
    readonly: Boolean(options.readonly),
    maxSearchBytes: options.maxSearchBytes ?? 1_048_576,
  };
  const bridge = createLivingArchiveBridge(config);

  return createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      jsonResponse(response, 204, {});
      return;
    }
    if (request.method !== "POST") {
      jsonResponse(response, 405, { error: "Living Archive memory service accepts POST requests only." });
      return;
    }

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const match = /^\/memory\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      jsonResponse(response, 404, { error: "Unknown Living Archive memory service route." });
      return;
    }

    const operation = decodeURIComponent(match[1]);
    if (providerOnlyOperations.has(operation)) {
      jsonResponse(response, 501, {
        error:
          `${operation} requires the full ResonantOS host provider. ` +
          "This local memory service exposes portable read, intake, review listing, and deterministic lint only.",
        operation,
        boundary: {
          trustedKnowledgeWrites: false,
          reason: "Trusted wiki writes require Strategist-owned ingest/review inside the desktop host.",
        },
      });
      return;
    }

    const toolName = memoryOperationToTool[operation];
    if (!toolName) {
      jsonResponse(response, 404, { error: `Unsupported Living Archive memory operation: ${operation}.` });
      return;
    }

    try {
      const input = await readJsonBody(request);
      const result = await bridge.callTool(toolName, input);
      jsonResponse(response, 200, result);
    } catch (error) {
      jsonResponse(response, 400, {
        error: error instanceof Error ? error.message : "Living Archive memory operation failed.",
        operation,
      });
    }
  });
};

const main = async () => {
  const config = parseArgs();
  const server = createLivingArchiveMemoryService(config);
  await new Promise((resolveListen) => server.listen(config.port, config.host, resolveListen));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  process.stderr.write(
    JSON.stringify(
      {
        service: "resonantos-living-archive-memory-service",
        status: "listening",
        endpoint: `http://${config.host}:${port}`,
        memoryRoot: config.memoryRoot,
        readonly: config.readonly,
      },
      null,
      2,
    ) + "\n",
  );
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exitCode = 1;
  });
}
