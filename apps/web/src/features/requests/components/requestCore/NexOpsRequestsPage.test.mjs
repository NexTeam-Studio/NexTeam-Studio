import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./NexOpsRequestsPage.tsx", import.meta.url), "utf8");

test("Requests uses the shared roster and detail templates", () => {
  assert.match(source, /NexOpsCreationTemplate/);
  assert.match(source, /<NexOpsRosterTemplate/);
  assert.match(source, /<NexOpsDetailTemplate/);
  assert.match(source, /Back to Request Roster/);
  assert.match(source, /onOpenRequest\?: \(requestId: string\) => void/);
  assert.match(source, /onReturnToRequestRoster\?: \(\) => void/);
  assert.match(source, /\{!props\.focusedRequestId \? <>/);
  assert.match(source, /Submitted Form Details/);
  assert.match(source, /Delete Request/);
  assert.match(source, /linked Client, contact details, and property will remain unchanged/);
  assert.match(source, /Schedule Assessment/);
  assert.match(source, /Convert to Quote/);
  assert.match(source, /Convert to Job/);
  assert.match(source, /Note visibility: type Internal or Client-facing/);
  assert.match(source, /Choose Internal or Client-facing before saving the note/);
  assert.match(source, /onClick=\{\(\) => openRequestDetail\(request\.id\)\}/);
  assert.match(source, /requestDetailAnchorRef\.current\?\.scrollIntoView/);
  assert.match(source, /onClick=\{returnToRequestRoster\}/);
  assert.match(source, /aria-label="Request status filters"/);
  assert.match(source, /requests\.find\(\(request\) => request\.id === selectedRequestId\) \?\? null/);
  assert.doesNotMatch(source, /\?\? filteredRequests\[0\]/);
  assert.match(source, /setSelectedRequestId\(\(current\) => current && nextRequests\.some\(\(request\) => request\.id === current\) \? current : ""\)/);
  assert.doesNotMatch(source, /eyebrow="NexOps Intake"/);
  assert.doesNotMatch(source, /<small>\{filteredRequests\.length\}<\/small>/);
  assert.doesNotMatch(source, /Backfill Legacy Leads/);
  assert.doesNotMatch(source, /Downstream Field Visibility/);
  assert.doesNotMatch(source, /nexops-density-inline-facts/);
  assert.doesNotMatch(source, /Office Intake/);
  assert.doesNotMatch(source, /Website Intake Forms/);
  assert.doesNotMatch(source, /No Request Selected/);
});

test("Requests uses Title Case for named interface areas and controls", () => {
  for (const label of [
    "Create Request",
    "New Client",
    "Existing Client",
    "Request Form",
    "Search Requests",
    "Request Detail",
    "Next Office Move"
  ]) {
    assert.ok(source.includes(label), `missing ${label}`);
  }
});

test("Requests keeps explanatory copy in sentence case", () => {
  assert.ok(source.includes("Capture, review, and move verified service requests into quotes or jobs without losing their client and property context."));
});

test("Requests retains the default roster when request-form metadata is unavailable", () => {
  assert.match(source, /const requestsBody = await fetch\(`\/api\/crm\/requests/);
  assert.match(source, /setRequests\(nextRequests\);/);
  assert.match(source, /const formsBody = await fetch\(`\/api\/crm\/request-forms/);
  assert.match(source, /Request form setup is unavailable\./);
  assert.doesNotMatch(source, /Promise\.all\(\[\s*fetch\(`\/api\/crm\/requests/);
});
