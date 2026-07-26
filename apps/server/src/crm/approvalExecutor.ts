import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  addressSchema,
  clientCommunicationSettingsSchema,
  clientContactSchema,
  paymentSchedulePlanSchema,
  personNameSchema,
  quoteSchema,
  receiptReviewChannelSchema,
  RailError,
  type ApprovalExecutor,
  type ApprovalItem,
  type CRMProvider,
  type LineItem,
  type NewClient,
  type Property
} from "@nexteam/core";
import type { JobLifecycleService } from "./jobLifecycle.js";
import type { LedgerService } from "./ledgerFoundation.js";

const createClientApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  client: z.object({
    tenantId: z.string().min(1),
    name: z.string().min(1),
    company: z.string().optional(),
    personName: personNameSchema.optional(),
    displayNamePreference: z.enum(["person", "company"]).optional(),
    billingAddress: addressSchema.optional(),
    billingSameAsPrimaryProperty: z.boolean().optional(),
    contacts: z.array(clientContactSchema).optional(),
    communicationSettings: clientCommunicationSettingsSchema.optional(),
    emails: z.array(z.string()),
    phones: z.array(z.string()),
    consent: z.object({ email: z.boolean(), sms: z.boolean() })
  }),
  primaryProperty: z.object({
    tenantId: z.string().min(1),
    siteName: z.string().optional(),
    label: z.string().optional(),
    address: addressSchema,
    billingAddressSameAsClient: z.boolean().optional()
  }).optional(),
  addressNote: z.string().optional()
});

const createQuoteApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  quote: quoteSchema
});

const lineItemSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["catalog", "custom"]),
  catalogCode: z.string().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
  taxable: z.boolean().optional(),
  clientSelectable: z.boolean().optional(),
  defaultSelected: z.boolean().optional()
});

const createJobApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  input: z.object({
    tenantId: z.string().min(1),
    clientId: z.string().min(1),
    propertyId: z.string().optional(),
    requestId: z.string().optional(),
    quoteId: z.string().optional(),
    title: z.string().min(1),
    lineItems: z.array(lineItemSchema).optional(),
    intake: z.any().optional(),
    createdBy: z.string().optional()
  })
});

const performJobActionApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  action: z.enum(["close", "invoice", "close_and_invoice", "dismiss_invoice_reminder"]),
  actorId: z.string().optional()
});

const scheduleJobVisitSeriesApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  visits: z.array(z.object({
    title: z.string().optional(),
    start: z.string().min(1),
    end: z.string().min(1),
    assignedTo: z.array(z.string().min(1)).optional(),
    details: z.string().optional()
  })).min(1)
});

const moveJobVisitSeriesApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  visitId: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  shiftRemaining: z.boolean().optional()
});

const performLedgerActionApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  action: z.enum(["refund_payment", "void_invoice", "mark_bad_debt"]),
  paymentId: z.string().optional(),
  invoiceId: z.string().optional(),
  amount: z.number().positive().optional(),
  reason: z.string().optional(),
  actorId: z.string().optional()
});

const composeInvoiceFromJobsApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  jobIds: z.array(z.string().min(1)).min(1),
  title: z.string().optional(),
  discount: z.object({
    kind: z.enum(["amount", "percent"]),
    value: z.number().min(0)
  }).optional(),
  taxRate: z.number().min(0).optional(),
  terms: z.string().optional(),
  paymentSchedule: paymentSchedulePlanSchema.optional(),
  actorId: z.string().optional()
});

const sendInvoiceApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  invoiceId: z.string().min(1),
  actorId: z.string().optional(),
  mode: z.enum(["email", "sms", "mark_sent"]),
  target: z.string().optional(),
  note: z.string().optional(),
  subject: z.string().optional(),
  includePdf: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  includePayLink: z.boolean().optional(),
  includeHostedLink: z.boolean().optional(),
  publicBaseUrl: z.string().min(1)
});

const collectInvoicePaymentApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  provider: z.enum(["stripe", "paypal", "manual", "quote_bridge"]),
  method: z.enum(["card", "ach", "cash", "check", "bank_transfer", "other", "paypal", "venmo"]),
  actorId: z.string().optional(),
  note: z.string().optional(),
  savedCardId: z.string().optional(),
  methodDetails: z.object({
    checkNumber: z.string().optional(),
    bankTransferReference: z.string().optional(),
    otherReference: z.string().optional(),
    payerName: z.string().optional(),
    failureMessage: z.string().optional()
  }).optional(),
  status: z.enum(["pending", "failed", "succeeded", "refunded", "partially_refunded"]).optional()
});

const sendReceiptReviewApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  receiptReviewId: z.string().min(1),
  actorId: z.string().optional(),
  publicBaseUrl: z.string().min(1),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  emailRecipients: z.array(z.string()).optional(),
  smsRecipients: z.array(z.string()).optional(),
  sendChannels: z.array(receiptReviewChannelSchema).optional(),
  attachmentIds: z.array(z.string()).optional()
});

export class CrmApprovalExecutor implements ApprovalExecutor {
  constructor(
    private readonly provider: CRMProvider,
    private readonly jobLifecycleService?: JobLifecycleService,
    private readonly ledgerService?: LedgerService
  ) {}

  async execute(item: ApprovalItem): Promise<unknown> {
    if (item.execute.service !== "crm" || ![
      "createClient",
      "createQuote",
      "createJob",
      "performJobAction",
      "scheduleJobVisitSeries",
      "moveJobVisitSeries",
      "performLedgerAction",
      "composeInvoiceFromJobs",
      "sendInvoice",
      "recordInvoicePayment",
      "sendReceiptReview"
    ].includes(item.execute.op)) {
      throw new RailError("CRM approval executor received an unsupported approval item.", { provider: "native", op: "approvalExecute", status: 400 });
    }
    if (item.execute.op === "createClient") {
      if (!this.provider.createClient) {
        throw new RailError("The configured CRM provider cannot create native clients.", { provider: "native", op: "createClient", status: 501 });
      }
      const args = createClientApprovalArgsSchema.parse(item.execute.args);
      if (args.tenantId !== item.tenantId || args.client.tenantId !== item.tenantId) {
        throw new RailError("Approved client artifact targets a different tenant.", { provider: "native", op: "createClient", status: 403 });
      }
      const client = await this.provider.createClient(args.client as NewClient);
      let property: Property | undefined;
      if (args.primaryProperty) {
        if (!this.provider.upsertProperty) {
          throw new RailError("The configured CRM provider cannot save native client properties yet.", { provider: "native", op: "upsertProperty", status: 501 });
        }
        if (args.primaryProperty.tenantId !== item.tenantId) {
          throw new RailError("Approved client property targets a different tenant.", { provider: "native", op: "upsertProperty", status: 403 });
        }
        property = await this.provider.upsertProperty({
          id: `property_${randomUUID()}`,
          tenantId: args.primaryProperty.tenantId,
          clientId: client.id,
          ...(args.primaryProperty.siteName ? { siteName: args.primaryProperty.siteName } : {}),
          ...(args.primaryProperty.label ? { label: args.primaryProperty.label } : {}),
          address: args.primaryProperty.address,
          ...(args.primaryProperty.billingAddressSameAsClient !== undefined
            ? { billingAddressSameAsClient: args.primaryProperty.billingAddressSameAsClient }
            : {}),
          assets: []
        });
      }
      return { client, property, addressNote: args.addressNote };
    }
    if (item.execute.op === "createQuote") {
      if (!this.provider.createQuote) {
        throw new RailError("The configured CRM provider cannot create native quotes.", { provider: "native", op: "createQuote", status: 501 });
      }
      const args = createQuoteApprovalArgsSchema.parse(item.execute.args);
      if (args.tenantId !== item.tenantId || args.quote.tenantId !== item.tenantId) {
        throw new RailError("Approved quote artifact targets a different tenant.", { provider: "native", op: "createQuote", status: 403 });
      }
      const quote = await this.provider.createQuote(args.quote);
      return { quote };
    }
    if (item.execute.op === "createJob") {
      if (!this.jobLifecycleService) {
        throw new RailError("Job lifecycle approval execution is not wired for this tenant yet.", { provider: "native", op: "createJob", status: 501 });
      }
      const args = createJobApprovalArgsSchema.parse(item.execute.args);
      if (args.tenantId !== item.tenantId || args.input.tenantId !== item.tenantId) {
        throw new RailError("Approved job artifact targets a different tenant.", { provider: "native", op: "createJob", status: 403 });
      }
      const job = await this.jobLifecycleService.createJob({
        tenantId: args.input.tenantId,
        clientId: args.input.clientId,
        ...(args.input.propertyId ? { propertyId: args.input.propertyId } : {}),
        ...(args.input.requestId ? { requestId: args.input.requestId } : {}),
        ...(args.input.quoteId ? { quoteId: args.input.quoteId } : {}),
        title: args.input.title,
        ...(args.input.lineItems ? { lineItems: args.input.lineItems as LineItem[] } : {}),
        ...(args.input.intake ? { intake: args.input.intake } : {}),
        createdBy: args.input.createdBy ?? item.createdBy
      });
      return { job };
    }
    if (item.execute.op === "performJobAction") {
      if (!this.jobLifecycleService) {
        throw new RailError("Job lifecycle approval execution is not wired for this tenant yet.", { provider: "native", op: "performJobAction", status: 501 });
      }
      const actionArgs = performJobActionApprovalArgsSchema.parse(item.execute.args);
      if (actionArgs.tenantId !== item.tenantId) {
        throw new RailError("Approved job action targets a different tenant.", { provider: "native", op: "performJobAction", status: 403 });
      }
      return this.jobLifecycleService.performJobAction({
        tenantId: actionArgs.tenantId,
        jobId: actionArgs.jobId,
        action: actionArgs.action,
        actorId: actionArgs.actorId ?? item.decidedBy ?? item.createdBy
      });
    }
    if (item.execute.op === "scheduleJobVisitSeries") {
      if (!this.jobLifecycleService) {
        throw new RailError("Job lifecycle approval execution is not wired for this tenant yet.", { provider: "native", op: "scheduleJobVisitSeries", status: 501 });
      }
      const args = scheduleJobVisitSeriesApprovalArgsSchema.parse(item.execute.args);
      if (args.tenantId !== item.tenantId) {
        throw new RailError("Approved visit-series draft targets a different tenant.", { provider: "native", op: "scheduleJobVisitSeries", status: 403 });
      }
      const visits = await this.jobLifecycleService.scheduleVisitSeries(args);
      return { visits };
    }
    if (item.execute.op === "moveJobVisitSeries") {
      if (!this.jobLifecycleService) {
        throw new RailError("Job lifecycle approval execution is not wired for this tenant yet.", { provider: "native", op: "moveJobVisitSeries", status: 501 });
      }
      const args = moveJobVisitSeriesApprovalArgsSchema.parse(item.execute.args);
      if (args.tenantId !== item.tenantId) {
        throw new RailError("Approved visit-shift draft targets a different tenant.", { provider: "native", op: "moveJobVisitSeries", status: 403 });
      }
      const result = await this.jobLifecycleService.moveVisitSeries(args);
      return result;
    }
    if (!this.ledgerService) {
      throw new RailError("Ledger approval execution is not wired for this tenant yet.", { provider: "native", op: "performLedgerAction", status: 501 });
    }
    if (item.execute.op === "composeInvoiceFromJobs") {
      const args = composeInvoiceFromJobsApprovalArgsSchema.parse(item.execute.args);
      if (args.tenantId !== item.tenantId) {
        throw new RailError("Approved invoice compose action targets a different tenant.", { provider: "native", op: "composeInvoiceFromJobs", status: 403 });
      }
      const result = await this.ledgerService.composeInvoiceFromJobs({
        tenantId: args.tenantId,
        jobIds: args.jobIds,
        actorId: args.actorId ?? item.decidedBy ?? item.createdBy,
        ...(args.title?.trim() ? { title: args.title.trim() } : {}),
        ...(args.discount ? { discount: args.discount } : {}),
        ...(args.taxRate !== undefined ? { taxRate: args.taxRate } : {}),
        ...(args.terms !== undefined ? { terms: args.terms } : {}),
        ...(args.paymentSchedule ? { paymentSchedule: args.paymentSchedule } : {})
      });
      if (this.jobLifecycleService) {
        for (const job of result.jobs) {
          await this.jobLifecycleService.markInvoiceCreated({
            tenantId: args.tenantId,
            jobId: job.id,
            invoiceId: result.invoice.id,
            actorId: args.actorId ?? item.decidedBy ?? item.createdBy
          });
        }
      }
      return result;
    }
    if (item.execute.op === "sendInvoice") {
      const args = sendInvoiceApprovalArgsSchema.parse(item.execute.args);
      if (args.tenantId !== item.tenantId) {
        throw new RailError("Approved invoice send action targets a different tenant.", { provider: "native", op: "sendInvoice", status: 403 });
      }
      return this.ledgerService.sendInvoice({
        tenantId: args.tenantId,
        invoiceId: args.invoiceId,
        actorId: args.actorId ?? item.decidedBy ?? item.createdBy,
        mode: args.mode,
        ...(args.target?.trim() ? { target: args.target.trim() } : {}),
        ...(args.note?.trim() ? { note: args.note.trim() } : {}),
        ...(args.subject?.trim() ? { subject: args.subject.trim() } : {}),
        ...(args.includePdf !== undefined ? { includePdf: args.includePdf } : {}),
        ...(args.includeSummary !== undefined ? { includeSummary: args.includeSummary } : {}),
        ...(args.includePayLink !== undefined ? { includePayLink: args.includePayLink } : {}),
        ...(args.includeHostedLink !== undefined ? { includeHostedLink: args.includeHostedLink } : {}),
        publicBaseUrl: args.publicBaseUrl
      });
    }
    if (item.execute.op === "recordInvoicePayment") {
      const args = collectInvoicePaymentApprovalArgsSchema.parse(item.execute.args);
      if (args.tenantId !== item.tenantId) {
        throw new RailError("Approved payment collection targets a different tenant.", { provider: "native", op: "recordInvoicePayment", status: 403 });
      }
      return this.ledgerService.recordInvoicePayment({
        tenantId: args.tenantId,
        invoiceId: args.invoiceId,
        amount: args.amount,
        provider: args.provider,
        method: args.method,
        actorId: args.actorId ?? item.decidedBy ?? item.createdBy,
        ...(args.note?.trim() ? { note: args.note.trim() } : {}),
        ...(args.savedCardId ? { savedCardId: args.savedCardId } : {}),
        ...(args.methodDetails ? { methodDetails: args.methodDetails } : {}),
        ...(args.status ? { status: args.status } : {})
      });
    }
    if (item.execute.op === "sendReceiptReview") {
      const args = sendReceiptReviewApprovalArgsSchema.parse(item.execute.args);
      if (args.tenantId !== item.tenantId) {
        throw new RailError("Approved receipt review send targets a different tenant.", { provider: "native", op: "sendReceiptReview", status: 403 });
      }
      return this.ledgerService.sendReceiptReview({
        tenantId: args.tenantId,
        receiptReviewId: args.receiptReviewId,
        actorId: args.actorId ?? item.decidedBy ?? item.createdBy,
        publicBaseUrl: args.publicBaseUrl,
        ...(args.subject !== undefined ? { subject: args.subject } : {}),
        ...(args.bodyText !== undefined ? { bodyText: args.bodyText } : {}),
        ...(args.emailRecipients !== undefined ? { emailRecipients: args.emailRecipients } : {}),
        ...(args.smsRecipients !== undefined ? { smsRecipients: args.smsRecipients } : {}),
        ...(args.sendChannels !== undefined ? { sendChannels: args.sendChannels } : {}),
        ...(args.attachmentIds !== undefined ? { attachmentIds: args.attachmentIds } : {})
      });
    }
    const ledgerArgs = performLedgerActionApprovalArgsSchema.parse(item.execute.args);
    if (ledgerArgs.tenantId !== item.tenantId) {
      throw new RailError("Approved ledger action targets a different tenant.", { provider: "native", op: "performLedgerAction", status: 403 });
    }
    return this.ledgerService.performLedgerAction({
      tenantId: ledgerArgs.tenantId,
      action: ledgerArgs.action,
      ...(ledgerArgs.paymentId ? { paymentId: ledgerArgs.paymentId } : {}),
      ...(ledgerArgs.invoiceId ? { invoiceId: ledgerArgs.invoiceId } : {}),
      ...(ledgerArgs.amount !== undefined ? { amount: ledgerArgs.amount } : {}),
      ...(ledgerArgs.reason ? { reason: ledgerArgs.reason } : {}),
      actorId: ledgerArgs.actorId ?? item.decidedBy ?? item.createdBy
    });
  }
}
