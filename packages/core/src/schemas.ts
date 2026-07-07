import { z } from "zod";

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

export const addressSchema = z.object({
  street1: z.string(),
  street2: z.string().optional(),
  city: z.string(),
  province: z.string(),
  postalCode: z.string(),
  country: z.string()
});

export const artifactKindSchema = z.enum([
  "email",
  "sms",
  "gbp_post",
  "social_post",
  "article",
  "quote",
  "invoice",
  "site_publish",
  "review_reply"
]);

export const tenantSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  industryPack: z.enum(["pool_leak", "hvac", "plumbing"]),
  branding: z.object({
    assistantName: z.string().min(1),
    logoRef: z.string().optional(),
    colors: z.record(z.string()).optional()
  }),
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
  plan: z.enum(["nexi", "marketing", "suite"])
});

export const clientSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  name: z.string().min(1),
  company: z.string().optional(),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  tags: z.array(z.string()),
  consent: z.object({ email: z.boolean(), sms: z.boolean() }),
  externalIds: z.object({ jobber: z.string().optional() }).optional()
});

export const assetSchema = z.object({
  id: idSchema,
  kind: z.string(),
  label: z.string(),
  fields: z.record(z.union([z.string(), z.number(), z.boolean()]))
});

export const propertySchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  address: addressSchema,
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
  assets: z.array(assetSchema),
  externalIds: z.object({ jobber: z.string().optional() }).optional()
});

export const lineItemSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number()
});

export const jobStatusSchema = z.enum([
  "lead",
  "quoted",
  "scheduled",
  "in_progress",
  "complete",
  "invoiced",
  "paid"
]);

export const jobSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  propertyId: idSchema.optional(),
  status: jobStatusSchema,
  title: z.string(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  lineItems: z.array(lineItemSchema),
  totals: z.object({ subtotal: z.number(), tax: z.number(), total: z.number() }),
  externalIds: z.object({ jobber: z.string().optional() }).optional()
});

export const quoteSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  jobId: idSchema.optional(),
  status: z.enum(["draft", "pending_approval", "sent", "signed", "declined"]),
  title: z.string(),
  lineItems: z.array(lineItemSchema),
  totals: z.object({ subtotal: z.number(), tax: z.number(), total: z.number() }),
  approvalId: idSchema.optional(),
  pdfRef: z.string().optional(),
  portalTokenHash: z.string().optional(),
  signedBy: z.string().optional(),
  signedAt: z.string().optional(),
  signatureIp: z.string().optional(),
  externalIds: z.object({ jobber: z.string().optional(), stripe: z.string().optional() }).optional()
});

export const invoiceSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  clientId: idSchema,
  jobId: idSchema.optional(),
  quoteId: idSchema.optional(),
  status: z.enum(["draft", "sent", "paid", "void", "overdue"]),
  title: z.string(),
  lineItems: z.array(lineItemSchema),
  totals: z.object({ subtotal: z.number(), tax: z.number(), total: z.number() }),
  dueAt: z.string().optional(),
  paidAt: z.string().optional(),
  externalIds: z.object({ jobber: z.string().optional(), stripe: z.string().optional() }).optional()
});

export const visitSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  jobId: idSchema,
  start: z.string(),
  end: z.string(),
  assignedTo: z.array(idSchema),
  checklistRef: idSchema.optional(),
  outcome: z.string().optional()
});

export const mediaSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  jobId: idSchema.optional(),
  propertyId: idSchema.optional(),
  type: z.enum(["photo", "video", "pdf"]),
  storageRef: z.string().min(1),
  thumbRef: z.string().optional(),
  exif: z.object({
    gps: z.object({ lat: z.number(), lng: z.number() }).optional(),
    ts: z.string().optional()
  }).optional(),
  aiTags: z.array(z.string()),
  aiCaption: z.string().optional(),
  capturedBy: z.string().optional(),
  externalIds: z.object({ companycam: z.string().optional() }).optional()
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
  "job.created",
  "job.completed",
  "visit.booked",
  "visit.completed",
  "media.uploaded",
  "quote.sent",
  "quote.signed",
  "invoice.paid",
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
  decidedAt: z.string().optional()
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
  provider: z.enum(["anthropic", "elevenlabs"]),
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

export const versionResponseSchema = z.object({
  sha: z.string(),
  builtAt: z.string()
});

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
  rails: z.record(healthRailSchema)
});

export type TenantDoc = z.infer<typeof tenantSchema>;
export type ClientDoc = z.infer<typeof clientSchema>;
export type PropertyDoc = z.infer<typeof propertySchema>;
export type JobDoc = z.infer<typeof jobSchema>;
export type QuoteDoc = z.infer<typeof quoteSchema>;
export type InvoiceDoc = z.infer<typeof invoiceSchema>;
export type VisitDoc = z.infer<typeof visitSchema>;
export type MediaDoc = z.infer<typeof mediaSchema>;
export type SiteJobBlueprintDoc = z.infer<typeof siteJobBlueprintSchema>;
export type NexiBlueprintDoc = z.infer<typeof nexiBlueprintSchema>;
export type ApprovalItemDoc = z.infer<typeof approvalItemSchema>;
export type ConversationDoc = z.infer<typeof conversationRecordSchema>;
export type FailureLogDoc = z.infer<typeof failureLogRecordSchema>;
export type UsageLogDoc = z.infer<typeof usageLogRecordSchema>;
