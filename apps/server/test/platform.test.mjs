import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import express from "express";
import { enforceToolEntitlements } from "../dist/platform/entitlements.js";
import { MemoryStorageWriter, runTenantBackup } from "../dist/platform/backup.js";
import { createStripeTestSubscription } from "../dist/platform/billing.js";
import { InMemoryPlatformRepository, defaultTenant, subscriptionFromStripe } from "../dist/platform/repository.js";
import { registerPlatformRoutes } from "../dist/platform/routes.js";

function tool(name) {
  return {
    name,
    description: name,
    inputSchema: { parse: (value) => value },
    handler: async () => ({ result: {}, sources: [] })
  };
}

function usageRecord(tenantId, cost) {
  return {
    tenantId,
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      totalTokens: 15
    },
    estimatedCostUsd: cost,
    ok: true,
    errorSummary: "",
    createdAt: "2026-07-07T12:00:00.000Z"
  };
}

test("platform entitlement registry removes tools outside the tenant plan", () => {
  const tenant = defaultTenant("second-test", "nexi");
  const result = enforceToolEntitlements(tenant, [
    tool("getJobDetail"),
    tool("draftPostFromJob"),
    tool("findSlot")
  ]);
  assert.deepEqual(result.tools.map((entry) => entry.name), ["getJobDetail"]);
  assert.deepEqual(result.blocked.map((entry) => entry.name), ["draftPostFromJob", "findSlot"]);
});

test("suite tenant keeps scheduling and marketing tools", () => {
  const tenant = defaultTenant("aquatrace", "suite");
  const result = enforceToolEntitlements(tenant, [
    tool("getJobDetail"),
    tool("draftPostFromJob"),
    tool("findSlot")
  ]);
  assert.deepEqual(result.tools.map((entry) => entry.name), ["getJobDetail", "draftPostFromJob", "findSlot"]);
});

test("platform repository summarizes cost, records backup, and exports per tenant", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("aquatrace", "suite"), defaultTenant("second-test", "nexi")]);
  const storage = new MemoryStorageWriter();
  repository.seedUsage(usageRecord("aquatrace", 0.23));
  repository.seedUsage(usageRecord("second-test", 0.05));
  await repository.saveSubscription(subscriptionFromStripe({
    tenantId: "second-test",
    plan: "nexi",
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    status: "active"
  }));

  const cost = await repository.summarizeCost("aquatrace", {
    start: "2026-07-07T00:00:00.000Z",
    end: "2026-07-08T00:00:00.000Z"
  });
  assert.equal(cost.usageLogCount, 1);
  assert.equal(cost.estimatedCostUsd, 0.23);

  const backup = await runTenantBackup({ tenantId: "second-test", repository, storage, now: "2026-07-07T13:00:00.000Z" });
  assert.equal(backup.record.tenantId, "second-test");
  assert.equal(storage.files.has(backup.record.storageRef), true);
  assert.equal(backup.record.collectionCounts.tenantSubscriptions, 1);

  const exported = await repository.exportTenantData("second-test");
  assert.equal(exported.collections.usageLog.length, 1);
  assert.equal(exported.collections.tenants[0].id, "second-test");
});

test("platform billing refuses live Stripe keys and supports fake test-mode receipt runs", async () => {
  await assert.rejects(
    () => createStripeTestSubscription({ env: { STRIPE_SECRET_KEY: "sk_live_forbidden" }, tenantId: "second-test", plan: "nexi" }),
    /Live-mode Stripe keys/
  );
  const result = await createStripeTestSubscription({
    env: { PLATFORM_FAKE_STRIPE: "true", STRIPE_SECRET_KEY: "sk_test_fake" },
    tenantId: "second-test",
    plan: "nexi"
  });
  assert.equal(result.status, "active");
  assert.match(result.subscriptionId, /^sub_test_second-test_nexi/);
});

test("platform routes expose tenants, test subscription, backup, and export", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("aquatrace", "suite"), defaultTenant("second-test", "nexi")]);
  const storage = new MemoryStorageWriter();
  repository.seedUsage(usageRecord("second-test", 0.05));
  const app = express();
  app.use(express.json());
  registerPlatformRoutes(app, {
    repository,
    storage,
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "false", PLATFORM_FAKE_STRIPE: "true", STRIPE_SECRET_KEY: "sk_test_fake" }
  });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const subscribe = await fetch(`${base}/api/platform/tenants/second-test/subscribe-test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "nexi", email: "owner@example.test" })
    }).then((response) => response.json());
    assert.equal(subscribe.ok, true);
    assert.equal(subscribe.stripeMode, "test");

    const tenants = await fetch(`${base}/api/platform/tenants`).then((response) => response.json());
    assert.equal(tenants.ok, true);
    assert.equal(tenants.tenants.some((row) => row.tenant.id === "second-test" && row.subscription.status === "active"), true);

    const backup = await fetch(`${base}/api/platform/tenants/second-test/backups/run`, { method: "POST" }).then((response) => response.json());
    assert.equal(backup.ok, true);
    assert.match(backup.backup.storageRef, /^backups\/second-test\//);

    const exported = await fetch(`${base}/api/platform/tenants/second-test/export`).then((response) => response.json());
    assert.equal(exported.ok, true);
    assert.equal(exported.export.tenantId, "second-test");
  } finally {
    server.close();
  }
});

test("tenancy scanner catches the planted unscoped query fixture", () => {
  assert.throws(
    () => execFileSync("node", ["scripts/check-tenancy.mjs", "tests/fixtures/tenancy/unscoped-query.fixture.ts"], { encoding: "utf8" }),
    /Tenancy check failed/
  );
});
