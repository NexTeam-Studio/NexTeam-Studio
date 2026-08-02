import test from "node:test";
import assert from "node:assert/strict";

import { deriveInvoiceDominantAction } from "../domain/dominantAction.ts";

test("a failed delivered invoice asks the office to retry delivery before collecting", () => {
  const action = deriveInvoiceDominantAction({
    lifecycle: "open",
    deliveryStatus: "failed",
    balanceStatus: "awaiting_payment",
    paymentScheduleActive: false
  });

  assert.equal(action.label, "Retry send");
  assert.equal(action.tone, "danger");
  assert.equal(action.nextCommandId, "invoice.send");
});

test("an open invoice with a successful delivery still prioritizes collection", () => {
  const action = deriveInvoiceDominantAction({
    lifecycle: "open",
    deliveryStatus: "sent",
    balanceStatus: "awaiting_payment",
    paymentScheduleActive: true
  });

  assert.equal(action.label, "Collect scheduled payment");
  assert.equal(action.nextCommandId, "payment.collect");
});
