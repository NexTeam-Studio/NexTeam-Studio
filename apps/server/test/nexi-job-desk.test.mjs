import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ingestSiteJobBlueprint } from "../dist/nexi/siteJobBlueprintIngest.js";
import { extractCompanyCamReportFields, siteJobBlueprintFromCompanyCamReport } from "../dist/nexi/reportDocuments.js";
import { extractAquatraceDocument, ingestAquatraceReportSet, parseLossNotation } from "../dist/fielddocs/reportExtraction.js";
import { answerNexiMessage, runExplicitLocalToolLoop } from "../dist/nexi/nexiService.js";
import { createNexiJobDeskTools } from "../dist/nexi/nexiTools.js";
import { FirestoreNexiRepository, MemoryNexiRepository } from "../dist/nexi/nexiRepository.js";
import { createContextNexiTools } from "../dist/context/nexiTools.js";
import { MemoryUsageLogWriter } from "../dist/usageLog.js";
import { enforceSources, promptIsActionRequest, promptIsMetaOrFeedback, runNexiToolLoop } from "@nexteam/nexi";

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
  assert.equal(checked.answer, "I don't have that written down anywhere yet. I wrote it down so we can fill the gap.");
});

test("source check does not block meta or feedback turns", () => {
  const meta = enforceSources("I use Jobber, CompanyCam, and native SiteJobBlueprint sources.", [], "What sources do you use");
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
  const action = enforceSources("I drafted the email and parked it for approval.", [], "Send an email to owner@example.test saying I will call Thursday.");
  assert.equal(action.ok, true);
  const failure = enforceSources("I couldn't open that email yet. I wrote it down so we can fix it.", [], "What did the Semrush site audit say?");
  assert.equal(failure.ok, true);
  const noSource = enforceSources("I don't have that written down anywhere yet. I wrote it down so we can fill the gap.", [], "What did the Semrush site audit say?");
  assert.equal(noSource.ok, true);
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
        return { result: { jobs: [] }, sources: [{ rail: "jobber", ref: "jobs", label: "Jobber jobs" }] };
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
        return { result: { id: "job_1" }, sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job" }] };
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

test("Nexi Anthropic gateway preloads email source refs with getEmailMessage", async () => {
  const calls = [];
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "read email:chris:msg_1 and list attachments" }],
    tools: [{
      name: "summarizeInbox",
      description: "Summarize inbox.",
      inputSchema: z.object({ maxResults: z.number().optional() }),
      handler: async () => {
        throw new Error("summarizeInbox should not run for explicit email refs");
      }
    }, {
      name: "getEmailMessage",
      description: "Read email message.",
      inputSchema: z.object({ mailbox: z.string(), messageId: z.string() }),
      handler: async (_tenant, args) => {
        toolCalls.push(args);
        return {
          result: { message: { id: "msg_1", tenantId: "aquatrace", mailbox: "chris", threadId: "thr_1", bodyText: "body", labels: [], attachments: [] } },
          sources: [{ rail: "email", ref: "email:chris:msg_1", label: "Email chris msg_1" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "The email has no attachments." }],
        usage: { input_tokens: 10, output_tokens: 6 }
      }), { status: 200 });
    }
  });
  assert.deepEqual(toolCalls, [{ mailbox: "chris", messageId: "msg_1" }]);
  assert.match(calls[0].messages.at(-1).content, /Verified getEmailMessage result/);
  assert.deepEqual(calls[0].tools, []);
  assert.equal(result.toolRuns[0].name, "getEmailMessage");
  assert.equal(result.sources[0].ref, "email:chris:msg_1");
});

test("Nexi Anthropic gateway preloads draftEmail for send-email action commands", async () => {
  const calls = [];
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "Send an email to owner@example.test saying I can confirm Thursday." }],
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
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "I drafted the email and parked it for approval." }],
        usage: { input_tokens: 10, output_tokens: 6 }
      }), { status: 200 });
    }
  });
  assert.deepEqual(toolCalls, [{
    to: ["owner@example.test"],
    subject: "I can confirm Thursday",
    bodyText: "I can confirm Thursday."
  }]);
  assert.match(calls[0].messages.at(-1).content, /Verified draftEmail result/);
  assert.deepEqual(calls[0].tools, []);
  assert.equal(result.toolRuns[0].name, "draftEmail");
  assert.equal(result.sources[0].ref, "approval_1");
  assert.equal(result.answer, "I drafted the email and parked it for approval.");
});

test("Nexi Anthropic gateway preloads draftEmail for send-me-at action commands", async () => {
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "send me an email at owner@example.test, tell me Bryson City is on schedule for tomorrow" }],
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
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "I drafted the email and parked it for approval." }],
      usage: { input_tokens: 10, output_tokens: 6 }
    }), { status: 200 })
  });
  assert.deepEqual(toolCalls, [{
    to: ["owner@example.test"],
    subject: "Bryson City is on schedule for tomorrow",
    bodyText: "Bryson City is on schedule for tomorrow"
  }]);
  assert.equal(result.toolRuns[0].name, "draftEmail");
  assert.equal(result.sources[0].ref, "approval_1");
  assert.equal(result.answer, "I drafted the email and parked it for approval.");
});

test("Nexi Anthropic gateway preloads runEvaporation for evap report requests", async () => {
  const calls = [];
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{
      role: "user",
      content: "Run the evap for 100 Main Street, Bryson City, NC 28713 with surface area 500 square feet, water temperature 82 degrees, and observed daily loss 1.5 inches."
    }],
    tools: [{
      name: "searchEmail",
      description: "Search email.",
      inputSchema: z.object({ keywords: z.string().optional() }),
      handler: async () => {
        throw new Error("searchEmail should not run for evap requests");
      }
    }, {
      name: "runEvaporation",
      description: "Run evaporation.",
      inputSchema: z.object({
        address: z.string(),
        zip: z.string().optional(),
        surfaceAreaFt2: z.number(),
        waterTempF: z.number(),
        observedLoss: z.object({ inches: z.number(), observationDays: z.number() }).optional()
      }),
      handler: async (_tenant, args) => {
        toolCalls.push(args);
        return {
          result: {
            report: {
              id: "evap_1",
              calculation: {
                evapInchesPerDay: 1.2384,
                leakInchesPerDay: 0.2616
              }
            },
            pdfUrl: "/api/evaporation/reports/evap_1/pdf?tenantId=aquatrace"
          },
          sources: [{ rail: "native", ref: "evap_1", label: "Aquatrace evaporation report evap_1" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "I ran the evaporation report and made the PDF." }],
        usage: { input_tokens: 10, output_tokens: 6 }
      }), { status: 200 });
    }
  });
  assert.deepEqual(toolCalls, [{
    address: "100 Main Street, Bryson City, NC 28713",
    zip: "28713",
    surfaceAreaFt2: 500,
    waterTempF: 82,
    observedLoss: { inches: 1.5, observationDays: 1 }
  }]);
  assert.match(calls[0].messages.at(-1).content, /Verified runEvaporation result/);
  assert.deepEqual(calls[0].tools, []);
  assert.equal(result.toolRuns[0].name, "runEvaporation");
  assert.equal(result.sources[0].ref, "evap_1");
});

test("Nexi Anthropic gateway preloads draftCampaign for campaign action commands", async () => {
  const calls = [];
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "Draft the VGB hotel GM outreach campaign for the Chris-owned test list." }],
    tools: [{
      name: "searchEmail",
      description: "Search email.",
      inputSchema: z.object({ keywords: z.string().optional() }),
      handler: async () => {
        throw new Error("searchEmail should not run for campaign draft requests");
      }
    }, {
      name: "draftCampaign",
      description: "Draft campaign.",
      inputSchema: z.object({
        templateId: z.string(),
        audience: z.object({
          channel: z.enum(["email", "sms"]),
          tagsAny: z.array(z.string()).optional(),
          consentRequired: z.boolean(),
          excludeSuppressed: z.boolean(),
          maxResults: z.number()
        })
      }),
      handler: async (_tenant, args) => {
        toolCalls.push(args);
        return {
          result: {
            campaign: { id: "camp_1", name: "VGB Hotel GM Outreach" },
            selectedCount: 2,
            queuedApprovals: [{ id: "appr_1" }],
            boundary: { executionBlocked: true },
            sendsAreApprovalQueuedOnly: true
          },
          sources: [{ rail: "native", ref: "camp_1", label: "Campaign VGB Hotel GM Outreach" }]
        };
      }
    }],
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "I queued the campaign draft for approval only." }],
        usage: { input_tokens: 5, output_tokens: 5 }
      }), { status: 200 });
    },
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer"
  });

  assert.deepEqual(toolCalls, [{
    templateId: "vgb-hotel-gm-outreach",
    audience: {
      channel: "email",
      tagsAny: ["test"],
      consentRequired: true,
      excludeSuppressed: true,
      maxResults: 2
    }
  }]);
  assert.match(calls[0].messages.at(-1).content, /Verified draftCampaign result/);
  assert.deepEqual(calls[0].tools, []);
  assert.equal(result.toolRuns[0].name, "draftCampaign");
  assert.equal(result.sources[0].ref, "camp_1");
});

test("Nexi Anthropic gateway treats mailbox address follow-ups as email search context", async () => {
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "Check email for a report sent to Medallion Pool Company last week" },
      { role: "assistant", content: "Which mailbox should I check?" },
      { role: "user", content: "aquatraceleak@gmail.com" }
    ],
    tools: [{
      name: "searchEmail",
      description: "Search email.",
      inputSchema: z.object({ mailbox: z.string().optional(), keywords: z.string().optional() }),
      handler: async (_tenant, args) => {
        toolCalls.push(args);
        return {
          result: { count: 1, messages: [{ id: "msg_1", mailbox: "aquatraceleak", subject: "Medallion report" }] },
          sources: [{ rail: "email", ref: "email:aquatraceleak:msg_1", label: "Email aquatraceleak msg_1" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "I found one Medallion Pool Company report email." }],
      usage: { input_tokens: 10, output_tokens: 6 }
    }), { status: 200 })
  });
  assert.deepEqual(toolCalls, [{
    mailbox: "aquatraceleak",
    keywords: "Check email for a report sent to Medallion Pool Company last week"
  }]);
  assert.equal(result.toolRuns[0].name, "searchEmail");
  assert.equal(result.sources[0].ref, "email:aquatraceleak:msg_1");
});

test("Nexi routes broad inbox commands to summary and triage instead of email search", async () => {
  const toolCalls = [];
  const base = {
    tenant: tenant(),
    system: "Use tools.",
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "I checked the inbox." }],
      usage: { input_tokens: 5, output_tokens: 5 }
    }), { status: 200 })
  };
  const summarizeInbox = {
    name: "summarizeInbox",
    description: "Summarize inbox.",
    inputSchema: z.object({ mailbox: z.string().optional(), keywords: z.string().optional(), maxResults: z.number().optional() }),
    handler: async (_tenant, args) => {
      toolCalls.push(["summarizeInbox", args]);
      return {
        result: { count: 0, items: [] },
        sources: [{ rail: "native", ref: "email-summary:test", label: "Email summary test" }]
      };
    }
  };
  const triageInbox = {
    name: "triageInbox",
    description: "Triage inbox.",
    inputSchema: z.object({ mailbox: z.string().optional(), date: z.string().optional(), keywords: z.string().optional(), maxResults: z.number().optional() }),
    handler: async (_tenant, args) => {
      toolCalls.push(["triageInbox", args]);
      return {
        result: { items: [] },
        sources: [{ rail: "native", ref: "email-triage:test", label: "Email triage test" }]
      };
    }
  };
  const searchEmail = {
    name: "searchEmail",
    description: "Search email.",
    inputSchema: z.object({ keywords: z.string().optional() }),
    handler: async () => {
      throw new Error("generic inbox commands should not search email");
    }
  };

  await runNexiToolLoop({ ...base, messages: [{ role: "user", content: "check inbox" }], tools: [summarizeInbox, triageInbox, searchEmail] });
  await runNexiToolLoop({ ...base, messages: [{ role: "user", content: "summarize inbox" }], tools: [summarizeInbox, triageInbox, searchEmail] });
  await runNexiToolLoop({ ...base, messages: [{ role: "user", content: "order unread" }], tools: [summarizeInbox, triageInbox, searchEmail] });

  assert.deepEqual(toolCalls.map((entry) => entry[0]), ["summarizeInbox", "summarizeInbox", "triageInbox"]);
  assert.match(toolCalls[2][1].keywords, /is:unread/);
});

test("Nexi routes basic clock and weather questions to native context tools", async () => {
  const calls = [];
  const tools = createContextNexiTools({
    now: () => new Date("2026-07-08T16:30:00.000Z"),
    weatherProvider: {
      async getWeather(input) {
        calls.push(["weather", input]);
        return {
          current: {
            city: "Fair Play",
            airTempF: 91,
            relativeHumidityPct: 55,
            windMph: 4,
            fetchedAt: "2026-07-08T16:30:00.000Z"
          },
          forecast: []
        };
      }
    }
  });
  const base = {
    tenant: tenant(),
    system: "Use tools.",
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "I checked it." }],
      usage: { input_tokens: 5, output_tokens: 5 }
    }), { status: 200 })
  };
  const time = await runNexiToolLoop({ ...base, messages: [{ role: "user", content: "what time is it" }] });
  const weather = await runNexiToolLoop({ ...base, messages: [{ role: "user", content: "current temp in Fair Play" }] });
  assert.equal(time.toolRuns[0].name, "getCurrentTime");
  assert.equal(weather.toolRuns[0].name, "getCurrentWeather");
  assert.deepEqual(calls[0], ["weather", { address: "Fair Play, SC" }]);
});

test("Nexi Anthropic gateway sanitizes deterministic email tool failures", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What did the Semrush site audit say?" }],
    tools: [{
      name: "searchEmail",
      description: "Search email.",
      inputSchema: z.object({ keywords: z.string().optional() }),
      handler: async () => {
        throw new Error("Invalid time value");
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("Anthropic should not be called for a deterministic email tool failure");
    }
  });
  assert.equal(result.toolRuns[0].name, "searchEmail");
  assert.match(JSON.stringify(result.toolRuns[0].result), /failed safely/);
  assert.doesNotMatch(JSON.stringify(result.toolRuns[0].result), /Invalid time value/);
  assert.equal(result.answer, "I couldn't find an email that matched that. I wrote it down so we can fill the gap.");
  assert.equal(result.failureReason, "email_lookup_without_sources");
});

test("Nexi Anthropic gateway turns empty deterministic email searches into logged honest failures", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What did the Semrush site audit say?" }],
    tools: [{
      name: "searchEmail",
      description: "Search email.",
      inputSchema: z.object({ keywords: z.string().optional() }),
      handler: async () => ({ result: { messages: [] }, sources: [] })
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("Anthropic should not be called for an empty deterministic email lookup");
    }
  });
  assert.equal(result.toolRuns[0].name, "searchEmail");
  assert.equal(result.answer, "I couldn't find an email that matched that. I wrote it down so we can fill the gap.");
  assert.equal(result.failureReason, "email_lookup_without_sources");
});

test("Nexi Anthropic gateway preloads triageInbox for attention prompts", async () => {
  const calls = [];
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "what needs my attention" }],
    tools: [{
      name: "getJobDetail",
      description: "Read job detail.",
      inputSchema: z.object({ nameQuery: z.string().optional() }),
      handler: async () => {
        throw new Error("getJobDetail should not run for inbox triage prompts");
      }
    }, {
      name: "triageInbox",
      description: "Triage inbox.",
      inputSchema: z.object({ date: z.string(), maxResults: z.number().optional() }),
      handler: async (_tenant, args) => {
        toolCalls.push(args);
        return {
          result: { scannedCount: 1, excludedNoiseCount: 0, items: [{ category: "client_inquiry", messageId: "msg_1" }] },
          sources: [{ rail: "email", ref: "email:chris:msg_1", label: "Email chris msg_1" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "One client inquiry needs attention." }],
        usage: { input_tokens: 10, output_tokens: 6 }
      }), { status: 200 });
    }
  });
  assert.equal(toolCalls.length, 1);
  assert.match(calls[0].messages.at(-1).content, /Verified triageInbox result/);
  assert.deepEqual(calls[0].tools, []);
  assert.equal(result.toolRuns[0].name, "triageInbox");
  assert.equal(result.sources[0].ref, "email:chris:msg_1");
});

test("Nexi payment-status prompts exhaust schedule, Jobber, native invoice, and email rails", async () => {
  const calls = [];
  const toolNames = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "What was on today's schedule?" },
      { role: "assistant", content: "Rachel Payne was today's pool." },
      { role: "user", content: "did todays pool pay?" }
    ],
    tools: [
      {
        name: "getSchedule",
        description: "Read schedule.",
        inputSchema: z.object({ from: z.string(), to: z.string() }),
        handler: async (_tenant, args) => {
          toolNames.push(["getSchedule", args]);
          return {
            result: { jobs: [{ id: "job_1", title: "Rachel Payne leak detection", client: { name: "Rachel Payne" } }] },
            sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Rachel Payne" }]
          };
        }
      },
      {
        name: "getJobDetail",
        description: "Read job detail.",
        inputSchema: z.object({ nameQuery: z.string().optional(), id: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolNames.push(["getJobDetail", args]);
          return {
            result: { job: { id: "job_1", status: "lead", title: "Rachel Payne leak detection" } },
            sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Rachel Payne" }]
          };
        }
      },
      {
        name: "invoiceStatus",
        description: "Read native invoice status.",
        inputSchema: z.object({ invoiceId: z.string().optional(), clientId: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolNames.push(["invoiceStatus", args]);
          return {
            result: { invoices: [{ id: "inv_1", title: "Rachel Payne invoice", status: "paid", balanceCents: 0 }] },
            sources: [{ rail: "native", ref: "inv_1", label: "Native invoice Rachel Payne" }]
          };
        }
      },
      {
        name: "searchEmail",
        description: "Search email receipts.",
        inputSchema: z.object({ keywords: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolNames.push(["searchEmail", args]);
          return {
            result: { messages: [{ messageId: "msg_1", subject: "Payment received" }] },
            sources: [{ rail: "email", ref: "email:chris:msg_1", label: "Email chris msg_1" }]
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
        content: [{ type: "text", text: "Yes. Native invoices show Rachel Payne paid with a zero balance, and email has a payment receipt." }],
        usage: { input_tokens: 12, output_tokens: 9, cache_read_input_tokens: 16 }
      }), { status: 200 });
    }
  });
  assert.deepEqual(toolNames.map((entry) => entry[0]), ["getSchedule", "getJobDetail", "invoiceStatus", "searchEmail"]);
  assert.match(calls[0].messages.at(-1).content, /For payment, paid\/unpaid, invoice, balance, and receipt questions/i);
  assert.equal(result.sources.some((source) => source.rail === "jobber"), true);
  assert.equal(result.sources.some((source) => source.rail === "native"), true);
  assert.equal(result.sources.some((source) => source.rail === "email"), true);
});

test("Nexi tomorrow schedule prompts reject fabricated stale tool dates", async () => {
  let parsedToolArgs = null;
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "what time is tomorrows pool" }],
    tools: [{
      name: "getSchedule",
      description: "Read schedule.",
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      handler: async (_tenant, args) => {
        parsedToolArgs = args;
        return {
          result: { jobs: [{ id: "job_1", title: "Forrest Ferguson leak detection" }] },
          sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Forrest Ferguson" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "Forrest Ferguson is on tomorrow's schedule." }],
      usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
    }), { status: 200 })
  });
  assert.ok(parsedToolArgs);
  assert.doesNotMatch(parsedToolArgs.from, /^2024-01-/);
  assert.doesNotMatch(parsedToolArgs.to, /^2024-01-/);
  assert.equal(new Date(parsedToolArgs.to).getTime() - new Date(parsedToolArgs.from).getTime(), 24 * 60 * 60 * 1000);
  assert.equal(result.toolRuns[0].name, "getSchedule");
  assert.equal(result.sources.length, 1);
});

test("Nexi distance prompts return capability gaps instead of missing-data failures", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "how far is Forrest Ferguson from the shop?" }],
    tools: [],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("capability gaps should not call the model");
    }
  });
  assert.equal(result.failureReason, "capability_not_available");
  assert.match(result.answer, /can't measure drive distance/i);
  assert.doesNotMatch(result.answer, /written down anywhere/i);
  assert.deepEqual(result.toolRuns, []);
});

test("Nexi report-PDF email requests return capability gaps instead of email search misses", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "email me the report PDFs" }],
    tools: [{
      name: "searchEmail",
      description: "Search email.",
      inputSchema: z.object({ keywords: z.string().optional() }),
      handler: async () => {
        throw new Error("searchEmail should not run for missing report-PDF send capability");
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("capability gaps should not call the model");
    }
  });
  assert.equal(result.failureReason, "capability_not_available");
  assert.match(result.answer, /attach and email report PDFs/i);
  assert.doesNotMatch(result.answer, /find an email|matched/i);
  assert.deepEqual(result.toolRuns, []);
});

test("Nexi existing-report email questions stay on Gmail search", async () => {
  const prompts = [
    "Did I send the report more medallion Pool company last week?",
    "Check email for a report sent to medallion Pool company last week",
    "You need to infer what I mean. Regardless of typos. The report should be sitting in one of the email boxes as sent and I also copy ourselves on those so we should also have a receipt in the mail"
  ];

  for (const prompt of prompts) {
    const toolCalls = [];
    const result = await runNexiToolLoop({
      tenant: tenant(),
      system: "Use tools.",
      messages: [{ role: "user", content: prompt }],
      tools: [{
        name: "searchEmail",
        description: "Search email.",
        inputSchema: z.object({ keywords: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(args);
          return {
            result: { count: 1, messages: [{ id: "msg_1", mailbox: "aquatraceleak", subject: "Medallion report" }] },
            sources: [{ rail: "email", ref: "email:aquatraceleak:msg_1", label: "Email aquatraceleak msg_1" }]
          };
        }
      }],
      routeActionName: "/api/nexi/message",
      taskType: "job_desk_answer",
      env: { ANTHROPIC_API_KEY: "test-key" },
      fetchFn: async () => new Response(JSON.stringify({
        content: [{ type: "text", text: "I found one Medallion Pool Company report email." }],
        usage: { input_tokens: 10, output_tokens: 6 }
      }), { status: 200 })
    });

    assert.equal(toolCalls.length, 1);
    assert.equal(typeof toolCalls[0].keywords, "string");
    assert.ok(toolCalls[0].keywords.length > 0);
    assert.equal(result.toolRuns[0].name, "searchEmail");
    assert.notEqual(result.failureReason, "capability_not_available");
  }
});

test("Nexi broad client list and count prompts route to CRM clientLookup", async () => {
  const prompts = ["show me a client list", "how many clients do we have"];
  for (const prompt of prompts) {
    const toolCalls = [];
    const result = await runNexiToolLoop({
      tenant: tenant(),
      system: "Use tools.",
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: "clientLookup",
          description: "Read native CRM clients.",
          inputSchema: z.object({ q: z.string().default("") }),
          handler: async (_tenant, args) => {
            toolCalls.push(args);
            return {
              result: { clients: [{ id: "client_1", name: "Deborah Justice" }, { id: "client_2", name: "Rachel Payne" }] },
              sources: [{ rail: "native", ref: "clients", label: "Native CRM clients" }]
            };
          }
        },
        {
          name: "searchEmail",
          description: "Search email.",
          inputSchema: z.object({ keywords: z.string().optional() }),
          handler: async () => {
            throw new Error("searchEmail should not run for client list prompts");
          }
        }
      ],
      routeActionName: "/api/nexi/message",
      taskType: "job_desk_answer",
      env: { ANTHROPIC_API_KEY: "test-key" },
      fetchFn: async () => new Response(JSON.stringify({
        content: [{ type: "text", text: "There are 2 clients: Deborah Justice and Rachel Payne." }],
        usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
      }), { status: 200 })
    });
    assert.deepEqual(result.toolRuns.map((run) => run.name), ["clientLookup"]);
    assert.equal(toolCalls[0].q, "");
    assert.equal(result.sources.some((source) => source.ref === "clients"), true);
  }
});

test("Nexi address-only follow-ups preserve the prior distance capability intent", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "how far is Forrest Ferguson from the shop?" },
      { role: "assistant", content: "I can't measure drive distance in chat yet." },
      { role: "user", content: "123 Main Road" }
    ],
    tools: [],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("address-only distance follow-ups should not call the model");
    }
  });
  assert.equal(result.failureReason, "capability_not_available");
  assert.match(result.answer, /can't measure drive distance/i);
  assert.doesNotMatch(result.answer, /written down anywhere/i);
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

test("Nexi answers meta questions directly without exposing tools", async () => {
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
  assert.equal(calls.length, 0);
  assert.equal(toolCalled, false);
  assert.match(result.answer, /work records/);
  assert.deepEqual(result.toolRuns, []);
});

test("Nexi exact echo turns never route to email search", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "Reply with exactly: readiness check." }],
    tools: [{
      name: "searchEmail",
      description: "Search email.",
      inputSchema: z.object({ keywords: z.string() }),
      handler: async () => {
        throw new Error("searchEmail must not run for exact echo turns");
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("Anthropic must not run for exact echo turns");
    }
  });
  assert.equal(result.answer, "readiness check.");
  assert.deepEqual(result.toolRuns, []);
});

test("Nexi feedback about token waste never routes to email search", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "I asked that and now you are wasting api tokens because you should already infer what I asked here" }],
    tools: [{
      name: "searchEmail",
      description: "Search email.",
      inputSchema: z.object({ keywords: z.string() }),
      handler: async () => {
        throw new Error("searchEmail must not run for feedback turns");
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("Anthropic must not run for feedback turns");
    }
  });
  assert.match(result.answer, /noted that feedback/);
  assert.deepEqual(result.toolRuns, []);
});

test("Nexi frustrated date feedback never triggers the source stonewall", async () => {
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "explain this date you randonly pulled from your ass" }],
    tools: [{
      name: "searchEmail",
      description: "Search email.",
      inputSchema: z.object({ keywords: z.string() }),
      handler: async () => {
        throw new Error("searchEmail must not run for date feedback turns");
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("Anthropic must not run for date feedback turns");
    }
  });
  assert.match(result.answer, /noted that feedback/);
  assert.doesNotMatch(result.answer, /written down anywhere/i);
  assert.deepEqual(result.toolRuns, []);
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
        content: [{ type: "text", text: "I found one Deborah Justice photo. Let me know if you want me to pull specific photos." }],
        usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
      }), { status: 200 });
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(parsedToolArgs.projectQuery, "Deborah Justice");
  assert.equal(result.sources.length, 1);
  assert.equal(result.toolRuns[0].name, "getPhotos");
  assert.equal(result.answer, "I found one Deborah Justice photo.");
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
  assert.match(calls[0].messages.at(-2).content, /saved checked records/);
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

test("Nexi assigned follow-ups use the prior job subject and getJobDetail", async () => {
  const calls = [];
  let parsedToolArgs = null;
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "What's on Monday July 6, 2026?" },
      { role: "assistant", content: "Rachel Payne is on Monday." },
      { role: "user", content: "who is assigned to it" }
    ],
    tools: [{
      name: "getJobDetail",
      description: "Read job detail.",
      inputSchema: z.object({ nameQuery: z.string() }),
      handler: async (_tenant, args) => {
        parsedToolArgs = args;
        return {
          result: { job: { title: "Rachel Payne", assignedTo: ["Chris"] } },
          sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Rachel Payne" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "Chris is assigned." }],
        usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
      }), { status: 200 });
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(parsedToolArgs.nameQuery, "Rachel Payne");
  assert.deepEqual(result.toolRuns.map((run) => run.name), ["getJobDetail"]);
});

test("Nexi total-gallons report questions also run SiteJobBlueprint lookup", async () => {
  const calls = [];
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "Findings are in the report. What are the total gallons of Deborah Justice" }],
    tools: [
      {
        name: "getDocuments",
        description: "Read CompanyCam docs.",
        inputSchema: z.object({ projectQuery: z.string(), question: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(["getDocuments", args]);
          return {
            result: { documents: [{ id: "doc_1", text: "Total gallons 37602" }] },
            sources: [{ rail: "companycam", ref: "doc_1", label: "CompanyCam document Deborah Justice report" }]
          };
        }
      },
      {
        name: "lookupSiteJobBlueprintField",
        description: "Read blueprint field.",
        inputSchema: z.object({ field: z.string(), requestedEntity: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(["lookupSiteJobBlueprintField", args]);
          return {
            result: { value: 37602 },
            sources: [{ rail: "native", ref: "blueprint_1", label: "SiteJobBlueprint Deborah Justice" }]
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
        content: [{ type: "text", text: "Deborah Justice total gallons are 37,602." }],
        usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
      }), { status: 200 });
    }
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(result.toolRuns.map((run) => run.name), ["getDocuments", "lookupSiteJobBlueprintField"]);
  assert.equal(toolCalls[1][1].field, "poolGallons");
  assert.equal(toolCalls[1][1].requestedEntity, "Deborah Justice");
});

test("Nexi total-gallons job questions run Jobber and CompanyCam before blueprint fields", async () => {
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What are the total gallons for Deborah Justice?" }],
    tools: [
      {
        name: "getJobDetail",
        description: "Read Jobber job.",
        inputSchema: z.object({ nameQuery: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(["getJobDetail", args]);
          return {
            result: { job: { id: "job_1", title: "Swimming Pool Leak Detection", status: "lead", client: { name: "Deborah Justice" } } },
            sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Deborah Justice" }]
          };
        }
      },
      {
        name: "getDocuments",
        description: "Read CompanyCam docs.",
        inputSchema: z.object({ projectQuery: z.string(), question: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(["getDocuments", args]);
          return {
            result: { documents: [{ id: "doc_1", text: "Total gallons 37602" }] },
            sources: [{ rail: "companycam", ref: "doc_1", label: "CompanyCam document Deborah Justice report" }]
          };
        }
      },
      {
        name: "lookupSiteJobBlueprintField",
        description: "Read blueprint field.",
        inputSchema: z.object({ field: z.string(), requestedEntity: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(["lookupSiteJobBlueprintField", args]);
          return {
            result: { value: 37602 },
            sources: [{ rail: "native", ref: "blueprint_1", label: "SiteJobBlueprint Deborah Justice" }]
          };
        }
      }
    ],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "I checked Jobber and the CompanyCam report. Deborah Justice total gallons are 37,602." }],
      usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
    }), { status: 200 })
  });
  assert.deepEqual(result.toolRuns.map((run) => run.name), ["getJobDetail", "getDocuments", "lookupSiteJobBlueprintField"]);
  assert.equal(toolCalls[0][1].nameQuery, "Deborah Justice");
  assert.equal(toolCalls[1][1].projectQuery, "Deborah Justice");
  assert.equal(toolCalls[2][1].field, "poolGallons");
  assert.equal(toolCalls[2][1].requestedEntity, "Deborah Justice");
});

test("Nexi under-specified evaporation commands read job/report context before running calculator", async () => {
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "use the evaporation calculator on Deborah Justice's pool" }],
    tools: [
      {
        name: "getJobDetail",
        description: "Read Jobber job.",
        inputSchema: z.object({ nameQuery: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(["getJobDetail", args]);
          return {
            result: { job: { id: "job_1", title: "Swimming Pool Leak Detection", address: "181 Isbell Road, Fair Play, SC 29643" } },
            sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Deborah Justice" }]
          };
        }
      },
      {
        name: "getDocuments",
        description: "Read CompanyCam docs.",
        inputSchema: z.object({ projectQuery: z.string(), question: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(["getDocuments", args]);
          return {
            result: {
              reports: [{
                fields: {
                  projectAddress: "181 Isbell Road, Fair Play, SC 29643",
                  evapSurfaceAreaSqFt: 1002.7,
                  evapWaterTempF: 82,
                  observedDailyLossInchesPerDay: 0.5
                }
              }]
            },
            sources: [{ rail: "companycam", ref: "18218446", label: "CompanyCam document Deborah Justice checklist" }]
          };
        }
      },
      {
        name: "runEvaporation",
        description: "Run evaporation.",
        inputSchema: z.object({
          clientName: z.string().optional(),
          address: z.string(),
          surfaceAreaFt2: z.number(),
          waterTempF: z.number(),
          observedLoss: z.object({ inches: z.number(), observationDays: z.number() }).optional()
        }),
        handler: async (_tenant, args) => {
          toolCalls.push(["runEvaporation", args]);
          return {
            result: { report: { calculation: { evapInchesPerDay: 0.25, leakInchesPerDay: 0.25 } } },
            sources: [{ rail: "native", ref: "evap_1", label: "Aquatrace evaporation report evap_1" }]
          };
        }
      }
    ],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "I ran the evaporation calculator for Deborah Justice." }],
      usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
    }), { status: 200 })
  });
  assert.deepEqual(result.toolRuns.map((run) => run.name), ["getJobDetail", "getDocuments", "runEvaporation"]);
  assert.equal(toolCalls[0][1].nameQuery, "Deborah Justice");
  assert.equal(toolCalls[1][1].projectQuery, "Deborah Justice");
  assert.equal(toolCalls[2][1].address, "181 Isbell Road, Fair Play, SC 29643");
  assert.equal(toolCalls[2][1].surfaceAreaFt2, 1002.7);
  assert.equal(toolCalls[2][1].waterTempF, 82);
  assert.deepEqual(toolCalls[2][1].observedLoss, { inches: 0.5, observationDays: 1 });
});

test("Nexi spa-main-drain follow-ups inherit the job and request the spa field", async () => {
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "How many pool main drains did Deborah Justice have?" },
      { role: "assistant", content: "The pool section had 4 main drains." },
      { role: "user", content: "what about the spa main drains?" }
    ],
    tools: [
      {
        name: "getJobDetail",
        description: "Read Jobber job.",
        inputSchema: z.object({ nameQuery: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(["getJobDetail", args]);
          return {
            result: { job: { id: "job_1", title: "Swimming Pool Leak Detection", client: { name: "Deborah Justice" } } },
            sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Deborah Justice" }]
          };
        }
      },
      {
        name: "getDocuments",
        description: "Read CompanyCam docs.",
        inputSchema: z.object({ projectQuery: z.string(), question: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(["getDocuments", args]);
          return {
            result: { reports: [{ fields: { poolMainDrains: 4, spaMainDrains: 2 } }] },
            sources: [{ rail: "companycam", ref: "18218446", label: "CompanyCam document Deborah Justice checklist" }]
          };
        }
      },
      {
        name: "lookupSiteJobBlueprintField",
        description: "Read field.",
        inputSchema: z.object({ field: z.string(), requestedEntity: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(["lookupSiteJobBlueprintField", args]);
          return {
            result: { field: args.field, value: 2 },
            sources: [{ rail: "native", ref: "blueprint_1", label: "SiteJobBlueprint Deborah Justice" }]
          };
        }
      }
    ],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "The spa section lists 2 main drains." }],
      usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
    }), { status: 200 })
  });
  assert.deepEqual(result.toolRuns.map((run) => run.name), ["getJobDetail", "getDocuments", "lookupSiteJobBlueprintField"]);
  assert.equal(toolCalls[0][1].nameQuery, "Deborah Justice");
  assert.equal(toolCalls[1][1].projectQuery, "Deborah Justice");
  assert.equal(toolCalls[2][1].field, "spaMainDrains");
  assert.equal(toolCalls[2][1].requestedEntity, "Deborah Justice");
});

test("Nexi bare entity follow-ups inherit report measurement rails", async () => {
  const toolCalls = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "What is the square footage of the Deborah Justice pool and how many gallons per inch?" },
      { role: "assistant", content: "I found the report numbers." },
      { role: "user", content: "Deborah Justice" }
    ],
    tools: [
      {
        name: "getDocuments",
        description: "Read CompanyCam docs.",
        inputSchema: z.object({ projectQuery: z.string(), question: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(["getDocuments", args]);
          return {
            result: { documents: [{ id: "doc_1", text: "Square footage 1002.7; gallons per inch 626.7" }] },
            sources: [{ rail: "companycam", ref: "doc_1", label: "CompanyCam document Deborah Justice report" }]
          };
        }
      },
      {
        name: "lookupSiteJobBlueprintField",
        description: "Read blueprint field.",
        inputSchema: z.object({ field: z.string().optional(), requestedEntity: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolCalls.push(["lookupSiteJobBlueprintField", args]);
          return {
            result: { value: 37602 },
            sources: [{ rail: "native", ref: "blueprint_1", label: "SiteJobBlueprint Deborah Justice" }]
          };
        }
      }
    ],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "Deborah Justice has 1,002.7 sq ft and 626.7 gallons per inch." }],
      usage: { input_tokens: 8, output_tokens: 6, cache_read_input_tokens: 16 }
    }), { status: 200 })
  });
  assert.deepEqual(result.toolRuns.map((run) => run.name), ["getDocuments", "lookupSiteJobBlueprintField"]);
  assert.equal(toolCalls[0][1].projectQuery, "Deborah Justice");
  assert.equal(toolCalls[1][1].requestedEntity, "Deborah Justice");
  assert.equal(result.sources.some((source) => source.rail === "companycam"), true);
  assert.equal(result.sources.some((source) => source.rail === "native"), true);
});

test("Aquatrace report extraction handles locked report rules", () => {
  const loss = parseLossNotation('2" + 1/2"');
  assert.equal(loss.inchesPerDay, 2.5);

  const jobReportText = `
Summary Summary Valley View Condominiums Client Name Dillard, GA City / State Chris Sears Logan Sears Aquatrace Technician Name(s) Tuesday, June 16th, 2026 Project Service Date 3:00pm, June 16th, 2026 Project Service Completion Time
Swimming Pool Leak Detection Details /Results
-- 2 of 10 --
Structure had a crack defect without water loss. Plumbing leak found at the return line with hard water loss.
-- 3 of 10 --
Conditions Upon Arrival Daily Evaporation Index 0 1/4" Reported Daily Loss 2" + 1/2" Pool/Spa Overview Skimmer System Type skimmer How many skimmers 2 13 wall returns / 5 cleaner ports
Measurements Square Footage (Surface Area) 1048.9ft² Estimated Average Depth (Inches) 40in Estimated Approximate Gallons / Inch ... 650 Gallons/Inch Estimated Approximate Total Gallons 42,000 Gallons
Testing Procedures Used dye test, pressure test Testing Procedures Successful dye test Results
`;
  const moasureText = "PLAN VIEW 134.2ft (1048.9ft²) Created on 16 Jun 2026 PLAN VIEW : EDGES 134.2ft (1048.9ft²) Created on 16 Jun 2026 Base Layer 1 (0.0ft), 39.8ft, (-0.0ft)";
  const orphanMoasureText = "PLAN VIEW 94.0ft (526.6ft²) Created on 26 May 2026 Base Layer 1 (0.0ft), 19.8ft, (0.0ft)";
  const evapText = 'Pool Evaporation Report Generated: June 16, 2026 ZIP Code 30537 Water Temp 83°F Surface Area 1049 ft² Observed Daily Loss 2" + 1/2" EVAPORATION ESTIMATE 0 3/4" inches / day 451 gallons / day POTENTIAL LEAK LOSS (AFTER EVAPORATION) 1 3/4" inches / day 1183 gallons / day TOTAL DAILY WATER LOSS 2 1/2" inches / day 1635 gallons / day';
  const set = ingestAquatraceReportSet({
    documents: [
      { id: "checklist-0616", label: "Exported - Current Aquatrace Swimming Pool Leak Detection Checklist 06-16-2026.pdf", text: jobReportText },
      { id: "moasure-0616", label: "Moasure Export (18).pdf", text: moasureText },
      { id: "evap-0616", label: "Swimming Pool Evaporation Calculator _ Aquatrace Leak Detection (1).pdf", text: evapText },
      { id: "moasure-orphan", label: "Moasure Export (12).pdf", text: orphanMoasureText }
    ],
    jobberHierarchyCandidates: [{
      clientName: "Valley View Condominiums",
      propertyName: "Pool",
      tierPath: ["Valley View Condominiums", "Pool"],
      jobberClientId: "jobber_client_1",
      jobberPropertyId: "jobber_property_1"
    }]
  });

  assert.equal(set.visits.length, 1);
  const visit = set.visits[0];
  assert.equal(visit.clientDisplayName, "Valley View Condominiums");
  assert.equal(visit.serviceDateKey, "2026-06-16");
  assert.deepEqual(visit.sourceDocumentIds, ["checklist-0616", "moasure-0616", "evap-0616"]);
  assert.equal(visit.fields.gallonsPerInch, 655.5625);
  assert.equal(visit.fields.observedDailyLossInchesPerDay, 2.5);
  assert.equal(visit.fields.evapEstimateInchesPerDay, 0.75);
  assert.equal(visit.fields.parentClientName, "Valley View Condominiums");
  assert.equal(visit.jobReport.results.structure.status, "pass");
  assert.equal(visit.jobReport.results.structure.defectWithoutLoss, true);
  assert.equal(visit.jobReport.results.plumbing.status, "fail");
  assert.equal(visit.jobReport.results.plumbing.hardWaterLossFound, true);
  assert.match(visit.flags.join(","), /moasure_linked_by_date_match/);
  assert.match(visit.flags.join(","), /evap_pdf_overrides_checklist_delta_inches:0.5/);
  assert.match(visit.fields.legacyParsedCountsJson, /wallReturn/);
  assert.equal(set.unresolvedDocs.length, 1);
  assert.equal(set.unresolvedDocs[0].documentId, "moasure-orphan");
});

test("Aquatrace document classifier parses standalone Moasure and evap PDFs", () => {
  const moasure = extractAquatraceDocument({
    id: "l3-moasure",
    label: "L3 Campus - Statehouse Arena.pdf",
    text: "AQUATRACE : L3 CAMPUS - STATEHOUSE ARENA : PLAN VIEW 159.6ft (1224.6ft²) Created on 23 Jun 2026 DEPTH VIEW 1224.6ft² (197gal)"
  });
  assert.equal(moasure.documentType, "moasure_export");
  assert.equal(moasure.createdDateKey, "2026-06-23");
  assert.equal(moasure.titleClientHint, "L3 CAMPUS - STATEHOUSE ARENA");
  assert.equal(moasure.areaSqFt, 1224.6);

  const evap = extractAquatraceDocument({
    id: "l3-evap",
    label: "Swimming Pool Evaporation Calculator _ Aquatrace Leak Detection.pdf",
    text: 'Pool Evaporation Report Generated: June 23, 2026 ZIP Code 32301 Water Temp 85°F Surface Area 1065 ft² EVAPORATION ESTIMATE 0 1/4" inches / day 199 gallons / day'
  });
  assert.equal(evap.documentType, "evap_calc");
  assert.equal(evap.generatedDateKey, "2026-06-23");
  assert.equal(evap.evapEstimate.inchesPerDay, 0.25);
  assert.equal(evap.evapGallonsPerDay, 199);
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
  assert.equal(toolNames[0][1].nameQuery, "Deborah Justice");
  assert.equal(toolNames[1][1].projectQuery, "Deborah Justice");
  assert.match(calls[0].messages.at(-1).content, /Verified getJobDetail result/);
  assert.match(calls[0].messages.at(-1).content, /Verified getDocuments result/);
  assert.equal(result.sources.some((source) => source.rail === "jobber"), true);
  assert.equal(result.sources.some((source) => source.rail === "companycam"), true);
});

test("Nexi typo issue prompts still preload both Jobber and CompanyCam rails", async () => {
  const toolNames = [];
  await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "what ssues were found on rachel paynes pool" }],
    tools: [
      {
        name: "getJobDetail",
        description: "Read job.",
        inputSchema: z.object({ nameQuery: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolNames.push(["getJobDetail", args]);
          return {
            result: { job: { id: "job_1", title: "Swimming Pool Leak Detection", client: { name: "Rachel Payne" } } },
            sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Rachel Payne" }]
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
            result: { reports: [{ fields: { reportFindings: "Leak at return line connection." } }] },
            sources: [{ rail: "companycam", ref: "doc_1", label: "CompanyCam document Rachel Payne report" }]
          };
        }
      }
    ],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "CompanyCam says the issue was the return line connection." }],
      usage: { input_tokens: 12, output_tokens: 9, cache_read_input_tokens: 16 }
    }), { status: 200 })
  });
  assert.deepEqual(toolNames.map((entry) => entry[0]), ["getJobDetail", "getDocuments"]);
});

test("Nexi completion-time prompts preload Jobber and CompanyCam report rails", async () => {
  const toolNames = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "what was the service time completion for Deborah Justice" }],
    tools: [
      {
        name: "getJobDetail",
        description: "Read job.",
        inputSchema: z.object({ nameQuery: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolNames.push(["getJobDetail", args]);
          return {
            result: { job: { id: "job_1", title: "Swimming Pool Leak Detection", status: "lead", client: { name: "Deborah Justice" } } },
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
            result: { reports: [{ fields: { completionTime: "3:10pm, Thursday July 2nd, 2026", technicianNames: ["Chris", "Logan"] } }] },
            sources: [{ rail: "companycam", ref: "18218446", label: "CompanyCam document Deborah Justice checklist" }]
          };
        }
      }
    ],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "CompanyCam says Deborah Justice was completed at 3:10pm Thursday July 2, 2026 by Chris and Logan." }],
      usage: { input_tokens: 12, output_tokens: 9, cache_read_input_tokens: 16 }
    }), { status: 200 })
  });
  assert.deepEqual(toolNames.map((entry) => entry[0]), ["getJobDetail", "getDocuments"]);
  assert.equal(toolNames[0][1].nameQuery, "Deborah Justice");
  assert.equal(toolNames[1][1].projectQuery, "Deborah Justice");
  assert.equal(result.sources.some((source) => source.rail === "jobber"), true);
  assert.equal(result.sources.some((source) => source.ref === "18218446"), true);
});

test("Nexi completion-time typo prompts still preload Jobber and CompanyCam report rails", async () => {
  const toolNames = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "what was the service ime competion for Deborah Justice" }],
    tools: [
      {
        name: "getJobDetail",
        description: "Read job.",
        inputSchema: z.object({ nameQuery: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolNames.push(["getJobDetail", args]);
          return {
            result: { job: { id: "job_1", title: "Swimming Pool Leak Detection", status: "lead", client: { name: "Deborah Justice" } } },
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
            result: { reports: [{ fields: { completionTime: "3:10pm, Thursday July 2nd, 2026", technicianNames: ["Chris", "Logan"] } }] },
            sources: [{ rail: "companycam", ref: "18218446", label: "CompanyCam document Deborah Justice checklist" }]
          };
        }
      }
    ],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async (_url, init) => {
      const request = JSON.parse(init.body);
      assert.match(request.messages.at(-1).content, /do not treat Jobber's missing completion\/status\/measurement field/i);
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "CompanyCam says Deborah Justice was completed at 3:10pm Thursday July 2, 2026 by Chris and Logan." }],
        usage: { input_tokens: 12, output_tokens: 9, cache_read_input_tokens: 16 }
      }), { status: 200 });
    }
  });
  assert.deepEqual(toolNames.map((entry) => entry[0]), ["getJobDetail", "getDocuments"]);
  assert.equal(toolNames[0][1].nameQuery, "Deborah Justice");
  assert.equal(toolNames[1][1].projectQuery, "Deborah Justice");
  assert.equal(result.sources.some((source) => source.rail === "jobber"), true);
  assert.equal(result.sources.some((source) => source.ref === "18218446"), true);
});

test("Nexi correction follow-ups resume CompanyCam report lookup instead of email search", async () => {
  const toolNames = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "what was the service time completion for Deborah Justice" },
      { role: "assistant", content: "Deborah Justice is currently a lead and no completion date exists." },
      { role: "user", content: "yes there is, incorrect here, service completion is in company cam reports" },
      { role: "assistant", content: "You're right to flag that. I logged this as user_flagged_incorrect and tied it to my prior answer." },
      { role: "user", content: "ok, where is the answer then, i corrected you and you should have replied with correct answer" }
    ],
    tools: [
      {
        name: "searchEmail",
        description: "Search email.",
        inputSchema: z.object({ keywords: z.string().optional() }),
        handler: async () => {
          throw new Error("searchEmail should not run for correction follow-ups");
        }
      },
      {
        name: "getJobDetail",
        description: "Read job.",
        inputSchema: z.object({ nameQuery: z.string().optional() }),
        handler: async (_tenant, args) => {
          toolNames.push(["getJobDetail", args]);
          return {
            result: { job: { id: "job_1", title: "Swimming Pool Leak Detection", status: "lead", client: { name: "Deborah Justice" } } },
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
            result: { reports: [{ fields: { completionTime: "3:10pm, Thursday July 2nd, 2026", technicianNames: ["Chris", "Logan"] } }] },
            sources: [{ rail: "companycam", ref: "18218446", label: "CompanyCam document Deborah Justice checklist" }]
          };
        }
      }
    ],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "The answer is in CompanyCam: Deborah Justice was completed at 3:10pm Thursday July 2, 2026 by Chris and Logan." }],
      usage: { input_tokens: 12, output_tokens: 9, cache_read_input_tokens: 16 }
    }), { status: 200 })
  });
  assert.deepEqual(toolNames.map((entry) => entry[0]), ["getJobDetail", "getDocuments"]);
  assert.equal(toolNames[0][1].nameQuery, "Deborah Justice");
  assert.equal(toolNames[1][1].projectQuery, "Deborah Justice");
  assert.equal(result.sources.some((source) => source.ref === "18218446"), true);
});

test("Nexi technician prompts preload Jobber plus CompanyCam documents and photos", async () => {
  const toolNames = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "Who are the technicians for Deborah Justice?" }],
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

test("Nexi address prompts preload Jobber details instead of answering from memory", async () => {
  const toolNames = [];
  const result = await runNexiToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "What is Forrest Ferguson's address?" }],
    tools: [{
      name: "getJobDetail",
      description: "Read job.",
      inputSchema: z.object({ nameQuery: z.string().optional() }),
      handler: async (_tenant, args) => {
        toolNames.push(["getJobDetail", args]);
        return {
          result: { job: { id: "job_1", title: "Swimming Pool Leak Detection", client: { name: "Forrest Ferguson" }, address: "290 River Oaks Drive" } },
          sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Forrest Ferguson" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "Forrest Ferguson's address is 290 River Oaks Drive." }],
      usage: { input_tokens: 12, output_tokens: 9, cache_read_input_tokens: 16 }
    }), { status: 200 })
  });
  assert.deepEqual(toolNames.map((entry) => entry[0]), ["getJobDetail"]);
  assert.equal(result.sources[0].rail, "jobber");
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
      sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Rachel Payne" }],
      usage: { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalTokens: 2 },
      raw: { test: true },
      toolRuns: [{ name: "getSchedule", result: { jobs: [] }, sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Rachel Payne" }] }]
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

test("CompanyCam report extraction keeps pool, spa, and basin count sections separate", async () => {
  const fields = extractCompanyCamReportFields(`
Swimming Pool Leak Detection Details /Results
Pool/Spa Overview
Pool How many skimmers 2 How many wall returns 13 How many floor returns 0 How many main drains 4 How many lights 2 How many cleaner ports 5
Spa How many skimmers 0 How many wall returns 6 How many floor returns 0 How many main drains 2 How many lights 1 How many cleaner ports 0
Catch Basin How many skimmers 0 How many wall returns 1 How many floor returns 0 How many main drains 1 How many lights 0 How many cleaner ports 0
Measurements Square Footage (Surface Area) 1002.7ftÂ² Estimated Average Depth (Inches) 60in Estimated Approximate Total Gallons 37,602 Gallons
`);
  assert.equal(fields.poolMainDrains, 4);
  assert.equal(fields.spaMainDrains, 2);
  assert.equal(fields.catchBasinMainDrains, 1);
  assert.match(fields.poolSpaCountsJson, /"spaMainDrains":2/);
});

test("SiteJobBlueprint field lookup reads section-scoped counts from old JSON fields", async () => {
  const repository = new MemoryNexiRepository();
  await repository.saveSiteJobBlueprint({
    id: "site_job_deborah_justice",
    tenantId: "aquatrace",
    kind: "site_blueprint",
    fields: {
      projectName: "Deborah Justice",
      poolSpaCountsJson: JSON.stringify({ poolMainDrains: 4, spaMainDrains: 2 })
    },
    extractedFrom: "companycam-doc:18218446",
    extractedAt: new Date().toISOString()
  });
  const tool = createNexiJobDeskTools({}, repository).find((candidate) => candidate.name === "lookupSiteJobBlueprintField");
  assert.ok(tool);
  const result = await tool.handler(tenant(), { field: "spaMainDrains", requestedEntity: "Deborah Justice" });
  assert.equal(result.result.value, 2);
  assert.equal(result.sources.length, 1);
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

test("Nexi service logs softer correction wording before the source gate can fire", async () => {
  const repository = new MemoryNexiRepository();
  await repository.saveConversation({
    tenantId: "aquatrace",
    conversationId: "trial-day-1b",
    userText: "What was the issue at Camp Mikell?",
    assistantText: "The job title says swimming pool leak detection.",
    sources: [{ rail: "jobber", ref: "job_1", label: "Jobber job Camp Mikell" }]
  });
  const result = await answerNexiMessage({
    tenant: tenant(),
    message: "That was incorrect, it's in CompanyCam.",
    conversationId: "trial-day-1b",
    tools: [],
    repository,
    gateway: async () => {
      throw new Error("correction handling should not call the model");
    }
  });
  assert.match(result.failureId, /^fail_/);
  assert.equal(repository.failureLog[0].reason, "user_flagged_incorrect");
  assert.match(repository.failureLog[0].correctionText, /CompanyCam/);
  assert.equal(repository.failureLog[0].flaggedAnswer, "The job title says swimming pool leak detection.");
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
