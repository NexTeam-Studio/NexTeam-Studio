import { z } from "zod";

export const listJobsInputSchema = z.object({
  q: z.string().default(""),
  status: z.enum(["Upcoming", "Today", "Late", "Unscheduled", "Action Required", "Requires Invoicing", "Archived"]).optional()
});
export const getJobDetailInputSchema = z.object({
  jobId: z.string().optional(),
  query: z.string().optional()
});
export const createJobToolInputSchema = z.object({
  clientId: z.string().min(1).optional(),
  clientQuery: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  quoteId: z.string().min(1).optional(),
  title: z.string().min(1),
  lineItems: z.array(z.object({
    kind: z.enum(["catalog", "custom"]).default("custom"),
    catalogItemId: z.string().optional(),
    catalogCode: z.string().optional(),
    code: z.string().min(1).optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    quantity: z.number().positive().default(1),
    unitPrice: z.number().min(0).default(0),
    taxable: z.boolean().optional()
  })).optional()
}).superRefine((value, ctx) => {
  if (!value.clientId && !value.clientQuery?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "clientId or clientQuery is required.", path: ["clientQuery"] });
  }
});
export const jobActionToolInputSchema = z.object({
  jobId: z.string().min(1).optional(),
  query: z.string().optional(),
  action: z.enum(["close", "invoice", "close_and_invoice", "dismiss_invoice_reminder"])
});
