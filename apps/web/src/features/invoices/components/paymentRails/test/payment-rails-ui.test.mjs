import test from "node:test";
import assert from "node:assert/strict";

import { paymentMethodsForProvider, reconcilePaymentDraftProvider } from "../PaymentRailsPanel.tsx";

test("Payment Rails owns provider-specific execution method choices", () => {
  assert.deepEqual(paymentMethodsForProvider("stripe"), ["card", "ach"]);
  assert.deepEqual(paymentMethodsForProvider("paypal"), ["paypal", "venmo"]);
  assert.deepEqual(paymentMethodsForProvider("manual"), ["cash", "check", "bank_transfer", "other"]);
});

test("changing provider reconciles the method and removes an unrelated saved card", () => {
  const cardDraft = {
    amount: 100,
    provider: "stripe",
    method: "card",
    note: "",
    savedCardId: "card_1",
    payerName: "",
    checkNumber: "",
    bankTransferReference: "",
    otherReference: "",
    failureMessage: "",
    status: "succeeded"
  };

  assert.deepEqual(reconcilePaymentDraftProvider(cardDraft, "paypal"), {
    ...cardDraft,
    provider: "paypal",
    method: "paypal",
    savedCardId: ""
  });
  assert.deepEqual(reconcilePaymentDraftProvider({ ...cardDraft, provider: "manual", method: "cash" }, "manual"), {
    ...cardDraft,
    provider: "manual",
    method: "cash",
    savedCardId: ""
  });
  assert.deepEqual(reconcilePaymentDraftProvider(cardDraft, "stripe"), cardDraft);
});
