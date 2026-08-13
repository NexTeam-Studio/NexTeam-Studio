import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryPlatformRepository } from "../../dist/platform/repository.js";
import { registerPlatformRoutes } from "../../dist/platform/routes.js";
import { createLocalDevSession } from "../../dist/auth/accessContext.js";
import { MemoryStorageWriter } from "../../dist/platform/backup.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function startApp() {
  const app = express();
  app.use(express.json());
  const repository = new InMemoryPlatformRepository();
  const storage = new MemoryStorageWriter();
  await repository.savePlatformUser({
    id: "platform_local_operator", authUid: "local-platform-operator", firstName: "Local", lastName: "Operator", email: "operator@local.dev",
    role: "Owner", accountClass: "internal", capabilityOverrides: { grant: [], deny: [] }, accountStatus: "ACTIVE",
    createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z", createdBy: "seed", updatedBy: "seed"
  });
  registerPlatformRoutes(app, {
    repository,
    storage,
    env: { TENANT_ID: "tenant_demo", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return { server, base: `http://127.0.0.1:${address.port}`, repository, storage };
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function startProtectedOwnerApp() {
  const app = express();
  app.use(express.json());
  const repository = new InMemoryPlatformRepository();
  const storage = new MemoryStorageWriter();
  let tenantListQueries = 0;
  const listTenants = repository.listTenants.bind(repository);
  repository.listTenants = async (...args) => {
    tenantListQueries += 1;
    return listTenants(...args);
  };
  await repository.savePlatformUser({
    id: "protected_owner", authUid: "firebase-owner", firstName: "Legacy", lastName: "Profile", email: "owner@nexteam.dev",
    role: "Owner", accountClass: "internal", capabilityOverrides: { grant: [], deny: [] }, accountStatus: "ACTIVE",
    createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z", createdBy: "seed", updatedBy: "seed"
  });
  registerPlatformRoutes(app, {
    repository,
    storage,
    env: { NEXCOMMAND_STRICT_SESSION: "true", NEXCOMMAND_REQUIRE_INTERNAL_PROFILE: "true" },
    platformOperatorAuth: { async verifyIdToken(token) { return { uid: token, email: `${token}@example.test` }; } }
  });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return { server, base: `http://127.0.0.1:${address.port}`, repository, storage, tenantListQueries: () => tenantListQueries };
}

test("tenant membership is capability-gated, tenant-scoped, and audited", async () => {
  const { server, base } = await startApp();
  try {
    const officeHeaders = { "content-type": "application/json", "x-nexteam-local-profile": "local-office" };
    const ownerHeaders = { "content-type": "application/json", "x-nexteam-local-profile": "local-owner" };
    const deniedOwner = await fetch(`${base}/api/platform/tenants/tenant_demo/users`, {
      method: "POST", headers: officeHeaders,
      body: JSON.stringify({ displayName: "Denied Owner", role: "OWNER" })
    });
    assert.equal(deniedOwner.status, 403);

    const deniedSensitiveCapability = await fetch(`${base}/api/platform/tenants/tenant_demo/users`, {
      method: "POST", headers: officeHeaders,
      body: JSON.stringify({ displayName: "Denied Auditor", role: "TECHNICIAN", capabilities: ["tenant.audit.read"] })
    });
    assert.equal(deniedSensitiveCapability.status, 403);

    const created = await fetch(`${base}/api/platform/tenants/tenant_demo/users`, {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ id: "custom_tech", displayName: "Custom Technician", role: "TECHNICIAN", customRoleName: "Dispatcher" })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.deepEqual(createdBody.claimsPreview.tenantCapabilities, []);

    const tenantBoundToken = createLocalDevSession("owner@local.dev", undefined, "tenant_demo", { TENANT_ID: "tenant_demo", NEXI_FIREBASE_AUTH_REQUIRED: "false" }).token;
    const wrongTenant = await fetch(`${base}/api/platform/tenants/tenant_other/users`, { headers: { ...ownerHeaders, authorization: `Bearer ${tenantBoundToken}` } });
    assert.equal(wrongTenant.status, 403);

    const auditDenied = await fetch(`${base}/api/platform/tenants/tenant_demo/users/audit`, { headers: officeHeaders });
    assert.equal(auditDenied.status, 403);
    const audits = await fetch(`${base}/api/platform/tenants/tenant_demo/users/audit`, { headers: ownerHeaders });
    assert.equal(audits.status, 200);
    assert.equal((await audits.json()).audits[0].targetUserId, "custom_tech");
  } finally {
    await close(server);
  }
});

test("platform self-profile and lifecycle routes persist authorized platform actions without deleting tenant data", async () => {
  const { server, base, repository } = await startApp();
  try {
    const headers = { "content-type": "application/json" };
    const tenantId = (await repository.listTenants())[0].id;
    const updated = await fetch(`${base}/api/platform/admin/team/me/profile-photo`, { method: "POST", headers: { "content-type": "image/png" }, body: png });
    assert.equal(updated.status, 201);
    assert.equal((await updated.json()).user.profilePhotoRef, "platform-profiles/local-platform-operator/profile.png");

    const first = await fetch(`${base}/api/platform/admin/tenants/${tenantId}/subscription/cancel/confirmations`, { method: "POST", headers, body: JSON.stringify({ confirmation: "I_UNDERSTAND_CANCEL_ARCHIVE", idempotencyKey: "platform-cancel-intent-001" }) });
    assert.equal(first.status, 201);
    const { cancellationId } = await first.json();
    const cancelled = await fetch(`${base}/api/platform/admin/tenants/${tenantId}/subscription/cancel`, { method: "POST", headers, body: JSON.stringify({ confirmation: "CANCEL_AND_ARCHIVE", cancellationId, idempotencyKey: "platform-cancel-confirm-001" }) });
    assert.equal(cancelled.status, 200);
    assert.equal((await repository.getTenant(tenantId)).lifecycleState, "DISABLED_ARCHIVED");

    const restored = await fetch(`${base}/api/platform/admin/tenants/${tenantId}/subscription/resubscribe`, { method: "POST", headers, body: JSON.stringify({ confirmation: "RESUBSCRIBE", idempotencyKey: "platform-resubscribe-001" }) });
    assert.equal(restored.status, 201);
    assert.equal((await repository.getTenant(tenantId)).lifecycleState, "ACTIVE");
  } finally {
    await close(server);
  }
});

test("protected Owner photo upload is validated, UID-scoped, audited, gates tenant access, and tenant identities remain denied", async () => {
  const { server, base, repository, storage, tenantListQueries } = await startProtectedOwnerApp();
  try {
    const session = await fetch(`${base}/api/platform/admin/session`, { method: "POST", headers: { authorization: "Bearer firebase-owner" } });
    assert.equal(session.status, 201);
    const { token } = await session.json();
    const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };

    const incompleteProfile = await fetch(`${base}/api/platform/admin/team/me`, { headers });
    assert.equal(incompleteProfile.status, 200);
    assert.equal((await incompleteProfile.json()).user.profilePhotoRef, undefined);

    const restricted = await fetch(`${base}/api/platform/admin/summary`, { headers });
    assert.equal(restricted.status, 403);
    assert.equal(tenantListQueries(), 0);

    const legacy = await repository.getPlatformUser("protected_owner");
    await repository.savePlatformUser({ ...legacy, ["two" + "FactorState"]: "ENROLLED" });
    const saved = await repository.getPlatformUser("protected_owner");
    assert.equal(Object.hasOwn(saved, "two" + "FactorState"), false);

    const textReference = await fetch(`${base}/api/platform/admin/team/me`, { method: "PATCH", headers, body: JSON.stringify({ profilePhotoRef: "profiles/firebase-owner.jpg" }) });
    assert.equal(textReference.status, 400);
    const wrongType = await fetch(`${base}/api/platform/admin/team/me/profile-photo`, { method: "POST", headers: { ...headers, "content-type": "image/gif" }, body: png });
    assert.equal(wrongType.status, 400);
    const mismatchedImage = await fetch(`${base}/api/platform/admin/team/me/profile-photo`, { method: "POST", headers: { ...headers, "content-type": "image/jpeg" }, body: png });
    assert.equal(mismatchedImage.status, 400);
    const completed = await fetch(`${base}/api/platform/admin/team/me/profile-photo`, { method: "POST", headers: { ...headers, "content-type": "image/png" }, body: png });
    assert.equal(completed.status, 201);
    assert.ok(storage.files.has("platform-profiles/firebase-owner/profile.png"));
    const completedProfile = await fetch(`${base}/api/platform/admin/team/me`, { headers });
    assert.equal((await completedProfile.json()).user.profilePhotoRef, "platform-profiles/firebase-owner/profile.png");
    const allowed = await fetch(`${base}/api/platform/admin/summary`, { headers });
    assert.equal(allowed.status, 200);
    assert.equal(tenantListQueries(), 1);
    assert.equal((await repository.listPlatformUserAudits("protected_owner")).at(-1).action, "platform_user.updated");

    const recovered = await fetch(`${base}/api/platform/admin/team/me/recover-protected-owner-identity`, { method: "POST", headers });
    assert.equal(recovered.status, 200);
    assert.deepEqual((await recovered.json()).user.firstName, "Christopher");
    assert.equal((await repository.listPlatformUserAudits("protected_owner")).at(-1).action, "platform_user.protected_owner_identity_recovered");

    const tenant = await fetch(`${base}/api/platform/admin/session`, { method: "POST", headers: { authorization: "Bearer firebase-tenant" } });
    assert.equal(tenant.status, 403);
    await assert.rejects(() => repository.savePlatformUser({
      id: "duplicate_owner", authUid: "different-owner", firstName: "Another", lastName: "Owner", email: "another@nexteam.dev",
      profilePhotoRef: "profiles/another.jpg", role: "Owner", accountClass: "internal", capabilityOverrides: { grant: [], deny: [] }, accountStatus: "ACTIVE",
      createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z", createdBy: "seed", updatedBy: "seed"
    }));
    const tenantMember = (await repository.listTenantUsers("tenant_demo"))[0];
    await assert.rejects(() => repository.upsertTenantUser({ ...tenantMember, id: "tenant_identity_conflict", authUid: "firebase-owner", email: "tenant-conflict@nexteam.dev" }));
  } finally {
    await close(server);
  }
});
