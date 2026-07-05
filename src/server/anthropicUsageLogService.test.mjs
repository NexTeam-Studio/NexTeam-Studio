import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnthropicUsageLogRecord,
  estimateAnthropicCostUsd,
  normalizeAnthropicUsage,
} from "./anthropicUsageLogService.js";

test("normalizeAnthropicUsage keeps cache token fields and totals", () => {
  const usage = normalizeAnthropicUsage({
    input_tokens: 1000,
    output_tokens: 250,
    cache_creation_input_tokens: 500,
    cache_read_input_tokens: 800,
  });

  assert.deepEqual(usage, {
    input_tokens: 1000,
    output_tokens: 250,
    cache_creation_input_tokens: 500,
    cache_read_input_tokens: 800,
    total_input_tokens: 2300,
    total_tokens: 2550,
  });
});

test("estimateAnthropicCostUsd uses Sonnet 5 pricing", () => {
  const estimate = estimateAnthropicCostUsd({
    model: "claude-sonnet-5",
    usage: {
      input_tokens: 1_000_000,
      output_tokens: 500_000,
      cache_creation_input_tokens: 100_000,
      cache_read_input_tokens: 200_000,
    },
  });

  assert.equal(estimate, 7.29);
});

test("buildAnthropicUsageLogRecord includes route, task, model, and cost estimate", () => {
  const record = buildAnthropicUsageLogRecord({
    tenantId: "aquatrace",
    routeActionName: "nexiV1ReasoningTurn",
    taskType: "reasoning_tool_loop",
    model: "claude-sonnet-5",
    usage: {
      input_tokens: 2000,
      output_tokens: 300,
      cache_creation_input_tokens: 500,
      cache_read_input_tokens: 1500,
    },
    metadata: { phase: "first_turn" },
  });

  assert.equal(record.provider, "anthropic");
  assert.equal(record.tenantId, "aquatrace");
  assert.equal(record.routeActionName, "nexiV1ReasoningTurn");
  assert.equal(record.taskType, "reasoning_tool_loop");
  assert.equal(record.model, "claude-sonnet-5");
  assert.equal(record.metadata.phase, "first_turn");
  assert.equal(record.estimatedCostUsd, 0.00855);
});
