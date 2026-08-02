import assert from "node:assert/strict";
import test from "node:test";
import { AnthropicSelfRepairAnalyzer } from "./anthropicAnalyzer.ts";

const input = {
  tenantId: "tenant_test",
  date: "2026-08-02",
  exportData: {
    tenantId: "tenant_test",
    exportedAt: "2026-08-02T00:00:00.000Z",
    collections: {
      conversations: [],
      failureLog: [],
      usageLog: [],
      approvalQueue: [],
      tenantAdapterStatuses: [],
      nexiRegressionWallRuns: [],
      wallStatus: []
    }
  },
  recentLogs: []
};

test("Anthropic self-repair keeps malformed findings out of customer-facing watch items", async () => {
  const analyzer = new AnthropicSelfRepairAnalyzer({
    env: { ANTHROPIC_API_KEY: "placeholder" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{
        type: "text",
        text: JSON.stringify({
          findings: [
            { title: "Missing required labels one" },
            { title: "Missing required labels two" },
            { title: "Missing required labels three" },
            { title: "Missing required labels four" }
          ]
        })
      }]
    }), { status: 200, headers: { "content-type": "application/json" } }),
    fallback: {
      analyze: async () => ({
        findings: [], safeRepairs: [], fixBriefs: [], watchItems: [], analysisMode: "deterministic"
      })
    }
  });

  const analysis = await analyzer.analyze(input);
  assert.deepEqual(analysis.findings, []);
  assert.deepEqual(analysis.watchItems, [
    "Anthropic review returned 4 incomplete findings; deterministic findings were retained."
  ]);
  assert.equal(analysis.watchItems.join(" ").includes("expected"), false);
});
