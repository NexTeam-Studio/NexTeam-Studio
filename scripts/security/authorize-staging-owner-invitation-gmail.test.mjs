import assert from "node:assert/strict";
import test from "node:test";
import { createAuthorizationUrl, preflightStagingOwnerInvitation, stagingOwnerInvitationConfiguration } from "./authorize-staging-owner-invitation-gmail.mjs";

test("staging owner invitation uses only the approved sender and gmail.send", () => {
  const config = stagingOwnerInvitationConfiguration({ GMAIL_OAUTH_CLIENT_ID: "client", GMAIL_OAUTH_CLIENT_SECRET: "secret", GMAIL_SEND_MAILBOX_EMAIL: "nexteamstudioai@gmail.com" });
  assert.equal(config.configured, true);
  const url = createAuthorizationUrl({ clientId: "client", state: "state", verifier: "verifier" });
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.send");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:53682/oauth2callback");
  assert.equal(url.searchParams.get("prompt"), "select_account consent");
});

test("staging owner invitation rejects a mismatched sender without legacy fallback", () => {
  const config = stagingOwnerInvitationConfiguration({ GMAIL_OAUTH_CLIENT_ID: "client", GMAIL_OAUTH_CLIENT_SECRET: "secret", GMAIL_SEND_MAILBOX_EMAIL: "wrong@example.test", NEXTEAM_RELAY_GMAIL_ACCOUNT: "legacy@example.test" });
  assert.equal(config.configured, false);
  assert.deepEqual(config.missing, ["approved staging sender identity"]);
});

test("staging owner invitation preflight returns only safe metadata", () => {
  const result = preflightStagingOwnerInvitation({ GMAIL_OAUTH_CLIENT_ID: "client-value", GMAIL_OAUTH_CLIENT_SECRET: "secret-value", GMAIL_SEND_MAILBOX_EMAIL: "nexteamstudioai@gmail.com", RAILWAY_TOKEN: "token-value" });
  assert.equal(result.ok, true);
  assert.equal(result.clientIdPresent, true);
  assert.equal(result.clientSecretPresent, true);
  assert.doesNotMatch(JSON.stringify(result), /client-value|secret-value|token-value/);
});
