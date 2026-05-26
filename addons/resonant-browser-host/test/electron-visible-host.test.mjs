// Intent citation: docs/architecture/ADR-017-resonant-browser-addon.md

import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ELECTRON_BROWSER_MENU_LABELS,
  ResonantElectronBrowserHost,
  createApplicationMenuTemplate,
  handleElectronJsonRpcLine,
  toBrowserExtensionState,
} from "../src/electron-visible-host.mjs";

describe("ResonantElectronBrowserHost contract", () => {
  it("defines the expected desktop browser menu shape", () => {
    const template = createApplicationMenuTemplate();
    assert.deepEqual(
      template.map((item) => item.label),
      ELECTRON_BROWSER_MENU_LABELS,
    );
    assert.equal(template.find((item) => item.label === "View").submenu.some((item) => item.role === "toggleDevTools"), true);
    assert.equal(template.find((item) => item.label === "Bookmarks").submenu.some((item) => item.label === "ResonantOS"), true);
  });

  it("normalizes Electron extension records into ResonantOS extension state", () => {
    const extension = toBrowserExtensionState(
      {
        id: "abc123",
        name: "Research Helper",
        version: "1.2.3",
        permissions: ["tabs", "storage"],
      },
      true,
    );

    assert.deepEqual(extension, {
      extensionId: "abc123",
      name: "Research Helper",
      version: "1.2.3",
      installed: true,
      pinned: true,
      enabled: true,
      source: "local-unpacked",
      requestedCapabilities: ["tabs", "storage"],
    });
  });

  it("refuses to start under plain Node so production cannot silently fake Electron", async () => {
    const host = new ResonantElectronBrowserHost();

    await assert.rejects(() => host.start(), /must be launched by Electron/);
  });

  it("handles extension loading and pinning through an injectable Electron boundary", async () => {
    const extensionDir = await mkdtemp(join(tmpdir(), "resonant-extension-"));
    await writeFile(
      join(extensionDir, "manifest.json"),
      JSON.stringify({ manifest_version: 3, name: "Pinned Helper", version: "0.1.0" }),
    );
    const loadedExtensions = [];
    const electronApi = {
      app: { whenReady: async () => undefined },
      Menu: {
        buildFromTemplate: (template) => ({ template }),
        setApplicationMenu: () => undefined,
      },
      BrowserWindow: class {
        constructor() {
          this.destroyed = false;
          this.webContents = {
            setZoomFactor: () => undefined,
            getURL: () => "https://resonantos.com/",
            getTitle: () => "ResonantOS",
            canGoBack: () => false,
            canGoForward: () => false,
            reload: () => undefined,
          };
        }
        async loadURL() {}
        isDestroyed() {
          return this.destroyed;
        }
        close() {
          this.destroyed = true;
        }
      },
      session: {
        defaultSession: {
          async loadExtension() {
            const extension = { id: "pinned-helper", name: "Pinned Helper", version: "0.1.0", permissions: ["storage"] };
            loadedExtensions.push(extension);
            return extension;
          },
          getAllExtensions() {
            return loadedExtensions;
          },
          removeExtension(extensionId) {
            const index = loadedExtensions.findIndex((extension) => extension.id === extensionId);
            if (index >= 0) {
              loadedExtensions.splice(index, 1);
            }
          },
        },
      },
    };
    const host = new ResonantElectronBrowserHost({ electronApi });

    const start = await host.start({ defaultUrl: "https://resonantos.com" });
    assert.equal(start.ready, true);
    assert.equal(start.engine, "electron-chromium");

    const loaded = await handleElectronJsonRpcLine(
      host,
      JSON.stringify({
        id: "1",
        method: "browser.extensions.load_unpacked",
        params: { path: extensionDir, pinned: true },
      }),
    );

    assert.equal(loaded.id, "1");
    assert.equal(loaded.result.extension.extensionId, "pinned-helper");
    assert.equal(loaded.result.extension.pinned, true);

    const listed = await handleElectronJsonRpcLine(host, JSON.stringify({ id: "2", method: "browser.extensions.list" }));
    assert.equal(listed.result.extensions[0].extensionId, "pinned-helper");
    assert.equal(listed.result.extensions[0].pinned, true);

    const unpinned = await handleElectronJsonRpcLine(
      host,
      JSON.stringify({
        id: "3",
        method: "browser.extensions.set_pinned",
        params: { extensionId: "pinned-helper", pinned: false },
      }),
    );
    assert.equal(unpinned.result.extensions[0].pinned, false);

    const disabled = await handleElectronJsonRpcLine(
      host,
      JSON.stringify({
        id: "4",
        method: "browser.extensions.disable",
        params: { extensionId: "pinned-helper" },
      }),
    );
    assert.equal(disabled.result.extensions.length, 0);

    await host.close();
  });

  it("drives the visible Electron page with read, click, and type commands", async () => {
    const state = {
      url: "https://resonantos.com/",
      title: "ResonantOS",
      text: "Welcome to ResonantOS",
      typed: "",
      clicked: false,
    };
    const electronApi = {
      app: { whenReady: async () => undefined },
      Menu: {
        buildFromTemplate: (template) => ({ template }),
        setApplicationMenu: () => undefined,
      },
      BrowserWindow: class {
        constructor() {
          this.destroyed = false;
          this.webContents = {
            setZoomFactor: () => undefined,
            getURL: () => state.url,
            getTitle: () => state.title,
            canGoBack: () => false,
            canGoForward: () => false,
            reload: () => undefined,
            sendInputEvent: () => undefined,
            executeJavaScript: async (script) => {
              if (script.includes("document.querySelector") && script.includes("element.click")) {
                state.clicked = true;
                return true;
              }
              if (script.includes("document.querySelector") && script.includes("element.focus")) {
                state.typed = "resonant browser test";
                return true;
              }
              return { text: state.text, links: [{ label: "Docs", href: "https://resonantos.com/docs" }] };
            },
          };
        }
        async loadURL(url) {
          state.url = url;
        }
        isDestroyed() {
          return this.destroyed;
        }
        close() {
          this.destroyed = true;
        }
      },
      session: {
        defaultSession: {
          getAllExtensions() {
            return [];
          },
        },
      },
    };
    const host = new ResonantElectronBrowserHost({ electronApi });

    await host.start({ defaultUrl: "https://resonantos.com" });
    const read = await handleElectronJsonRpcLine(host, JSON.stringify({ id: "1", method: "browser.read_page" }));
    assert.equal(read.result.text, "Welcome to ResonantOS");
    assert.equal(read.result.links[0].href, "https://resonantos.com/docs");

    await handleElectronJsonRpcLine(host, JSON.stringify({ id: "2", method: "browser.click", params: { selector: "#start" } }));
    assert.equal(state.clicked, true);

    await handleElectronJsonRpcLine(
      host,
      JSON.stringify({ id: "3", method: "browser.type", params: { selector: "#search", text: "resonant browser test" } }),
    );
    assert.equal(state.typed, "resonant browser test");

    await host.close();
  });
});
