import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { createOperatorProofSession, fetchJson } from "./support/liveProofHelpers.mjs";

const baseUrl = (process.env.NEXTEAM_BASE_URL || "https://nexteam-studio-staging.up.railway.app").replace(/\/$/, "");
const expectedSha = process.env.EXPECTED_GIT_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const receiptPath = process.env.M13_PLATFORM_RECEIPT || "receipts/m13/m13-platform-live-receipt.json";
const tenantId = process.env.M13_TEST_TENANT_ID || `m13-test-${Date.now()}-${randomUUID().slice(0, 8)}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function redactedHeaders(response) {
  const headers = { ...response.headers };
  delete headers["set-cookie"];
  return headers;
}

async function authedJson(path, idToken, options = {}) {
  return fetchJson(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      ...(options.headers ?? {})
    }
  });
}

function runPlantedTenancyProbe() {
  try {
    execFileSync("node", ["scripts/check-tenancy.mjs", "tests/fixtures/tenancy/unscoped-query.fixture.ts"], { encoding: "utf8", stdio: "pipe" });
    return { caught: false, output: "planted unscoped query unexpectedly passed" };
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}`.trim();
    return { caught: /Tenancy check failed/.test(output), output };
  }
}

const receipt = {
  ok: false,
  baseUrl,
  expectedSha,
  tenantId,
  createdAt: new Date().toISOString(),
  checks: {}
};

const proof = await createOperatorProofSession();
try {
  const version = await fetchJson(`${baseUrl}/api/version`);
  receipt.checks.version = { status: version.status, body: version.json };
  assert(version.ok, "version endpoint failed");
  assert(version.json?.sha === expectedSha, `version SHA mismatch: expected ${expectedSha}, got ${version.json?.sha}`);

  const health = await fetchJson(`${baseUrl}/api/health`);
  receipt.checks.health = { status: health.status, body: health.json };
  assert(health.ok && health.json?.ok, "health endpoint was not green");

  const plans = await authedJson("/api/platform/plans", proof.idToken);
  receipt.checks.plans = { status: plans.status, body: plans.json };
  assert(plans.ok && plans.json?.plans?.length >= 3, "platform plans did not load");

  const subscribe = await authedJson(`/api/platform/tenants/${encodeURIComponent(tenantId)}/subscribe-test`, proof.idToken, {
    method: "POST",
    body: JSON.stringify({ plan: "nexi", email: `billing+${tenantId}@example.test` })
  });
  receipt.checks.subscribeTestTenant = { status: subscribe.status, body: subscribe.json };
  assert(subscribe.ok && subscribe.json?.ok, `test subscription failed: ${subscribe.json?.error || subscribe.text}`);
  assert(subscribe.json?.stripeMode === "test", "subscription did not report Stripe test mode");
  assert(["active", "trialing"].includes(subscribe.json?.subscription?.status), `subscription was not active/trialing: ${subscribe.json?.subscription?.status}`);

  const entitlements = await authedJson(`/api/platform/tenants/${encodeURIComponent(tenantId)}/tool-entitlements`, proof.idToken);
  receipt.checks.entitlements = { status: entitlements.status, body: entitlements.json };
  assert(entitlements.ok && entitlements.json?.ok, "tool entitlements endpoint failed");
  const tools = entitlements.json.tools ?? [];
  assert(tools.find((tool) => tool.name === "getJobDetail")?.allowed === true, "nexi plan should allow getJobDetail");
  assert(tools.find((tool) => tool.name === "draftPostFromJob")?.allowed === false, "nexi plan should block draftPostFromJob");
  assert(tools.find((tool) => tool.name === "findSlot")?.allowed === false, "nexi plan should block findSlot");

  const backup = await authedJson(`/api/platform/tenants/${encodeURIComponent(tenantId)}/backups/run`, proof.idToken, {
    method: "POST",
    body: "{}"
  });
  receipt.checks.backup = { status: backup.status, body: backup.json };
  assert(backup.ok && backup.json?.ok, `backup failed: ${backup.json?.error || backup.text}`);
  assert(/^backups\//.test(backup.json?.backup?.storageRef || ""), "backup did not return a storage ref");

  const backups = await authedJson(`/api/platform/tenants/${encodeURIComponent(tenantId)}/backups`, proof.idToken);
  receipt.checks.backups = { status: backups.status, body: backups.json };
  assert(backups.ok && backups.json?.backups?.some((entry) => entry.storageRef === backup.json.backup.storageRef), "backup file was not present in backup listing");

  const exported = await authedJson(`/api/platform/tenants/${encodeURIComponent(tenantId)}/export`, proof.idToken);
  receipt.checks.export = { status: exported.status, body: exported.json };
  assert(exported.ok && exported.json?.export?.tenantId === tenantId, "tenant export failed");

  const tenancyProbe = runPlantedTenancyProbe();
  receipt.checks.plantedTenancyProbe = tenancyProbe;
  assert(tenancyProbe.caught, "planted tenancy probe was not caught");

  receipt.ok = true;
} catch (error) {
  receipt.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await proof.dispose();
  receipt.completedAt = new Date().toISOString();
  receipt.operator = { mode: proof.mode, email: proof.identity.email || null, uidPresent: Boolean(proof.identity.uid) };
  receipt.redaction = "No secrets, passwords, tokens, API keys, or email bodies are recorded. Stripe customer/subscription ids are test-mode identifiers only.";
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
}

console.log(JSON.stringify({
  ok: receipt.ok,
  receiptPath,
  tenantId,
  sha: receipt.checks.version?.body?.sha,
  subscriptionStatus: receipt.checks.subscribeTestTenant?.body?.subscription?.status,
  backupRef: receipt.checks.backup?.body?.backup?.storageRef
}, null, 2));
