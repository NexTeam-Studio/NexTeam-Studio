import {
  communicationTemplateRecordSchema,
  productServiceCatalogItemSchema,
  quoteApprovalRulesSchema
} from "@nexteam/core";
import { z } from "zod";

export const crmSettingsPatchSchema = z.object({
  tenantId: z.string().min(1),
  documentNumbering: z.object({
    request: z.object({ prefix: z.string().optional(), separator: z.string().optional(), padWidth: z.number().int().min(1).optional() }).optional(),
    quote: z.object({ prefix: z.string().optional(), separator: z.string().optional(), padWidth: z.number().int().min(1).optional() }).optional(),
    job: z.object({ prefix: z.string().optional(), separator: z.string().optional(), padWidth: z.number().int().min(1).optional() }).optional(),
    invoice: z.object({ prefix: z.string().optional(), separator: z.string().optional(), padWidth: z.number().int().min(1).optional() }).optional(),
    receipt: z.object({ prefix: z.string().optional(), separator: z.string().optional(), padWidth: z.number().int().min(1).optional() }).optional()
  }).optional(),
  quoteDefaults: z.object({
    expiryDays: z.number().int().min(1).optional(),
    autoSaveCardOnDeposit: z.boolean().optional(),
    approvalRules: quoteApprovalRulesSchema.partial().optional(),
    terms: z.string().optional()
  }).optional(),
  invoiceDefaults: z.object({
    dueDays: z.number().int().min(0).optional(),
    terms: z.string().optional(),
    delivery: z.object({
      emailIncludePdf: z.boolean().optional(),
      emailIncludeSummary: z.boolean().optional(),
      emailIncludePayLink: z.boolean().optional(),
      smsIncludeSummary: z.boolean().optional(),
      smsIncludePayLink: z.boolean().optional(),
      smsIncludeHostedLink: z.boolean().optional()
    }).optional(),
    tippingEnabled: z.boolean().optional()
  }).optional(),
  portalDefaults: z.object({
    keepBusinessAddressPrivate: z.boolean().optional(),
    hubSessionReverifyDays: z.number().int().min(1).optional()
  }).optional(),
  reviewDefaults: z.object({
    enabled: z.boolean().optional(),
    steps: z.array(z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      offsetDays: z.number().int().min(0),
      channels: z.enum(["email", "sms", "both"]),
      templateCategory: z.enum(["review_request_initial", "review_request_nudge"])
    })).optional()
  }).optional(),
  catalogItems: z.array(productServiceCatalogItemSchema).optional(),
  communicationTemplates: z.array(communicationTemplateRecordSchema).optional()
});
