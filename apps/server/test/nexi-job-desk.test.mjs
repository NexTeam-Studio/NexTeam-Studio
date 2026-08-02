import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { z } from "zod";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { createApprovalNexiTools } from "../dist/approval/nexiTools.js";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { ingestSiteJobBlueprint } from "../dist/nexi/siteJobBlueprintIngest.js";
import { answerNexiMessage, runExplicitLocalToolLoop } from "../dist/nexi/nexiService.js";
import { createCrmToolsWithOptions, queueClientCreateApproval } from "../dist/crm/nexiTools.js";
import { createNexiRouter } from "../dist/nexi/nexiRoutes.js";
import { createNexiJobDeskTools } from "../dist/nexi/nexiTools.js";
import { createContentNexiTools } from "../dist/content/nexiTools.js";
import { FirestoreNexiRepository, MemoryNexiRepository } from "../dist/nexi/nexiRepository.js";
import { mergeNexiToolSets } from "../dist/nexi/toolRegistry.js";
import { MemoryUsageLogWriter } from "../dist/usageLog.js";
import { enforceSources, promptIsActionRequest, promptIsMetaOrFeedback, runNexiToolLoop } from "@nexteam/nexi";

const NEXI_FRIENDLY_FAILURE_MESSAGE = "I couldn't pull that up just now - the check failed on my end and I've logged it to fix. Give me a moment and try again.";

function tenant() {
  return {
    id: "aquatrace",
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "native", email: "gmail_relay" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

function pendingApprovalContext(approvalId, overrides = {}) {
  return {
    approvalId,
    awaitingChanges: false,
    revisableClientCreate: false,
    revisableQuoteCreate: false,
    revisableJobCreate: false,
    revisableJobAction: false,
    revisableJobVisitSeries: false,
    revisableVisitShift: false,
    revisableLedgerAction: false,
    revisableInvoiceCompose: false,
    revisableInvoiceSend: false,
    revisableCollectPayment: false,
    revisableReceiptReview: false,
    revisableContentDraft: false,
    ...overrides
  };
}

function anthropicToolUseResponse(name, input, usage = { input_tokens: 18, output_tokens: 11, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }) {
  return new Response(JSON.stringify({
    content: [{ type: "tool_use", id: `tool_${name}`, name, input }],
    usage
  }), { status: 200 });
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
  assert.equal(checked.answer, "I don't have that written down anywhere yet. I wrote it down so we can fill the gap.");
});

test("source check does not block meta or feedback turns", () => {
  const meta = enforceSources("I use native schedule, email, and SiteJobBlueprint sources.", [], "What sources do you use");
  assert.equal(meta.ok, true);
  assert.equal(promptIsMetaOrFeedback("The thumbnails are not clickable or savable"), true);
  assert.equal(promptIsMetaOrFeedback("Great detail, organization and format sucks"), true);
  assert.equal(promptIsMetaOrFeedback("correct"), true);
  const feedback = enforceSources("I logged that correction against my prior job answer.", [], "Wrong answer");
  assert.equal(feedback.ok, true);
});

test("source check does not block email action commands or honest tool failures", () => {
  assert.equal(promptIsActionRequest("Send an email to owner@example.test saying I will call Thursday."), true);
  assert.equal(promptIsActionRequest("send me an email at owner@example.test, tell me Bryson City is on schedule for tomorrow"), true);
  assert.equal(promptIsActionRequest("write me an article about a return line leak"), true);
  const action = enforceSources("I drafted the email and parked it for approval.", [], "Send an email to owner@example.test saying I will call Thursday.");
  assert.equal(action.ok, true);
  const contentAction = enforceSources("Here is an article about what a pool owner should watch for.", [], "write me an article about a return line leak");
  assert.equal(contentAction.ok, true);
  const failure = enforceSources("I couldn't open that email yet. I wrote it down so we can fix it.", [], "What did the Semrush site audit say?");
  assert.equal(failure.ok, true);
});

test("Nexi meta/help turns answer without source stonewalls", async () => {
  for (const message of ["what commands can I use", "why did that fail", "how do I upload photos"]) {
    const result = await runNexiToolLoop({
      tenant: tenant(),
      system: "Use tools.",
      messages: [{ role: "user", content: message }],
      tools: [],
      routeActionName: "/api/nexi/message",
      taskType: "job_desk_answer",
      env: { ANTHROPIC_API_KEY: "test-key" },
      fetchFn: async () => {
        throw new Error("meta/help turns should not call Anthropic");
      }
    });
    assert.doesNotMatch(result.answer, /verified source|written down anywhere|matching email/i);
    assert.equal(result.toolRuns.length, 0);
  }
});

test("Nexi tool loop preloads obvious tools and records cache metrics", async () => {
  const calls = [];
  let parsedToolArgs = null;
  const fetchFn = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      content: [{ type: "text", text: "I found one native visit for today." }],
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
          sources: [{ rail: "native", ref: "job_1", label: "Native job Leak detection" }]
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
  assert.equal(result.sources[0].rail, "native");
  assert.equal(result.usage.cacheReadInputTokens, 64);
  assert.equal(usageLog.records.length, 1);
  assert.equal(usageLog.records[0].usage.cacheReadInputTokens, 64);
});

test("Nexi tool registry rejects duplicate tool names before the model call", () => {
  const sharedTool = {
    name: "clientLookup",
    description: "Read clients.",
    inputSchema: z.object({ q: z.string().optional() }),
    handler: async () => ({
      result: { clients: [] },
      sources: [{ rail: "native", ref: "clients", label: "Native CRM clients" }]
    })
  };

  assert.throws(
    () => mergeNexiToolSets([
      { label: "static-extra", tools: [sharedTool] },
      { label: "request-scoped", tools: [sharedTool] }
    ]),
    /Duplicate Nexi tool registration for "clientLookup"/
  );
});

test("CRM-style prompts send a unique Nexi tool list even when content tools are enabled", async () => {
  const crmTool = {
    name: "clientLookup",
    description: "Read native CRM clients.",
    inputSchema: z.object({ q: z.string().optional() }),
    inputJsonSchema: {
      type: "object",
      properties: { q: { type: "string" } }
    },
    handler: async () => ({
      result: { clients: [{ id: "client_1", name: "Aquatrace Swimming Pool Leak Detection" }] },
      sources: [{ rail: "native", ref: "client_1", label: "Native CRM client Aquatrace Swimming Pool Leak Detection" }]
    })
  };
  const tools = mergeNexiToolSets([
    { label: "static-extra", tools: [crmTool] },
    {
      label: "request-scoped",
      tools: createContentNexiTools({
        service: {},
        actorRole: "OWNER",
        actorId: "owner_chris"
      })
    }
  ]);
  let requestToolNames = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "List the CRM clients in Aquatrace right now." }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      const body = JSON.parse(init.body);
      requestToolNames = body.tools.map((tool) => tool.name);
      assert.equal(new Set(requestToolNames).size, requestToolNames.length);
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "No native NexOps clients are loaded right now." }],
        usage: { input_tokens: 11, output_tokens: 9, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
      }), { status: 200 });
    }
  });

  assert.ok(requestToolNames.includes("clientLookup"));
  assert.ok(requestToolNames.includes("generateJobContent"));
  assert.doesNotMatch(result.answer, /Tool names must be unique/i);
});

test("local Nexi fallback routes email-today prompts to summarizeInbox before schedule", async () => {
  const called = [];
  const result = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "what emails came in today" }],
    tools: [{
      name: "getSchedule",
      description: "Read schedule.",
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      handler: async () => {
        called.push("getSchedule");
        return { result: { jobs: [] }, sources: [{ rail: "native", ref: "jobs", label: "Native jobs" }] };
      }
    }, {
      name: "summarizeInbox",
      description: "Summarize inbox.",
      inputSchema: z.object({ date: z.string(), maxResults: z.number().optional() }),
      handler: async (_tenant, args) => {
        called.push("summarizeInbox");
        return {
          result: { count: 1, args, mailboxes: [{ mailbox: "nexi", count: 1 }], messages: [] },
          sources: [{ rail: "email", ref: "email:nexi:msg_1", label: "Email nexi msg_1" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.deepEqual(called, ["summarizeInbox"]);
  assert.equal(result.toolRuns[0].name, "summarizeInbox");
  assert.equal(result.sources[0].rail, "email");
});

test("local Nexi fallback routes attention prompts to triageInbox", async () => {
  const called = [];
  const result = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "what needs my attention" }],
    tools: [{
      name: "getJobDetail",
      description: "Read job detail.",
      inputSchema: z.object({ nameQuery: z.string().optional() }),
      handler: async () => {
        called.push("getJobDetail");
        return { result: { id: "job_1" }, sources: [{ rail: "native", ref: "job_1", label: "Native job" }] };
      }
    }, {
      name: "triageInbox",
      description: "Triage inbox.",
      inputSchema: z.object({ date: z.string(), maxResults: z.number().optional() }),
      handler: async (_tenant, args) => {
        called.push("triageInbox");
        return {
          result: { args, scannedCount: 1, excludedNoiseCount: 0, items: [{ category: "client_inquiry", messageId: "msg_1" }] },
          sources: [{ rail: "email", ref: "email:chris:msg_1", label: "Email chris msg_1" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.deepEqual(called, ["triageInbox"]);
  assert.equal(result.toolRuns[0].name, "triageInbox");
  assert.equal(result.sources[0].ref, "email:chris:msg_1");
});

test("local Nexi fallback routes email source refs to getEmailMessage", async () => {
  const called = [];
  const result = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "read email:chris:msg_1 and list attachments" }],
    tools: [{
      name: "getEmailMessage",
      description: "Read email message.",
      inputSchema: z.object({ mailbox: z.string(), messageId: z.string() }),
      handler: async (_tenant, args) => {
        called.push(args);
        return {
          result: { message: { id: "msg_1", tenantId: "aquatrace", mailbox: "chris", threadId: "thr_1", bodyText: "body", labels: [], attachments: [] } },
          sources: [{ rail: "email", ref: "email:chris:msg_1", label: "Email chris msg_1" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.deepEqual(called, [{ mailbox: "chris", messageId: "msg_1" }]);
  assert.equal(result.toolRuns[0].name, "getEmailMessage");
  assert.equal(result.sources[0].ref, "email:chris:msg_1");
});

test("Nexi Anthropic gateway answers draftEmail action commands from the approval result", async () => {
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "Please draft an email to nexi@aquatraceleak.com saying the report is ready for review." }],
    tools: [{
      name: "searchEmail",
      description: "Search email.",
      inputSchema: z.object({ keywords: z.string().optional() }),
      handler: async () => {
        throw new Error("searchEmail should not run for send commands");
      }
    }, {
      name: "draftEmail",
      description: "Draft email.",
      inputSchema: z.object({ to: z.array(z.string().email()), subject: z.string(), bodyText: z.string() }),
      handler: async (_tenant, args) => {
        toolCalls.push(args);
        return {
          result: { approval: { id: "approval_1", status: "pending" } },
          sources: [{ rail: "native", ref: "approval_1", label: "ApprovalQueue email draft approval_1" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("draftEmail direct answers should not call the model");
    }
  });
  assert.deepEqual(toolCalls, [{
    to: ["nexi@aquatraceleak.com"],
    subject: "the report is ready for review",
    bodyText: "the report is ready for review."
  }]);
  assert.equal(result.toolRuns[0].name, "draftEmail");
  assert.equal(result.sources[0].ref, "approval_1");
  assert.equal(result.answer, "I drafted that email and put it in the approval queue (approval_1). It has not been sent.");
});

test("personal email and text requests resolve to the logged-in user's own contact details for owner and technician seats", async () => {
  for (const actor of [
    {
      label: "owner",
      displayName: "Chris",
      email: "chris@aquatraceleak.com",
      phone: "8648737082"
    },
    {
      label: "technician",
      displayName: "Logan",
      email: "logan@aquatraceleak.com",
      phone: "8645581725"
    }
  ]) {
    const emailTargets = [];
    const statementTargets = [];

    const emailTurn = await answerNexiMessage({
      tenant: tenant(),
      message: "Send me an email saying the report is ready for review.",
      actorDisplayName: actor.displayName,
      requestorContext: {
        tenantUserId: `${actor.label}_seat`,
        displayName: actor.displayName,
        email: actor.email,
        phones: [actor.phone]
      },
      tools: [{
        name: "draftEmail",
        description: "Draft an email for approval.",
        inputSchema: z.object({ to: z.array(z.string().email()), subject: z.string(), bodyText: z.string() }),
        handler: async (_tenant, args) => {
          emailTargets.push(args.to[0]);
          return {
            result: { approval: { id: `approval_${actor.label}`, status: "pending" } },
            sources: [{ rail: "native", ref: `approval_${actor.label}`, label: `ApprovalQueue draft ${actor.label}` }]
          };
        }
      }],
      repository: new MemoryNexiRepository(),
      gateway: runExplicitLocalToolLoop
    });

    assert.equal(emailTargets[0], actor.email);
    assert.equal(emailTurn.toolRuns[0].name, "draftEmail");

    const textTurn = await answerNexiMessage({
      tenant: tenant(),
      message: "Send Logan Sears a statement to me by text.",
      actorDisplayName: actor.displayName,
      requestorContext: {
        tenantUserId: `${actor.label}_seat`,
        displayName: actor.displayName,
        email: actor.email,
        phones: [actor.phone]
      },
      tools: [{
        name: "sendStatement",
        description: "Send a client statement.",
        inputSchema: z.object({ clientQuery: z.string(), target: z.string().optional() }),
        handler: async (_tenant, args) => {
          statementTargets.push(args.target);
          return {
            result: { target: args.target, url: "https://example.test/statement.pdf" },
            sources: [{ rail: "native", ref: "statement_send", label: "Client statement delivery" }]
          };
        }
      }],
      repository: new MemoryNexiRepository(),
      gateway: runExplicitLocalToolLoop
    });

    assert.equal(statementTargets[0], actor.phone);
    assert.equal(textTurn.toolRuns[0].name, "sendStatement");
  }
});

test("personal directions prefer live requestor coordinates, fall back to the logged-in user's profile address, and leave shop questions on the tenant base path", async () => {
  const seenOrigins = [];
  const distanceTool = {
    name: "getDistance",
    description: "Return drive distance and time.",
    inputSchema: z.object({ destination: z.string(), origin: z.string().optional() }),
    handler: async (_tenant, args) => {
      seenOrigins.push(args.origin);
      return {
        result: {
          origin: args.origin ?? "tenant-home-base",
          destination: args.destination,
          driveMinutes: 18,
          provider: "heuristic"
        },
        sources: [{ rail: "native", ref: "distance", label: "Distance tool" }]
      };
    }
  };

  const geoTurn = await answerNexiMessage({
    tenant: tenant(),
    message: "How far is 6020 Frest Dr, Seneca, SC 29672 from here?",
    requestorContext: {
      tenantUserId: "tenant_user_chris",
      displayName: "Chris",
      email: "chris@aquatraceleak.com",
      phones: ["8648737082"],
      address: {
        street1: "102 Kate Lane",
        city: "Fair Play",
        province: "SC",
        postalCode: "29643",
        country: "US"
      },
      origin: "34.500001,-82.750001"
    },
    tools: [distanceTool],
    repository: new MemoryNexiRepository(),
    gateway: runExplicitLocalToolLoop
  });

  assert.equal(seenOrigins[0], "34.500001,-82.750001");
  assert.equal(geoTurn.toolRuns[0].name, "getDistance");

  const profileTurn = await answerNexiMessage({
    tenant: tenant(),
    message: "How far is 6020 Frest Dr, Seneca, SC 29672 from my house?",
    requestorContext: {
      tenantUserId: "office_catherine",
      displayName: "Catherine",
      email: "catherine@local.dev",
      phones: ["8646171838"],
      address: {
        street1: "102 Kate Lane",
        city: "Fair Play",
        province: "SC",
        postalCode: "29643",
        country: "US"
      }
    },
    tools: [distanceTool],
    repository: new MemoryNexiRepository(),
    gateway: runExplicitLocalToolLoop
  });

  assert.equal(seenOrigins[1], "102 Kate Lane, Fair Play, SC 29643");
  assert.equal(profileTurn.toolRuns[0].name, "getDistance");

  const shopTurn = await answerNexiMessage({
    tenant: tenant(),
    message: "How far is 6020 Frest Dr, Seneca, SC 29672 from the shop?",
    requestorContext: {
      tenantUserId: "tenant_user_chris",
      displayName: "Chris",
      email: "chris@aquatraceleak.com",
      phones: ["8648737082"],
      origin: "34.500001,-82.750001",
      address: {
        street1: "102 Kate Lane",
        city: "Fair Play",
        province: "SC",
        postalCode: "29643",
        country: "US"
      }
    },
    tools: [distanceTool],
    repository: new MemoryNexiRepository(),
    gateway: runExplicitLocalToolLoop
  });

  assert.equal(seenOrigins[2], undefined);
  assert.equal(shopTurn.toolRuns[0].name, "getDistance");
});

test("lookupSiteJobBlueprintField returns stored fields for the requested entity", async () => {
  const tool = createNexiJobDeskTools({
    async loadSiteJobBlueprints() {
      return [{
        id: "site_job_deborah_justice",
        tenantId: "aquatrace",
        kind: "site_blueprint",
        fields: { projectName: "Deborah Justice", poolGallons: 32500 },
        extractedFrom: "legacy-import-doc-18218446",
        extractedAt: new Date().toISOString()
      }];
    }
  }).find((candidate) => candidate.name === "lookupSiteJobBlueprintField");
  assert.ok(tool);
  const result = await tool.handler(tenant(), { field: "poolGallons", requestedEntity: "Deborah Justice" });
  assert.equal(result.result.value, 32500);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].rail, "native");
});

test("SiteJobBlueprint field lookup reads section-scoped counts from pooled JSON fields", async () => {
  const tool = createNexiJobDeskTools({
    async loadSiteJobBlueprints() {
      return [{
        id: "site_job_deborah_justice",
        tenantId: "aquatrace",
        kind: "site_blueprint",
        fields: {
          projectName: "Deborah Justice",
          poolSpaCountsJson: JSON.stringify({ poolMainDrains: 4, spaMainDrains: 2 })
        },
        extractedFrom: "legacy-import-doc-18218446",
        extractedAt: new Date().toISOString()
      }];
    }
  }).find((candidate) => candidate.name === "lookupSiteJobBlueprintField");
  assert.ok(tool);
  const result = await tool.handler(tenant(), { field: "spaMainDrains", requestedEntity: "Deborah Justice" });
  assert.equal(result.result.value, 2);
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
      answer: "I don't have that written down anywhere yet. I wrote it down so we can fill the gap.",
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

test("Nexi service sanitizes raw internal answers before they reach chat history", async () => {
  const repository = new MemoryNexiRepository();
  const result = await answerNexiMessage({
    tenant: tenant(),
    message: "What is the phone number on file?",
    tools: [],
    repository,
    gateway: async () => ({
      answer: "tools: Tool names must be unique.",
      sources: [],
      usage: { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalTokens: 2 },
      raw: { test: true },
      toolRuns: []
    })
  });
  assert.equal(result.answer, NEXI_FRIENDLY_FAILURE_MESSAGE);
  assert.equal(repository.conversations[0].assistantText, NEXI_FRIENDLY_FAILURE_MESSAGE);
  assert.equal(repository.failureLog[0].reason, "nexi_user_safe_error_wrapped");
});

test("Nexi service formats client approvals as clean field-list confirmations without raw ids", async () => {
  const anthropicCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    actorDisplayName: "Chris",
    messages: [{ role: "user", content: "Create a new client Logan Sears at 6020 Frest Dr Seneca SC 29672 phone 8645581725 email 4lbsears@gmail.com" }],
    tools: [{
      name: "createClient",
      description: "Queue a client create approval.",
      inputSchema: z.object({
        name: z.string(),
        address: z.string().optional(),
        emails: z.array(z.string()).default([]),
        phones: z.array(z.string()).default([]),
        consent: z.object({ email: z.boolean(), sms: z.boolean() })
      }),
      handler: async () => ({
        result: {
          approval: {
            id: "appr_client_1",
            preview: {
              title: "Create client: Logan Sears",
              body: "Name: Logan Sears\nEmail: 4lbsears@gmail.com\nPhone: 8645581725\nAddress: 6020 Frest Dr\nCity: Seneca\nState: SC\nZIP: 29672"
            }
          }
        },
        sources: [{ rail: "native", ref: "approval_1", label: "Approval queue client create" }]
      })
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      anthropicCalls.push(JSON.parse(init.body));
      return anthropicToolUseResponse("submit_create_client_extraction", {
        name: "Logan Sears",
        address: "6020 Frest Dr Seneca SC 29672",
        emails: ["4lbsears@gmail.com"],
        phones: ["8645581725"],
        consent: { email: false, sms: false }
      });
    }
  });

  assert.match(result.answer, /^Logan Sears$/m);
  assert.match(result.answer, /^6020 Frest Dr, Seneca, SC 29672$/m);
  assert.match(result.answer, /^\(864\) 558-1725$/m);
  assert.match(result.answer, /^4lbsears@gmail\.com$/m);
  assert.match(result.answer, /Do the Client Details look correct\?/);
  assert.doesNotMatch(result.answer, /appr_client_1/);
  assert.doesNotMatch(result.answer, /Here is your request, Chris\./);
  assert.doesNotMatch(result.answer, /You requested create client for Logan Sears with the following details:/);
  assert.equal(result.pendingApproval?.approvalId, "appr_client_1");
  assert.equal(anthropicCalls.length, 1);
});

test("freeform client create parsing preserves short email prefixes both inline and split before the @ token", async () => {
  const phrases = [
    "Create a new client Logan Sears at 6020 Frest Dr Seneca SC 29672 phone 8645581725 email 4lbsears@gmail.com",
    "Create a new client Logan Sears at 6020 Frest Dr Seneca SC 29672 phone 8645581725 email 4lb sears@gmail.com"
  ];

  for (const createPhrase of phrases) {
    const repository = new MemoryNativeCrmRepository();
    const provider = new NativeAdapter(repository, "aquatrace");
    const approvalQueue = new ApprovalQueueService(
      new InMemoryApprovalQueueRepository(),
      new CrmApprovalExecutor(provider)
    );
    const tools = [
      ...createCrmToolsWithOptions(provider, approvalQueue, { requestRepository: repository }),
      ...createApprovalNexiTools({
        approvalQueue,
        actorId: "owner_1",
        actorRole: "OWNER",
        crmRepository: repository,
        publicBaseUrl: "http://127.0.0.1:4275"
      })
    ];

    const createTurn = await runExplicitLocalToolLoop({
      tenant: tenant(),
      system: "Use tools.",
      actorDisplayName: "Chris",
      messages: [{ role: "user", content: createPhrase }],
      tools,
      routeActionName: "/api/nexi/message",
      taskType: "job_desk_answer",
      env: { ANTHROPIC_API_KEY: "test-key" },
      fetchFn: async () => anthropicToolUseResponse("submit_create_client_extraction", {
        name: "Logan Sears",
        address: "6020 Frest Dr Seneca SC 29672",
        emails: ["sears@gmail.com"],
        phones: ["8645581725"],
        consent: { email: false, sms: false }
      })
    });

    assert.match(createTurn.answer, /^4lbsears@gmail\.com$/m);
    assert.ok(createTurn.pendingApproval?.approvalId);

    await runExplicitLocalToolLoop({
      tenant: tenant(),
      system: "Use tools.",
      actorDisplayName: "Chris",
      messages: [
        { role: "user", content: createPhrase },
        { role: "assistant", content: createTurn.answer },
        { role: "user", content: "yes" }
      ],
      tools,
      routeActionName: "/api/nexi/message",
      taskType: "job_desk_answer",
      env: {},
      pendingApproval: createTurn.pendingApproval
    });

    const clients = await repository.listClients("aquatrace");
    const createdClient = clients.find((client) => client.name === "Logan Sears");
    assert.ok(createdClient);
    assert.deepEqual(createdClient?.emails, ["4lbsears@gmail.com"]);
  }
});

test("client approvals ask for a missing full name instead of rendering punctuation placeholders", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "Create a new client with phone 8645581725 email 4lbsears@gmail.com" }],
    tools: [{
      name: "createClient",
      description: "Queue a client create approval.",
      inputSchema: z.object({
        name: z.string().optional(),
        address: z.string().optional(),
        emails: z.array(z.string()).default([]),
        phones: z.array(z.string()).default([]),
        consent: z.object({ email: z.boolean(), sms: z.boolean() }).default({ email: false, sms: false })
      }),
      handler: async () => ({
        result: {
          approval: {
            id: "appr_client_missing_name",
            preview: {
              title: "Create client: .",
              body: "Name: .\nEmail: 4lbsears@gmail.com\nPhone: 8645581725\nAddress: 6020 Frest Dr\nCity: Seneca\nState: SC\nZIP: 29672"
            }
          }
        },
        sources: [{ rail: "native", ref: "approval_missing_name", label: "Approval queue client create" }]
      })
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });

  assert.match(result.answer, /I still need the client's full name before I can queue this/i);
  assert.doesNotMatch(result.answer, /^\.$/m);
});

test("freeform client create approval preserves the parsed name and full email, saves the approved address, and honors typed yes replies", async () => {
  const repository = new MemoryNativeCrmRepository();
  const provider = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider)
  );
  const tools = [
    ...createCrmToolsWithOptions(provider, approvalQueue, { requestRepository: repository }),
    ...createApprovalNexiTools({
      approvalQueue,
      actorId: "owner_1",
      actorRole: "OWNER",
      crmRepository: repository,
      publicBaseUrl: "http://127.0.0.1:4275"
    })
  ];
  const createPhrase = "Add new client to system Catherine Sears 102 Kate Lane Fair Play South Carolina 29643 864-617-1838 email Catherine Sears31@gmail.com";
  const anthropicCalls = [];

  const createTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    actorDisplayName: "Chris",
    messages: [{ role: "user", content: createPhrase }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      anthropicCalls.push(JSON.parse(init.body));
      return anthropicToolUseResponse("submit_create_client_extraction", {
        name: "Catherine Sears",
        address: "102 Kate Lane Fair Play SC 29643",
        emails: ["CatherineSears31@gmail.com"],
        phones: ["864-617-1838"],
        consent: { email: false, sms: false }
      });
    }
  });

  assert.equal(createTurn.toolRuns[0].name, "createClient");
  assert.match(createTurn.answer, /^Catherine Sears$/m);
  assert.match(createTurn.answer, /^102 Kate Lane, Fair Play, SC 29643$/m);
  assert.match(createTurn.answer, /^\(864\) 617-1838$/m);
  assert.match(createTurn.answer, /^CatherineSears31@gmail\.com$/m);
  assert.match(createTurn.answer, /Do the Client Details look correct\?/);
  assert.doesNotMatch(createTurn.answer, /\bto system Catherine Sears\b/i);
  assert.doesNotMatch(createTurn.answer, /\b31@gmail\.com\b/);
  assert.ok(createTurn.pendingApproval?.approvalId);
  assert.equal(anthropicCalls.length, 1);

  const approveTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    actorDisplayName: "Chris",
    messages: [
      { role: "user", content: createPhrase },
      { role: "assistant", content: createTurn.answer },
      { role: "user", content: "yes" }
    ],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {},
    pendingApproval: createTurn.pendingApproval
  });

  assert.equal(approveTurn.toolRuns[0].name, "approvePendingApproval");

  const clients = await repository.listClients("aquatrace");
  const createdClient = clients.find((client) => client.name === "Catherine Sears");
  assert.ok(createdClient);
  assert.deepEqual(createdClient?.emails, ["CatherineSears31@gmail.com"]);
  assert.deepEqual(createdClient?.phones.map((phone) => phone.replace(/[^\d]/g, "")), ["8646171838"]);

  const properties = await repository.listProperties("aquatrace");
  const createdProperty = properties.find((property) => property.clientId === createdClient?.id);
  assert.ok(createdProperty);
  assert.equal(createdProperty?.address.street1, "102 Kate Lane");
  assert.equal(createdProperty?.address.city, "Fair Play");
  assert.equal(createdProperty?.address.province, "SC");
  assert.equal(createdProperty?.address.postalCode, "29643");

  const lookupTurn = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What is the address for Catherine Sears?" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("saved client address lookups should answer directly from clientLookup");
    }
  });

  assert.equal(lookupTurn.toolRuns[0].name, "clientLookup");
  assert.match(lookupTurn.answer, /The address on file for Catherine Sears is 102 Kate Lane, Fair Play, SC, 29643\./);
  assert.match(lookupTurn.answer, /Would you like directions or should I open it in Maps\?/);

  const phoneLookupTurn = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What is Catherine Sears phone number?" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("saved client phone lookups should answer directly from clientLookup");
    }
  });

  assert.equal(phoneLookupTurn.toolRuns[0].name, "clientLookup");
  assert.match(phoneLookupTurn.answer, /The phone number on file for Catherine Sears is 864-617-1838\./);
  assert.match(phoneLookupTurn.answer, /Would you like me to call now\?/);

  const naturalAddressLookupTurn = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What is Catherine Sears address?" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("natural address lookups should answer directly from clientLookup");
    }
  });

  assert.equal(naturalAddressLookupTurn.toolRuns[0].name, "clientLookup");
  assert.match(naturalAddressLookupTurn.answer, /The address on file for Catherine Sears is 102 Kate Lane, Fair Play, SC, 29643\./);
  assert.match(naturalAddressLookupTurn.answer, /Would you like directions or should I open it in Maps\?/);
});

test("fresh create-client phrasing with an article and sentence break still routes into createClient", async () => {
  const repository = new MemoryNativeCrmRepository();
  const provider = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider)
  );
  const tools = [
    ...createCrmToolsWithOptions(provider, approvalQueue, { requestRepository: repository }),
    ...createApprovalNexiTools({
      approvalQueue,
      actorId: "owner_1",
      actorRole: "OWNER",
      crmRepository: repository,
      publicBaseUrl: "http://127.0.0.1:4275"
    })
  ];
  const createPhrase = "Add a new client. Catherine Sears 102 Kate Lane Fair Play SC 8646171838 catherinesears31@gmail.com";
  let extractionCalls = 0;

  const createTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    actorDisplayName: "Chris",
    messages: [{ role: "user", content: createPhrase }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      extractionCalls += 1;
      return anthropicToolUseResponse("submit_create_client_extraction", {
        name: "Catherine Sears",
        address: "102 Kate Lane Fair Play SC",
        emails: ["catherinesears31@gmail.com"],
        phones: ["8646171838"],
        consent: { email: false, sms: false }
      });
    }
  });

  assert.equal(extractionCalls, 1);
  assert.equal(createTurn.toolRuns[0].name, "createClient");
  assert.match(createTurn.answer, /^Catherine Sears$/m);
  assert.match(createTurn.answer, /^102 Kate Lane, Fair Play, SC$/m);
  assert.match(createTurn.answer, /^\(864\) 617-1838$/m);
  assert.match(createTurn.answer, /^catherinesears31@gmail\.com$/m);
  assert.doesNotMatch(createTurn.answer, /can't edit saved client records from chat yet/i);
});

test("approval actions require an explicit approval id and never silently approve the newest pending client", async () => {
  const repository = new MemoryNativeCrmRepository();
  const provider = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider)
  );
  const firstQueued = await queueClientCreateApproval(tenant(), {
    name: "Logan Sears",
    address: "6020 Forest Dr Seneca SC 29672",
    emails: ["4lbsears@gmail.com"],
    phones: ["8645551725"],
    consent: { email: false, sms: false }
  }, approvalQueue);
  const secondQueued = await queueClientCreateApproval(tenant(), {
    name: "Kit Foster",
    address: "408 Kingsgate Court Simpsonville SC 29680",
    emails: [],
    phones: ["8648888888"],
    consent: { email: false, sms: false }
  }, approvalQueue);
  const approveTool = createApprovalNexiTools({
    approvalQueue,
    actorId: "owner_1",
    actorRole: "OWNER",
    crmRepository: repository,
    publicBaseUrl: "http://127.0.0.1:4275"
  }).find((tool) => tool.name === "approvePendingApproval");

  assert.ok(approveTool);
  await assert.rejects(
    () => approveTool.handler(tenant(), {}),
    /approvalId/i
  );

  const clients = await repository.listClients("aquatrace");
  assert.equal(clients.length, 0);

  const pending = await approvalQueue.listPending("aquatrace");
  assert.deepEqual(
    pending.map((item) => item.id),
    [firstQueued.approval.id, secondQueued.approval.id]
  );
});

test("fresh single client records without a zip still save address data, answer email lookups, and resolve possessive short-form references", async () => {
  const repository = new MemoryNativeCrmRepository();
  const provider = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider)
  );
  const tools = [
    ...createCrmToolsWithOptions(provider, approvalQueue, { requestRepository: repository }),
    ...createApprovalNexiTools({
      approvalQueue,
      actorId: "owner_1",
      actorRole: "OWNER",
      crmRepository: repository,
      publicBaseUrl: "http://127.0.0.1:4275"
    })
  ];
  const createPhrase = "Add new client to system Catherine Sears 102 Kate Lane Fair Play South Carolina 864-617-1838 email Catherine Sears31@gmail.com";

  const createTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    actorDisplayName: "Chris",
    messages: [{ role: "user", content: createPhrase }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => anthropicToolUseResponse("submit_create_client_extraction", {
      name: "Catherine Sears",
      address: "102 Kate Lane Fair Play South Carolina",
      emails: ["CatherineSears31@gmail.com"],
      phones: ["864-617-1838"],
      consent: { email: false, sms: false }
    })
  });

  assert.equal(createTurn.toolRuns[0].name, "createClient");
  assert.match(createTurn.answer, /^Catherine Sears$/m);
  assert.match(createTurn.answer, /^102 Kate Lane, Fair Play, SC$/m);
  assert.match(createTurn.answer, /^CatherineSears31@gmail\.com$/m);
  assert.ok(createTurn.pendingApproval?.approvalId);

  const approveTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    actorDisplayName: "Chris",
    messages: [
      { role: "user", content: createPhrase },
      { role: "assistant", content: createTurn.answer },
      { role: "user", content: "yes" }
    ],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {},
    pendingApproval: createTurn.pendingApproval
  });

  assert.equal(approveTurn.toolRuns[0].name, "approvePendingApproval");

  const clients = await repository.listClients("aquatrace");
  const createdClient = clients.find((client) => client.name === "Catherine Sears");
  assert.ok(createdClient);
  assert.deepEqual(createdClient?.emails, ["CatherineSears31@gmail.com"]);

  const properties = await repository.listProperties("aquatrace");
  const createdProperty = properties.find((property) => property.clientId === createdClient?.id);
  assert.ok(createdProperty);
  assert.equal(createdProperty?.address.street1, "102 Kate Lane");
  assert.equal(createdProperty?.address.city, "Fair Play");
  assert.equal(createdProperty?.address.province, "SC");
  assert.equal(createdProperty?.address.postalCode, "");

  const addressLookupTurn = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What is the address for Catherine Sears?" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("fresh saved client address lookups should answer directly from clientLookup");
    }
  });

  assert.equal(addressLookupTurn.toolRuns[0].name, "clientLookup");
  assert.match(addressLookupTurn.answer, /The address on file for Catherine Sears is 102 Kate Lane, Fair Play, SC\./);

  const emailLookupTurn = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What is Catherine Sears email address?" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("saved client email lookups should answer directly from clientLookup");
    }
  });

  assert.equal(emailLookupTurn.toolRuns[0].name, "clientLookup");
  assert.match(emailLookupTurn.answer, /The email on file for Catherine Sears is CatherineSears31@gmail\.com\./);

  const fullNamePhoneTurn = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What is Catherine Sears telephone number?" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("full-name phone lookups should answer directly from clientLookup");
    }
  });

  assert.equal(fullNamePhoneTurn.toolRuns[0].name, "clientLookup");
  assert.match(fullNamePhoneTurn.answer, /The phone number on file for Catherine Sears is 864-617-1838\./);

  const possessivePhoneTurn = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "What is Catherine Sears telephone number?" },
      { role: "assistant", content: fullNamePhoneTurn.answer },
      { role: "user", content: "What is Catherine's telephone number?" }
    ],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("possessive phone lookups should stay on clientLookup");
    }
  });

  assert.equal(possessivePhoneTurn.toolRuns[0].name, "clientLookup");
  assert.match(possessivePhoneTurn.answer, /The phone number on file for Catherine Sears is 864-617-1838\./);
  assert.doesNotMatch(possessivePhoneTurn.answer, /did not find/i);
});

test("pending client confirmations accept natural-language corrections and restate the updated address before approval", async () => {
  const repository = new MemoryNativeCrmRepository();
  const provider = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider)
  );
  const tools = [
    ...createCrmToolsWithOptions(provider, approvalQueue, { requestRepository: repository }),
    ...createApprovalNexiTools({
      approvalQueue,
      actorId: "owner_1",
      actorRole: "OWNER",
      crmRepository: repository,
      publicBaseUrl: "http://127.0.0.1:4275"
    })
  ];
  const createPhrase = "Add new client to system Catherine Sears 102 Cate Lane Fair Play South Carolina 29643 864-617-1838 email Catherine Sears31@gmail.com";
  const createTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    actorDisplayName: "Chris",
    messages: [{ role: "user", content: createPhrase }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => anthropicToolUseResponse("submit_create_client_extraction", {
      name: "Catherine Sears",
      address: "102 Cate Lane Fair Play SC 29643",
      emails: ["CatherineSears31@gmail.com"],
      phones: ["864-617-1838"],
      consent: { email: false, sms: false }
    })
  });

  const makeChangesTurn = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: createPhrase },
      { role: "assistant", content: createTurn.answer },
      { role: "user", content: "make changes" }
    ],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {},
    pendingApproval: createTurn.pendingApproval
  });

  assert.match(makeChangesTurn.answer, /Tell me what to change/i);
  assert.equal(makeChangesTurn.pendingApproval?.awaitingChanges, true);

  const revisedTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    actorDisplayName: "Chris",
    messages: [
      { role: "user", content: createPhrase },
      { role: "assistant", content: createTurn.answer },
      { role: "user", content: "make changes" },
      { role: "assistant", content: makeChangesTurn.answer },
      { role: "user", content: "Kate Lane is spelled with a k instead of a c" }
    ],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {},
    pendingApproval: makeChangesTurn.pendingApproval
  });

  assert.equal(revisedTurn.toolRuns[0].name, "revisePendingClientCreateApproval");
  assert.match(revisedTurn.answer, /^Catherine Sears$/m);
  assert.match(revisedTurn.answer, /^102 Kate Lane, Fair Play, SC 29643$/m);
  assert.match(revisedTurn.answer, /Do the Client Details look correct\?/);

  const approveTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    actorDisplayName: "Chris",
    messages: [
      { role: "user", content: createPhrase },
      { role: "assistant", content: createTurn.answer },
      { role: "user", content: "make changes" },
      { role: "assistant", content: makeChangesTurn.answer },
      { role: "user", content: "Kate Lane is spelled with a k instead of a c" },
      { role: "assistant", content: revisedTurn.answer },
      { role: "user", content: "yes" }
    ],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {},
    pendingApproval: revisedTurn.pendingApproval
  });

  assert.equal(approveTurn.toolRuns[0].name, "approvePendingApproval");

  const lookupTurn = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What is the address for Catherine Sears?" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("corrected client address lookups should answer directly from clientLookup");
    }
  });

  assert.equal(lookupTurn.toolRuns[0].name, "clientLookup");
  assert.match(lookupTurn.answer, /The address on file for Catherine Sears is 102 Kate Lane, Fair Play, SC, 29643\./);
});

test("client lookup follow-ups resolve both his and her pronouns to the active conversation entity", async () => {
  const repository = new MemoryNativeCrmRepository();
  const adapter = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(adapter)
  );
  await adapter.createClient({
    tenantId: "aquatrace",
    name: "Logan Sears",
    emails: ["logan@aquatraceleak.com"],
    phones: ["8645581725"],
    consent: { email: false, sms: false }
  });
  await adapter.createClient({
    tenantId: "aquatrace",
    name: "Catherine Sears",
    emails: ["catherine@aquatraceleak.com"],
    phones: ["8646171838"],
    consent: { email: false, sms: false }
  });

  const tools = createCrmToolsWithOptions(adapter, approvalQueue, { requestRepository: repository });

  const hisTurn = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "What is Logan Sears telephone number?" },
      { role: "assistant", content: "The phone number on file for Logan Sears is 8645581725." },
      { role: "user", content: "What is his email address?" }
    ],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("pronoun follow-up lookups should answer directly from clientLookup");
    }
  });

  assert.equal(hisTurn.toolRuns[0].name, "clientLookup");
  assert.match(hisTurn.answer, /The email on file for Logan Sears is logan@aquatraceleak\.com\./);

  const herTurn = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "What is Catherine Sears telephone number?" },
      { role: "assistant", content: "The phone number on file for Catherine Sears is 8646171838." },
      { role: "user", content: "What is her email address?" }
    ],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("pronoun follow-up lookups should answer directly from clientLookup");
    }
  });

  assert.equal(herTurn.toolRuns[0].name, "clientLookup");
  assert.match(herTurn.answer, /The email on file for Catherine Sears is catherine@aquatraceleak\.com\./);
});

test("contact-card delivery requests report the same honest capability gap across email, text, and follow-up phrasing", async () => {
  const messageSets = [
    [{ role: "user", content: "Email me Logan Sears full contact card" }],
    [{ role: "user", content: "Text me Logan Sears contact card information" }],
    [
      { role: "user", content: "Email me Logan Sears full contact card" },
      { role: "assistant", content: "I can't send a client's full contact card from chat yet. That delivery flow is still waiting on tenant user-seat profiles, so I don't want to fake it as a data problem." },
      { role: "user", content: "Can you text it to me instead?" }
    ]
  ];

  for (const messages of messageSets) {
    const result = await runNexiToolLoop({
      tenant: tenant(),
      system: "Use tools.",
      messages,
      tools: [{
        name: "searchEmail",
        description: "Search email.",
        inputSchema: z.object({ keywords: z.string().optional() }),
        handler: async () => {
          throw new Error("contact-card delivery should not route into searchEmail");
        }
      }],
      routeActionName: "/api/nexi/message",
      taskType: "job_desk_answer",
      env: {}
    });

    assert.equal(result.toolRuns.length, 0);
    assert.match(result.answer, /can't send a client's full contact card from chat yet/i);
    assert.match(result.answer, /tenant user-seat profiles/i);
    assert.doesNotMatch(result.answer, /couldn't find an email/i);
    assert.doesNotMatch(result.answer, /did not find a matching client/i);
  }
});

test("post-approval client edit requests return the honest saved-record capability gap across natural phrasings", async () => {
  const phrasings = [
    "Let's add the ZIP code to this 29643",
    "Update Catherine Sears's ZIP code to 29643",
    "Can you fix the address on this client to 102 Kate Lane, Fair Play, SC 29643?"
  ];

  for (const content of phrasings) {
    const result = await runNexiToolLoop({
      tenant: tenant(),
      system: "Use tools.",
      messages: [
        { role: "user", content: "What is Catherine Sears telephone number?" },
        { role: "assistant", content: "The phone number on file for Catherine Sears is 8646171838." },
        { role: "user", content }
      ],
      tools: [],
      routeActionName: "/api/nexi/message",
      taskType: "job_desk_answer",
      env: { ANTHROPIC_API_KEY: "test-key" },
      fetchFn: async () => {
        throw new Error("post-approval edit requests should not call the model");
      }
    });

    assert.equal(result.toolRuns.length, 0);
    assert.match(result.answer, /can't edit saved client records from chat yet/i, `expected the honest capability gap for: ${content}`);
    assert.doesNotMatch(result.answer, /did not find/i);
  }
});

test("post-approval edit follow-ups using pronouns after a lookup still return the honest saved-record capability gap", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "What is Catherine Sears address?" },
      { role: "assistant", content: "The address on file for Catherine Sears is 102 Kate Lane, Fair Play, SC.\n\nWould you like directions or should I open it in Maps?" },
      { role: "user", content: "Add a zip code to her address 29643" }
    ],
    tools: [],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("post-approval pronoun edit requests should not call the model");
    }
  });

  assert.equal(result.toolRuns.length, 0);
  assert.match(result.answer, /can't edit saved client records from chat yet/i);
  assert.doesNotMatch(result.answer, /The address on file for Catherine Sears/i);
  assert.doesNotMatch(result.answer, /Would you like directions/i);
  assert.doesNotMatch(result.answer, /did not find/i);
});

test("Nexi queues an existing client address or ZIP update and only saves it after approval", async () => {
  const repository = new MemoryNativeCrmRepository();
  const provider = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider)
  );
  const client = await provider.createClient({
    tenantId: "aquatrace",
    name: "Catherine Sears",
    billingAddress: { street1: "102 Kate Lane", city: "Fair Play", province: "SC", postalCode: "00000", country: "USA" },
    emails: ["catherine@example.test"],
    phones: ["8646171838"],
    consent: { email: false, sms: false }
  });
  await provider.upsertProperty({
    id: "property_catherine",
    tenantId: "aquatrace",
    clientId: client.id,
    label: "Primary service address",
    address: { street1: "102 Kate Lane", city: "Fair Play", province: "SC", postalCode: "00000", country: "USA" },
    assets: []
  });
  const tools = [
    ...createCrmToolsWithOptions(provider, approvalQueue, { requestRepository: repository }),
    ...createApprovalNexiTools({
      approvalQueue,
      actorId: "owner_1",
      actorRole: "OWNER",
      crmRepository: repository,
      publicBaseUrl: "http://127.0.0.1:4275"
    })
  ];

  const updateTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    actorDisplayName: "Chris",
    messages: [{ role: "user", content: "Update Catherine Sears's ZIP code to 29643" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });

  assert.equal(updateTurn.toolRuns[0].name, "updateClient");
  assert.match(updateTurn.answer, /Catherine Sears/);
  assert.match(updateTurn.answer, /29643/);
  assert.ok(updateTurn.pendingApproval?.approvalId);
  assert.equal((await repository.listClients("aquatrace"))[0].billingAddress.postalCode, "00000");

  const approvalTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    actorDisplayName: "Chris",
    messages: [
      { role: "user", content: "Update Catherine Sears's ZIP code to 29643" },
      { role: "assistant", content: updateTurn.answer },
      { role: "user", content: "yes" }
    ],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {},
    pendingApproval: updateTurn.pendingApproval
  });

  assert.equal(approvalTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approvalTurn.answer, /Approved and updated Catherine Sears/);
  assert.equal((await repository.listClients("aquatrace"))[0].billingAddress.postalCode, "29643");
  assert.equal((await repository.listProperties("aquatrace"))[0].address.postalCode, "29643");
});

test("approval rejections omit stray punctuation when the pending title is empty or malformed", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "assistant", content: "Catherine Sears\n102 Kate Lane, Fair Play, SC 29643\n(864) 617-1838\nCatherineSears31@gmail.com\n\nDo the Client Details look correct?" },
      { role: "user", content: "no" }
    ],
    tools: [{
      name: "rejectPendingApproval",
      description: "Reject a pending approval.",
      inputSchema: z.object({ approvalId: z.string().optional() }),
      handler: async () => ({
        result: {
          approval: {
            preview: {
              title: "Create client: ."
            }
          }
        },
        sources: [{ rail: "native", ref: "approval_rejected", label: "Approval queue rejection" }]
      })
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {},
    pendingApproval: pendingApprovalContext("appr_reject_client", { revisableClientCreate: true })
  });

  assert.equal(result.answer, "Rejected Create client. Nothing was created.");
  assert.doesNotMatch(result.answer, /\.\./);
});

test("Nexi service answers phone lookups directly from matched client records", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What is the phone number for Logan Sears?" }],
    tools: [{
      name: "clientLookup",
      description: "Read native clients.",
      inputSchema: z.object({ q: z.string().optional() }),
      handler: async () => ({
        result: {
          clients: [{
            name: "Logan Sears",
            phones: ["8645581725"],
            relatedProperties: [{
              address: {
                street1: "6020 Frest Dr",
                city: "Seneca",
                state: "SC",
                postalCode: "29672"
              }
            }]
          }],
          nativeCount: 1
        },
        sources: [{ rail: "native", ref: "clients", label: "Native CRM clients" }]
      })
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("clientLookup direct answers should not call the model");
    }
  });

  assert.match(result.answer, /The phone number on file for Logan Sears is 8645581725\./);
  assert.match(result.answer, /Would you like me to call now\?/);
});

test("Nexi service answers address lookups directly from matched client property records", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What is the address for Logan Sears?" }],
    tools: [{
      name: "clientLookup",
      description: "Read native clients.",
      inputSchema: z.object({ q: z.string().optional() }),
      handler: async () => ({
        result: {
          clients: [{
            name: "Logan Sears",
            phones: ["8645581725"],
            relatedProperties: [{
              address: {
                street1: "6020 Frest Dr",
                city: "Seneca",
                state: "SC",
                postalCode: "29672"
              }
            }]
          }],
          nativeCount: 1
        },
        sources: [{ rail: "native", ref: "clients", label: "Native CRM clients" }]
      })
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("clientLookup direct answers should not call the model");
    }
  });

  assert.match(result.answer, /The address on file for Logan Sears is 6020 Frest Dr, Seneca, SC, 29672\./);
  assert.match(result.answer, /Would you like directions or should I open it in Maps\?/);
});

test("Nexi client lookup misses stay on the native rail and never mention dormant vendors", async () => {
  let lookupCalls = 0;
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What is Valerie Lane phone number?" }],
    tools: [{
      name: "clientLookup",
      description: "Read native clients.",
      inputSchema: z.object({ q: z.string().optional() }),
      handler: async () => {
        lookupCalls += 1;
        return {
          result: {
            clients: [],
            nativeCount: 0,
            fallbackUsed: false,
            jobberFallbackCount: 0
          },
          sources: [{ rail: "native", ref: "clients", label: "Native CRM clients" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("native client lookup misses should not fall through to the model");
    }
  });

  assert.equal(lookupCalls, 1);
  assert.match(result.answer, /native client list/i);
  assert.doesNotMatch(result.answer, /Jobber|CompanyCam/i);
});

test("client approval preview keeps the parsed zip separate from the phone number", async () => {
  let capturedApproval = null;
  await queueClientCreateApproval(
    tenant(),
    {
      name: "Logan Sears",
      address: "6020 Frest Dr Seneca SC 29672 telephone 8645581725",
      emails: ["4lbsears@gmail.com"],
      phones: ["8645581725"],
      consent: { email: false, sms: false, marketing: false }
    },
    {
      create: async (approval) => {
        capturedApproval = approval;
        return { id: "appr_client_preview", status: "pending", ...approval };
      }
    }
  );

  assert.ok(capturedApproval);
  assert.match(capturedApproval.preview.body, /Address: 6020 Frest Dr/);
  assert.match(capturedApproval.preview.body, /City: Seneca/);
  assert.match(capturedApproval.preview.body, /State: SC/);
  assert.match(capturedApproval.preview.body, /ZIP: 29672/);
  assert.doesNotMatch(capturedApproval.preview.body, /Address: .*8645581725/i);
  assert.doesNotMatch(capturedApproval.preview.body, /Email OK:/);
  assert.doesNotMatch(capturedApproval.preview.body, /Text OK:/);
});

test("Nexi message route wraps duplicate tool registration failures in the friendly fallback", async () => {
  const duplicateTool = {
    name: "clientLookup",
    description: "Read native clients.",
    inputSchema: z.object({ q: z.string().optional() }),
    handler: async () => ({
      result: { clients: [] },
      sources: [{ rail: "native", ref: "client_1", label: "Native client" }]
    })
  };
  const app = express();
  app.use(express.json());
  app.use("/api/nexi", createNexiRouter({ NEXI_FIREBASE_AUTH_REQUIRED: "false", TENANT_ID: "aquatrace" }, {
    extraTools: [duplicateTool],
    extraToolsForRequest: async () => [duplicateTool]
  }));
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/nexi/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        conversationId: "dup-tools",
        message: "What's the phone number for Aquatrace?"
      })
    });
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.ok, false);
    assert.equal(body.error, NEXI_FRIENDLY_FAILURE_MESSAGE);
    assert.doesNotMatch(body.error, /tool names must be unique|duplicate nexi tool registration/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
  }
});

test("Nexi message history route restores the same conversation and clears pending approval after approval", async () => {
  const queueJobActionTool = {
    name: "queueJobAction",
    description: "Queue a job close or invoice action.",
    inputSchema: z.object({
      jobId: z.string().optional(),
      query: z.string().optional(),
      action: z.enum(["close", "invoice", "close_and_invoice", "dismiss_invoice_reminder"])
    }),
    handler: async (_tenant, args) => ({
      result: {
        approval: {
          id: "appr_job_1",
          preview: {
            title: "Close and invoice job: Leak follow-up",
            body: `Job: ${args.jobId ?? args.query}\nAction: ${args.action}`
          }
        }
      },
      sources: [{ rail: "native", ref: "approval_job_1", label: "Approval queue job action" }]
    })
  };
  const approvePendingApprovalTool = {
    name: "approvePendingApproval",
    description: "Approve a pending approval record.",
    inputSchema: z.object({ approvalId: z.string() }),
    handler: async (_tenant, args) => ({
      result: {
        executedApproval: {
          id: args.approvalId,
          preview: { title: "Close and invoice job: Leak follow-up" }
        }
      },
      sources: [{ rail: "native", ref: "approval_job_1", label: "Approval queue job action" }]
    })
  };
  const app = express();
  app.use(express.json());
  app.use("/api/nexi", createNexiRouter({
    NEXI_FIREBASE_AUTH_REQUIRED: "false",
    NEXI_LOCAL_FAKE_GATEWAY: "true",
    TENANT_ID: "aquatrace"
  }, {
    extraTools: [queueJobActionTool, approvePendingApprovalTool]
  }));
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");

    const firstResponse = await fetch(`http://127.0.0.1:${address.port}/api/nexi/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        conversationId: "resume-thread",
        actorDisplayName: "Chris",
        message: "Close and invoice job job_123"
      })
    });
    const firstBody = await firstResponse.json();
    assert.equal(firstResponse.status, 200);
    assert.equal(firstBody.ok, true);
    assert.match(firstBody.answer, /Here is your request, Chris\./);
    assert.match(firstBody.answer, /You requested close and invoice job for Leak follow-up with the following details:/);
    assert.doesNotMatch(firstBody.answer, /appr_job_1/);
    assert.equal(firstBody.pendingApproval.approvalId, "appr_job_1");

    const secondResponse = await fetch(`http://127.0.0.1:${address.port}/api/nexi/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        conversationId: "resume-thread",
        actorDisplayName: "Chris",
        message: "yes",
        pendingApproval: firstBody.pendingApproval
      })
    });
    const secondBody = await secondResponse.json();
    assert.equal(secondResponse.status, 200);
    assert.equal(secondBody.ok, true);
    assert.equal(secondBody.pendingApproval, null);

    const historyResponse = await fetch(`http://127.0.0.1:${address.port}/api/nexi/history?tenantId=aquatrace&conversationId=resume-thread`);
    const historyBody = await historyResponse.json();
    assert.equal(historyResponse.status, 200);
    assert.equal(historyBody.ok, true);
    assert.equal(historyBody.conversationId, "resume-thread");
    assert.equal(historyBody.messages.length, 4);
    assert.equal(historyBody.messages[0].text, "Close and invoice job job_123");
    assert.match(historyBody.messages[1].text, /Here is your request, Chris\./);
    assert.equal(historyBody.messages[2].text, "yes");
    assert.equal(historyBody.pendingApproval, null);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
  }
});

test("Nexi message route wraps request-scoped tool factory failures in the friendly fallback", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/nexi", createNexiRouter({ NEXI_FIREBASE_AUTH_REQUIRED: "false", TENANT_ID: "aquatrace" }, {
    extraToolsForRequest: async () => {
      throw new Error("Unknown tool: phoneLookup");
    }
  }));
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/nexi/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        conversationId: "scoped-tools",
        message: "What's the address for Aquatrace?"
      })
    });
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.ok, false);
    assert.equal(body.error, NEXI_FRIENDLY_FAILURE_MESSAGE);
    assert.doesNotMatch(body.error, /unknown tool|phoneLookup/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
  }
});

test("Nexi service persists tool runs for conversation reuse", async () => {
  const repository = new MemoryNexiRepository();
  const toolRuns = [{
    name: "getSchedule",
    result: { jobs: [{ id: "job_1", title: "Rachel Payne leak detection" }] },
    sources: [{ rail: "native", ref: "job_1", label: "Native job Rachel Payne leak detection" }]
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

test("Nexi service returns the stable conversation id, not the Firestore record id", async () => {
  const repository = new MemoryNexiRepository();
  let secondMessages = [];
  const first = await answerNexiMessage({
    tenant: tenant(),
    message: "What is on today's schedule?",
    tools: [],
    repository,
    gateway: async () => ({
      answer: "Rachel Payne is scheduled today.",
      sources: [{ rail: "native", ref: "job_1", label: "Native job Rachel Payne" }],
      usage: { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalTokens: 2 },
      raw: { test: true },
      toolRuns: [{ name: "getSchedule", result: { jobs: [] }, sources: [{ rail: "native", ref: "job_1", label: "Native job Rachel Payne" }] }]
    })
  });
  assert.match(first.conversationId, /^thread_/);
  assert.equal(repository.conversations[0].conversationId, first.conversationId);
  assert.notEqual(repository.conversations[0].id, first.conversationId);

  const second = await answerNexiMessage({
    tenant: tenant(),
    message: "What's the ETA?",
    conversationId: first.conversationId,
    tools: [],
    repository,
    gateway: async (request) => {
      secondMessages = request.messages;
      return {
        answer: "Same schedule item.",
        sources: request.cachedToolRuns[0].sources,
        usage: { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalTokens: 2 },
        raw: { test: true },
        toolRuns: request.cachedToolRuns
      };
    }
  });
  assert.equal(second.conversationId, first.conversationId);
  assert.equal(secondMessages.some((message) => message.role === "user" && message.content === "What is on today's schedule?"), true);
  assert.equal(repository.conversations.length, 2);
});

test("Firestore conversation history reads are scoped to one conversation", async () => {
  const whereCalls = [];
  let collectionCalls = 0;
  const query = {
    where(field, operator, value) {
      whereCalls.push({ field, operator, value });
      return this;
    },
    async get() {
      return { docs: [] };
    }
  };
  const db = {
    collection(name) {
      collectionCalls += 1;
      assert.equal(name, "conversations");
      return query;
    }
  };
  const repository = new FirestoreNexiRepository(db);

  assert.deepEqual(await repository.loadRecentConversations("aquatrace", undefined, 8), []);
  assert.equal(collectionCalls, 0);

  await repository.loadRecentConversations("aquatrace", "trial-session-1", 8);

  assert.deepEqual(whereCalls, [
    { field: "tenantId", operator: "==", value: "aquatrace" },
    { field: "conversationId", operator: "==", value: "trial-session-1" }
  ]);
});
