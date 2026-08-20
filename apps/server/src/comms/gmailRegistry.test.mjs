import test from "node:test";
import assert from "node:assert/strict";
import { createCommsRailFromEnv, stagingOwnerInvitationGmailProviderStatus } from "./gmailRegistry.ts";

test("Nexi sender accepts existing Google OAuth environment names", () => {
  const rail = createCommsRailFromEnv({
    TENANT_ID: "tenant_1",
    GMAIL_SEND_FROM: "nexi@example.test",
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_REFRESH_TOKEN: "refresh-token"
  });
  assert.ok(rail.sendAdapter);
  assert.equal(rail.operatorEmail, undefined);
});

test("transactional Resend configuration is selected without changing Gmail read mailboxes", () => {
  const rail = createCommsRailFromEnv({
    TENANT_ID: "tenant_1",
    RESEND_API_KEY: "configured-in-deployment-secret-manager",
    RESEND_FROM_EMAIL: "transactions@example.test",
    RESEND_FROM_NAME: "Tenant Operations",
    GMAIL_SEND_FROM: "nexi@example.test",
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_REFRESH_TOKEN: "refresh-token"
  });
  assert.ok(rail.sendAdapter);
  assert.equal(rail.sendAdapter.constructor.name, "ResendTransactionalAdapter");
  assert.equal(rail.sendAdapter.mailbox, "TRANSACTIONAL");
  assert.equal("searchEmail" in rail.sendAdapter, false);
});

test("staging owner invitation identity is non-secret, locked, and reports verified metadata", () => {
  const status = stagingOwnerInvitationGmailProviderStatus({
    GMAIL_OAUTH_CLIENT_ID: "non-secret-client-identifier",
    GMAIL_SEND_MAILBOX_REFRESH_TOKEN: "configured",
    NEXTEAM_EXTERNAL_INTEGRATIONS_QUARANTINED: "false",
    NEXTEAM_STAGING_GMAIL_CONNECTION_HEALTH: "HEALTHY",
    NEXTEAM_STAGING_GMAIL_LAST_VERIFIED_AT: "2026-08-10T20:00:00.000Z"
  });

  assert.deepEqual(status, {
    provider: "gmail",
    senderIdentity: "nexteamstudioai@gmail.com",
    environment: "staging",
    purpose: "owner invitation",
    oauthProjectIdentity: "NexTeam Gmail Sender",
    oauthClientIdentity: "NexTeam Gmail Sender Local",
    requiredScope: "gmail.send",
    secretDestinationName: "GMAIL_SEND_MAILBOX_REFRESH_TOKEN",
    oauthClientStatus: "PRESENT_VERIFIED",
    quarantineState: "NOT_QUARANTINED",
    secretHealth: "PRESENT",
    connectionHealth: "HEALTHY",
    lastVerifiedAt: "2026-08-10T20:00:00.000Z",
    safeToReauthorize: false,
    reauthorizationReason: "STAGING_SENDER_LOCKED: explicit sender-migration authorization is required."
  });
  assert.doesNotMatch(JSON.stringify(status), /configured|non-secret-client-identifier/);
});
