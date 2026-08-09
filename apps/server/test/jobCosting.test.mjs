import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { JobCostingService, MemoryJobCostingRepository } from "../dist/modules/nexops/shared/jobCosting/jobCostingFoundation.js";
import { registerCrmRoutes } from "../dist/crm/routes.js";

const job = { id: "job_costing_1", tenantId: "tenant_costing", clientId: "client_1", status: "Unscheduled", title: "Repair", lineItems: [], totals: { subtotal: 200, tax: 0, total: 200 } };
const invoice = { id: "invoice_costing_1", tenantId: "tenant_costing", clientId: "client_1", jobId: job.id, jobIds: [job.id], jobReferences: [{ jobId: job.id, title: job.title, amount: 200 }], status: "sent", title: "Repair invoice", lineItems: [], totals: { subtotal: 200, tax: 0, total: 200 } };

test("job costing keeps unknown direct costs nullable and only derives gross profit from actual invoice facts", async () => {
  const repository = new MemoryJobCostingRepository();
  const service = new JobCostingService(repository, () => new Date("2026-08-08T12:00:00.000Z"));
  const known = await service.create({ tenantId: job.tenantId, jobId: job.id, category: "labor", source: "time_entry", amount: 75, occurredAt: "2026-08-08T11:00:00.000Z" }, "owner_1");
  const unknown = await service.create({ tenantId: job.tenantId, jobId: job.id, category: "material", source: "vendor_bill", amount: null, occurredAt: "2026-08-08T11:00:00.000Z" }, "owner_1");
  let summary = await service.summarize(job.tenantId, job.id, [invoice]);
  assert.equal(summary.actualRevenue, 200); assert.equal(summary.actualCost, null); assert.equal(summary.actualGrossProfit, null); assert.equal(summary.confidence, "incomplete");
  await service.void(job.tenantId, unknown.id, { reason: "Vendor bill not applicable" }, "owner_1");
  summary = await service.summarize(job.tenantId, job.id, [invoice]);
  assert.equal(summary.actualCost, 75); assert.equal(summary.actualGrossProfit, 125); assert.equal(summary.actualGrossMarginPercent, 62.5);
  assert.deepEqual((await service.events(job.tenantId, job.id)).map((event) => event.command), ["created", "created", "voided"]);
  assert.equal((await service.events(job.tenantId, job.id))[2].snapshot.voidedBy, "owner_1");
  await assert.rejects(() => service.void("tenant_other", known.id, { reason: "nope" }, "owner_2"), { status: 404 });
});

async function startApp() {
  const repository = new MemoryNativeCrmRepository({ jobs: [job], invoices: [invoice] });
  const adapter = new NativeAdapter(repository, "tenant_costing");
  const app = express(); app.use(express.json());
  registerCrmRoutes(app, { approvalQueue: new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter)), memoryRepository: repository, jobCostingRepository: new MemoryJobCostingRepository(), env: { TENANT_ID: "tenant_costing", NEXI_FIREBASE_AUTH_REQUIRED: "false" } });
  const server = await new Promise((resolve) => { const started = app.listen(0, () => resolve(started)); }); const address = server.address(); assert.equal(typeof address, "object"); return { server, base: `http://127.0.0.1:${address.port}` };
}

test("job cost routes enforce office authority and tenant-owned job links", async () => {
  const { server, base } = await startApp();
  try {
    const payload = { tenantId: "tenant_costing", category: "labor", source: "manual", amount: 50, occurredAt: "2026-08-08T11:00:00.000Z" };
    const denied = await fetch(`${base}/api/crm/jobs/${job.id}/cost-facts`, { method: "POST", headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-technician" }, body: JSON.stringify(payload) }); assert.equal(denied.status, 403);
    const created = await fetch(`${base}/api/crm/jobs/${job.id}/cost-facts`, { method: "POST", headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-office" }, body: JSON.stringify(payload) }); assert.equal(created.status, 201);
    const createdBody = await created.json();
    const profitability = await fetch(`${base}/api/crm/jobs/${job.id}/profitability?tenantId=tenant_costing`, { headers: { "x-nexteam-local-profile": "local-office" } }); assert.equal(profitability.status, 200); assert.equal((await profitability.json()).profitability.actualGrossProfit, 150);
    const isolated = await fetch(`${base}/api/crm/jobs/${job.id}/cost-facts?tenantId=tenant_other`, { headers: { "x-nexteam-local-profile": "local-office" } }); assert.equal(isolated.status, 404);
    const voided = await fetch(`${base}/api/crm/jobs/${job.id}/cost-facts/${createdBody.costFact.id}/void`, { method: "POST", headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-office" }, body: JSON.stringify({ tenantId: "tenant_costing", reason: "Duplicate entry" }) }); assert.equal(voided.status, 200);
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
