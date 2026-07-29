import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./NexiStandaloneChat.tsx", import.meta.url), "utf8");

test("Nexi notification cleanup does not reference voice-hook internals", () => {
  const cleanup = source.slice(source.indexOf('window.addEventListener("nexops:crm-mutated"'), source.indexOf("async function loadNotifications"));
  assert.doesNotMatch(cleanup, /recognitionRef|audioRef|ttsAbortRef/);
});
