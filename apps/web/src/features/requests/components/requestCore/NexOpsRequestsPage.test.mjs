import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./NexOpsRequestsPage.tsx", import.meta.url), "utf8");

test("Requests opens with the shared icon page title", () => {
  assert.match(source, /import \{ NexOpsPageTitle \} from "\.\.\/\.\.\/\.\.\/nexopsShell\/components\/NexOpsPageTitle"/);
  assert.match(source, /<NexOpsPageTitle module="requests">Requests<\/NexOpsPageTitle>/);
  assert.doesNotMatch(source, /<h1>Requests<\/h1>/);
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
    "Request Queue",
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
  assert.ok(source.includes("Real request objects, office intake, website forms, and downstream field carry-forward all live here now."));
});
