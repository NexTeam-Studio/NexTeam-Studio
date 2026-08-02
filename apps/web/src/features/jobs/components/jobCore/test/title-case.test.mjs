import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("job areas and actions use shared title capitalization", () => {
  const page = readFileSync(fileURLToPath(new URL("../NexOpsJobsPage.tsx", import.meta.url)), "utf8");

  for (const label of [
    "Manual Create",
    "New Job",
    "Job Roster",
    "Next Move",
    "Review Follow-Up",
    "Booking Confirmation",
    "Client Hub Visibility",
    "Billing, Reminders, and History",
    "Create Quick Payment Request",
    "Send Booking Confirmation"
  ]) {
    assert.match(page, new RegExp(`>${label.replaceAll("?", "\\?")}<|\"${label}\"`));
  }

  assert.doesNotMatch(page, />Manual create</);
  assert.doesNotMatch(page, />Create quick payment request</);
});
