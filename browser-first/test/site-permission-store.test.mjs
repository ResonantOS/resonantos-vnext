import assert from "node:assert/strict";
import test from "node:test";

import { createSitePermissionStore } from "../resonantos-side-panel-extension/src/lib/site-permission-store.js";

function createHarness(initial = {}, overrides = {}) {
  const writes = [];
  const storage = {
    get: async (key) => {
      if (overrides.getError) throw new Error(overrides.getError);
      return { [key]: initial[key] ?? {} };
    },
    set: async (payload) => {
      if (overrides.setError) throw new Error(overrides.setError);
      writes.push(payload);
      Object.assign(initial, payload);
    }
  };
  const store = createSitePermissionStore({
    storage,
    sitePermissionStorageKey: "augmentorSitePermissions"
  });
  return { initial, store, writes };
}

test("site permission store normalizes site keys", () => {
  const harness = createHarness();

  assert.equal(harness.store.siteKeyForUrl("https://www.example.com/path"), "example.com");
  assert.equal(harness.store.siteKeyForUrl("https://sub.example.com/path"), "sub.example.com");
  assert.equal(harness.store.siteKeyForUrl("not a url"), "");
});

test("site permission store returns ask-before-action by default", async () => {
  const harness = createHarness();

  assert.equal(await harness.store.permissionForUrl("https://example.com/"), "ask-before-action");
  assert.equal(await harness.store.permissionForUrl("bad-url"), "ask-before-action");
});

test("site permission store reads persisted permissions", async () => {
  const harness = createHarness({
    augmentorSitePermissions: {
      "example.com": "trusted-for-safe-actions"
    }
  });

  assert.equal(await harness.store.permissionForUrl("https://www.example.com/path"), "trusted-for-safe-actions");
});

test("site permission store persists permission updates by site key", async () => {
  const harness = createHarness({
    augmentorSitePermissions: {
      "other.example": "blocked"
    }
  });

  const result = await harness.store.setSitePermission("https://www.example.com/path", "read-only");

  assert.deepEqual(result, { key: "example.com", mode: "read-only" });
  assert.deepEqual(harness.writes.at(-1), {
    augmentorSitePermissions: {
      "other.example": "blocked",
      "example.com": "read-only"
    }
  });
});

test("site permission store rejects invalid write targets", async () => {
  const harness = createHarness();

  await assert.rejects(() => harness.store.setSitePermission("bad-url", "blocked"), /No site is active/);
});

test("site permission store falls back safely when reads fail", async () => {
  const harness = createHarness({}, { getError: "storage offline" });

  assert.deepEqual(await harness.store.sitePermissions(), {});
  assert.equal(await harness.store.permissionForUrl("https://example.com/"), "ask-before-action");
});
