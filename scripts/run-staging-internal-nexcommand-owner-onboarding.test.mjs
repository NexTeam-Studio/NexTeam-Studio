import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the staging internal Owner repair and verifier enforce the internal Owner compatibility contract", async () => {
  const source = await readFile(new URL("./run-staging-internal-nexcommand-owner-onboarding.mjs", import.meta.url), "utf8");
  for (const required of ["--environment", "--authorized-email", "--first-name", "--last-name", "--role", "--confirm-job", "NEXTEAM-DAY1-LINK-EXISTING-OWNER-20260810"]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const forbidden of ["createUser(", "generatePasswordResetLink(", "sendEmail(", "GmailSendAdapter"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not return the old onboarding behavior`);
  }

  const verifier = await readFile(new URL("./verify-staging-internal-nexcommand-owner-onboarding.mjs", import.meta.url), "utf8");
  for (const required of ["platformProfileAuthUidMatches", "activeInternalProfileCount === 1", "result.platformRole === \"Owner\"", "result.accountClass === \"internal\"", "result.platformStatus === \"ACTIVE\"", "result.tenantMembershipAbsent", "result.tenantClaimsAbsent", "Internal Owner profile compatibility failed"]) {
    assert.match(verifier, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
