import assert from "node:assert/strict";
import test from "node:test";
import { decideSelfRepair } from "./repairPolicy.ts";

test("repair policy permits only the locked metadata-only toolbox", () => {
  const allowed = decideSelfRepair({
    id: "repair_wall_001",
    type: "wall_entry_candidate",
    targetRef: "conversation:1",
    applied: true,
    summary: "Created a regression guard from the failed wording."
  });
  assert.equal(allowed.allowed, true);

  const denied = decideSelfRepair({
    id: "repair_gap_001",
    type: "gap_label_correction",
    targetRef: "failureLog:1",
    before: "unknown",
    after: "send email now",
    applied: true,
    summary: "Change the diagnostic label."
  });
  assert.equal(denied.allowed, false);
  assert.match(denied.reason, /protected action/i);
});
