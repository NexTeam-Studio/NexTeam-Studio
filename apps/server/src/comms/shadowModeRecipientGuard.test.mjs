import assert from "node:assert/strict";
import test from "node:test";
import { RailError } from "@nexteam/core";
import { ShadowModeEmailSendAdapter, assertShadowModeSmsRecipient, shadowModeRecipientPolicyFromEnv } from "./shadowModeRecipientGuard.ts";

const approvedEmail = "stage-recipient@example.test";
const blockedEmail = "blocked-recipient@example.test";

function policy() {
  return shadowModeRecipientPolicyFromEnv({
    NEXTEAM_SHADOW_MODE: "true",
    NEXTEAM_SHADOW_EMAIL_RECIPIENTS: approvedEmail,
    NEXTEAM_SHADOW_SMS_RECIPIENTS: "+15555550100"
  });
}

test("Shadow Mode permits only the configured email recipient without changing the provider contract", async () => {
  const sent = [];
  const adapter = new ShadowModeEmailSendAdapter({ mailbox: "TRANSACTIONAL", async sendEmail(message) { sent.push(message); return { provider: "test", id: "receipt", acceptedAt: "2026-08-20T00:00:00.000Z" }; } }, policy());
  await adapter.sendEmail({ tenantId: "aquatrace", to: [approvedEmail], subject: "Safe", bodyText: "Safe" });
  assert.equal(adapter.mailbox, "TRANSACTIONAL");
  assert.equal(sent.length, 1);
});

test("Shadow Mode blocks To, CC, and BCC recipients outside the allowlist without leaking them", async () => {
  const adapter = new ShadowModeEmailSendAdapter({ mailbox: "TRANSACTIONAL", async sendEmail() { throw new Error("provider must not be called"); } }, policy());
  for (const partial of [{ to: [blockedEmail] }, { to: [approvedEmail], cc: [blockedEmail] }, { to: [approvedEmail], bcc: [blockedEmail] }]) {
    await assert.rejects(
      adapter.sendEmail({ tenantId: "aquatrace", subject: "Blocked", bodyText: "Blocked", ...partial }),
      (error) => error instanceof RailError && error.status === 403 && !String(error.message).includes(blockedEmail)
    );
  }
});

test("Shadow Mode blocks SMS recipients outside the allowlist", () => {
  assert.doesNotThrow(() => assertShadowModeSmsRecipient(policy(), { tenantId: "aquatrace", to: "+1 (555) 555-0100", body: "Safe" }));
  assert.throws(
    () => assertShadowModeSmsRecipient(policy(), { tenantId: "aquatrace", to: "+15555550101", body: "Blocked" }),
    (error) => error instanceof RailError && error.status === 403 && !String(error.message).includes("0101")
  );
});

test("Shadow Mode is off only when explicitly disabled", () => {
  const disabled = shadowModeRecipientPolicyFromEnv({});
  assert.equal(disabled.enabled, false);
  assert.doesNotThrow(() => assertShadowModeSmsRecipient(disabled, { tenantId: "aquatrace", to: "+15555550101", body: "Normal runtime" }));
});
