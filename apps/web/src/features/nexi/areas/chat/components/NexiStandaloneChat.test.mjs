import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./NexiStandaloneChat.tsx", import.meta.url), "utf8");
const primitives = fs.readFileSync(new URL("./NexiStandalonePrimitives.tsx", import.meta.url), "utf8");

test("Nexi notification cleanup does not reference voice-hook internals", () => {
  const cleanup = source.slice(source.indexOf('window.addEventListener("nexops:crm-mutated"'), source.indexOf("async function loadNotifications"));
  assert.doesNotMatch(cleanup, /recognitionRef|audioRef|ttsAbortRef/);
});

test("every rendered Nexi message includes its date and time stamp", () => {
  assert.match(primitives, /formatNexiMessageTimestamp/);
  assert.match(primitives, /<time className="nexi-message-timestamp"/);
  assert.match(source, /createdAt: new Date\(\)\.toISOString\(\)/);
});
