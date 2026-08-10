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

test("staging owner invitation identity is non-secret, quarantined, and fails closed for reauthorization", () => {
  const status = stagingOwnerInvitationGmailProviderStatus({
    GMAIL_OAUTH_CLIENT_ID: "non-secret-client-identifier",
    GMAIL_SEND_MAILBOX_REFRESH_TOKEN: "configured",
    NEXTEAM_EXTERNAL_INTEGRATIONS_QUARANTINED: "true"
  });

  assert.deepEqual(status, {
    provider: "gmail",
    senderIdentity: "nexteamstudioai@gmail.com",
    environment: "staging",
    purpose: "owner invitation",
    requiredScope: "gmail.send",
    secretDestinationName: "GMAIL_SEND_MAILBOX_REFRESH_TOKEN",
    oauthClientStatus: "PRESENT_UNIDENTIFIED",
    quarantineState: "QUARANTINED",
    secretHealth: "PRESENT",
    safeToReauthorize: false,
    reauthorizationReason: "SAFE_TO_REAUTHORIZE=false: the OAuth client/project is not proven by an authoritative non-secret record."
  });
  assert.doesNotMatch(JSON.stringify(status), /configured|non-secret-client-identifier/);
});
