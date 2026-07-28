import { z } from "zod";

export const paymentMethodDetailsBodySchema = z.object({
  checkNumber: z.string().optional(),
  bankTransferReference: z.string().optional(),
  otherReference: z.string().optional(),
  payerName: z.string().optional(),
  failureMessage: z.string().optional(),
  collectionChannel: z.enum(["hosted_link", "saved_card", "manual_entry", "tap_to_pay", "quick_request"]).optional(),
  deviceLabel: z.string().optional(),
  devicePlatform: z.string().optional(),
  requestMemo: z.string().optional()
});
export const recordInvoicePaymentBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  amount: z.number().positive(),
  tipAmount: z.number().min(0).optional(),
  provider: z.enum(["stripe", "paypal", "manual", "quote_bridge"]).default("manual"),
  method: z.enum(["card", "ach", "cash", "check", "bank_transfer", "other", "paypal", "venmo"]),
  note: z.string().optional(),
  savedCardId: z.string().optional(),
  methodDetails: paymentMethodDetailsBodySchema.optional(),
  externalIds: z.object({
    stripeCheckoutSessionId: z.string().optional(),
    stripePaymentIntentId: z.string().optional(),
    paypalOrderId: z.string().optional(),
    paypalCaptureId: z.string().optional()
  }).optional(),
  status: z.enum(["succeeded", "failed"]).optional()
});

export const invoiceCheckoutBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  provider: z.enum(["stripe", "paypal"]).default("stripe"),
  method: z.enum(["card", "paypal", "venmo"]).default("card"),
  tipAmount: z.coerce.number().min(0).optional()
});

export const quickPaymentRequestBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  title: z.string().min(1),
  amount: z.number().positive(),
  memo: z.string().optional(),
  delivery: z.object({
    mode: z.enum(["draft", "email", "sms", "mark_sent"]).default("draft"),
    target: z.string().optional(),
    subject: z.string().optional(),
    bodyText: z.string().optional()
  }).optional()
});

export const refundPaymentBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  reason: z.string().optional()
});
