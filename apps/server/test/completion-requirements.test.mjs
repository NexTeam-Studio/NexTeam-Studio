import test from "node:test";
import assert from "node:assert/strict";
import { MemoryNativeCrmRepository, defaultCrmSettings } from "@nexteam/providers";
import { InMemoryEventBus } from "@nexteam/core";
import { JobLifecycleService } from "../dist/crm/jobLifecycle.js";
import { MemoryJobLifecycleRepository } from "../dist/crm/jobLifecycleRepository.js";
import { InMemorySchedulingRepository } from "../dist/scheduling/repository.js";
import { MemoryLedgerRepository } from "../dist/crm/ledgerRepository.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { InMemoryPortalHubRepository } from "../dist/modules/nexportal/components/portalCore/server/portalHubRepository.js";
import { PortalHubService } from "../dist/modules/nexportal/components/portalCore/server/portalHubService.js";
import { renderPortalHomeHtml } from "../dist/modules/nexportal/components/portalCore/server/portalHubHtml.js";

function fixture({ evidence, requirements = { checklistRequired: true, photosRequired: true, reportRequired: true, signatureRequired: true } } = {}) {
  const repository = new MemoryNativeCrmRepository({ clients: [{ id: "client_1", tenantId: "tenant_1", name: "Placeholder Client", emails: [], phones: [], tags: [], consent: { email: false, sms: false }, communicationSettings: { quotesAndInvoices: "email", jobReminders: "email", jobClosureFollowUps: "email", reviewRequests: "email", smsDefaultMode: "one_way" } }] });
  const lifecycleRepository = new MemoryJobLifecycleRepository();
  const service = new JobLifecycleService({
    crmRepository: repository,
    schedulingRepository: new InMemorySchedulingRepository(),
    lifecycleRepository,
    completionRequirementsForJob: async () => ({ requirements, evidence: evidence ?? { checklistComplete: false, photosPresent: false, reportPresent: false, signaturePresent: false } })
  });
  return { repository, lifecycleRepository, service };
}

test("tenant-wide completion settings persist independently for each tenant", async () => {
  const tenantA = defaultCrmSettings("tenant_a");
  const tenantB = defaultCrmSettings("tenant_b");
  const repository = new MemoryNativeCrmRepository({ crmSettings: [tenantA, tenantB] });
  await repository.saveCrmSettings({ ...tenantA, completionRequirements: { checklistRequired: true, photosRequired: true, reportRequired: false, signatureRequired: false } });
  assert.deepEqual((await repository.getCrmSettings("tenant_a")).completionRequirements, { checklistRequired: true, photosRequired: true, reportRequired: false, signatureRequired: false });
  assert.deepEqual((await repository.getCrmSettings("tenant_b")).completionRequirements, { checklistRequired: false, photosRequired: false, reportRequired: false, signatureRequired: false });
});

test("tenant-wide completion defaults return a specific live missing-items list without disabling the close action", async () => {
  const subject = fixture();
  const job = await subject.service.createJob({ tenantId: "tenant_1", clientId: "client_1", title: "Evidence-required job", assignedOwnerId: "owner_1" });
  const gate = await subject.service.completionStatus("tenant_1", job.id);
  assert.deepEqual(gate.missing, ["Checklist required", "Photos required", "Report required", "Signature required"]);
  await assert.rejects(() => subject.service.performJobAction({ tenantId: "tenant_1", jobId: job.id, action: "close", actorId: "owner_1" }), /Completion requirements are not met: Checklist required, Photos required, Report required, Signature required/);
  assert.equal((await subject.repository.listJobs("tenant_1")).find((entry) => entry.id === job.id)?.closedAt, undefined);
});

test("completion indicator re-resolves actual evidence state and removes fulfilled items without a page reload", async () => {
  let evidence = { checklistComplete: false, photosPresent: false, reportPresent: false, signaturePresent: false };
  const subject = fixture({ evidence: undefined });
  const dynamic = new JobLifecycleService({
    crmRepository: subject.repository,
    schedulingRepository: new InMemorySchedulingRepository(),
    lifecycleRepository: subject.lifecycleRepository,
    completionRequirementsForJob: async () => ({ requirements: { checklistRequired: true, photosRequired: true, reportRequired: true, signatureRequired: true }, evidence })
  });
  const job = await dynamic.createJob({ tenantId: "tenant_1", clientId: "client_1", title: "Evidence-complete job", assignedOwnerId: "owner_1" });
  assert.deepEqual((await dynamic.completionStatus("tenant_1", job.id)).missing, ["Checklist required", "Photos required", "Report required", "Signature required"]);
  evidence = { checklistComplete: true, photosPresent: true, reportPresent: true, signaturePresent: true };
  assert.deepEqual((await dynamic.completionStatus("tenant_1", job.id)).missing, []);
  const closed = await dynamic.performJobAction({ tenantId: "tenant_1", jobId: job.id, action: "close", actorId: "owner_1" });
  assert.equal(closed.job.status, "Requires Invoicing");
});

test("only the assigned job owner can override with a required reason and internal audit record", async () => {
  const subject = fixture();
  const job = await subject.service.createJob({ tenantId: "tenant_1", clientId: "client_1", title: "Override job", assignedOwnerId: "owner_1" });
  await assert.rejects(() => subject.service.performJobAction({ tenantId: "tenant_1", jobId: job.id, action: "close", actorId: "owner_1", completionOverrideReason: " " }), /Completion requirements are not met/);
  await assert.rejects(() => subject.service.performJobAction({ tenantId: "tenant_1", jobId: job.id, action: "close", actorId: "other_user", completionOverrideReason: "Equipment was inaccessible." }), /Only the user assigned to this job/);
  await subject.service.performJobAction({ tenantId: "tenant_1", jobId: job.id, action: "close", actorId: "owner_1", completionOverrideReason: "Equipment was inaccessible." });
  const override = (await subject.lifecycleRepository.listLifecycleEvents("tenant_1", job.id)).find((event) => event.type === "job.completion_overridden");
  assert.deepEqual(override?.payload, { action: "completion.override", actorId: "owner_1", target: job.id, detail: "Equipment was inaccessible.", missing: ["Checklist required", "Photos required", "Report required", "Signature required"] });
});

test("completion override audit data is internal-only and cannot enter a NexPortal snapshot", async () => {
  const client = { id: "client_portal", tenantId: "tenant_portal", name: "Portal placeholder", emails: ["portal@example.test"], phones: [], tags: [], consent: { email: true, sms: false }, communicationSettings: { quotesAndInvoices: "email", jobReminders: "email", jobClosureFollowUps: "email", reviewRequests: "email", smsDefaultMode: "one_way" } };
  const repository = new MemoryNativeCrmRepository({ clients: [client], jobs: [{ id: "job_portal", tenantId: "tenant_portal", clientId: client.id, status: "Unscheduled", title: "Portal-isolated job", lineItems: [], totals: { subtotal: 0, tax: 0, total: 0 } }] });
  const eventBus = new InMemoryEventBus();
  await eventBus.emit({ tenantId: "tenant_portal", type: "job.completion_overridden", payload: { action: "completion.override", actorId: "owner_1", target: "job_portal", detail: "Internal reason", missing: ["Photos required"] } });
  const portal = new PortalHubService({ crmRepository: repository, ledgerRepository: new MemoryLedgerRepository(), schedulingRepository: new InMemorySchedulingRepository(), repository: new InMemoryPortalHubRepository(), fieldDocsRepository: new MemoryMediaRepository(), eventBus, publicBaseUrl: "http://127.0.0.1:0" });
  const link = await portal.issueMagicLink({ tenantId: "tenant_portal", clientId: client.id, target: "portal@example.test" });
  const session = await portal.consumeMagicLink({ tenantId: "tenant_portal", sessionId: link.session.id, token: link.token });
  const snapshot = await portal.buildSnapshot({ tenantId: "tenant_portal", session });
  assert.equal(snapshot.portalActivity.some((entry) => entry.detail.includes("Internal reason") || entry.title.includes("completion overridden")), false);
});

test("request notes expose only client-facing notes in NexPortal", async () => {
  const client = { id: "client_request_notes", tenantId: "tenant_request_notes", name: "Portal request client", emails: ["portal-request@example.test"], phones: [], tags: [], consent: { email: true, sms: false }, communicationSettings: { quotesAndInvoices: "email", jobReminders: "email", jobClosureFollowUps: "email", reviewRequests: "email", smsDefaultMode: "one_way" } };
  const request = {
    id: "request_notes_1",
    tenantId: "tenant_request_notes",
    source: "website_form",
    status: "new",
    subject: "Request note visibility",
    clientName: client.name,
    narrative: "Request intake",
    consent: { email: true, sms: false },
    intake: { fieldValues: [], fieldIndex: {} },
    match: { type: "none", reviewRequired: false },
    selectedClientId: client.id,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    notes: [
      { id: "note_internal", body: "Internal dispatch instruction", visibility: "internal", authorId: "owner_1", createdAt: "2026-09-01T01:00:00.000Z" },
      { id: "note_client", body: "Your assessment is being scheduled.", visibility: "client", authorId: "owner_1", createdAt: "2026-09-01T02:00:00.000Z" }
    ]
  };
  const repository = new MemoryNativeCrmRepository({ clients: [client], requests: [request] });
  const portal = new PortalHubService({ crmRepository: repository, ledgerRepository: new MemoryLedgerRepository(), schedulingRepository: new InMemorySchedulingRepository(), repository: new InMemoryPortalHubRepository(), fieldDocsRepository: new MemoryMediaRepository(), eventBus: new InMemoryEventBus(), publicBaseUrl: "http://127.0.0.1:0" });
  const link = await portal.issueMagicLink({ tenantId: "tenant_request_notes", clientId: client.id, target: "portal-request@example.test" });
  const session = await portal.consumeMagicLink({ tenantId: "tenant_request_notes", sessionId: link.session.id, token: link.token });
  const snapshot = await portal.buildSnapshot({ tenantId: "tenant_request_notes", session });
  assert.deepEqual(snapshot.clientFacingRequestNotes.map((note) => note.body), ["Your assessment is being scheduled."]);
  const html = renderPortalHomeHtml(snapshot);
  assert.match(html, /Your assessment is being scheduled\./);
  assert.doesNotMatch(html, /Internal dispatch instruction/);
});
