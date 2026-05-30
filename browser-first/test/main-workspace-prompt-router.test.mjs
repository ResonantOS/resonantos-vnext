import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDaoSlashCommand,
  parseDraftSlashCommand,
  parseHermesSlashCommand,
  parseMemorySlashCommand,
  parseOpenCodeSlashCommand,
  parseWalletSlashCommand,
  planMainWorkspacePrompt
} from "../resonantos-side-panel-extension/src/lib/main-workspace-prompt-router.js";

test("main workspace prompt router parses explicit workspace slash commands", () => {
  assert.equal(parseMemorySlashCommand("/memory augmentatism"), "augmentatism");
  assert.equal(parseMemorySlashCommand("/archive"), "");
  assert.equal(parseHermesSlashCommand("/hermes coordinate research"), "coordinate research");
  assert.equal(parseOpenCodeSlashCommand("/open code inspect tests"), "inspect tests");
  assert.deepEqual(parseDraftSlashCommand("/email Follow up | body: Draft it"), {
    target: "email",
    body: "Follow up | body: Draft it"
  });
  assert.deepEqual(parseWalletSlashCommand("/wallet audit DAO vote"), {
    action: "audit",
    goal: "DAO vote"
  });
  assert.deepEqual(parseDaoSlashCommand("/dao audit governance page"), {
    action: "audit",
    goal: "governance page"
  });
});

test("main workspace prompt router delegates natural agent requests before provider chat", () => {
  assert.deepEqual(planMainWorkspacePrompt("ask Hermes to research the add-on strategy"), {
    action: "delegate",
    intent: {
      missingTarget: false,
      mission: "research the add-on strategy",
      target: "hermes"
    }
  });
  assert.deepEqual(planMainWorkspacePrompt("delegate this to OpenCode: inspect the browser tests"), {
    action: "delegate",
    intent: {
      missingTarget: false,
      mission: "inspect the browser tests",
      target: "opencode"
    }
  });
  assert.deepEqual(planMainWorkspacePrompt("spawn Hermes to review the research packet"), {
    action: "delegate",
    intent: {
      missingTarget: false,
      mission: "review the research packet",
      target: "hermes"
    }
  });
  assert.deepEqual(planMainWorkspacePrompt("can you delegate this to another agent?"), {
    action: "delegate",
    intent: {
      missingTarget: true,
      mission: "to another agent?",
      target: ""
    }
  });
  assert.deepEqual(planMainWorkspacePrompt("can you use the ResonantOS agent control layer directly?"), {
    action: "delegate",
    intent: {
      missingTarget: true,
      mission: "can you use the ResonantOS agent control layer directly?",
      target: ""
    }
  });
});

test("main workspace prompt router preserves explicit command priority", () => {
  assert.equal(planMainWorkspacePrompt("/hermes ask OpenCode to do nothing").action, "hermes");
  assert.equal(planMainWorkspacePrompt("/opencode ask Hermes to do nothing").action, "opencode");
  assert.equal(planMainWorkspacePrompt("/memory ask Hermes about archive").action, "memory");
  assert.equal(planMainWorkspacePrompt("/wallet status").action, "wallet");
  assert.equal(planMainWorkspacePrompt("/dao review proposal").action, "dao");
  assert.equal(planMainWorkspacePrompt("/calendar Planning | body: Tuesday 10").action, "draft");
});

test("main workspace prompt router separates browser control from normal chat", () => {
  assert.equal(planMainWorkspacePrompt("go to resonantos.com and summarize the page").action, "control");
  assert.equal(planMainWorkspacePrompt("find latest AI news on the internet").action, "control");
  assert.equal(planMainWorkspacePrompt("hey what's the most inportant new in the world today?").action, "control");
  assert.equal(planMainWorkspacePrompt("explain the strategy without delegating").action, "chat");
  assert.equal(planMainWorkspacePrompt("").action, "empty");
});
