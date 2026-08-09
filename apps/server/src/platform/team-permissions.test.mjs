import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryPlatformRepository } from "../../dist/platform/repository.js";
import { registerPlatformRoutes } from "../../dist/platform/routes.js";
import { createLocalDevSession } from "../../dist/auth/accessContext.js";

async function startApp() {
  const app = express();
  app.use(express.json());
  registerPlatformRoutes(app, {
    repository: new InMemoryPlatformRepository(),
    storage: null,
    env: { TENANT_ID: "tenant_demo", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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
      body: JSON.stringify({ id: "custom_tech", displayName: "Custom Technician", role: "TECHNICIAN", customRoleName: "Dispatcher", capabilities: ["team.view"] })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.deepEqual(createdBody.claimsPreview.tenantCapabilities, ["team.view"]);

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
