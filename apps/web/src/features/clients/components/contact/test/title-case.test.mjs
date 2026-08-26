import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rosterSource = readFileSync(new URL("../ContactRoster.tsx", import.meta.url), "utf8");
const intakeSource = readFileSync(new URL("../NexOpsCreateClientPanel.tsx", import.meta.url), "utf8");

test("client roster names controls and columns in Title Case", () => {
  for (const label of [
    "All Clients",
    "Filter",
    "Search Clients",
    "Primary Address",
    "Client Record",
    "Open Client"
  ]) {
    assert.match(rosterSource, new RegExp(label));
  }

  assert.doesNotMatch(rosterSource, /Filter by Tag \+/);
  assert.doesNotMatch(rosterSource, /Native record/);
});

test("client intake names fields and actions in Title Case without changing helper sentences", () => {
  for (const label of [
    "New Client",
    "First Name",
    "Phone Number",
    "Phone Type",
    "Email Type",
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
