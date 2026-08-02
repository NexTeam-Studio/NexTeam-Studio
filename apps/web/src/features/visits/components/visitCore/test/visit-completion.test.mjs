import test from "node:test";
import assert from "node:assert/strict";

import { visitCanBeCompleted } from "../visitCompletion.ts";

test("only active writable visits expose the completion action", () => {
  assert.equal(visitCanBeCompleted({ status: "scheduled" }), true);
  assert.equal(visitCanBeCompleted({ status: "in_progress" }), true);
  assert.equal(visitCanBeCompleted({ status: "complete" }), false);
  assert.equal(visitCanBeCompleted({ status: "cancelled" }), false);
  assert.equal(visitCanBeCompleted({ status: "scheduled", readOnly: true }), false);
});
