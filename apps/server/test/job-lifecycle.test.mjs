import test from "node:test";
import assert from "node:assert/strict";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository,
  jobSchema
} from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { createApprovalNexiTools } from "../dist/approval/nexiTools.js";
import { assertAccessRole } from "../dist/auth/accessContext.js";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { JobLifecycleService } from "../dist/crm/jobLifecycle.js";
import { MemoryJobLifecycleRepository } from "../dist/crm/jobLifecycleRepository.js";
import { createCrmToolsWithOptions } from "../dist/crm/nexiTools.js";
import { runExplicitLocalToolLoop } from "../dist/nexi/nexiService.js";
import { InMemorySchedulingRepository } from "../dist/scheduling/repository.js";
import { createSchedulingNexiTools } from "../dist/scheduling/nexiTools.js";

function tenant() {
  return {
    id: "aquatrace",
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "native", email: "gmail_relay" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

function clientRecord() {
  return {
    id: "client_1",
    tenantId: "aquatrace",
    name: "Deborah Justice",
    emails: ["deborah@example.test"],
    phones: ["8645551212"],
    tags: [],
    consent: { email: true, sms: true },
    communicationSettings: {
      quotesAndInvoices: "both",
      jobReminders: "both",
      jobClosureFollowUps: "email",
      reviewRequests: "email",
      smsDefaultMode: "one_way"
    }
  };
}

function propertyRecord() {
  return {
    id: "property_1",
    tenantId: "aquatrace",
    clientId: "client_1",
    label: "Deborah Justice residence",
    address: {
      street1: "181 Isbell Road",
      city: "Fair Play",
      province: "SC",
      postalCode: "29643",
      country: "US"
    },
    access: {
      gateCode: "4421",
      accessNotes: "Use the side gate by the equipment pad."
    },
    assets: []
  };
}

function makeFixture(records = {}) {
  const repository = new MemoryNativeCrmRepository({
    clients: [clientRecord()],
    properties: [propertyRecord()],
    ...records
  });
  const schedulingRepository = new InMemorySchedulingRepository();
  const lifecycleRepository = new MemoryJobLifecycleRepository();
  const sentEmails = [];
  const sentSms = [];
  const emittedEvents = [];
  const platformRepository = {
    async listTenantUsers() {
      return [
        { id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" },
        { id: "office_1", tenantId: "aquatrace", displayName: "Catherine", role: "OFFICE_ADMIN", active: true, email: "office@example.test" },
        { id: "tech_1", tenantId: "aquatrace", displayName: "Logan", role: "TECHNICIAN", active: true, email: "logan@example.test" }
      ];
    }
  };
  const commsRail = {
    tenantId: "aquatrace",
    readAdapters: new Map(),
    sendAdapter: {
      mailbox: "nexi",
      async sendEmail(message) {
        sentEmails.push(message);
        return { provider: "test", id: `email_${sentEmails.length}`, acceptedAt: "2026-07-13T00:00:00.000Z" };
      }
    },
    async sendSms(message) {
      sentSms.push(message);
      return { provider: "test", id: `sms_${sentSms.length}`, acceptedAt: "2026-07-13T00:00:00.000Z" };
    }
  };
  const eventBus = {
    async emit(event) {
      emittedEvents.push(event);
    }
  };
  const jobLifecycleService = new JobLifecycleService({
    crmRepository: repository,
    schedulingRepository,
    lifecycleRepository,
    platformRepository,
    commsRail,
    eventBus
  });
  return {
    repository,
    schedulingRepository,
    lifecycleRepository,
    jobLifecycleService,
    sentEmails,
    sentSms,
    emittedEvents
  };
}

test("legacy job schema and in-memory native repository normalize stored jobs onto the new lifecycle rail", async () => {
  assert.equal(jobSchema.parse({
    id: "job_schema_lead",
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "lead",
    title: "Legacy lead",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 }
  }).status, "Unscheduled");
  assert.equal(jobSchema.parse({
    id: "job_schema_complete",
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "complete",
    title: "Legacy complete",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 }
  }).status, "Action Required");

  const repository = new MemoryNativeCrmRepository({
    jobs: [{
      id: "job_legacy",
      tenantId: "aquatrace",
      clientId: "client_1",
      status: "scheduled",
      title: "Legacy scheduled job",
      startAt: "2026-07-20T14:00:00.000Z",
      endAt: "2026-07-20T16:00:00.000Z",
      lineItems: [],
      totals: { subtotal: 0, tax: 0, total: 0 }
    }]
  });

  const jobs = await repository.listJobs("aquatrace");
  assert.equal(jobs[0].status, "Upcoming");
});

test("closeout delivery records a separate email attempt against the saved artifact selection", async () => {
  const fixture = makeFixture();
  const job = await fixture.jobLifecycleService.createJob({ tenantId: "aquatrace", clientId: "client_1", propertyId: "property_1", title: "Closeout delivery test" });
  const artifact = { artifactId: "nexdocs_visit_file_1", source: "nexdocs", kind: "upload", label: "Inspection.pdf", fileName: "Inspection.pdf", visitId: "visit_1" };
  const selected = [{ artifactId: artifact.artifactId, source: artifact.source, kind: artifact.kind, visitId: artifact.visitId }];
  const saved = await fixture.jobLifecycleService.saveCustomerDocumentPackageSelection({ tenantId: "aquatrace", jobId: job.id, actorId: "owner_1", selectedArtifactRefs: selected });
  assert.equal(saved.deliveryAttemptIds.length, 0);
  const before = await fixture.jobLifecycleService.prepareCustomerDocumentPackageDelivery({ tenantId: "aquatrace", jobId: job.id, artifacts: [artifact] });
  assert.equal(before.selectedArtifacts[0].visitId, "visit_1");
  assert.equal(before.sms.available, false);
  const after = await fixture.jobLifecycleService.sendCustomerDocumentPackageDelivery({ tenantId: "aquatrace", jobId: job.id, actorId: "owner_1", recipient: "staging@example.test", subject: "Closeout ready", bodyText: "Your package is ready.", selectedArtifactRefs: selected, artifacts: [artifact] });
  assert.equal(fixture.sentEmails.length, 1);
  assert.equal(fixture.sentEmails[0].attachments[0].filename, `closeout-package-${job.id}.txt`);
  assert.equal(after.attempts.length, 1);
  assert.equal(after.attempts[0].recipient, "staging@example.test");
  assert.equal(after.package.deliveryStatus, "sent");
  assert.equal(after.package.selectedArtifactRefs[0].visitId, "visit_1");
  assert.ok(fixture.emittedEvents.some((event) => event.type === "closeout.package_delivery_sent"));
});

test("closeout delivery refuses a direct send when the tenant template disables email", async () => {
  const fixture = makeFixture();
  const settings = await fixture.repository.getCrmSettings("aquatrace");
  await fixture.repository.saveCrmSettings({
    ...settings,
    communicationTemplates: settings.communicationTemplates.map((template) => template.category === "customer_document_package" ? { ...template, emailEnabled: false } : template)
  });
  const job = await fixture.jobLifecycleService.createJob({ tenantId: "aquatrace", clientId: "client_1", title: "Disabled closeout delivery" });
  const artifact = { artifactId: "nexdocs_disabled_file", source: "nexdocs", kind: "upload", label: "Inspection.pdf", fileName: "Inspection.pdf" };
  const selected = [{ artifactId: artifact.artifactId, source: artifact.source, kind: artifact.kind }];
  await fixture.jobLifecycleService.saveCustomerDocumentPackageSelection({ tenantId: "aquatrace", jobId: job.id, actorId: "owner_1", selectedArtifactRefs: selected });
  await assert.rejects(() => fixture.jobLifecycleService.sendCustomerDocumentPackageDelivery({ tenantId: "aquatrace", jobId: job.id, actorId: "owner_1", recipient: "staging@example.test", subject: "Closeout ready", bodyText: "Your package is ready.", selectedArtifactRefs: selected, artifacts: [artifact] }), /disabled/i);
  assert.equal(fixture.sentEmails.length, 0);
  assert.equal((await fixture.lifecycleRepository.listCustomerDocumentPackageDeliveryAttempts("aquatrace", job.id)).length, 0);
});

test("request and quote conversions land as Unscheduled and invoice reminders clear only by invoice or dismissal", async () => {
  const fixture = makeFixture();

  const fromRequest = await fixture.jobLifecycleService.createJob({
    tenantId: "aquatrace",
    clientId: "client_1",
    requestId: "request_1",
    title: "Request conversion"
  });
  const fromQuote = await fixture.jobLifecycleService.createJob({
    tenantId: "aquatrace",
    clientId: "client_1",
    quoteId: "quote_1",
    title: "Quote conversion"
  });

  assert.equal(fromRequest.status, "Unscheduled");
  assert.equal(fromQuote.status, "Unscheduled");

  const visit = await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: fromQuote.id,
    title: "Leak detection visit",
    start: "2026-07-20T14:00:00.000Z",
    end: "2026-07-20T16:00:00.000Z",
    assignedTo: ["tech_1"]
  });
  const completed = await fixture.jobLifecycleService.completeVisit({
    tenantId: "aquatrace",
    visitId: visit.id,
    actorId: "tech_1"
  });
  assert.equal(completed.visit.status, "complete");
  assert.equal(completed.actionAlert?.status, "pending");

  const closed = await fixture.jobLifecycleService.performJobAction({
    tenantId: "aquatrace",
    jobId: fromQuote.id,
    action: "close",
    actorId: "owner_1"
  });
  assert.equal(closed.reminder?.status, "pending");
  assert.equal(closed.job.status, "Requires Invoicing");

  const invoiced = await fixture.jobLifecycleService.performJobAction({
    tenantId: "aquatrace",
    jobId: fromQuote.id,
    action: "invoice",
    actorId: "owner_1"
  });
  assert.equal(invoiced.invoice?.jobId, fromQuote.id);
  assert.equal(invoiced.job.status, "Archived");

  const invoiceResolved = (await fixture.lifecycleRepository.listInvoiceReminders("aquatrace"))
    .find((record) => record.jobId === fromQuote.id);
  assert.equal(invoiceResolved?.resolvedByAction, "invoice_created");

  await fixture.jobLifecycleService.performJobAction({
    tenantId: "aquatrace",
    jobId: fromRequest.id,
    action: "close",
    actorId: "owner_1"
  });
  const dismissed = await fixture.jobLifecycleService.performJobAction({
    tenantId: "aquatrace",
    jobId: fromRequest.id,
    action: "dismiss_invoice_reminder",
    actorId: "owner_1"
  });
  assert.equal(dismissed.job.status, "Archived");
  const dismissedReminder = (await fixture.lifecycleRepository.listInvoiceReminders("aquatrace"))
    .find((record) => record.jobId === fromRequest.id);
  assert.equal(dismissedReminder?.status, "dismissed");
});

test("moving a visit cancels old reminder timers and creates a fresh pair for the new slot", async () => {
  const fixture = makeFixture();
  const job = await fixture.jobLifecycleService.createJob({
    tenantId: "aquatrace",
    clientId: "client_1",
    title: "Reschedule check"
  });

  const visit = await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: job.id,
    title: "First slot",
    start: "2026-07-20T14:00:00.000Z",
    end: "2026-07-20T16:00:00.000Z",
    assignedTo: ["tech_1"]
  });

  const before = (await fixture.lifecycleRepository.listVisitReminders("aquatrace"))
    .filter((record) => record.visitId === visit.id);
  assert.equal(before.length, 2);
  assert.equal(before.every((record) => record.status === "pending"), true);

  await fixture.jobLifecycleService.moveVisit({
    tenantId: "aquatrace",
    visitId: visit.id,
    start: "2026-07-21T15:30:00.000Z",
    end: "2026-07-21T17:30:00.000Z"
  });

  const after = (await fixture.lifecycleRepository.listVisitReminders("aquatrace"))
    .filter((record) => record.visitId === visit.id);
  assert.equal(after.filter((record) => record.status === "cancelled").length, 2);
  assert.equal(after.filter((record) => record.status === "pending").length, 2);
  assert.equal(after.some((record) => record.status === "pending" && record.dueAt === "2026-07-21T14:30:00.000Z"), true);
  assert.equal(after.some((record) => record.status === "pending" && record.dueAt === "2026-07-20T15:30:00.000Z"), true);
});

test("due visit reminders auto-send email and sms with technician and access-note context", async () => {
  const fixture = makeFixture();
  const job = await fixture.jobLifecycleService.createJob({
    tenantId: "aquatrace",
    clientId: "client_1",
    propertyId: "property_1",
    title: "Reminder copy check",
    intake: {
      narrative: "Gate access required.",
      fieldValues: [],
      fieldIndex: { gate_code: "4421" }
    }
  });

  await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: job.id,
    title: "Reminder visit",
    start: "2026-07-20T14:00:00.000Z",
    end: "2026-07-20T16:00:00.000Z",
    assignedTo: ["tech_1"]
  });

  await fixture.jobLifecycleService.listJobs("aquatrace", "2026-07-20T13:10:00.000Z");

  assert.equal(fixture.sentEmails.length, 1);
  assert.equal(fixture.sentSms.length, 1);
  assert.match(fixture.sentEmails[0].bodyText, /Gate code 4421/i);
  assert.match(fixture.sentEmails[0].bodyText, /Use the side gate by the equipment pad/i);
  assert.match(fixture.sentEmails[0].bodyText, /Technician: Logan/i);
  assert.match(fixture.sentSms[0].body, /Gate code 4421/i);
  assert.match(fixture.sentSms[0].body, /Tech: Logan/i);
});

test("technicians can complete visits but stay blocked from office-only close and invoice authority", async () => {
  const technician = {
    tenantId: "aquatrace",
    tenantUserId: "tech_1",
    role: "TECHNICIAN",
    accessKind: "internal"
  };

  assert.equal(assertAccessRole(technician, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], "completeJobVisit").role, "TECHNICIAN");
  assert.throws(
    () => assertAccessRole(technician, ["OWNER", "OFFICE_ADMIN"], "performJobAction"),
    /cannot perform that action/i
  );
});

test("Nexi job tools create, read, revise, and execute lifecycle actions through chat-native approvals", async () => {
  const fixture = makeFixture();
  const provider = new NativeAdapter(fixture.repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider, fixture.jobLifecycleService)
  );
  const tools = [
    ...createCrmToolsWithOptions(provider, approvalQueue, {
      requestRepository: fixture.repository,
      jobLifecycleService: fixture.jobLifecycleService
    }),
    ...createSchedulingNexiTools({
      repository: fixture.schedulingRepository,
      approvalQueue,
      jobLifecycleService: fixture.jobLifecycleService
    }),
    ...createApprovalNexiTools({
      approvalQueue,
      actorId: "owner_1",
      crmRepository: fixture.repository,
      jobLifecycleService: fixture.jobLifecycleService
    })
  ];

  const createTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "create a job for Deborah Justice" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(createTurn.toolRuns[0].name, "createJob");
  assert.match(createTurn.answer, /You requested create job/i);
  assert.match(createTurn.answer, /Is this correct/i);

  const reviseTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "create a job for Deborah Justice" },
      { role: "assistant", content: createTurn.answer },
      { role: "user", content: "make changes. change the title to Leak follow-up revised" }
    ],
    pendingApproval: createTurn.pendingApproval,
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.match(reviseTurn.answer, /You requested create job/i);
  assert.match(reviseTurn.answer, /Leak follow-up revised/i);

  const approveCreateTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: "create a job for Deborah Justice" },
      { role: "assistant", content: reviseTurn.answer },
      { role: "user", content: "yes" }
    ],
    pendingApproval: reviseTurn.pendingApproval,
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(approveCreateTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approveCreateTurn.answer, /Approved and executed Leak follow-up revised/i);
  const createdJob = (await fixture.repository.listJobs("aquatrace"))[0];
  assert.ok(createdJob?.id);

  const listTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "list jobs for Deborah Justice" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(listTurn.toolRuns[0].name, "listJobs");
  assert.match(listTurn.answer, /Found 1 job/i);

  const detailTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: `what is the detail for ${createdJob.id}` }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(detailTurn.toolRuns[0].name, "getJobDetail");
  assert.match(detailTurn.answer, /Leak follow-up revised/i);

  const actionTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: `close and invoice ${createdJob.id}` }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(actionTurn.toolRuns[0].name, "queueJobAction");
  assert.match(actionTurn.answer, /You requested close and invoice job/i);
  assert.match(actionTurn.answer, /Job: Leak follow-up revised/i);

  const approveActionTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: `close and invoice ${createdJob.id}` },
      { role: "assistant", content: actionTurn.answer },
      { role: "user", content: "yes" }
    ],
    pendingApproval: actionTurn.pendingApproval,
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(approveActionTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approveActionTurn.answer, /Approved and executed Leak follow-up revised/i);
  assert.equal((await fixture.repository.listInvoices("aquatrace")).length, 1);
});
