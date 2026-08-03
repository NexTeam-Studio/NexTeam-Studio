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
