import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Content Queue is owner-extracted without inventing a product route", () => {
  const router = readFileSync(new URL("../../../../../shared/router/AppRouter.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../components/ContentQueuePanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /\/api\/content\/queue\?tenantId=/);
  assert.match(panel, /\/api\/content\/drafts\/\$\{encodeURIComponent\(draftId\)\}\/\$\{action\}/);
  assert.doesNotMatch(router, /ContentQueuePanel/);
});
