import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { answerNexiOperatorQuestion } from "../src/server/nexiOperatorQueryService.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = value;
  }
}

async function run() {
  loadLocalEnv();
  assert.ok(
    normalizeText(process.env.COMPANYCAM_API_TOKEN),
    "COMPANYCAM_API_TOKEN is required for the Nexi CompanyCam roundtrip test."
  );

  const result = await answerNexiOperatorQuestion({
    tenantId: "aquatrace",
    question: "What are the total pool gallons in the report for Camp Mikell in Toccoa GA?",
  });

  assert.equal(result.ok, true, "Nexi operator roundtrip should succeed.");
  assert.equal(result.handled, true, "Nexi operator roundtrip should be handled locally.");
  assert.match(result.response, /Camp Mikell/i, "response should identify the Camp Mikell project");
  assert.match(result.response, /101,000/i, "response should include the real gallons value");
  assert.match(result.response, /237 Camp Mikell Court/i, "response should include the real address");
  assert.equal(
    normalizeText(result.payload?.route?.kind),
    "companycam_job_data",
    "Nexi should classify the request into the CompanyCam job-data lane"
  );
  assert.equal(
    normalizeText(result.payload?.route?.delivery),
    "product-local",
    "The proven Nexi CompanyCam roundtrip should stay on the product-local lane"
  );

  const denied = await answerNexiOperatorQuestion({
    tenantId: "other-client",
    question: "What are the total pool gallons in the report for Camp Mikell in Toccoa GA?",
  });

  assert.equal(denied.ok, false, "A non-Aquatrace tenant should not be granted CompanyCam access.");
  assert.equal(denied.handled, true, "The denied request should still be handled deterministically.");
  assert.match(
    denied.response,
    /not approved|blocked/i,
    "The denied response should explain that CompanyCam tenant scope is blocked."
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        response: result.response,
        route: result.payload?.route || null,
        route_summary: result.payload?.route_summary || "",
        denied_tenant: {
          ok: denied.ok,
          response: denied.response,
          route: denied.payload?.route || null,
        },
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
