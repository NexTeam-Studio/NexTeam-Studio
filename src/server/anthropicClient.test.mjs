import test from "node:test";
import assert from "node:assert/strict";
import { anthropicClientInternals, callAnthropicMessages } from "./anthropicClient.js";

test("buildSystemBlocks wraps string system prompts in a cacheable block", () => {
  const blocks = anthropicClientInternals.buildSystemBlocks("Use tools. Be concise.");
  assert.deepEqual(blocks, [
    {
      type: "text",
      text: "Use tools. Be concise.",
      cache_control: {
        type: "ephemeral",
      },
    },
  ]);
});

test("modelSupportsTemperature disables deprecated temperature for Sonnet 5", () => {
  assert.equal(anthropicClientInternals.modelSupportsTemperature("claude-sonnet-5"), false);
  assert.equal(anthropicClientInternals.modelSupportsTemperature("claude-sonnet-5-20260701"), false);
  assert.equal(anthropicClientInternals.modelSupportsTemperature("claude-haiku-4-5-20251001"), true);
});

test("callAnthropicMessages sends cacheable system blocks and logs usage", async () => {
  let capturedRequest = null;
  let capturedUsageEvent = null;

  const payload = {
    id: "msg_123",
    content: [{ type: "text", text: "Done." }],
    usage: {
      input_tokens: 1200,
      output_tokens: 120,
      cache_creation_input_tokens: 400,
      cache_read_input_tokens: 0,
    },
  };

  const response = await callAnthropicMessages({
    env: { ANTHROPIC_API_KEY: "test-key" },
    model: "claude-sonnet-5",
    system: "Cached system prompt",
    messages: [{ role: "user", content: "Hello" }],
    maxTokens: 200,
    routeActionName: "anthropicClientTest",
    taskType: "unit_test",
    tenantId: "aquatrace",
    metadata: { phase: "unit" },
    usageLogger: async (event) => {
      capturedUsageEvent = event;
    },
    fetchImpl: async (_url, options) => {
      capturedRequest = JSON.parse(options.body);
      return {
        ok: true,
        text: async () => JSON.stringify(payload),
      };
    },
  });

  assert.equal(response.id, "msg_123");
  assert.equal(capturedRequest.model, "claude-sonnet-5");
  assert.equal(capturedRequest.max_tokens, 200);
  assert.equal(capturedRequest.system[0].cache_control.type, "ephemeral");
  assert.equal(capturedUsageEvent.routeActionName, "anthropicClientTest");
  assert.equal(capturedUsageEvent.taskType, "unit_test");
  assert.equal(capturedUsageEvent.tenantId, "aquatrace");
  assert.equal(capturedUsageEvent.model, "claude-sonnet-5");
  assert.equal(capturedUsageEvent.usage.output_tokens, 120);
  assert.equal("temperature" in capturedRequest, false);
});
