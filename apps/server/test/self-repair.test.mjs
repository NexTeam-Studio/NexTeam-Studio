import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { AnthropicSelfRepairAnalyzer } from "../dist/selfrepair/anthropicAnalyzer.js";
import { DeterministicSelfRepairAnalyzer } from "../dist/selfrepair/analyzer.js";
import { InMemorySelfRepairRepository } from "../dist/selfrepair/repository.js";
import { registerSelfRepairRoutes } from "../dist/selfrepair/routes.js";
import { SelfRepairService } from "../dist/selfrepair/service.js";

const date = "2026-07-08";

function exportData() {
  return {
    tenantId: "aquatrace",
    exportedAt: `${date}T23:00:00.000Z`,
    collections: {
      conversations: [
        {
          id: "conv_email_down",
          tenantId: "aquatrace",
          userText: "check inbox and order unread emails",
          assistantText: "I couldn't find an email that matched. I logged the lookup instead of guessing.",
          sources: [],
          createdAt: `${date}T18:00:00.000Z`
        },
        {
          id: "conv_evap_chat",
          tenantId: "aquatrace",
          userText: "use the evaporation calculator on Deborah Justice's pool",
          assistantText: "I don't have that written down anywhere yet. I wrote it down so we can fill the gap.",
          sources: [],
          createdAt: `${date}T18:05:00.000Z`
        },
        {
          id: "conv_spa_drains",
          tenantId: "aquatrace",
          userText: "how many spa main drains did Deborah Justice have",
          assistantText: "I don't have that written down anywhere yet. I wrote it down so we can fill the gap.",
          sources: [],
          createdAt: `${date}T18:10:00.000Z`
        },
        {
          id: "conv_ok",
          tenantId: "aquatrace",
          userText: "what is on today's schedule",
          assistantText: "I checked the schedule. You have one job.",
          sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job" }],
          createdAt: `${date}T18:15:00.000Z`
        }
      ],
      failureLog: [
        {
          id: "fail_pdf_gap",
          tenantId: "aquatrace",
          module: "nexi",
          op: "message",
          question: "email me the report PDFs",
          reason: "email_search_empty",
          correctionText: "Attachment sending is not built yet.",
          sources: [],
          createdAt: `${date}T18:20:00.000Z`
        }
      ],
      usageLog: [
        {
          tenantId: "aquatrace",
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          routeActionName: "/api/nexi/message",
          taskType: "job_desk_answer",
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            totalTokens: 15
          },
          estimatedCostUsd: 0.01,
          ok: true,
          errorSummary: "",
          createdAt: `${date}T18:25:00.000Z`
        }
      ],
      tenantAdapterStatuses: [],
      nexiRegressionWallRuns: []
    }
  };
}

function serviceParts() {
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const repository = new InMemorySelfRepairRepository();
  const dataReader = { exportTenantData: async () => exportData() };
  const service = new SelfRepairService({
    dataReader,
    repository,
    approvalQueue,
    env: { SELF_REPAIR_REPORT_EMAIL: "owner@example.test" }
  });
  return { service, repository, approvalQueue };
}

test("deterministic self-repair analysis detects the P1 email, evap, and spa rail failures", () => {
  const analyzer = new DeterministicSelfRepairAnalyzer();
  const analysis = analyzer.analyze({
    tenantId: "aquatrace",
    date,
    exportData: exportData(),
    recentLogs: []
  });
  assert.deepEqual(analysis.findings.map((finding) => finding.classId), [
    "C_INTENT_MISROUTING",
    "C_INTENT_MISROUTING",
    "A_SINGLE_RAIL_CONCLUSION"
  ]);
  assert.equal(analysis.fixBriefs.length, 3);
  assert.equal(analysis.safeRepairs.some((repair) => repair.type === "gap_label_correction"), true);
  assert.equal(analysis.safeRepairs.some((repair) => repair.type === "wall_entry_candidate"), true);
});

test("self-repair service stores log and queues a morning report approval without sending outbound mail", async () => {
  const { service, approvalQueue } = serviceParts();
  const log = await service.run({ tenantId: "aquatrace", date });
  assert.equal(log.checked.conversations, 4);
  assert.equal(log.checked.failureLog, 1);
  assert.equal(log.checked.usageLog, 1);
  assert.equal(log.found, 3);
  assert.equal(log.autoRepaired, 4);
  assert.match(log.morningReport, /Self-repair report for aquatrace/);
  assert.match(log.morningReport, /use the evaporation calculator on Deborah Justice's pool/);
  assert.ok(log.morningReportApprovalId);

  const pending = await approvalQueue.listPending("aquatrace");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].kind, "email");
  assert.equal(pending[0].execute.service, "selfRepair");
  assert.equal(pending[0].execute.op, "sendMorningReport");
  assert.equal(pending[0].execute.args.noOutboundSend, true);
});

test("anthropic self-repair analyzer merges provider findings and writes usageLog cost", async () => {
  const usageRecords = [];
  const fetchFn = async () => new Response(JSON.stringify({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          findings: [
            {
              classId: "G_USER_FACING_REALITY_GAP",
              priority: "P2",
              title: "User-facing receipt says done but owner path is not visible",
              evidenceRefs: ["conversation:conv_ok"],
              reproPhrasings: ["show me where I upload a photo"],
              suspectedFiles: ["apps/web/src/App.tsx"],
              notes: "Provider-added finding from compact daily context."
            }
          ],
          watchItems: ["Review user-facing status wording against Part 9."]
        })
      }
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    }
  }), { status: 200, headers: { "content-type": "application/json" } });
  const analyzer = new AnthropicSelfRepairAnalyzer({
    env: { ANTHROPIC_API_KEY: "placeholder", ANTHROPIC_MODEL: "claude-sonnet-4-5" },
    fetchFn,
    usageLog: { write: async (record) => usageRecords.push(record) }
  });

  const analysis = await analyzer.analyze({
    tenantId: "aquatrace",
    date,
    exportData: exportData(),
    recentLogs: []
  });

  assert.equal(analysis.analysisMode, "anthropic-gateway");
  assert.equal(analysis.findings.some((finding) => finding.classId === "G_USER_FACING_REALITY_GAP"), true);
  assert.equal(analysis.safeRepairs.some((repair) => repair.id.startsWith("repair_llm_wall_")), true);
  assert.equal(analysis.fixBriefs.some((brief) => brief.id.startsWith("fix_brief_llm_")), true);
  assert.equal(usageRecords.length, 1);
  assert.equal(usageRecords[0].provider, "anthropic");
  assert.equal(usageRecords[0].taskType, "self_repair_analysis");
  assert.equal(usageRecords[0].ok, true);
  assert.equal(usageRecords[0].usage.totalTokens, 150);
  assert.equal(usageRecords[0].estimatedCostUsd > 0, true);
});

test("anthropic self-repair analyzer preserves deterministic findings when provider JSON is malformed", async () => {
  const usageRecords = [];
  const fetchFn = async () => new Response(JSON.stringify({
    content: [
      {
        type: "text",
        text: '{"findings":[{"classId":"A_SINGLE_RAIL_CONCLUSION" "priority":"P1"}]}'
      }
    ],
    usage: {
      input_tokens: 25,
      output_tokens: 10,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    }
  }), { status: 200, headers: { "content-type": "application/json" } });
  const analyzer = new AnthropicSelfRepairAnalyzer({
    env: { ANTHROPIC_API_KEY: "placeholder", ANTHROPIC_MODEL: "claude-sonnet-4-5" },
    fetchFn,
    usageLog: { write: async (record) => usageRecords.push(record) }
  });

  const analysis = await analyzer.analyze({
    tenantId: "aquatrace",
    date,
    exportData: exportData(),
    recentLogs: []
  });

  assert.equal(analysis.analysisMode, "anthropic-gateway");
  assert.deepEqual(analysis.findings.map((finding) => finding.classId), [
    "C_INTENT_MISROUTING",
    "C_INTENT_MISROUTING",
    "A_SINGLE_RAIL_CONCLUSION"
  ]);
  assert.equal(analysis.watchItems.some((item) => item.includes("could not be parsed")), true);
  assert.equal(usageRecords.length, 1);
  assert.equal(usageRecords[0].ok, true);
});

test("self-repair recurrence escalates repeated findings in later runs", async () => {
  const { service } = serviceParts();
  await service.run({ tenantId: "aquatrace", date });
  const second = await service.run({ tenantId: "aquatrace", date });
  assert.equal(second.findings.every((finding) => finding.recurrenceCount >= 2), true);
  assert.equal(second.watchItems.length, 3);
});

test("self-repair routes are owner/admin gated and expose run plus log reads", async () => {
  const { service } = serviceParts();
  const app = express();
  app.use(express.json());
  registerSelfRepairRoutes(app, {
    service,
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "false", TENANT_ID: "aquatrace", SELF_REPAIR_REPORT_EMAIL: "owner@example.test" }
  });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const run = await fetch(`${base}/api/self-repair/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", date })
    }).then((response) => response.json());
    assert.equal(run.ok, true);
    assert.equal(run.log.found, 3);

    const listed = await fetch(`${base}/api/self-repair/logs?tenantId=aquatrace`).then((response) => response.json());
    assert.equal(listed.ok, true);
    assert.equal(listed.logs.length, 1);

    const fetched = await fetch(`${base}/api/self-repair/logs/${date}?tenantId=aquatrace`).then((response) => response.json());
    assert.equal(fetched.ok, true);
    assert.equal(fetched.log.date, date);
  } finally {
    server.close();
  }
});
