import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import { registerContactRoutes } from "./routes.ts";

async function withClientListApp(run) {
  const requestedTenants = [];
  const providerTenants = [];
  const app = express();
  registerContactRoutes({
    app,
    env: {},
    defaultTenantId: () => "tenant-a",
    requireTenantRole: async (_req, _env, _roles, access) => {
      requestedTenants.push(access.requestedTenantId);
      if (access.requestedTenantId !== "tenant-a") {
        const error = new Error("Cross-tenant client listing is forbidden.");
        error.status = 403;
        throw error;
      }
    },
    providerForTenant: (tenantId) => {
      providerTenants.push(tenantId);
      return { getClients: async () => [{ id: "client-a", tenantId }] };
    },
    sendRouteError: (res, error) => res.status(error.status ?? 500).json({ ok: false, error: error.message }),
    RailError: Error,
    actorIdForAccess: () => "actor",
    createQuickPaymentRequestRecord: async () => ({}),
    deps: {},
    fetchAddressSuggestions: async () => [],
    portalHub: () => ({}),
    publicOrigin: "http://example.test",
    randomUUID: () => "uuid",
    repositoryForTenant: () => ({})
  });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    await run({ base: `http://127.0.0.1:${address.port}`, requestedTenants, providerTenants });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("client listing authorizes the requested tenant before selecting its provider", async () => {
  await withClientListApp(async ({ base, requestedTenants, providerTenants }) => {
    const allowed = await fetch(`${base}/api/crm/clients?tenantId=tenant-a`);
    assert.equal(allowed.status, 200);
    assert.deepEqual((await allowed.json()).clients, [{ id: "client-a", tenantId: "tenant-a" }]);
    assert.deepEqual(requestedTenants, ["tenant-a"]);
    assert.deepEqual(providerTenants, ["tenant-a"]);

    const denied = await fetch(`${base}/api/crm/clients?tenantId=tenant-b`);
    assert.equal(denied.status, 403);
    assert.deepEqual(providerTenants, ["tenant-a"]);
  });
});
