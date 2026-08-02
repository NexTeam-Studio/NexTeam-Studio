import test from "node:test";
import assert from "node:assert/strict";
import { createCommsRailFromEnv } from "./gmailRegistry.ts";

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
