import test from "node:test";
import assert from "node:assert/strict";

import {
  requestDominantAction,
  requestNeedsReview,
  requestReadyToConvert,
  summarizeRequestQueue
} from "../src/features/requests/components/requestCore/NexOpsRequestsPage.tsx";

function makeRequest(overrides = {}) {
  return {
    id: "req_1",
    tenantId: "tenant_aquatrace",
    source: "website_form",
    status: "new",
    subject: "Leak inspection",
    clientName: "Aquatrace Test",
    consent: { email: true, sms: false },
    intake: { narrative: "", fieldValues: [], fieldIndex: {} },
    match: { matchedBy: "none", reviewRequired: false },
    createdAt: "2026-07-14T10:00:00.000Z",
    updatedAt: "2026-07-14T10:00:00.000Z",
    ...overrides
  };
}

test("request helpers treat an unreviewed intake as review-first work", () => {
  const request = makeRequest({
    match: { matchedBy: "exact_phone", matchedValue: "8645551234", reviewRequired: true }
  });

  assert.equal(requestNeedsReview(request), true);
  assert.equal(requestReadyToConvert(request), false);

  const action = requestDominantAction(request);
  assert.equal(action.stage, "Review Required");
  assert.equal(action.dominantAction, "mark-reviewed");
  assert.equal(action.dominantLabel, "Mark Reviewed");
});

test("reviewed requests move onto the conversion rail", () => {
  const request = makeRequest({ reviewedAt: "2026-07-14T10:15:00.000Z" });
  const action = requestDominantAction(request);

  assert.equal(requestNeedsReview(request), false);
  assert.equal(requestReadyToConvert(request), true);
  assert.equal(action.stage, "Ready to Convert");
  assert.equal(action.dominantAction, "convert-to-quote");
  assert.equal(action.secondaryAction, "convert-to-job");
});

test("converted requests stay read-only as intake source records", () => {
  const quoteRequest = makeRequest({
    status: "converted_to_quote",
    convertedQuoteId: "quote_44",
    reviewedAt: "2026-07-14T10:15:00.000Z"
  });
  const jobRequest = makeRequest({
    id: "req_2",
    status: "converted_to_job",
    convertedJobId: "job_12",
    reviewedAt: "2026-07-14T10:15:00.000Z"
  });

  assert.equal(requestDominantAction(quoteRequest).dominantAction, "none");
  assert.equal(requestDominantAction(jobRequest).dominantAction, "none");
  assert.equal(requestDominantAction(quoteRequest).stage, "Quote Created");
  assert.equal(requestDominantAction(jobRequest).stage, "Job Created");
});

test("request queue summary breaks out review, conversion, and archive counts", () => {
  const summary = summarizeRequestQueue([
    makeRequest(),
    makeRequest({ id: "req_2", reviewedAt: "2026-07-14T10:15:00.000Z" }),
    makeRequest({ id: "req_3", status: "converted_to_quote", reviewedAt: "2026-07-14T10:16:00.000Z" }),
    makeRequest({ id: "req_4", status: "archived" })
  ]);

  assert.deepEqual(summary, {
    unreviewed: 1,
    readyToConvert: 1,
    converted: 1,
    archived: 1
  });
});
