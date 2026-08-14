import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommunicationSendPreview,
  resolveCommunicationDeliveryAvailability
} from "./communicationTemplates.ts";

test("email preview is available only when the message type and client email are available", () => {
  const availability = resolveCommunicationDeliveryAvailability({
    channel: "email",
    email: "client@example.com",
    templateEnabled: true
  });

  assert.deepEqual(availability, {
    channel: "email",
    available: true,
    recipient: "client@example.com"
  });
  assert.deepEqual(buildCommunicationSendPreview({
    channel: "email",
    subject: "Your quote",
    bodyText: "Hi there",
    availability
  }), {
    channel: "email",
    available: true,
    recipient: "client@example.com",
    subject: "Your quote",
    bodyText: "Hi there",
    unavailableReason: undefined
  });
});

test("SMS remains visibly unavailable in this phase even when future-rail prerequisites are present", () => {
  assert.equal(resolveCommunicationDeliveryAvailability({
    channel: "sms",
    phone: "8645550100",
    templateEnabled: true,
    smsProviderConfigured: false,
    smsConsent: true
  }).reason, "SMS delivery is not available for this tenant yet.");

  assert.deepEqual(resolveCommunicationDeliveryAvailability({
    channel: "sms",
    phone: "8645550100",
    templateEnabled: true,
    smsProviderConfigured: true,
    smsConsent: true
  }), {
    channel: "sms",
    available: false,
    recipient: "8645550100",
    reason: "SMS delivery is not available for this tenant yet."
  });
});

test("a preview cannot be treated as available when its channel and availability contract differ", () => {
  const emailAvailability = resolveCommunicationDeliveryAvailability({
    channel: "email",
    email: "client@example.com",
    templateEnabled: true
  });

  assert.deepEqual(buildCommunicationSendPreview({
    channel: "sms",
    bodyText: "Hi there",
    availability: emailAvailability
  }), {
    channel: "sms",
    available: false,
    unavailableReason: "The selected delivery channel does not match this preview.",
    recipient: "client@example.com",
    subject: "",
    bodyText: "Hi there"
  });
});
