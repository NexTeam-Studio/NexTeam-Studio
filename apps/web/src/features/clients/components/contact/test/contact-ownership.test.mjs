import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Contact owns its roster, editor, mobile profile, and desktop profile surfaces", () => {
  const contactProfile = readFileSync(new URL("../ContactProfileSurface.tsx", import.meta.url), "utf8");
  const contactRoster = readFileSync(new URL("../ContactRoster.tsx", import.meta.url), "utf8");
  const contactEditor = readFileSync(new URL("../ContactEditorSurface.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../../../../nexopsShell/NexOpsWorkspace.tsx", import.meta.url), "utf8");

  assert.match(contactProfile, /function renderMobileClientProfile/);
  assert.match(contactProfile, /function renderClientProfile/);
  assert.match(contactRoster, /No clients match this view yet/);
  assert.match(contactEditor, /Ready to save changes/);
  assert.doesNotMatch(shell, /function renderMobileClientProfile/);
  assert.doesNotMatch(shell, /function renderClientProfile/);
  assert.doesNotMatch(shell, /function renderClientDetail/);
});
