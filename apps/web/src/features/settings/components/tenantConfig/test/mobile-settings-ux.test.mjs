import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../NexOpsSettingsPage.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../tenantConfig.css", import.meta.url), "utf8");

test("Settings mobile actions stay in the viewport and the global create control does not cover them", () => {
  assert.match(styles, /\.tenant-config-page \.nexops-page-heading > button,[\s\S]*width: 100%/);
  assert.match(styles, /body:has\(\.tenant-config-page\) \.nexops-mobile-create-fab[\s\S]*display: none/);
  assert.match(styles, /\.tenant-config-page \.nexops-module-card[\s\S]*padding: 15px/);
});

test("Settings isolate onboarding instead of rendering the guided wizard inline", () => {
  assert.doesNotMatch(page, /Secure Post-Subscription Onboarding/);
  assert.doesNotMatch(page, /Guided Configuration/);
  assert.doesNotMatch(page, /Complete \$\{ONBOARDING_STEPS/);
});

test("Document Design keeps the real PDF preview and gives loading/error states a deliberate treatment", () => {
  assert.match(page, /response\.headers\.get\("content-type"\)\?\.includes\("application\/pdf"\)/);
  assert.match(page, /title=\{kind \+ " PDF preview"\}/);
  assert.match(page, /className="nexops-pdf-preview-frame"/);
  assert.match(styles, /\.nexops-pdf-preview-status/);
});

test("Destructive settings actions do not share the primary lime treatment", () => {
  assert.match(page, /className="nexops-settings-action--danger"[\s\S]*Remove Step/);
  assert.match(styles, /\.nexops-settings-action--danger[\s\S]*background: #fff8f7/);
});
