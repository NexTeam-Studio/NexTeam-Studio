import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository,
  InMemoryEventBus
} from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { createApprovalNexiTools } from "../dist/approval/nexiTools.js";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { JobLifecycleService } from "../dist/crm/jobLifecycle.js";
import { MemoryJobLifecycleRepository } from "../dist/crm/jobLifecycleRepository.js";
import { LedgerService } from "../dist/crm/ledgerFoundation.js";
import { MemoryLedgerRepository } from "../dist/crm/ledgerRepository.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { createCrmToolsWithOptions } from "../dist/crm/nexiTools.js";
import { InMemoryNotificationStateRepository } from "../dist/crm/notificationStateRepository.js";
import { OperationsHubService } from "../dist/crm/operationsHub.js";
import { registerCrmRoutes } from "../dist/crm/routes.js";
import { runExplicitLocalToolLoop } from "../dist/nexi/nexiService.js";
import { InMemorySchedulingRepository } from "../dist/scheduling/repository.js";

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

function access(role, tenantUserId) {
  return {
    tenantId: "aquatrace",
    tenantUserId,
    role,
    accessKind: "internal"
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

function lineItems(items) {
  return items.map((item, index) => ({
    id: item.id ?? `line_${index + 1}`,
    source: item.source ?? "custom",
    code: item.code ?? `CODE-${index + 1}`,
    name: item.name,
    description: item.description ?? `${item.name} description`,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: Number((item.quantity * item.unitPrice).toFixed(2))
  }));
}

function totals(total, tax = 0) {
  return {
    subtotal: Number((total - tax).toFixed(2)),
    tax,
    total
  };
}

function approvalRules() {
  return {
    requireSignature: false,
    requireDeposit: false,
    requireCardOnFile: false
  };
}

function intakeField(key, label, group, type, value, visibility = {}) {
  return {
    key,
    label,
    group,
    type,
    value,
    visibility: {
      request: visibility.request ?? true,
      quote: visibility.quote ?? true,
      job: visibility.job ?? true,
      visit: visibility.visit ?? true,
      invoice: visibility.invoice ?? true
    }
  };
}

function intakeSnapshot(overrides = {}) {
  const fieldValues = [
    intakeField("gate_code", "Gate code", "safety", "text", "4421"),
    intakeField("pet_present", "Pet present", "safety", "boolean", true),
    intakeField("pool_configuration", "Pool configuration", "pool", "select", "pool_and_spa"),
    intakeField("issue_summary", "Issue summary", "service", "textarea", "Leak suspected at the skimmer throat.")
  ];
  return {
    narrative: "Gate code 4421. Pet present. Pool and spa combo.",
    fieldValues,
    fieldIndex: Object.fromEntries(fieldValues.map((field) => [field.key, field.value])),
    ...overrides
  };
}

function requestRecord(overrides = {}) {
  return {
    id: "request_1",
    tenantId: "aquatrace",
    number: "REQ-1001",
    formId: "request_form_aquatrace_service",
    formSlug: "service-request",
    source: "website_form",
    status: "new",
    subject: "Pool leak check",
    clientName: "Deborah Justice",
    email: "deborah@example.test",
    phone: "8645551212",
    propertyAddress: {
      street1: "181 Isbell Road",
      city: "Fair Play",
      province: "SC",
      postalCode: "29643",
      country: "US"
    },
    narrative: "Check skimmer leak, gate code 4421, dog in yard.",
    consent: { email: true, sms: true },
    intake: intakeSnapshot(),
    match: {
      matchedBy: "none",
      reviewRequired: false
    },
    createdAt: "2026-07-16T13:00:00.000Z",
    updatedAt: "2026-07-16T13:00:00.000Z",
    ...overrides
  };
}

function quoteRecord(overrides = {}) {
  return {
    id: "quote_1",
    tenantId: "aquatrace",
    number: "Q-1001",
    clientId: "client_1",
    requestId: "request_1",
    status: "approved",
    title: "Leak detection quote",
    lineItems: lineItems([{ name: "Leak detection", quantity: 1, unitPrice: 795, code: "LEAK" }]),
    totals: totals(795),
    approvalRules: approvalRules(),
    createdAt: "2026-07-16T13:10:00.000Z",
    updatedAt: "2026-07-16T13:10:00.000Z",
    ...overrides
  };
}

function invoiceRecord(overrides = {}) {
  return {
    id: "invoice_1",
    tenantId: "aquatrace",
    number: "INV-1001",
    clientId: "client_1",
    jobId: "job_1",
    quoteId: "quote_1",
    requestId: "request_1",
    status: "awaiting_payment",
    title: "Leak detection invoice",
    lineItems: lineItems([{ name: "Leak detection", quantity: 1, unitPrice: 795, code: "LEAK" }]),
    totals: totals(795),
    createdAt: "2026-07-16T14:10:00.000Z",
    updatedAt: "2026-07-16T14:10:00.000Z",
    ledger: {
      depositApplied: 0,
      creditApplied: 0,
      paymentApplied: 0,
      refundedAmount: 0,
      balanceDue: 795,
      overdue: false
    },
    ...overrides
  };
}

function createFixture(records = {}) {
  const repository = new MemoryNativeCrmRepository({
    clients: [clientRecord()],
    properties: [propertyRecord()],
    ...records
  });
  const schedulingRepository = new InMemorySchedulingRepository();
  const lifecycleRepository = new MemoryJobLifecycleRepository();
  const ledgerRepository = new MemoryLedgerRepository();
  const notificationStateRepository = new InMemoryNotificationStateRepository();
  const mediaRepository = new MemoryMediaRepository();
  const sentEmails = [];
  const sentSms = [];
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
        return { provider: "test", id: `email_${sentEmails.length}`, acceptedAt: "2026-07-16T00:00:00.000Z" };
      }
    },
    async sendSms(message) {
      sentSms.push(message);
      return { provider: "test", id: `sms_${sentSms.length}`, acceptedAt: "2026-07-16T00:00:00.000Z" };
    }
  };
  const eventBus = new InMemoryEventBus();
  const ledgerService = new LedgerService({
    crmRepository: repository,
    ledgerRepository,
    commsRail,
    eventBus
  });
  const jobLifecycleService = new JobLifecycleService({
    crmRepository: repository,
    schedulingRepository,
    lifecycleRepository,
    platformRepository,
    commsRail,
    eventBus,
    ledgerService
  });
  const operationsHubService = new OperationsHubService({
    crmRepository: repository,
    schedulingRepository,
    lifecycleRepository,
    jobLifecycleService,
    eventBus,
    notificationStateRepository,
    mediaRepository,
    platformRepository
  });
  const provider = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider, jobLifecycleService, ledgerService)
  );
  return {
    repository,
    schedulingRepository,
    lifecycleRepository,
    ledgerRepository,
    notificationStateRepository,
    mediaRepository,
    platformRepository,
    commsRail,
    sentEmails,
    sentSms,
    eventBus,
    ledgerService,
    jobLifecycleService,
    operationsHubService,
    provider,
    approvalQueue
  };
}

function toolByName(tools, name) {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `Expected tool ${name} to exist.`);
  return tool;
}

async function createJob(fixture, input) {
  return fixture.jobLifecycleService.createJob({
    tenantId: "aquatrace",
    clientId: "client_1",
    propertyId: "property_1",
    title: input.title,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.quoteId ? { quoteId: input.quoteId } : {}),
    ...(input.intake ? { intake: input.intake } : {}),
    lineItems: lineItems(input.items ?? [{ name: input.title, quantity: 1, unitPrice: input.amount ?? 250, code: "WORK" }]),
    createdBy: input.createdBy ?? "owner_1"
  });
}

async function listen(app) {
  return new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
}

async function seedRequestQuoteJobInvoice(fixture) {
  const request = await fixture.repository.createRequest(requestRecord());
  const quote = await fixture.repository.createQuote(quoteRecord());
  const job = await createJob(fixture, {
    title: "Leak detection job",
    requestId: request.id,
    quoteId: quote.id,
    amount: 795
  });
  await fixture.repository.createInvoice(invoiceRecord({
    jobId: job.id,
    quoteId: quote.id,
    requestId: request.id
  }));
  return { request, quote, job };
}

async function emitCoverageEvents(fixture, ids) {
  const emitted = [];
  const push = async (type, payload) => {
    await fixture.eventBus.emit({
      tenantId: "aquatrace",
      type,
      payload
    });
    emitted.push(type);
  };
  await push("request.created", { requestId: ids.requestId, clientName: "Deborah Justice" });
  await push("request.converted_to_quote", { requestId: ids.requestId, quoteId: ids.quoteId });
  await push("request.converted_to_job", { requestId: ids.requestId, jobId: ids.jobId });
  await push("quote.created", { quoteId: ids.quoteId, createdBy: "owner_1" });
  await push("quote.sent", { quoteId: ids.quoteId });
  await push("quote.viewed", { quoteId: ids.quoteId });
  await push("quote.signed", { quoteId: ids.quoteId, signerName: "Deborah Justice" });
  await push("quote.approved", { quoteId: ids.quoteId, approvedBy: "owner_1" });
  await push("quote.deposit_paid", { quoteId: ids.quoteId, amount: 198.75 });
  await push("quote.converted_to_job", { quoteId: ids.quoteId, jobId: ids.jobId });
  await push("job.created", { jobId: ids.jobId, createdBy: "owner_1", title: "Leak detection job" });
  await push("job.state_changed", { jobId: ids.jobId, from: "Unscheduled", to: "Upcoming", reason: "visit_rescheduled" });
  await push("job.closed", { jobId: ids.jobId, closedBy: "owner_1" });
  await push("job.requires_invoicing_cleared", { jobId: ids.jobId, invoiceId: ids.invoiceId });
  await push("visit.booked", { jobId: ids.jobId, visitId: ids.visitId });
  await push("visit.booking_confirmation_sent", { jobId: ids.jobId, visitId: ids.visitId });
  await push("visit.completed", { jobId: ids.jobId, visitId: ids.visitId, completedBy: "tech_1" });
  await push("invoice.reminder_due", { jobId: ids.jobId, invoiceId: ids.invoiceId });
  await push("invoice.created", { invoiceId: ids.invoiceId, jobId: ids.jobId });
  await push("invoice.sent", { invoiceId: ids.invoiceId, jobId: ids.jobId });
  await push("invoice.paid", { invoiceId: ids.invoiceId, jobId: ids.jobId });
  await push("payment.created", { paymentId: ids.paymentId, invoiceId: ids.invoiceId, quoteId: ids.quoteId, amount: 795 });
  await push("payment.failed", { paymentId: `${ids.paymentId}_failed`, invoiceId: ids.invoiceId, amount: 795 });
  await push("refund.created", { paymentId: ids.paymentId, invoiceId: ids.invoiceId, amount: 125 });
  await push("invoice.voided", { invoiceId: ids.invoiceId });
  await push("invoice.bad_debt", { invoiceId: ids.invoiceId });
  await push("receipt.review_created", { invoiceId: ids.invoiceId, paymentId: ids.paymentId });
  return emitted;
}

test("operations hub activity feed renders every currently-defined lifecycle event type with deep-link targets", async () => {
  const fixture = createFixture();
  const { request, quote, job } = await seedRequestQuoteJobInvoice(fixture);
  const visit = await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: job.id,
    title: "Leak detection visit",
    start: "2026-07-20T14:00:00.000Z",
    end: "2026-07-20T16:00:00.000Z",
    assignedTo: ["tech_1"]
  });
  const invoice = (await fixture.repository.listInvoices("aquatrace"))[0];
  await emitCoverageEvents(fixture, {
    requestId: request.id,
    quoteId: quote.id,
    jobId: job.id,
    invoiceId: invoice.id,
    visitId: visit.id,
    paymentId: "payment_coverage_1"
  });

  const activity = await fixture.operationsHubService.getActivityFeed({
    access: access("OWNER", "owner_1"),
    limit: 100,
    referenceTime: "2026-07-16T16:00:00.000Z"
  });
  const coveredTypes = new Set(activity.map((entry) => entry.type));
  assert.deepEqual(coveredTypes, new Set([
    "request.created",
    "request.converted_to_quote",
    "request.converted_to_job",
    "quote.created",
    "quote.sent",
    "quote.viewed",
    "quote.signed",
    "quote.approved",
    "quote.deposit_paid",
    "quote.converted_to_job",
    "job.created",
    "job.state_changed",
    "job.closed",
    "job.requires_invoicing_cleared",
    "visit.booked",
    "visit.booking_confirmation_sent",
    "visit.completed",
    "invoice.reminder_due",
    "invoice.created",
    "invoice.sent",
    "invoice.paid",
    "payment.created",
    "payment.failed",
    "refund.created",
    "invoice.voided",
    "invoice.bad_debt",
    "receipt.review_created"
  ]));

  const requestEntry = activity.find((entry) => entry.type === "request.created");
  assert.equal(requestEntry?.target.module, "requests");
  assert.equal(requestEntry?.target.objectId, request.id);

  const quoteDepositEntry = activity.find((entry) => entry.type === "quote.deposit_paid");
  assert.equal(quoteDepositEntry?.target.module, "quotes");
  assert.equal(quoteDepositEntry?.reference, quote.number);

  const paymentEntry = activity.find((entry) => entry.type === "payment.created");
  assert.equal(paymentEntry?.target.module, "payments");
  assert.equal(paymentEntry?.target.objectId, "payment_coverage_1");

  const invoiceEntry = activity.find((entry) => entry.type === "invoice.paid");
  assert.equal(invoiceEntry?.target.module, "invoices");
  assert.equal(invoiceEntry?.target.objectId, invoice.id);

  const jobEntry = activity.find((entry) => entry.type === "visit.booking_confirmation_sent");
  assert.equal(jobEntry?.target.module, "jobs");
  assert.equal(jobEntry?.target.objectId, job.id);
});

test("documentation activity counts photo uploads and checklist completions with owner-wide and technician-self fencing", async () => {
  const fixture = createFixture();
  fixture.platformRepository.listTenantUsers = async () => ([
    { id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" },
    { id: "office_1", tenantId: "aquatrace", displayName: "Catherine", role: "OFFICE_ADMIN", active: true, email: "office@example.test" },
    { id: "tech_1", tenantId: "aquatrace", displayName: "Logan", role: "TECHNICIAN", active: true, email: "logan@example.test" },
    { id: "tech_2", tenantId: "aquatrace", displayName: "Mason", role: "TECHNICIAN", active: true, email: "mason@example.test" }
  ]);

  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "media.uploaded",
    payload: { mediaId: "media_1", capturedBy: "tech_1", jobId: "job_1" }
  });
  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "media.uploaded",
    payload: { mediaId: "media_2", capturedBy: "tech_1", jobId: "job_1" }
  });
  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "checklist.completed",
    payload: { checklistId: "checklist_1", completedBy: "tech_1", jobId: "job_1" }
  });
  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "media.uploaded",
    payload: { mediaId: "media_3", capturedBy: "tech_2", jobId: "job_2" }
  });

  const ownerSnapshot = await fixture.operationsHubService.getDocumentationActivity({
    access: access("OWNER", "owner_1")
  });
  assert.equal(ownerSnapshot.rows.length, 2);

  const loganRow = ownerSnapshot.rows.find((row) => row.tenantUserId === "tech_1");
  assert.ok(loganRow);
  assert.equal(loganRow.photoUploads, 2);
  assert.equal(loganRow.completedChecklists, 1);
  assert.equal(loganRow.totalDocumentationEvents, 3);

  const masonRow = ownerSnapshot.rows.find((row) => row.tenantUserId === "tech_2");
  assert.ok(masonRow);
  assert.equal(masonRow.photoUploads, 1);
  assert.equal(masonRow.completedChecklists, 0);
  assert.equal(masonRow.totalDocumentationEvents, 1);

  const technicianSnapshot = await fixture.operationsHubService.getDocumentationActivity({
    access: access("TECHNICIAN", "tech_1")
  });
  assert.equal(technicianSnapshot.rows.length, 1);
  assert.equal(technicianSnapshot.rows[0].tenantUserId, "tech_1");
  assert.equal(technicianSnapshot.rows[0].photoUploads, 2);
  assert.equal(technicianSnapshot.rows[0].completedChecklists, 1);
});

test("operations hub schedule, home queues, and activity stay role-aware for owner and technician", async () => {
  const fixture = createFixture();
  await fixture.repository.createRequest(requestRecord({
    id: "request_home_1",
    number: "REQ-1002",
    createdAt: "2026-07-16T09:00:00.000Z",
    updatedAt: "2026-07-16T09:00:00.000Z"
  }));
  await fixture.repository.createQuote(quoteRecord({
    id: "quote_home_1",
    number: "Q-1002",
    title: "Approved quote waiting for scheduling",
    totals: totals(1200),
    updatedAt: "2026-07-16T09:10:00.000Z"
  }));

  const unscheduledJob = await createJob(fixture, {
    title: "Unscheduled holding job",
    amount: 450
  });

  const actionJob = await createJob(fixture, {
    title: "Final visit review job",
    amount: 900
  });
  const actionVisit = await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: actionJob.id,
    title: "Final review visit",
    start: "2026-07-15T13:00:00.000Z",
    end: "2026-07-15T15:00:00.000Z",
    assignedTo: ["tech_1"]
  });
  await fixture.jobLifecycleService.completeVisit({
    tenantId: "aquatrace",
    visitId: actionVisit.id,
    actorId: "tech_1"
  });

  const invoicingJob = await createJob(fixture, {
    title: "Close without invoice job",
    amount: 1100
  });
  const invoicingVisit = await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: invoicingJob.id,
    title: "Closeout visit",
    start: "2026-07-15T09:00:00.000Z",
    end: "2026-07-15T11:00:00.000Z",
    assignedTo: ["tech_1"]
  });
  await fixture.jobLifecycleService.completeVisit({
    tenantId: "aquatrace",
    visitId: invoicingVisit.id,
    actorId: "tech_1"
  });
  await fixture.jobLifecycleService.performJobAction({
    tenantId: "aquatrace",
    jobId: invoicingJob.id,
    action: "close",
    actorId: "owner_1"
  });

  const todayTechJob = await createJob(fixture, {
    title: "Today tech visit job",
    amount: 650
  });
  await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: todayTechJob.id,
    title: "Today's tech visit",
    start: "2026-07-16T17:00:00.000Z",
    end: "2026-07-16T19:00:00.000Z",
    assignedTo: ["tech_1"]
  });

  const todayOfficeJob = await createJob(fixture, {
    title: "Today office visit job",
    amount: 500
  });
  await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: todayOfficeJob.id,
    title: "Today's office visit",
    start: "2026-07-16T18:00:00.000Z",
    end: "2026-07-16T20:00:00.000Z",
    assignedTo: ["office_1"]
  });

  const lateTechJob = await createJob(fixture, {
    title: "Late technician job",
    amount: 725
  });
  await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: lateTechJob.id,
    title: "Late visit",
    start: "2026-07-15T14:00:00.000Z",
    end: "2026-07-15T16:00:00.000Z",
    assignedTo: ["tech_1"]
  });

  const upcomingTechJob = await createJob(fixture, {
    title: "Upcoming technician job",
    amount: 575
  });
  await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: upcomingTechJob.id,
    title: "Upcoming visit",
    start: "2026-07-18T14:00:00.000Z",
    end: "2026-07-18T16:00:00.000Z",
    assignedTo: ["tech_1"]
  });

  await fixture.repository.createInvoice(invoiceRecord({
    id: "invoice_home_awaiting",
    number: "INV-1002",
    title: "Awaiting payment invoice",
    status: "awaiting_payment",
    jobId: actionJob.id,
    totals: totals(900),
    ledger: {
      depositApplied: 0,
      creditApplied: 0,
      paymentApplied: 0,
      refundedAmount: 0,
      balanceDue: 900,
      overdue: false
    }
  }));
  await fixture.repository.createInvoice(invoiceRecord({
    id: "invoice_home_past_due",
    number: "INV-1003",
    title: "Past due invoice",
    status: "partial_pay",
    jobId: invoicingJob.id,
    totals: totals(1100),
    ledger: {
      depositApplied: 100,
      creditApplied: 0,
      paymentApplied: 200,
      refundedAmount: 0,
      balanceDue: 800,
      overdue: true
    }
  }));

  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "request.created",
    payload: { requestId: "request_home_1", clientName: "Deborah Justice" }
  });
  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "quote.approved",
    payload: { quoteId: "quote_home_1", approvedBy: "owner_1" }
  });
  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "invoice.sent",
    payload: { invoiceId: "invoice_home_awaiting", jobId: actionJob.id }
  });
  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "payment.created",
    payload: { paymentId: "payment_home_1", invoiceId: "invoice_home_past_due", amount: 300 }
  });

  const referenceTime = "2026-07-16T16:00:00.000Z";
  const ownerHome = await fixture.operationsHubService.getHomeSnapshot({
    access: access("OWNER", "owner_1"),
    referenceTime
  });
  assert.equal(ownerHome.queues.find((queue) => queue.key === "today-visits")?.count, 2);
  assert.equal(ownerHome.queues.find((queue) => queue.key === "upcoming-visits")?.count, 1);
  assert.equal(ownerHome.queues.find((queue) => queue.key === "unscheduled-jobs")?.count, 1);
  assert.equal(ownerHome.queues.find((queue) => queue.key === "new-requests")?.count, 1);
  assert.equal(ownerHome.queues.find((queue) => queue.key === "approved-quotes")?.count, 1);
  assert.equal(ownerHome.queues.find((queue) => queue.key === "action-required")?.count, 1);
  assert.equal(ownerHome.queues.find((queue) => queue.key === "requires-invoicing")?.count, 1);
  assert.equal(ownerHome.queues.find((queue) => queue.key === "awaiting-payment")?.count, 2);
  assert.equal(ownerHome.queues.find((queue) => queue.key === "past-due")?.count, 1);
  assert.equal(ownerHome.health.length, 2);

  const techHome = await fixture.operationsHubService.getHomeSnapshot({
    access: access("TECHNICIAN", "tech_1"),
    referenceTime
  });
  assert.equal(techHome.role, "TECHNICIAN");
  assert.equal(techHome.health.length, 0);
  assert.equal(techHome.queues.find((queue) => queue.key === "today-visits")?.count, 1);
  assert.equal(techHome.queues.find((queue) => queue.key === "late-assigned")?.count, 1);
  assert.equal(techHome.queues.find((queue) => queue.key === "upcoming-assigned")?.count, 1);
  assert.equal(techHome.technician?.todayVisits.length, 1);
  assert.equal(techHome.technician?.todayVisits[0]?.jobTitle, "Today tech visit job");

  const ownerWorkspace = await fixture.operationsHubService.getScheduleWorkspace({
    access: access("OWNER", "owner_1"),
    from: "2026-07-15T00:00:00.000Z",
    to: "2026-07-18T23:59:59.999Z",
    referenceTime
  });
  assert.equal(ownerWorkspace.visits.some((visit) => visit.jobTitle === "Today office visit job"), true);
  assert.equal(ownerWorkspace.visits.some((visit) => visit.jobTitle === "Today tech visit job"), true);
  assert.equal(ownerWorkspace.unscheduledJobs.some((job) => job.jobId === unscheduledJob.id), true);

  const technicianWorkspace = await fixture.operationsHubService.getScheduleWorkspace({
    access: access("TECHNICIAN", "tech_1"),
    from: "2026-07-15T00:00:00.000Z",
    to: "2026-07-18T23:59:59.999Z",
    referenceTime
  });
  assert.equal(technicianWorkspace.visits.every((visit) => visit.assignedTo.includes("tech_1")), true);
  assert.equal(technicianWorkspace.visits.some((visit) => visit.jobTitle === "Today office visit job"), false);
  assert.equal(technicianWorkspace.unscheduledJobs.length, 0);

  const technicianActivity = await fixture.operationsHubService.getActivityFeed({
    access: access("TECHNICIAN", "tech_1"),
    limit: 50,
    referenceTime
  });
  assert.equal(technicianActivity.some((entry) => ["requests", "quotes", "invoices", "payments"].includes(entry.objectType)), false);
  assert.equal(technicianActivity.every((entry) => entry.objectType === "jobs"), true);
  assert.equal(technicianActivity.some((entry) => entry.title === "Today tech visit job"), true);
});

test("home queues keep zero states, non-zero counts, exact filter targets, and Today/Upcoming/Unscheduled routing for the office rail", async () => {
  const emptyFixture = createFixture();
  const emptyHome = await emptyFixture.operationsHubService.getHomeSnapshot({
    access: access("OWNER", "owner_1"),
    referenceTime: "2026-07-16T16:00:00.000Z"
  });
  const emptyQueueByKey = new Map(emptyHome.queues.map((queue) => [queue.key, queue]));
  assert.equal(emptyQueueByKey.get("today-visits")?.count, 0);
  assert.equal(emptyQueueByKey.get("upcoming-visits")?.count, 0);
  assert.equal(emptyQueueByKey.get("unscheduled-jobs")?.count, 0);
  assert.equal(emptyQueueByKey.get("new-requests")?.count, 0);
  assert.equal(emptyQueueByKey.get("approved-quotes")?.count, 0);
  assert.equal(emptyQueueByKey.get("action-required")?.count, 0);
  assert.equal(emptyQueueByKey.get("requires-invoicing")?.count, 0);
  assert.equal(emptyQueueByKey.get("awaiting-payment")?.count, 0);
  assert.equal(emptyQueueByKey.get("past-due")?.count, 0);
  assert.deepEqual(emptyQueueByKey.get("today-visits")?.target, {
    module: "schedule",
    filterKey: "scope",
    filterValue: "today"
  });
  assert.deepEqual(emptyQueueByKey.get("upcoming-visits")?.target, {
    module: "schedule",
    filterKey: "scope",
    filterValue: "upcoming"
  });
  assert.deepEqual(emptyQueueByKey.get("unscheduled-jobs")?.target, {
    module: "jobs",
    filterKey: "status",
    filterValue: "Unscheduled"
  });

  const fixture = createFixture();
  await fixture.repository.createRequest(requestRecord({
    id: "request_home_receipt",
    number: "REQ-1004",
    createdAt: "2026-07-16T08:00:00.000Z",
    updatedAt: "2026-07-16T08:00:00.000Z"
  }));
  await fixture.repository.createQuote(quoteRecord({
    id: "quote_home_receipt",
    number: "Q-1004",
    status: "approved",
    updatedAt: "2026-07-16T08:05:00.000Z"
  }));
  const unscheduledJob = await createJob(fixture, {
    title: "Receipt unscheduled job",
    amount: 520
  });
  const todayJob = await createJob(fixture, {
    title: "Receipt today visit",
    amount: 610
  });
  await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: todayJob.id,
    title: "Receipt today visit",
    start: "2026-07-16T15:00:00.000Z",
    end: "2026-07-16T17:00:00.000Z",
    assignedTo: ["office_1"]
  });
  const upcomingJob = await createJob(fixture, {
    title: "Receipt upcoming visit",
    amount: 480
  });
  await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: upcomingJob.id,
    title: "Receipt upcoming visit",
    start: "2026-07-18T14:00:00.000Z",
    end: "2026-07-18T16:00:00.000Z",
    assignedTo: ["office_1"]
  });
  const actionJob = await createJob(fixture, {
    title: "Receipt action job",
    amount: 900
  });
  const actionVisit = await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: actionJob.id,
    title: "Receipt action visit",
    start: "2026-07-15T13:00:00.000Z",
    end: "2026-07-15T15:00:00.000Z",
    assignedTo: ["tech_1"]
  });
  await fixture.jobLifecycleService.completeVisit({
    tenantId: "aquatrace",
    visitId: actionVisit.id,
    actorId: "tech_1"
  });
  const requiresInvoicingJob = await createJob(fixture, {
    title: "Receipt closeout job",
    amount: 1100
  });
  const requiresInvoicingVisit = await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: requiresInvoicingJob.id,
    title: "Receipt closeout visit",
    start: "2026-07-15T09:00:00.000Z",
    end: "2026-07-15T11:00:00.000Z",
    assignedTo: ["tech_1"]
  });
  await fixture.jobLifecycleService.completeVisit({
    tenantId: "aquatrace",
    visitId: requiresInvoicingVisit.id,
    actorId: "tech_1"
  });
  await fixture.jobLifecycleService.performJobAction({
    tenantId: "aquatrace",
    jobId: requiresInvoicingJob.id,
    action: "close",
    actorId: "owner_1"
  });
  await fixture.repository.createInvoice(invoiceRecord({
    id: "invoice_home_receipt_awaiting",
    number: "INV-1004",
    status: "awaiting_payment",
    jobId: actionJob.id,
    totals: totals(900),
    ledger: {
      depositApplied: 0,
      creditApplied: 0,
      paymentApplied: 0,
      refundedAmount: 0,
      balanceDue: 900,
      overdue: false
    }
  }));
  await fixture.repository.createInvoice(invoiceRecord({
    id: "invoice_home_receipt_past_due",
    number: "INV-1005",
    status: "partial_pay",
    jobId: requiresInvoicingJob.id,
    totals: totals(1100),
    ledger: {
      depositApplied: 100,
      creditApplied: 0,
      paymentApplied: 200,
      refundedAmount: 0,
      balanceDue: 800,
      overdue: true
    }
  }));

  const home = await fixture.operationsHubService.getHomeSnapshot({
    access: access("OWNER", "owner_1"),
    referenceTime: "2026-07-16T16:00:00.000Z"
  });
  const queueByKey = new Map(home.queues.map((queue) => [queue.key, queue]));
  assert.equal(queueByKey.get("today-visits")?.count, 1);
  assert.equal(queueByKey.get("upcoming-visits")?.count, 1);
  assert.equal(queueByKey.get("unscheduled-jobs")?.count, 1);
  assert.equal(queueByKey.get("new-requests")?.count, 1);
  assert.equal(queueByKey.get("approved-quotes")?.count, 1);
  assert.equal(queueByKey.get("action-required")?.count, 1);
  assert.equal(queueByKey.get("requires-invoicing")?.count, 1);
  assert.equal(queueByKey.get("awaiting-payment")?.count, 2);
  assert.equal(queueByKey.get("past-due")?.count, 1);
});

test("CRM schedule, home, activity, and notification routes expose live workspace data and unread-state changes", async () => {
  const fixture = createFixture();
  await fixture.repository.createRequest(requestRecord({
    id: "request_route_1",
    number: "REQ-2001",
    createdAt: "2026-07-16T08:00:00.000Z",
    updatedAt: "2026-07-16T08:00:00.000Z"
  }));
  await fixture.repository.createQuote(quoteRecord({
    id: "quote_route_1",
    number: "Q-2001",
    title: "Route quote",
    status: "approved"
  }));
  const job = await createJob(fixture, {
    title: "Route job",
    amount: 880
  });
  const visit = await fixture.jobLifecycleService.scheduleVisit({
    tenantId: "aquatrace",
    jobId: job.id,
    title: "Route visit",
    start: "2026-07-16T14:00:00.000Z",
    end: "2026-07-16T16:00:00.000Z",
    assignedTo: ["tech_1"]
  });
  await fixture.jobLifecycleService.completeVisit({
    tenantId: "aquatrace",
    visitId: visit.id,
    actorId: "tech_1"
  });
  await fixture.repository.createInvoice(invoiceRecord({
    id: "invoice_route_1",
    number: "INV-2001",
    title: "Route invoice",
    jobId: job.id,
    status: "awaiting_payment",
    ledger: {
      depositApplied: 0,
      creditApplied: 0,
      paymentApplied: 0,
      refundedAmount: 0,
      balanceDue: 880,
      overdue: false
    }
  }));

  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "request.created",
    payload: { requestId: "request_route_1", clientName: "Deborah Justice" }
  });
  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "quote.approved",
    payload: { quoteId: "quote_route_1", approvedBy: "owner_1" }
  });
  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "payment.failed",
    payload: { paymentId: "payment_route_fail", invoiceId: "invoice_route_1", amount: 880 }
  });

  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue: fixture.approvalQueue,
    eventBus: fixture.eventBus,
    memoryRepository: fixture.repository,
    platformRepository: fixture.platformRepository,
    jobLifecycleService: fixture.jobLifecycleService,
    ledgerService: fixture.ledgerService,
    operationsHubService: fixture.operationsHubService,
    commsRail: fixture.commsRail,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });

  const server = await listen(app);
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;

    const workspaceResponse = await fetch(`${base}/api/crm/schedule/workspace?tenantId=aquatrace&from=2026-07-16T00:00:00.000Z&to=2026-07-16T23:59:59.999Z`);
    const workspaceBody = await workspaceResponse.json();
    assert.equal(workspaceBody.ok, true);
    assert.equal(workspaceBody.actorRole, "OWNER");
    assert.equal(workspaceBody.workspace.visits.length >= 1, true);

    const homeResponse = await fetch(`${base}/api/crm/home?tenantId=aquatrace`);
    const homeBody = await homeResponse.json();
    assert.equal(homeBody.ok, true);
    const homeQueueKeys = new Set(homeBody.home.queues.map((queue) => queue.key));
    assert.equal(
      ["today-visits", "upcoming-visits", "unscheduled-jobs", "new-requests", "approved-quotes", "action-required", "requires-invoicing", "awaiting-payment", "past-due"]
        .every((key) => homeQueueKeys.has(key)),
      true
    );

    const activityResponse = await fetch(`${base}/api/crm/activity?tenantId=aquatrace&objectType=quotes&limit=20`);
    const activityBody = await activityResponse.json();
    assert.equal(activityBody.ok, true);
    assert.equal(activityBody.entries.length >= 1, true);
    assert.equal(activityBody.entries.every((entry) => entry.objectType === "quotes"), true);

    const notificationsResponse = await fetch(`${base}/api/crm/notifications?tenantId=aquatrace&limit=20`);
    const notificationsBody = await notificationsResponse.json();
    assert.equal(notificationsBody.ok, true);
    assert.equal(notificationsBody.unreadCount >= 4, true);
    const requestNotification = notificationsBody.notifications.find((notification) => notification.title === "New request submitted");
    assert.ok(requestNotification);
    const alertNotification = notificationsBody.notifications.find((notification) => notification.kind === "alert");
    assert.ok(alertNotification);

    const readResponse = await fetch(`${base}/api/crm/notifications/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        notificationId: requestNotification.id
      })
    });
    const readBody = await readResponse.json();
    assert.equal(readBody.ok, true);
    assert.equal(readBody.notificationId, requestNotification.id);

    const afterReadResponse = await fetch(`${base}/api/crm/notifications?tenantId=aquatrace&limit=20`);
    const afterReadBody = await afterReadResponse.json();
    const afterReadRequestNotification = afterReadBody.notifications.find((notification) => notification.id === requestNotification.id);
    assert.equal(afterReadRequestNotification?.unread, false);

    const readAllResponse = await fetch(`${base}/api/crm/notifications/read-all`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    });
    const readAllBody = await readAllResponse.json();
    assert.equal(readAllBody.ok, true);
    assert.equal(readAllBody.markedCount >= 1, true);

    const afterReadAllResponse = await fetch(`${base}/api/crm/notifications?tenantId=aquatrace&limit=20`);
    const afterReadAllBody = await afterReadAllResponse.json();
    assert.equal(afterReadAllBody.unreadCount, 0);
    assert.equal(afterReadAllBody.notifications.every((notification) => notification.unread === false), true);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("CRM scheduling tools queue unscheduled jobs, create 25-visit series, shift remaining visits, and read role-aware queues", async () => {
  const fixture = createFixture();
  await fixture.repository.createRequest(requestRecord({
    id: "request_tools_1",
    number: "REQ-3001",
    createdAt: "2026-07-16T08:30:00.000Z",
    updatedAt: "2026-07-16T08:30:00.000Z"
  }));
  await fixture.repository.createQuote(quoteRecord({
    id: "quote_tools_1",
    number: "Q-3001",
    title: "Approved tools quote",
    status: "approved",
    totals: totals(1400)
  }));

  const unscheduledJob = await createJob(fixture, {
    title: "Unscheduled queue job",
    amount: 640
  });
  const megaJob = await createJob(fixture, {
    title: "Mega visit job",
    amount: 2500
  });
  const stillUnscheduledJob = await createJob(fixture, {
    title: "Still unscheduled job",
    amount: 320
  });

  const tools = createCrmToolsWithOptions(fixture.provider, fixture.approvalQueue, {
    requestRepository: fixture.repository,
    platformRepository: fixture.platformRepository,
    jobLifecycleService: fixture.jobLifecycleService,
    ledgerService: fixture.ledgerService,
    operationsHubService: fixture.operationsHubService
  });

  const scheduleUnscheduled = toolByName(tools, "scheduleUnscheduledJob");
  const scheduleResult = await scheduleUnscheduled.handler(tenant(), {
    query: "Unscheduled queue job",
    visits: [{
      start: "2026-07-23T13:00:00.000Z",
      end: "2026-07-23T15:00:00.000Z",
      assignedTeamQuery: "Logan",
      details: "Gate code 4421"
    }]
  });
  const unscheduledApprovalId = scheduleResult.result.approval.id;
  await fixture.approvalQueue.approve("aquatrace", unscheduledApprovalId, "owner_1");
  const executedUnscheduled = await fixture.approvalQueue.executeApproved("aquatrace", unscheduledApprovalId, "owner_1");
  assert.equal(executedUnscheduled.result.visits.length, 1);

  const multiVisitTool = toolByName(tools, "scheduleJobVisits");
  const multiVisitDraft = await multiVisitTool.handler(tenant(), {
    jobId: megaJob.id,
    visits: Array.from({ length: 25 }, (_, index) => {
      const date = new Date("2026-07-20T09:00:00.000Z");
      date.setUTCDate(date.getUTCDate() + index);
      const start = date.toISOString();
      const end = new Date(date.getTime() + 2 * 60 * 60 * 1000).toISOString();
      return {
        title: `Visit ${index + 1}`,
        start,
        end,
        assignedTeamQuery: "Logan",
        details: `Sequence visit ${index + 1}`
      };
    })
  });
  const multiVisitApprovalId = multiVisitDraft.result.approval.id;
  await fixture.approvalQueue.approve("aquatrace", multiVisitApprovalId, "owner_1");
  const executedSeries = await fixture.approvalQueue.executeApproved("aquatrace", multiVisitApprovalId, "owner_1");
  assert.equal(executedSeries.result.visits.length, 25);
  const allVisits = await fixture.schedulingRepository.listVisits("aquatrace", {
    from: "2026-07-20T00:00:00.000Z",
    to: "2026-09-30T23:59:59.999Z"
  });
  const megaVisits = allVisits.filter((visit) => visit.jobId === megaJob.id);
  assert.equal(megaVisits.length, 25);

  const shiftTool = toolByName(tools, "shiftJobVisitSeries");
  const anchorVisit = megaVisits.sort((left, right) => left.start.localeCompare(right.start))[0];
  const shiftDraft = await shiftTool.handler(tenant(), {
    visitId: anchorVisit.id,
    shiftDays: 2,
    shiftRemaining: true
  });
  const shiftApprovalId = shiftDraft.result.approval.id;
  await fixture.approvalQueue.approve("aquatrace", shiftApprovalId, "owner_1");
  const executedShift = await fixture.approvalQueue.executeApproved("aquatrace", shiftApprovalId, "owner_1");
  assert.equal(executedShift.result.shiftedVisits.length, 24);
  const shiftedAnchor = await fixture.schedulingRepository.getVisit("aquatrace", anchorVisit.id);
  assert.equal(shiftedAnchor.start.slice(0, 10), "2026-07-22");

  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "request.created",
    payload: { requestId: "request_tools_1", clientName: "Deborah Justice" }
  });
  await fixture.eventBus.emit({
    tenantId: "aquatrace",
    type: "quote.approved",
    payload: { quoteId: "quote_tools_1", approvedBy: "owner_1" }
  });

  const getSchedule = toolByName(tools, "getSchedule");
  const technicianSchedule = await getSchedule.handler(tenant(), {
    day: "2026-07-22",
    role: "TECHNICIAN",
    tenantUserId: "tech_1"
  });
  assert.equal(technicianSchedule.result.visits.length >= 1, true);
  assert.equal(technicianSchedule.result.visits.every((visit) => visit.assignedTo.includes("tech_1")), true);
  assert.equal(technicianSchedule.result.unscheduledJobs.length, 0);

  const ownerSchedule = await getSchedule.handler(tenant(), {
    day: "2026-07-22",
    role: "OWNER",
    tenantUserId: "owner_1"
  });
  assert.equal(ownerSchedule.result.unscheduledJobs.some((job) => job.jobId === stillUnscheduledJob.id), true);

  const getHomeQueues = toolByName(tools, "getHomeQueues");
  const ownerHome = await getHomeQueues.handler(tenant(), {
    role: "OWNER",
    tenantUserId: "owner_1"
  });
  const ownerQueueKeys = new Set(ownerHome.result.queues.map((queue) => queue.key));
  assert.equal(
    ["today-visits", "upcoming-visits", "unscheduled-jobs", "new-requests", "approved-quotes", "action-required", "requires-invoicing", "awaiting-payment", "past-due"]
      .every((key) => ownerQueueKeys.has(key)),
    true
  );

  const getActivityFeed = toolByName(tools, "getActivityFeed");
  const technicianActivity = await getActivityFeed.handler(tenant(), {
    role: "TECHNICIAN",
    tenantUserId: "tech_1",
    limit: 50
  });
  assert.equal(technicianActivity.result.activity.length >= 1, true);
  assert.equal(technicianActivity.result.activity.every((entry) => entry.objectType === "jobs"), true);
  assert.equal(technicianActivity.result.activity.some((entry) => ["requests", "quotes"].includes(entry.objectType)), false);

  assert.equal((await fixture.repository.listJobs("aquatrace")).find((job) => job.id === unscheduledJob.id)?.status, "Late");
});

test("Nexi conversational scheduling, shifting, schedule lookup, and home triage use the new Job 6/7 tools through chat-native approvals", async () => {
  const fixture = createFixture();
  await fixture.repository.createRequest(requestRecord({
    id: "request_chat_1",
    number: "REQ-4001",
    createdAt: "2026-07-16T07:45:00.000Z",
    updatedAt: "2026-07-16T07:45:00.000Z"
  }));
  await fixture.repository.createQuote(quoteRecord({
    id: "quote_chat_1",
    number: "Q-4001",
    title: "Chat quote",
    status: "approved",
    totals: totals(1600)
  }));
  const chatJob = await createJob(fixture, {
    title: "Multi-visit chat job",
    amount: 1600
  });

  const tools = [
    ...createCrmToolsWithOptions(fixture.provider, fixture.approvalQueue, {
      requestRepository: fixture.repository,
      platformRepository: fixture.platformRepository,
      jobLifecycleService: fixture.jobLifecycleService,
      ledgerService: fixture.ledgerService,
      operationsHubService: fixture.operationsHubService
    }),
    ...createApprovalNexiTools({
      approvalQueue: fixture.approvalQueue,
      actorId: "owner_1",
      actorRole: "OWNER",
      crmRepository: fixture.repository,
      jobLifecycleService: fixture.jobLifecycleService,
      ledgerService: fixture.ledgerService,
      publicBaseUrl: "http://127.0.0.1:4175"
    })
  ];

  const createTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: `schedule 3 visits on visit series for ${chatJob.id} on 2026-07-20 with Logan every week` }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(createTurn.toolRuns[0].name, "scheduleJobVisits");
  assert.match(createTurn.answer, /You requested schedule job visits/i);
  assert.match(createTurn.answer, /Is this correct/i);

  const approveCreateTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: `schedule 3 visits on visit series for ${chatJob.id} on 2026-07-20 with Logan every week` },
      { role: "assistant", content: createTurn.answer },
      { role: "user", content: "yes" }
    ],
    pendingApproval: createTurn.pendingApproval,
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(approveCreateTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approveCreateTurn.answer, /Approved and booked 3 visits/i);
  let scheduledVisits = (await fixture.schedulingRepository.listVisits("aquatrace", {
    from: "2026-07-20T00:00:00.000Z",
    to: "2026-08-31T23:59:59.999Z"
  })).filter((visit) => visit.jobId === chatJob.id);
  assert.equal(scheduledVisits.length, 3);
  assert.equal(scheduledVisits[0].start.slice(0, 10), "2026-07-20");

  const scheduleTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "show the schedule for Logan Monday" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(scheduleTurn.toolRuns[0].name, "getSchedule");
  assert.match(scheduleTurn.answer, /scheduled visit/i);

  const shiftTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: `push remaining visits on visit series for ${chatJob.id} on 2026-07-22 back 2 days` }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(shiftTurn.toolRuns[0].name, "shiftJobVisitSeries");
  assert.match(shiftTurn.answer, /You requested shift job visit series/i);

  const approveShiftTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: `push remaining visits on visit series for ${chatJob.id} on 2026-07-22 back 2 days` },
      { role: "assistant", content: shiftTurn.answer },
      { role: "user", content: "yes" }
    ],
    pendingApproval: shiftTurn.pendingApproval,
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(approveShiftTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approveShiftTurn.answer, /Approved and moved the anchor visit, shifting 2 remaining visits/i);
  scheduledVisits = (await fixture.schedulingRepository.listVisits("aquatrace", {
    from: "2026-07-20T00:00:00.000Z",
    to: "2026-08-31T23:59:59.999Z"
  }))
    .filter((visit) => visit.jobId === chatJob.id)
    .sort((left, right) => left.start.localeCompare(right.start));
  assert.equal(scheduledVisits[0].start.slice(0, 10), "2026-07-22");

  const homeTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "what needs my attention" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(homeTurn.toolRuns[0].name, "getHomeQueues");
  assert.match(homeTurn.answer, /Home is showing \d+ live queues/i);
});
