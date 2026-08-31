import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { createApprovalNexiTools } from "../dist/approval/nexiTools.js";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { LedgerService } from "../dist/crm/ledgerFoundation.js";
import { MemoryLedgerRepository } from "../dist/crm/ledgerRepository.js";
import { materializeQuoteRecord } from "../dist/crm/quoteFoundation.js";
import { createStripeCheckoutSession } from "../dist/crm/stripe.js";
import { runExplicitLocalToolLoop } from "../dist/nexi/nexiService.js";

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

function lineItem(quantity = 1, unitPrice = 100) {
  return [{
    id: `line_${quantity}_${unitPrice}`,
    source: "custom",
    code: "LEAK-TEST",
    name: "Leak detection",
    description: "Ledger foundation test line.",
    quantity,
    unitPrice,
    total: quantity * unitPrice
  }];
}

function totals(total) {
  return { subtotal: total, tax: 0, total };
}

function paymentTool(tools, name) {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `Expected ${name} tool to exist.`);
  return tool;
}

function makeFixture(records = {}) {
  const repository = new MemoryNativeCrmRepository({
    clients: [clientRecord()],
    ...records
  });
  const ledgerRepository = new MemoryLedgerRepository();
  const emittedEvents = [];
  const eventBus = {
    async emit(event) {
      emittedEvents.push(event);
    }
  };
  const ledgerService = new LedgerService({
    crmRepository: repository,
    ledgerRepository,
    eventBus
  });
  const provider = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new CrmApprovalExecutor(provider, undefined, ledgerService)
  );
  return { repository, ledgerRepository, ledgerService, provider, approvalQueue, emittedEvents };
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
      description: "Used to prove quote deposit bridge migration.",
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

async function createInvoice(fixture, overrides = {}) {
  return fixture.repository.createInvoice({
    id: overrides.id ?? `invoice_${Math.random().toString(16).slice(2, 10)}`,
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "awaiting_payment",
    title: "Ledger invoice",
    lineItems: lineItem(1, 100),
    totals: totals(100),
    createdAt: "2026-07-13T13:00:00.000Z",
    ...overrides
  });
}

test("quote deposit bridge migrates into first-class payment, deposit, receipt review, and saved card records without rewriting the quote snapshot", async () => {
  const fixture = makeFixture();
  const approvedQuote = await createApprovedDepositQuote(fixture);

  const bridged = await fixture.ledgerService.syncQuoteDepositBridge(approvedQuote);
  const payments = await fixture.ledgerService.listPayments("aquatrace");
  const deposits = await fixture.ledgerService.listDeposits("aquatrace");
  const receiptReviews = await fixture.ledgerService.listReceiptReviews("aquatrace");
  const billingProfile = await fixture.ledgerRepository.getClientBillingProfile("aquatrace", "client_1");
  const quoteSnapshot = (await fixture.repository.listQuotes("aquatrace")).find((quote) => quote.id === approvedQuote.id);

  assert.equal(payments.length, 1);
  assert.equal(deposits.length, 1);
  assert.equal(receiptReviews.length, 1);
  assert.equal(bridged.payment?.provider, "quote_bridge");
  assert.equal(bridged.payment?.method, "card");
  assert.equal(bridged.deposit?.source, "quote_approval");
  assert.equal(bridged.deposit?.availableAmount, 100);
  assert.equal(receiptReviews[0].kind, "payment");
  assert.equal(receiptReviews[0].status, "draft");
  assert.match(receiptReviews[0].number, /^RCT-\d{4}$/);
  assert.equal(receiptReviews[0].attachments.some((attachment) => attachment.kind === "quote_pdf"), true);
  assert.equal(billingProfile?.savedCards.length, 1);
  assert.equal(billingProfile?.savedCards[0].sourceQuoteId, approvedQuote.id);
  assert.equal(quoteSnapshot?.deposit?.cardLast4, "4242");
  assert.equal(quoteSnapshot?.deposit?.capturedAt, "2026-07-13T12:00:00.000Z");
  assert.equal(fixture.emittedEvents.some((event) => event.type === "payment.created"), true);
});

test("invoice sync auto-applies deposits and credits, and overdue only marks awaiting-payment invoices", async () => {
  const fixture = makeFixture();
  const approvedQuote = await createApprovedDepositQuote(fixture);
  await fixture.ledgerService.syncQuoteDepositBridge(approvedQuote);

  const firstInvoice = await createInvoice(fixture, {
    id: "invoice_deposit_1",
    quoteId: approvedQuote.id,
    title: "Deposit-backed invoice",
    lineItems: lineItem(1, 400),
    totals: totals(400),
    dueAt: "2026-07-01T00:00:00.000Z"
  });
  const syncedFirst = await fixture.ledgerService.syncInvoiceAfterCreate(firstInvoice);

  assert.equal(syncedFirst.ledger.depositApplied, 100);
  assert.equal(syncedFirst.ledger.balanceDue, 300);
  assert.equal(syncedFirst.status, "partial_pay");
  assert.equal(syncedFirst.ledger.overdue, false);

  const paidFirst = await fixture.ledgerService.recordInvoicePayment({
    tenantId: "aquatrace",
    invoiceId: firstInvoice.id,
    amount: 325,
    provider: "manual",
    method: "bank_transfer",
    actorId: "office_1"
  });

  assert.equal(paidFirst.payment.method, "bank_transfer");
  assert.equal(paidFirst.payment.status, "succeeded");
  assert.equal(paidFirst.payment.appliedAmount, 300);
  assert.equal(paidFirst.credit?.availableAmount, 25);
  assert.equal(paidFirst.invoice.status, "paid");
  assert.equal(paidFirst.receiptReview.status, "draft");

  const secondInvoice = await createInvoice(fixture, {
    id: "invoice_credit_2",
    title: "Credit-backed invoice",
    lineItems: lineItem(1, 50),
    totals: totals(50),
    dueAt: "2026-07-20T00:00:00.000Z"
  });
  const syncedSecond = await fixture.ledgerService.syncInvoiceAfterCreate(secondInvoice);
  assert.equal(syncedSecond.ledger.creditApplied, 25);
  assert.equal(syncedSecond.ledger.balanceDue, 25);
  assert.equal(syncedSecond.status, "partial_pay");

  const awaitingInvoice = await createInvoice(fixture, {
    id: "invoice_overdue_awaiting",
    title: "Awaiting payment overdue",
    dueAt: "2026-07-01T00:00:00.000Z"
  });
  const syncedAwaiting = await fixture.ledgerService.syncInvoiceAfterCreate(awaitingInvoice);
  assert.equal(syncedAwaiting.status, "awaiting_payment");
  assert.equal(syncedAwaiting.ledger.overdue, true);

  const sentInvoice = await createInvoice(fixture, {
    id: "invoice_overdue_sent",
    status: "sent",
    title: "Sent but not awaiting",
    dueAt: "2026-07-01T00:00:00.000Z"
  });
  const syncedSent = await fixture.ledgerService.syncInvoiceAfterCreate(sentInvoice);
  assert.equal(syncedSent.status, "sent");
  assert.equal(syncedSent.ledger.overdue, false);
});

test("Stripe checkout uses tenant Connect headers with zero application fee and charges only the current balance due", async (t) => {
  const originalFetch = global.fetch;
  let capturedInit = null;
  global.fetch = async (_url, init) => {
    capturedInit = init;
    return new Response(JSON.stringify({
      id: "cs_test_balance_due",
      url: "https://checkout.stripe.test/session/cs_test_balance_due"
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const session = await createStripeCheckoutSession({
    STRIPE_SECRET_KEY: "sk_test_piece4"
  }, {
    id: "invoice_connect_1",
    tenantId: "aquatrace",
    clientId: "client_1",
    status: "awaiting_payment",
    title: "Balance due checkout",
    lineItems: lineItem(1, 100),
    totals: totals(100),
    ledger: {
      depositApplied: 20,
      creditApplied: 15,
      paymentApplied: 0,
      refundedAmount: 0,
      balanceDue: 65,
      overdue: false
    }
  }, {
    protocol: "http",
    get: () => "127.0.0.1:4175",
    headers: {}
  }, {
    connectedAccountId: "acct_piece4"
  });

  assert.equal(session.id, "cs_test_balance_due");
  assert.equal(capturedInit.headers["Stripe-Account"], "acct_piece4");
  const encoded = capturedInit.body.toString();
  assert.match(encoded, /line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=6500/);
  assert.doesNotMatch(encoded, /application_fee_amount|application_fee_percent/);
});

test("payment states progress through pending, succeeded, partially_refunded, and refunded with separate refund and receipt-review records", async () => {
  const fixture = makeFixture();
  const invoice = await createInvoice(fixture, {
    id: "invoice_stripe_payment",
    title: "Stripe checkout invoice"
  });
  await fixture.ledgerService.syncInvoiceAfterCreate(invoice);

  const pending = await fixture.ledgerService.createPendingStripeCheckout({
    tenantId: "aquatrace",
    invoiceId: invoice.id,
    checkoutSessionId: "cs_state_1",
    amount: 100
  });
  assert.equal(pending.status, "pending");

  const settled = await fixture.ledgerService.markStripeCheckoutPaid({
    tenantId: "aquatrace",
    invoiceId: invoice.id,
    checkoutSessionId: "cs_state_1",
    amount: 100,
    actorId: "stripe_webhook"
  });
  assert.equal(settled.payment.status, "succeeded");
  assert.equal(settled.invoice.status, "paid");
  assert.equal(settled.receiptReview.kind, "payment");
  assert.equal(settled.receiptReview.status, "draft");
  assert.match(settled.receiptReview.number, /^RCT-\d{4}$/);

  const partialRefund = await fixture.ledgerService.performLedgerAction({
    tenantId: "aquatrace",
    action: "refund_payment",
    paymentId: settled.payment.id,
    amount: 40,
    reason: "Duplicate charge",
    actorId: "owner_1"
  });
  assert.equal(partialRefund.payment?.status, "partially_refunded");
  assert.equal(partialRefund.refund?.status, "succeeded");
  assert.equal(partialRefund.receiptReview?.kind, "refund");
  assert.equal(partialRefund.receiptReview?.status, "draft");
  assert.match(partialRefund.receiptReview?.number, /^RCT-\d{4}$/);
  assert.notEqual(partialRefund.receiptReview?.number, settled.receiptReview.number);

  const fullRefund = await fixture.ledgerService.performLedgerAction({
    tenantId: "aquatrace",
    action: "refund_payment",
    paymentId: settled.payment.id,
    amount: 60,
    reason: "Full reversal",
    actorId: "owner_1"
  });
  assert.equal(fullRefund.payment?.status, "refunded");
  assert.equal(fullRefund.invoice?.status, "awaiting_payment");

  const refunds = await fixture.ledgerService.listRefunds("aquatrace");
  const receiptReviews = await fixture.ledgerService.listReceiptReviews("aquatrace");
  assert.equal(refunds.length, 2);
  assert.equal(receiptReviews.filter((review) => review.kind === "refund").length, 2);
});

test("invoice and refund receipt reviews carry the default invoice, quote, report, photo, and job-file attachments", async () => {
  const fixture = makeFixture();
  const invoice = await createInvoice(fixture, {
    id: "invoice_receipt_assets",
    quoteId: "quote_receipt_assets",
    jobId: "job_receipt_assets",
    title: "Receipt attachment invoice"
  });
  await fixture.ledgerService.syncInvoiceAfterCreate(invoice);

  const paid = await fixture.ledgerService.recordInvoicePayment({
    tenantId: "aquatrace",
    invoiceId: invoice.id,
    amount: 100,
    provider: "manual",
    method: "check",
    actorId: "office_1"
  });
  const paymentAttachmentKinds = paid.receiptReview.attachments.map((attachment) => attachment.kind).sort();
  assert.deepEqual(paymentAttachmentKinds, ["field_report", "invoice_pdf", "job_file", "photo", "quote_pdf"]);

  const refunded = await fixture.ledgerService.performLedgerAction({
    tenantId: "aquatrace",
    action: "refund_payment",
    paymentId: paid.payment.id,
    amount: 100,
    reason: "Attachment coverage",
    actorId: "owner_1"
  });
  const refundAttachmentKinds = refunded.receiptReview?.attachments.map((attachment) => attachment.kind).sort();
  assert.deepEqual(refundAttachmentKinds, ["field_report", "invoice_pdf", "job_file", "photo", "quote_pdf"]);
});

test("one payment stays on one invoice and overpayment rolls forward as credit instead of splitting across invoices", async () => {
  const fixture = makeFixture();
  const firstInvoice = await createInvoice(fixture, {
    id: "invoice_single_allocation_a",
    title: "Single-allocation first invoice"
  });
  const secondInvoice = await createInvoice(fixture, {
    id: "invoice_single_allocation_b",
    title: "Single-allocation second invoice",
    totals: totals(80),
    lineItems: lineItem(1, 80)
  });
  await fixture.ledgerService.syncInvoiceAfterCreate(firstInvoice);
  await fixture.ledgerService.syncInvoiceAfterCreate(secondInvoice);

  const paidFirst = await fixture.ledgerService.recordInvoicePayment({
    tenantId: "aquatrace",
    invoiceId: firstInvoice.id,
    amount: 150,
    provider: "manual",
    method: "cash",
    actorId: "office_1"
  });
  assert.equal(paidFirst.payment.invoiceId, firstInvoice.id);
  assert.equal(paidFirst.payment.appliedAmount, 100);
  assert.equal(paidFirst.credit?.availableAmount, 50);
  assert.equal(paidFirst.invoice.status, "paid");

  const secondAfterCredit = await fixture.ledgerService.syncInvoiceAfterCreate(secondInvoice);
  const allPayments = await fixture.ledgerService.listPayments("aquatrace");
  assert.equal(allPayments.length, 1);
  assert.equal(secondAfterCredit.status, "partial_pay");
  assert.equal(secondAfterCredit.ledger.creditApplied, 50);
  assert.equal(secondAfterCredit.ledger.balanceDue, 30);
});

test("the ledger model already accepts PayPal and Venmo slots even though the live adapter is deferred", async () => {
  const fixture = makeFixture();
  const invoice = await createInvoice(fixture, {
    id: "invoice_paypal_shape",
    title: "PayPal model invoice"
  });
  await fixture.ledgerService.syncInvoiceAfterCreate(invoice);

  const recorded = await fixture.ledgerService.recordInvoicePayment({
    tenantId: "aquatrace",
    invoiceId: invoice.id,
    amount: 100,
    provider: "paypal",
    method: "venmo",
    actorId: "office_1",
    note: "Modeled now, adapter later."
  });
  assert.equal(recorded.payment.provider, "paypal");
  assert.equal(recorded.payment.method, "venmo");
  assert.equal(recorded.payment.status, "succeeded");
  assert.equal(recorded.invoice.status, "paid");
});

test("Payment settings actively gate ACH, transaction limits, and receipt delivery", async () => {
  const fixture = makeFixture();
  const invoice = await createInvoice(fixture, { id: "invoice_payment_settings" });
  await fixture.ledgerService.syncInvoiceAfterCreate(invoice);

  const initialSettings = await fixture.repository.getCrmSettings("aquatrace");
  await fixture.repository.saveCrmSettings({
    ...initialSettings,
    workspaceSettings: {
      ...initialSettings.workspaceSettings,
      payments: {
        ...initialSettings.workspaceSettings.payments,
        achEnabled: false,
        transactionLimit: 75,
        receiptsEnabled: false
      }
    }
  });

  await assert.rejects(
    () => fixture.ledgerService.recordInvoicePayment({ tenantId: "aquatrace", invoiceId: invoice.id, amount: 50, provider: "manual", method: "ach", actorId: "office_1" }),
    /ACH is disabled/
  );
  await assert.rejects(
    () => fixture.ledgerService.recordInvoicePayment({ tenantId: "aquatrace", invoiceId: invoice.id, amount: 80, provider: "manual", method: "other", actorId: "office_1" }),
    /exceeds the tenant transaction limit/
  );

  const review = await fixture.ledgerRepository.upsertReceiptReview({
    id: "receipt_payment_settings",
    tenantId: "aquatrace",
    clientId: "client_1",
    invoiceId: invoice.id,
    kind: "payment",
    number: "RCT-9001",
    status: "draft",
    subject: "Receipt",
    bodyText: "Receipt body",
    emailRecipients: [],
    smsRecipients: [],
    sendChannels: [],
    attachments: [],
    statusHistory: [],
    hostedLink: "/receipt/receipt_payment_settings",
    createdAt: "2026-07-13T13:00:00.000Z",
    updatedAt: "2026-07-13T13:00:00.000Z"
  });
  await assert.rejects(
    () => fixture.ledgerService.sendReceiptReview({ tenantId: "aquatrace", receiptReviewId: review.id, actorId: "office_1", publicBaseUrl: "https://example.test" }),
    /Receipts are disabled/
  );
});

test("draft invoices stay draft and failed payments do not settle the invoice", async () => {
  const fixture = makeFixture();
  const draftInvoice = await createInvoice(fixture, {
    id: "invoice_draft_hold",
    status: "draft",
    dueAt: "2026-07-01T00:00:00.000Z",
    title: "Draft hold invoice"
  });
  const syncedDraft = await fixture.ledgerService.syncInvoiceAfterCreate(draftInvoice);
  assert.equal(syncedDraft.status, "draft");
  assert.equal(syncedDraft.ledger.overdue, false);

  const failedInvoice = await createInvoice(fixture, {
    id: "invoice_failed_payment",
    title: "Failed payment invoice"
  });
  await fixture.ledgerService.syncInvoiceAfterCreate(failedInvoice);
  const failed = await fixture.ledgerService.recordInvoicePayment({
    tenantId: "aquatrace",
    invoiceId: failedInvoice.id,
    amount: 100,
    provider: "manual",
    method: "other",
    status: "failed",
    actorId: "office_1",
    note: "Card declined at desk."
  });
  assert.equal(failed.payment.status, "failed");
  assert.equal(failed.invoice.status, "awaiting_payment");
  assert.equal(failed.invoice.ledger.paymentApplied, 0);
  assert.equal(failed.receiptReview, undefined);
});

test("void and bad debt stay distinct, and ledger chat tools require OWNER or OFFICE_ADMIN for execution", async () => {
  const fixture = makeFixture();
  const approvedQuote = await createApprovedDepositQuote(fixture);
  await fixture.ledgerService.syncQuoteDepositBridge(approvedQuote);

  const voidableInvoice = await createInvoice(fixture, {
    id: "invoice_voidable",
    quoteId: approvedQuote.id,
    title: "Voidable invoice",
    lineItems: lineItem(1, 100),
    totals: totals(100)
  });
  await fixture.ledgerService.syncInvoiceAfterCreate(voidableInvoice);
  const voidResult = await fixture.ledgerService.performLedgerAction({
    tenantId: "aquatrace",
    action: "void_invoice",
    invoiceId: voidableInvoice.id,
    actorId: "office_1"
  });
  const releasedDeposit = (await fixture.ledgerService.listDeposits("aquatrace")).find((deposit) => deposit.quoteId === approvedQuote.id);
  assert.equal(voidResult.invoice?.status, "void");
  assert.equal(releasedDeposit?.availableAmount, 100);
  assert.equal(releasedDeposit?.status, "available");

  const badDebtFixture = makeFixture();
  const badDebtInvoice = await createInvoice(badDebtFixture, {
    id: "invoice_bad_debt",
    title: "Bad debt invoice",
    lineItems: lineItem(1, 80),
    totals: totals(80)
  });
  await badDebtFixture.ledgerService.syncInvoiceAfterCreate(badDebtInvoice);
  const badDebtResult = await badDebtFixture.ledgerService.performLedgerAction({
    tenantId: "aquatrace",
    action: "mark_bad_debt",
    invoiceId: badDebtInvoice.id,
    actorId: "owner_1"
  });
  assert.equal(badDebtResult.invoice?.status, "bad_debt");
  assert.equal(badDebtResult.invoice?.ledger.writtenOffAmount, 80);

  const paidInvoice = await createInvoice(fixture, {
    id: "invoice_chat_refund",
    title: "Chat refund invoice"
  });
  await fixture.ledgerService.syncInvoiceAfterCreate(paidInvoice);
  const settled = await fixture.ledgerService.markStripeCheckoutPaid({
    tenantId: "aquatrace",
    invoiceId: paidInvoice.id,
    checkoutSessionId: "cs_chat_refund",
    amount: 100,
    actorId: "stripe_webhook"
  });

  const technicianTools = createApprovalNexiTools({
    approvalQueue: fixture.approvalQueue,
    actorId: "tech_1",
    actorRole: "TECHNICIAN",
    crmRepository: fixture.repository,
    ledgerService: fixture.ledgerService
  });
  await assert.rejects(
    () => paymentTool(technicianTools, "listPayments").handler(tenant(), { q: "" }),
    /Only OWNER and OFFICE_ADMIN/
  );

  const officeTools = createApprovalNexiTools({
    approvalQueue: fixture.approvalQueue,
    actorId: "office_1",
    actorRole: "OFFICE_ADMIN",
    crmRepository: fixture.repository,
    ledgerService: fixture.ledgerService
  });

  const queuedTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: `refund ${settled.payment.id} for 40 because duplicate charge` }],
    tools: officeTools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(queuedTurn.toolRuns[0].name, "queueLedgerAction");
  assert.match(queuedTurn.answer, /You requested refund payment/i);
  assert.match(queuedTurn.answer, /refund/i);

  const revisedTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: `refund ${settled.payment.id} for 40 because duplicate charge` },
      { role: "assistant", content: queuedTurn.answer },
      { role: "user", content: "make changes. refund 35 instead" }
    ],
    pendingApproval: queuedTurn.pendingApproval,
    tools: officeTools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(revisedTurn.toolRuns[0].name, "revisePendingLedgerActionApproval");
  assert.match(revisedTurn.answer, /You requested refund payment/i);
  assert.match(revisedTurn.answer, /35.00/);

  const approvedTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [
      { role: "user", content: `refund ${settled.payment.id} for 40 because duplicate charge` },
      { role: "assistant", content: revisedTurn.answer },
      { role: "user", content: "yes" }
    ],
    pendingApproval: revisedTurn.pendingApproval,
    tools: officeTools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(approvedTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approvedTurn.answer, /approved and recorded refund/i);
  assert.match(approvedTurn.answer, /receipt review/i);
});
