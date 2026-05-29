import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizedRailQuery,
  railSearchMatchesProject,
  railSearchMatchesSession
} from "../resonantos-side-panel-extension/src/lib/main-workspace-rail.js";

const session = {
  title: "DAO research",
  workspaceId: "answer",
  messages: [
    { role: "user", content: "Find governance links" },
    { role: "assistant", content: "ResonantDAO membership notes" }
  ]
};

test("main workspace rail normalizes search queries", () => {
  assert.equal(normalizedRailQuery("  DAO   Research  "), "dao research");
});

test("main workspace rail search matches session title, workspace, and message content", () => {
  assert.equal(railSearchMatchesSession(session, ""), true);
  assert.equal(railSearchMatchesSession(session, "dao research"), true);
  assert.equal(railSearchMatchesSession(session, "governance links"), true);
  assert.equal(railSearchMatchesSession(session, "opencode"), false);
});

test("main workspace rail search keeps projects visible when project name or child chat matches", () => {
  const project = { id: "project-cosmo", name: "Cosmodestiny" };
  assert.equal(railSearchMatchesProject(project, [], "cosmo"), true);
  assert.equal(railSearchMatchesProject(project, [session], "membership"), true);
  assert.equal(railSearchMatchesProject(project, [session], "unrelated"), false);
});
