import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("Client Details owns its profile surface and rail orchestration", () => {
  const detailsSurface = readFileSync(new URL("../ClientDetailsSurface.tsx", import.meta.url), "utf8");
  const detailsRails = readFileSync(new URL("../hooks/useClientDetailsRails.ts", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../../../../nexopsShell/NexOpsWorkspace.tsx", import.meta.url), "utf8");

  assert.match(detailsSurface, /function renderMobileClientProfile/);
  assert.match(detailsSurface, /function renderClientProfile/);
  assert.match(detailsRails, /refreshClientRails/);
  assert.doesNotMatch(workspace, /function renderMobileClientProfile/);
  assert.doesNotMatch(workspace, /function renderClientProfile/);
  assert.equal(existsSync(new URL("../../contact/ContactProfileSurface.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../../contact/hooks/useContactClientRails.ts", import.meta.url)), false);
});
