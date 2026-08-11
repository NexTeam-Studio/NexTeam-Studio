#!/usr/bin/env node
import { assertIdentityPurpose } from "./reliability/globalControl.mjs";
import { runStagingAuthRegression } from "./reliability/stagingReliability.mjs";

const baseUrl = process.env.NEXTEAM_STAGING_URL?.trim();
const expectedSha = process.env.NEXTEAM_EXPECTED_LIVE_SHA?.trim();
if (!baseUrl || !expectedSha) {
  console.error("NEXTEAM_STAGING_URL and NEXTEAM_EXPECTED_LIVE_SHA are required; this read-only harness never selects production.");
  process.exitCode = 64;
} else {
  try {
    const parsed = new URL(baseUrl);
    if (!/staging/i.test(parsed.hostname)) throw new Error("Only a staging hostname is permitted.");
    assertIdentityPurpose({ identity: "staging-regression-harness", purpose: "read-only browser and mobile auth regression", environment: "staging" });
    const result = await runStagingAuthRegression({ baseUrl, expectedSha });
    console.log(JSON.stringify(result));
    if (!result.shaMatches || !result.browser.authenticatedRouteGuard || !result.mobile.authenticatedRouteGuard) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ environment: "staging", readOnly: true, error: error instanceof Error ? error.message : "staging auth harness failed" }));
    process.exitCode = 1;
  }
}
