import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const resonantExtensionId = "cdpdmmalhmokbfcfgogoepnjplaakgnl";
const cdpTimeoutMs = Number.parseInt(process.env.RESONANTOS_LIVE_CDP_TIMEOUT_MS ?? "12000", 10);

async function freeLoopbackPort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const fixturePort = await freeLoopbackPort();
const debugPort = await freeLoopbackPort();
const bridgePort = await freeLoopbackPort();

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    let timeoutId = null;
    const response = new Promise((resolve, reject) => this.pending.set(id, {
      resolve: (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    }));
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${cdpTimeoutMs}ms.`));
      }, cdpTimeoutMs);
    });
    return Promise.race([response, timeout]);
  }

  close() {
    this.ws?.close();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForDebugPort(getHostLogs = () => "") {
  for (let index = 0; index < 60; index += 1) {
    try {
      return await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json());
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Browser debug port ${debugPort} did not become available. Host logs:\n${getHostLogs()}`);
}

async function browserTargets() {
  return fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json());
}

async function waitForBrowserTarget(predicate, label) {
  for (let index = 0; index < 80; index += 1) {
    const targets = await browserTargets();
    const target = targets.find(predicate);
    if (target?.webSocketDebuggerUrl) return target;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not appear in CDP targets.`);
}

async function openExtensionPanel() {
  await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`chrome-extension://${resonantExtensionId}/src/side-panel.html`)}`,
    { method: "PUT" },
  ).then((response) => response.json());
  return waitForBrowserTarget(
    (target) => target.url === `chrome-extension://${resonantExtensionId}/src/side-panel.html`,
    "ResonantOS side panel extension target"
  );
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "CDP evaluation failed.");
  }
  return result.result.value;
}

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html" });
  response.end("<!doctype html><title>Parallel Scheduler Fixture</title><h1>Parallel Scheduler Fixture</h1>");
});

await new Promise((resolve) => server.listen(fixturePort, "127.0.0.1", resolve));

const profile = path.join(os.tmpdir(), `resonantos-parallel-live-${Date.now()}`);
const host = spawn("node", [
  "browser-first/host/run-browser-first.mjs",
  `--url=http://127.0.0.1:${fixturePort}/`,
  `--profile=${profile}`,
  `--remote-debugging-port=${debugPort}`,
  `--bridge-port=${bridgePort}`,
  "--auto-open-side-panel=false",
], {
  cwd: repoRoot,
  stdio: ["ignore", "pipe", "pipe"],
});

let hostLogs = "";
host.stdout.on("data", (chunk) => { hostLogs += chunk.toString(); });
host.stderr.on("data", (chunk) => { hostLogs += chunk.toString(); });

async function shutdownHost() {
  host.stdout.destroy();
  host.stderr.destroy();
  if (!host.killed) host.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => host.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  spawnSync("pkill", ["-9", "-f", "ResonantBrowserNativeHost"], { stdio: "ignore" });
  spawnSync("pkill", ["-9", "-f", "run-browser-first.mjs"], { stdio: "ignore" });
}

try {
  await waitForDebugPort(() => hostLogs);
  const panelTarget = await openExtensionPanel();
  const panel = new CdpClient(panelTarget.webSocketDebuggerUrl);
  await panel.connect();
  await panel.send("Runtime.enable");
  await panel.send("Page.enable");
  await evaluate(panel, `new Promise((resolve) => {
    const done = () => resolve(Boolean(document.querySelector("#command-input")) && Boolean(chrome?.storage?.local));
    if (document.readyState === "complete") done();
    else addEventListener("load", done, { once: true });
  })`);

  const result = await evaluate(panel, `(async () => {
    const [{ createBrowserJobScheduler }, { browserJobSchedulerState }] = await Promise.all([
      import(chrome.runtime.getURL("src/lib/browser-job-scheduler.js")),
      import(chrome.runtime.getURL("src/lib/browser-job-store.js"))
    ]);
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let jobs = [
      { id: "job-a", goal: "Alpha", status: "queued", pageLock: { tabId: 101, siteKey: "alpha.test", url: "https://alpha.test/" } },
      { id: "job-b", goal: "Beta", status: "queued", pageLock: { tabId: 102, siteKey: "beta.test", url: "https://beta.test/" } },
      { id: "job-c", goal: "Alpha follow-up", status: "queued", pageLock: { tabId: 101, siteKey: "alpha.test", url: "https://alpha.test/next" } }
    ];
    const events = [];
    const store = {
      activateJob: async (id) => {
        events.push(["activate", id]);
      },
      findJob: (id) => jobs.find((job) => job.id === id) ?? null,
      getSchedulerState: (options) => browserJobSchedulerState(jobs, options),
      updateJob: async (id, patch) => {
        let updated = null;
        jobs = jobs.map((job) => {
          if (job.id !== id) return job;
          updated = { ...job, ...patch };
          if (["completed", "blocked", "denied", "cancelled", "failed", "paused"].includes(updated.status)) {
            updated.pageLock = null;
          }
          return updated;
        });
        events.push(["update", id, patch.status ?? "patch"]);
        return updated;
      }
    };
    const scheduler = createBrowserJobScheduler({
      browserJobStore: store,
      maxConcurrent: 2,
      onJobFinished: async (id) => events.push(["finished", id]),
      onJobStarted: async (job) => events.push(["started", job.id]),
      runJob: async (job) => {
        events.push(["run", job.id]);
        await wait(job.id === "job-a" ? 80 : 20);
        return { ok: true, id: job.id };
      }
    });
    scheduler.start();
    const firstTick = await scheduler.tick();
    const during = store.getSchedulerState({ maxConcurrent: 2 });
    await wait(180);
    const after = store.getSchedulerState({ maxConcurrent: 2 });
    return { after, during, events, firstTick, jobs };
  })()`);

  const started = result.events.filter((event) => event[0] === "started").map((event) => event[1]);
  const runs = result.events.filter((event) => event[0] === "run").map((event) => event[1]);
  assert(started.includes("job-a") && started.includes("job-b"), `Expected job-a and job-b to start together: ${JSON.stringify(result, null, 2)}`);
  assert(result.during.lockBlockedQueued.some((job) => job.id === "job-c" && job.blockerId === "job-a"), `Expected job-c to wait on job-a lock: ${JSON.stringify(result, null, 2)}`);
  assert(runs.includes("job-c"), `Expected job-c to auto-drain after job-a completed: ${JSON.stringify(result, null, 2)}`);
  assert(result.jobs.every((job) => job.status === "completed"), `Expected all jobs to complete: ${JSON.stringify(result, null, 2)}`);
  console.log(JSON.stringify({ ok: true, started, runs, finalStatuses: result.jobs.map((job) => [job.id, job.status]) }, null, 2));
  panel.close();
} finally {
  await shutdownHost();
  await new Promise((resolve) => server.close(resolve));
}
