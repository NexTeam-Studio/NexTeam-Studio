import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { createLocalDevSession, requireAccessContext } from "../dist/auth/accessContext.js";
import { registerContentRoutes } from "../dist/content/routes.js";
import { InMemoryContentRepository } from "../dist/content/repository.js";
import { registerFieldDocsRoutes } from "../dist/fielddocs/routes.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { registerSchedulingRoutes } from "../dist/scheduling/routes.js";
import { InMemorySchedulingRepository } from "../dist/scheduling/repository.js";

const tenantA = "tenant_a";
const tenantB = "tenant_b";
const env = { TENANT_ID: tenantA, NEXI_FIREBASE_AUTH_REQUIRED: "false" };

async function startApp() {
  const app = express();
  app.use(express.json());
  registerSchedulingRoutes(app, {
    repository: new InMemorySchedulingRepository(),
    approvalQueue: new ApprovalQueueService(new InMemoryApprovalQueueRepository()),
    env
  });
  registerFieldDocsRoutes(app, { repository: new MemoryMediaRepository(), env });
  registerContentRoutes(app, { repository: new InMemoryContentRepository(), env });
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

test("both tenant directions are denied every repaired cross-tenant read route", async () => {
  const { server, base } = await startApp();
  try {
    for (const [sourceTenantId, targetTenantId] of [[tenantA, tenantB], [tenantB, tenantA]]) {
      const token = createLocalDevSession("owner@local.dev", undefined, sourceTenantId, env).token;
      const headers = { authorization: `Bearer ${token}` };
      const routes = [
        `/api/scheduling/calendar?tenantId=${targetTenantId}`,
        `/api/fielddocs/search?tenantId=${targetTenantId}&q=test`,
        `/api/fielddocs/checklists/templates?tenantId=${targetTenantId}`,
        `/api/fielddocs/media?tenantId=${targetTenantId}`,
        `/api/fielddocs/media/not-owned?tenantId=${targetTenantId}`,
        `/api/fielddocs/reports?tenantId=${targetTenantId}`,
        `/api/fielddocs/reports/templates?tenantId=${targetTenantId}`,
        `/api/fielddocs/checklists?tenantId=${targetTenantId}`,
        `/api/fielddocs/properties/property_b/history?tenantId=${targetTenantId}`,
        `/api/fielddocs/reports/report_b/pdf?tenantId=${targetTenantId}`,
        `/api/fielddocs/signed-documents/document_b/pdf?tenantId=${targetTenantId}`,
        `/api/content/queue?tenantId=${targetTenantId}`,
        `/api/content/calendar?tenantId=${targetTenantId}`,
        `/api/content/stats?tenantId=${targetTenantId}`
      ];
      for (const route of routes) {
        const response = await fetch(`${base}${route}`, { headers });
        assert.equal(response.status, 403, `${sourceTenantId} -> ${targetTenantId}: ${route}`);
      }
    }
  } finally {
    await close(server);
  }
});

test("required Firebase authentication fails closed without a configured admin SDK", async () => {
  const request = { header: () => "" };
  await assert.rejects(
    () => requireAccessContext(request, { TENANT_ID: tenantA, NEXI_FIREBASE_AUTH_REQUIRED: "true" }),
    (error) => error?.status === 503
  );
});
