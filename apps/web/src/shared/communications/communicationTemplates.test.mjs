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

test("SMS remains visibly unavailable until provider, phone, and consent are all ready", () => {
  assert.equal(resolveCommunicationDeliveryAvailability({
    channel: "sms",
    phone: "8645550100",
    templateEnabled: true,
    smsProviderConfigured: false,
    smsConsent: true
  }).reason, "SMS delivery is not available for this tenant yet.");

  assert.equal(resolveCommunicationDeliveryAvailability({
    channel: "sms",
    phone: "8645550100",
    templateEnabled: true,
    smsProviderConfigured: true,
    smsConsent: false
  }).reason, "This client has not consented to SMS messages.");

  assert.deepEqual(resolveCommunicationDeliveryAvailability({
    channel: "sms",
    phone: "8645550100",
    templateEnabled: true,
    smsProviderConfigured: true,
    smsConsent: true
  }), {
    channel: "sms",
    available: true,
    recipient: "8645550100"
  });
});
