import test from "node:test";
import assert from "node:assert/strict";

import { classifyIntent } from "./njordIntentClassifier.js";

test("Njord classifier routes operational lookup language to Mimir-style lookup intents", () => {
  const result = classifyIntent("Who's the customer at 237 Camp Mikell Court in Toccoa?");

  assert.equal(result.intent, "lookup");
  assert.equal(result.method, "rule-based");
  assert.ok(result.confidence >= 0.7);
});

test("Njord classifier routes report extraction prompts to record-fetch", () => {
  const result = classifyIntent("Open the Camp Mikell checklist PDF and pull the total gallons.");

  assert.equal(result.intent, "record-fetch");
  assert.ok(result.candidates.includes("lookup") || result.candidates.includes("record-fetch"));
});

test("Njord classifier routes content prompts to content lane", () => {
  const result = classifyIntent("Write a draft article about suspicious pool water loss.");

  assert.equal(result.intent, "content");
});

test("Njord classifier routes email follow-up prompts to follow-up or campaign lane", () => {
  const result = classifyIntent("Follow up with the HOA manager and send the next outreach email.");

  assert.ok(["follow-up", "campaign", "email-send"].includes(result.intent));
});
