
import { z } from "zod";
import { addressSchema, clientCommunicationSettingsSchema, clientContactSchema, paymentSchedulePlanSchema, personNameSchema, quoteSchema, receiptReviewChannelSchema } from "@nexteam/core";



export const createClientApprovalArgsSchema = z.object({
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

export const createQuoteApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  quote: quoteSchema
});

export const lineItemSchema = z.object({
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

export const createJobApprovalArgsSchema = z.object({
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

export const performJobActionApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  action: z.enum(["close", "invoice", "close_and_invoice", "dismiss_invoice_reminder"]),
  actorId: z.string().optional()
});

export const scheduleJobVisitSeriesApprovalArgsSchema = z.object({
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

export const moveJobVisitSeriesApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  visitId: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  shiftRemaining: z.boolean().optional()
});

export const performLedgerActionApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  action: z.enum(["refund_payment", "void_invoice", "mark_bad_debt"]),
  paymentId: z.string().optional(),
  invoiceId: z.string().optional(),
  amount: z.number().positive().optional(),
  reason: z.string().optional(),
  actorId: z.string().optional()
});

export const composeInvoiceFromJobsApprovalArgsSchema = z.object({
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

export const sendInvoiceApprovalArgsSchema = z.object({
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

export const collectInvoicePaymentApprovalArgsSchema = z.object({
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

export const sendReceiptReviewApprovalArgsSchema = z.object({
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

export const deleteClientApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1)
});

export const updateClientAddressApprovalArgsSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  billingAddress: addressSchema.optional(),
  primaryProperty: z.object({
    id: z.string().min(1),
    tenantId: z.string().min(1),
    clientId: z.string().min(1),
    siteName: z.string().optional(),
    label: z.string().optional(),
    address: addressSchema,
    billingAddressSameAsClient: z.boolean().optional(),
    assets: z.array(z.any()),
    geo: z.any().optional(),
    access: z.any().optional(),
    contacts: z.array(z.any()).optional(),
    customFields: z.record(z.any()).optional()
  }).optional(),
  changeSummary: z.string().min(1)
});
