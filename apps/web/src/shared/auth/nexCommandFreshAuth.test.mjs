import assert from "node:assert/strict";
import test from "node:test";
import { requiresNexCommandReauthentication } from "./nexCommandFreshAuth.ts";

test("a persisted Firebase user without fresh NexCommand state is sent to NexCommand sign-in", () => {
  assert.equal(requiresNexCommandReauthentication({
    pathname: "/nexcommand",
    hasFreshAuthentication: false,
    hasSession: false
  }), true);
});

test("a fresh NexCommand sign-in or short-lived session may continue to session establishment", () => {
  assert.equal(requiresNexCommandReauthentication({ pathname: "/nexcommand", hasFreshAuthentication: true, hasSession: false }), false);
  assert.equal(requiresNexCommandReauthentication({ pathname: "/nexcommand", hasFreshAuthentication: false, hasSession: true }), false);
  assert.equal(requiresNexCommandReauthentication({ pathname: "/nexops", hasFreshAuthentication: false, hasSession: false }), false);
});
