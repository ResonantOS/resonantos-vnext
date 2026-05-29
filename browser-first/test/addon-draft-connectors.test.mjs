import assert from "node:assert/strict";
import test from "node:test";

import {
  appendProviderHandoffAudit,
  buildProviderDraftHandoff,
  parseDraftPacketMarkdown
} from "../host/addon-draft-connectors.mjs";

const emailDraft = `# Email Draft

- id: email-draft-a
- createdAt: 2026-05-29T10:00:00.000Z
- target: email
- status: approved-for-manual-send

## Intent
Project update

## Draft Body
The browser work is ready.
`;

test("draft connector parses draft packets and builds Gmail handoff URLs", () => {
  const draft = parseDraftPacketMarkdown(emailDraft);
  const handoff = buildProviderDraftHandoff(draft, "gmail");

  assert.equal(draft.id, "email-draft-a");
  assert.equal(draft.target, "email");
  assert.equal(draft.status, "approved-for-manual-send");
  assert.equal(draft.intent, "Project update");
  assert.equal(draft.body, "The browser work is ready.");
  assert.equal(handoff.provider, "gmail");
  assert.equal(handoff.target, "email");
  assert.equal(handoff.action, "manual-review-compose");
  assert.match(handoff.url, /^https:\/\/mail\.google\.com\/mail\/\?/);
  assert.match(decodeURIComponent(handoff.url), /su=Project\+update|su=Project update/);
  assert.match(decodeURIComponent(handoff.url), /body=The\+browser\+work\+is\+ready\.|body=The browser work is ready\./);
  assert.match(handoff.boundary, /does not send/i);
});

test("draft connector builds Google Calendar handoff URLs", () => {
  const handoff = buildProviderDraftHandoff({
    body: "Hold Tuesday 10:00 for ResonantOS review.",
    intent: "Planning call",
    target: "calendar"
  }, "google-calendar");

  assert.equal(handoff.provider, "google-calendar");
  assert.equal(handoff.target, "calendar");
  assert.equal(handoff.action, "manual-review-event-template");
  assert.match(handoff.url, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.match(decodeURIComponent(handoff.url), /action=TEMPLATE/);
  assert.match(decodeURIComponent(handoff.url), /text=Planning\+call|text=Planning call/);
  assert.match(decodeURIComponent(handoff.url), /details=Hold\+Tuesday|details=Hold Tuesday/);
  assert.match(handoff.boundary, /does not schedule/i);
});

test("draft connector rejects unsupported provider handoffs", () => {
  assert.throws(
    () => buildProviderDraftHandoff({ body: "hello", intent: "Hi", target: "email" }, "smtp"),
    /Unsupported email provider handoff/
  );
  assert.throws(
    () => buildProviderDraftHandoff({ body: "", intent: "Hi", target: "email" }, "gmail"),
    /requires a draft intent and body/
  );
});

test("draft connector appends auditable provider handoff without claiming external action", () => {
  const handoff = buildProviderDraftHandoff(parseDraftPacketMarkdown(emailDraft), "gmail");
  const updated = appendProviderHandoffAudit(emailDraft, handoff, "human");

  assert.match(updated, /## Provider Handoff/);
  assert.match(updated, /provider: gmail/);
  assert.match(updated, /action: manual-review-compose/);
  assert.match(updated, /ResonantOS does not send the email/);
  assert.doesNotMatch(updated, /sentAt|scheduledAt/i);
});
