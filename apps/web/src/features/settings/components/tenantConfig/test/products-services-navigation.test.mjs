import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Products & Services has a direct settings destination and focuses the existing catalog section", async () => {
  const [workspace, settings] = await Promise.all([
    readFile(new URL("../../../../nexopsShell/NexOpsWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../NexOpsSettingsPage.tsx", import.meta.url), "utf8")
  ]);
  assert.match(workspace, /\/nexops\/settings\/products-services/);
  assert.match(workspace, /catalogFocusNonce/);
  assert.match(settings, /id="products-services"/);
  assert.match(settings, /scrollIntoView/);
  assert.match(settings, /Products &amp; Services/);
});
