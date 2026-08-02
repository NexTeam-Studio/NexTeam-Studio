import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rosterSource = readFileSync(new URL("../ContactRoster.tsx", import.meta.url), "utf8");
const intakeSource = readFileSync(new URL("../NexOpsCreateClientPanel.tsx", import.meta.url), "utf8");

test("client roster names controls and columns in Title Case", () => {
  for (const label of [
    "Active Clients",
    "Text-Ready",
    "Filter by Tag +",
    "Search Clients",
    "Primary Address",
    "Last Activity",
    "Imported History"
  ]) {
    assert.match(rosterSource, new RegExp(label));
  }

  assert.doesNotMatch(rosterSource, /Filter by tag \+/);
  assert.doesNotMatch(rosterSource, /Primary address/);
});

test("client intake names fields and actions in Title Case without changing helper sentences", () => {
  for (const label of [
    "New Client",
    "First Name",
    "Phone Number",
    "Property Address",
    "Add Another Phone Number",
    "Search Lead Sources",
    "Additional Client Details",
    "Billing Address",
    "Save Client"
  ]) {
    assert.match(intakeSource, new RegExp(label));
  }

  assert.match(intakeSource, /Name, phone, and address needed to save/);
  assert.doesNotMatch(intakeSource, /First name/);
  assert.doesNotMatch(intakeSource, /Property address/);
});
