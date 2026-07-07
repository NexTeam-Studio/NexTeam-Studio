import { z } from "zod";

export const campaignChannelSchema = z.enum(["email", "sms"]);

export const campaignContactSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  company: z.string().optional(),
  emails: z.array(z.string().email()).default([]),
  phones: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  consent: z.object({
    email: z.boolean(),
    sms: z.boolean()
  }),
  externalIds: z.record(z.string()).optional()
});

export const audienceFilterSchema = z.object({
  tenantId: z.string().min(1).optional(),
  channel: campaignChannelSchema.default("email"),
  clientIds: z.array(z.string().min(1)).optional(),
  tagsAny: z.array(z.string().min(1)).optional(),
  tagsAll: z.array(z.string().min(1)).optional(),
  consentRequired: z.boolean().default(true),
  excludeSuppressed: z.boolean().default(true),
  maxResults: z.number().int().min(1).max(500).default(100)
});

export const sequenceStepSchema = z.object({
  id: z.string().min(1),
  channel: campaignChannelSchema,
  delayHours: z.number().min(0).default(0),
  subject: z.string().min(1).optional(),
  body: z.string().min(1),
  stopOnReply: z.boolean().default(true),
  stopOnUnsubscribe: z.boolean().default(true)
});

export const campaignTemplateSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  audience: audienceFilterSchema,
  sequence: z.array(sequenceStepSchema).min(1),
  complianceNotes: z.array(z.string()).default([])
});

export const campaignSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  templateId: z.string().optional(),
  audience: audienceFilterSchema,
  sequence: z.array(sequenceStepSchema).min(1),
  status: z.enum(["draft", "approval_queued", "blocked", "completed"]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const campaignSuppressionSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  contactId: z.string().min(1),
  channel: campaignChannelSchema,
  reason: z.enum(["unsubscribed", "manual", "bounce", "spam_complaint"]),
  createdAt: z.string(),
  source: z.string().min(1)
});

export const campaignTrackingEventSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  campaignId: z.string().min(1),
  contactId: z.string().min(1),
  channel: campaignChannelSchema,
  type: z.enum(["queued", "open", "click", "reply", "unsubscribe", "suppressed"]),
  stepId: z.string().optional(),
  url: z.string().optional(),
  createdAt: z.string(),
  metadata: z.record(z.unknown()).default({})
});

export const campaignRunSchema = z.object({
  tenantId: z.string().min(1).optional(),
  templateId: z.string().min(1).default("vgb-hotel-gm-outreach"),
  name: z.string().min(1).optional(),
  audience: audienceFilterSchema.optional(),
  dryRun: z.boolean().default(false)
});

export const unsubscribeInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  campaignId: z.string().min(1),
  contactId: z.string().min(1),
  channel: campaignChannelSchema.default("email"),
  reason: z.enum(["unsubscribed", "manual", "bounce", "spam_complaint"]).default("unsubscribed")
});

export type CampaignChannel = z.infer<typeof campaignChannelSchema>;
export type CampaignContact = z.infer<typeof campaignContactSchema>;
export type AudienceFilter = z.infer<typeof audienceFilterSchema>;
export type SequenceStep = z.infer<typeof sequenceStepSchema>;
export type CampaignTemplate = z.infer<typeof campaignTemplateSchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type CampaignSuppression = z.infer<typeof campaignSuppressionSchema>;
export type CampaignTrackingEvent = z.infer<typeof campaignTrackingEventSchema>;
