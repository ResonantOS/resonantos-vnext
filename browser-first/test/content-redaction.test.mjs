import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const contentScriptPath = path.join(
  repoRoot,
  "browser-first",
  "resonantos-side-panel-extension",
  "src",
  "content.js",
);

async function loadContentScript(html) {
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://example.test/login",
  });
  let listener = null;
  dom.window.chrome = {
    runtime: {
      onMessage: {
        addListener(callback) {
          listener = callback;
        },
      },
      sendMessage: () => Promise.resolve(),
    },
    storage: {
      onChanged: {
        addListener() {},
      },
    },
  };
  dom.window.eval(await readFile(contentScriptPath, "utf8"));
  assert.equal(typeof listener, "function");
  return { dom, listener };
}

test("content page snapshots redact sensitive and ambiguous editable values", async () => {
  const { listener } = await loadContentScript(`
    <!doctype html>
    <form>
      <input type="password" name="password" value="hunter2-secret">
      <input type="email" name="email" value="human@example.com">
      <input type="text" name="card-number" value="4111111111111111">
      <input type="text" name="nickname" value="private nickname">
      <input type="search" name="q" value="resonantos browser">
      <textarea name="notes">private textarea draft</textarea>
    </form>
  `);
  let response = null;
  listener({
    channel: "resonantos.browser_first.content",
    type: "read_page",
  }, {}, (payload) => {
    response = payload;
  });

  assert.equal(response?.ok, true);
  const serialized = JSON.stringify(response.snapshot.fields);
  assert.doesNotMatch(serialized, /hunter2-secret|human@example\.com|4111111111111111|private nickname|private textarea draft/);
  assert.match(serialized, /\[redacted:credential\]/);
  assert.match(serialized, /\[redacted:personal-contact\]/);
  assert.match(serialized, /\[redacted:payment\]/);
  assert.match(serialized, /\[redacted:generic-text\]/);
  assert.match(serialized, /\[redacted:document-edit\]/);
  assert.match(serialized, /resonantos browser/);
  assert.ok(response.snapshot.fields.every((field) => typeof field.fieldKind === "string"));
});
