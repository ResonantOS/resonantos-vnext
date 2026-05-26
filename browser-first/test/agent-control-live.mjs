import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const hostBinary = path.join(
  repoRoot,
  "addons",
  "resonant-browser-native",
  "build",
  "ResonantBrowserNativeHost.app",
  "Contents",
  "MacOS",
  "ResonantBrowserNativeHost",
);
const resonantExtensionId = "cdpdmmalhmokbfcfgogoepnjplaakgnl";
const fixturePort = 18997;
const debugPort = 9333;
const bridgePort = 47773;

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
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close() {
    this.ws?.close();
  }
}

const fixtureHtml = `<!doctype html>
<html>
  <head>
    <title>ResonantOS Agent Fixture</title>
    <style>
      body { font-family: sans-serif; min-height: 2400px; padding: 40px; }
      button, input, [contenteditable] { font-size: 20px; margin: 10px; padding: 12px; }
      #status { position: fixed; top: 20px; right: 20px; background: #0b6; padding: 10px; }
      #doc { border: 2px solid #999; min-height: 80px; }
    </style>
  </head>
  <body>
    <h1>Agent Control Fixture</h1>
    <p>This page verifies safe browser control, document-style typing, and approval gates.</p>
    <iframe title="Booking calendar" src="/calendar" width="680" height="260"></iframe>
    <button id="safe">Safe Details</button>
    <button id="cart">Add to Cart</button>
    <form id="public">
      <input name="search" aria-label="Search field" placeholder="Search field">
      <button id="submit" type="submit">Submit public form</button>
    </form>
    <section id="doc" contenteditable="true" aria-label="Draft document">Draft starts here.</section>
    <button id="wallet" type="button">Connect Wallet</button>
    <div id="status">idle</div>
    <div id="details">details closed</div>
    <script>
      window.__submitted = false;
      document.querySelector("#safe").addEventListener("click", () => {
        document.querySelector("#details").textContent = "safe details opened";
        document.querySelector("#status").textContent = "clicked";
      });
      document.querySelector("#public").addEventListener("submit", (event) => {
        event.preventDefault();
        window.__submitted = true;
        document.querySelector("#status").textContent = "submitted";
      });
      document.querySelector("#cart").addEventListener("click", () => {
        document.body.dataset.cart = "added";
        document.querySelector("#status").textContent = "cart-added";
      });
      document.querySelector("#wallet").addEventListener("click", () => {
        document.querySelector("#status").textContent = "wallet-clicked";
      });
    </script>
  </body>
</html>`;

const calendarHtml = `<!doctype html>
<html>
  <head><title>Calendar Fixture</title></head>
  <body>
    <h2>Booking calendar frame</h2>
    <p>Available appointment: Tuesday 10:00.</p>
    <button id="slot">Tuesday 10:00</button>
    <input aria-label="Calendar guest name" placeholder="Calendar guest name">
    <script>
      document.querySelector("#slot").addEventListener("click", () => {
        document.body.dataset.slot = "Tuesday 10:00";
      });
    </script>
  </body>
</html>`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForDebugPort() {
  for (let index = 0; index < 60; index += 1) {
    try {
      return await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json());
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("Browser debug port did not become available.");
}

async function openExtensionPanel() {
  return fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`chrome-extension://${resonantExtensionId}/src/side-panel.html`)}`,
    { method: "PUT" },
  ).then((response) => response.json());
}

async function browserTargets() {
  return fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json());
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "CDP evaluation failed.");
  }
  return result;
}

async function waitForPanelText(panel, pattern, label) {
  for (let index = 0; index < 100; index += 1) {
    const text = (await evaluate(panel, "document.body.innerText")).result.value;
    if (pattern.test(text)) return text;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const text = (await evaluate(panel, "document.body.innerText")).result.value;
  throw new Error(`${label} did not appear. Panel text:\n${text}`);
}

async function submitControlCommand(panel, command) {
  const expression = `(() => {
    const input = document.querySelector("#command-input");
    input.value = ${JSON.stringify(command)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#command-form").requestSubmit();
  })()`;
  await evaluate(panel, expression);
}

async function waitForComposerReady(panel, label) {
  for (let index = 0; index < 100; index += 1) {
    const state = (await evaluate(panel, `({
      disabled: document.querySelector("#command-input").disabled,
      connection: document.querySelector("#connection-line").textContent
    })`)).result.value;
    if (!state.disabled && /Ready|Needs approval|Denied|Control blocked/.test(state.connection)) return state;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const text = (await evaluate(panel, "document.body.innerText")).result.value;
  throw new Error(`${label} did not return composer readiness. Panel text:\n${text}`);
}

const server = http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html" });
  response.end(request.url === "/calendar" ? calendarHtml : fixtureHtml);
});

await new Promise((resolve) => server.listen(fixturePort, "127.0.0.1", resolve));

const profile = path.join(os.tmpdir(), `resonantos-agent-live-${Date.now()}`);
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

try {
  await waitForDebugPort();
  const panelTarget = await openExtensionPanel();
  const targets = await browserTargets();
  const fixtureTarget = targets.find((target) => target.url.startsWith(`http://127.0.0.1:${fixturePort}/`));
  assert(fixtureTarget, `Fixture page target not found. Host logs:\n${hostLogs}`);

  const panel = new CdpClient(panelTarget.webSocketDebuggerUrl);
  const page = new CdpClient(fixtureTarget.webSocketDebuggerUrl);
  await panel.connect();
  await page.connect();
  await panel.send("Runtime.enable");
  await page.send("Runtime.enable");
  await panel.send("Page.enable");
  await page.send("Page.enable");
  await evaluate(panel, `new Promise((resolve) => {
    const done = () => resolve(Boolean(document.querySelector("#command-input")));
    if (document.readyState === "complete") done();
    else addEventListener("load", done, { once: true });
  })`);

  await evaluate(panel, `chrome.storage.local.clear(); document.querySelector("#transcript").replaceChildren();`);
  await evaluate(panel, `(() => { globalThis.__resonantosNextActionOverride = async ({ snapshot, history }) => ({
    source: "test-next-action",
    thought: "Verify iframe context is visible to the browser-control loop.",
    status: snapshot?.text?.includes("Booking calendar frame") ? (history.length ? "done" : "continue") : "blocked",
    action: snapshot?.text?.includes("Booking calendar frame") && !history.length ? { type: "read" } : null,
    approvalReason: snapshot?.text?.includes("Booking calendar frame") ? null : "Iframe booking context was not visible.",
    doneSummary: history.length ? "Iframe booking context was observed." : null
  }); return true; })()`);
  await submitControlCommand(panel, `book a call now`);
  const iframePanelText = await waitForPanelText(panel, /Booking calendar frame|Iframe booking context was not visible/, "iframe context read");
  assert(!/Iframe booking context was not visible/.test(iframePanelText), "Agent planner could not see iframe booking context.");
  await waitForComposerReady(panel, "iframe context read");

  await evaluate(panel, `(() => { globalThis.__resonantosNextActionOverride = async ({ history }) => ({
    source: "test-next-action",
    thought: history.length ? "The appointment slot is selected." : "Select the visible appointment slot inside the booking frame.",
    status: history.length ? "done" : "continue",
    action: history.length ? null : { type: "click", text: "Tuesday 10:00" },
    approvalReason: null,
    doneSummary: history.length ? "Selected the visible Tuesday 10:00 appointment slot." : null
  }); return true; })()`);
  await submitControlCommand(panel, `Can you arrange a call from this booking page?`);
  let bookingState = null;
  for (let index = 0; index < 80; index += 1) {
    bookingState = (await evaluate(page, `({
      slot: document.querySelector("iframe").contentDocument.body.dataset.slot || "",
      status: document.querySelector("#status").textContent
    })`)).result.value;
    if (bookingState.slot === "Tuesday 10:00") break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(bookingState.slot === "Tuesday 10:00", `Variant booking prompt failed: ${JSON.stringify(bookingState)}`);
  await waitForComposerReady(panel, "variant booking prompt");

  await evaluate(panel, `(() => { globalThis.__resonantosNextActionOverride = async ({ snapshot, history }) => {
    const cartRef = snapshot?.controls?.find((control) => control.text === "Add to Cart")?.ref;
    if (!history.length) {
      return {
        source: "test-next-action",
        thought: "Use the observed cart button ref.",
        status: cartRef ? "continue" : "blocked",
        action: cartRef ? { type: "click", ref: cartRef, text: "Add to Cart" } : null,
        approvalReason: cartRef ? null : "Cart button ref was not visible.",
        doneSummary: null
      };
    }
    return {
      source: "test-next-action",
      thought: "Cart action is complete.",
      status: "done",
      action: null,
      approvalReason: null,
      doneSummary: "Added the visible item to cart."
    };
  }; return true; })()`);
  await submitControlCommand(panel, `go to amazon and find me some pringles then add them to the cart`);
  let cartState = null;
  for (let index = 0; index < 80; index += 1) {
    cartState = (await evaluate(page, `({
      cart: document.body.dataset.cart || "",
      status: document.querySelector("#status").textContent
    })`)).result.value;
    if (cartState.cart === "added") break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(cartState.cart === "added", `Amazon-style cart prompt failed: ${JSON.stringify(cartState)}`);
  await waitForComposerReady(panel, "amazon cart prompt");

  await evaluate(panel, `(() => { globalThis.__resonantosNextActionOverride = async ({ snapshot, history }) => {
    const safeRef = snapshot?.controls?.find((control) => control.text === "Safe Details")?.ref;
    const searchRef = snapshot?.fields?.find((field) => field.label === "Search field")?.ref;
    const actions = [
      { type: "read" },
      { type: "click", ref: safeRef, text: "Safe Details" },
      { type: "type", ref: searchRef, text: "find resonantos", submit: false },
      { type: "scroll", direction: "down" }
    ];
    const action = actions[history.length] ?? null;
    return {
      source: "test-next-action",
      thought: action ? "Execute next safe fixture action." : "Safe fixture actions are complete.",
      status: action && (action.type !== "click" || action.ref) && (action.type !== "type" || action.ref) ? "continue" : action ? "blocked" : "done",
      action,
      approvalReason: action ? "Required element ref was not present in the observation." : null,
      doneSummary: action ? null : "Read, clicked, typed, and scrolled safely."
    };
  }; return true; })()`);
  await submitControlCommand(panel, `/control read this page, click "Safe Details", type "find resonantos", scroll down`);
  let safeState = null;
  for (let index = 0; index < 100; index += 1) {
    safeState = (await evaluate(page, `({
      details: document.querySelector("#details").textContent,
      input: document.querySelector("input[name='search']").value,
      scrollY: window.scrollY,
      submitted: window.__submitted,
      doc: document.querySelector("#doc").textContent
    })`)).result.value;
    if (safeState.details === "safe details opened" && safeState.input === "find resonantos" && safeState.scrollY > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await waitForPanelText(panel, /Agent Control Mode completed\./, "safe control completion");
  await waitForComposerReady(panel, "safe control");
  const safePanelText = (await evaluate(panel, "document.body.innerText")).result.value;
  assert(safeState.details === "safe details opened", `Safe click failed: ${JSON.stringify(safeState)}\nPanel:\n${safePanelText}`);
  assert(safeState.input === "find resonantos", `Typing failed: ${JSON.stringify(safeState)}`);
  assert(safeState.scrollY > 0, `Scroll failed: ${JSON.stringify(safeState)}`);
  assert(!safeState.submitted, `Unexpected public submit: ${JSON.stringify(safeState)}`);

  await evaluate(panel, `(() => { globalThis.__resonantosNextActionOverride = async ({ history }) => ({
    source: "test-next-action",
    thought: history.length ? "Document typing is complete." : "Type into a document-like contenteditable region.",
    status: history.length ? "done" : "continue",
    action: history.length ? null : { type: "type", text: "ResonantOS wrote this draft.", field: "Draft document", submit: false },
    approvalReason: null,
    doneSummary: history.length ? "Document region updated." : null
  }); return true; })()`);
  await submitControlCommand(panel, `/control type into the draft document`);
  let documentState = null;
  for (let index = 0; index < 80; index += 1) {
    documentState = (await evaluate(page, `({ doc: document.querySelector("#doc").textContent })`)).result.value;
    if (documentState.doc === "ResonantOS wrote this draft.") break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(documentState.doc === "ResonantOS wrote this draft.", `Document-like typing failed: ${JSON.stringify(documentState)}`);
  await waitForComposerReady(panel, "document typing");

  await evaluate(panel, `(() => { globalThis.__resonantosNextActionOverride = async () => ({
    source: "test-next-action",
    thought: "Attempt unsafe submit; content script must block this.",
    status: "continue",
    action: { type: "click", text: "Submit public form" },
    approvalReason: null,
    doneSummary: null
  }); return true; })()`);
  await submitControlCommand(panel, `/control click "Submit public form"`);
  await waitForPanelText(panel, /Agent Control Mode needs approval|restricted click|requires human approval/i, "approval boundary");
  const blockedState = (await evaluate(page, `({ submitted: window.__submitted, status: document.querySelector("#status").textContent })`)).result.value;
  assert(!blockedState.submitted, `Approval gate failed before approval: ${JSON.stringify(blockedState)}`);

  await evaluate(panel, `(() => { globalThis.__resonantosNextActionOverride = async () => ({
    source: "test-next-action",
    thought: "Wallet action must stop before execution.",
    status: "needs_approval",
    action: null,
    approvalReason: "Wallet connection requires human confirmation.",
    doneSummary: null
  }); return true; })()`);
  await submitControlCommand(panel, `/control connect wallet`);
  await waitForPanelText(panel, /Wallet connection requires human confirmation/, "wallet approval boundary");
  const approvalState = (await evaluate(page, `({ submitted: window.__submitted, status: document.querySelector("#status").textContent })`)).result.value;

  const panelShot = await panel.send("Page.captureScreenshot", { format: "png" });
  const pageShot = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile("/tmp/resonantos-agent-control-live-panel.png", Buffer.from(panelShot.data, "base64"));
  await writeFile("/tmp/resonantos-agent-control-live-page.png", Buffer.from(pageShot.data, "base64"));

  console.log(JSON.stringify({
    ok: true,
    iframeContextVisible: true,
    bookingState,
    cartState,
    safeState,
    documentState,
    blockedState,
    approvalState,
    screenshots: [
      "/tmp/resonantos-agent-control-live-panel.png",
      "/tmp/resonantos-agent-control-live-page.png",
    ],
  }, null, 2));

  panel.close();
  page.close();
} finally {
  host.kill("SIGTERM");
  spawnSync("pkill", ["-9", "-f", "ResonantBrowserNativeHost"], { stdio: "ignore" });
  server.close();
}
