import { z } from "zod";
import type { JobStatus } from "./types.js";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema)
  ])
);

export const idSchema = z.string().min(1).max(128);

export const splinterJobStateSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "AWAITING_HUMAN",
  "SUCCEEDED",
  "FAILED"
]);

export const splinterJobOwnerSchema = z.enum(["splinter", "worker", "human"]);

export const splinterJobResultSchema = z.enum(["PENDING", "PASS", "FAIL"]);

export const splinterExecutionModeSchema = z.enum(["READ_ONLY", "CODE_CHANGE"]);

export const splinterRequiredCheckSchema = z.enum([
  "SPLINTER_FOCUSED_TESTS",
  "SPLINTER_FOCUSED_TYPECHECK"
]);

const splinterAllowedPathSchema = z.string().min(1).max(256).refine(
  (value) => !value.startsWith("/") && !value.startsWith("\\") && !value.includes("..") && !value.includes(":"),
  "Splinter allowed paths must be repository-relative."
);

export const splinterLastErrorSchema = z.object({
  message: z.string().min(1).max(500),
  at: z.string().min(1)
});

export const splinterWorkerResultSchema = z.object({
  workerRunId: z.string().min(1).max(128), status: z.enum(["SUCCEEDED", "FAILED", "AWAITING_HUMAN"]), summary: z.string().min(1).max(500),
  filesInspected: z.array(z.string().min(1).max(256)).max(50), filesChanged: z.array(z.string().min(1).max(256)).max(50), testsPerformed: z.array(z.string().min(1).max(256)).max(50),
  baseSha: z.string().regex(/^[a-f0-9]{7,64}$/i).optional(), branch: z.string().min(1).max(256).optional(), commitSha: z.string().regex(/^[a-f0-9]{7,64}$/i).optional(), error: z.string().min(1).max(500).optional(), startedAt: z.string().min(1), completedAt: z.string().min(1)
}).strict();

export const splinterJobSchema = z.object({
  id: idSchema,
  goal: z.string().min(1).max(4_000),
  executionMode: splinterExecutionModeSchema.default("READ_ONLY"),
  allowedPaths: z.array(splinterAllowedPathSchema).max(50).default([]),
  acceptanceCriteria: z.array(z.string().min(1).max(1_000)).max(50).default([]),
  requiredChecks: z.array(splinterRequiredCheckSchema).max(10).default([]),
  state: splinterJobStateSchema,
  next: z.object({
    owner: splinterJobOwnerSchema,
    action: z.string().min(1).max(1_000)
  }),
  result: splinterJobResultSchema,
  lastError: splinterLastErrorSchema.nullable(),
  workerResult: splinterWorkerResultSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

function validateSplinterCodeChange(job: { executionMode: "READ_ONLY" | "CODE_CHANGE"; allowedPaths: string[]; acceptanceCriteria: string[]; requiredChecks: string[] }, context: z.RefinementCtx): void {
  if (job.executionMode === "CODE_CHANGE") {
    if (job.allowedPaths.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedPaths"], message: "CODE_CHANGE jobs require allowed paths." });
    if (job.acceptanceCriteria.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["acceptanceCriteria"], message: "CODE_CHANGE jobs require acceptance criteria." });
    if (job.requiredChecks.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["requiredChecks"], message: "CODE_CHANGE jobs require deterministic checks." });
  }
}

const splinterJobCreateBaseSchema = splinterJobSchema.omit({
  createdAt: true,
  updatedAt: true
});

export const splinterJobCreateSchema = splinterJobCreateBaseSchema.superRefine(validateSplinterCodeChange);

export const splinterJobUpdateSchema = splinterJobCreateBaseSchema.omit({ id: true }).partial();


export const addressSchema = z.object({
  street1: z.string(),
  street2: z.string().optional(),
  city: z.string(),
  province: z.string(),
  postalCode: z.string(),
  country: z.string()
});

export const artifactKindSchema = z.enum([
  "client",
  "document",
  "job",
  "tenant_provisioning",
  "email",
  "sms",
  "payment",
  "gbp_post",
  "social_post",
  "article",
  "quote",
  "invoice",
  "site_publish",
  "gbp_profile_update",
  "seo_fix",
  "review_reply"
]);

export const tenantSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  industryPack: z.enum(["pool_leak", "hvac", "plumbing", "pressure_washing"]),
  branding: z.object({
    assistantName: z.string().min(1),
    logoRef: z.string().optional(),
    colors: z.record(z.string()).optional()
  }),
  nexiBusinessProfile: z.object({
    mission: z.string().min(1),
    coreValues: z.array(z.string().min(1)).min(1),
    approvedWhatWeDoReply: z.string().min(1)
  }).optional(),
  adapters: z.object({
    crm: z.enum(["jobber", "native"]),
    media: z.enum(["companycam", "native"]),
    email: z.enum(["gmail_relay", "sendgrid"]),
    sms: z.enum(["twilio"]).optional()
  }),
  approval: z.record(artifactKindSchema, z.object({
    autoApprove: z.boolean(),
    cleanStreak: z.number().int().min(0)
  })),
  timezone: z.string().min(1),
  plan: z.enum(["nexi", "marketing", "suite"]),
  lifecycleState: z.enum(["ACTIVE", "DISABLED_ARCHIVED"]).optional(),
  lifecycleUpdatedAt: z.string().datetime().optional(),
  payments: z.object({
    stripeConnect: z.object({
      accountId: z.string().regex(/^acct_[A-Za-z0-9]+$/),
      onboardingEmail: z.string().email(),
      country: z.string().length(2),
      createdAt: z.string().min(1),
      updatedAt: z.string().min(1),
      onboardingFlowTokenHash: z.string().min(32).optional(),
      onboardingFlowExpiresAt: z.string().min(1).optional()
    }).optional()
  }).optional()
});

const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const tenantBrandingSchema = z.object({
  tenantId: idSchema,
  displayName: z.string().min(1),
  logo: z.object({
    storageRef: z.string().min(1).optional(),
    mediaId: idSchema.optional(),
    url: z.string().url().optional(),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(),
    alt: z.string().min(1).optional(),
    updatedAt: z.string().min(1).optional()
  }).optional(),
  colors: z.object({
    primary: hexColorSchema.optional(),
    secondary: hexColorSchema.optional(),
    accent: hexColorSchema.optional(),
    accentText: hexColorSchema.optional(),
    background: hexColorSchema.optional(),
    surface: hexColorSchema.optional(),
    text: hexColorSchema.optional(),
    mutedText: hexColorSchema.optional(),
    userBubble: hexColorSchema.optional(),
    assistantBubble: hexColorSchema.optional()
  }),
  fontFamily: z.string().min(1).optional(),
  source: z.enum(["default", "manual", "extracted"]),
  updatedBy: idSchema,
  updatedAt: z.string().min(1)
});

export const platformModuleSchema = z.enum([
  "nexi",
  "crm",
  "fielddocs",
  "scheduling",
  "content",
  "campaigns",
  "reputation",
  "comms",
  "voice",
  "platform",
  "evaporation",
  "seo",
  "sites"
]);

export const tenantOnboardingStepSchema = z.enum([
  "company-profile",
  "module-selection",
  "office-defaults",
  "launch-review"
]);

export const secureOnboardingTaskStatusSchema = z.enum(["not_started", "in_progress", "complete", "skipped"]);

export const secureOnboardingAuditActionSchema = z.enum([
  "task.claimed",
  "task.status_changed",
  "task.reassigned"
]);

export const secureOnboardingTaskSchema = z.object({
  id: idSchema,
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  required: z.boolean(),
  status: secureOnboardingTaskStatusSchema,
  ownerUserId: idSchema.optional(),
  completedAt: z.string().optional()
});

export const secureOnboardingAuditEventSchema = z.object({
  id: idSchema,
  action: secureOnboardingAuditActionSchema,
  actorId: idSchema,
  taskId: idSchema,
  detail: z.string().min(1).max(500),
  createdAt: z.string()
});

export const defaultSecureOnboardingTasks = [
  { id: "subscription-confirmation", label: "Confirm subscription", description: "Verify the subscribed tenant is ready for onboarding.", required: true, status: "not_started" },
  { id: "owner-introduction", label: "Introduce the account owner", description: "Confirm the primary owner can access the tenant workspace.", required: true, status: "not_started" },
  { id: "business-profile", label: "Complete business profile", description: "Confirm the business name, industry, and time zone.", required: true, status: "not_started" },
  { id: "module-selection", label: "Choose subscribed modules", description: "Select the NexTeam capabilities this tenant will use.", required: true, status: "not_started" },
  { id: "office-defaults", label: "Review office defaults", description: "Review locations, hours, tax, and approval defaults.", required: true, status: "not_started" },
  { id: "team-handoff", label: "Complete owner handoff", description: "Confirm the owner has accepted the operational handoff.", required: true, status: "not_started" },
  { id: "optional-integrations", label: "Review optional integrations", description: "Review optional connections after the required launch setup.", required: false, status: "not_started" }
] as const;

export const secureOnboardingChecklistSchema = z.object({
  tasks: z.array(secureOnboardingTaskSchema).min(1).max(30),
  auditHistory: z.array(secureOnboardingAuditEventSchema).max(200).default([])
}).default({
  tasks: defaultSecureOnboardingTasks.map((task) => ({ ...task })),
  auditHistory: []
});

export const tenantOnboardingSteps = [
  "company-profile",
  "module-selection",
  "office-defaults",
  "launch-review"
] as const;

export const platformPlanSchema = z.object({
  id: z.enum(["nexi", "marketing", "suite"]),
  name: z.string().min(1),
  monthlyUsd: z.number().min(0),
  modules: z.array(platformModuleSchema)
});

export const tenantSubscriptionSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  plan: z.enum(["nexi", "marketing", "suite"]),
  status: z.enum(["trialing", "active", "past_due", "canceled", "incomplete"]),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  currentPeriodEnd: z.string().optional(),
  updatedAt: z.string()
});

export const platformSubscriptionPackageSchema = z.object({
  id: idSchema,
  version: z.string().min(1),
  name: z.string().min(1),
  priceCents: z.number().int().min(0),
  currency: z.literal("USD"),
  includedModules: z.array(platformModuleSchema).min(1),
  active: z.boolean()
}).strict();

export const platformSubscriptionAssignmentSchema = z.object({
  id: idSchema,
  prospectId: idSchema,
  tenantId: idSchema.optional(),
  packageId: idSchema,
  packageVersion: z.string().min(1),
  status: z.enum(["ASSIGNED", "ACTIVE", "CANCELED"]),
  effectiveAt: z.string().min(1),
  assignedBy: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
}).strict();

export const tenantBlockerSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  title: z.string().trim().min(1).max(180),
  detail: z.string().trim().min(1).max(4000),
  category: z.enum(["CONFIGURATION", "DATA_MIGRATION", "INTEGRATION", "TRAINING", "BILLING", "OTHER"]),
  severity: z.enum(["BLOCKING", "HIGH", "NORMAL"]),
  status: z.enum(["OPEN", "ESCALATED", "RESOLVED"]),
  createdAt: z.string().min(1),
  createdBy: idSchema,
  updatedAt: z.string().min(1),
  resolvedAt: z.string().min(1).optional(),
  resolvedBy: idSchema.optional()
}).strict();

export const tenantMigrationRecordSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  sourceSystem: z.string().trim().min(1).max(120),
  scope: z.string().trim().min(1).max(4000),
  classification: z.enum(["INCLUDED_BASIC", "PAID_COMPLEX", "NEEDS_REVIEW"]).optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "VALIDATION", "DEFERRED", "COMPLETED"]),
  expectedRecords: z.number().int().min(0).optional(),
  importedRecords: z.number().int().min(0).optional(),
  rejectedRecords: z.number().int().min(0).optional(),
  conflictOrDuplicateRecords: z.number().int().min(0).optional(),
  launchImpact: z.enum(["NONE", "WATCH", "BLOCKING"]).optional(),
  deferredReason: z.string().trim().min(1).max(2000).optional(),
  deferredUntil: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  createdBy: idSchema,
  updatedAt: z.string().min(1),
  updatedBy: idSchema,
  completedAt: z.string().min(1).optional()
}).strict().superRefine((value, context) => {
  if (value.status === "DEFERRED" && !value.deferredReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Deferred migrations require a safe deferral reason." });
  }
  if (value.status !== "DEFERRED" && (value.deferredReason || value.deferredUntil)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Deferral details are allowed only while a migration is deferred." });
  }
  if (value.status === "COMPLETED" && !value.completedAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Completed migrations require a completion timestamp." });
  }
  if (value.status !== "COMPLETED" && value.completedAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Only completed migrations may have a completion timestamp." });
  }
});

export const platformSupportEscalationSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  blockerId: idSchema,
  summary: z.string().trim().min(1).max(4000),
  priority: z.enum(["P1", "P2", "P3"]),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]),
  createdAt: z.string().min(1),
  createdBy: idSchema,
  updatedAt: z.string().min(1),
  resolvedAt: z.string().min(1).optional(),
  resolvedBy: idSchema.optional()
}).strict();

export const prospectStatusSchema = z.enum(["DRAFT", "INTAKE_COMPLETE", "BLUEPRINT_READY", "SUBSCRIPTION_REQUIRED", "CONVERTED", "LOST", "ABANDONED"]);
export const blueprintRevisionSourceSchema = z.enum(["NEXI", "NEXTEAM_STAFF", "TENANT_OWNER", "TENANT_TEAM_MEMBER", "SYSTEM"]);
export const blueprintApprovalStateSchema = z.enum(["DRAFT", "APPROVED", "DELIVERED", "SUPERSEDED"]);

/** Explicitly restricted to non-sensitive fields that are appropriate before subscription. */
export const prospectSchema = z.object({
  id: idSchema,
  status: prospectStatusSchema,
  businessName: z.string().min(1),
  website: z.string().url().optional(),
  industry: z.string().min(1),
  primaryLocation: addressSchema.optional(),
  additionalLocations: z.array(addressSchema),
  serviceArea: z.array(z.string().min(1)),
  yearsInBusiness: z.number().int().min(0).max(250).optional(),
  primaryContactName: z.string().min(1).optional(),
  primaryContactRole: z.string().min(1).optional(),
  notes: z.string().max(4000).optional(),
  onboardingCurrentStep: z.string().trim().min(1).max(120).optional(),
  onboardingProgressPercent: z.number().int().min(0).max(100).optional(),
  onboardingLastSavedAt: z.string().min(1).optional(),
  onboardingLastUpdatedBy: idSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  createdBy: idSchema
}).strict();

export const prospectSoftwareInventoryItemSchema = z.object({
  id: idSchema,
  category: z.string().min(1),
  provider: z.string().min(1),
  purpose: z.string().max(1000).optional(),
  replacementTiming: z.enum(["REPLACE_NOW", "REPLACE_LATER", "COEXIST", "UNKNOWN"]),
  notes: z.string().max(2000).optional()
}).strict();

export const prospectIntakeSchema = z.object({
  id: idSchema,
  prospectId: idSchema,
  services: z.array(z.string().min(1)),
  customerTypes: z.array(z.string().min(1)),
  serviceAreaNotes: z.string().max(2000).optional(),
  teamSize: z.number().int().min(0).max(100000).optional(),
  operatingHoursNotes: z.string().max(2000).optional(),
  brandVoice: z.string().max(2000).optional(),
  currentSystems: z.array(prospectSoftwareInventoryItemSchema),
  migrationRecommendation: z.string().max(4000).optional(),
  source: z.enum(["MANUAL", "NEXI"]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  createdBy: idSchema,
  lastSavedAt: z.string().min(1).optional(),
  lastUpdatedBy: idSchema.optional()
}).strict();

export const tenantOnboardingBlueprintSchema = z.object({
  id: idSchema,
  prospectId: idSchema,
  recommendedLayout: z.array(z.string().min(1)),
  nexiResponsibilities: z.array(z.string().min(1)),
  opportunities: z.object({
    nexcam: z.array(z.string().min(1)).optional(),
    nexdocs: z.array(z.string().min(1)).optional(),
    nexreach: z.array(z.string().min(1)).optional(),
    nexportal: z.array(z.string().min(1)).optional()
  }).strict(),
  recommendedForms: z.array(z.string().min(1)),
  recommendedWorkflows: z.array(z.string().min(1)),
  recommendedAutomations: z.array(z.string().min(1)),
  recommendedModules: z.array(platformModuleSchema),
  migrationRecommendation: z.string().max(4000).optional(),
  futureOpportunities: z.array(z.string().min(1)),
  createdAt: z.string().min(1),
  createdBy: idSchema
}).strict();

export const tenantOnboardingBlueprintRevisionSchema = z.object({
  id: idSchema,
  prospectId: idSchema,
  blueprintId: idSchema,
  previousRevisionId: idSchema.optional(),
  revisionNumber: z.number().int().positive(),
  snapshot: tenantOnboardingBlueprintSchema,
  actorId: idSchema,
  actorType: blueprintRevisionSourceSchema,
  source: blueprintRevisionSourceSchema,
  fieldsChanged: z.array(z.string().min(1)),
  reason: z.string().max(2000).optional(),
  approvalState: blueprintApprovalStateSchema,
  createdAt: z.string().min(1)
}).strict().superRefine((value, context) => {
  if (value.snapshot.id !== value.blueprintId || value.snapshot.prospectId !== value.prospectId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Onboarding plan revision snapshot must belong to the same prospect and plan." });
  }
  if (value.revisionNumber === 1 && value.previousRevisionId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "The first onboarding plan revision cannot reference a previous revision." });
  }
  if (value.revisionNumber > 1 && !value.previousRevisionId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Later onboarding plan revisions must reference the prior revision." });
  }
});

export const tenantUserRoleSchema = z.enum(["OWNER", "OFFICE_ADMIN", "TECHNICIAN"]);
export const tenantCapabilitySchema = z.enum(["team.view", "team.manage", "team.invite", "tenant.audit.read"]);

export const tenantUserSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  authUid: z.string().optional(),
  email: z.string().email().optional(),
  phones: z.array(z.string().min(1)).optional(),
  address: addressSchema.optional(),
  displayName: z.string().min(1),
  role: tenantUserRoleSchema,
  customRoleName: z.string().min(1).max(80).optional(),
  capabilities: z.array(tenantCapabilitySchema).optional(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const jobAccessScopeSchema = z.enum(["job.read", "checklist.write", "media.upload", "notes.write"]);

export const jobAccessLinkSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  jobId: idSchema,
  propertyId: idSchema.optional(),
  externalName: z.string().min(1),
  externalEmail: z.string().email().optional(),
  tokenHash: z.string().min(16),
  scopes: z.array(jobAccessScopeSchema).min(1),
  expiresAt: z.string(),
  revokedAt: z.string().optional(),
  createdAt: z.string(),
  createdBy: idSchema
});

export const tenantAdapterStatusSchema = z.object({
  tenantId: idSchema,
  adapter: z.enum(["crm", "media", "email", "sms", "maps", "llm", "voice"]),
  provider: z.string().min(1),
  configured: z.boolean(),
  ok: z.boolean(),
  checkedAt: z.string(),
  detail: z.string().optional()
});

export const tenantCostSummarySchema = z.object({
  tenantId: idSchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  estimatedCostUsd: z.number(),
  usageLogCount: z.number().int().min(0)
});

export const platformBackupRecordSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  storageRef: z.string().min(1),
  collectionCounts: z.record(z.number().int().min(0)),
  createdAt: z.string()
});

export const tenantDataExportSchema = z.object({
  tenantId: idSchema,
  exportedAt: z.string(),
  collections: z.record(z.array(z.unknown()))
});

export const contactChannelSchema = z.enum(["email", "sms", "both", "none"]);
export const phoneLabelSchema = z.enum(["Main", "Work", "Mobile", "Home", "Fax", "Other"]);
export const emailLabelSchema = z.enum(["Main", "Work", "Personal", "Other"]);
export const smsCapabilitySchema = z.enum(["mobile", "landline", "fax", "invalid", "unknown"]);
export const documentSequenceKindSchema = z.enum(["request", "quote", "job", "invoice", "receipt"]);
export const invoiceStatusSchema = z.enum(["draft", "sent", "awaiting_payment", "partial_pay", "paid", "void", "bad_debt"]);
export const quoteStatusSchema = z.enum(["draft", "pending_approval", "sent", "change_requested", "approved", "approved_internal", "declined", "expired", "archived"]);
export const quoteDeliveryModeSchema = z.enum(["email", "sms", "mark_sent"]);
export const quoteSignatureModeSchema = z.enum(["drawn", "typed"]);
export const quoteDepositKindSchema = z.enum(["amount", "percent"]);
export const invoiceDeliveryModeSchema = z.enum(["email", "sms", "mark_sent"]);
export const paymentScheduleTriggerSchema = z.enum(["on_approval", "on_job_close", "on_date"]);
export const paymentScheduleAmountKindSchema = z.enum(["amount", "percent"]);
export const receiptReviewChannelSchema = z.enum(["email", "sms"]);
export const signedDocumentKindSchema = z.enum(["completion_signoff", "waiver", "change_order", "custom"]);

export const documentNumberingRuleSchema = z.object({
  prefix: z.string(),
  separator: z.string(),
  padWidth: z.number().int().min(1),
  nextValue: z.number().int().min(1)
});

export const documentNumberingSettingsSchema = z.object({
  request: documentNumberingRuleSchema,
  quote: documentNumberingRuleSchema,
  job: documentNumberingRuleSchema,
  invoice: documentNumberingRuleSchema,
  receipt: documentNumberingRuleSchema.default({ prefix: "RCT", separator: "-", padWidth: 4, nextValue: 1 })
});

export const quoteDiscountSchema = z.object({
  kind: z.enum(["amount", "percent"]),
  value: z.number().min(0)
});

export const paymentScheduleMilestoneSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  trigger: paymentScheduleTriggerSchema,
  dueAt: z.string().optional(),
  amountKind: paymentScheduleAmountKindSchema,
  amount: z.number().min(0),
  note: z.string().optional()
});

export const paymentSchedulePlanSchema = z.object({
  enabled: z.boolean(),
  milestones: z.array(paymentScheduleMilestoneSchema).default([]),
  updatedAt: z.string().optional()
});

export const ledgerStatusEntrySchema = z.object({
  status: z.string().min(1),
  changedAt: z.string().min(1),
  changedBy: idSchema.optional(),
  note: z.string().optional()
});

export const quoteApprovalRulesSchema = z.object({
  requireSignature: z.boolean(),
  requireDeposit: z.boolean(),
  requireCardOnFile: z.boolean(),
  depositKind: quoteDepositKindSchema.optional(),
  depositValue: z.number().min(0).optional()
});

export const quoteTotalsSchema = z.object({
  subtotal: z.number(),
  discount: z.number().optional(),
  tax: z.number(),
  total: z.number(),
  taxRate: z.number().min(0).optional()
});

export const phoneContactSchema = z.object({
  id: idSchema.optional(),
  label: phoneLabelSchema,
  value: z.string().min(1),
  normalized: z.string().optional(),
  primary: z.boolean().default(false),
  receivesMessages: z.boolean().default(false),
  smsCapability: smsCapabilitySchema.default("unknown"),
  smsMode: z.enum(["one_way", "two_way"]).default("one_way")
});

export const emailContactSchema = z.object({
  id: idSchema.optional(),
  label: emailLabelSchema,
  value: z.string().email(),
  primary: z.boolean().default(false)
});

export const personNameSchema = z.object({
  title: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional()
});

export const clientContactSchema = z.object({
  id: idSchema.optional(),
  personName: personNameSchema.optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  billingContact: z.boolean().default(false),
  correspondenceContact: z.boolean().default(false),
  phones: z.array(phoneContactSchema).default([]),
  emails: z.array(emailContactSchema).default([]),
  channelPreference: contactChannelSchema.default("email")
});

export const clientCommunicationSettingsSchema = z.object({
  quotesAndInvoices: contactChannelSchema.default("email"),
  jobReminders: contactChannelSchema.default("email"),
  jobClosureFollowUps: contactChannelSchema.default("email"),
  reviewRequests: contactChannelSchema.default("email"),
  smsDefaultMode: z.enum(["one_way", "two_way"]).default("one_way")
});

export const clientSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  name: z.string().min(1),
  company: z.string().optional(),
  personName: personNameSchema.optional(),
  displayNamePreference: z.enum(["person", "company"]).optional(),
  primaryContactId: idSchema.optional(),
  billingContactId: idSchema.optional(),
  correspondenceContactId: idSchema.optional(),
  billingAddress: addressSchema.optional(),
  billingSameAsPrimaryProperty: z.boolean().optional(),
  contacts: z.array(clientContactSchema).optional(),
  communicationSettings: clientCommunicationSettingsSchema.optional(),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  tags: z.array(z.string()),
  consent: z.object({ email: z.boolean(), sms: z.boolean(), marketing: z.boolean().default(false) }),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  externalIds: z.object({ jobber: z.string().optional() }).optional(),
  archivedAt: z.string().optional(),
  archivedBy: idSchema.optional()
});

export const assetSchema = z.object({
  id: idSchema,
  kind: z.string(),
  label: z.string(),
  fields: z.record(z.union([z.string(), z.number(), z.boolean()]))
});

export const fieldDocsChecklistFieldTypeSchema = z.enum([
  "multi_select",
  "count",
  "measurement",
  "pass_fail",
  "free_text",
  "photo_attachment"
]);
export const fieldDocsChecklistFieldMemorySchema = z.enum(["property", "visit"]);
export const fieldDocsChecklistPassFailStatusSchema = z.enum(["pending", "pass", "fail", "not_applicable"]);

export const fieldDocsPersistentChecklistValueSchema = z.object({
  templateId: idSchema,
  fieldId: idSchema,
  label: z.string().min(1),
  type: fieldDocsChecklistFieldTypeSchema,
  status: fieldDocsChecklistPassFailStatusSchema.optional(),
  note: z.string().optional(),
  numberValue: z.number().optional(),
  multiValue: z.array(z.string()).optional(),
  mediaIds: z.array(idSchema).optional(),
  unit: z.string().optional(),
  updatedAt: z.string(),
  sourceChecklistId: idSchema,
  sourceVisitId: idSchema.optional()
});

export const propertySchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  parentSiteId: idSchema.optional(),
  siteName: z.string().optional(),
  label: z.string().optional(),
  address: addressSchema,
  billingAddressSameAsClient: z.boolean().optional(),
  access: z.object({
    gateCode: z.string().optional(),
    accessNotes: z.string().optional()
  }).optional(),
  contacts: z.array(clientContactSchema).optional(),
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
  assets: z.array(assetSchema),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  fieldDocs: z.object({
    persistentChecklistValues: z.record(fieldDocsPersistentChecklistValueSchema).optional()
  }).optional(),
  externalIds: z.object({ jobber: z.string().optional() }).optional()
});

export const intakeSurfaceSchema = z.enum(["request", "quote", "job", "visit", "invoice"]);
export const intakeFieldTypeSchema = z.enum(["text", "textarea", "email", "phone", "select", "boolean", "number", "multi_image"]);
export const intakeFieldGroupSchema = z.enum(["contact", "property", "pool", "safety", "service", "notes"]);
export const requestStatusSchema = z.enum(["new", "archived", "converted_to_quote", "converted_to_job"]);
export const requestSourceSchema = z.enum(["website_form", "office_existing_client", "office_new_client", "legacy_lead_backfill"]);
export const requestMatchTypeSchema = z.enum(["none", "exact_email", "exact_phone", "selected_existing_client", "selected_existing_property"]);

export const intakeFieldVisibilitySchema = z.object({
  request: z.boolean(),
  quote: z.boolean(),
  job: z.boolean(),
  visit: z.boolean(),
  invoice: z.boolean()
});

export const intakeFieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: intakeFieldTypeSchema,
  group: intakeFieldGroupSchema,
  required: z.boolean().optional(),
  options: z.array(z.string().min(1)).optional(),
  helpText: z.string().optional(),
  prominent: z.boolean().optional(),
  maxItems: z.number().int().min(1).optional()
});

export const intakeFieldValueSchema = intakeFieldDefinitionSchema.extend({
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string().min(1))]),
  visibility: intakeFieldVisibilitySchema
});

export const intakeSnapshotSchema = z.object({
  narrative: z.string().optional(),
  fieldValues: z.array(intakeFieldValueSchema),
  fieldIndex: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string().min(1))]))
});

export const requestFormSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  intro: z.string().optional(),
  active: z.boolean(),
  fieldDefinitions: z.array(intakeFieldDefinitionSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const serviceRequestMatchSchema = z.object({
  matchedClientId: idSchema.optional(),
  matchedPropertyId: idSchema.optional(),
  matchedBy: requestMatchTypeSchema,
  matchedValue: z.string().optional(),
  reviewRequired: z.boolean(),
  reviewedAt: z.string().optional()
});

export const serviceRequestSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  number: z.string().min(1).optional(),
  formId: idSchema.optional(),
  formSlug: z.string().min(1).optional(),
  source: requestSourceSchema,
  status: requestStatusSchema,
  subject: z.string().min(1),
  clientName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  propertyAddress: addressSchema.optional(),
  narrative: z.string(),
  consent: z.object({ email: z.boolean(), sms: z.boolean(), marketing: z.boolean().default(false) }),
  intake: intakeSnapshotSchema,
  match: serviceRequestMatchSchema,
  selectedClientId: idSchema.optional(),
  selectedPropertyId: idSchema.optional(),
  reviewedAt: z.string().optional(),
  convertedQuoteId: idSchema.optional(),
  convertedJobId: idSchema.optional(),
  sourceLeadId: idSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  archivedAt: z.string().optional(),
  reopenedAt: z.string().optional(),
  notifications: z.object({
    adminNotifiedAt: z.string().optional(),
    clientConfirmationAt: z.string().optional()
  }).optional()
});

export const lineItemSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().optional(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
  source: z.enum(["catalog", "custom"]).optional(),
  catalogItemId: idSchema.optional(),
  catalogCode: z.string().optional(),
  clientSelectable: z.boolean().optional(),
  defaultSelected: z.boolean().optional()
});

const rawJobStatusSchema = z.enum([
  "Upcoming",
  "Today",
  "Late",
  "Unscheduled",
  "Action Required",
  "Requires Invoicing",
  "Archived",
  "lead",
  "quoted",
  "scheduled",
  "in_progress",
  "complete",
  "invoiced",
  "paid"
]);

function normalizedStoredJobStatus(value: z.infer<typeof rawJobStatusSchema>): JobStatus {
  switch (value) {
    case "lead":
    case "quoted":
      return "Unscheduled";
    case "scheduled":
      return "Upcoming";
    case "in_progress":
      return "Today";
    case "complete":
      return "Action Required";
    case "invoiced":
    case "paid":
      return "Archived";
    default:
      return value;
  }
}

export const jobStatusSchema = rawJobStatusSchema.transform((value) => normalizedStoredJobStatus(value)) as z.ZodType<JobStatus>;

export const jobSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  number: z.string().min(1).optional(),
  clientId: idSchema,
  propertyId: idSchema.optional(),
  requestId: idSchema.optional(),
  quoteId: idSchema.optional(),
  status: jobStatusSchema,
  title: z.string(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  closedAt: z.string().optional(),
  closedBy: idSchema.optional(),
  archivedAt: z.string().optional(),
  archivedBy: idSchema.optional(),
  lineItems: z.array(lineItemSchema),
  totals: quoteTotalsSchema,
  paymentSchedule: paymentSchedulePlanSchema.optional(),
  intake: intakeSnapshotSchema.optional(),
  clientVisibility: z.object({
    hideFieldDocsFromPortal: z.boolean().optional()
  }).optional(),
  externalIds: z.object({ jobber: z.string().optional() }).optional()
});

export const quotePortalAccessSchema = z.object({
  tokenHash: z.string().optional(),
  tokenIssuedAt: z.string().optional(),
  viewedAt: z.string().optional(),
  lastApprovalAttemptAt: z.string().optional()
});

export const quoteSignatureRecordSchema = z.object({
  mode: quoteSignatureModeSchema,
  typedName: z.string().optional(),
  drawnDataUrl: z.string().optional(),
  signedAt: z.string(),
  ipAddress: z.string()
});

export const signedDocumentRecordSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  jobId: idSchema.optional(),
  propertyId: idSchema.optional(),
  visitId: idSchema.optional(),
  kind: signedDocumentKindSchema,
  title: z.string().min(1),
  bodyText: z.string().min(1),
  status: z.enum(["pending_signature", "signed"]),
  signature: quoteSignatureRecordSchema.optional(),
  createdBy: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  signedAt: z.string().optional()
});

export const quoteDeliveryRecordSchema = z.object({
  id: idSchema,
  mode: quoteDeliveryModeSchema,
  sentAt: z.string(),
  target: z.string().optional(),
  sentBy: z.string().optional(),
  receiptId: idSchema.optional(),
  subject: z.string().optional(),
  note: z.string().optional()
});

export const quoteLineCommentSchema = z.object({
  lineItemId: idSchema,
  comment: z.string().min(1)
});

export const quoteChangeRequestSchema = z.object({
  id: idSchema,
  requestedAt: z.string(),
  requestedBy: z.string().optional(),
  lineComments: z.array(quoteLineCommentSchema),
  note: z.string().optional(),
  resolvedAt: z.string().optional()
});

export const quoteDepositBridgeSchema = z.object({
  required: z.boolean(),
  kind: quoteDepositKindSchema,
  amount: z.number().min(0),
  capturedAt: z.string().optional(),
  cardholderName: z.string().optional(),
  cardBrand: z.string().optional(),
  cardLast4: z.string().optional(),
  cardOnFileAuthorized: z.boolean().optional(),
  autoSavedCardOnFile: z.boolean().optional()
});

export const quoteVersionSnapshotSchema = z.object({
  version: z.number().int().min(1),
  archivedAt: z.string(),
  reason: z.enum(["renewed", "edited_before_send"]),
  title: z.string(),
  lineItems: z.array(lineItemSchema),
  totals: quoteTotalsSchema,
  status: quoteStatusSchema,
  expiresAt: z.string().optional(),
  terms: z.string().optional(),
  discount: quoteDiscountSchema.optional(),
  approvalRules: quoteApprovalRulesSchema
});

export const quoteSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  number: z.string().min(1).optional(),
  clientId: idSchema,
  jobId: idSchema.optional(),
  requestId: idSchema.optional(),
  convertedJobId: idSchema.optional(),
  templateId: idSchema.optional(),
  salespersonUserId: idSchema.optional(),
  version: z.number().int().min(1).optional(),
  status: quoteStatusSchema,
  title: z.string(),
  lineItems: z.array(lineItemSchema),
  totals: quoteTotalsSchema,
  approvalRules: quoteApprovalRulesSchema,
  discount: quoteDiscountSchema.optional(),
  expiresAt: z.string().optional(),
  sentAt: z.string().optional(),
  approvedAt: z.string().optional(),
  approvedBy: z.string().optional(),
  approvedByRole: z.enum(["client", "OWNER", "OFFICE_ADMIN"]).optional(),
  archivedAt: z.string().optional(),
  approvalId: idSchema.optional(),
  pdfRef: z.string().optional(),
  portal: quotePortalAccessSchema.optional(),
  signature: quoteSignatureRecordSchema.optional(),
  delivery: z.array(quoteDeliveryRecordSchema).optional(),
  changeRequests: z.array(quoteChangeRequestSchema).optional(),
  deposit: quoteDepositBridgeSchema.optional(),
  paymentSchedule: paymentSchedulePlanSchema.optional(),
  terms: z.string().optional(),
  versions: z.array(quoteVersionSnapshotSchema).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  intake: intakeSnapshotSchema.optional(),
  externalIds: z.object({ jobber: z.string().optional(), stripe: z.string().optional() }).optional()
});

export const quoteTemplateSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  titlePrefix: z.string().optional(),
  defaultLineItems: z.array(lineItemSchema).optional(),
  defaultApprovalRules: quoteApprovalRulesSchema,
  defaultPaymentSchedule: paymentSchedulePlanSchema.optional(),
  expiryDays: z.number().int().min(1).optional(),
  terms: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const productServiceCatalogItemSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().min(0),
  category: z.enum(["service", "material", "equipment"]).default("service"),
  tag: z.string().min(1),
  taxable: z.boolean(),
  visible: z.boolean(),
  source: z.enum(["seed", "tenant"]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const communicationTemplateRecordSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  category: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  smsBody: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const reviewSequenceStepSettingSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  offsetDays: z.number().int().min(0),
  channels: z.enum(["email", "sms", "both"]),
  templateCategory: z.enum(["review_request_initial", "review_request_nudge"])
});

export const invoiceDeliveryPreferencesSchema = z.object({
  emailIncludePdf: z.boolean(),
  emailIncludeSummary: z.boolean(),
  emailIncludePayLink: z.boolean(),
  smsIncludeSummary: z.boolean(),
  smsIncludePayLink: z.boolean(),
  smsIncludeHostedLink: z.boolean()
});

const tenantOperatingProfileSchema = z.object({
  company: z.object({
    legalName: z.string().min(1).optional(),
    publicName: z.string().min(1).optional(),
    industry: z.string().min(1).optional(),
    timezone: z.string().min(1)
  }),
  locations: z.array(z.object({
    id: idSchema,
    label: z.string().min(1),
    address: addressSchema.optional(),
    active: z.boolean()
  })),
  businessHours: z.array(z.object({
    day: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
    open: z.string().min(1).optional(),
    close: z.string().min(1).optional(),
    closed: z.boolean()
  })).length(7),
  tax: z.object({
    enabled: z.boolean(),
    defaultRate: z.number().min(0).max(100),
    registrationId: z.string().min(1).optional()
  }),
  communicationIdentity: z.object({
    replyToEmail: z.string().email().optional(),
    replyToName: z.string().min(1).optional(),
    phone: z.string().min(1).optional()
  }),
  securityAudit: z.object({
    auditEventsEnabled: z.boolean(),
    requireApprovalForExternalSend: z.boolean()
  }),
  onboarding: z.object({
    completedSteps: z.array(tenantOnboardingStepSchema).superRefine((steps, context) => {
      if (new Set(steps).size !== steps.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Onboarding steps must not repeat." });
      }
      if (!steps.every((step, index) => step === tenantOnboardingSteps[index])) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Onboarding steps must be completed in guided order." });
      }
    }),
    selectedModules: z.array(platformModuleSchema).default([]),
    launchReviewedAt: z.string().min(1).optional(),
    checklist: secureOnboardingChecklistSchema
  })
});

export const propertyAssetFieldDefinitionSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  type: z.enum(["text", "number", "boolean"]),
  required: z.boolean().optional()
});

export const propertyAssetDefinitionSchema = z.object({
  kind: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  fields: z.array(propertyAssetFieldDefinitionSchema).max(40)
});

export const tenantMembershipAuditSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  action: z.enum(["member.upserted", "member.claims_applied", "tenant.cancellation_confirmation_one", "tenant.subscription_canceled", "tenant.resubscribed"]),
  actorId: idSchema,
  targetUserId: idSchema,
  detail: z.string().min(1).max(500),
  createdAt: z.string(),
  correlationId: z.string().min(1).max(200).optional(),
  subscriptionId: idSchema.optional()
});

export const crmSettingsSchema = z.object({
  tenantId: idSchema,
  operatingProfile: tenantOperatingProfileSchema.default({
    company: { timezone: "America/New_York" },
    locations: [],
    businessHours: [
      { day: "monday", open: "09:00", close: "17:00", closed: false },
      { day: "tuesday", open: "09:00", close: "17:00", closed: false },
      { day: "wednesday", open: "09:00", close: "17:00", closed: false },
      { day: "thursday", open: "09:00", close: "17:00", closed: false },
      { day: "friday", open: "09:00", close: "17:00", closed: false },
      { day: "saturday", closed: true },
      { day: "sunday", closed: true }
    ],
    tax: { enabled: false, defaultRate: 0 },
    communicationIdentity: {},
    securityAudit: { auditEventsEnabled: true, requireApprovalForExternalSend: true },
    onboarding: {
      completedSteps: [],
      selectedModules: [],
      checklist: { tasks: defaultSecureOnboardingTasks.map((task) => ({ ...task })), auditHistory: [] }
    }
  }),
  documentNumbering: documentNumberingSettingsSchema,
  quoteDefaults: z.object({
    expiryDays: z.number().int().min(1),
    autoSaveCardOnDeposit: z.boolean(),
    approvalRules: quoteApprovalRulesSchema,
    terms: z.string()
  }),
  invoiceDefaults: z.object({
    dueDays: z.number().int().min(0),
    terms: z.string(),
    delivery: invoiceDeliveryPreferencesSchema,
    tippingEnabled: z.boolean()
  }).default({
    dueDays: 0,
    terms: "Payment is due as scheduled on the invoice. Reach out to the office before the due date if anything needs to be reviewed.",
    delivery: {
      emailIncludePdf: true,
      emailIncludeSummary: true,
      emailIncludePayLink: true,
      smsIncludeSummary: true,
      smsIncludePayLink: true,
      smsIncludeHostedLink: true
    },
    tippingEnabled: false
  }),
  portalDefaults: z.object({
    keepBusinessAddressPrivate: z.boolean(),
    hubSessionReverifyDays: z.number().int().min(1)
  }).default({
    keepBusinessAddressPrivate: false,
    hubSessionReverifyDays: 14
  }),
  reviewDefaults: z.object({
    enabled: z.boolean(),
    steps: z.array(reviewSequenceStepSettingSchema)
  }).default({
    enabled: true,
    steps: [
      { id: "review_initial", label: "Initial review request", offsetDays: 1, channels: "both", templateCategory: "review_request_initial" },
      { id: "review_nudge_1", label: "Review nudge", offsetDays: 4, channels: "both", templateCategory: "review_request_nudge" },
      { id: "review_nudge_2", label: "Final review nudge", offsetDays: 10, channels: "both", templateCategory: "review_request_nudge" }
    ]
  }),
  propertyAssetDefinitions: z.array(propertyAssetDefinitionSchema).default([]),
  catalogItems: z.array(productServiceCatalogItemSchema).default([]),
  communicationTemplates: z.array(communicationTemplateRecordSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
});

const rawInvoiceStatusSchema = z.enum(["draft", "sent", "paid", "void", "overdue", "awaiting_payment", "partial_pay", "bad_debt"]);

function normalizedStoredInvoiceStatus(value: z.infer<typeof rawInvoiceStatusSchema>) {
  if (value === "overdue") {
    return "awaiting_payment" as const;
  }
  return value;
}

export const paymentProviderSchema = z.enum(["stripe", "paypal", "manual", "quote_bridge"]);
export const paymentMethodKindSchema = z.enum(["card", "ach", "cash", "check", "bank_transfer", "other", "paypal", "venmo"]);
export const paymentStatusSchema = z.enum(["pending", "failed", "succeeded", "refunded", "partially_refunded"]);
export const depositStatusSchema = z.enum(["available", "partially_applied", "applied", "released", "refunded"]);
export const creditStatusSchema = z.enum(["available", "partially_applied", "applied"]);
export const refundStatusSchema = z.enum(["pending", "succeeded", "failed"]);
export const receiptReviewStatusSchema = z.enum(["draft", "ready_to_send", "sent"]);
export const receiptReviewKindSchema = z.enum(["payment", "refund"]);
export const receiptAttachmentKindSchema = z.enum(["invoice_pdf", "quote_pdf", "field_report", "photo", "job_file", "signed_document"]);

export const savedBillingCardSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  cardholderName: z.string().optional(),
  brand: z.string().optional(),
  last4: z.string().optional(),
  reusable: z.boolean(),
  source: z.enum(["quote_approval", "manual", "migration"]),
  sourceQuoteId: idSchema.optional(),
  externalIds: z.object({
    stripePaymentMethodId: z.string().optional(),
    paypalVaultTokenId: z.string().optional(),
    localReusableToken: z.string().optional()
  }).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const clientBillingProfileSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  savedCards: z.array(savedBillingCardSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const ledgerApplicationSchema = z.object({
  invoiceId: idSchema,
  amount: z.number().min(0),
  appliedAt: z.string().min(1),
  releasedAt: z.string().optional(),
  releasedBy: idSchema.optional(),
  note: z.string().optional()
});

export const paymentMethodDetailsSchema = z.object({
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

export const paymentSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  invoiceId: idSchema.optional(),
  quoteId: idSchema.optional(),
  depositId: idSchema.optional(),
  provider: paymentProviderSchema,
  method: paymentMethodKindSchema,
  status: paymentStatusSchema,
  amount: z.number().min(0),
  appliedAmount: z.number().min(0),
  excessCreditAmount: z.number().min(0).optional(),
  tipAmount: z.number().min(0).optional(),
  currency: z.literal("usd"),
  note: z.string().optional(),
  capturedAt: z.string().optional(),
  failedAt: z.string().optional(),
  savedCardId: idSchema.optional(),
  methodDetails: paymentMethodDetailsSchema.optional(),
  cardSummary: z.object({
    cardholderName: z.string().optional(),
    brand: z.string().optional(),
    last4: z.string().optional()
  }).optional(),
  externalIds: z.object({
    stripeCheckoutSessionId: z.string().optional(),
    stripePaymentIntentId: z.string().optional(),
    paypalOrderId: z.string().optional(),
    paypalCaptureId: z.string().optional()
  }).optional(),
  statusHistory: z.array(ledgerStatusEntrySchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const depositSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  paymentId: idSchema,
  quoteId: idSchema.optional(),
  invoiceId: idSchema.optional(),
  source: z.enum(["quote_approval", "billing_history"]),
  amount: z.number().min(0),
  availableAmount: z.number().min(0),
  status: depositStatusSchema,
  applications: z.array(ledgerApplicationSchema),
  statusHistory: z.array(ledgerStatusEntrySchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const creditSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  invoiceId: idSchema.optional(),
  paymentId: idSchema.optional(),
  depositId: idSchema.optional(),
  source: z.enum(["overpayment", "manual_adjustment", "released_deposit"]),
  amount: z.number().min(0),
  availableAmount: z.number().min(0),
  status: creditStatusSchema,
  applications: z.array(ledgerApplicationSchema),
  statusHistory: z.array(ledgerStatusEntrySchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const refundSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  paymentId: idSchema,
  invoiceId: idSchema.optional(),
  provider: paymentProviderSchema,
  method: paymentMethodKindSchema,
  amount: z.number().min(0),
  reason: z.string().optional(),
  status: refundStatusSchema,
  externalIds: z.object({
    stripeRefundId: z.string().optional(),
    paypalRefundId: z.string().optional()
  }).optional(),
  statusHistory: z.array(ledgerStatusEntrySchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const receiptReviewAttachmentSchema = z.object({
  id: idSchema,
  kind: receiptAttachmentKindSchema,
  label: z.string().min(1),
  refId: idSchema.optional(),
  storageRef: z.string().optional(),
  mime: z.string().optional()
});

export const receiptReviewSendRecordSchema = z.object({
  id: idSchema,
  channel: receiptReviewChannelSchema,
  target: z.string().min(1),
  sentAt: z.string().min(1),
  receiptId: idSchema.optional()
});

export const receiptReviewSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  number: z.string().min(1).optional(),
  clientId: idSchema,
  kind: receiptReviewKindSchema,
  paymentId: idSchema.optional(),
  refundId: idSchema.optional(),
  invoiceId: idSchema.optional(),
  quoteId: idSchema.optional(),
  jobId: idSchema.optional(),
  status: receiptReviewStatusSchema,
  attachments: z.array(receiptReviewAttachmentSchema),
  subject: z.string().default("Your payment receipt"),
  bodyText: z.string().default("Attached is your updated receipt and supporting files."),
  emailRecipients: z.array(z.string().email()).default([]),
  smsRecipients: z.array(z.string().min(1)).default([]),
  sendChannels: z.array(receiptReviewChannelSchema).default(["email"]),
  hostedLink: z.string().default(""),
  statusHistory: z.array(ledgerStatusEntrySchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  sentAt: z.string().optional(),
  sendHistory: z.array(receiptReviewSendRecordSchema).optional()
});

export const invoiceLedgerSummarySchema = z.object({
  depositApplied: z.number().min(0),
  creditApplied: z.number().min(0),
  paymentApplied: z.number().min(0),
  refundedAmount: z.number().min(0),
  balanceDue: z.number().min(0),
  overdue: z.boolean(),
  writtenOffAmount: z.number().min(0).optional()
});

export const invoicePortalAccessSchema = z.object({
  tokenHash: z.string().optional(),
  tokenIssuedAt: z.string().optional(),
  viewedAt: z.string().optional(),
  lastPaymentAttemptAt: z.string().optional()
});

export const invoiceDeliveryRecordSchema = z.object({
  id: idSchema,
  mode: invoiceDeliveryModeSchema,
  sentAt: z.string().min(1),
  target: z.string().optional(),
  sentBy: z.string().optional(),
  receiptId: z.string().optional(),
  subject: z.string().optional(),
  note: z.string().optional(),
  includePdf: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  includePayLink: z.boolean().optional(),
  includeHostedLink: z.boolean().optional()
});

export const invoiceJobReferenceSchema = z.object({
  jobId: idSchema,
  number: z.string().min(1).optional(),
  title: z.string().min(1),
  amount: z.number().min(0)
});

export const invoiceSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  number: z.string().min(1).optional(),
  clientId: idSchema,
  jobId: idSchema.optional(),
  jobIds: z.array(idSchema).optional(),
  jobReferences: z.array(invoiceJobReferenceSchema).optional(),
  quoteId: idSchema.optional(),
  requestId: idSchema.optional(),
  status: rawInvoiceStatusSchema.transform((value) => normalizedStoredInvoiceStatus(value)),
  title: z.string(),
  lineItems: z.array(lineItemSchema),
  totals: quoteTotalsSchema,
  discount: quoteDiscountSchema.optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  sentAt: z.string().optional(),
  dueAt: z.string().optional(),
  paidAt: z.string().optional(),
  voidedAt: z.string().optional(),
  voidedBy: idSchema.optional(),
  badDebtAt: z.string().optional(),
  badDebtBy: idSchema.optional(),
  terms: z.string().optional(),
  paymentSchedule: paymentSchedulePlanSchema.optional(),
  deliveryDefaults: invoiceDeliveryPreferencesSchema.optional(),
  portal: invoicePortalAccessSchema.optional(),
  delivery: z.array(invoiceDeliveryRecordSchema).optional(),
  statusHistory: z.array(ledgerStatusEntrySchema).optional(),
  ledger: invoiceLedgerSummarySchema.optional(),
  intake: intakeSnapshotSchema.optional(),
  externalIds: z.object({ jobber: z.string().optional(), stripe: z.string().optional() }).optional()
});

export const visitSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  jobId: idSchema,
  requestId: idSchema.optional(),
  start: z.string(),
  end: z.string(),
  assignedTo: z.array(idSchema),
  checklistRef: idSchema.optional(),
  outcome: z.string().optional(),
  intake: intakeSnapshotSchema.optional()
});

export const mediaSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema.optional(),
  jobId: idSchema.optional(),
  visitId: idSchema.optional(),
  propertyId: idSchema.optional(),
  captureBatchId: idSchema.optional(),
  type: z.enum(["photo", "video", "audio", "pdf"]),
  storageRef: z.string().min(1),
  thumbRef: z.string().optional(),
  exif: z.object({
    gps: z.object({ lat: z.number(), lng: z.number() }).optional(),
    ts: z.string().optional()
  }).optional(),
  aiTags: z.array(z.string()),
  manualTags: z.array(z.string()).optional(),
  aiCaption: z.string().optional(),
  comments: z.array(z.object({
    id: idSchema,
    text: z.string().min(1),
    createdAt: z.string(),
    author: z.string().optional()
  })).optional(),
  annotations: z.array(z.object({
    id: idSchema,
    kind: z.literal("path"),
    color: z.string().optional(),
    createdAt: z.string(),
    points: z.array(z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1)
    })).min(2)
  })).optional(),
  capturedBy: z.string().optional(),
  hiddenFromClient: z.boolean().optional(),
  trashedAt: z.string().optional(),
  trashedBy: z.string().optional(),
  purgeAfter: z.string().optional(),
  externalIds: z.object({ companycam: z.string().optional() }).optional()
});

export const nexDocsFolderSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  label: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  createdBy: idSchema.optional()
});

export const nexDocsDocumentKindSchema = z.enum([
  "uploaded_file",
  "quote_pdf",
  "invoice_pdf",
  "receipt",
  "statement",
  "field_report",
  "photo",
  "signed_document"
]);

export const nexDocsDocumentSourceSchema = z.enum(["staff_upload", "client_upload", "generated"]);

export const nexDocsDocumentSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  folderId: idSchema.optional(),
  propertyId: idSchema.optional(),
  jobId: idSchema.optional(),
  visitId: idSchema.optional(),
  quoteId: idSchema.optional(),
  invoiceId: idSchema.optional(),
  receiptReviewId: idSchema.optional(),
  signedDocumentId: idSchema.optional(),
  kind: nexDocsDocumentKindSchema,
  source: nexDocsDocumentSourceSchema,
  label: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  storageRef: z.string().min(1),
  sizeBytes: z.number().int().min(0).optional(),
  searchText: z.string().optional(),
  hiddenFromClient: z.boolean().optional(),
  uploadedBy: idSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const captureBatchStatusSchema = z.enum(["draft", "unassigned", "assigned"]);
export const captureBatchAssignmentModeSchema = z.enum(["existing_client", "request", "decide_later"]);

export const captureBatchSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  status: captureBatchStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  createdBy: idSchema.optional(),
  mediaIds: z.array(idSchema).default([]),
  latestCapturedAt: z.string().optional(),
  originGps: z.object({ lat: z.number(), lng: z.number() }).optional(),
  latestGps: z.object({ lat: z.number(), lng: z.number() }).optional(),
  assignedClientId: idSchema.optional(),
  assignedJobId: idSchema.optional(),
  assignedVisitId: idSchema.optional(),
  assignedRequestId: idSchema.optional(),
  assignmentMode: captureBatchAssignmentModeSchema.optional(),
  assignedAt: z.string().optional()
});

export const serviceDefSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string(),
  active: z.boolean()
});

export const siteJobBlueprintSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  jobId: idSchema.optional(),
  kind: z.literal("site_blueprint"),
  fields: z.record(z.union([z.string(), z.number()])),
  extractedFrom: idSchema,
  extractedAt: z.string()
});

export const nexiBlueprintSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  services: z.array(serviceDefSchema),
  pricingNotes: z.string(),
  serviceArea: z.array(z.string()),
  brandVoice: z.string(),
  terminology: z.record(z.string())
});

export const eventTypeSchema = z.enum([
  "client.created",
  "request.created",
  "request.converted_to_quote",
  "request.converted_to_job",
  "job.created",
  "job.completed",
  "job.state_changed",
  "job.closed",
  "job.requires_invoicing_cleared",
  "visit.booked",
  "visit.confirmed",
  "visit.booking_confirmation_sent",
  "visit.completed",
  "invoice.reminder_due",
  "media.uploaded",
  "checklist.completed",
  "quote.created",
  "quote.sent",
  "quote.viewed",
  "quote.deposit_paid",
  "quote.approved",
  "quote.signed",
  "quote.change_requested",
  "quote.renewed",
  "quote.converted_to_job",
  "invoice.created",
  "invoice.sent",
  "invoice.paid",
  "payment.created",
  "payment.failed",
  "refund.created",
  "invoice.voided",
  "invoice.bad_debt",
  "receipt.review_created",
  "signed_document.created",
  "signed_document.signed",
  "portal.link_sent",
  "portal.session_started",
  "statement.sent",
  "review.sequence_started",
  "review.sequence_step_sent",
  "review.sequence_stopped",
  "review.marked",
  "lead.received",
  "review.received",
  "content.published"
]);

export const busEventSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  type: eventTypeSchema,
  payload: jsonValueSchema,
  ts: z.string(),
  processedBy: z.array(z.string())
});

export const approvalItemSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  kind: artifactKindSchema,
  preview: z.object({
    title: z.string(),
    body: z.string(),
    mediaRefs: z.array(idSchema).optional()
  }),
  execute: z.object({
    service: z.string(),
    op: z.string(),
    args: jsonValueSchema
  }),
  status: z.enum(["pending", "approved", "rejected", "executed", "failed"]),
  createdBy: z.enum(["nexi", "system", "user"]),
  decidedAt: z.string().optional(),
  decidedBy: z.string().optional(),
  executedAt: z.string().optional(),
  executedBy: z.string().optional()
});

export const sourceSchema = z.object({
  rail: z.enum(["jobber", "companycam", "native", "gsc", "gbp", "email"]),
  ref: z.string(),
  label: z.string()
});

const toolRunResultSchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
  z.string(),
  z.number(),
  z.boolean(),
  z.null()
]);

export const conversationRecordSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  tenantUserId: idSchema.optional(),
  conversationId: idSchema.optional(),
  userText: z.string(),
  assistantText: z.string(),
  sources: z.array(sourceSchema),
  toolRuns: z.array(z.object({
    name: z.string(),
    sources: z.array(sourceSchema),
    result: toolRunResultSchema
  })).optional(),
  createdAt: z.string()
});

export const failureLogRecordSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  module: z.literal("nexi"),
  op: z.string(),
  question: z.string(),
  reason: z.string(),
  sources: z.array(sourceSchema),
  correctionText: z.string().optional(),
  flaggedConversationId: idSchema.optional(),
  flaggedQuestion: z.string().optional(),
  flaggedAnswer: z.string().optional(),
  flaggedAnswerSources: z.array(sourceSchema).optional(),
  createdAt: z.string()
});

export const usageLogRecordSchema = z.object({
  tenantId: idSchema,
  provider: z.enum(["anthropic", "elevenlabs", "openai"]),
  model: z.string(),
  routeActionName: z.string(),
  taskType: z.string(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheCreationInputTokens: z.number(),
    cacheReadInputTokens: z.number(),
    totalTokens: z.number(),
    characters: z.number().optional(),
    audioBytes: z.number().optional()
  }),
  estimatedCostUsd: z.number().nullable(),
  ok: z.boolean(),
  errorSummary: z.string(),
  createdAt: z.string()
});

export const runtimeIdentitySchema = z.object({
  environment: z.string(),
  tenantId: z.string().nullable(),
  crmRepositoryDriver: z.enum(["firestore", "memory"]),
  configurationStatus: z.enum(["valid", "invalid"]),
  missingRequiredVariables: z.array(z.string()),
  isolatedMemoryMode: z.boolean()
});

export const versionResponseSchema = z.object({
  sha: z.string(),
  builtAt: z.string()
}).and(runtimeIdentitySchema);

export const healthRailSchema = z.object({
  ok: z.boolean(),
  configured: z.boolean(),
  provider: z.string(),
  op: z.string(),
  latencyMs: z.number(),
  status: z.number().optional(),
  detail: z.string().optional()
});

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  checkedAt: z.string(),
  rails: z.record(healthRailSchema),
  runtime: runtimeIdentitySchema
});

export type TenantDoc = z.infer<typeof tenantSchema>;
export type SplinterJob = z.infer<typeof splinterJobSchema>;
export type SplinterJobCreate = z.infer<typeof splinterJobCreateSchema>;
export type SplinterJobUpdate = z.infer<typeof splinterJobUpdateSchema>;
export type SplinterJobState = z.infer<typeof splinterJobStateSchema>;
export type SplinterWorkerResult = z.infer<typeof splinterWorkerResultSchema>;
export type TenantBrandingDoc = z.infer<typeof tenantBrandingSchema>;
export type PlatformPlanDoc = z.infer<typeof platformPlanSchema>;
export type TenantSubscriptionDoc = z.infer<typeof tenantSubscriptionSchema>;
export type PlatformSubscriptionPackageDoc = z.infer<typeof platformSubscriptionPackageSchema>;
export type PlatformSubscriptionAssignmentDoc = z.infer<typeof platformSubscriptionAssignmentSchema>;
export type TenantBlockerDoc = z.infer<typeof tenantBlockerSchema>;
export type PlatformSupportEscalationDoc = z.infer<typeof platformSupportEscalationSchema>;
export type ProspectDoc = z.infer<typeof prospectSchema>;
export type ProspectIntakeDoc = z.infer<typeof prospectIntakeSchema>;
export type TenantOnboardingBlueprintDoc = z.infer<typeof tenantOnboardingBlueprintSchema>;
export type TenantOnboardingBlueprintRevisionDoc = z.infer<typeof tenantOnboardingBlueprintRevisionSchema>;
export type TenantAdapterStatusDoc = z.infer<typeof tenantAdapterStatusSchema>;
export type TenantCostSummaryDoc = z.infer<typeof tenantCostSummarySchema>;
export type PlatformBackupRecordDoc = z.infer<typeof platformBackupRecordSchema>;
export type TenantDataExportDoc = z.infer<typeof tenantDataExportSchema>;
export type ClientDoc = z.infer<typeof clientSchema>;
export type PropertyDoc = z.infer<typeof propertySchema>;
export type RequestFormDoc = z.infer<typeof requestFormSchema>;
export type ServiceRequestDoc = z.infer<typeof serviceRequestSchema>;
export type JobDoc = z.infer<typeof jobSchema>;
export type QuoteDoc = z.infer<typeof quoteSchema>;
export type QuoteTemplateDoc = z.infer<typeof quoteTemplateSchema>;
export type CrmSettingsDoc = z.infer<typeof crmSettingsSchema>;
export type InvoiceDoc = z.infer<typeof invoiceSchema>;
export type ClientBillingProfileDoc = z.infer<typeof clientBillingProfileSchema>;
export type PaymentDoc = z.infer<typeof paymentSchema>;
export type DepositDoc = z.infer<typeof depositSchema>;
export type CreditDoc = z.infer<typeof creditSchema>;
export type RefundDoc = z.infer<typeof refundSchema>;
export type ReceiptReviewDoc = z.infer<typeof receiptReviewSchema>;
export type VisitDoc = z.infer<typeof visitSchema>;
export type MediaDoc = z.infer<typeof mediaSchema>;
export type NexDocsFolderDoc = z.infer<typeof nexDocsFolderSchema>;
export type NexDocsDocumentDoc = z.infer<typeof nexDocsDocumentSchema>;
export type SiteJobBlueprintDoc = z.infer<typeof siteJobBlueprintSchema>;
export type NexiBlueprintDoc = z.infer<typeof nexiBlueprintSchema>;
export type ApprovalItemDoc = z.infer<typeof approvalItemSchema>;
export type ConversationDoc = z.infer<typeof conversationRecordSchema>;
export type FailureLogDoc = z.infer<typeof failureLogRecordSchema>;
export type UsageLogDoc = z.infer<typeof usageLogRecordSchema>;
