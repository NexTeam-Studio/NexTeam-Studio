import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./NexOpsRequestsPage.tsx", import.meta.url), "utf8");

test("Requests uses the shared roster and detail templates", () => {
  assert.match(source, /NexOpsCreationTemplate/);
  assert.match(source, /<NexOpsRosterTemplate/);
  assert.match(source, /<NexOpsDetailTemplate/);
  assert.match(source, /Back to Request Roster/);
  assert.match(source, /aria-label="Request status filters"/);
  assert.match(source, /requests\.find\(\(request\) => request\.id === selectedRequestId\) \?\? null/);
  assert.doesNotMatch(source, /\?\? filteredRequests\[0\]/);
  assert.match(source, /setSelectedRequestId\(\(current\) => current && nextRequests\.some\(\(request\) => request\.id === current\) \? current : ""\)/);
  assert.doesNotMatch(source, /eyebrow="NexOps Intake"/);
  assert.doesNotMatch(source, /<small>\{filteredRequests\.length\}<\/small>/);
  assert.match(source, /Backfill Legacy Leads/);
});

test("Requests uses Title Case for named interface areas and controls", () => {
  for (const label of [
    "Office Intake",
    "Create a Request",
    "New Client",
    "Existing Client",
    "Request Form",
    "Multi-Form Library",
    "Website Intake Forms",
    "Search Requests",
    "Request Detail",
    "Next Office Move",
    "Downstream Field Visibility",
    "Backfill Legacy Leads"
  ]) {
    assert.ok(source.includes(label), `missing ${label}`);
  }
});

test("Requests keeps explanatory copy in sentence case", () => {
  assert.ok(source.includes("Open only when the office needs to enter a request by hand."));
  assert.ok(source.includes("Capture, review, and move verified service requests into quotes or jobs without losing their client and property context."));
});
