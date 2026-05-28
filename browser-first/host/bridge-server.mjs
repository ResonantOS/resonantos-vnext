import { writeFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";
import path from "node:path";

const bridgeTokenHeader = "x-resonantos-bridge-token";
const bridgeTokenHeaderName = "X-ResonantOS-Bridge-Token";

export function createBridgeToken() {
  return randomBytes(32).toString("base64url");
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""));
  const rightBuffer = Buffer.from(String(right ?? ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorizedBridgeRequest(request, bridgeToken) {
  return constantTimeEqual(request.headers[bridgeTokenHeader], bridgeToken);
}

function writeJson(response, status, payload, extensionOrigin) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": extensionOrigin,
    "Access-Control-Allow-Headers": `Content-Type, ${bridgeTokenHeaderName}`,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body.trim() ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function routeKey(method, requestUrl) {
  const pathname = new URL(requestUrl ?? "/", "http://127.0.0.1").pathname;
  return `${method ?? "GET"} ${pathname}`;
}

function compileRoutes(routes) {
  return new Map(routes.map((route) => [
    routeKey(route.method, route.path),
    route,
  ]));
}

export async function writeBridgeConfig({ extensionRoot, bridgePort, bridgeToken }) {
  const configPath = path.join(extensionRoot, "src", "bridge-config.generated.js");
  const config = {
    bridgeUrl: `http://127.0.0.1:${bridgePort}`,
    bridgeToken,
  };
  await writeFile(
    configPath,
    `globalThis.__RESONANTOS_BRIDGE_CONFIG__ = Object.freeze(${JSON.stringify(config)});\n`,
    { mode: 0o600 },
  );
  return configPath;
}

export async function startBridgeServer({ port, bridgeToken, extensionOrigin, routes }) {
  const routeTable = compileRoutes(routes);
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "OPTIONS") {
        writeJson(response, 204, {}, extensionOrigin);
        return;
      }
      if (!isAuthorizedBridgeRequest(request, bridgeToken)) {
        writeJson(response, 401, { ok: false, error: "Unauthorized browser-first bridge request." }, extensionOrigin);
        return;
      }

      const route = routeTable.get(routeKey(request.method, request.url));
      if (!route) {
        writeJson(response, 404, { ok: false, error: "Unknown browser-first bridge route." }, extensionOrigin);
        return;
      }

      const payload = route.method === "POST" ? await readJsonBody(request) : {};
      const result = await route.handler(payload, request);
      writeJson(response, 200, { ok: true, ...result }, extensionOrigin);
    } catch (error) {
      writeJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }, extensionOrigin);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

export async function runBridgeAuthSelfTest({ port, bridgeToken, extensionOrigin }) {
  const server = await startBridgeServer({
    port,
    bridgeToken,
    extensionOrigin,
    routes: [{ method: "GET", path: "/status", handler: async () => ({ bridge: "self-test" }) }],
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const unauthorized = await fetch(`http://127.0.0.1:${actualPort}/status`);
  const wrongToken = await fetch(`http://127.0.0.1:${actualPort}/status`, {
    headers: { [bridgeTokenHeaderName]: "wrong-token" },
  });
  const authorized = await fetch(`http://127.0.0.1:${actualPort}/status`, {
    headers: { [bridgeTokenHeaderName]: bridgeToken },
  });
  server.close();
  return {
    ok: unauthorized.status === 401 && wrongToken.status === 401 && authorized.ok,
    unauthorizedStatus: unauthorized.status,
    wrongTokenStatus: wrongToken.status,
    authorizedStatus: authorized.status,
  };
}
