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
import { createServerRuntime } from "../dist/app/runtime.js";
import { assertRequiredPersistence, assertTenantRuntimePersistence } from "../dist/app/persistencePolicy.js";
import { resolveNexiStores } from "../dist/nexi/stores.js";
import { prospectSchema } from "@nexteam/core";

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

test("tenant users are provisioned explicitly and produce Firebase custom claims", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("aquatrace", "suite")]);
  const users = await repository.listTenantUsers("aquatrace");
  assert.deepEqual(users, []);

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
    tenantCapabilities: ["team.view", "team.manage", "team.invite"],
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
  const firebaseCalls = { created: [], claims: [] };
  const firebaseOwnerActivation = {
    async getUserByEmail() {
      const error = new Error("not found");
      error.code = "auth/user-not-found";
      throw error;
    },
    async createUser(input) {
      firebaseCalls.created.push(input);
      return { uid: "firebase_owner_1", email: input.email, customClaims: { role: "platform_operator", preserved: true } };
    },
    async setCustomUserClaims(uid, claims) {
      firebaseCalls.claims.push({ uid, claims });
    }
  };
  registerPlatformRoutes(app, {
    repository,
    storage,
    firebaseOwnerActivation,
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

    const adminSummary = await fetch(`${base}/api/platform/admin/summary`).then((response) => response.json());
    assert.deepEqual(adminSummary, {
      ok: true,
      summary: { prospects: 0, blueprintsAwaitingAction: 0, subscriptions: 2, tenants: 2, activationPending: 0 }
    });

    const createdProspect = await fetch(`${base}/api/platform/admin/prospects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessName: "Northside Services", industry: "plumbing", serviceArea: ["Northside"] })
    }).then((response) => response.json());
    assert.equal(createdProspect.ok, true);
    assert.equal(createdProspect.prospect.status, "DRAFT");
    const intake = await fetch(`${base}/api/platform/admin/prospects/${encodeURIComponent(createdProspect.prospect.id)}/intake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ services: ["Repair"], customerTypes: ["Residential"], currentSystems: [] })
    }).then((response) => response.json());
    assert.equal(intake.prospect.status, "INTAKE_COMPLETE");
    const blueprint = await fetch(`${base}/api/platform/admin/prospects/${encodeURIComponent(createdProspect.prospect.id)}/blueprints`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recommendedLayout: ["Office"], nexiResponsibilities: ["Operational answers"], recommendedModules: ["nexi", "crm"] })
    }).then((response) => response.json());
    assert.equal(blueprint.ok, true);
    assert.equal(blueprint.prospect.status, "BLUEPRINT_READY");
    assert.equal(blueprint.revision.revisionNumber, 1);
    const insightResponse = await fetch(`${base}/api/platform/admin/prospects/${encodeURIComponent(createdProspect.prospect.id)}/blueprints/${encodeURIComponent(blueprint.onboardingPlan.id)}/insights`);
    assert.equal(insightResponse.status, 200);
    const insight = await insightResponse.json();
    assert.equal(insight.insight.kind, "RECOMMENDATION_ONLY");
    assert.match(insight.insight.notice, /do not modify/i);
    assert.equal((await repository.listTenantOnboardingBlueprintRevisions(blueprint.onboardingPlan.id)).length, 1);
    const acceptedResponse = await fetch(`${base}/api/platform/admin/prospects/${encodeURIComponent(createdProspect.prospect.id)}/blueprints/${encodeURIComponent(blueprint.onboardingPlan.id)}/revisions/${encodeURIComponent(blueprint.revision.id)}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Reviewed with the prospect owner." })
    });
    assert.equal(acceptedResponse.status, 201);
    const accepted = await acceptedResponse.json();
    assert.equal(accepted.acceptance.approvalState, "APPROVED");
    assert.equal(accepted.acceptance.revisionNumber, 2);
    assert.equal(accepted.acceptance.previousRevisionId, blueprint.revision.id);
    const reloadedRevisions = await fetch(`${base}/api/platform/admin/prospects/${encodeURIComponent(createdProspect.prospect.id)}/blueprints/${encodeURIComponent(blueprint.onboardingPlan.id)}/revisions`).then((response) => response.json());
    assert.equal(reloadedRevisions.revisions.length, 2);
    assert.equal(reloadedRevisions.revisions[0].approvalState, "DRAFT");
    assert.equal(reloadedRevisions.revisions[1].approvalState, "APPROVED");
    const secondAcceptance = await fetch(`${base}/api/platform/admin/prospects/${encodeURIComponent(createdProspect.prospect.id)}/blueprints/${encodeURIComponent(blueprint.onboardingPlan.id)}/revisions/${encodeURIComponent(blueprint.revision.id)}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Attempt to accept a stale draft." })
    });
    assert.equal(secondAcceptance.status, 409);
    const packages = await fetch(`${base}/api/platform/admin/subscription-packages`).then((response) => response.json());
    assert.equal(packages.packages[0].id, "all-access-test");
    assert.equal(packages.packages[0].priceCents, 0);
    const assignment = await fetch(`${base}/api/platform/admin/prospects/${encodeURIComponent(createdProspect.prospect.id)}/subscription`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageId: "all-access-test" })
    }).then((response) => response.json());
    assert.equal(assignment.ok, true);
    assert.equal(assignment.assignment.status, "ASSIGNED");
    assert.equal(assignment.package.includedModules.length > 1, true);
    const activation = await fetch(`${base}/api/platform/admin/prospects/${encodeURIComponent(createdProspect.prospect.id)}/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "northside-services", ownerEmail: "owner@example.test", ownerDisplayName: "Northside Owner" })
    }).then((response) => response.json());
    assert.equal(activation.ok, true);
    assert.equal(activation.passwordSet, false);
    assert.equal(activation.passwordSetupLinkDelivered, false);
    assert.deepEqual(firebaseCalls.created[0], { email: "owner@example.test", emailVerified: false, disabled: false, displayName: "Northside Owner" });
    assert.equal(firebaseCalls.claims[0].claims.role, "platform_operator");
    assert.equal(firebaseCalls.claims[0].claims.preserved, true);
    assert.equal(firebaseCalls.claims[0].claims.tenantId, "northside-services");
    assert.equal((await repository.getPlatformSubscriptionAssignment(createdProspect.prospect.id)).status, "ACTIVE");
    assert.equal((await repository.getProspect(createdProspect.prospect.id)).status, "CONVERTED");
    assert.equal((await repository.getTenantUser("northside-services", activation.owner.id)).authUid, "firebase_owner_1");

    const publicBranding = await fetch(`${base}/api/public/tenant-branding?tenantId=second-test`).then((response) => response.json());
    assert.equal(publicBranding.ok, true);
    assert.equal(publicBranding.branding.displayName, "second-test");

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

test("tenant Stripe Connect onboarding persists one account and protects refresh and return callbacks", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("aquatrace", "suite"), defaultTenant("second-test", "suite")]);
  const calls = { create: [], links: [], retrieve: [] };
  const stripeConnect = {
    async createExpressAccount(_env, input) {
      calls.create.push(input);
      return { id: "acct_aquatrace", type: "express" };
    },
    async createOnboardingLink(_env, input) {
      calls.links.push(input);
      return { url: `https://connect.stripe.test/link-${calls.links.length}` };
    },
    async retrieveAccount(_env, input) {
      calls.retrieve.push(input);
      return { id: input.accountId, type: "express", details_submitted: false, charges_enabled: false, payouts_enabled: false };
    }
  };
  const app = express();
  app.use(express.json());
  registerPlatformRoutes(app, {
    repository,
    storage: null,
    stripeConnect,
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "false", PUBLIC_BASE_URL: "http://localhost:3000" }
  });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const created = await fetch(`${base}/api/platform/tenants/aquatrace/stripe-connect/onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "billing@example.test" })
    }).then((response) => response.json());
    assert.equal(created.ok, true);
    assert.equal(created.accountId, "acct_aquatrace");
    assert.equal(calls.create.length, 1);
    assert.equal((await repository.getTenant("aquatrace")).payments.stripeConnect.accountId, "acct_aquatrace");
    const firstReturn = new URL(calls.links[0].returnUrl);
    assert.equal(firstReturn.origin, "http://localhost:3000");
    assert.equal(firstReturn.pathname, "/api/stripe/connect/onboarding/return");
    assert.equal(firstReturn.searchParams.get("tenantId"), "aquatrace");
    assert.ok(firstReturn.searchParams.get("flow"));

    const rejected = await fetch(`${base}/api/stripe/connect/onboarding/return?tenantId=second-test&flow=${encodeURIComponent(firstReturn.searchParams.get("flow"))}`);
    assert.equal(rejected.status, 403);

    const refresh = await fetch(`${base}${new URL(calls.links[0].refreshUrl).pathname}${new URL(calls.links[0].refreshUrl).search}`, { redirect: "manual" });
    assert.equal(refresh.status, 303);
    assert.equal(refresh.headers.get("location"), "https://connect.stripe.test/link-2");
    const refreshedReturn = new URL(calls.links[1].returnUrl);
    const returned = await fetch(`${base}${refreshedReturn.pathname}${refreshedReturn.search}`).then((response) => response.json());
    assert.deepEqual(returned.status, { onboarding: "pending", chargesEnabled: false, payoutsEnabled: false });
    assert.deepEqual(calls.retrieve, [{ accountId: "acct_aquatrace" }]);

    const retry = await fetch(`${base}/api/platform/tenants/aquatrace/stripe-connect/onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "billing@example.test" })
    }).then((response) => response.json());
    assert.equal(retry.ok, true);
    assert.equal(calls.create.length, 1);
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
    assert.deepEqual(users.users, []);

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
        expiresAt: "2099-07-20T12:00:00.000Z"
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
        expiresAt: "2099-07-20T12:00:00.000Z",
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

test("runtime defaults to durable persistence and refuses an empty customer tenant runtime", () => {
  assert.throws(
    () => createServerRuntime({}),
    /Durable persistence is required/
  );
  assert.throws(() => resolveNexiStores({}), /Firestore persistence is required/);
  assert.doesNotThrow(() => createServerRuntime({ NODE_ENV: "test", RUNTIME_MODE: "isolated", ALLOW_IN_MEMORY_PERSISTENCE: "true", TENANT_ID: "test-tenant" }));
  assert.doesNotThrow(() => assertRequiredPersistence({}, {
    ApprovalQueue: true,
    Content: true,
    Scheduling: true
  }));
  assert.throws(() => assertRequiredPersistence({}, {
    ApprovalQueue: true,
    Content: false,
    Scheduling: true
  }), /Content/);
  assert.doesNotThrow(() => assertRequiredPersistence({ NODE_ENV: "test", RUNTIME_MODE: "isolated", ALLOW_IN_MEMORY_PERSISTENCE: "true", TENANT_ID: "test-tenant" }, {
    ApprovalQueue: false,
    Content: false,
    Scheduling: false
  }));
  assert.throws(
    () => assertTenantRuntimePersistence({ TENANT_ID: "aquatrace", ALLOW_IN_MEMORY_PERSISTENCE: "true" }, false),
    /Refusing to use an empty in-memory database/
  );
  assert.doesNotThrow(() => assertTenantRuntimePersistence({ TENANT_ID: "aquatrace" }, true));
  assert.throws(
    () => assertTenantRuntimePersistence({ NODE_ENV: "test", TENANT_ID: "aquatrace" }, false),
    /FIREBASE_ADMIN_PRIVATE_KEY/
  );
});

test("platform prospect intake excludes sensitive pre-subscription fields", () => {
  assert.throws(() => prospectSchema.parse({
    id: "prospect_safe",
    status: "DRAFT",
    businessName: "Northside Services",
    industry: "plumbing",
    additionalLocations: [],
    serviceArea: ["Northside"],
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    createdBy: "platform_operator",
    taxId: "must-not-be-accepted"
  }), /Unrecognized key/);
});

test("platform Blueprint revisions are append-only snapshots", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("platform-test", "suite")]);
  const prospect = await repository.saveProspect({
    id: "prospect_safe",
    status: "INTAKE_COMPLETE",
    businessName: "Northside Services",
    industry: "plumbing",
    additionalLocations: [],
    serviceArea: ["Northside"],
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    createdBy: "platform_operator"
  });
  await repository.saveProspectIntake({
    id: "intake_safe",
    prospectId: prospect.id,
    services: ["Repair"],
    customerTypes: ["Residential"],
    currentSystems: [{ id: "system_1", category: "CRM", provider: "Existing CRM", replacementTiming: "COEXIST" }],
    source: "MANUAL",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    createdBy: "platform_operator"
  });
  const blueprint = await repository.createTenantOnboardingBlueprint({
    id: "blueprint_safe",
    prospectId: prospect.id,
    recommendedLayout: ["Office"],
    nexiResponsibilities: ["Answer operational questions"],
    opportunities: { nexcam: ["Photo evidence"] },
    recommendedForms: [],
    recommendedWorkflows: [],
    recommendedAutomations: [],
    recommendedModules: ["nexi", "crm"],
    futureOpportunities: [],
    createdAt: "2026-08-09T00:00:00.000Z",
    createdBy: "platform_operator"
  });
  await repository.appendTenantOnboardingBlueprintRevision({
    id: "blueprint_revision_1",
    prospectId: prospect.id,
    blueprintId: blueprint.id,
    revisionNumber: 1,
    snapshot: blueprint,
    actorId: "platform_operator",
    actorType: "NEXTEAM_STAFF",
    source: "NEXTEAM_STAFF",
    fieldsChanged: ["initial"],
    approvalState: "APPROVED",
    createdAt: "2026-08-09T00:01:00.000Z"
  });
  await assert.rejects(() => repository.createTenantOnboardingBlueprint(blueprint), /immutable/);
  await assert.rejects(() => repository.appendTenantOnboardingBlueprintRevision({
    id: "blueprint_revision_2",
    prospectId: prospect.id,
    blueprintId: blueprint.id,
    revisionNumber: 2,
    snapshot: blueprint,
    actorId: "platform_operator",
    actorType: "NEXTEAM_STAFF",
    source: "NEXTEAM_STAFF",
    fieldsChanged: ["recommendedModules"],
    approvalState: "APPROVED",
    createdAt: "2026-08-09T00:02:00.000Z"
  }), /reference.*prior/);
  const revisions = await repository.listTenantOnboardingBlueprintRevisions(blueprint.id);
  revisions[0].snapshot.recommendedLayout[0] = "Mutated locally";
  assert.equal((await repository.listTenantOnboardingBlueprintRevisions(blueprint.id))[0].snapshot.recommendedLayout[0], "Office");
});

test("onboarding-plan insights and revision acceptance require a platform operator", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("platform-test", "suite")]);
  const timestamp = "2026-08-09T00:00:00.000Z";
  const prospect = await repository.saveProspect({ id: "prospect_insights", status: "INTAKE_COMPLETE", businessName: "Northside Services", industry: "plumbing", additionalLocations: [], serviceArea: [], createdAt: timestamp, updatedAt: timestamp, createdBy: "platform_operator" });
  await repository.saveProspectIntake({ id: "intake_insights", prospectId: prospect.id, services: ["Repair"], customerTypes: [], currentSystems: [], source: "MANUAL", createdAt: timestamp, updatedAt: timestamp, createdBy: "platform_operator" });
  const blueprint = await repository.createTenantOnboardingBlueprint({ id: "blueprint_insights", prospectId: prospect.id, recommendedLayout: [], nexiResponsibilities: [], opportunities: {}, recommendedForms: [], recommendedWorkflows: [], recommendedAutomations: [], recommendedModules: ["nexi"], futureOpportunities: [], createdAt: timestamp, createdBy: "platform_operator" });
  const revision = await repository.appendTenantOnboardingBlueprintRevision({ id: "revision_insights", prospectId: prospect.id, blueprintId: blueprint.id, revisionNumber: 1, snapshot: blueprint, actorId: "platform_operator", actorType: "NEXTEAM_STAFF", source: "NEXTEAM_STAFF", fieldsChanged: ["initial"], approvalState: "DRAFT", createdAt: timestamp });
  const app = express();
  app.use(express.json());
  registerPlatformRoutes(app, {
    repository,
    storage: new MemoryStorageWriter(),
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "true" },
    platformOperatorAuth: { async verifyIdToken(token) { return token === "operator" ? { uid: "operator", platform_operator: true } : { uid: "tenant-owner" }; } }
  });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const path = `/api/platform/admin/prospects/${prospect.id}/blueprints/${blueprint.id}`;
    assert.equal((await fetch(`${base}${path}/insights`, { headers: { authorization: "Bearer tenant-owner" } })).status, 403);
    assert.equal((await fetch(`${base}${path}/insights`, { headers: { authorization: "Bearer operator" } })).status, 200);
    assert.equal((await fetch(`${base}${path}/revisions/${revision.id}/accept`, { method: "POST", headers: { authorization: "Bearer tenant-owner", "content-type": "application/json" }, body: JSON.stringify({ reason: "No." }) })).status, 403);
    assert.equal((await fetch(`${base}${path}/revisions/${revision.id}/accept`, { method: "POST", headers: { authorization: "Bearer operator", "content-type": "application/json" }, body: JSON.stringify({ reason: "Owner review complete." }) })).status, 201);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("tenant blockers persist by tenant and platform support escalation denies non-operators", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("tenant-a", "suite"), defaultTenant("tenant-b", "suite")]);
  const app = express();
  app.use(express.json());
  registerPlatformRoutes(app, {
    repository,
    storage: new MemoryStorageWriter(),
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "true" },
    platformOperatorAuth: {
      async verifyIdToken(token) {
        return token === "operator" ? { uid: "operator", platform_operator: true } : { uid: "tenant-owner", email: "owner@example.test" };
      }
    }
  });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const denied = await fetch(`${base}/api/platform/admin/tenants/tenant-a/blockers`, {
      method: "POST", headers: { authorization: "Bearer tenant-owner", "content-type": "application/json" },
      body: JSON.stringify({ title: "Blocked", detail: "Tenant configuration is incomplete.", category: "CONFIGURATION", severity: "BLOCKING" })
    });
    assert.equal(denied.status, 403);

    const created = await fetch(`${base}/api/platform/admin/tenants/tenant-a/blockers`, {
      method: "POST", headers: { authorization: "Bearer operator", "content-type": "application/json" },
      body: JSON.stringify({ title: "Domain verification", detail: "DNS verification is still required.", category: "INTEGRATION", severity: "BLOCKING" })
    });
    assert.equal(created.status, 201);
    const blocker = (await created.json()).blocker;
    const escalation = await fetch(`${base}/api/platform/admin/tenant-blockers/${encodeURIComponent(blocker.id)}/escalations`, {
      method: "POST", headers: { authorization: "Bearer operator", "content-type": "application/json" },
      body: JSON.stringify({ summary: "Platform team must validate the tenant domain.", priority: "P1" })
    });
    assert.equal(escalation.status, 201);
    assert.equal((await escalation.json()).blocker.status, "ESCALATED");

    const listed = await fetch(`${base}/api/platform/admin/tenant-blockers?tenantId=tenant-a`, { headers: { authorization: "Bearer operator" } }).then((response) => response.json());
    assert.equal(listed.blockers.length, 1);
    assert.equal(listed.escalations.length, 1);
    const isolated = await fetch(`${base}/api/platform/admin/tenant-blockers?tenantId=tenant-b`, { headers: { authorization: "Bearer operator" } }).then((response) => response.json());
    assert.deepEqual(isolated.blockers, []);
    assert.deepEqual(isolated.escalations, []);
  } finally {
    server.close();
  }
});

test("tenant migration records persist status and require an operator plus a safe deferral reason", async () => {
  const app = express();
  app.use(express.json());
  registerPlatformRoutes(app, {
    repository: new InMemoryPlatformRepository([defaultTenant("tenant-a"), defaultTenant("tenant-b")]),
    storage: null,
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "true" },
    platformOperatorAuth: { async verifyIdToken(token) {
      if (token === "operator") return { uid: "operator", platform_operator: true };
      return { uid: "tenant-owner" };
    } }
  });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const denied = await fetch(`${base}/api/platform/admin/tenants/tenant-a/migrations`, {
      method: "POST", headers: { authorization: "Bearer tenant-owner", "content-type": "application/json" },
      body: JSON.stringify({ sourceSystem: "Legacy CRM", scope: "Contacts" })
    });
    assert.equal(denied.status, 403);

    const unsafeDeferral = await fetch(`${base}/api/platform/admin/tenants/tenant-a/migrations`, {
      method: "POST", headers: { authorization: "Bearer operator", "content-type": "application/json" },
      body: JSON.stringify({ sourceSystem: "Legacy CRM", scope: "Contacts", status: "DEFERRED" })
    });
    assert.equal(unsafeDeferral.status, 400);

    const created = await fetch(`${base}/api/platform/admin/tenants/tenant-a/migrations`, {
      method: "POST", headers: { authorization: "Bearer operator", "content-type": "application/json" },
      body: JSON.stringify({ sourceSystem: "Legacy CRM", scope: "Contacts and historical invoices", status: "DEFERRED", deferredReason: "Owner will provide a sanitized export after launch." })
    });
    assert.equal(created.status, 201);
    const migration = (await created.json()).migration;
    assert.equal(migration.status, "DEFERRED");

    const resumed = await fetch(`${base}/api/platform/admin/migrations/${encodeURIComponent(migration.id)}`, {
      method: "PATCH", headers: { authorization: "Bearer operator", "content-type": "application/json" },
      body: JSON.stringify({ status: "IN_PROGRESS" })
    });
    assert.equal(resumed.status, 200);
    assert.equal((await resumed.json()).migration.deferredReason, undefined);

    const completed = await fetch(`${base}/api/platform/admin/migrations/${encodeURIComponent(migration.id)}`, {
      method: "PATCH", headers: { authorization: "Bearer operator", "content-type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" })
    });
    assert.equal(completed.status, 200);
    assert.ok((await completed.json()).migration.completedAt);

    const persisted = await fetch(`${base}/api/platform/admin/migrations?tenantId=tenant-a`, { headers: { authorization: "Bearer operator" } }).then((response) => response.json());
    assert.equal(persisted.migrations.length, 1);
    assert.equal(persisted.migrations[0].status, "COMPLETED");
    const isolated = await fetch(`${base}/api/platform/admin/migrations?tenantId=tenant-b`, { headers: { authorization: "Bearer operator" } }).then((response) => response.json());
    assert.deepEqual(isolated.migrations, []);
  } finally {
    server.close();
  }
});
