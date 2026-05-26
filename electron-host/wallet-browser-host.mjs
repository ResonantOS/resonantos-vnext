// Intent citation: docs/architecture/ADR-036-wallet-capable-browser-host.md
//
// Managed real-browser host for wallet-capable workflows. This intentionally
// launches Chrome/Brave as an external browser profile instead of pretending
// Electron can run arbitrary wallet extensions.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_URL = "https://resonantos.com";
const PHANTOM_CHROME_WEB_STORE_URL = "https://chromewebstore.google.com/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa";
const MAX_TEXT_CHARS = 12000;
const MAX_LINKS = 80;

let walletHost = null;

function defaultProfilePath(env = process.env) {
  return env.RESONANTOS_WALLET_BROWSER_PROFILE_DIR || path.join(os.homedir(), "ResonantOS_User", "BrowserProfiles", "wallet-main");
}

export function browserCandidates(platform = process.platform, env = process.env) {
  const home = os.homedir();
  const envCandidate = env.RESONANTOS_WALLET_BROWSER_EXECUTABLE;
  const candidates = envCandidate ? [{ id: "custom", name: "Custom wallet browser", executablePath: envCandidate }] : [];

  if (platform === "darwin") {
    return [
      ...candidates,
      {
        id: "brave",
        name: "Brave Browser",
        executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      },
      {
        id: "chrome",
        name: "Google Chrome",
        executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      },
      {
        id: "chrome-canary",
        name: "Google Chrome Canary",
        executablePath: "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      },
    ];
  }

  if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    const programFiles = env.PROGRAMFILES ?? "C:\\Program Files";
    const programFilesX86 = env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
    return [
      ...candidates,
      { id: "brave", name: "Brave Browser", executablePath: path.join(local, "BraveSoftware", "Brave-Browser", "Application", "brave.exe") },
      { id: "brave", name: "Brave Browser", executablePath: path.join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe") },
      { id: "chrome", name: "Google Chrome", executablePath: path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe") },
      { id: "chrome", name: "Google Chrome", executablePath: path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe") },
    ];
  }

  return [
    ...candidates,
    { id: "brave", name: "Brave Browser", executablePath: "/usr/bin/brave-browser" },
    { id: "brave", name: "Brave Browser", executablePath: "/snap/bin/brave" },
    { id: "chrome", name: "Google Chrome", executablePath: "/usr/bin/google-chrome" },
    { id: "chromium", name: "Chromium", executablePath: "/usr/bin/chromium" },
    { id: "chromium", name: "Chromium", executablePath: "/usr/bin/chromium-browser" },
  ];
}

export function discoverWalletBrowser(env = process.env) {
  return browserCandidates(process.platform, env).find((candidate) => existsSync(candidate.executablePath)) ?? null;
}

function normalizeHttpUrl(value = DEFAULT_URL) {
  const trimmed = String(value || DEFAULT_URL).trim();
  const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Wallet Browser only accepts http and https URLs.");
  }
  return parsed.toString();
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForCdp(endpoint, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Browser is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Wallet Browser did not expose DevTools at ${endpoint}.`);
}

async function connectPlaywright(endpoint) {
  const { chromium } = await import("playwright");
  return chromium.connectOverCDP(endpoint);
}

async function activePage() {
  if (!walletHost?.browser) {
    throw new Error("Wallet Browser host is not running.");
  }
  const context = walletHost.browser.contexts()[0];
  let page = context?.pages().find((candidate) => !candidate.isClosed()) ?? null;
  if (!page) {
    page = await context.newPage();
  }
  return page;
}

export async function startWalletBrowserHost(params = {}) {
  const url = normalizeHttpUrl(params.url ?? DEFAULT_URL);
  if (walletHost?.browser) {
    const page = await activePage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return walletBrowserHealth();
  }

  const browser = discoverWalletBrowser();
  if (!browser) {
    throw new Error("No supported wallet browser found. Install Brave or Google Chrome, or set RESONANTOS_WALLET_BROWSER_EXECUTABLE.");
  }

  const port = await getFreePort();
  const userDataDir = String(params.profileDir || defaultProfilePath());
  await mkdir(userDataDir, { recursive: true });
  const endpoint = `http://127.0.0.1:${port}`;
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--new-window",
    url,
  ];
  const child = spawn(browser.executablePath, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  const version = await waitForCdp(endpoint);
  const playwrightBrowser = await connectPlaywright(endpoint);
  walletHost = {
    browser: playwrightBrowser,
    process: child,
    browserName: browser.name,
    browserId: browser.id,
    executablePath: browser.executablePath,
    endpoint,
    port,
    userDataDir,
    version,
    startedAt: new Date().toISOString(),
  };
  return walletBrowserHealth();
}

export async function walletBrowserHealth() {
  if (!walletHost?.browser) {
    const browser = discoverWalletBrowser();
    return {
      ready: false,
      sessionId: null,
      engine: "external-chromium-wallet",
      url: null,
      title: null,
      browserName: browser?.name ?? null,
      executablePath: browser?.executablePath ?? null,
      profilePath: defaultProfilePath(),
      walletSupport: browser ? "real-browser-required" : "unavailable",
      phantomInstallUrl: PHANTOM_CHROME_WEB_STORE_URL,
      audit: [],
    };
  }
  const page = await activePage();
  return {
    ready: true,
    sessionId: "wallet-browser-main",
    engine: "external-chromium-wallet",
    url: page.url(),
    title: await page.title().catch(() => null),
    browserName: walletHost.browserName,
    executablePath: walletHost.executablePath,
    profilePath: walletHost.userDataDir,
    cdpEndpoint: walletHost.endpoint,
    walletSupport: "real-browser-profile",
    phantomInstallUrl: PHANTOM_CHROME_WEB_STORE_URL,
    audit: [],
  };
}

export async function openWalletBrowserUrl(params = {}) {
  if (!walletHost?.browser) {
    await startWalletBrowserHost({ url: params.url ?? DEFAULT_URL });
  }
  const page = await activePage();
  const url = normalizeHttpUrl(params.url ?? DEFAULT_URL);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  return {
    sessionId: "wallet-browser-main",
    finalUrl: page.url(),
    title: await page.title().catch(() => ""),
    status: null,
    audit: [],
  };
}

export async function readWalletBrowserPage() {
  const page = await activePage();
  const result = await page.evaluate(
    ({ maxTextChars, maxLinks }) => {
      const links = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, maxLinks)
        .map((link) => ({
          text: (link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
          href: link.href,
        }));
      return { text: (document.body?.innerText || "").slice(0, maxTextChars), links };
    },
    { maxTextChars: MAX_TEXT_CHARS, maxLinks: MAX_LINKS },
  );
  return {
    sessionId: "wallet-browser-main",
    finalUrl: page.url(),
    title: await page.title().catch(() => ""),
    text: String(result.text ?? ""),
    links: Array.isArray(result.links) ? result.links : [],
    audit: [],
  };
}

export async function inspectWalletDappGate() {
  const page = await activePage();
  const result = await page.evaluate(() => {
    const providerDetected = Boolean(window.phantom?.solana?.isPhantom || window.solana?.isPhantom);
    const actionCandidates = Array.from(document.querySelectorAll("button, a, [role='button']"))
      .map((element) => ({
        text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
        tagName: element.tagName.toLowerCase(),
        href: element instanceof HTMLAnchorElement ? element.href : null,
      }))
      .filter((item) => /connect|wallet|phantom|sign|approve|transaction/i.test(item.text));
    return { providerDetected, actionCandidates };
  });
  return {
    sessionId: "wallet-browser-main",
    finalUrl: page.url(),
    title: await page.title().catch(() => ""),
    providerDetected: Boolean(result.providerDetected),
    manualApprovalRequired: true,
    blockedActions: ["approve-transaction", "sign-message", "switch-network", "reveal-secret", "export-key"],
    actionCandidates: Array.isArray(result.actionCandidates) ? result.actionCandidates : [],
    audit: [],
  };
}

export async function listWalletBrowserTabs() {
  if (!walletHost?.browser) {
    return { sessionId: null, tabs: [], audit: [] };
  }
  const context = walletHost.browser.contexts()[0];
  const tabs = await Promise.all(
    context.pages().map(async (page, index) => ({
      index,
      url: page.url(),
      title: await page.title().catch(() => ""),
    })),
  );
  return { sessionId: "wallet-browser-main", tabs, audit: [] };
}

export async function stopWalletBrowserHost() {
  if (walletHost?.browser) {
    await walletHost.browser.close().catch(() => undefined);
  }
  if (walletHost?.process && !walletHost.process.killed) {
    walletHost.process.kill("SIGTERM");
  }
  walletHost = null;
  return { sessionId: null, closed: true, audit: [] };
}

export async function runWalletBrowserCommand(method, params = {}) {
  if (method === "browser.wallet_host.health") return walletBrowserHealth();
  if (method === "browser.wallet_host.start") return startWalletBrowserHost(params);
  if (method === "browser.wallet_host.open_url") return openWalletBrowserUrl(params);
  if (method === "browser.wallet_host.read_page") return readWalletBrowserPage(params);
  if (method === "browser.wallet_host.inspect_dapp_gate") return inspectWalletDappGate(params);
  if (method === "browser.wallet_host.list_tabs") return listWalletBrowserTabs();
  if (method === "browser.wallet_host.close") return stopWalletBrowserHost();
  throw new Error(`Unsupported Wallet Browser host command: ${method}`);
}
