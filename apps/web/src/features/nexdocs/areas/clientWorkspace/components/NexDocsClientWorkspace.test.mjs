import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./NexDocsClientWorkspace.tsx", import.meta.url), "utf8");

test("NexDocs distinguishes an in-flight library load from an unavailable library", () => {
  assert.match(source, /busy === "refresh"/);
  assert.match(source, /title="Loading NexDocs"/);
  assert.match(source, /title="Loading NexCam"/);
  assert.match(source, /title="NexDocs offline"/);
});
