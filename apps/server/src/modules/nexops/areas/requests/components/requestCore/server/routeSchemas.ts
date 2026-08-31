import { z } from "zod";

export const requestFieldInputSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string().min(1))]),
  visibility: z.object({
    request: z.boolean().optional(),
    quote: z.boolean().optional(),
    job: z.boolean().optional(),
    visit: z.boolean().optional(),
    invoice: z.boolean().optional()
  }).optional()
});

export const createRequestBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  source: z.enum(["website_form", "office_existing_client", "office_new_client", "legacy_lead_backfill"]).default("office_new_client"),
  formId: z.string().min(1).optional(),
  formSlug: z.string().min(1).optional(),
  subject: z.string().optional(),
  narrative: z.string().optional(),
  selectedClientId: z.string().min(1).optional(),
  selectedPropertyId: z.string().min(1).optional(),
  consent: z.object({ email: z.boolean().optional(), sms: z.boolean().optional(), marketing: z.boolean().optional() }).optional(),
  allowIncomplete: z.boolean().optional(),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  fieldValues: z.array(requestFieldInputSchema).default([])
});

export const updateRequestBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  subject: z.string().optional(),
  narrative: z.string().optional(),
  selectedClientId: z.string().optional(),
  selectedPropertyId: z.string().optional(),
  reviewedAt: z.string().optional(),
  fieldPatches: z.array(requestFieldInputSchema.extend({
    visibility: z.object({
      request: z.boolean().optional(),
      quote: z.boolean().optional(),
      job: z.boolean().optional(),
      visit: z.boolean().optional(),
      invoice: z.boolean().optional()
    }).optional(),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string().min(1))]).optional()
  })).optional(),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
});

export const requestFormBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  title: z.string().min(1),
  slug: z.string().min(1).optional(),
  intro: z.string().optional(),
  active: z.boolean().default(true),
  fieldKeys: z.array(z.string().min(1)).min(1)
});
