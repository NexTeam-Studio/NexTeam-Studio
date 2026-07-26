import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { createApprovalNexiTools } from "../dist/approval/nexiTools.js";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { invoiceTemplateVariables, resolveTemplateMessage } from "../dist/crm/communicationTemplates.js";
import { JobLifecycleService } from "../dist/crm/jobLifecycle.js";
import { MemoryJobLifecycleRepository } from "../dist/crm/jobLifecycleRepository.js";
import { LedgerService } from "../dist/crm/ledgerFoundation.js";
import { MemoryLedgerRepository } from "../dist/crm/ledgerRepository.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { createFieldReportRecord } from "../dist/fielddocs/reportService.js";
import { createPaypalCheckoutOrder, capturePaypalCheckoutOrder } from "../dist/crm/paypal.js";
import { materializeQuoteRecord } from "../dist/crm/quoteFoundation.js";
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
  return { subtotal: Number((total - tax).toFixed(2)), tax, total };
}

function paymentSchedule(label = "Deposit", amount = 25) {
  return {
    enabled: true,
    milestones: [{
      id: `milestone_${label.replace(/\s+/g, "_").toLowerCase()}`,
      label,
      trigger: "on_job_close",
      amountKind: "percent",
      amount,
      note: `${label} note`
    }],
    updatedAt: "2026-07-13T12:00:00.000Z"
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
  const ledgerRepository = new MemoryLedgerRepository();
  const fieldDocsRepository = records.fieldDocsRepository ?? new MemoryMediaRepository();
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
  const ledgerService = new LedgerService({
    crmRepository: repository,
    ledgerRepository,
    fieldDocsRepository,
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
  const provider = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider, jobLifecycleService, ledgerService)
  );
  const approvalTools = createApprovalNexiTools({
    approvalQueue,
    actorId: "owner_1",
    actorRole: "OWNER",
    crmRepository: repository,
    jobLifecycleService,
    ledgerService,
    publicBaseUrl: "http://127.0.0.1:4175"
  });
  return {
    repository,
    schedulingRepository,
    lifecycleRepository,
    ledgerRepository,
    fieldDocsRepository,
    ledgerService,
    jobLifecycleService,
    provider,
    approvalQueue,
    approvalTools,
    sentEmails,
    sentSms,
    emittedEvents
  };
}

async function createJob(fixture, { title, amount = 200, paymentPlan } = {}) {
  return fixture.jobLifecycleService.createJob({
    tenantId: "aquatrace",
    clientId: "client_1",
    propertyId: "property_1",
    title: title ?? "Leak detection",
    lineItems: lineItems([{ name: title ?? "Leak detection", quantity: 1, unitPrice: amount, code: "LEAK" }]),
    ...(paymentPlan ? { paymentSchedule: paymentPlan } : {})
  });
}

async function createInvoice(fixture, overrides = {}) {
  return fixture.repository.createInvoice({
    id: overrides.id ?? `invoice_${Math.random().toString(16).slice(2, 10)}`,
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "awaiting_payment",
    title: "Ledger invoice",
    lineItems: lineItems([{ name: "Leak detection", quantity: 1, unitPrice: 100, code: "LEAK" }]),
    totals: totals(overrides.total ?? 100),
    createdAt: "2026-07-13T13:00:00.000Z",
    ...overrides
  });
}

async function createApprovedDepositQuote(fixture, overrides = {}) {
  const draft = await materializeQuoteRecord(fixture.repository, {
    tenantId: "aquatrace",
    clientId: "client_1",
    title: "Quote deposit bridge",
    items: [{
      kind: "custom",
      code: "LEAK-QUOTE",
      name: "Leak detection scope",
      description: "Used to prove saved-card reuse.",
      quantity: 1,
      unitPrice: 400
    }],
    approvalRules: {
      requireSignature: true,
      requireDeposit: true,
      depositKind: "amount",
      depositValue: 100,
      requireCardOnFile: true
    },
    ...overrides
  });
  const saved = await fixture.repository.createQuote(draft);
  const approvedAt = "2026-07-13T12:00:00.000Z";
  return fixture.repository.updateQuote(saved.id, {
    status: "approved",
    approvedAt,
    approvedBy: "client_1",
    approvedByRole: "client",
    deposit: {
      ...saved.deposit,
      cardholderName: "Deborah Justice",
      cardBrand: "Visa",
      cardLast4: "4242",
      cardOnFileAuthorized: true,
      autoSavedCardOnFile: true,
      capturedAt: approvedAt
    }
  });
}

async function runLocalToolTurn(fixture, messages) {
  return runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages,
    tools: fixture.approvalTools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
}

test("draft invoices stay fully editable through line items, discount, tax, and terms until delivery locks them", async () => {
  const fixture = makeFixture();
  const job = await createJob(fixture, { title: "Editable invoice job", amount: 240 });
  const action = await fixture.jobLifecycleService.performJobAction({
    tenantId: "aquatrace",
    jobId: job.id,
    action: "invoice",
    actorId: "owner_1"
  });
  assert.ok(action.invoice?.id);

  const updated = await fixture.ledgerService.updateInvoiceDraft({
    tenantId: "aquatrace",
    invoiceId: action.invoice.id,
    actorId: "owner_1",
    lineItems: lineItems([
      { name: "Leak detection", quantity: 1, unitPrice: 200, code: "LEAK" },
      { name: "Return line repair", quantity: 1, unitPrice: 50, code: "REPAIR" }
    ]),
    discount: { kind: "amount", value: 25 },
    taxRate: 8,
    terms: "Pay the office after reviewing the repair photos."
  });

  assert.equal(updated.lineItems.length, 2);
  assert.equal(updated.lineItems[1].name, "Return line repair");
  assert.equal(updated.discount?.value, 25);
  assert.equal(updated.totals.taxRate, 8);
  assert.equal(updated.terms, "Pay the office after reviewing the repair photos.");

  const sent = await fixture.ledgerService.sendInvoice({
    tenantId: "aquatrace",
    invoiceId: updated.id,
    actorId: "owner_1",
    mode: "email",
    publicBaseUrl: "http://127.0.0.1:4175"
  });

  assert.equal(sent.invoice.status, "sent");
  assert.equal(fixture.sentEmails.length, 1);
  await assert.rejects(
    () => fixture.ledgerService.updateInvoiceDraft({
      tenantId: "aquatrace",
      invoiceId: updated.id,
      actorId: "owner_1",
      lineItems: lineItems([{ name: "Blocked edit", quantity: 1, unitPrice: 10, code: "BLOCK" }])
    }),
    /line items can only be edited while the invoice is still a draft/i
  );
});

test("closing without invoicing creates a recurring 9AM reminder that advances until dismissal", async () => {
  const fixture = makeFixture();
  const job = await createJob(fixture, { title: "Reminder drill", amount: 180 });

  const closed = await fixture.jobLifecycleService.performJobAction({
    tenantId: "aquatrace",
    jobId: job.id,
    action: "close",
    actorId: "owner_1"
  });

  assert.equal(closed.job.status, "Requires Invoicing");
  assert.equal(closed.reminder?.recurrence, "daily_9am");
  const initialReminder = (await fixture.lifecycleRepository.listInvoiceReminders("aquatrace"))
    .find((record) => record.jobId === job.id);
  assert.ok(initialReminder?.nextDueAt);

  await fixture.jobLifecycleService.listJobs("aquatrace", new Date(new Date(initialReminder.nextDueAt).getTime() + 60_000).toISOString());
  const advancedReminder = (await fixture.lifecycleRepository.listInvoiceReminders("aquatrace"))
    .find((record) => record.jobId === job.id);

  assert.equal(advancedReminder?.recurrence, "daily_9am");
  assert.notEqual(advancedReminder?.dueAt, initialReminder?.dueAt);
  assert.equal(fixture.emittedEvents.some((event) => event.type === "invoice.reminder_due"), true);

  await fixture.jobLifecycleService.performJobAction({
    tenantId: "aquatrace",
    jobId: job.id,
    action: "dismiss_invoice_reminder",
    actorId: "owner_1"
  });
  const dismissed = (await fixture.lifecycleRepository.listInvoiceReminders("aquatrace"))
    .find((record) => record.jobId === job.id);
  assert.equal(dismissed?.status, "dismissed");
});

test("combining a selected subset of jobs keeps per-job references and carries the chosen payment schedule", async () => {
  const fixture = makeFixture();
  const schedule = paymentSchedule("Bundle deposit", 30);
  const first = await createJob(fixture, { title: "North campus", amount: 200 });
  const second = await createJob(fixture, { title: "South campus", amount: 150 });
  const untouched = await createJob(fixture, { title: "Leave separate", amount: 90 });

  const combined = await fixture.ledgerService.composeInvoiceFromJobs({
    tenantId: "aquatrace",
    jobIds: [first.id, second.id],
    actorId: "owner_1",
    title: "Campus bundle",
    paymentSchedule: schedule
  });

  assert.equal(combined.invoice.title, "Campus bundle");
  assert.deepEqual(combined.invoice.jobIds, [first.id, second.id]);
  assert.equal(combined.invoice.jobReferences.length, 2);
  assert.deepEqual(combined.invoice.paymentSchedule, schedule);
  assert.equal(combined.invoice.jobReferences.some((reference) => reference.jobId === untouched.id), false);
  const allInvoices = await fixture.repository.listInvoices("aquatrace");
  assert.equal(allInvoices.length, 1);
});

test("invoice delivery honors global defaults first, then per-invoice overrides for email and SMS payloads", async () => {
  const fixture = makeFixture();
  const baseInvoice = await createInvoice(fixture, {
    id: "invoice_defaults",
    status: "draft",
    title: "Default delivery invoice",
    totals: totals(220)
  });

  const emailed = await fixture.ledgerService.sendInvoice({
    tenantId: "aquatrace",
    invoiceId: baseInvoice.id,
    actorId: "owner_1",
    mode: "email",
    publicBaseUrl: "http://127.0.0.1:4175"
  });

  assert.equal(emailed.delivery.includePdf, true);
  assert.equal(emailed.delivery.includeSummary, true);
  assert.equal(emailed.delivery.includePayLink, true);
  assert.equal(fixture.sentEmails[0].attachments.length, 1);
  assert.match(fixture.sentEmails[0].bodyText, /Pay here:/i);
  assert.match(fixture.sentEmails[0].bodyText, /Summary total:/i);

  const overrideInvoice = await createInvoice(fixture, {
    id: "invoice_override",
    status: "draft",
    title: "Override delivery invoice",
    totals: totals(180),
    deliveryDefaults: {
      emailIncludePdf: false,
      emailIncludeSummary: false,
      emailIncludePayLink: true,
      smsIncludeSummary: false,
      smsIncludePayLink: true,
      smsIncludeHostedLink: true
    }
  });

  const texted = await fixture.ledgerService.sendInvoice({
    tenantId: "aquatrace",
    invoiceId: overrideInvoice.id,
    actorId: "owner_1",
    mode: "sms",
    publicBaseUrl: "http://127.0.0.1:4175"
  });

  assert.equal(texted.delivery.includeSummary, false);
  assert.equal(texted.delivery.includePayLink, true);
  assert.equal(texted.delivery.includeHostedLink, true);
  assert.match(fixture.sentSms[0].body, /Pay here:/i);
  assert.match(fixture.sentSms[0].body, /Receipt and files:/i);
});

test("default invoice delivery templates keep labeled pay-link and hosted-link content at the shared template layer", async () => {
  const fixture = makeFixture();
  const settings = await fixture.repository.getCrmSettings("aquatrace");
  const invoice = await createInvoice(fixture, {
    id: "invoice_template_contract",
    status: "draft",
    title: "Template contract invoice",
    totals: totals(240)
  });
  const variables = invoiceTemplateVariables({
    invoice,
    client: clientRecord(),
    portalUrl: "http://127.0.0.1:4175/nexportal/invoices/invoice_template_contract",
    includePayLink: true,
    includeHostedLink: true,
    includeSummaryLine: true
  });

  const emailMessage = resolveTemplateMessage({
    settings,
    category: "invoice_send",
    channel: "email",
    fallbackSubject: "",
    fallbackBodyText: "",
    variables
  });
  const smsMessage = resolveTemplateMessage({
    settings,
    category: "invoice_send",
    channel: "sms",
    fallbackSubject: "",
    fallbackBodyText: "",
    variables
  });

  assert.match(emailMessage.bodyText, /Pay here: http:\/\/127\.0\.0\.1:4175\/nexportal\/invoices\/invoice_template_contract/i);
  assert.match(emailMessage.bodyText, /Receipt and files: http:\/\/127\.0\.0\.1:4175\/nexportal\/invoices\/invoice_template_contract#receipt/i);
  assert.match(emailMessage.bodyText, /Summary total:/i);
  assert.match(smsMessage.bodyText, /Pay here: http:\/\/127\.0\.0\.1:4175\/nexportal\/invoices\/invoice_template_contract/i);
  assert.match(smsMessage.bodyText, /Receipt and files: http:\/\/127\.0\.0\.1:4175\/nexportal\/invoices\/invoice_template_contract#receipt/i);
});

test("saved-card reuse defaults to the newest card, supports alternate selection, and keeps manual/failed branches distinct", async () => {
  const fixture = makeFixture();
  const approvedQuote = await createApprovedDepositQuote(fixture);
  await fixture.ledgerService.syncQuoteDepositBridge(approvedQuote);
  const profile = await fixture.ledgerRepository.getClientBillingProfile("aquatrace", "client_1");
  assert.ok(profile);
  await fixture.ledgerRepository.upsertClientBillingProfile({
    ...profile,
    savedCards: [
      ...profile.savedCards.map((card) => ({ ...card, updatedAt: "2026-07-13T12:00:00.000Z" })),
      {
        id: "saved_card_newer",
        label: "Office backup card",
        cardholderName: "Deborah Justice",
        brand: "Mastercard",
        last4: "1111",
        reusable: true,
        source: "manual",
        externalIds: { localReusableToken: "tok_backup" },
        createdAt: "2026-07-14T09:00:00.000Z",
        updatedAt: "2026-07-14T09:00:00.000Z"
      }
    ],
    updatedAt: "2026-07-14T09:00:00.000Z"
  });

  const invoice = await createInvoice(fixture, {
    id: "invoice_saved_card",
    status: "awaiting_payment",
    title: "Saved card invoice",
    totals: totals(300)
  });
  const synced = await fixture.ledgerService.syncInvoiceAfterCreate(invoice);
  const detailAfterSync = await fixture.ledgerService.getInvoiceDetail("aquatrace", synced.id);
  assert.equal(
    detailAfterSync.billingProfile?.savedCards.find((card) => card.id === "saved_card_newer")?.updatedAt,
    "2026-07-14T09:00:00.000Z"
  );
  assert.equal(
    detailAfterSync.billingProfile?.savedCards.find((card) => card.id === profile.savedCards[0].id)?.updatedAt,
    "2026-07-13T12:00:00.000Z"
  );

  const queueLatest = await runLocalToolTurn(fixture, [{ role: "user", content: `collect payment on ${synced.id} for $100` }]);
  assert.equal(queueLatest.toolRuns[0].name, "queueCollectPayment");
  assert.match(queueLatest.answer, /Payment collection is ready/i);
  assert.match(queueLatest.answer, /Office backup card ending 1111/i);

  const approvePartial = await runLocalToolTurn(fixture, [
    { role: "user", content: `collect payment on ${synced.id} for $100` },
    { role: "assistant", content: queueLatest.answer },
    { role: "user", content: "yes" }
  ]);
  assert.equal(approvePartial.toolRuns[0].name, "approvePendingApproval");
  assert.match(approvePartial.answer, /partial payment/i);
  assert.match(approvePartial.answer, /\$100\.00 remains/i);

  const partialPayment = (await fixture.ledgerService.listPayments("aquatrace")).find((payment) => payment.invoiceId === synced.id && payment.status === "succeeded");
  assert.equal(partialPayment?.savedCardId, "saved_card_newer");

  const queueFailed = await runLocalToolTurn(fixture, [{ role: "user", content: `collect payment on ${synced.id} for $200 on card 4242 failed reason card declined` }]);
  assert.equal(queueFailed.toolRuns[0].name, "queueCollectPayment");
  assert.match(queueFailed.answer, /Saved card: Visa ending 4242/i);

  const approveFailed = await runLocalToolTurn(fixture, [
    { role: "user", content: `collect payment on ${synced.id} for $200 on card 4242 failed reason card declined` },
    { role: "assistant", content: queueFailed.answer },
    { role: "user", content: "yes" }
  ]);
  assert.equal(approveFailed.toolRuns[0].name, "approvePendingApproval");
  assert.match(approveFailed.answer, /Recovery is still open/i);

  const failedPayment = (await fixture.ledgerService.listPayments("aquatrace"))
    .find((payment) => payment.invoiceId === synced.id && payment.status === "failed");
  assert.equal(failedPayment?.savedCardId, profile.savedCards[0].id);

  const finalPayment = await fixture.ledgerService.recordInvoicePayment({
    tenantId: "aquatrace",
    invoiceId: synced.id,
    amount: 200,
    provider: "manual",
    method: "check",
    actorId: "owner_1",
    note: "Collected at the office.",
    methodDetails: {
      checkNumber: "1017",
      payerName: "Deborah Justice"
    }
  });

  assert.equal(finalPayment.payment.method, "check");
  assert.equal(finalPayment.payment.methodDetails?.checkNumber, "1017");
  assert.equal(finalPayment.invoice.status, "paid");
});

test("receipt review sends email attachments and an SMS hosted link from the same paused review", async () => {
  const fixture = makeFixture();
  const invoice = await createInvoice(fixture, {
    id: "invoice_receipt",
    status: "awaiting_payment",
    title: "Receipt send invoice",
    totals: totals(120)
  });
  const paid = await fixture.ledgerService.recordInvoicePayment({
    tenantId: "aquatrace",
    invoiceId: invoice.id,
    amount: 120,
    provider: "manual",
    method: "cash",
    actorId: "owner_1",
    note: "Paid in the office."
  });

  assert.equal(paid.receiptReview?.status, "draft");
  const review = paid.receiptReview;
  const sent = await fixture.ledgerService.sendReceiptReview({
    tenantId: "aquatrace",
    receiptReviewId: review.id,
    actorId: "owner_1",
    publicBaseUrl: "http://127.0.0.1:4175",
    sendChannels: ["email", "sms"],
    emailRecipients: ["billing@example.test"],
    smsRecipients: ["8645551212"],
    subject: "Updated paid receipt",
    bodyText: "Everything is squared away.",
    attachmentIds: [review.attachments[0].id]
  });

  assert.equal(sent.receiptReview.status, "sent");
  assert.equal(sent.receiptReview.sendHistory.length, 2);
  assert.equal(fixture.sentEmails.length, 1);
  assert.equal(fixture.sentEmails[0].attachments.length, 1);
  assert.match(fixture.sentEmails[0].bodyText, /Secure receipt link:/i);
  assert.equal(fixture.sentSms.length, 1);
  assert.match(fixture.sentSms[0].body, /Secure receipt link:/i);
});

test("receipt review sends a real field report PDF attachment when NexCam already generated one for the job", async () => {
  const fieldDocsRepository = new MemoryMediaRepository([], [], [
    createFieldReportRecord({
      tenantId: "aquatrace",
      jobId: "job_receipt_report",
      propertyId: "property_1",
      visitId: "visit_receipt_report",
      title: "Leak detection field report",
      findings: ["Skimmer throat leak confirmed."],
      mediaIds: [],
      status: "posted"
    })
  ]);
  const fixture = makeFixture({ fieldDocsRepository });
  const invoice = await createInvoice(fixture, {
    id: "invoice_receipt_report",
    status: "awaiting_payment",
    jobId: "job_receipt_report",
    title: "Receipt send invoice with field report",
    totals: totals(140)
  });
  await fixture.ledgerService.syncInvoiceAfterCreate(invoice);

  const paid = await fixture.ledgerService.recordInvoicePayment({
    tenantId: "aquatrace",
    invoiceId: invoice.id,
    amount: 140,
    provider: "manual",
    method: "cash",
    actorId: "owner_1",
    note: "Paid in the office."
  });

  const review = paid.receiptReview;
  const fieldReportAttachment = review.attachments.find((attachment) => attachment.kind === "field_report");
  assert.ok(fieldReportAttachment);

  await fixture.ledgerService.sendReceiptReview({
    tenantId: "aquatrace",
    receiptReviewId: review.id,
    actorId: "owner_1",
    publicBaseUrl: "http://127.0.0.1:4175",
    sendChannels: ["email"],
    emailRecipients: ["billing@example.test"],
    subject: "Receipt with field report",
    bodyText: "The final report is attached.",
    attachmentIds: [fieldReportAttachment.id]
  });

  assert.equal(fixture.sentEmails.length, 1);
  assert.equal(fixture.sentEmails[0].attachments.length, 1);
  assert.equal(fixture.sentEmails[0].attachments[0].filename, "field-report.pdf");
  assert.equal(fixture.sentEmails[0].attachments[0].mime, "application/pdf");
  const decoded = Buffer.from(fixture.sentEmails[0].attachments[0].contentBase64, "base64");
  assert.equal(decoded.subarray(0, 5).toString("utf8"), "%PDF-");
});

test("PayPal and Venmo checkout helpers create sandbox orders and capture completed payments", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "paypal_access_token" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).includes("/v2/checkout/orders/") && String(url).endsWith("/capture")) {
      return new Response(JSON.stringify({
        id: "order_capture_1",
        status: "COMPLETED",
        purchase_units: [{ payments: { captures: [{ id: "capture_1" }] } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      id: "order_create_1",
      status: "CREATED",
      links: [{ rel: "payer-action", href: "https://paypal.test/approve/order_create_1" }]
    }), { status: 201, headers: { "content-type": "application/json" } });
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const invoice = {
    id: "invoice_paypal",
    tenantId: "aquatrace",
    number: "INV-100",
    title: "Hosted payment invoice",
    totals: totals(210),
    ledger: { balanceDue: 210, depositApplied: 0, creditApplied: 0, paymentApplied: 0, refundedAmount: 0, overdue: false }
  };
  const env = {
    PAYPAL_ENV: "sandbox",
    PAYPAL_CLIENT_ID_AQUATRACE: "client_id_test",
    PAYPAL_CLIENT_SECRET_AQUATRACE: "client_secret_test",
    PUBLIC_BASE_URL: "http://127.0.0.1:4175"
  };
  const req = {
    protocol: "http",
    get(name) {
      return name.toLowerCase() === "host" ? "127.0.0.1:4175" : undefined;
    },
    headers: {}
  };

  const created = await createPaypalCheckoutOrder({
    env,
    invoice,
    req,
    method: "venmo",
    portalToken: "portal_token_1"
  });

  assert.equal(created.order.id, "order_create_1");
  assert.equal(created.approveUrl, "https://paypal.test/approve/order_create_1");
  const orderBody = JSON.parse(String(calls[1].init.body));
  assert.ok(orderBody.payment_source.venmo);
  assert.match(orderBody.payment_source.venmo.experience_context.return_url, /method=venmo/);

  const captured = await capturePaypalCheckoutOrder({
    env,
    tenantId: "aquatrace",
    orderId: "order_create_1"
  });

  assert.equal(captured.status, "COMPLETED");
});

test("Nexi billing tools run combine, send, partial collect, failed recovery, and receipt review approval loops in chat", async () => {
  const fixture = makeFixture();
  await fixture.ledgerRepository.upsertClientBillingProfile({
    id: "billing_profile_1",
    tenantId: "aquatrace",
    clientId: "client_1",
    savedCards: [{
      id: "saved_card_chat",
      label: "Chat default card",
      cardholderName: "Deborah Justice",
      brand: "Visa",
      last4: "9898",
      reusable: true,
      source: "manual",
      externalIds: { localReusableToken: "tok_chat" },
      createdAt: "2026-07-13T08:00:00.000Z",
      updatedAt: "2026-07-13T08:00:00.000Z"
    }],
    createdAt: "2026-07-13T08:00:00.000Z",
    updatedAt: "2026-07-13T08:00:00.000Z"
  });

  const first = await createJob(fixture, { title: "Chat bundle one", amount: 125 });
  const second = await createJob(fixture, { title: "Chat bundle two", amount: 175 });

  const composeTurn = await runLocalToolTurn(fixture, [{ role: "user", content: `combine jobs into one invoice ${first.id} ${second.id} tax 7.5` }]);
  assert.equal(composeTurn.toolRuns[0].name, "queueInvoiceCompose");
  assert.match(composeTurn.answer, /Combined invoice draft ready/i);

  const approveComposeTurn = await runLocalToolTurn(fixture, [
    { role: "user", content: `combine jobs into one invoice ${first.id} ${second.id} tax 7.5` },
    { role: "assistant", content: composeTurn.answer },
    { role: "user", content: "yes" }
  ]);
  assert.equal(approveComposeTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approveComposeTurn.answer, /built invoice/i);

  const invoice = (await fixture.repository.listInvoices("aquatrace"))[0];
  assert.ok(invoice?.id);

  const sendTurn = await runLocalToolTurn(fixture, [{ role: "user", content: `send invoice ${invoice.id} to deborah@example.test` }]);
  assert.equal(sendTurn.toolRuns[0].name, "queueInvoiceSend");
  const approveSendTurn = await runLocalToolTurn(fixture, [
    { role: "user", content: `send invoice ${invoice.id} to deborah@example.test` },
    { role: "assistant", content: sendTurn.answer },
    { role: "user", content: "yes" }
  ]);
  assert.equal(approveSendTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approveSendTurn.answer, /updated invoice/i);

  const partialTurn = await runLocalToolTurn(fixture, [{ role: "user", content: `collect payment on ${invoice.id} for $75` }]);
  assert.equal(partialTurn.toolRuns[0].name, "queueCollectPayment");
  const approvePartialTurn = await runLocalToolTurn(fixture, [
    { role: "user", content: `collect payment on ${invoice.id} for $75` },
    { role: "assistant", content: partialTurn.answer },
    { role: "user", content: "yes" }
  ]);
  assert.equal(approvePartialTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approvePartialTurn.answer, /partial payment/i);

  const failedTurn = await runLocalToolTurn(fixture, [{ role: "user", content: `collect payment on ${invoice.id} for $225 failed reason insufficient funds` }]);
  assert.equal(failedTurn.toolRuns[0].name, "queueCollectPayment");
  const approveFailedTurn = await runLocalToolTurn(fixture, [
    { role: "user", content: `collect payment on ${invoice.id} for $225 failed reason insufficient funds` },
    { role: "assistant", content: failedTurn.answer },
    { role: "user", content: "yes" }
  ]);
  assert.equal(approveFailedTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approveFailedTurn.answer, /Recovery is still open/i);

  const review = (await fixture.ledgerService.listReceiptReviews("aquatrace"))[0];
  const receiptTurn = await runLocalToolTurn(fixture, [{ role: "user", content: `send receipt review ${review.id} by email and sms to deborah@example.test 8645551212` }]);
  assert.equal(receiptTurn.toolRuns[0].name, "queueReceiptReviewSend");
  const approveReceiptTurn = await runLocalToolTurn(fixture, [
    { role: "user", content: `send receipt review ${review.id} by email and sms to deborah@example.test 8645551212` },
    { role: "assistant", content: receiptTurn.answer },
    { role: "user", content: "yes" }
  ]);
  assert.equal(approveReceiptTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approveReceiptTurn.answer, /sent receipt review/i);
});
