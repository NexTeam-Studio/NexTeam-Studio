import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsPagePath = new URL("../tenantConfig/NexOpsSettingsPage.tsx", import.meta.url);

test("Settings uses Title Case for named controls and sentence case for explanatory copy", async () => {
  const settingsPage = await readFile(settingsPagePath, "utf8");

  for (const label of [
    "Viewer Role",
    "Portal and Billing Defaults",
    "Client Hub Reverify Window (Days)",
    "Review Follow-Up",
    "Sequence Defaults",
    "Global Catalog",
    "Outbound Template Manager",
    "Salesperson and Routing Options",
    "Edit Catalog Item",
    "Save Template"
  ]) {
    assert.match(settingsPage, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(settingsPage, /Configure the business rules, documents, team access, and client experience your office uses every day\./);
});
