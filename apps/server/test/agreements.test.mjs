import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { AgreementService, MemoryAgreementRepository } from "../dist/modules/nexops/shared/agreements/agreementFoundation.js";
import { registerCrmRoutes } from "../dist/crm/routes.js";

const input = {
  tenantId: "tenant_agreements",
  clientId: "client_1",
  propertyId: "property_1",
  title: "Quarterly maintenance agreement",
  kind: "maintenance_plan",
  cadence: "quarterly",
  startDate: "2026-08-08T00:00:00.000Z",
  lineItems: [{ description: "Quarterly inspection", quantity: 1, unitPrice: 225 }],
  terms: "Scope is scheduled service only."
};

test("agreement lifecycle persists tenant-scoped service commitments without accounting side effects", async () => {
  const repository = new MemoryAgreementRepository();
  const service = new AgreementService(repository, () => new Date("2026-08-08T12:00:00.000Z"));
  const draft = await service.create(input, "owner_1");
  assert.equal(draft.status, "draft");
  assert.equal(draft.billingMode, "manual_invoice_only");
  assert.equal((await service.list("tenant_agreements")).length, 1);
  assert.equal(await service.get("other_tenant", draft.id), null);

  const active = await service.transition("tenant_agreements", draft.id, "activated", "owner_1");
  assert.equal(active.status, "active");
  assert.equal(active.nextServiceAt, "2026-11-08T00:00:00.000Z");
  assert.equal((await service.events("tenant_agreements", draft.id)).map((event) => event.command).join(","), "created,activated");
  await assert.rejects(() => service.update("tenant_agreements", draft.id, { title: "late change" }, "owner_1"), { status: 409 });
});

async function startApp() {
  const repository = new MemoryNativeCrmRepository();
  const adapter = new NativeAdapter(repository, "tenant_agreements");
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue: new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter)),
    memoryRepository: repository,
    agreementRepository: new MemoryAgreementRepository(),
    env: { TENANT_ID: "tenant_agreements", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  const server = await new Promise((resolve) => { const started = app.listen(0, () => resolve(started)); });
  const address = server.address();
  assert.equal(typeof address, "object");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

test("agreement routes allow office writes and deny technician writes", async () => {
  const { server, base } = await startApp();
  try {
    const denied = await fetch(`${base}/api/crm/agreements`, {
      method: "POST", headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-technician" }, body: JSON.stringify(input)
    });
    assert.equal(denied.status, 403);
    const created = await fetch(`${base}/api/crm/agreements`, {
      method: "POST", headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-office" }, body: JSON.stringify(input)
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.equal(body.agreement.tenantId, "tenant_agreements");
    const listing = await fetch(`${base}/api/crm/agreements?tenantId=tenant_agreements`, { headers: { "x-nexteam-local-profile": "local-office" } });
    assert.equal(listing.status, 200);
    assert.equal((await listing.json()).agreements.length, 1);
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
