import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ingestSiteJobBlueprint } from "../dist/nexi/siteJobBlueprintIngest.js";
import { extractCompanyCamReportFields, siteJobBlueprintFromCompanyCamReport } from "../dist/nexi/reportDocuments.js";
import { answerNexiMessage } from "../dist/nexi/nexiService.js";
import { createNexiJobDeskTools } from "../dist/nexi/nexiTools.js";
import { MemoryNexiRepository } from "../dist/nexi/nexiRepository.js";
import { MemoryUsageLogWriter } from "../dist/usageLog.js";
import { enforceSources, promptIsMetaOrFeedback, runNexiToolLoop } from "@nexteam/nexi";

function tenant() {
  return {
    id: "aquatrace",
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "jobber", media: "companycam", email: "gmail_relay" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

test("Camp Mikell fixture extracts 101000 gallons", () => {
  const blueprint = ingestSiteJobBlueprint({
    tenantId: "aquatrace",
    sourceId: "camp-mikell-checklist",
    text: "Camp Mikell pool checklist fixture. Expected gallons field from legacy acceptance: 101000."
  });
  assert.equal(blueprint.kind, "site_blueprint");
  assert.equal(blueprint.fields.poolGallons, 101000);
});

test("source check blocks factual answers without sources", () => {
  const checked = enforceSources("The job has 101000 gallons.", []);
  assert.equal(checked.ok, false);
  assert.equal(checked.answer, "I don't have a verified source for that yet.");
});

test("source check does not block meta or feedback turns", () => {
  const meta = enforceSources("I use Jobber, CompanyCam, and native SiteJobBlueprint sources.", [], "What sources do you use");
  assert.equal(meta.ok, true);
  assert.equal(promptIsMetaOrFeedback("The thumbnails are not clickable or savable"), true);
  const feedback = enforceSources("I logged that correction against my prior job answer.", [], "Wrong answer");
  assert.equal(feedback.ok, true);
});

test("Nexi tool loop preloads obvious tools and records cache metrics", async () => {
  const calls = [];
  let parsedToolArgs = null;
  const fetchFn = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      content: [{ type: "text", text: "I found one Jobber job for today." }],
      usage: { input_tokens: 10, output_tokens: 8, cache_creation_input_tokens: 0, cache_read_input_tokens: 64 }
    }), { status: 200 });
  };
  const usageLog = new MemoryUsageLogWriter();
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What is on the schedule today?" }],
    tools: [{
      name: "getSchedule",
      description: "Read schedule.",
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      inputJsonSchema: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" } },
        required: ["from", "to"]
      },
      handler: async (_tenant, args) => {
        parsedToolArgs = args;
        return {
          result: { jobs: [{ id: "job_1", title: "Leak detection" }] },
          sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Leak detection" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    usageLog,
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].tools, []);
  assert.match(calls[0].messages.at(-1).content, /Verified getSchedule result/);
  assert.match(parsedToolArgs.from, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(parsedToolArgs.to, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(result.sources.length, 1);
  assert.equal(result.usage.cacheReadInputTokens, 64);
  assert.equal(usageLog.records.length, 1);
  assert.equal(usageLog.records[0].usage.cacheReadInputTokens, 64);
});

test("Nexi schedule prompts parse requested calendar dates in tenant timezone", async () => {
  const calls = [];
  let parsedToolArgs = null;
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What's on Monday July 6, 2026?" }],
    tools: [{
      name: "getSchedule",
      description: "Read schedule.",
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      inputJsonSchema: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" } },
        required: ["from", "to"]
      },
      handler: async (_tenant, args) => {
        parsedToolArgs = args;
        return {
          result: {
            jobs: [{
              id: "job_1",
              title: "Rachel Payne leak detection",
              startAt: "2026-07-06T04:00:00.000Z",
              endAt: "2026-07-07T03:59:59.000Z"
            }]
          },
          sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Rachel Payne leak detection" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "Rachel Payne is scheduled on Monday July 6." }],
        usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
      }), { status: 200 });
    }
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(parsedToolArgs, {
    from: "2026-07-06T04:00:00.000Z",
    to: "2026-07-07T04:00:00.000Z"
  });
  assert.match(calls[0].messages.at(-1).content, /Verified getSchedule result/);
  assert.equal(result.sources.length, 1);
});

test("Nexi does not force schedule lookup for meta questions that mention today", async () => {
  const calls = [];
  let toolCalled = false;
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What sources do you use today?" }],
    tools: [{
      name: "getSchedule",
      description: "Read schedule.",
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      handler: async () => {
        toolCalled = true;
        return {
          result: { jobs: [] },
          sources: [{ rail: "jobber", ref: "jobs", label: "Jobber jobs GraphQL read" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "I use Jobber, CompanyCam, and native SiteJobBlueprint sources." }],
        usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
      }), { status: 200 });
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tools.length, 1);
  assert.equal(toolCalled, false);
  assert.equal(result.answer, "I use Jobber, CompanyCam, and native SiteJobBlueprint sources.");
});

test("Nexi photo prompts extract the CompanyCam project query", async () => {
  const calls = [];
  let parsedToolArgs = null;
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "Find CompanyCam photos for Deborah Justice. Use getPhotos and include sources." }],
    tools: [{
      name: "getPhotos",
      description: "Read photos.",
      inputSchema: z.object({ projectQuery: z.string() }),
      handler: async (_tenant, args) => {
        parsedToolArgs = args;
        return {
          result: { project: { name: "Deborah Justice" }, media: [{ id: "photo_1" }] },
          sources: [{ rail: "companycam", ref: "photo_1", label: "CompanyCam photo photo_1" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "I found one CompanyCam photo." }],
        usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
      }), { status: 200 });
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(parsedToolArgs.projectQuery, "Deborah Justice");
  assert.equal(result.sources.length, 1);
});

test("Nexi exact photo prompt extracts trailing entity before photos", async () => {
  const calls = [];
  let parsedToolArgs = null;
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "Show me the Deborah Justice photos" }],
    tools: [{
      name: "getPhotos",
      description: "Read photos.",
      inputSchema: z.object({ projectQuery: z.string() }),
      handler: async (_tenant, args) => {
        parsedToolArgs = args;
        return {
          result: { project: { name: "Deborah Justice" }, media: [{ id: "photo_1" }] },
          sources: [{ rail: "companycam", ref: "photo_1", label: "CompanyCam photo photo_1" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "I found one Deborah Justice photo." }],
        usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
      }), { status: 200 });
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(parsedToolArgs.projectQuery, "Deborah Justice");
  assert.equal(result.sources.length, 1);
  assert.equal(result.toolRuns[0].name, "getPhotos");
});

test("Nexi schedule follow-ups use prior conversation date window", async () => {
  let parsedToolArgs = null;
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "What's on Monday July 6, 2026?" },
      { role: "assistant", content: "Rachel Payne is scheduled on Monday July 6, 2026." },
      { role: "user", content: "What's the ETA?" }
    ],
    tools: [{
      name: "getSchedule",
      description: "Read schedule.",
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      inputJsonSchema: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" } },
        required: ["from", "to"]
      },
      handler: async (_tenant, args) => {
        parsedToolArgs = args;
        return {
          result: { jobs: [{ id: "job_1", title: "Rachel Payne leak detection" }] },
          sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Rachel Payne leak detection" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "Rachel Payne is scheduled all day Monday." }],
      usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
    }), { status: 200 })
  });
  assert.deepEqual(parsedToolArgs, {
    from: "2026-07-06T04:00:00.000Z",
    to: "2026-07-07T04:00:00.000Z"
  });
  assert.equal(result.sources.length, 1);
});

test("Nexi reuses cached deterministic tool runs for context follow-ups", async () => {
  const calls = [];
  let toolCalled = false;
  const cachedToolRuns = [{
    name: "getSchedule",
    result: {
      window: { from: "2026-07-06T04:00:00.000Z", to: "2026-07-07T04:00:00.000Z" },
      jobs: [{ id: "job_1", title: "Rachel Payne leak detection" }]
    },
    sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Rachel Payne leak detection" }]
  }];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "What's on Monday July 6, 2026?" },
      { role: "assistant", content: "Rachel Payne is scheduled on Monday July 6, 2026." },
      { role: "user", content: "What's the ETA?" }
    ],
    tools: [{
      name: "getSchedule",
      description: "Read schedule.",
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      inputJsonSchema: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" } },
        required: ["from", "to"]
      },
      handler: async () => {
        toolCalled = true;
        throw new Error("cached follow-up should not re-query getSchedule");
      }
    }],
    cachedToolRuns,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "Rachel Payne is still the Monday schedule item." }],
        usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
      }), { status: 200 });
    }
  });
  assert.equal(toolCalled, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].tools, []);
  assert.match(calls[0].messages.at(-2).content, /cached verified source data/);
  assert.deepEqual(result.toolRuns, cachedToolRuns);
  assert.equal(result.sources[0].ref, "job_1");
});

test("Nexi report prompts preload CompanyCam documents with the requested entity", async () => {
  const calls = [];
  let parsedToolArgs = null;
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What were the pool leak detection results for Deborah Justice in CompanyCam report?" }],
    tools: [{
      name: "getDocuments",
      description: "Read documents.",
      inputSchema: z.object({ projectQuery: z.string(), question: z.string().optional() }),
      handler: async (_tenant, args) => {
        parsedToolArgs = args;
        return {
          result: {
            project: { id: "107503799", name: "Deborah Justice" },
            reports: [{ fields: { reportFindings: "Leak found at return fitting." } }]
          },
          sources: [{ rail: "companycam", ref: "18218446", label: "CompanyCam document leak checklist" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "The CompanyCam report says leak found at return fitting." }],
        usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
      }), { status: 200 });
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(parsedToolArgs.projectQuery, "Deborah Justice");
  assert.match(parsedToolArgs.question, /Deborah Justice/);
  assert.equal(result.sources.length, 1);
});

test("Nexi issue prompts preload both Jobber and CompanyCam rails", async () => {
  const calls = [];
  const toolNames = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What was the issue at Deborah Justice?" }],
    tools: [
      {
        name: "getJobDetail",
        description: "Read job.",
        inputSchema: z.object({ nameQuery: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolNames.push(["getJobDetail", args]);
          return {
            result: { job: { id: "job_1", title: "Swimming Pool Leak Detection", client: { name: "Deborah Justice" } } },
            sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Deborah Justice" }]
          };
        }
      },
      {
        name: "getDocuments",
        description: "Read documents.",
        inputSchema: z.object({ projectQuery: z.string(), question: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolNames.push(["getDocuments", args]);
          return {
            result: { reports: [{ fields: { reportFindings: "Leak at primary spa circulation line." } }] },
            sources: [{ rail: "companycam", ref: "doc_1", label: "CompanyCam document Deborah Justice report" }]
          };
        }
      }
    ],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "Jobber identifies the job and CompanyCam says the issue was the primary spa circulation line." }],
        usage: { input_tokens: 12, output_tokens: 9, cache_read_input_tokens: 16 }
      }), { status: 200 });
    }
  });
  assert.deepEqual(toolNames.map((entry) => entry[0]), ["getJobDetail", "getDocuments"]);
  assert.equal(toolNames[0][1].nameQuery, "What was the issue at Deborah Justice?");
  assert.equal(toolNames[1][1].projectQuery, "Deborah Justice");
  assert.match(calls[0].messages.at(-1).content, /Verified getJobDetail result/);
  assert.match(calls[0].messages.at(-1).content, /Verified getDocuments result/);
  assert.equal(result.sources.some((source) => source.rail === "jobber"), true);
  assert.equal(result.sources.some((source) => source.rail === "companycam"), true);
});

test("Nexi technician prompts preload Jobber plus CompanyCam documents and photos", async () => {
  const toolNames = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "Who was the technician for Deborah Justice?" }],
    tools: [
      {
        name: "getJobDetail",
        description: "Read job.",
        inputSchema: z.object({ nameQuery: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolNames.push(["getJobDetail", args]);
          return {
            result: { job: { id: "job_1", title: "Swimming Pool Leak Detection", client: { name: "Deborah Justice" } } },
            sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Deborah Justice" }]
          };
        }
      },
      {
        name: "getDocuments",
        description: "Read documents.",
        inputSchema: z.object({ projectQuery: z.string(), question: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolNames.push(["getDocuments", args]);
          return {
            result: { reports: [{ textSnippet: "Technician: Cody" }] },
            sources: [{ rail: "companycam", ref: "doc_1", label: "CompanyCam document Deborah Justice report" }]
          };
        }
      },
      {
        name: "getPhotos",
        description: "Read photos.",
        inputSchema: z.object({ projectQuery: z.string() }),
        handler: async (_tenant, args) => {
          toolNames.push(["getPhotos", args]);
          return {
            result: { media: [{ id: "photo_1", capturedBy: "Cody" }] },
            sources: [{ rail: "companycam", ref: "photo_1", label: "CompanyCam photo photo_1" }]
          };
        }
      }
    ],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "CompanyCam indicates Cody was the technician." }],
      usage: { input_tokens: 12, output_tokens: 9, cache_read_input_tokens: 16 }
    }), { status: 200 })
  });
  assert.deepEqual(toolNames.map((entry) => entry[0]), ["getJobDetail", "getDocuments", "getPhotos"]);
  assert.equal(toolNames[1][1].projectQuery, "Deborah Justice");
  assert.equal(toolNames[2][1].projectQuery, "Deborah Justice");
  assert.equal(result.toolRuns.length, 3);
  assert.equal(result.sources.some((source) => source.rail === "jobber"), true);
  assert.equal(result.sources.filter((source) => source.rail === "companycam").length, 2);
});

test("Nexi service persists failureLog for source-enforced failures", async () => {
  const repository = new MemoryNexiRepository();
  const result = await answerNexiMessage({
    tenant: tenant(),
    message: "How many gallons are in the job?",
    tools: [],
    repository,
    gateway: async () => ({
      answer: "I don't have a verified source for that yet.",
      sources: [],
      usage: { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalTokens: 2 },
      raw: { test: true },
      failureReason: "factual_answer_without_sources",
      toolRuns: []
    })
  });
  assert.match(result.failureId, /^fail_/);
  assert.equal(repository.failureLog.length, 1);
  assert.equal(repository.failureLog[0].reason, "factual_answer_without_sources");
});

test("Nexi service persists tool runs for conversation reuse", async () => {
  const repository = new MemoryNexiRepository();
  const toolRuns = [{
    name: "getSchedule",
    result: { jobs: [{ id: "job_1", title: "Rachel Payne leak detection" }] },
    sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Rachel Payne leak detection" }]
  }];
  const result = await answerNexiMessage({
    tenant: tenant(),
    message: "What's on Monday July 6, 2026?",
    conversationId: "trial-date-context",
    tools: [],
    repository,
    gateway: async (request) => {
      assert.match(request.system, /Answer only what was asked/);
      assert.deepEqual(request.cachedToolRuns, []);
      return {
        answer: "Rachel Payne is scheduled Monday.",
        sources: toolRuns[0].sources,
        usage: { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalTokens: 2 },
        raw: { test: true },
        toolRuns
      };
    }
  });
  assert.equal(result.toolRuns.length, 1);
  assert.equal(repository.conversations[0].toolRuns[0].name, "getSchedule");

  await answerNexiMessage({
    tenant: tenant(),
    message: "What's the ETA?",
    conversationId: "trial-date-context",
    tools: [],
    repository,
    gateway: async (request) => {
      assert.equal(request.cachedToolRuns.length, 1);
      assert.equal(request.cachedToolRuns[0].name, "getSchedule");
      return {
        answer: "Same Monday schedule item.",
        sources: request.cachedToolRuns[0].sources,
        usage: { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalTokens: 2 },
        raw: { test: true },
        toolRuns: request.cachedToolRuns
      };
    }
  });
  assert.equal(repository.conversations.length, 2);
});

test("CompanyCam report fields produce entity-keyed SiteJobBlueprints", async () => {
  const fields = extractCompanyCamReportFields(`
Swimming Pool Leak Detection Details /Results
-- 2 of 10 --
Leak detection found water loss at the return line and skimmer throat.
-- 3 of 10 --
Estimated Approximate Total Gallons
32,500 Gallons
`);
  assert.equal(fields.poolGallons, 32500);
  assert.match(fields.reportFindings, /return line/i);
  const blueprint = siteJobBlueprintFromCompanyCamReport({
    tenantId: "aquatrace",
    project: {
      id: "107503799",
      name: "Deborah Justice",
      externalIds: { companycam: "107503799" },
      address: { street1: "181 Isbell Road", city: "Fair Play", province: "South Carolina", postalCode: "29643" }
    },
    report: {
      document: {
        id: "18218446",
        tenantId: "aquatrace",
        label: "Exported - Current Aquatrace Swimming Pool Leak Detection Checklist 07-02-2026.pdf",
        storageRef: "companycam-doc:18218446",
        externalIds: { companycam: "18218446" }
      },
      fields,
      textSnippet: "Estimated Approximate Total Gallons 32,500 Gallons",
      byteLength: 1024,
      parsed: true
    }
  });
  assert.equal(blueprint.fields.projectName, "Deborah Justice");
  assert.equal(blueprint.fields.poolGallons, 32500);
  const repository = new MemoryNexiRepository();
  await repository.saveSiteJobBlueprint(blueprint);
  const tool = createNexiJobDeskTools({}, repository).find((candidate) => candidate.name === "lookupSiteJobBlueprintField");
  const match = await tool.handler(tenant(), { field: "poolGallons", requestedEntity: "Deborah Justice" });
  assert.equal(match.result.value, 32500);
});

test("SiteJobBlueprint field lookup rejects mismatched requested entity", async () => {
  const repository = new MemoryNexiRepository();
  await repository.saveSiteJobBlueprint({
    id: "site_job_camp_mikell",
    tenantId: "aquatrace",
    kind: "site_blueprint",
    fields: { poolGallons: 101000 },
    extractedFrom: "camp-mikell-checklist-live",
    extractedAt: new Date().toISOString()
  });
  const tool = createNexiJobDeskTools({}, repository).find((candidate) => candidate.name === "lookupSiteJobBlueprintField");
  assert.ok(tool);

  const mismatch = await tool.handler(tenant(), { field: "poolGallons", requestedEntity: "Deborah Justice" });
  assert.deepEqual(mismatch.sources, []);
  assert.equal(mismatch.result.value, null);
  assert.equal(mismatch.result.requestedEntity, "Deborah Justice");

  const match = await tool.handler(tenant(), { field: "poolGallons", requestedEntity: "Camp Mikell" });
  assert.equal(match.result.value, 101000);
  assert.equal(match.sources.length, 1);
  assert.match(match.sources[0].label, /camp-mikell-checklist-live/);
});

test("Nexi service logs user-flagged incorrect answers with correction context", async () => {
  const repository = new MemoryNexiRepository();
  await repository.saveConversation({
    tenantId: "aquatrace",
    conversationId: "trial-day-1",
    userText: "Who are the technicians for Deborah Justice",
    assistantText: "No technician is listed in Jobber.",
    sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Deborah Justice" }]
  });
  const result = await answerNexiMessage({
    tenant: tenant(),
    message: "Wrong answer, the technician was in CompanyCam.",
    conversationId: "trial-day-1",
    tools: [],
    repository,
    gateway: async () => {
      throw new Error("correction handling should not call the model");
    }
  });
  assert.match(result.failureId, /^fail_/);
  assert.equal(repository.failureLog.length, 1);
  assert.equal(repository.failureLog[0].reason, "user_flagged_incorrect");
  assert.match(repository.failureLog[0].correctionText, /CompanyCam/);
  assert.equal(repository.failureLog[0].flaggedAnswer, "No technician is listed in Jobber.");
  assert.match(result.answer, /logged/i);
});
