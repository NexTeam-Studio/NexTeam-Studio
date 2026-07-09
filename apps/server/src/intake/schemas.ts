import { z } from "zod";
import { nexiBlueprintSchema, tenantSchema } from "@nexteam/core";

export const appStackDecisionSchema = z.enum(["REPLACE_NOW", "REPLACE_LATER", "COEXIST"]);
export type AppStackDecision = z.infer<typeof appStackDecisionSchema>;

export const appStackItemSchema = z.object({
  category: z.string().min(1),
  currentTool: z.string().min(1),
  decision: appStackDecisionSchema,
  notes: z.string().default("")
});
export type AppStackItem = z.infer<typeof appStackItemSchema>;

export const intakeStatusSchema = z.enum(["interviewing", "plan_ready", "approval_queued", "provisioned", "blocked"]);
export type IntakeStatus = z.infer<typeof intakeStatusSchema>;

export const oauthStepSchema = z.object({
  provider: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
  status: z.enum(["not_started", "needs_owner", "complete", "deferred"]),
  instructions: z.string().min(1)
});
export type OAuthStep = z.infer<typeof oauthStepSchema>;

export const siteDraftSeedSchema = z.object({
  slug: z.string().min(1),
  theme: z.string().min(1),
  sections: z.array(z.string().min(1)),
  qualityBar: z.string().min(1)
});
export type SiteDraftSeed = z.infer<typeof siteDraftSeedSchema>;

export const calendarSeedSchema = z.object({
  timezone: z.string().min(1),
  workingDays: z.array(z.string().min(1)),
  defaultWindow: z.string().min(1),
  notes: z.string().default("")
});
export type CalendarSeed = z.infer<typeof calendarSeedSchema>;

export const tenantTemplateSchema = z.object({
  key: z.string().min(1),
  channel: z.enum(["email", "sms"]),
  subject: z.string().optional(),
  body: z.string().min(1),
  variables: z.array(z.string().min(1))
});
export type TenantTemplate = z.infer<typeof tenantTemplateSchema>;

export const provisioningPlanSchema = z.object({
  tenant: tenantSchema,
  nexiBlueprint: nexiBlueprintSchema,
  siteDraft: siteDraftSeedSchema,
  calendarSeed: calendarSeedSchema,
  templates: z.array(tenantTemplateSchema),
  oauthSteps: z.array(oauthStepSchema),
  appStack: z.array(appStackItemSchema),
  safeguards: z.array(z.string().min(1))
});
export type ProvisioningPlan = z.infer<typeof provisioningPlanSchema>;

export const intakeFieldSchema = z.enum([
  "businessName",
  "industryPack",
  "services",
  "serviceArea",
  "pricingNotes",
  "brandVoice",
  "appStack",
  "plan",
  "timezone"
]);
export type IntakeField = z.infer<typeof intakeFieldSchema>;

export const intakeSessionSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  targetTenantId: z.string().min(1),
  businessName: z.string().min(1).optional(),
  status: intakeStatusSchema,
  industryPack: tenantSchema.shape.industryPack,
  plan: tenantSchema.shape.plan,
  answers: z.record(z.unknown()),
  appStack: z.array(appStackItemSchema),
  nexiBlueprint: nexiBlueprintSchema.optional(),
  provisioningPlan: provisioningPlanSchema.optional(),
  approvalId: z.string().min(1).optional(),
  nextQuestion: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
export type IntakeSession = z.infer<typeof intakeSessionSchema>;

export const startIntakeInputSchema = z.object({
  businessName: z.string().min(1).optional(),
  targetTenantId: z.string().min(1).optional(),
  industryPack: tenantSchema.shape.industryPack.default("pool_leak"),
  plan: tenantSchema.shape.plan.default("suite"),
  timezone: z.string().min(1).default("America/New_York")
});

export const answerIntakeInputSchema = z.object({
  sessionId: z.string().min(1),
  field: intakeFieldSchema,
  value: z.unknown()
});

export const finalizeIntakeInputSchema = z.object({
  sessionId: z.string().min(1)
});
