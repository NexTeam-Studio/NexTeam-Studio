import test from "node:test";
import assert from "node:assert/strict";

import { buildNexopsHomeState } from "../src/nexopsHomeState.ts";

function buildState(overrides = {}) {
  return buildNexopsHomeState({
    clients: [
      { statusLabel: "Active", textReady: true },
      { statusLabel: "Lead", textReady: false }
    ],
    requests: [],
    quotes: [],
    jobs: [],
    invoices: [],
    payments: [],
    receiptReviews: [],
    ...overrides
  });
}

test("home now card prioritizes office-action jobs ahead of other queues", () => {
  const state = buildState({
    requests: [{ status: "new" }],
    jobs: [{ status: "Requires Invoicing" }]
  });

  assert.equal(state.now.title, "Office action waiting");
  assert.equal(state.now.target, "jobs");
  assert.equal(state.now.dominantLabel, "Open jobs");
});

test("home surfaces receipt review when money is in but customer delivery is paused", () => {
  const state = buildState({
    receiptReviews: [{ status: "draft" }]
  });

  assert.equal(state.now.title, "Receipt review waiting");
  assert.equal(state.now.target, "payments");
  assert.equal(state.metrics.find((metric) => metric.title === "Receipt review")?.value, "1");
});

test("home needs-attention card prioritizes failed payments before quote drift", () => {
  const state = buildState({
    quotes: [{ status: "draft" }],
    payments: [{ status: "failed" }]
  });

  assert.equal(state.needsAttention.title, "Payment recovery");
  assert.equal(state.needsAttention.target, "payments");
  assert.equal(state.operations.find((item) => item.label === "Open billing rail")?.target, "payments");
});
