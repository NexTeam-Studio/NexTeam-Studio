import test from "node:test";
import assert from "node:assert/strict";

import { paymentMethodsForProvider } from "../PaymentRailsPanel.tsx";

test("Payment Rails owns provider-specific execution method choices", () => {
  assert.deepEqual(paymentMethodsForProvider("stripe"), ["card", "ach"]);
  assert.deepEqual(paymentMethodsForProvider("paypal"), ["paypal", "venmo"]);
  assert.deepEqual(paymentMethodsForProvider("manual"), ["cash", "check", "bank_transfer", "other"]);
});
