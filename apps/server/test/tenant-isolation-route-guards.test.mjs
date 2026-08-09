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

test("tenant-A signed session is denied every repaired tenant-B read route", async () => {
  const { server, base } = await startApp();
  const token = createLocalDevSession("owner@local.dev", undefined, tenantA, env).token;
  const headers = { authorization: `Bearer ${token}` };
  const routes = [
    `/api/scheduling/calendar?tenantId=${tenantB}`,
    `/api/fielddocs/search?tenantId=${tenantB}&q=test`,
    `/api/fielddocs/checklists/templates?tenantId=${tenantB}`,
    `/api/fielddocs/media?tenantId=${tenantB}`,
    `/api/fielddocs/media/not-owned?tenantId=${tenantB}`,
    `/api/fielddocs/reports?tenantId=${tenantB}`,
    `/api/fielddocs/reports/templates?tenantId=${tenantB}`,
    `/api/content/queue?tenantId=${tenantB}`
  ];
  try {
    for (const route of routes) {
      const response = await fetch(`${base}${route}`, { headers });
      assert.equal(response.status, 403, route);
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
