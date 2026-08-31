import { randomUUID } from "node:crypto";
import {
  RailError,
  type Client,
  type ClientBillingProfile,
  type Credit,
  type Deposit,
  type EventBus,
  type Invoice,
  type InvoiceDeliveryMode,
  type InvoiceDeliveryRecord,
  type Job,
  type LedgerApplication,
  type LedgerStatusEntry,
  type LineItem,
  type Payment,
  type PaymentMethodDetails,
  type PaymentMethodKind,
  type PaymentSchedulePlan,
  type PaymentProvider,
  type Quote,
  type QuoteDiscount,
  type ReceiptReview,
  type ReceiptReviewAttachment,
  type ReceiptReviewChannel,
  type Refund
} from "@nexteam/core";
import type { NativeCrmRepository, TenantOwnedPatch } from "@nexteam/providers";
import type { CommsRail } from "../../../../../../../comms/gmailRegistry.js";
import type { MediaRepository } from "../../../../../../../fielddocs/mediaRepository.js";
import { renderFieldReportPdf } from "../../../../../../../fielddocs/reportService.js";
import type { ReviewSequenceService } from "../../../../../../../crm/reviewSequenceService.js";
import {
  invoiceTemplateVariables,
  resolveTemplateMessage
} from "../../../../../../../crm/communicationTemplates.js";
import {
  buildInvoiceDraftFromJobs,
  calculateInvoiceTotals,
  createInvoicePortalToken,
  deliveryDefaultsForInvoice,
  hashInvoicePortalToken,
  invoiceDeliveryMessage,
  invoicePortalUrlForInvoice
} from "../../invoiceStructure/domain/invoiceFoundation.js";
import {
  invoiceOpenForCollections,
  invoiceTotal,
  nextInvoiceStatusHistory,
  normalizeInvoiceLineItems
} from "../../invoiceStructure/domain/invoicePolicy.js";
import type { LedgerRepository } from "./ledgerRepository.js";
import { renderInvoicePdf } from "../../invoiceStructure/server/invoiceDocument.js";

export interface RecordInvoicePaymentInput {
  tenantId: string;
  invoiceId: string;
  amount: number;
  tipAmount?: number | undefined;
  provider: PaymentProvider;
  method: PaymentMethodKind;
  actorId: string;
  note?: string | undefined;
  savedCardId?: string | undefined;
  methodDetails?: PaymentMethodDetails | undefined;
  cardSummary?: Payment["cardSummary"] | undefined;
  externalIds?: Payment["externalIds"] | undefined;
  status?: Payment["status"] | undefined;
}

export interface StripeCheckoutCompleteInput {
  tenantId: string;
  invoiceId: string;
  checkoutSessionId: string;
  amount: number;
  tipAmount?: number | undefined;
  actorId?: string | undefined;
}

export interface LedgerActionPreview {
  action: "refund_payment" | "void_invoice" | "mark_bad_debt";
  title: string;
  body: string;
  payment?: Payment | undefined;
  invoice?: Invoice | undefined;
  amount?: number | undefined;
}

export interface PerformLedgerActionInput {
  tenantId: string;
  action: "refund_payment" | "void_invoice" | "mark_bad_debt";
  paymentId?: string | undefined;
  invoiceId?: string | undefined;
  amount?: number | undefined;
  reason?: string | undefined;
  actorId: string;
}

interface LedgerServiceDeps {
  crmRepository: NativeCrmRepository;
  ledgerRepository: LedgerRepository;
  fieldDocsRepository?: Pick<MediaRepository, "getChecklist" | "getMedia" | "getReport" | "listReports"> | undefined;
  eventBus?: EventBus | undefined;
  commsRail?: CommsRail | undefined;
  reviewSequenceService?: Pick<ReviewSequenceService, "maybeStartForJob"> | undefined;
}

function now(): string {
  return new Date().toISOString();
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function normalizedTipAmount(value: number | undefined): number {
  return roundMoney(Math.max(value ?? 0, 0));
}

function emptyHistory<TStatus extends string>(status: TStatus, actorId?: string, note?: string): Array<LedgerStatusEntry<TStatus>> {
  return [{
    status,
    changedAt: now(),
    ...(actorId ? { changedBy: actorId } : {}),
    ...(note ? { note } : {})
  }];
}

function appendHistory<TStatus extends string>(
  history: Array<LedgerStatusEntry<TStatus>> | undefined,
  status: TStatus,
  actorId?: string,
  note?: string
): Array<LedgerStatusEntry<TStatus>> {
  const entries = history ? [...history] : [];
  const last = entries.at(-1);
  if (last?.status === status && last.note === note && last.changedBy === actorId) {
    return entries;
  }
  entries.push({
    status,
    changedAt: now(),
    ...(actorId ? { changedBy: actorId } : {}),
    ...(note ? { note } : {})
  });
  return entries;
}

function requireLedgerRecord<T>(value: T | null | undefined, message: string, op: string): T {
  if (!value) {
    throw new RailError(message, { provider: "native", op, status: 404 });
  }
  return value;
}

function releasedApplication(application: LedgerApplication): boolean {
  return Boolean(application.releasedAt);
}

function activeApplications(applications: LedgerApplication[], invoiceId: string): LedgerApplication[] {
  return applications.filter((application) => application.invoiceId === invoiceId && !releasedApplication(application));
}

function sumApplications(applications: LedgerApplication[]): number {
  return roundMoney(applications.reduce((sum, application) => sum + application.amount, 0));
}

function invoiceCreatedAt(invoice: Invoice): string {
  return invoice.createdAt ?? invoice.sentAt ?? invoice.paidAt ?? now();
}

function quotePdfAttachment(quoteId: string): ReceiptReviewAttachment {
  return {
    id: `att_quote_pdf_${quoteId}`,
    kind: "quote_pdf",
    label: "Quote PDF",
    refId: quoteId,
    storageRef: `native://quotes/${quoteId}.pdf`,
    mime: "application/pdf"
  };
}

function placeholderFieldReportAttachment(jobId: string): ReceiptReviewAttachment {
  return {
    id: `att_field_report_${jobId}`,
    kind: "field_report",
    label: "Field report",
    refId: jobId,
    storageRef: `native://jobs/${jobId}/field-report`,
    mime: "application/pdf"
  };
}

function fieldReportAttachment(report: { id: string; title: string; pdfRef: string }): ReceiptReviewAttachment {
  return {
    id: `att_field_report_${report.id}`,
    kind: "field_report",
    label: report.title,
    refId: report.id,
    storageRef: report.pdfRef,
    mime: "application/pdf"
  };
}

async function latestPostedFieldReport(
  fieldDocsRepository: Pick<MediaRepository, "listReports"> | undefined,
  tenantId: string,
  jobId: string | undefined
) {
  if (!fieldDocsRepository || !jobId) {
    return null;
  }
  return (await fieldDocsRepository.listReports(tenantId))
    .filter((report) => report.jobId === jobId && report.status === "posted")
    .sort((left, right) => (right.postedAt ?? right.createdAt).localeCompare(left.postedAt ?? left.createdAt))[0] ?? null;
}

async function receiptAttachmentsForInvoice(
  invoice: Invoice,
  fieldDocsRepository?: Pick<MediaRepository, "listReports"> | undefined
): Promise<ReceiptReviewAttachment[]> {
  const latestReport = await latestPostedFieldReport(fieldDocsRepository, invoice.tenantId, invoice.jobId);
  return [
    {
      id: `att_invoice_pdf_${invoice.id}`,
      kind: "invoice_pdf",
      label: "Invoice PDF",
      refId: invoice.id,
      storageRef: `native://invoices/${invoice.id}.pdf`,
      mime: "application/pdf"
    },
    ...(invoice.quoteId ? [quotePdfAttachment(invoice.quoteId)] : []),
    ...(invoice.jobId ? [latestReport ? fieldReportAttachment(latestReport) : placeholderFieldReportAttachment(invoice.jobId)] : []),
    ...(invoice.jobId ? [{
      id: `att_job_photos_${invoice.jobId}`,
      kind: "photo" as const,
      label: "Job photos",
      refId: invoice.jobId,
      storageRef: `native://jobs/${invoice.jobId}/photos`,
      mime: "image/jpeg"
    }] : []),
    ...(invoice.jobId ? [{
      id: `att_job_files_${invoice.jobId}`,
      kind: "job_file" as const,
      label: "Other job files",
      refId: invoice.jobId,
      storageRef: `native://jobs/${invoice.jobId}/files`
    }] : [])
  ];
}

function receiptAttachmentsForQuoteDeposit(quote: Quote): ReceiptReviewAttachment[] {
  return [
    quotePdfAttachment(quote.id),
    ...(quote.jobId ? [{
      id: `att_quote_job_files_${quote.jobId}`,
      kind: "job_file" as const,
      label: "Other job files",
      refId: quote.jobId,
      storageRef: `native://jobs/${quote.jobId}/files`
    }] : [])
  ];
}

function refundableAmount(payment: Payment, refunds: Refund[]): number {
  const refunded = refunds
    .filter((refund) => refund.paymentId === payment.id && refund.status === "succeeded")
    .reduce((sum, refund) => sum + refund.amount, 0);
  return roundMoney(Math.max(payment.amount - refunded, 0));
}

function netPaymentApplied(payment: Payment, refunds: Refund[]): number {
  const refunded = refunds
    .filter((refund) => refund.paymentId === payment.id && refund.status === "succeeded")
    .reduce((sum, refund) => sum + refund.amount, 0);
  return roundMoney(Math.max(payment.appliedAmount - refunded, 0));
}

function savedCardLabel(cardBrand?: string, last4?: string): string {
  const prefix = cardBrand?.trim() || "Card";
  const suffix = last4?.trim() ? ` ending ${last4.trim()}` : "";
  return `${prefix}${suffix}`.trim();
}

function receiptHostedLink(input: { tenantId: string; invoiceId?: string | undefined; quoteId?: string | undefined; reviewId: string }): string {
  if (input.invoiceId) {
    return `/portal/invoices/${encodeURIComponent(input.invoiceId)}?tenantId=${encodeURIComponent(input.tenantId)}#receipt-${encodeURIComponent(input.reviewId)}`;
  }
  if (input.quoteId) {
    return `/portal/quotes/${encodeURIComponent(input.quoteId)}?tenantId=${encodeURIComponent(input.tenantId)}#receipt-${encodeURIComponent(input.reviewId)}`;
  }
  return `/receipts/${encodeURIComponent(input.reviewId)}?tenantId=${encodeURIComponent(input.tenantId)}`;
}

function defaultReceiptSubject(input: { kind: "payment" | "refund"; invoice?: Invoice | undefined; quote?: Quote | undefined }): string {
  const title = input.invoice?.title ?? input.quote?.title ?? "work";
  return input.kind === "refund"
    ? `Refund receipt - ${title}`
    : `Payment receipt - ${title}`;
}

function defaultReceiptBodyText(input: { kind: "payment" | "refund"; hostedLink: string }): string {
  if (input.kind === "refund") {
    return [
      "Your refund has been recorded.",
      `Open the secure receipt here: ${input.hostedLink}`
    ].join("\n");
  }
  return [
    "Your payment has been recorded.",
    `Open the secure receipt here: ${input.hostedLink}`
  ].join("\n");
}

function absolutePortalUrl(baseUrl: string, relativePath: string): string {
  return `${baseUrl.replace(/\/$/, "")}${relativePath.startsWith("/") ? relativePath : `/${relativePath}`}`;
}

function attachmentFilename(attachment: ReceiptReviewAttachment): string {
  switch (attachment.kind) {
    case "invoice_pdf":
      return "invoice.pdf";
    case "quote_pdf":
      return "quote.pdf";
    case "field_report":
      return "field-report.pdf";
    case "photo":
      return "photos.txt";
    case "job_file":
      return "job-files.txt";
    default:
      return `${attachment.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "attachment"}.txt`;
  }
}

async function attachmentPayloadBase64(
  attachment: ReceiptReviewAttachment,
  tenantId: string,
  invoice?: Invoice | undefined,
  fieldDocsRepository?: Pick<MediaRepository, "getChecklist" | "getMedia" | "getReport"> | undefined
): Promise<{ filename: string; mime: string; contentBase64: string }> {
  if (attachment.kind === "invoice_pdf" && invoice) {
    return {
      filename: attachmentFilename(attachment),
      mime: "application/pdf",
      contentBase64: renderInvoicePdf(invoice).toString("base64")
    };
  }
  if (attachment.kind === "field_report" && fieldDocsRepository && attachment.refId) {
    const report = await fieldDocsRepository.getReport(tenantId, attachment.refId);
    if (report) {
      const media = (await Promise.all(report.mediaIds.map((id) => fieldDocsRepository.getMedia(tenantId, id))))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const checklist = report.checklistId ? await fieldDocsRepository.getChecklist(tenantId, report.checklistId) : undefined;
      return {
        filename: attachmentFilename(attachment),
        mime: "application/pdf",
        contentBase64: renderFieldReportPdf({
          tenantId,
          jobId: report.jobId,
          propertyId: report.propertyId,
          visitId: report.visitId,
          title: report.title,
          findings: report.findings,
          media,
          ...(checklist ? { checklist } : {})
        }).toString("base64")
      };
    }
  }
  return {
    filename: attachmentFilename(attachment),
    mime: "text/plain",
    contentBase64: Buffer.from([
      attachment.label,
      attachment.storageRef ? `Source: ${attachment.storageRef}` : "",
      attachment.refId ? `Reference: ${attachment.refId}` : ""
    ].filter(Boolean).join("\n"), "utf8").toString("base64")
  };
}

async function emitEvent(eventBus: EventBus | undefined, input: {
  tenantId: string;
  type: Parameters<EventBus["emit"]>[0]["type"];
  payload: Record<string, unknown>;
}) {
  await eventBus?.emit(input);
}

export class LedgerService {
  constructor(private readonly deps: LedgerServiceDeps) {}

  private async loadTenantState(tenantId: string) {
    const [quotes, invoices, payments, deposits, credits, refunds, receiptReviews] = await Promise.all([
      this.deps.crmRepository.listQuotes(tenantId),
      this.deps.crmRepository.listInvoices(tenantId),
      this.deps.ledgerRepository.listPayments(tenantId),
      this.deps.ledgerRepository.listDeposits(tenantId),
      this.deps.ledgerRepository.listCredits(tenantId),
      this.deps.ledgerRepository.listRefunds(tenantId),
      this.deps.ledgerRepository.listReceiptReviews(tenantId)
    ]);
    return { quotes, invoices, payments, deposits, credits, refunds, receiptReviews };
  }

  private async ensureBillingProfile(tenantId: string, clientId: string): Promise<ClientBillingProfile> {
    const existing = await this.deps.ledgerRepository.getClientBillingProfile(tenantId, clientId);
    if (existing) {
      return existing;
    }
    const timestamp = now();
    return this.deps.ledgerRepository.upsertClientBillingProfile({
      id: `billing_profile_${clientId}`,
      tenantId,
      clientId,
      savedCards: [],
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  private async receiptRecipients(tenantId: string, clientId: string): Promise<{ client?: Client | undefined; emailRecipients: string[]; smsRecipients: string[] }> {
    const client = (await this.deps.crmRepository.listClients(tenantId)).find((record) => record.id === clientId);
    return {
      ...(client ? { client } : {}),
      emailRecipients: client?.emails ?? [],
      smsRecipients: client?.phones ?? []
    };
  }

  private async upsertSavedCardFromQuote(quote: Quote): Promise<string | undefined> {
    const deposit = quote.deposit;
    if (!deposit?.cardLast4 || !deposit.cardOnFileAuthorized) {
      return undefined;
    }
    const profile = await this.ensureBillingProfile(quote.tenantId, quote.clientId);
    const existing = profile.savedCards.find((card) =>
      card.sourceQuoteId === quote.id
      || (card.last4 === deposit.cardLast4 && card.brand === deposit.cardBrand && card.cardholderName === deposit.cardholderName)
    );
    const timestamp = now();
    const nextExternalIds = {
      ...(existing?.externalIds ?? {}),
      localReusableToken: existing?.externalIds?.localReusableToken ?? `local_card_${quote.id}`
    };
    const nextSavedCardBase = {
      id: existing?.id ?? `saved_card_${quote.id}`,
      label: savedCardLabel(deposit.cardBrand, deposit.cardLast4),
      ...(deposit.cardholderName ? { cardholderName: deposit.cardholderName } : {}),
      ...(deposit.cardBrand ? { brand: deposit.cardBrand } : {}),
      ...(deposit.cardLast4 ? { last4: deposit.cardLast4 } : {}),
      reusable: true,
      source: "quote_approval" as const,
      sourceQuoteId: quote.id,
      externalIds: nextExternalIds,
      createdAt: existing?.createdAt ?? deposit.capturedAt ?? timestamp
    };
    const savedCardChanged = !existing
      || existing.label !== nextSavedCardBase.label
      || existing.cardholderName !== nextSavedCardBase.cardholderName
      || existing.brand !== nextSavedCardBase.brand
      || existing.last4 !== nextSavedCardBase.last4
      || existing.source !== nextSavedCardBase.source
      || existing.sourceQuoteId !== nextSavedCardBase.sourceQuoteId
      || existing.externalIds?.stripePaymentMethodId !== nextSavedCardBase.externalIds?.stripePaymentMethodId
      || existing.externalIds?.paypalVaultTokenId !== nextSavedCardBase.externalIds?.paypalVaultTokenId
      || existing.externalIds?.localReusableToken !== nextSavedCardBase.externalIds?.localReusableToken;
    const savedCard = {
      ...nextSavedCardBase,
      updatedAt: existing
        ? (savedCardChanged ? timestamp : existing.updatedAt)
        : (deposit.capturedAt ?? timestamp)
    };
    const nextProfile: ClientBillingProfile = {
      ...profile,
      savedCards: [
        ...profile.savedCards.filter((card) => card.id !== savedCard.id),
        savedCard
      ],
      updatedAt: timestamp
    };
    await this.deps.ledgerRepository.upsertClientBillingProfile(nextProfile);
    return savedCard.id;
  }

  private async createReceiptReviewForPayment(input: {
    payment: Payment;
    invoice?: Invoice | undefined;
    quote?: Quote | undefined;
  }): Promise<ReceiptReview> {
    const existing = (await this.deps.ledgerRepository.listReceiptReviews(input.payment.tenantId))
      .find((review) => review.kind === "payment" && review.paymentId === input.payment.id);
    const receiptNumber = existing?.number ?? await this.deps.crmRepository.reserveDocumentNumber(input.payment.tenantId, "receipt");
    const timestamp = now();
    const attachments = input.invoice
      ? await receiptAttachmentsForInvoice(input.invoice, this.deps.fieldDocsRepository)
      : input.quote
        ? receiptAttachmentsForQuoteDeposit(input.quote)
        : [];
    const reviewId = existing?.id ?? `receipt_review_${input.payment.id}`;
    const recipients = await this.receiptRecipients(input.payment.tenantId, input.payment.clientId);
    const [settings, clients] = await Promise.all([
      this.deps.crmRepository.getCrmSettings(input.payment.tenantId),
      this.deps.crmRepository.listClients(input.payment.tenantId)
    ]);
    const client = clients.find((record) => record.id === input.payment.clientId);
    const hostedLink = receiptHostedLink({
      tenantId: input.payment.tenantId,
      reviewId,
      ...(input.invoice ? { invoiceId: input.invoice.id } : {}),
      ...(input.quote ? { quoteId: input.quote.id } : {})
    });
    const receiptTemplate = resolveTemplateMessage({
      settings,
      category: "payment_receipt",
      channel: "email",
      fallbackSubject: defaultReceiptSubject({ kind: "payment", invoice: input.invoice, quote: input.quote }),
      fallbackBodyText: defaultReceiptBodyText({ kind: "payment", hostedLink }),
      variables: invoiceTemplateVariables({
        invoice: input.invoice ?? ({
          id: input.quote?.id ?? input.payment.id,
          tenantId: input.payment.tenantId,
          clientId: input.payment.clientId,
          title: input.quote?.title ?? "Payment receipt",
          status: "paid",
          lineItems: [],
          totals: { subtotal: input.payment.amount, tax: 0, total: input.payment.amount },
          ledger: { depositApplied: 0, creditApplied: 0, paymentApplied: input.payment.amount, refundedAmount: 0, balanceDue: 0, overdue: false }
        } as Invoice),
        client,
        portalUrl: hostedLink,
        paymentAmount: input.payment.amount
      })
    });
    const review: ReceiptReview = existing ?? {
      id: reviewId,
      tenantId: input.payment.tenantId,
      number: receiptNumber,
      clientId: input.payment.clientId,
      kind: "payment",
      paymentId: input.payment.id,
      ...(input.invoice ? { invoiceId: input.invoice.id } : {}),
      ...(input.quote ? { quoteId: input.quote.id } : {}),
      ...(input.invoice?.jobId ? { jobId: input.invoice.jobId } : input.quote?.jobId ? { jobId: input.quote.jobId } : {}),
      status: "draft",
      attachments,
      subject: receiptTemplate.subject,
      bodyText: receiptTemplate.bodyText,
      emailRecipients: recipients.emailRecipients,
      smsRecipients: recipients.smsRecipients,
      sendChannels: recipients.emailRecipients.length ? ["email"] : recipients.smsRecipients.length ? ["sms"] : ["email"],
      hostedLink,
      statusHistory: emptyHistory("draft"),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const saved = await this.deps.ledgerRepository.upsertReceiptReview({
      ...review,
      number: review.number ?? receiptNumber,
      attachments,
      subject: review.subject || receiptTemplate.subject,
      bodyText: review.bodyText || receiptTemplate.bodyText,
      emailRecipients: review.emailRecipients?.length ? review.emailRecipients : recipients.emailRecipients,
      smsRecipients: review.smsRecipients?.length ? review.smsRecipients : recipients.smsRecipients,
      sendChannels: review.sendChannels?.length ? review.sendChannels : recipients.emailRecipients.length ? ["email"] : recipients.smsRecipients.length ? ["sms"] : ["email"],
      hostedLink: review.hostedLink || hostedLink,
      updatedAt: timestamp
    });
    if (!existing) {
      await emitEvent(this.deps.eventBus, {
        tenantId: saved.tenantId,
        type: "receipt.review_created",
        payload: { receiptReviewId: saved.id, paymentId: input.payment.id, invoiceId: input.invoice?.id ?? null, quoteId: input.quote?.id ?? null }
      });
    }
    return saved;
  }

  private async createReceiptReviewForRefund(input: { refund: Refund; invoice?: Invoice | undefined; payment?: Payment | undefined }): Promise<ReceiptReview> {
    const existing = (await this.deps.ledgerRepository.listReceiptReviews(input.refund.tenantId))
      .find((review) => review.kind === "refund" && review.refundId === input.refund.id);
    const receiptNumber = existing?.number ?? await this.deps.crmRepository.reserveDocumentNumber(input.refund.tenantId, "receipt");
    const timestamp = now();
    const attachments = input.invoice ? await receiptAttachmentsForInvoice(input.invoice, this.deps.fieldDocsRepository) : [];
    const reviewId = existing?.id ?? `receipt_review_${input.refund.id}`;
    const recipients = await this.receiptRecipients(input.refund.tenantId, input.refund.clientId);
    const [settings, clients] = await Promise.all([
      this.deps.crmRepository.getCrmSettings(input.refund.tenantId),
      this.deps.crmRepository.listClients(input.refund.tenantId)
    ]);
    const client = clients.find((record) => record.id === input.refund.clientId);
    const hostedLink = receiptHostedLink({
      tenantId: input.refund.tenantId,
      reviewId,
      ...(input.invoice ? { invoiceId: input.invoice.id } : {}),
      ...(input.payment?.quoteId ? { quoteId: input.payment.quoteId } : {})
    });
    const receiptTemplate = resolveTemplateMessage({
      settings,
      category: "payment_receipt",
      channel: "email",
      fallbackSubject: defaultReceiptSubject({ kind: "refund", invoice: input.invoice }),
      fallbackBodyText: defaultReceiptBodyText({ kind: "refund", hostedLink }),
      variables: invoiceTemplateVariables({
        invoice: input.invoice ?? ({
          id: input.payment?.quoteId ?? input.refund.id,
          tenantId: input.refund.tenantId,
          clientId: input.refund.clientId,
          title: "Refund receipt",
          status: "paid",
          lineItems: [],
          totals: { subtotal: input.refund.amount, tax: 0, total: input.refund.amount },
          ledger: { depositApplied: 0, creditApplied: 0, paymentApplied: 0, refundedAmount: input.refund.amount, balanceDue: 0, overdue: false }
        } as Invoice),
        client,
        portalUrl: hostedLink,
        paymentAmount: input.refund.amount
      })
    });
    const review: ReceiptReview = existing ?? {
      id: reviewId,
      tenantId: input.refund.tenantId,
      number: receiptNumber,
      clientId: input.refund.clientId,
      kind: "refund",
      ...(input.payment?.id ? { paymentId: input.payment.id } : {}),
      refundId: input.refund.id,
      ...(input.invoice ? { invoiceId: input.invoice.id } : {}),
      ...(input.payment?.quoteId ? { quoteId: input.payment.quoteId } : {}),
      ...(input.invoice?.jobId ? { jobId: input.invoice.jobId } : {}),
      status: "draft",
      attachments,
      subject: receiptTemplate.subject,
      bodyText: receiptTemplate.bodyText,
      emailRecipients: recipients.emailRecipients,
      smsRecipients: recipients.smsRecipients,
      sendChannels: recipients.emailRecipients.length ? ["email"] : recipients.smsRecipients.length ? ["sms"] : ["email"],
      hostedLink,
      statusHistory: emptyHistory("draft"),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return this.deps.ledgerRepository.upsertReceiptReview({
      ...review,
      number: review.number ?? receiptNumber,
      attachments,
      subject: review.subject || receiptTemplate.subject,
      bodyText: review.bodyText || receiptTemplate.bodyText,
      emailRecipients: review.emailRecipients?.length ? review.emailRecipients : recipients.emailRecipients,
      smsRecipients: review.smsRecipients?.length ? review.smsRecipients : recipients.smsRecipients,
      sendChannels: review.sendChannels?.length ? review.sendChannels : recipients.emailRecipients.length ? ["email"] : recipients.smsRecipients.length ? ["sms"] : ["email"],
      hostedLink: review.hostedLink || hostedLink,
      updatedAt: timestamp
    });
  }

  private async applyAvailableDepositsAndCredits(invoice: Invoice): Promise<void> {
    const [deposits, credits] = await Promise.all([
      this.deps.ledgerRepository.listDeposits(invoice.tenantId),
      this.deps.ledgerRepository.listCredits(invoice.tenantId)
    ]);
    let remaining = roundMoney(invoiceTotal(invoice)
      - sumApplications(deposits.flatMap((deposit) => activeApplications(deposit.applications, invoice.id)))
      - sumApplications(credits.flatMap((credit) => activeApplications(credit.applications, invoice.id))));
    if (remaining <= 0) {
      return;
    }

    const timestamp = now();
    for (const deposit of deposits
      .filter((record) => record.clientId === invoice.clientId && record.availableAmount > 0)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
      if (remaining <= 0) {
        break;
      }
      const appliedAmount = roundMoney(Math.min(remaining, deposit.availableAmount));
      if (appliedAmount <= 0) {
        continue;
      }
      const nextAvailable = roundMoney(deposit.availableAmount - appliedAmount);
      const nextApplications = [...deposit.applications, { invoiceId: invoice.id, amount: appliedAmount, appliedAt: timestamp }];
      await this.deps.ledgerRepository.upsertDeposit({
        ...deposit,
        invoiceId: invoice.id,
        availableAmount: nextAvailable,
        status: nextAvailable === 0 ? "applied" : "partially_applied",
        applications: nextApplications,
        statusHistory: appendHistory(deposit.statusHistory, nextAvailable === 0 ? "applied" : "partially_applied", undefined, `Auto-applied ${appliedAmount.toFixed(2)} to invoice ${invoice.number ?? invoice.id}.`),
        updatedAt: timestamp
      });
      remaining = roundMoney(remaining - appliedAmount);
    }

    if (remaining <= 0) {
      return;
    }

    for (const credit of credits
      .filter((record) => record.clientId === invoice.clientId && record.availableAmount > 0)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
      if (remaining <= 0) {
        break;
      }
      const appliedAmount = roundMoney(Math.min(remaining, credit.availableAmount));
      if (appliedAmount <= 0) {
        continue;
      }
      const nextAvailable = roundMoney(credit.availableAmount - appliedAmount);
      const nextApplications = [...credit.applications, { invoiceId: invoice.id, amount: appliedAmount, appliedAt: timestamp }];
      await this.deps.ledgerRepository.upsertCredit({
        ...credit,
        invoiceId: invoice.id,
        availableAmount: nextAvailable,
        status: nextAvailable === 0 ? "applied" : "partially_applied",
        applications: nextApplications,
        statusHistory: appendHistory(credit.statusHistory, nextAvailable === 0 ? "applied" : "partially_applied", undefined, `Auto-applied ${appliedAmount.toFixed(2)} to invoice ${invoice.number ?? invoice.id}.`),
        updatedAt: timestamp
      });
      remaining = roundMoney(remaining - appliedAmount);
    }
  }

  private async recalculateInvoice(invoice: Invoice): Promise<Invoice> {
    const [payments, deposits, credits, refunds] = await Promise.all([
      this.deps.ledgerRepository.listPayments(invoice.tenantId),
      this.deps.ledgerRepository.listDeposits(invoice.tenantId),
      this.deps.ledgerRepository.listCredits(invoice.tenantId),
      this.deps.ledgerRepository.listRefunds(invoice.tenantId)
    ]);
    const depositApplied = sumApplications(
      deposits
        .filter((deposit) => deposit.clientId === invoice.clientId)
        .flatMap((deposit) => activeApplications(deposit.applications, invoice.id))
    );
    const creditApplied = sumApplications(
      credits
        .filter((credit) => credit.clientId === invoice.clientId)
        .flatMap((credit) => activeApplications(credit.applications, invoice.id))
    );
    const relevantPayments = payments.filter((payment) => payment.invoiceId === invoice.id);
    const paymentApplied = roundMoney(relevantPayments.reduce((sum, payment) => sum + netPaymentApplied(payment, refunds), 0));
    const refundedAmount = roundMoney(relevantPayments.reduce((sum, payment) => sum + (payment.appliedAmount - netPaymentApplied(payment, refunds)), 0));
    const baseBalance = roundMoney(Math.max(invoiceTotal(invoice) - depositApplied - creditApplied - paymentApplied, 0));
    let nextStatus = invoice.status;
    let writtenOffAmount = 0;
    if (invoice.status === "bad_debt") {
      writtenOffAmount = baseBalance;
    } else if (invoice.status === "void") {
      writtenOffAmount = 0;
    } else if (baseBalance <= 0) {
      nextStatus = "paid";
    } else if (depositApplied > 0 || creditApplied > 0 || paymentApplied > 0) {
      nextStatus = "partial_pay";
    } else if (invoice.status === "paid" || invoice.status === "partial_pay") {
      nextStatus = "awaiting_payment";
    }
    const overdue = Boolean(nextStatus === "awaiting_payment"
      && invoice.dueAt
      && invoice.dueAt < now()
      && baseBalance > 0);

    const nextLedger = {
      depositApplied,
      creditApplied,
      paymentApplied,
      refundedAmount,
      balanceDue: invoice.status === "bad_debt" || invoice.status === "void" ? 0 : baseBalance,
      overdue,
      ...(invoice.status === "bad_debt" ? { writtenOffAmount } : {})
    };
    const patch: TenantOwnedPatch<Invoice> = {
      tenantId: invoice.tenantId,
      status: nextStatus,
      ...(nextStatus === "paid" ? { paidAt: invoice.paidAt ?? now() } : {}),
      ledger: nextLedger,
      statusHistory: nextStatus === invoice.status ? invoice.statusHistory : nextInvoiceStatusHistory(invoice, nextStatus, undefined, "Ledger reconciliation updated invoice status.")
    };
    const saved = await this.deps.crmRepository.updateInvoice(invoice.id, patch);
    if (invoice.status !== "paid" && saved.status === "paid" && saved.jobId) {
      await this.deps.reviewSequenceService?.maybeStartForJob({
        tenantId: saved.tenantId,
        jobId: saved.jobId,
        source: "automatic"
      });
    }
    return saved;
  }

  private async releaseInvoiceApplications(tenantId: string, invoiceId: string, actorId: string, note: string): Promise<void> {
    const [deposits, credits] = await Promise.all([
      this.deps.ledgerRepository.listDeposits(tenantId),
      this.deps.ledgerRepository.listCredits(tenantId)
    ]);
    const timestamp = now();
    for (const deposit of deposits.filter((record) => record.applications.some((application) => application.invoiceId === invoiceId && !releasedApplication(application)))) {
      let released = 0;
      const applications = deposit.applications.map((application) => {
        if (application.invoiceId !== invoiceId || releasedApplication(application)) {
          return application;
        }
        released += application.amount;
        return { ...application, releasedAt: timestamp, releasedBy: actorId, note };
      });
      const nextAvailable = roundMoney(deposit.availableAmount + released);
      await this.deps.ledgerRepository.upsertDeposit({
        ...deposit,
        availableAmount: nextAvailable,
        status: nextAvailable > 0 ? "available" : deposit.status,
        applications,
        statusHistory: appendHistory(deposit.statusHistory, nextAvailable > 0 ? "available" : deposit.status, actorId, note),
        updatedAt: timestamp
      });
    }
    for (const credit of credits.filter((record) => record.applications.some((application) => application.invoiceId === invoiceId && !releasedApplication(application)))) {
      let released = 0;
      const applications = credit.applications.map((application) => {
        if (application.invoiceId !== invoiceId || releasedApplication(application)) {
          return application;
        }
        released += application.amount;
        return { ...application, releasedAt: timestamp, releasedBy: actorId, note };
      });
      const nextAvailable = roundMoney(credit.availableAmount + released);
      await this.deps.ledgerRepository.upsertCredit({
        ...credit,
        availableAmount: nextAvailable,
        status: nextAvailable > 0 ? "available" : credit.status,
        applications,
        statusHistory: appendHistory(credit.statusHistory, nextAvailable > 0 ? "available" : credit.status, actorId, note),
        updatedAt: timestamp
      });
    }
  }

  async reconcileTenant(tenantId: string): Promise<void> {
    const state = await this.loadTenantState(tenantId);
    for (const quote of state.quotes.filter((record) => record.deposit?.capturedAt)) {
      await this.syncQuoteDepositBridge(quote);
    }
    const freshInvoices = (await this.deps.crmRepository.listInvoices(tenantId))
      .sort((left, right) => invoiceCreatedAt(left).localeCompare(invoiceCreatedAt(right)));
    for (const invoice of freshInvoices.filter(invoiceOpenForCollections)) {
      await this.applyAvailableDepositsAndCredits(invoice);
      await this.recalculateInvoice(invoice);
    }
    for (const invoice of freshInvoices.filter((record) => !invoiceOpenForCollections(record) || record.status === "paid")) {
      await this.recalculateInvoice(invoice);
    }
  }

  async syncQuoteDepositBridge(quote: Quote): Promise<{ payment?: Payment | undefined; deposit?: Deposit | undefined; savedCardId?: string | undefined }> {
    const bridge = quote.deposit;
    if (!bridge?.capturedAt) {
      return {};
    }
    const [payments, deposits] = await Promise.all([
      this.deps.ledgerRepository.listPayments(quote.tenantId),
      this.deps.ledgerRepository.listDeposits(quote.tenantId)
    ]);
    const existingPayment = payments.find((payment) => payment.quoteId === quote.id && payment.provider === "quote_bridge");
    const existingDeposit = deposits.find((deposit) => deposit.quoteId === quote.id && deposit.source === "quote_approval");
    const timestamp = now();
    const savedCardId = await this.upsertSavedCardFromQuote(quote);
    const payment = existingPayment ?? await this.deps.ledgerRepository.upsertPayment({
      id: `payment_${quote.id}`,
      tenantId: quote.tenantId,
      clientId: quote.clientId,
      quoteId: quote.id,
      provider: "quote_bridge",
      method: "card",
      status: "succeeded",
      amount: bridge.amount,
      appliedAmount: 0,
      currency: "usd",
      capturedAt: bridge.capturedAt,
      ...(savedCardId ? { savedCardId } : {}),
      cardSummary: {
        ...(bridge.cardholderName ? { cardholderName: bridge.cardholderName } : {}),
        ...(bridge.cardBrand ? { brand: bridge.cardBrand } : {}),
        ...(bridge.cardLast4 ? { last4: bridge.cardLast4 } : {})
      },
      statusHistory: emptyHistory("succeeded", undefined, "Migrated quote deposit bridge into payment ledger."),
      createdAt: bridge.capturedAt,
      updatedAt: timestamp
    });
    const deposit = existingDeposit ?? await this.deps.ledgerRepository.upsertDeposit({
      id: `deposit_${quote.id}`,
      tenantId: quote.tenantId,
      clientId: quote.clientId,
      paymentId: payment.id,
      quoteId: quote.id,
      ...(quote.jobId ? { invoiceId: undefined } : {}),
      source: "quote_approval",
      amount: bridge.amount,
      availableAmount: bridge.amount,
      status: "available",
      applications: [],
      statusHistory: emptyHistory("available", undefined, "Migrated quote deposit bridge into deposit ledger."),
      createdAt: bridge.capturedAt,
      updatedAt: timestamp
    });
    if (!existingPayment) {
      await emitEvent(this.deps.eventBus, {
        tenantId: quote.tenantId,
        type: "payment.created",
        payload: { paymentId: payment.id, quoteId: quote.id, clientId: quote.clientId, amount: payment.amount, provider: payment.provider }
      });
    }
    await this.createReceiptReviewForPayment({ payment, quote });
    return { payment, deposit, savedCardId };
  }

  async syncInvoiceAfterCreate(invoice: Invoice): Promise<Invoice> {
    await this.reconcileTenant(invoice.tenantId);
    const refreshed = (await this.deps.crmRepository.listInvoices(invoice.tenantId)).find((record) => record.id === invoice.id);
    if (!refreshed) {
      throw new RailError(`Invoice ${invoice.id} was not found after ledger sync.`, { provider: "native", op: "syncInvoiceAfterCreate", status: 404 });
    }
    return refreshed;
  }

  async listInvoices(tenantId: string): Promise<Invoice[]> {
    await this.reconcileTenant(tenantId);
    return this.deps.crmRepository.listInvoices(tenantId);
  }

  async composeInvoiceFromJobs(input: {
    tenantId: string;
    jobIds: string[];
    actorId: string;
    title?: string | undefined;
    discount?: QuoteDiscount | undefined;
    taxRate?: number | undefined;
    terms?: string | undefined;
    paymentSchedule?: PaymentSchedulePlan | undefined;
  }): Promise<{ invoice: Invoice; jobs: Job[] }> {
    await this.reconcileTenant(input.tenantId);
    const uniqueJobIds = [...new Set(input.jobIds.map((jobId) => jobId.trim()).filter(Boolean))];
    if (!uniqueJobIds.length) {
      throw new RailError("Pick at least one job before combining an invoice.", { provider: "native", op: "composeInvoiceFromJobs", status: 400 });
    }
    const [jobs, invoices, settings] = await Promise.all([
      this.deps.crmRepository.listJobs(input.tenantId),
      this.deps.crmRepository.listInvoices(input.tenantId),
      this.deps.crmRepository.getCrmSettings(input.tenantId)
    ]);
    const selectedJobs = uniqueJobIds.map((jobId) => {
      const job = jobs.find((candidate) => candidate.id === jobId);
      if (!job) {
        throw new RailError(`Native job ${jobId} was not found.`, { provider: "native", op: "composeInvoiceFromJobs", status: 404 });
      }
      const existingInvoice = invoices.find((invoice) => invoice.jobIds?.includes(job.id) && invoice.status !== "void")
        ?? invoices.find((invoice) => invoice.jobId === job.id && invoice.status !== "void");
      if (existingInvoice) {
        throw new RailError(`Job ${job.number ?? job.id} already has an invoice attached.`, { provider: "native", op: "composeInvoiceFromJobs", status: 409 });
      }
      return job;
    });
    const clientIds = [...new Set(selectedJobs.map((job) => job.clientId))];
    if (clientIds.length !== 1) {
      throw new RailError("Combined invoices can only include jobs from one client at a time.", { provider: "native", op: "composeInvoiceFromJobs", status: 409 });
    }
    const quoteIds = [...new Set(selectedJobs.map((job) => job.quoteId).filter((value): value is string => Boolean(value)))];
    const requestIds = [...new Set(selectedJobs.map((job) => job.requestId).filter((value): value is string => Boolean(value)))];
    const paymentSchedule = input.paymentSchedule
      ?? (selectedJobs.length === 1 ? selectedJobs[0]?.paymentSchedule : undefined);
    const draft = buildInvoiceDraftFromJobs({
      tenantId: input.tenantId,
      jobs: selectedJobs,
      settings,
      number: await this.deps.crmRepository.reserveDocumentNumber(input.tenantId, "invoice"),
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      ...(quoteIds.length === 1 ? { quoteId: quoteIds[0] } : {}),
      ...(requestIds.length === 1 ? { requestId: requestIds[0] } : {}),
      ...(selectedJobs.length === 1 && selectedJobs[0]?.intake ? { intake: selectedJobs[0].intake } : {}),
      ...(paymentSchedule ? { paymentSchedule } : {}),
      ...(input.discount ? { discount: input.discount } : {}),
      ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
      ...(input.terms !== undefined ? { terms: input.terms } : {})
    });
    const created = await this.deps.crmRepository.createInvoice(draft);
    const synced = await this.syncInvoiceAfterCreate(created);
    await emitEvent(this.deps.eventBus, {
      tenantId: synced.tenantId,
      type: "invoice.created",
      payload: {
        invoiceId: synced.id,
        clientId: synced.clientId,
        actorId: input.actorId,
        jobIds: selectedJobs.map((job) => job.id)
      }
    });
    return { invoice: synced, jobs: selectedJobs };
  }

  async getInvoice(tenantId: string, invoiceId: string): Promise<Invoice | null> {
    await this.reconcileTenant(tenantId);
    return (await this.deps.crmRepository.listInvoices(tenantId)).find((invoice) => invoice.id === invoiceId) ?? null;
  }

  async getInvoiceDetail(tenantId: string, invoiceId: string): Promise<{
    invoice: Invoice;
    client?: Client | undefined;
    payments: Payment[];
    refunds: Refund[];
    receiptReviews: ReceiptReview[];
    billingProfile?: ClientBillingProfile | undefined;
  }> {
    const invoice = requireLedgerRecord(await this.getInvoice(tenantId, invoiceId), `Invoice ${invoiceId} was not found.`, "getInvoiceDetail");
    const [payments, refunds, receiptReviews, billingProfile, client] = await Promise.all([
      this.deps.ledgerRepository.listPayments(tenantId).then((records) => records.filter((record) => record.invoiceId === invoice.id)),
      this.deps.ledgerRepository.listRefunds(tenantId).then((records) => records.filter((record) => record.invoiceId === invoice.id)),
      this.deps.ledgerRepository.listReceiptReviews(tenantId).then((records) => records.filter((record) => record.invoiceId === invoice.id)),
      this.deps.ledgerRepository.getClientBillingProfile(tenantId, invoice.clientId),
      this.deps.crmRepository.listClients(tenantId).then((records) => records.find((record) => record.id === invoice.clientId))
    ]);
    return {
      invoice,
      ...(client ? { client } : {}),
      payments,
      refunds,
      receiptReviews,
      ...(billingProfile ? { billingProfile } : {})
    };
  }

  async updateInvoiceDraft(input: {
    tenantId: string;
    invoiceId: string;
    actorId: string;
    title?: string | undefined;
    lineItems?: LineItem[] | undefined;
    discount?: QuoteDiscount | undefined;
    taxRate?: number | undefined;
    dueAt?: string | undefined;
    terms?: string | undefined;
    paymentSchedule?: PaymentSchedulePlan | undefined;
    deliveryDefaults?: Invoice["deliveryDefaults"] | undefined;
    customFields?: Invoice["customFields"] | undefined;
  }): Promise<Invoice> {
    const invoice = requireLedgerRecord(await this.getInvoice(input.tenantId, input.invoiceId), `Invoice ${input.invoiceId} was not found.`, "updateInvoiceDraft");
    if (invoice.status !== "draft" && input.lineItems) {
      throw new RailError("Line items can only be edited while the invoice is still a draft.", { provider: "native", op: "updateInvoiceDraft", status: 409 });
    }
    const nextLineItems = input.lineItems ? normalizeInvoiceLineItems(input.lineItems) : invoice.lineItems;
    const totals = calculateInvoiceTotals(nextLineItems, input.discount ?? invoice.discount, input.taxRate ?? invoice.totals.taxRate ?? 0);
    const saved = await this.deps.crmRepository.updateInvoice(invoice.id, {
      tenantId: invoice.tenantId,
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      ...(input.lineItems ? { lineItems: nextLineItems } : {}),
      totals,
      ...(input.discount !== undefined ? { discount: input.discount } : {}),
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
      ...(input.terms !== undefined ? { terms: input.terms } : {}),
      ...(input.paymentSchedule !== undefined ? { paymentSchedule: input.paymentSchedule } : {}),
      ...(input.deliveryDefaults !== undefined ? { deliveryDefaults: input.deliveryDefaults } : {}),
      ...(input.customFields !== undefined ? { customFields: input.customFields } : {}),
      updatedAt: now(),
      ledger: {
        ...(invoice.ledger ?? { depositApplied: 0, creditApplied: 0, paymentApplied: 0, refundedAmount: 0, balanceDue: totals.total, overdue: false }),
        balanceDue: totals.total,
        overdue: false
      },
      statusHistory: nextInvoiceStatusHistory(invoice, invoice.status, input.actorId, "Invoice draft updated.")
    });
    await this.applyAvailableDepositsAndCredits(saved);
    return this.recalculateInvoice(saved);
  }

  async sendInvoice(input: {
    tenantId: string;
    invoiceId: string;
    actorId: string;
    mode: InvoiceDeliveryMode;
    target?: string | undefined;
    note?: string | undefined;
    subject?: string | undefined;
    bodyText?: string | undefined;
    includePdf?: boolean | undefined;
    includeSummary?: boolean | undefined;
    includePayLink?: boolean | undefined;
    includeHostedLink?: boolean | undefined;
    publicBaseUrl: string;
  }): Promise<{ invoice: Invoice; portalUrl: string; delivery: InvoiceDeliveryRecord }> {
    const invoice = requireLedgerRecord(await this.getInvoice(input.tenantId, input.invoiceId), `Invoice ${input.invoiceId} was not found.`, "sendInvoice");
    const settings = await this.deps.crmRepository.getCrmSettings(input.tenantId);
    const deliveryDefaults = deliveryDefaultsForInvoice(settings, invoice.deliveryDefaults);
    const client = (await this.deps.crmRepository.listClients(input.tenantId)).find((record) => record.id === invoice.clientId);
    const portalToken = createInvoicePortalToken();
    const portalPath = invoicePortalUrlForInvoice(invoice, portalToken);
    const portalUrl = absolutePortalUrl(input.publicBaseUrl, portalPath);
    const fallback = invoiceDeliveryMessage({
      invoice,
      mode: input.mode === "mark_sent" ? "email" : input.mode,
      portalUrl,
      deliveryDefaults
    });
    const rendered = resolveTemplateMessage({
      settings,
      category: "invoice_send",
      channel: input.mode === "sms" ? "sms" : "email",
      fallbackSubject: fallback.subject,
      fallbackBodyText: fallback.bodyText,
      variables: invoiceTemplateVariables({
        invoice,
        client,
        portalUrl,
        includePayLink: input.includePayLink ?? (input.mode === "sms" ? deliveryDefaults.smsIncludePayLink : deliveryDefaults.emailIncludePayLink),
        includeHostedLink: input.includeHostedLink ?? (input.mode === "sms" ? deliveryDefaults.smsIncludeHostedLink : true),
        includeSummaryLine: input.includeSummary ?? (input.mode === "sms" ? deliveryDefaults.smsIncludeSummary : deliveryDefaults.emailIncludeSummary)
      })
    });
    if (input.mode !== "mark_sent" && !rendered.enabled) {
      throw new RailError(`The invoice ${input.mode} channel is disabled in Settings.`, { provider: "native", op: "sendInvoice", status: 409 });
    }
    const subject = input.subject?.trim() || rendered.subject;
    const bodyText = input.bodyText?.trim() || rendered.bodyText;
    const sentAt = now();
    const delivery: InvoiceDeliveryRecord = {
      id: `invoice_delivery_${randomUUID()}`,
      mode: input.mode,
      sentAt,
      ...(input.target ? { target: input.target } : {}),
      sentBy: input.actorId,
      ...(subject ? { subject } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      includePdf: input.includePdf ?? deliveryDefaults.emailIncludePdf,
      includeSummary: input.includeSummary ?? (input.mode === "sms" ? deliveryDefaults.smsIncludeSummary : deliveryDefaults.emailIncludeSummary),
      includePayLink: input.includePayLink ?? (input.mode === "sms" ? deliveryDefaults.smsIncludePayLink : deliveryDefaults.emailIncludePayLink),
      includeHostedLink: input.includeHostedLink ?? (input.mode === "sms" ? deliveryDefaults.smsIncludeHostedLink : true)
    };
    if (input.mode === "email") {
      const target = input.target?.trim() || client?.emails[0];
      if (!target) {
        throw new RailError("An email destination is required to send this invoice.", { provider: "native", op: "sendInvoice", status: 400 });
      }
      if (!this.deps.commsRail?.sendAdapter) {
        throw new RailError("Email delivery is not configured for this tenant.", { provider: "native", op: "sendInvoice", status: 501 });
      }
      const receipt = await this.deps.commsRail.sendAdapter.sendEmail({
        tenantId: invoice.tenantId,
        mailbox: this.deps.commsRail.sendAdapter.mailbox,
        to: [target],
        subject,
        bodyText,
        attachments: delivery.includePdf ? [{
          filename: "invoice.pdf",
          mime: "application/pdf",
          contentBase64: renderInvoicePdf(invoice, client).toString("base64")
        }] : []
      });
      delivery.target = target;
      delivery.receiptId = receipt.id;
    } else if (input.mode === "sms") {
      const target = input.target?.trim() || client?.phones[0];
      if (!target) {
        throw new RailError("A phone number is required to text this invoice.", { provider: "native", op: "sendInvoice", status: 400 });
      }
      if (!this.deps.commsRail?.sendSms) {
        throw new RailError("SMS delivery is not configured for this tenant.", { provider: "native", op: "sendInvoice", status: 501 });
      }
      const receipt = await this.deps.commsRail.sendSms({
        tenantId: invoice.tenantId,
        to: target,
        body: bodyText
      });
      delivery.target = target;
      delivery.receiptId = receipt.id;
    }
    const nextStatus = invoice.status === "draft" ? "sent" : invoice.status === "partial_pay" ? "partial_pay" : invoice.status === "paid" ? "paid" : "awaiting_payment";
    const saved = await this.deps.crmRepository.updateInvoice(invoice.id, {
      tenantId: invoice.tenantId,
      status: nextStatus,
      sentAt,
      updatedAt: sentAt,
      portal: {
        ...(invoice.portal ?? {}),
        tokenHash: hashInvoicePortalToken(portalToken),
        tokenIssuedAt: sentAt
      },
      deliveryDefaults,
      delivery: [...(invoice.delivery ?? []), delivery],
      statusHistory: nextInvoiceStatusHistory(invoice, nextStatus, input.actorId, "Invoice delivered.")
    });
    await emitEvent(this.deps.eventBus, {
      tenantId: saved.tenantId,
      type: "invoice.sent",
      payload: {
        invoiceId: saved.id,
        mode: input.mode,
        sentAt,
        ...(delivery.target ? { target: delivery.target } : {})
      }
    });
    return { invoice: saved, portalUrl, delivery };
  }

  async updateReceiptReviewDraft(input: {
    tenantId: string;
    receiptReviewId: string;
    actorId: string;
    subject?: string | undefined;
    bodyText?: string | undefined;
    emailRecipients?: string[] | undefined;
    smsRecipients?: string[] | undefined;
    sendChannels?: ReceiptReviewChannel[] | undefined;
    attachmentIds?: string[] | undefined;
  }): Promise<ReceiptReview> {
    const existing = requireLedgerRecord(await this.deps.ledgerRepository.getReceiptReview(input.tenantId, input.receiptReviewId), `Receipt review ${input.receiptReviewId} was not found.`, "updateReceiptReviewDraft");
    const attachments = input.attachmentIds?.length
      ? existing.attachments.filter((attachment: ReceiptReviewAttachment) => input.attachmentIds?.includes(attachment.id))
      : existing.attachments;
    const nextChannels = input.sendChannels ?? existing.sendChannels;
    const next = await this.deps.ledgerRepository.upsertReceiptReview({
      ...existing,
      subject: input.subject?.trim() || existing.subject,
      bodyText: input.bodyText?.trim() || existing.bodyText,
      emailRecipients: input.emailRecipients ?? existing.emailRecipients,
      smsRecipients: input.smsRecipients ?? existing.smsRecipients,
      sendChannels: nextChannels,
      attachments,
      status: "ready_to_send",
      statusHistory: appendHistory(existing.statusHistory, "ready_to_send", input.actorId, "Receipt review updated."),
      updatedAt: now()
    });
    return next;
  }

  async sendReceiptReview(input: {
    tenantId: string;
    receiptReviewId: string;
    actorId: string;
    publicBaseUrl: string;
    subject?: string | undefined;
    bodyText?: string | undefined;
    emailRecipients?: string[] | undefined;
    smsRecipients?: string[] | undefined;
    sendChannels?: ReceiptReviewChannel[] | undefined;
    attachmentIds?: string[] | undefined;
  }): Promise<{ receiptReview: ReceiptReview; invoice?: Invoice | undefined }> {
    const paymentSettings = (await this.deps.crmRepository.getCrmSettings(input.tenantId)).workspaceSettings.payments;
    if (!paymentSettings.receiptsEnabled) {
      throw new RailError("Receipts are disabled in this tenant's Payment settings.", { provider: "native", op: "sendReceiptReview", status: 409 });
    }
    const review = await this.updateReceiptReviewDraft({
      tenantId: input.tenantId,
      receiptReviewId: input.receiptReviewId,
      actorId: input.actorId,
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.bodyText !== undefined ? { bodyText: input.bodyText } : {}),
      ...(input.emailRecipients !== undefined ? { emailRecipients: input.emailRecipients } : {}),
      ...(input.smsRecipients !== undefined ? { smsRecipients: input.smsRecipients } : {}),
      ...(input.sendChannels !== undefined ? { sendChannels: input.sendChannels } : {}),
      ...(input.attachmentIds !== undefined ? { attachmentIds: input.attachmentIds } : {})
    });
    const invoice = review.invoiceId ? await this.getInvoice(input.tenantId, review.invoiceId) : null;
    const sendHistory = [...(review.sendHistory ?? [])];
    if (review.sendChannels.includes("email")) {
      if (!this.deps.commsRail?.sendAdapter) {
        throw new RailError("Email delivery is not configured for this tenant.", { provider: "native", op: "sendReceiptReview", status: 501 });
      }
      for (const target of review.emailRecipients) {
        const attachments = await Promise.all(
          review.attachments.map((attachment) =>
            attachmentPayloadBase64(attachment, input.tenantId, invoice ?? undefined, this.deps.fieldDocsRepository)
          )
        );
        const receipt = await this.deps.commsRail.sendAdapter.sendEmail({
          tenantId: input.tenantId,
          mailbox: this.deps.commsRail.sendAdapter.mailbox,
          to: [target],
          subject: review.subject,
          bodyText: `${review.bodyText}\n\nSecure receipt link: ${absolutePortalUrl(input.publicBaseUrl, review.hostedLink)}`,
          attachments
        });
        sendHistory.push({
          id: `receipt_send_${randomUUID()}`,
          channel: "email",
          target,
          sentAt: now(),
          receiptId: receipt.id
        });
      }
    }
    if (review.sendChannels.includes("sms")) {
      if (!this.deps.commsRail?.sendSms) {
        throw new RailError("SMS delivery is not configured for this tenant.", { provider: "native", op: "sendReceiptReview", status: 501 });
      }
      for (const target of review.smsRecipients) {
        await this.deps.commsRail.sendSms({
          tenantId: input.tenantId,
          to: target,
          body: `${review.bodyText}\n\nSecure receipt link: ${absolutePortalUrl(input.publicBaseUrl, review.hostedLink)}`
        });
        sendHistory.push({
          id: `receipt_send_${randomUUID()}`,
          channel: "sms",
          target,
          sentAt: now()
        });
      }
    }
    const sentAt = now();
    const saved = await this.deps.ledgerRepository.upsertReceiptReview({
      ...review,
      status: "sent",
      sentAt,
      sendHistory,
      statusHistory: appendHistory(review.statusHistory, "sent", input.actorId, "Receipt sent."),
      updatedAt: sentAt
    });
    return {
      receiptReview: saved,
      ...(invoice ? { invoice } : {})
    };
  }

  async listPayments(tenantId: string): Promise<Payment[]> {
    await this.reconcileTenant(tenantId);
    return this.deps.ledgerRepository.listPayments(tenantId);
  }

  async listDeposits(tenantId: string): Promise<Deposit[]> {
    await this.reconcileTenant(tenantId);
    return this.deps.ledgerRepository.listDeposits(tenantId);
  }

  async listRefunds(tenantId: string): Promise<Refund[]> {
    await this.reconcileTenant(tenantId);
    return this.deps.ledgerRepository.listRefunds(tenantId);
  }

  async listCredits(tenantId: string): Promise<Credit[]> {
    await this.reconcileTenant(tenantId);
    return this.deps.ledgerRepository.listCredits(tenantId);
  }

  async listReceiptReviews(tenantId: string): Promise<ReceiptReview[]> {
    await this.reconcileTenant(tenantId);
    return this.deps.ledgerRepository.listReceiptReviews(tenantId);
  }

  async getPaymentDetail(tenantId: string, paymentId: string): Promise<{
    payment: Payment;
    invoice?: Invoice | undefined;
    refunds: Refund[];
    receiptReviews: ReceiptReview[];
    billingProfile?: ClientBillingProfile | undefined;
  }> {
    await this.reconcileTenant(tenantId);
    const payment = await this.deps.ledgerRepository.getPayment(tenantId, paymentId);
    if (!payment) {
      throw new RailError(`Payment ${paymentId} was not found.`, { provider: "native", op: "getPaymentDetail", status: 404 });
    }
    const [refunds, receiptReviews, billingProfile, invoice] = await Promise.all([
      this.deps.ledgerRepository.listRefunds(tenantId).then((records) => records.filter((record) => record.paymentId === payment.id)),
      this.deps.ledgerRepository.listReceiptReviews(tenantId).then((records) => records.filter((record) => record.paymentId === payment.id)),
      this.deps.ledgerRepository.getClientBillingProfile(tenantId, payment.clientId),
      payment.invoiceId ? this.getInvoice(tenantId, payment.invoiceId) : Promise.resolve(null)
    ]);
    return {
      payment,
      ...(invoice ? { invoice } : {}),
      refunds,
      receiptReviews,
      ...(billingProfile ? { billingProfile } : {})
    };
  }

  async recordInvoicePayment(input: RecordInvoicePaymentInput): Promise<{ payment: Payment; invoice: Invoice; credit?: Credit | undefined; receiptReview?: ReceiptReview | undefined }> {
    const workspaceSettings = (await this.deps.crmRepository.getCrmSettings(input.tenantId)).workspaceSettings;
    if (input.method === "ach" && !workspaceSettings.payments.achEnabled) {
      throw new RailError("ACH is disabled in this tenant's Payment settings.", { provider: "native", op: "recordInvoicePayment", status: 409 });
    }
    if (workspaceSettings.payments.transactionLimit !== undefined && input.amount > workspaceSettings.payments.transactionLimit) {
      throw new RailError("This payment exceeds the tenant transaction limit.", { provider: "native", op: "recordInvoicePayment", status: 409 });
    }
    const invoice = await this.getInvoice(input.tenantId, input.invoiceId);
    if (!invoice) {
      throw new RailError(`Invoice ${input.invoiceId} was not found.`, { provider: "native", op: "recordInvoicePayment", status: 404 });
    }
    if (invoice.status === "void" || invoice.status === "bad_debt") {
      throw new RailError("That invoice cannot take payments in its current state.", { provider: "native", op: "recordInvoicePayment", status: 409 });
    }
    if (input.amount <= 0) {
      throw new RailError("Payment amount must be greater than zero.", { provider: "native", op: "recordInvoicePayment", status: 400 });
    }
    const tipAmount = normalizedTipAmount(input.tipAmount);
    if (tipAmount > input.amount) {
      throw new RailError("Tip amount cannot exceed the total payment amount.", { provider: "native", op: "recordInvoicePayment", status: 400 });
    }

    await this.reconcileTenant(input.tenantId);
    const refreshedInvoice = (await this.deps.crmRepository.listInvoices(input.tenantId)).find((record) => record.id === input.invoiceId) ?? invoice;
    const billingProfile = await this.deps.ledgerRepository.getClientBillingProfile(input.tenantId, refreshedInvoice.clientId);
    const selectedCard = input.savedCardId
      ? billingProfile?.savedCards.find((card) => card.id === input.savedCardId)
      : undefined;
    if (input.savedCardId && !selectedCard) {
      throw new RailError("That saved card is not available on this client billing profile.", { provider: "native", op: "recordInvoicePayment", status: 404 });
    }
    const settled = (input.status ?? "succeeded") === "succeeded";
    const outstanding = refreshedInvoice.ledger?.balanceDue ?? invoiceTotal(refreshedInvoice);
    const invoicePortion = roundMoney(input.amount - tipAmount);
    const appliedAmount = settled ? roundMoney(Math.min(invoicePortion, outstanding)) : 0;
    const excessCreditAmount = settled ? roundMoney(Math.max(invoicePortion - appliedAmount, 0)) : 0;
    const timestamp = now();
    const payment: Payment = {
      id: `payment_${randomUUID()}`,
      tenantId: input.tenantId,
      clientId: refreshedInvoice.clientId,
      invoiceId: refreshedInvoice.id,
      provider: input.provider,
      method: input.method,
      status: input.status ?? "succeeded",
      amount: roundMoney(input.amount),
      appliedAmount,
      ...(tipAmount > 0 ? { tipAmount } : {}),
      ...(excessCreditAmount > 0 ? { excessCreditAmount } : {}),
      currency: "usd",
      ...(input.note ? { note: input.note } : {}),
      ...(input.status === "failed" ? { failedAt: timestamp } : { capturedAt: timestamp }),
      ...(input.savedCardId ? { savedCardId: input.savedCardId } : {}),
      ...(input.methodDetails ? { methodDetails: input.methodDetails } : {}),
      ...(selectedCard ? {
        cardSummary: {
          ...(selectedCard.cardholderName ? { cardholderName: selectedCard.cardholderName } : {}),
          ...(selectedCard.brand ? { brand: selectedCard.brand } : {}),
          ...(selectedCard.last4 ? { last4: selectedCard.last4 } : {})
        }
      } : input.cardSummary ? { cardSummary: input.cardSummary } : {}),
      ...(input.externalIds ? { externalIds: input.externalIds } : {}),
      statusHistory: emptyHistory(
        input.status ?? "succeeded",
        input.actorId,
        input.status === "failed"
          ? (input.methodDetails?.failureMessage?.trim() || "Payment attempt failed.")
          : "Payment recorded."
      ),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await this.deps.ledgerRepository.upsertPayment(payment);
    if (payment.status === "succeeded") {
      await emitEvent(this.deps.eventBus, {
        tenantId: input.tenantId,
        type: "payment.created",
        payload: {
          paymentId: payment.id,
          invoiceId: refreshedInvoice.id,
          clientId: refreshedInvoice.clientId,
          amount: payment.amount,
          provider: payment.provider,
          ...(payment.tipAmount ? { tipAmount: payment.tipAmount } : {})
        }
      });
    } else if (payment.status === "failed") {
      await emitEvent(this.deps.eventBus, {
        tenantId: input.tenantId,
        type: "payment.failed",
        payload: { paymentId: payment.id, invoiceId: refreshedInvoice.id, clientId: refreshedInvoice.clientId, amount: payment.amount, provider: payment.provider }
      });
    }
    let credit: Credit | undefined;
    if (excessCreditAmount > 0) {
      credit = await this.deps.ledgerRepository.upsertCredit({
        id: `credit_${randomUUID()}`,
        tenantId: input.tenantId,
        clientId: refreshedInvoice.clientId,
        invoiceId: refreshedInvoice.id,
        paymentId: payment.id,
        source: "overpayment",
        amount: excessCreditAmount,
        availableAmount: excessCreditAmount,
        status: "available",
        applications: [],
        statusHistory: emptyHistory("available", input.actorId, "Created from invoice overpayment."),
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
    const invoiceAfter = await this.recalculateInvoice(refreshedInvoice);
    if (refreshedInvoice.status !== "paid" && invoiceAfter.status === "paid") {
      await emitEvent(this.deps.eventBus, {
        tenantId: input.tenantId,
        type: "invoice.paid",
        payload: {
          invoiceId: invoiceAfter.id,
          clientId: invoiceAfter.clientId,
          quoteId: invoiceAfter.quoteId ?? null,
          paidAt: invoiceAfter.paidAt ?? now()
        }
      });
    }
    if (!settled) {
      return { payment, invoice: invoiceAfter, ...(credit ? { credit } : {}) };
    }
    const receiptReview = await this.createReceiptReviewForPayment({ payment, invoice: invoiceAfter });
    return { payment, invoice: invoiceAfter, ...(credit ? { credit } : {}), receiptReview };
  }

  async createPendingStripeCheckout(input: { tenantId: string; invoiceId: string; checkoutSessionId: string; amount: number; tipAmount?: number | undefined }): Promise<Payment> {
    await this.reconcileTenant(input.tenantId);
    const existing = (await this.deps.ledgerRepository.listPayments(input.tenantId))
      .find((payment) => payment.externalIds?.stripeCheckoutSessionId === input.checkoutSessionId);
    if (existing) {
      return existing;
    }
    const invoice = await this.getInvoice(input.tenantId, input.invoiceId);
    if (!invoice) {
      throw new RailError(`Invoice ${input.invoiceId} was not found.`, { provider: "stripe", op: "createPendingStripeCheckout", status: 404 });
    }
    return this.deps.ledgerRepository.upsertPayment({
      id: `payment_${randomUUID()}`,
      tenantId: input.tenantId,
      clientId: invoice.clientId,
      invoiceId: invoice.id,
      provider: "stripe",
      method: "card",
      status: "pending",
      amount: roundMoney(input.amount),
      ...(normalizedTipAmount(input.tipAmount) > 0 ? { tipAmount: normalizedTipAmount(input.tipAmount) } : {}),
      appliedAmount: 0,
      currency: "usd",
      externalIds: { stripeCheckoutSessionId: input.checkoutSessionId },
      statusHistory: emptyHistory("pending", undefined, "Stripe checkout session created."),
      createdAt: now(),
      updatedAt: now()
    });
  }

  async markStripeCheckoutPaid(input: StripeCheckoutCompleteInput): Promise<{ payment: Payment; invoice: Invoice; receiptReview: ReceiptReview; credit?: Credit | undefined }> {
    await this.reconcileTenant(input.tenantId);
    const payment = (await this.deps.ledgerRepository.listPayments(input.tenantId))
      .find((record) => record.externalIds?.stripeCheckoutSessionId === input.checkoutSessionId)
      ?? await this.createPendingStripeCheckout({
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        checkoutSessionId: input.checkoutSessionId,
        amount: input.amount,
        ...(input.tipAmount !== undefined ? { tipAmount: input.tipAmount } : {})
      });
    const invoice = await this.getInvoice(input.tenantId, input.invoiceId);
    if (!invoice) {
      throw new RailError(`Invoice ${input.invoiceId} was not found.`, { provider: "stripe", op: "markStripeCheckoutPaid", status: 404 });
    }
    const outstanding = invoice.ledger?.balanceDue ?? invoiceTotal(invoice);
    const tipAmount = normalizedTipAmount(input.tipAmount ?? payment.tipAmount);
    if (tipAmount > input.amount) {
      throw new RailError("Tip amount cannot exceed the Stripe checkout total.", { provider: "stripe", op: "markStripeCheckoutPaid", status: 400 });
    }
    const invoicePortion = roundMoney(input.amount - tipAmount);
    const appliedAmount = roundMoney(Math.min(invoicePortion, outstanding));
    const excessCreditAmount = roundMoney(Math.max(invoicePortion - appliedAmount, 0));
    const updatedPayment = await this.deps.ledgerRepository.upsertPayment({
      ...payment,
      status: "succeeded",
      appliedAmount,
      ...(tipAmount > 0 ? { tipAmount } : {}),
      ...(excessCreditAmount > 0 ? { excessCreditAmount } : {}),
      capturedAt: now(),
      updatedAt: now(),
      statusHistory: appendHistory(payment.statusHistory, "succeeded", input.actorId, "Stripe checkout completed."),
      externalIds: {
        ...(payment.externalIds ?? {}),
        stripeCheckoutSessionId: input.checkoutSessionId
      }
    });
    await emitEvent(this.deps.eventBus, {
      tenantId: input.tenantId,
      type: "payment.created",
      payload: {
        paymentId: updatedPayment.id,
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        amount: updatedPayment.amount,
        provider: "stripe",
        ...(updatedPayment.tipAmount ? { tipAmount: updatedPayment.tipAmount } : {})
      }
    });
    let credit: Credit | undefined;
    if (excessCreditAmount > 0) {
      credit = await this.deps.ledgerRepository.upsertCredit({
        id: `credit_${randomUUID()}`,
        tenantId: input.tenantId,
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        paymentId: updatedPayment.id,
        source: "overpayment",
        amount: excessCreditAmount,
        availableAmount: excessCreditAmount,
        status: "available",
        applications: [],
        statusHistory: emptyHistory("available", input.actorId, "Created from Stripe overpayment."),
        createdAt: now(),
        updatedAt: now()
      });
    }
    const invoiceAfter = await this.recalculateInvoice(invoice);
    if (invoice.status !== "paid" && invoiceAfter.status === "paid") {
      await emitEvent(this.deps.eventBus, {
        tenantId: input.tenantId,
        type: "invoice.paid",
        payload: {
          invoiceId: invoiceAfter.id,
          clientId: invoiceAfter.clientId,
          quoteId: invoiceAfter.quoteId ?? null,
          stripeSessionId: input.checkoutSessionId,
          paidAt: invoiceAfter.paidAt ?? now()
        }
      });
    }
    const receiptReview = await this.createReceiptReviewForPayment({ payment: updatedPayment, invoice: invoiceAfter });
    return { payment: updatedPayment, invoice: invoiceAfter, receiptReview, ...(credit ? { credit } : {}) };
  }

  async previewLedgerAction(input: {
    tenantId: string;
    action: PerformLedgerActionInput["action"];
    paymentId?: string | undefined;
    invoiceId?: string | undefined;
    amount?: number | undefined;
  }): Promise<LedgerActionPreview> {
    await this.reconcileTenant(input.tenantId);
    if (input.action === "refund_payment") {
      const payment = input.paymentId ? await this.deps.ledgerRepository.getPayment(input.tenantId, input.paymentId) : null;
      if (!payment) {
        throw new RailError("A payment id is required for refunds.", { provider: "native", op: "previewLedgerAction", status: 400 });
      }
      const refunds = await this.deps.ledgerRepository.listRefunds(input.tenantId);
      const remaining = refundableAmount(payment, refunds);
      const amount = roundMoney(input.amount ?? remaining);
      const invoice = payment.invoiceId ? await this.getInvoice(input.tenantId, payment.invoiceId) : null;
      return {
        action: "refund_payment",
        title: `Refund payment: ${payment.id}`,
        body: [
          `Payment: ${payment.id}`,
          `Provider: ${payment.provider}`,
          `Method: ${payment.method}`,
          `Status: ${payment.status}`,
          `Amount collected: ${payment.amount.toFixed(2)}`,
          `Refundable now: ${remaining.toFixed(2)}`,
          `Refund to issue: ${amount.toFixed(2)}`,
          invoice ? `Invoice: ${invoice.number ?? invoice.id} (${invoice.title})` : "Invoice: quote/deposit payment",
          "This will write a refund record, reopen the invoice balance if needed, and pause the refund receipt in review."
        ].join("\n"),
        payment,
        ...(invoice ? { invoice } : {}),
        amount
      };
    }

    const invoice = input.invoiceId ? await this.getInvoice(input.tenantId, input.invoiceId) : null;
    if (!invoice) {
      throw new RailError("An invoice id is required for that billing action.", { provider: "native", op: "previewLedgerAction", status: 400 });
    }
    if (input.action === "void_invoice") {
      return {
        action: "void_invoice",
        title: `Void invoice: ${invoice.number ?? invoice.id}`,
        body: [
          `Invoice: ${invoice.number ?? invoice.id}`,
          `Current status: ${invoice.status}`,
          `Balance due: ${(invoice.ledger?.balanceDue ?? invoiceTotal(invoice)).toFixed(2)}`,
          "This is only allowed when no net collected payment remains on the invoice.",
          "Attached deposits or credits will be released back to the client balance before the invoice is marked void."
        ].join("\n"),
        invoice
      };
    }
    return {
      action: "mark_bad_debt",
      title: `Mark bad debt: ${invoice.number ?? invoice.id}`,
      body: [
        `Invoice: ${invoice.number ?? invoice.id}`,
        `Current status: ${invoice.status}`,
        `Balance due to write off: ${(invoice.ledger?.balanceDue ?? invoiceTotal(invoice)).toFixed(2)}`,
        "This keeps the invoice record but writes off the remaining balance instead of voiding it."
      ].join("\n"),
      invoice
    };
  }

  async performLedgerAction(input: PerformLedgerActionInput): Promise<{
    preview: LedgerActionPreview;
    payment?: Payment | undefined;
    refund?: Refund | undefined;
    invoice?: Invoice | undefined;
    receiptReview?: ReceiptReview | undefined;
  }> {
    const preview = await this.previewLedgerAction(input);
    if (input.action === "refund_payment") {
      const payment = preview.payment!;
      const amount = preview.amount!;
      const refunds = await this.deps.ledgerRepository.listRefunds(input.tenantId);
      const remaining = refundableAmount(payment, refunds);
      if (amount <= 0 || amount > remaining) {
        throw new RailError("Refund amount is outside the refundable balance.", { provider: "native", op: "refundPayment", status: 409 });
      }
      const refund: Refund = {
        id: `refund_${randomUUID()}`,
        tenantId: input.tenantId,
        clientId: payment.clientId,
        paymentId: payment.id,
        ...(payment.invoiceId ? { invoiceId: payment.invoiceId } : {}),
        provider: payment.provider,
        method: payment.method,
        amount,
        ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        status: "succeeded",
        statusHistory: emptyHistory("succeeded", input.actorId, "Refund recorded."),
        createdAt: now(),
        updatedAt: now()
      };
      await this.deps.ledgerRepository.upsertRefund(refund);
      const remainingAfter = roundMoney(remaining - amount);
      const nextPaymentStatus = remainingAfter === 0 ? "refunded" : "partially_refunded";
      const updatedPayment = await this.deps.ledgerRepository.upsertPayment({
        ...payment,
        status: nextPaymentStatus,
        updatedAt: now(),
        statusHistory: appendHistory(payment.statusHistory, nextPaymentStatus, input.actorId, `Refunded ${amount.toFixed(2)}.`)
      });
      const invoice = payment.invoiceId ? await this.getInvoice(input.tenantId, payment.invoiceId) : null;
      const invoiceAfter = invoice ? await this.recalculateInvoice(invoice) : undefined;
      const receiptReview = await this.createReceiptReviewForRefund({ refund, invoice: invoiceAfter, payment: updatedPayment });
      await emitEvent(this.deps.eventBus, {
        tenantId: input.tenantId,
        type: "refund.created",
        payload: { refundId: refund.id, paymentId: payment.id, invoiceId: payment.invoiceId ?? null, amount }
      });
      return { preview, payment: updatedPayment, refund, ...(invoiceAfter ? { invoice: invoiceAfter } : {}), receiptReview };
    }

    const invoice = preview.invoice!;
    if (input.action === "void_invoice") {
      const refunds = await this.deps.ledgerRepository.listRefunds(input.tenantId);
      const payments = await this.deps.ledgerRepository.listPayments(input.tenantId);
      const netCollected = payments
        .filter((payment) => payment.invoiceId === invoice.id)
        .reduce((sum, payment) => sum + netPaymentApplied(payment, refunds), 0);
      if (netCollected > 0) {
        throw new RailError("That invoice has collected payment on it. Refund or reverse the payment path before voiding.", {
          provider: "native",
          op: "voidInvoice",
          status: 409
        });
      }
      await this.releaseInvoiceApplications(input.tenantId, invoice.id, input.actorId, "Released because the invoice was voided.");
      const updated = await this.deps.crmRepository.updateInvoice(invoice.id, {
        tenantId: input.tenantId,
        status: "void",
        voidedAt: now(),
        voidedBy: input.actorId,
        ledger: {
          ...(invoice.ledger ?? { depositApplied: 0, creditApplied: 0, paymentApplied: 0, refundedAmount: 0, balanceDue: 0, overdue: false }),
          balanceDue: 0,
          overdue: false
        },
        statusHistory: nextInvoiceStatusHistory(invoice, "void", input.actorId, "Invoice voided from ledger action.")
      });
      await emitEvent(this.deps.eventBus, {
        tenantId: input.tenantId,
        type: "invoice.voided",
        payload: { invoiceId: updated.id, clientId: updated.clientId, actorId: input.actorId }
      });
      return { preview, invoice: updated };
    }

    const updated = await this.deps.crmRepository.updateInvoice(invoice.id, {
      tenantId: input.tenantId,
      status: "bad_debt",
      badDebtAt: now(),
      badDebtBy: input.actorId,
      ledger: {
        ...(invoice.ledger ?? { depositApplied: 0, creditApplied: 0, paymentApplied: 0, refundedAmount: 0, balanceDue: 0, overdue: false }),
        balanceDue: 0,
        overdue: false,
        writtenOffAmount: invoice.ledger?.balanceDue ?? invoiceTotal(invoice)
      },
      statusHistory: nextInvoiceStatusHistory(invoice, "bad_debt", input.actorId, "Invoice marked bad debt from ledger action.")
    });
    await emitEvent(this.deps.eventBus, {
      tenantId: input.tenantId,
      type: "invoice.bad_debt",
      payload: { invoiceId: updated.id, clientId: updated.clientId, actorId: input.actorId }
    });
    return { preview, invoice: updated };
  }
}
