import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the staging internal Owner repair requires explicit input and cannot create identities or send password actions", async () => {
  const source = await readFile(new URL("./run-staging-internal-nexcommand-owner-onboarding.mjs", import.meta.url), "utf8");
  for (const required of ["--environment", "--authorized-email", "--first-name", "--last-name", "--role", "--confirm-job", "NEXTEAM-DAY1-LINK-EXISTING-OWNER-20260810"]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const forbidden of ["createUser(", "generatePasswordResetLink(", "sendEmail(", "GmailSendAdapter"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not return the old onboarding behavior`);
  }
});
