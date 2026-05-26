import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import process from "node:process";

const HOST = "127.0.0.1";
const PORT = 1430;
const HEALTH_PATH = "/";
const STARTUP_TIMEOUT_MS = 20_000;

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(1500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const fail = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", fail);
    socket.once("timeout", fail);
  });
}

function isHttpReady(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 500));
    });
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function waitUntilReady(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isHttpReady(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

const devUrl = `http://${HOST}:${PORT}${HEALTH_PATH}`;

if (await isPortOpen(HOST, PORT)) {
  if (await isHttpReady(devUrl)) {
    console.log(`Reusing existing Vite dev server on ${devUrl}`);
    process.exit(0);
  }
  console.error(`Port ${PORT} is occupied, but no healthy Vite server responded at ${devUrl}.`);
  process.exit(1);
}

const child = spawn("npm", ["run", "dev"], {
  cwd: process.cwd(),
  stdio: "ignore",
  detached: true,
  shell: true,
});

child.unref();

if (await waitUntilReady(devUrl, STARTUP_TIMEOUT_MS)) {
  console.log(`Started Vite dev server on ${devUrl}`);
  process.exit(0);
}

console.error(`Timed out waiting for Vite dev server on ${devUrl}`);
process.exit(1);
