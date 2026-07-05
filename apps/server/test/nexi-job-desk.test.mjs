import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ingestSiteJobBlueprint } from "../dist/nexi/siteJobBlueprintIngest.js";
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
