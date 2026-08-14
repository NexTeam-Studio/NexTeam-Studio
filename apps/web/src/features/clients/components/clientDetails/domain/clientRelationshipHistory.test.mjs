import assert from "node:assert/strict";
import test from "node:test";
import { buildClientRelationshipHistory, closeoutDeliveryHistoryFromJobEvents } from "./clientRelationshipHistory.ts";

const tenantId = "tenant-a";

function baseInput(overrides = {}) {
  return {
    requests: [], quotes: [], jobs: [], invoices: [], payments: [], portalActivity: [], reviewSequences: [], financialVisible: true,
    ...overrides
  };
}

test("buildClientRelationshipHistory produces one newest-first chronology from existing relationships", () => {
  const history = buildClientRelationshipHistory(baseInput({
    requests: [{ id: "request-1", status: "new", subject: "Pool leak", createdAt: "2026-08-01T09:00:00.000Z" }],
    quotes: [{ id: "quote-1", tenantId, clientId: "client-a", title: "Repair", status: "sent", totals: { subtotal: 1, tax: 0, total: 1 }, updatedAt: "2026-08-04T09:00:00.000Z" }],
    jobs: [{ id: "job-1", tenantId, clientId: "client-a", title: "Leak visit", status: "Today", updatedAt: "2026-08-03T09:00:00.000Z" }],
    portalActivity: [{ id: "portal-1", occurredAt: "2026-08-05T09:00:00.000Z", title: "Quote viewed", detail: "Client portal", objectType: "quote", objectId: "quote-1" }]
  }));
  assert.deepEqual(history.map((entry) => entry.kind), ["portal", "quote", "job", "request"]);
  assert.equal(history[0].objectId, "quote-1");
});

test("buildClientRelationshipHistory hides financial records when financial visibility is denied", () => {
  const history = buildClientRelationshipHistory(baseInput({
    financialVisible: false,
    invoices: [{ id: "invoice-1", tenantId, clientId: "client-a", title: "Invoice", status: "open", totals: { subtotal: 1, tax: 0, total: 1 }, updatedAt: "2026-08-05T09:00:00.000Z" }],
    payments: [{ id: "payment-1", clientId: "client-a", status: "succeeded", amount: 1, createdAt: "2026-08-06T09:00:00.000Z" }],
    requests: [{ id: "request-1", status: "new", subject: "Visible request", createdAt: "2026-08-01T09:00:00.000Z" }]
  }));
  assert.deepEqual(history.map((entry) => entry.kind), ["request"]);
});

test("buildClientRelationshipHistory keeps review and portal events truthful when no messages exist", () => {
  const history = buildClientRelationshipHistory(baseInput({
    financialVisible: false,
    portalActivity: [{ id: "portal-1", occurredAt: "2026-08-03T09:00:00.000Z", title: "Statement viewed", detail: "Portal", objectType: "statement" }],
    reviewSequences: [{ id: "review-1", tenantId, clientId: "client-a", jobId: "job-a", source: "automatic", providerState: "manual_only", status: "active", nextSendAt: "2026-08-04T09:00:00.000Z", steps: [], createdAt: "2026-08-01T09:00:00.000Z" }]
  }));
  assert.deepEqual(history.map((entry) => entry.kind), ["review", "portal"]);
  assert.equal(history.find((entry) => entry.kind === "review")?.title, "Review follow-up");
});

test("buildClientRelationshipHistory exposes an authoritative closeout delivery against its originating job", () => {
  const history = buildClientRelationshipHistory(baseInput({
    financialVisible: false,
    closeoutDeliveries: [{ id: "delivery-1", jobId: "job-1", jobTitle: "JOB-0001 · Leak visit", occurredAt: "2026-08-05T09:00:00.000Z", recipient: "safe@example.test", status: "email sent" }]
  }));
  assert.deepEqual(history.map((entry) => entry.kind), ["communication"]);
  assert.equal(history[0].objectId, "job-1");
  assert.equal(history[0].status, "email sent to safe@example.test");
});

test("closeoutDeliveryHistoryFromJobEvents reads the lifecycle recipient payload", () => {
  const deliveries = closeoutDeliveryHistoryFromJobEvents({
    jobId: "job-1",
    jobTitle: "JOB-0001 · Leak visit",
    events: [{ id: "event-1", type: "closeout.package_delivery_sent", createdAt: "2026-08-05T09:00:00.000Z", payload: { recipient: "safe@example.test" } }]
  });
  assert.deepEqual(deliveries, [{ id: "event-1", jobId: "job-1", jobTitle: "JOB-0001 · Leak visit", occurredAt: "2026-08-05T09:00:00.000Z", recipient: "safe@example.test", status: "email sent" }]);
});
