import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

test("named payment interface areas use Title Case", () => {
  const source = readFileSync(new URL("../PaymentRailsPanel.tsx", import.meta.url), "utf8");

  for (const label of [
    "Collect and Recover",
    "Collect Payment",
    "Saved Card",
    "Payer Name",
    "Check Number",
    "Open Stripe Checkout",
    "Recovery Path",
    "Payment History",
    "Refund Amount",
    "Refund Selected Payment",
    "Void Invoice",
    "Mark Bad Debt"
  ]) {
    assert.match(source, new RegExp(label));
  }
});
