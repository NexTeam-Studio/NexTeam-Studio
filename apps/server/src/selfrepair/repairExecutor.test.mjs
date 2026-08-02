import test from "node:test";
import assert from "node:assert/strict";
import { SafeSelfRepairExecutor } from "./repairExecutor.ts";

test("safe repair executor records the responsible agent and verification", async () => {
  const results = await new SafeSelfRepairExecutor().execute([{
    id: "repair_1",
    type: "wall_entry_candidate",
    targetRef: "conversation:1",
    applied: true,
    summary: "Recorded a regression guard for the reported wording."
  }]);
  assert.deepEqual(results, [{
    repairId: "repair_1",
    repairAgent: "Nexi Regression Guard Agent",
    status: "performed",
    resolution: "Recorded a regression guard for the reported wording.",
    verification: "The approved metadata-only repair receipt was written to this tenant-scoped audit record.",
    verified: true
  }]);
});
