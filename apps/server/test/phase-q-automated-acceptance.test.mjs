import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalQueueService, InMemoryApprovalQueueRepository, InMemoryEventBus } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter, defaultCrmSettings } from "@nexteam/providers";
import { assertAccessRole } from "../dist/auth/accessContext.js";
import { createCommsNexiTools } from "../dist/comms/nexiTools.js";
import { FieldDocsService } from "../dist/fielddocs/fieldDocsService.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { AgreementService, MemoryAgreementRepository } from "../dist/modules/nexops/shared/agreements/agreementFoundation.js";
import { JobCostingService, MemoryJobCostingRepository } from "../dist/modules/nexops/shared/jobCosting/jobCostingFoundation.js";
import { InMemoryPortalHubRepository } from "../dist/modules/nexportal/components/portalCore/server/portalHubRepository.js";
import { PortalHubService } from "../dist/modules/nexportal/components/portalCore/server/portalHubService.js";
import { MemoryLedgerRepository } from "../dist/crm/ledgerRepository.js";
import { InMemorySchedulingRepository } from "../dist/scheduling/repository.js";
import { createCrmToolsWithOptions } from "../dist/crm/nexiTools.js";

const tenant = {
  id: "phase_q_isolated", name: "Phase Q Isolated", industryPack: "general_service",
  branding: { assistantName: "Nexi" }, adapters: { crm: "native", media: "native", email: "native" },
  approval: {}, timezone: "America/New_York", plan: "suite"
};
const client = { id: "client_q", tenantId: tenant.id, name: "Acceptance Client", emails: ["client@example.test"], phones: ["8645551212"], tags: [], consent: { email: true, sms: false } };
const property = { id: "property_q", tenantId: tenant.id, clientId: client.id, label: "Acceptance Property", address: { street1: "1 Test Way", city: "Greenville", province: "SC", postalCode: "29601", country: "US" }, assets: [] };
const job = { id: "job_q", tenantId: tenant.id, clientId: client.id, propertyId: property.id, status: "Unscheduled", title: "Acceptance service", lineItems: [], totals: { subtotal: 250, tax: 0, total: 250 } };
const invoice = { id: "invoice_q", tenantId: tenant.id, clientId: client.id, jobId: job.id, jobIds: [job.id], jobReferences: [{ jobId: job.id, title: job.title, amount: 250 }], status: "sent", title: "Acceptance invoice", lineItems: [], totals: { subtotal: 250, tax: 0, total: 250 } };

test("Phase Q isolated operating path persists configuration through portal evidence without external delivery", async () => {
  const settings = defaultCrmSettings(tenant.id);
  settings.propertyAssetDefinitions = [{ kind: "pump", label: "Pump", fields: [{ key: "model", label: "Model", type: "text", required: true }] }];
  const repository = new MemoryNativeCrmRepository({ crmSettings: [settings], clients: [client], properties: [property], jobs: [job], invoices: [invoice] });
  const adapter = new NativeAdapter(repository, tenant.id);
  const approvals = new ApprovalQueueService(new InMemoryApprovalQueueRepository());

  // Configuration and catalog remain tenant-scoped and are surfaced by the same assistant registry.
  await repository.saveCrmSettings({ ...settings, catalogItems: [{ id: "catalog_q", tenantId: tenant.id, code: "ACCEPT-001", name: "Acceptance inspection", price: 250, category: "Service", tag: "Acceptance", taxable: false, visible: true, source: "tenant", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }] });
  const assistantTools = createCrmToolsWithOptions(adapter, approvals, { requestRepository: repository });
  const catalog = await assistantTools.find((tool) => tool.name === "listCatalogItems").handler(tenant, { q: "ACCEPT-001", visibleOnly: true });
  assert.equal(catalog.result.items[0].id, "catalog_q");

  // Role enforcement is fail-closed before a technician could mutate configured property assets.
  assert.throws(() => assertAccessRole({ tenantId: tenant.id, tenantUserId: "tech_q", role: "TECHNICIAN", accessKind: "internal" }, ["OWNER", "OFFICE_ADMIN"]), /cannot perform/i);
  const configuredProperty = await repository.upsertProperty({ ...property, assets: [{ id: "asset_q", kind: "pump", label: "Primary pump", fields: { model: "Q-100" } }] });
  assert.equal((await repository.listProperties(tenant.id))[0].assets[0].fields.model, "Q-100");
  assert.equal(configuredProperty.tenantId, tenant.id);

  const agreements = new AgreementService(new MemoryAgreementRepository(), () => new Date("2026-08-09T00:00:00.000Z"));
  const agreement = await agreements.create({ tenantId: tenant.id, clientId: client.id, propertyId: property.id, title: "Acceptance maintenance", kind: "maintenance_plan", cadence: "quarterly", startDate: "2026-08-09T00:00:00.000Z", lineItems: [{ description: "Inspection", quantity: 1, unitPrice: 250 }] }, "owner_q");
  assert.equal((await agreements.transition(tenant.id, agreement.id, "activated", "owner_q")).status, "active");
  assert.equal(await agreements.get("other_tenant", agreement.id), null);

  const evidenceRepository = new MemoryMediaRepository();
  const fieldDocs = new FieldDocsService({ mediaRepository: evidenceRepository });
  const form = await fieldDocs.createForm({ tenantId: tenant.id, slug: "acceptance-closeout", title: "Acceptance closeout", active: true, fields: [{ id: "passed", label: "Passed", type: "boolean", required: true }] });
  const response = await fieldDocs.saveFormResponse({ tenantId: tenant.id, formId: form.id, values: { passed: true }, links: { clientId: client.id, propertyId: property.id, jobId: job.id }, submit: true, actorId: "tech_q" });
  assert.deepEqual((await evidenceRepository.listFormAudit(tenant.id, response.id)).map((entry) => entry.action), ["submitted"]);
  assert.equal((await evidenceRepository.listFormResponses("other_tenant")).length, 0);

  const costing = new JobCostingService(new MemoryJobCostingRepository(), () => new Date("2026-08-09T00:00:00.000Z"));
  await costing.create({ tenantId: tenant.id, jobId: job.id, category: "labor", source: "manual", amount: 100, occurredAt: "2026-08-09T00:00:00.000Z" }, "owner_q");
  assert.equal((await costing.summarize(tenant.id, job.id, [invoice])).actualGrossProfit, 150);

  let delivered = false;
  const commsTools = createCommsNexiTools({ tenantId: tenant.id, readAdapters: new Map(), sendAdapter: { mailbox: "isolated-send", async sendEmail() { delivered = true; } } }, approvals);
  const draft = await commsTools.find((tool) => tool.name === "draftEmail").handler(tenant, { to: ["client@example.test"], subject: "Acceptance draft", bodyText: "Awaiting approval." });
  assert.equal(draft.result.approval.status, "pending");
  assert.equal(delivered, false);

  const portal = new PortalHubService({ crmRepository: repository, ledgerRepository: new MemoryLedgerRepository(), schedulingRepository: new InMemorySchedulingRepository(), repository: new InMemoryPortalHubRepository(), fieldDocsRepository: evidenceRepository, eventBus: new InMemoryEventBus(), publicBaseUrl: "http://127.0.0.1:0" });
  const link = await portal.issueMagicLink({ tenantId: tenant.id, clientId: client.id, propertyId: property.id, target: "client@example.test" });
  const session = await portal.consumeMagicLink({ tenantId: tenant.id, sessionId: link.session.id, token: link.token });
  const snapshot = await portal.buildSnapshot({ tenantId: tenant.id, session });
  assert.equal(snapshot.client.id, client.id);
  assert.deepEqual(snapshot.properties.map((entry) => entry.id), [property.id]);
  assert.equal(snapshot.invoices.length, 0, "an invoice without a client portal token is not exposed");
  assert.equal((await portal.authenticateCookie({ tenantId: "other_tenant", cookieHeader: portal.cookieHeader(session, link.token) })), null);
});
