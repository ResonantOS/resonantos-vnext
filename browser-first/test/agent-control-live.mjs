import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

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
const cdpTimeoutMs = Number.parseInt(process.env.RESONANTOS_LIVE_CDP_TIMEOUT_MS ?? "10000", 10);

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

async function captureScreenshotArtifact(client, filePath) {
  const captureVisibleViewport = async () => {
    await client.send("Page.bringToFront").catch(() => undefined);
    await client.send("Runtime.evaluate", {
      expression: "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      awaitPromise: true,
      returnByValue: true,
    }).catch(() => undefined);
    const metrics = await client.send("Page.getLayoutMetrics").catch(() => ({}));
    const viewport = metrics.cssLayoutViewport ?? metrics.layoutViewport ?? {};
    const width = Math.max(320, Math.min(1600, Math.floor(viewport.clientWidth ?? 1280)));
    const height = Math.max(240, Math.min(1200, Math.floor(viewport.clientHeight ?? 900)));
    return client.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
      clip: {
        x: Math.max(0, Math.floor(viewport.pageX ?? 0)),
        y: Math.max(0, Math.floor(viewport.pageY ?? 0)),
        width,
        height,
        scale: 1,
      },
    });
  };

  try {
    let shot = null;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        shot = await captureVisibleViewport();
        break;
      } catch (error) {
        lastError = error;
        await client.send("Page.stopLoading").catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
    if (!shot?.data) {
      throw lastError ?? new Error("CDP Page.captureScreenshot did not return image data.");
    }
    await writeFile(filePath, Buffer.from(shot.data, "base64"));
    return { ok: true, path: filePath };
  } catch (error) {
    const domPng = await client.send("Runtime.evaluate", {
      expression: `new Promise((resolve) => {
        try {
          const width = Math.max(320, Math.min(1600, window.innerWidth || 1280));
          const height = Math.max(240, Math.min(1200, window.innerHeight || 900));
          const clone = document.documentElement.cloneNode(true);
          clone.querySelectorAll("script").forEach((node) => node.remove());
          const html = new XMLSerializer().serializeToString(clone);
          const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='" + width + "' height='" + height + "'>" +
            "<foreignObject width='100%' height='100%'>" + html + "</foreignObject></svg>";
          const image = new Image();
          image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            context.fillStyle = getComputedStyle(document.body).backgroundColor || "#fff";
            context.fillRect(0, 0, width, height);
            context.drawImage(image, 0, 0);
            resolve({ ok: true, data: canvas.toDataURL("image/png").split(",")[1] });
          };
          image.onerror = () => resolve({ ok: false, error: "DOM image render failed." });
          image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        } catch (renderError) {
          resolve({ ok: false, error: String(renderError && renderError.message ? renderError.message : renderError) });
        }
      })`,
      awaitPromise: true,
      returnByValue: true,
    }).catch((fallbackError) => ({
      result: { value: { ok: false, error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) } },
    }));
    if (domPng?.result?.value?.ok && domPng.result.value.data) {
      await writeFile(filePath, Buffer.from(domPng.result.value.data, "base64"));
      return { ok: true, path: filePath, fallback: "dom-rendered-png" };
    }
    const snapshot = await client.send("Runtime.evaluate", {
      expression: "document.body.innerText",
      returnByValue: true,
    }).catch((fallbackError) => ({
      result: {
        value: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}\nText snapshot failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      },
    }));
    await writeTextPreviewPng(filePath, String(snapshot?.result?.value ?? ""));
    return {
      ok: true,
      path: filePath,
      fallback: "node-rendered-text-png",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function textHash(text) {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function writeTextPreviewPng(filePath, text) {
  const width = 1280;
  const height = 900;
  const hash = textHash(text);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = 1 + x * 4;
      const wave = Math.sin((x + y + (hash % 360)) / 55);
      const grid = (x % 32 === 0 || y % 32 === 0) ? 30 : 0;
      row[i] = 190 - grid;
      row[i + 1] = Math.max(120, 245 - grid);
      row[i + 2] = Math.max(130, 218 + Math.round(wave * 22) - grid);
      row[i + 3] = 255;
    }
    rows.push(row);
  }
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 8);
  lines.forEach((line, lineIndex) => {
    const y = 70 + lineIndex * 46;
    const blocks = Math.min(44, Math.max(8, Math.ceil(line.length / 3)));
    for (let block = 0; block < blocks; block += 1) {
      const x = 70 + block * 24;
      for (let dy = 0; dy < 22; dy += 1) {
        const row = rows[y + dy];
        if (!row) continue;
        for (let dx = 0; dx < 16; dx += 1) {
          const i = 1 + (x + dx) * 4;
          row[i] = 16;
          row[i + 1] = 36;
          row[i + 2] = 30;
          row[i + 3] = 255;
        }
      }
    }
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND"),
  ]);
  await writeFile(filePath, png);
}

const fixtureHtml = `<!doctype html>
<html>
  <head>
    <title>ResonantOS Agent Fixture</title>
    <style>
      body { font-family: sans-serif; min-height: 2400px; padding: 40px; }
      button, input, textarea, [contenteditable] { font-size: 20px; margin: 10px; padding: 12px; }
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
    <textarea id="inline-editor" aria-label="Inline editable note">prefix teh quick i suffix</textarea>
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
      connection: document.querySelector("#connection-line").getAttribute("aria-label") || document.querySelector("#connection-line").title || document.querySelector("#connection-line").textContent
    })`)).result.value;
    if (!state.disabled && /Ready|Needs approval|Denied|Control blocked/.test(state.connection)) return state;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const text = (await evaluate(panel, "document.body.innerText")).result.value;
  throw new Error(`${label} did not return composer readiness. Panel text:\n${text}`);
}

async function waitForPageCondition(page, expression, label) {
  for (let index = 0; index < 80; index += 1) {
    const value = (await evaluate(page, expression)).result.value;
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const text = (await evaluate(page, "document.body.innerText")).result.value;
  throw new Error(`${label} did not become true. Page text:\n${text}`);
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
  const shortcutState = (await evaluate(panel, `(async () => {
    const input = document.querySelector("#command-input");
    const form = document.querySelector("#command-form");
    const originalRequestSubmit = form.requestSubmit.bind(form);
    let clipboardText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => { clipboardText = String(text); },
        readText: async () => clipboardText,
      },
    });
    input.value = "first line";
    let submitted = false;
    form.requestSubmit = () => { submitted = true; };
    input.setSelectionRange(0, 0);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true, cancelable: true }));
    const afterMetaA = {
      submitted,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      value: input.value,
    };
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterMetaC = { submitted, clipboardText, value: input.value };
    input.setSelectionRange(0, 5);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "x", metaKey: true, bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterMetaX = { submitted, clipboardText, value: input.value };
    input.setSelectionRange(0, 0);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "v", metaKey: true, bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterMetaV = { submitted, clipboardText, value: input.value };
    input.value = "undo baseline";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.value = "undo baseline plus";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true, cancelable: true }));
    const afterMetaZ = { submitted, value: input.value };
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
    const afterShiftEnter = { submitted, value: input.value };
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true, cancelable: true }));
    const afterMetaEnter = { submitted, value: input.value };
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    form.requestSubmit = originalRequestSubmit;
    return { afterMetaA, afterMetaC, afterMetaX, afterMetaV, afterMetaZ, afterShiftEnter, afterMetaEnter, submitted };
  })()`)).result.value;
  assert(shortcutState.afterMetaA.selectionStart === 0, `Command+A should select from start: ${JSON.stringify(shortcutState)}`);
  assert(shortcutState.afterMetaA.selectionEnd === shortcutState.afterMetaA.value.length, `Command+A should select full composer text: ${JSON.stringify(shortcutState)}`);
  assert(!shortcutState.afterMetaA.submitted, `Command+A should not submit: ${JSON.stringify(shortcutState)}`);
  assert(shortcutState.afterMetaC.clipboardText === "first line", `Command+C should copy composer text: ${JSON.stringify(shortcutState)}`);
  assert(shortcutState.afterMetaX.clipboardText === "first", `Command+X should cut selected composer text: ${JSON.stringify(shortcutState)}`);
  assert(shortcutState.afterMetaX.value === " line", `Command+X should remove selected composer text: ${JSON.stringify(shortcutState)}`);
  assert(shortcutState.afterMetaV.value === "first line", `Command+V should paste at the composer cursor: ${JSON.stringify(shortcutState)}`);
  assert(shortcutState.afterMetaZ.value === "undo baseline", `Command+Z should undo the last composer edit: ${JSON.stringify(shortcutState)}`);
  assert(!shortcutState.afterShiftEnter.submitted, `Shift+Enter should not submit: ${JSON.stringify(shortcutState)}`);
  assert(!shortcutState.afterMetaEnter.submitted, `Command-modified Enter should not submit: ${JSON.stringify(shortcutState)}`);
  assert(shortcutState.submitted, `Enter should submit the composer: ${JSON.stringify(shortcutState)}`);
  await evaluate(panel, `document.querySelector("#command-input").value = ""; document.querySelector("#transcript").replaceChildren();`);
  await evaluate(panel, `document.querySelector("#read-page").click()`);
  await waitForPanelText(panel, /Page context attached:/, "initial content script attachment");
  await evaluate(page, `(() => {
    const paragraph = document.querySelector("p");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return true;
  })()`);
  await waitForPageCondition(page, `document.querySelector("#resonantos-inline-button")?.style.display === "block"`, "inline assistant button");
  await evaluate(page, `document.querySelector("#resonantos-inline-button").click()`);
  const inlineSummary = await waitForPageCondition(page, `document.querySelector("#resonantos-inline-assistant .ros-inline-result")?.innerText.includes("Summary")`, "inline assistant summary");
  assert(inlineSummary, "Inline assistant did not produce a summary.");
  const inlinePromptPresent = (await evaluate(page, `Boolean(document.querySelector("#resonantos-inline-assistant .ros-inline-prompt"))`)).result.value;
  assert(inlinePromptPresent, "Inline Assistant custom prompt input is missing.");
  await evaluate(page, `document.querySelector('#resonantos-inline-assistant [data-action="send"]').click()`);
  await waitForPanelText(panel, /Inline Assistant context received\./, "inline send to side panel");
  const inlineInsertionState = (await evaluate(page, `(() => {
    const editor = document.querySelector("#inline-editor");
    editor.focus();
    const start = editor.value.indexOf("teh quick i");
    const end = start + "teh quick i".length;
    editor.setSelectionRange(start, end);
    editor.dispatchEvent(new Event("select", { bubbles: true }));
    document.dispatchEvent(new Event("selectionchange"));
    return true;
  })()`)).result.value;
  assert(inlineInsertionState, "Inline editor selection setup failed.");
  await waitForPageCondition(page, `document.querySelector("#resonantos-inline-button")?.style.display === "block"`, "inline editable selection button");
  await evaluate(page, `document.querySelector("#resonantos-inline-button").click()`);
  await evaluate(page, `document.querySelector('#resonantos-inline-assistant [data-action="rewrite"]').click()`);
  await waitForPageCondition(page, `document.querySelector("#resonantos-inline-assistant .ros-inline-result")?.innerText.includes("the quick I")`, "inline rewrite result");
  const inlineShortcutLabels = (await evaluate(page, `Array.from(document.querySelectorAll("#resonantos-inline-assistant kbd")).map((node) => node.textContent).join("")`)).result.value;
  assert(/S/.test(inlineShortcutLabels) && /I/.test(inlineShortcutLabels), `Inline Assistant shortcuts are missing: ${inlineShortcutLabels}`);
  await evaluate(page, `document.querySelector('#resonantos-inline-assistant [data-action="insert"]').click()`);
  const inlineEditorValue = (await evaluate(page, `document.querySelector("#inline-editor").value`)).result.value;
  assert(inlineEditorValue === "prefix the quick I suffix", `Inline Assistant should replace only selected editable text: ${inlineEditorValue}`);
  const dockCollapsedState = (await evaluate(panel, `({
    dockHidden: document.querySelector("#context-dock").hidden,
    siteHidden: document.querySelector("#site-permission-panel").hidden,
    jobsHidden: document.querySelector("#job-monitor").hidden,
    activityHidden: document.querySelector("#activity-panel").hidden,
    toggle: document.querySelector("#context-toggle").textContent
  })`)).result.value;
  assert(dockCollapsedState.siteHidden && dockCollapsedState.jobsHidden, `Site/jobs panels should be hidden by default: ${JSON.stringify(dockCollapsedState)}`);
  await evaluate(panel, `document.querySelector("#context-toggle").click()`);
  const sitePanelState = await waitForPageCondition(panel, `(() => {
    const state = {
      visible: !document.querySelector("#site-permission-panel").hidden,
      host: document.querySelector("#site-permission-host").textContent,
      mode: document.querySelector("#site-permission-mode").value
    };
    return state.visible && state.host === "127.0.0.1" ? state : false;
  })()`, "site permission panel binding");
  assert(sitePanelState.visible && sitePanelState.host === "127.0.0.1", `Site permission panel not bound: ${JSON.stringify(sitePanelState)}`);
  const sitePanelMode = (await evaluate(panel, `({
    visible: !document.querySelector("#site-permission-panel").hidden,
    host: document.querySelector("#site-permission-host").textContent,
    mode: document.querySelector("#site-permission-mode").value
  })`)).result.value;
  assert(sitePanelMode.mode, `Site permission panel mode missing: ${JSON.stringify(sitePanelMode)}`);
  await submitControlCommand(panel, `/capabilities`);
  await waitForPanelText(panel, /What Augmentor can do now:/, "capabilities command");
  await submitControlCommand(panel, `/site block`);
  await waitForPanelText(panel, /Set 127\.0\.0\.1 Assistant permission to blocked/, "site block command");
  const blockedSiteMode = (await evaluate(panel, `document.querySelector("#site-permission-mode").value`)).result.value;
  assert(blockedSiteMode === "blocked", `Site permission select did not reflect blocked mode: ${blockedSiteMode}`);
  await evaluate(page, `(() => {
    const paragraph = document.querySelector("p");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return true;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const inlineBlocked = (await evaluate(page, `document.querySelector("#resonantos-inline-button")?.style.display !== "block"`)).result.value;
  assert(inlineBlocked, "Site block did not hide Inline Assistant.");
  await submitControlCommand(panel, `/site ask`);
  await waitForPanelText(panel, /Set 127\.0\.0\.1 Assistant permission to ask-before-action/, "site ask command");

  await evaluate(panel, `(() => { globalThis.__resonantosNextActionOverride = async ({ snapshot, history }) => ({
    source: "test-next-action",
    thought: "Verify iframe context is visible to the browser-control loop.",
    status: snapshot?.text?.includes("Booking calendar frame") ? (history.length ? "done" : "continue") : "blocked",
    action: snapshot?.text?.includes("Booking calendar frame") && !history.length ? { type: "read" } : null,
    approvalReason: snapshot?.text?.includes("Booking calendar frame") ? null : "Iframe booking context was not visible.",
    doneSummary: history.length ? "Iframe booking context was observed." : null
  }); return true; })()`);
  await submitControlCommand(panel, `book a call now`);
  await waitForPageCondition(page, `document.querySelector("#resonantos-control-overlay")?.dataset.session === "active"`, "persistent control overlay session start");
  const iframePanelText = await waitForPanelText(panel, /Booking calendar frame|Iframe booking context was not visible/, "iframe context read");
  assert(!/Iframe booking context was not visible/.test(iframePanelText), "Agent planner could not see iframe booking context.");
  await waitForComposerReady(panel, "iframe context read");
  await waitForPageCondition(page, `document.querySelector("#resonantos-control-overlay")?.dataset.session !== "active"`, "persistent control overlay session stop");
  const firstJobState = (await evaluate(panel, `(async () => ({
    monitorVisible: !document.querySelector("#job-monitor").hidden,
    stored: (await chrome.storage.local.get("augmentorBrowserJobs")).augmentorBrowserJobs ?? [],
    panelText: document.querySelector("#job-monitor").innerText
  }))()`)).result.value;
  assert(firstJobState.monitorVisible, "Browser job monitor is not visible after a control task.");
  assert(firstJobState.stored.some((job) => job.goal === "book a call now"), `Browser job did not persist: ${JSON.stringify(firstJobState)}`);
  await submitControlCommand(panel, `/jobs`);
  await waitForPanelText(panel, /Browser jobs:/, "jobs command");
  await submitControlCommand(panel, `/pause book a call`);
  await waitForPanelText(panel, /Paused browser job/, "pause job command");
  await submitControlCommand(panel, `/resume book a call`);
  await waitForPanelText(panel, /Queued browser job/, "resume job command");
  await submitControlCommand(panel, `/cancel book a call`);
  await waitForPanelText(panel, /Cancelled browser job/, "cancel job command");
  const persistedAfterCancel = (await evaluate(panel, `(async () => (await chrome.storage.local.get("augmentorBrowserJobs")).augmentorBrowserJobs ?? [])()`)).result.value;
  assert(persistedAfterCancel.some((job) => job.goal === "book a call now" && job.status === "cancelled"), "Cancelled job state did not persist.");
  await panel.send("Page.reload");
  await evaluate(panel, `new Promise((resolve) => {
    const done = () => resolve(Boolean(document.querySelector("#command-input")));
    if (document.readyState === "complete") done();
    else addEventListener("load", done, { once: true });
  })`);
  await waitForPanelText(panel, /book a call now/, "job monitor persisted after panel reload");

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
  const overlayAfterClick = (await evaluate(page, `({
    overlayPresent: Boolean(document.querySelector("#resonantos-control-overlay")),
    session: document.querySelector("#resonantos-control-overlay")?.dataset.session ?? "",
    toastText: document.querySelector("#resonantos-control-toast")?.textContent ?? "",
    highlighted: Boolean(document.querySelector(".resonantos-control-target"))
  })`)).result.value;
  assert(overlayAfterClick.overlayPresent, `Agent control overlay was not injected: ${JSON.stringify(overlayAfterClick)}`);
  assert(
    overlayAfterClick.session === "active" ||
      overlayAfterClick.highlighted ||
      /Clicked|Clicking|Tuesday|Reading page context/i.test(overlayAfterClick.toastText),
    `Agent control overlay did not expose action feedback: ${JSON.stringify(overlayAfterClick)}`
  );
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
  await waitForPanelText(panel, /Agent Control Mode blocked at action|submit\/public action|requires human approval/i, "approval boundary");
  await waitForPageCondition(panel, `!document.querySelector("#approval-card").hidden`, "public-submit approval card");
  const blockedState = (await evaluate(page, `({ submitted: window.__submitted, status: document.querySelector("#status").textContent })`)).result.value;
  assert(!blockedState.submitted, `Approval gate failed before approval: ${JSON.stringify(blockedState)}`);
  const publicSubmitApprovalState = (await evaluate(panel, `({
    cardVisible: !document.querySelector("#approval-card").hidden,
    approveDisabled: document.querySelector("#approval-approve").disabled,
    trustDisabled: document.querySelector("#approval-trust-site").disabled,
    reason: document.querySelector("#approval-reason").textContent
  })`)).result.value;
  assert(publicSubmitApprovalState.cardVisible, "Public-submit approval card is not visible.");
  assert(!publicSubmitApprovalState.approveDisabled, "Approve-once should remain available for reviewed public-submit actions.");
  assert(publicSubmitApprovalState.trustDisabled, `Site trust must not bypass public submit: ${JSON.stringify(publicSubmitApprovalState)}`);
  await evaluate(panel, `document.querySelector("#approval-deny").click()`);
  await waitForPanelText(panel, /Denied browser action/, "deny public submit approval");

  await evaluate(panel, `(() => { globalThis.__resonantosNextActionOverride = async () => ({
    source: "test-next-action",
    thought: "Attempt wallet click; content boundary must block automation.",
    status: "continue",
    action: { type: "click", text: "Connect Wallet" },
    approvalReason: null,
    doneSummary: null
  }); return true; })()`);
  await submitControlCommand(panel, `/control connect wallet`);
  await waitForPanelText(panel, /Planner requested a restricted click|wallet, login, payment, credential/i, "wallet approval boundary");
  const walletApprovalState = (await evaluate(panel, `({
    cardVisible: !document.querySelector("#approval-card").hidden,
    status: document.querySelector("#status")?.textContent ?? ""
  })`)).result.value;
  assert(!walletApprovalState.cardVisible, `Wallet/payment/login planner blocks must not expose an approval bypass: ${JSON.stringify(walletApprovalState)}`);
  const approvalState = (await evaluate(page, `({ submitted: window.__submitted, status: document.querySelector("#status").textContent })`)).result.value;
  assert(approvalState.status !== "wallet-clicked", `Wallet action executed unexpectedly: ${JSON.stringify(approvalState)}`);

  const screenshots = [
    await captureScreenshotArtifact(panel, "/tmp/resonantos-agent-control-live-panel.png"),
    await captureScreenshotArtifact(page, "/tmp/resonantos-agent-control-live-page.png"),
  ];

  console.log(JSON.stringify({
    ok: true,
    iframeContextVisible: true,
    bookingState,
    cartState,
    safeState,
    documentState,
    blockedState,
    approvalState,
    screenshots,
  }, null, 2));

  panel.close();
  page.close();
} finally {
  await shutdownHost();
  await new Promise((resolve) => server.close(resolve));
}
