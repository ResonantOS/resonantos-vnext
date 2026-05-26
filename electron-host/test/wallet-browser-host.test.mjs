// Intent citation: docs/architecture/ADR-036-wallet-capable-browser-host.md

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  browserCandidates,
  discoverWalletBrowser,
  inspectWalletDappGate,
  openWalletBrowserUrl,
  readWalletBrowserPage,
  startWalletBrowserHost,
  stopWalletBrowserHost,
  walletBrowserHealth,
} from "../wallet-browser-host.mjs";

async function fixtureServer() {
  const server = createServer((_, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html>
      <title>Wallet Host Fixture</title>
      <script>window.phantom = { solana: { isPhantom: true } };</script>
      <h1>Wallet Host Fixture</h1>
      <button>Connect Phantom Wallet</button>
      <button>Approve Transaction</button>
      <a href="/dao">DAO</a>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("wallet browser host discovery prefers real Chromium-compatible browsers", () => {
  const candidates = browserCandidates("darwin", {});
  assert.equal(candidates.some((candidate) => candidate.id === "brave"), true);
  assert.equal(candidates.some((candidate) => candidate.id === "chrome"), true);
});

test("wallet browser host starts a real browser profile and reads a page", { timeout: 30000 }, async (t) => {
  const browser = discoverWalletBrowser();
  if (!browser) {
    t.skip("No Chrome/Brave executable available on this machine.");
    return;
  }

  const fixture = await fixtureServer();
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "resonantos-wallet-browser-test-"));
  try {
    const started = await startWalletBrowserHost({ url: fixture.url, profileDir });
    assert.equal(started.ready, true);
    assert.equal(started.engine, "external-chromium-wallet");
    assert.equal(started.profilePath, profileDir);

    const opened = await openWalletBrowserUrl({ url: fixture.url });
    assert.equal(opened.title, "Wallet Host Fixture");

    const read = await readWalletBrowserPage();
    assert.equal(read.title, "Wallet Host Fixture");
    assert.match(read.text, /Wallet Host Fixture/);

    const health = await walletBrowserHealth();
    assert.equal(health.walletSupport, "real-browser-profile");

    const gate = await inspectWalletDappGate();
    assert.equal(gate.providerDetected, true);
    assert.equal(gate.manualApprovalRequired, true);
    assert.match(gate.blockedActions.join(","), /approve-transaction/);
    assert.equal(gate.actionCandidates.some((candidate) => /Connect Phantom Wallet/.test(candidate.text)), true);
  } finally {
    await stopWalletBrowserHost();
    await fixture.close();
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  }
});
