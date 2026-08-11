import assert from "node:assert/strict";
import test from "node:test";
import { createAuthorizationUrl, preflightStagingOwnerInvitation, stagingOwnerInvitationConfiguration, verifyStagingOwnerInvitationMailbox } from "./authorize-staging-owner-invitation-gmail.mjs";

test("staging owner invitation uses only the approved sender and gmail.send", () => {
  const config = stagingOwnerInvitationConfiguration({ GMAIL_SEND_MAILBOX_CLIENT_ID: "client", GMAIL_SEND_MAILBOX_CLIENT_SECRET: "secret", GMAIL_SEND_MAILBOX_EMAIL: "nexteamstudioai@gmail.com" });
  assert.equal(config.configured, true);
  const url = createAuthorizationUrl({ clientId: "client", state: "state", verifier: "verifier" });
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.send");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:53682/oauth2callback");
  assert.equal(url.searchParams.get("prompt"), "select_account consent");
  assert.equal(url.searchParams.get("login_hint"), "nexteamstudioai@gmail.com");
});

test("staging owner invitation rejects a mismatched sender without legacy fallback", () => {
  const config = stagingOwnerInvitationConfiguration({ GMAIL_SEND_MAILBOX_CLIENT_ID: "client", GMAIL_SEND_MAILBOX_CLIENT_SECRET: "secret", GMAIL_SEND_MAILBOX_EMAIL: "wrong@example.test", NEXTEAM_RELAY_GMAIL_ACCOUNT: "legacy@example.test" });
  assert.equal(config.configured, false);
  assert.deepEqual(config.missing, ["approved staging sender identity"]);
});

test("staging owner invitation preflight returns only safe metadata", () => {
  const result = preflightStagingOwnerInvitation({ GMAIL_SEND_MAILBOX_CLIENT_ID: "client-value", GMAIL_SEND_MAILBOX_CLIENT_SECRET: "secret-value", GMAIL_SEND_MAILBOX_EMAIL: "nexteamstudioai@gmail.com", RAILWAY_TOKEN: "token-value" });
  assert.equal(result.ok, true);
  assert.equal(result.clientIdPresent, true);
  assert.equal(result.clientSecretPresent, true);
  assert.equal(result.refreshCredentialPresent, false);
  assert.doesNotMatch(JSON.stringify(result), /client-value|secret-value|token-value/);
});

test("staging mailbox verification refreshes the dedicated sender credential without emitting credentials", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.includes("token")) return { ok: true, json: async () => ({ access_token: "access-value" }) };
    return { ok: true, json: async () => ({ access_token: "access-value" }) };
  };
  const result = await verifyStagingOwnerInvitationMailbox({
    env: {
      GMAIL_SEND_MAILBOX_CLIENT_ID: "client-value",
      GMAIL_SEND_MAILBOX_CLIENT_SECRET: "secret-value",
      GMAIL_SEND_MAILBOX_REFRESH_TOKEN: "refresh-value",
      GMAIL_SEND_MAILBOX_EMAIL: "nexteamstudioai@gmail.com",
    },
    fetchImpl,
  });
  assert.deepEqual(result, { ok: true, sender: "nexteamstudioai@gmail.com", scope: "https://www.googleapis.com/auth/gmail.send", refreshCredentialPresent: true });
  assert.equal(requests.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /client-value|secret-value|refresh-value|access-value/);
});
