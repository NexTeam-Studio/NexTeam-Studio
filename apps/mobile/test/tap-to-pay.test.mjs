import test from "node:test";
import assert from "node:assert/strict";
import {
  describeTapToPayFailure,
  tapToPayDeviceLabel,
  tapToPayDevicePlatform
} from "../dist/native/tapToPay.js";

test("Tap to Pay decline mapping stays staff-readable instead of surfacing raw Stripe jargon", () => {
  const message = describeTapToPayFailure({
    code: "PAYMENT_ERROR",
    apiError: {
      code: "card_declined",
      declineCode: "insufficient_funds",
      message: "Your card has insufficient funds."
    }
  }, { stage: "collect" });

  assert.equal(message.title, "Card declined");
  assert.equal(message.tone, "warning");
  assert.match(message.detail, /insufficient funds/i);
});

test("Tap to Pay disconnect mapping calls out the reader drop explicitly", () => {
  const message = describeTapToPayFailure({}, { disconnectReason: "bluetoothSignalLost" });

  assert.equal(message.title, "Reader disconnected");
  assert.equal(message.tone, "error");
  assert.match(message.detail, /bluetoothSignalLost/i);
});

test("Tap to Pay finalize mapping explains the ledger handoff seam when Stripe succeeds first", () => {
  const message = describeTapToPayFailure(new Error("NexOps ledger write timed out."), { stage: "finalize" });

  assert.equal(message.title, "Payment needs review");
  assert.equal(message.tone, "error");
  assert.match(message.detail, /ledger record/i);
});

test("Tap to Pay helper labels keep device metadata stable for the shared payment object", () => {
  assert.equal(tapToPayDevicePlatform("ios", "18.1"), "ios/18.1");
  assert.equal(tapToPayDeviceLabel("Chris's field phone", "Tap to Pay on iPhone"), "Chris's field phone");
  assert.equal(tapToPayDeviceLabel("", "Tap to Pay on Android"), "Tap to Pay on Android");
});
