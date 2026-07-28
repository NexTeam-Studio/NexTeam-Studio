import { z } from "zod";

export const sendPortalLinkInputSchema = z.object({
  clientId: z.string().min(1).optional(),
  clientQuery: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  target: z.string().optional(),
  preferredChannel: z.enum(["email", "sms"]).optional(),
  sourceObjectType: z.enum(["quote", "invoice"]).optional(),
  sourceObjectId: z.string().min(1).optional()
}).superRefine((value, ctx) => {
  if (!value.clientId && !value.clientQuery?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "clientId or clientQuery is required.", path: ["clientQuery"] });
  }
  if (value.sourceObjectType && !value.sourceObjectId?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sourceObjectId is required when sourceObjectType is provided.", path: ["sourceObjectId"] });
  }
});
export const clientPortalActivityInputSchema = z.object({
  clientId: z.string().min(1).optional(),
  clientQuery: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional()
}).superRefine((value, ctx) => {
  if (!value.clientId && !value.clientQuery?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "clientId or clientQuery is required.", path: ["clientQuery"] });
  }
});
export const statementToolInputSchema = z.object({
  clientId: z.string().min(1).optional(),
  clientQuery: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional()
}).superRefine((value, ctx) => {
  if (!value.clientId && !value.clientQuery?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "clientId or clientQuery is required.", path: ["clientQuery"] });
  }
});
export const sendStatementToolInputSchema = z.object({
  clientId: z.string().min(1).optional(),
  clientQuery: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  target: z.string().optional()
}).superRefine((value, ctx) => {
  if (!value.clientId && !value.clientQuery?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "clientId or clientQuery is required.", path: ["clientQuery"] });
  }
});
