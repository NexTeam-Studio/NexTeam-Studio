import { z } from "zod";
import { quoteComposerInputSchema } from "../domain/quoteFoundation.js";

export const createQuoteRouteBodySchema = quoteComposerInputSchema.extend({
  delivery: quoteComposerInputSchema.shape.delivery.default({ mode: "draft" })
});

export const updateQuoteRouteBodySchema = quoteComposerInputSchema.partial().extend({
  tenantId: z.string().min(1).optional()
});

export const quoteSendBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  mode: z.enum(["email", "sms", "mark_sent"]),
  target: z.string().optional(),
  note: z.string().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional()
});

export const quoteManualApprovalBodySchema = z.object({
  tenantId: z.string().min(1).optional()
});

export const quoteArchiveBodySchema = z.object({
  tenantId: z.string().min(1).optional()
});

export const createInvoiceFromQuoteBodySchema = z.object({
  tenantId: z.string().min(1).optional()
});
