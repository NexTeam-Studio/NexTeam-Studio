import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { MemoryTimePayRepository, TimePayService } from "../dist/modules/nexops/shared/timePay/timePayFoundation.js";
import { registerCrmRoutes } from "../dist/crm/routes.js";

const tenantId = "tenant_time_pay";
const period = { periodStart: "2026-08-01T00:00:00.000Z", periodEnd: "2026-08-15T00:00:00.000Z" };

test("time/pay stores clock, drive, non-job, overtime, compensation, and productivity facts without payroll submission", async () => {
  const service = new TimePayService(new MemoryTimePayRepository(), () => new Date("2026-08-08T12:00:00.000Z"));
  const job = await service.createLabor({ tenantId, employeeId: "tech_1", jobId: "job_1", category: "job", payType: "overtime", startedAt: "2026-08-08T08:00:00.000Z", endedAt: "2026-08-08T09:30:00.000Z", productivityUnits: 3, productivityUnitLabel: "repairs" }, "office_1");
  await service.createLabor({ tenantId, employeeId: "tech_1", category: "drive", startedAt: "2026-08-08T09:30:00.000Z", endedAt: "2026-08-08T10:00:00.000Z" }, "office_1");
  await service.createLabor({ tenantId, employeeId: "tech_1", category: "non_job", payType: "unpaid", startedAt: "2026-08-08T10:00:00.000Z", endedAt: "2026-08-08T10:15:00.000Z" }, "office_1");
  await service.createCompensation({ tenantId, employeeId: "tech_1", jobId: "job_1", kind: "commission", amount: 42.5, occurredAt: "2026-08-08T10:15:00.000Z" }, "office_1");
  await service.createCompensation({ tenantId, employeeId: "tech_1", kind: "bonus", amount: 20, occurredAt: "2026-08-08T10:15:00.000Z" }, "office_1");
  const draft = await service.payrollDraft(tenantId, { ...period, employeeId: "tech_1" });
  assert.equal(job.minutes, 90); assert.equal(draft.mode, "draft_only"); assert.equal(draft.externalPayrollSubmission, "not_supported"); assert.equal(draft.laborMinutesByPayType.overtime, 90); assert.equal(draft.laborMinutesByPayType.unpaid, 15); assert.equal(draft.laborMinutesByCategory.drive, 30); assert.equal(draft.commissionAmount, 42.5); assert.equal(draft.bonusAmount, 20); assert.deepEqual(draft.productivity, [{ employeeId: "tech_1", jobId: "job_1", units: 3, unitLabel: "repairs", minutes: 90 }]);
  await service.voidLabor(tenantId, job.id, { reason: "duplicate clock" }, "office_2");
  assert.equal((await service.events(tenantId, job.id)).at(-1).snapshot.voidedBy, "office_2");
  await assert.rejects(() => service.createLabor({ tenantId, employeeId: "tech_1", category: "job", startedAt: "2026-08-08T08:00:00.000Z", endedAt: "2026-08-08T09:00:00.000Z" }, "office_1"));
});

test("time/pay routes deny technician writes and scope records by tenant", async () => {
  const repository = new MemoryNativeCrmRepository(); const adapter = new NativeAdapter(repository, tenantId); const app = express(); app.use(express.json());
  registerCrmRoutes(app, { approvalQueue: new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter)), memoryRepository: repository, timePayRepository: new MemoryTimePayRepository(), env: { TENANT_ID: tenantId, NEXI_FIREBASE_AUTH_REQUIRED: "false" } });
  const server = await new Promise((resolve) => { const started = app.listen(0, () => resolve(started)); }); const address = server.address(); assert.equal(typeof address, "object"); const base = `http://127.0.0.1:${address.port}`;
  try {
    const payload = { tenantId, employeeId: "tech_1", category: "drive", startedAt: "2026-08-08T08:00:00.000Z", endedAt: "2026-08-08T08:30:00.000Z" };
    const denied = await fetch(`${base}/api/crm/time-pay/labor`, { method: "POST", headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-technician" }, body: JSON.stringify(payload) }); assert.equal(denied.status, 403);
    const created = await fetch(`${base}/api/crm/time-pay/labor`, { method: "POST", headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-office" }, body: JSON.stringify(payload) }); assert.equal(created.status, 201);
    const isolated = await fetch(`${base}/api/crm/time-pay/labor?tenantId=tenant_other`, { headers: { "x-nexteam-local-profile": "local-office" } }); assert.equal(isolated.status, 200); assert.deepEqual((await isolated.json()).laborFacts, []);
    const draft = await fetch(`${base}/api/crm/time-pay/payroll-draft?tenantId=${tenantId}&periodStart=${encodeURIComponent(period.periodStart)}&periodEnd=${encodeURIComponent(period.periodEnd)}`, { headers: { "x-nexteam-local-profile": "local-office" } }); assert.equal(draft.status, 200); assert.equal((await draft.json()).payrollDraft.externalPayrollSubmission, "not_supported");
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
