import { z } from "zod";
import { invoiceDeliveryPreferencesSchema, lineItemSchema, paymentSchedulePlanSchema, quoteDiscountSchema, receiptReviewChannelSchema } from "@nexteam/core";

export const updateInvoiceDraftBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  title: z.string().optional(),
  lineItems: z.array(lineItemSchema).optional(),
  discount: quoteDiscountSchema.optional(),
  taxRate: z.number().min(0).optional(),
  dueAt: z.string().optional(),
  terms: z.string().optional(),
  paymentSchedule: paymentSchedulePlanSchema.optional(),
  deliveryDefaults: invoiceDeliveryPreferencesSchema.optional(),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
});
export const sendInvoiceBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  mode: z.enum(["email", "sms", "mark_sent"]),
  target: z.string().optional(),
  note: z.string().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  includePdf: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  includePayLink: z.boolean().optional(),
  includeHostedLink: z.boolean().optional()
});

export const composeInvoiceFromJobsBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  jobIds: z.array(z.string().min(1)).min(1),
  title: z.string().optional(),
  discount: quoteDiscountSchema.optional(),
  taxRate: z.number().min(0).optional(),
  terms: z.string().optional(),
  paymentSchedule: paymentSchedulePlanSchema.optional()
});

export const updateReceiptReviewBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  emailRecipients: z.array(z.string().email()).optional(),
  smsRecipients: z.array(z.string()).optional(),
  sendChannels: z.array(receiptReviewChannelSchema).optional(),
  attachmentIds: z.array(z.string().min(1)).optional()
});

export const clientStatementQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional()
});
export const sendStatementBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  target: z.string().optional()
});

export const invoiceLedgerActionBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  reason: z.string().optional()
});
