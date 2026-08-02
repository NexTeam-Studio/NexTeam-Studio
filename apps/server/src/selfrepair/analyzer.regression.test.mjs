import assert from "node:assert/strict";
import test from "node:test";
import { DeterministicSelfRepairAnalyzer } from "./analyzer.ts";

const date = "2026-08-02";

function analyze(conversations) {
  return new DeterministicSelfRepairAnalyzer().analyze({
    tenantId: "test-tenant",
    date,
    exportData: {
      tenantId: "test-tenant",
      exportedAt: `${date}T12:00:00.000Z`,
      collections: { conversations, failureLog: [], usageLog: [], tenantAdapterStatuses: [], nexiRegressionWallRuns: [] }
    },
    recentLogs: []
  });
}

test("self-repair catches a generic response to a client delete request", () => {
  const result = analyze([{
    id: "delete-duplicate",
    userText: "Delete the duplicate client entry",
    assistantText: "I don't have that written down anywhere yet.",
    createdAt: `${date}T12:00:00.000Z`
  }]);
  assert.equal(result.findings[0]?.classId, "C_INTENT_MISROUTING");
});

test("self-repair catches a stale create-draft response to a normal lookup", () => {
  const result = analyze([{
    id: "stale-draft",
    userText: "What is the client's address?",
    assistantText: "Tell me the changed name, address, phone, or email and I'll restate the client before I save anything.",
    createdAt: `${date}T12:00:00.000Z`
  }]);
  assert.equal(result.findings[0]?.classId, "C_INTENT_MISROUTING");
});
