import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import express from "express";
import { enforceToolEntitlements, toolEntitlementMatrix } from "../dist/platform/entitlements.js";
import { MemoryStorageWriter, runTenantBackup } from "../dist/platform/backup.js";
import { createStripeTestSubscription } from "../dist/platform/billing.js";
import {
  createJobAccessLink,
  customClaimsForTenantUser,
  upsertTenantUser,
  verifyJobAccessToken
} from "../dist/platform/accessManagement.js";
import { FirestorePlatformRepository, InMemoryPlatformRepository, defaultTenant, defaultTenantBranding, subscriptionFromStripe } from "../dist/platform/repository.js";
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

function fakeTenantFirestore({ direct = null, query = [] } = {}) {
  return {
    collection(name) {
      assert.equal(name, "tenants");
      return {
        doc(id) {
          return {
            async get() {
              return {
                exists: direct !== null && id === direct.id,
                data: () => direct
              };
            }
          };
        },
        where(field, op, value) {
          assert.equal(field, "tenantId");
          assert.equal(op, "==");
          return {
            async get() {
              const docs = query
                .filter((entry) => entry.tenantId === value)
                .map((entry) => ({ data: () => entry }));
              return { empty: docs.length === 0, docs };
            }
          };
        },
        async get() {
          return {
            empty: query.length === 0,
            docs: query.map((entry) => ({ data: () => entry }))
          };
        }
      };
    }
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
  const matrix = toolEntitlementMatrix(tenant);
  assert.equal(matrix.find((entry) => entry.name === "draftPostFromJob")?.allowed, false);
  assert.equal(matrix.find((entry) => entry.name === "getJobDetail")?.allowed, true);
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

test("firestore platform repository falls back when legacy Aquatrace tenant docs are partial", async () => {
  const repository = new FirestorePlatformRepository(fakeTenantFirestore({
    query: [{ tenantId: "aquatrace" }]
  }));
  const tenant = await repository.getTenant("aquatrace");
  assert.equal(tenant.id, "aquatrace");
  assert.equal(tenant.plan, "suite");
  assert.equal(tenant.adapters.crm, "native");
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
  assert.equal(exported.collections.tenantBranding[0].displayName, "second-test");
});

test("platform repository stores tenant branding with text fallback and actor attribution", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("aquatrace", "suite")]);
  const fallback = await repository.getTenantBranding("aquatrace");
  assert.equal(fallback.displayName, "Aquatrace");
  assert.equal(fallback.logo, undefined);
  assert.equal(fallback.updatedBy, "system");

  const updated = await repository.saveTenantBranding({
    ...defaultTenantBranding("aquatrace"),
    colors: { primary: "#111111", accent: "#eeeeee" },
    fontFamily: "Georgia, serif",
    source: "manual",
    updatedBy: "internal:tenant_user_chris",
    updatedAt: "2026-07-10T13:00:00.000Z"
  });
  assert.equal(updated.colors.primary, "#111111");
  assert.equal(updated.fontFamily, "Georgia, serif");
  assert.equal(updated.updatedBy, "internal:tenant_user_chris");
});

test("tenant users seed Aquatrace roles and produce Firebase custom claims", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("aquatrace", "suite")]);
  const users = await repository.listTenantUsers("aquatrace");
  assert.equal(users.find((user) => user.id === "tenant_user_chris")?.role, "OWNER");
  assert.equal(users.find((user) => user.id === "tech_catherine")?.role, "TECHNICIAN");
  assert.equal(users.find((user) => user.id === "tech_logan")?.role, "TECHNICIAN");

  const office = await upsertTenantUser(repository, {
    tenantId: "aquatrace",
    id: "office_catherine",
    authUid: "uid_catherine",
    email: "catherine@example.test",
    displayName: "Catherine Office",
    role: "OFFICE_ADMIN",
    now: "2026-07-08T12:00:00.000Z"
  });
  assert.deepEqual(customClaimsForTenantUser(office), {
    tenantId: "aquatrace",
    tenantRole: "OFFICE_ADMIN",
    tenantUserId: "office_catherine",
    roles: ["office_admin"]
  });
});

test("job access links verify only one linked job and fail closed after revoke", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("aquatrace", "suite")]);
  const created = await createJobAccessLink(repository, {
    tenantId: "aquatrace",
    jobId: "job_deborah_justice",
    propertyId: "property_isbell_road",
    externalName: "Subcontractor",
    externalEmail: "sub@example.test",
    expiresAt: "2026-07-10T12:00:00.000Z",
    createdBy: "internal:tenant_user_chris",
    now: "2026-07-08T12:00:00.000Z",
    token: "test-token-that-stays-in-memory-only"
  });

  assert.notEqual(created.link.tokenHash, created.oneTimeToken);
  const access = await verifyJobAccessToken(repository, {
    tenantId: "aquatrace",
    linkId: created.link.id,
    token: created.oneTimeToken,
    now: "2026-07-08T12:01:00.000Z"
  });
  assert.equal(access.accessKind, "job_link");
  assert.equal(access.jobId, "job_deborah_justice");
  assert.deepEqual(access.scopes, ["job.read", "checklist.write", "media.upload", "notes.write"]);

  await assert.rejects(
    () => verifyJobAccessToken(repository, {
      tenantId: "aquatrace",
      linkId: created.link.id,
      token: "wrong-token-that-stays-in-memory-only",
      now: "2026-07-08T12:01:00.000Z"
    }),
    /not valid/
  );
  await repository.revokeJobAccessLink("aquatrace", created.link.id, "2026-07-08T12:02:00.000Z");
  await assert.rejects(
    () => verifyJobAccessToken(repository, {
      tenantId: "aquatrace",
      linkId: created.link.id,
      token: created.oneTimeToken,
      now: "2026-07-08T12:03:00.000Z"
    }),
    /revoked/
  );
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

    const branding = await fetch(`${base}/api/platform/tenants/second-test/branding`).then((response) => response.json());
    assert.equal(branding.ok, true);
    assert.equal(branding.branding.displayName, "second-test");

    const updatedBranding = await fetch(`${base}/api/platform/tenants/second-test/branding`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Second Test Pools", colors: { primary: "#123456" }, fontFamily: "Georgia, serif" })
    }).then((response) => response.json());
    assert.equal(updatedBranding.ok, true);
    assert.equal(updatedBranding.branding.displayName, "Second Test Pools");
    assert.equal(updatedBranding.branding.colors.primary, "#123456");
    assert.equal(updatedBranding.branding.updatedBy, "internal:local-owner");

    const backup = await fetch(`${base}/api/platform/tenants/second-test/backups/run`, { method: "POST" }).then((response) => response.json());
    assert.equal(backup.ok, true);
    assert.match(backup.backup.storageRef, /^backups\/second-test\//);

    const entitlements = await fetch(`${base}/api/platform/tenants/second-test/tool-entitlements`).then((response) => response.json());
    assert.equal(entitlements.ok, true);
    assert.equal(entitlements.tools.find((entry) => entry.name === "draftPostFromJob").allowed, false);

    const exported = await fetch(`${base}/api/platform/tenants/second-test/export`).then((response) => response.json());
    assert.equal(exported.ok, true);
    assert.equal(exported.export.tenantId, "second-test");
  } finally {
    server.close();
  }
});

test("platform routes manage tenant users and job links without leaking token hashes by default", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("aquatrace", "suite")]);
  const storage = new MemoryStorageWriter();
  const app = express();
  app.use(express.json());
  registerPlatformRoutes(app, {
    repository,
    storage,
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const users = await fetch(`${base}/api/platform/tenants/aquatrace/users`).then((response) => response.json());
    assert.equal(users.ok, true);
    assert.equal(users.users.some((user) => user.id === "tenant_user_chris" && user.role === "OWNER"), true);

    const createdUser = await fetch(`${base}/api/platform/tenants/aquatrace/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "office_admin_1", displayName: "Office Admin", email: "office@example.test", role: "OFFICE_ADMIN" })
    }).then((response) => response.json());
    assert.equal(createdUser.ok, true);
    assert.equal(createdUser.claimsPreview.tenantRole, "OFFICE_ADMIN");

    const claims = await fetch(`${base}/api/platform/tenants/aquatrace/users/office_admin_1/custom-claims`, {
      method: "POST"
    }).then((response) => response.json());
    assert.equal(claims.ok, true);
    assert.equal(claims.applied, false);
    assert.equal(claims.claimsPreview.tenantUserId, "office_admin_1");

    const link = await fetch(`${base}/api/platform/tenants/aquatrace/job-access-links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job_deborah_justice",
        propertyId: "property_isbell_road",
        externalName: "Subcontractor",
        externalEmail: "sub@example.test",
        expiresAt: "2026-07-20T12:00:00.000Z"
      })
    }).then((response) => response.json());
    assert.equal(link.ok, true);
    assert.equal(link.oneTimeToken, undefined);
    assert.equal(link.link.tokenHash, "[stored hash]");

    const linkWithToken = await fetch(`${base}/api/platform/tenants/aquatrace/job-access-links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: "job_deborah_justice",
        externalName: "Subcontractor",
        expiresAt: "2026-07-20T12:00:00.000Z",
        returnToken: true
      })
    }).then((response) => response.json());
    assert.equal(linkWithToken.ok, true);
    assert.equal(typeof linkWithToken.oneTimeToken, "string");

    const verified = await fetch(`${base}/api/platform/job-access-links/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", linkId: linkWithToken.link.id, token: linkWithToken.oneTimeToken })
    }).then((response) => response.json());
    assert.equal(verified.ok, true);
    assert.equal(verified.access.accessKind, "job_link");
    assert.equal(verified.access.jobId, "job_deborah_justice");

    const listedLinks = await fetch(`${base}/api/platform/tenants/aquatrace/job-access-links`).then((response) => response.json());
    assert.equal(listedLinks.ok, true);
    assert.equal(listedLinks.links.every((entry) => entry.tokenHash === "[stored hash]"), true);

    const revoked = await fetch(`${base}/api/platform/tenants/aquatrace/job-access-links/${linkWithToken.link.id}/revoke`, {
      method: "POST"
    }).then((response) => response.json());
    assert.equal(revoked.ok, true);
    assert.equal(revoked.link.tokenHash, "[stored hash]");
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
