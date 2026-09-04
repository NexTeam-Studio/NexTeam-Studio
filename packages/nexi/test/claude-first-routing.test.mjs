import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { runNexiToolLoop } from "../dist/index.js";

const tenant = {
  id: "test-tenant",
  name: "Test Tenant",
  industryPack: "pool_leak",
  branding: { assistantName: "Nexi" },
  adapters: { crm: "native", media: "native", email: "gmail_relay" },
  approval: {},
  timezone: "America/New_York",
  plan: "suite"
};

function toolUseResponse(name, input) {
  return new Response(JSON.stringify({
    content: [{ type: "tool_use", id: `tool_${name}`, name, input }],
    usage: { input_tokens: 18, output_tokens: 11 }
  }), { status: 200 });
}

function textResponse(text) {
  return new Response(JSON.stringify({
    content: [{ type: "text", text }],
    usage: { input_tokens: 18, output_tokens: 11 }
  }), { status: 200 });
}

test("workflow status uses requests and quotes when the person is not a saved client", async () => {
  const calls = [];
  const result = await runNexiToolLoop({
    tenant,
    system: "Use checked records.",
    messages: [{ role: "user", content: "Can you give me an update where we stand with? Laura Wicker" }],
    tools: [{
      name: "listRequests",
      description: "Read requests.",
      inputSchema: z.object({ q: z.string() }),
      inputJsonSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
      handler: async (_tenant, args) => {
        calls.push({ name: "listRequests", args });
        return { result: { requests: [{ id: "request_laura", clientName: "Laura Wicker", status: "converted_to_quote" }] }, sources: [{ rail: "native", ref: "request_laura", label: "Native request Laura Wicker" }] };
      }
    }, {
      name: "listQuotes",
      description: "Read quotes.",
      inputSchema: z.object({ q: z.string() }),
      inputJsonSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
      handler: async (_tenant, args) => {
        calls.push({ name: "listQuotes", args });
        return { result: { quotes: [{ id: "quote_laura", number: "Q-0016", clientName: "Laura Wicker", status: "approved", total: 595 }] }, sources: [{ rail: "native", ref: "quote_laura", label: "Native quote Laura Wicker" }] };
      }
    }, {
      name: "clientLookup",
      description: "Read clients.",
      inputSchema: z.object({ q: z.string() }),
      inputJsonSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
      handler: async () => { throw new Error("client lookup must not run for workflow status"); }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key", NEXI_ROUTING_MODE: "claude_first" },
    fetchFn: async (_url, init) => {
      const payload = JSON.parse(init.body);
      assert.equal(payload.tools.length, 0);
      assert.match(JSON.stringify(payload.messages), /quote_laura/);
      return textResponse("Laura Wicker's request was converted to quote Q-0016, which is approved for $595.");
    }
  });

  assert.deepEqual(calls, [
    { name: "listRequests", args: { q: "Laura Wicker" } },
    { name: "listQuotes", args: { q: "Laura Wicker" } }
  ]);
  assert.equal(result.toolRuns.length, 2);
  assert.match(result.answer, /Q-0016/);
});

test("Claude-first routing resolves a numbered duplicate from conversation context", async () => {
  const requests = [];
  const deleteCalls = [];
  const result = await runNexiToolLoop({
    tenant,
    system: "Use tools.",
    messages: [
      { role: "user", content: "Give me both Logan Sears records." },
      { role: "assistant", content: "1. Logan Sears — 6020 Forest Drive, Seneca, SC 29678\n2. logan sears — no address, email, or phone on file (bare duplicate entry)" },
      { role: "user", content: "Delete the duplicate number 2" }
    ],
    tools: [{
      name: "deleteClient",
      description: "Queue deletion of a NexTeam-created client after confirmation.",
      inputSchema: z.object({ clientQuery: z.string() }),
      inputJsonSchema: {
        type: "object",
        properties: { clientQuery: { type: "string" } },
        required: ["clientQuery"]
      },
      handler: async (_tenant, args) => {
        deleteCalls.push(args);
        return {
          result: { approval: { id: "approval_delete_logan_duplicate", state: "pending" } },
          sources: [{ rail: "native", ref: "client_logan_duplicate", label: "NexTeam-created client logan sears" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key", NEXI_ROUTING_MODE: "claude_first" },
    fetchFn: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return requests.length === 1
        ? toolUseResponse("deleteClient", { clientQuery: "logan sears" })
        : textResponse("I found the selected duplicate and prepared the deletion for your confirmation.");
    }
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].tools[0].name, "deleteClient");
  assert.match(JSON.stringify(requests[0].messages), /bare duplicate entry/);
  assert.deepEqual(deleteCalls, [{ clientQuery: "logan sears" }]);
  assert.doesNotMatch(JSON.stringify(deleteCalls), /duplicate number/i);
  assert.equal(result.toolRuns[0].name, "deleteClient");
  assert.match(result.answer, /prepared the deletion/i);
});

test("Claude-first routing executes a saved approval deterministically on a plain confirmation", async () => {
  const approvalCalls = [];
  const result = await runNexiToolLoop({
    tenant,
    system: "Use tools.",
    messages: [
      { role: "user", content: "Create client QA Confirmation." },
      { role: "assistant", content: "QA Confirmation\nDo the Client Details look correct?" },
      { role: "user", content: "Yes, that is correct." }
    ],
    pendingApproval: {
      approvalId: "appr_qa_confirmation",
      awaitingChanges: false,
      revisableClientCreate: true,
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
      revisableContentDraft: false
    },
    tools: [{
      name: "approvePendingApproval",
      description: "Execute a confirmed approval.",
      inputSchema: z.object({ approvalId: z.string() }),
      inputJsonSchema: { type: "object", properties: { approvalId: { type: "string" } }, required: ["approvalId"] },
      handler: async (_tenant, args) => {
        approvalCalls.push(args);
        return { result: { execution: { client: { name: "QA Confirmation" } } }, sources: [{ rail: "native", ref: "QA Confirmation", label: "Test approval" }] };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    // Claude-first is the production default. No routing-mode flag is needed.
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => {
      throw new Error("A confirmation must not be re-routed through Claude.");
    }
  });

  assert.deepEqual(approvalCalls, [{ approvalId: "appr_qa_confirmation" }]);
  assert.equal(result.toolRuns[0]?.name, "approvePendingApproval");
  assert.match(result.answer, /Approved and created QA Confirmation/);
});

test("Claude-first routing resolves a pronoun follow-up from the prior client turn", async () => {
  const lookups = [];
  const result = await runNexiToolLoop({
    tenant,
    system: "Use tools.",
    messages: [
      { role: "user", content: "Pull up Avery Redwood." },
      { role: "assistant", content: "I found Avery Redwood in the native client list." },
      { role: "user", content: "What is their email and phone?" }
    ],
    tools: [{
      name: "clientLookup",
      description: "Look up a client.",
      inputSchema: z.object({ q: z.string() }),
      inputJsonSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
      handler: async (_tenant, args) => {
        lookups.push(args);
        return {
          result: { clients: [{ name: "Avery Redwood", emails: ["avery@example.test"], phones: ["8645550101"] }], nativeCount: 1 },
          sources: [{ rail: "native", ref: "client_avery", label: "Native CRM client" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key", NEXI_ROUTING_MODE: "claude_first" },
    fetchFn: async () => {
      throw new Error("A sourced client-detail follow-up must not rely on a second model interpretation.");
    }
  });

  assert.deepEqual(lookups, [{ q: "Avery Redwood" }]);
  assert.match(result.answer, /avery@example\.test/);
  assert.match(result.answer, /864-555-0101/);
  assert.match(result.answer, /call now/i);
});

test("Claude-first routing lists previously matched clients when the operator says show me both", async () => {
  const lookups = [];
  const result = await runNexiToolLoop({
    tenant,
    system: "Use tools.",
    messages: [
      { role: "user", content: "What is Logan Sears' address?" },
      { role: "assistant", content: "I found 2 matching clients for Logan Sears. Give me the exact client name so I can pull the right address." },
      { role: "user", content: "Show me both" }
    ],
    tools: [{
      name: "clientLookup",
      description: "Look up a client.",
      inputSchema: z.object({ q: z.string() }),
      inputJsonSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
      handler: async (_tenant, args) => {
        lookups.push(args);
        return {
          result: { clients: [{ name: "Logan Sears" }, { name: "logan sears" }], nativeCount: 2 },
          sources: [{ rail: "native", ref: "client_logan", label: "Native CRM clients" }]
        };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchFn: async () => { throw new Error("A checked duplicate list must not rely on a second model interpretation."); }
  });

  assert.deepEqual(lookups, [{ q: "Logan Sears" }]);
  assert.match(result.answer, /Logan Sears/);
  assert.match(result.answer, /logan sears/);
});

test("Claude-first routing keeps an explicit client name when a phone request also says call them", async () => {
  const lookups = [];
  const result = await runNexiToolLoop({
    tenant,
    system: "Use tools.",
    messages: [{ role: "user", content: "What's Avery Redwood's number? I may need to call them." }],
    tools: [{
      name: "clientLookup",
      description: "Look up a client.",
      inputSchema: z.object({ q: z.string() }),
      inputJsonSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
      handler: async (_tenant, args) => {
        lookups.push(args);
        return { result: { clients: [{ name: "Avery Redwood", phones: ["8645550101"] }], nativeCount: 1 }, sources: [{ rail: "native", ref: "client_avery", label: "Native CRM client" }] };
      }
    }],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key", NEXI_ROUTING_MODE: "claude_first" },
    fetchFn: async () => { throw new Error("A sourced phone lookup must not call the model."); }
  });

  assert.deepEqual(lookups, [{ q: "Avery Redwood" }]);
  assert.match(result.answer, /864-555-0101/);
  assert.match(result.answer, /call now/i);
});

test("Claude-first routing retries a temporary Anthropic overload", async () => {
  let calls = 0;
  const result = await runNexiToolLoop({
    tenant,
    system: "Answer directly.",
    messages: [{ role: "user", content: "Hello" }],
    tools: [],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key", NEXI_ROUTING_MODE: "claude_first" },
    fetchFn: async () => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ error: { message: "Overloaded" } }), { status: 529 })
        : textResponse("Hello from Nexi.");
    }
  });

  assert.equal(calls, 2);
  assert.equal(result.answer, "Hello from Nexi.");
});

test("Claude-first routing retries a temporary Anthropic network failure", async () => {
  let calls = 0;
  const result = await runNexiToolLoop({
    tenant,
    system: "Answer directly.",
    messages: [{ role: "user", content: "Hello" }],
    tools: [],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: { ANTHROPIC_API_KEY: "test-key", NEXI_ROUTING_MODE: "claude_first" },
    fetchFn: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return textResponse("Hello after retry.");
    }
  });

  assert.equal(calls, 2);
  assert.equal(result.answer, "Hello after retry.");
});
