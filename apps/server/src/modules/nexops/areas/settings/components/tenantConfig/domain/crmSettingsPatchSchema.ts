import {
  communicationTemplateRecordSchema,
  productServiceCatalogItemSchema,
  quoteApprovalRulesSchema
} from "@nexteam/core";
import { z } from "zod";

export const crmSettingsPatchSchema = z.object({
  tenantId: z.string().min(1),
  operatingProfile: z.object({
    company: z.object({
      legalName: z.string().min(1).optional(),
      publicName: z.string().min(1).optional(),
      industry: z.string().min(1).optional(),
      timezone: z.string().min(1).optional()
    }).optional(),
    locations: z.array(z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      address: z.object({
        street1: z.string().min(1),
        street2: z.string().optional(),
        city: z.string().min(1),
        province: z.string().min(1),
        postalCode: z.string().min(1),
        country: z.string().min(2).max(2)
      }).optional(),
      active: z.boolean()
    })).optional(),
    businessHours: z.array(z.object({
      day: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
      open: z.string().min(1).optional(),
      close: z.string().min(1).optional(),
      closed: z.boolean()
    })).length(7).optional(),
    tax: z.object({
      enabled: z.boolean().optional(),
      defaultRate: z.number().min(0).max(100).optional(),
      registrationId: z.string().min(1).optional()
    }).optional(),
    communicationIdentity: z.object({
      replyToEmail: z.string().email().optional(),
      replyToName: z.string().min(1).optional(),
      phone: z.string().min(1).optional()
    }).optional(),
    securityAudit: z.object({
      auditEventsEnabled: z.boolean().optional(),
      requireApprovalForExternalSend: z.boolean().optional()
    }).optional(),
    onboarding: z.object({
      completedSteps: z.array(z.string().min(1)).optional(),
      launchReviewedAt: z.string().min(1).optional()
    }).optional()
  }).optional(),
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
