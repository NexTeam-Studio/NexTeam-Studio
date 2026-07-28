import { z } from "zod";
import { quoteComposerInputSchema } from "../domain/quoteFoundation.js";

export const quoteStatusSchema = z.enum(["draft", "pending_approval", "sent", "change_requested", "approved", "approved_internal", "declined", "expired", "archived"]);
export const createQuoteToolInputSchema = quoteComposerInputSchema
  .omit({ tenantId: true, clientId: true })
  .extend({
    clientId: z.string().min(1).optional(),
    clientQuery: z.string().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.clientId && !value.clientQuery?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "clientId or clientQuery is required.", path: ["clientQuery"] });
    }
  });
export const listQuotesInputSchema = z.object({
  q: z.string().default(""),
  status: quoteStatusSchema.optional()
});
export const getQuoteDetailInputSchema = z.object({
  quoteId: z.string().optional(),
  query: z.string().optional()
});
