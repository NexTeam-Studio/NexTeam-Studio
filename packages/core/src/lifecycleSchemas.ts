import { z } from "zod";
import { addressSchema, idSchema } from "./schemas.js";

export const decisionIdSchema = z.enum([
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "D6",
  "D7",
  "D8",
  "D9",
  "D10",
  "D11",
  "D12",
  "D13",
  "D14",
  "D15",
  "D16",
  "D17",
  "D18",
  "D19"
]);

export const requestLifecycleStatusSchema = z.enum([
  "new",
  "contact_attempted",
  "awaiting_customer_info",
  "follow_up_scheduled",
  "qualified",
  "not_serviceable",
  "outside_service_area",
  "duplicate",
  "spam",
  "needs_manager_review",
  "closed"
]);
export const quoteLifecycleStatusSchema = z.enum(["draft", "sent", "superseded", "accepted", "declined", "expired"]);
export const quoteClientResponseStatusSchema = z.enum(["none", "changes_requested"]);
export const workPackageStatusSchema = z.enum(["draft", "awaiting_authorization", "authorized", "in_progress", "work_complete", "closed", "canceled"]);
export const jobLifecycleStatusSchema = z.enum(["open", "on_hold", "work_complete", "closed", "canceled"]);
export const visitScheduleStatusSchema = z.enum(["unscheduled", "scheduled", "canceled"]);
export const visitTravelStatusSchema = z.enum(["not_started", "traveling", "arrived"]);
export const visitLifecycleStatusSchema = z.enum(["not_started", "in_progress", "paused", "unable_to_complete", "completed", "canceled"]);
export const fieldDocumentationStatusSchema = z.enum(["not_started", "incomplete", "requirements_complete"]);
export const customerReportStatusSchema = z.enum(["not_started", "draft", "awaiting_review", "approved", "sent"]);
export const invoiceLifecycleStatusSchema = z.enum(["draft", "open", "void", "written_off"]);
export const invoiceDeliveryStatusSchema = z.enum(["not_sent", "sent", "delivered", "failed"]);
export const invoiceBalanceStatusSchema = z.enum(["unpaid", "partially_paid", "paid", "credit_balance"]);
export const invoiceDueStatusSchema = z.enum(["not_due", "due_today", "overdue"]);
export const invoiceCustomerViewStatusSchema = z.enum(["not_viewed", "viewed"]);
export const ledgerTransactionTypeSchema = z.enum(["charge", "refund", "adjustment"]);
export const ledgerTransactionStatusSchema = z.enum(["pending", "succeeded", "failed", "disputed"]);
export const allocationTypeSchema = z.enum(["deposit", "invoice_payment", "account_credit"]);
export const paymentScheduleStatusSchema = z.enum(["draft", "active", "completed", "superseded", "canceled"]);
export const paymentScheduleInstallmentStatusSchema = z.enum(["pending", "partially_paid", "paid", "past_due"]);
export const customerDocumentPackageManifestStatusSchema = z.enum(["draft", "finalized", "superseded"]);
export const followUpTaskStatusSchema = z.enum(["pending", "completed", "snoozed", "canceled", "overdue"]);
export const clientScheduleRequestTypeSchema = z.enum(["reschedule", "cancellation"]);
export const clientScheduleRequestStatusSchema = z.enum(["pending", "accepted", "declined", "counter_proposed", "withdrawn", "expired"]);
export const actorSurfaceSchema = z.enum(["office_web", "field_mobile", "portal", "chat", "automation"]);
export const confirmationTierSchema = z.enum(["none", "undo", "standard", "high", "financial"]);
export const communicationModeSchema = z.enum(["manual", "auto", "review_gated"]);
export const commandKindSchema = z.enum(["command", "query"]);
export const blockingCodeSchema = z.enum([
  "missing_required_field",
  "permission_denied",
  "offline_restricted",
  "invalid_state",
  "payment_failure",
  "amount_exceeds_balance",
  "amount_below_minimum",
  "payment_method_invalid",
  "duplicate_payment_in_progress",
  "capacity_conflict",
  "availability_conflict",
  "authorization_missing",
  "financial_policy_block",
  "document_not_approved",
  "communication_suppressed"
]);
export const dominantActionToneSchema = z.enum(["dominant", "secondary", "quiet", "danger", "blocked"]);

export const requestLifecycleSchema = z.object({
  requestStatus: requestLifecycleStatusSchema
});

export const quoteLifecycleSchema = z.object({
  quoteStatus: quoteLifecycleStatusSchema,
  clientResponseStatus: quoteClientResponseStatusSchema,
  version: z.number().int().min(1)
});

export const workPackageSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  jobId: idSchema,
  label: z.string().min(1),
  scope: z.string().min(1),
  status: workPackageStatusSchema,
  quoteVersionIds: z.array(idSchema),
  activeQuoteVersionId: idSchema.optional(),
  authorizationIds: z.array(idSchema),
  visitIds: z.array(idSchema),
  invoiceIds: z.array(idSchema),
  reportIds: z.array(idSchema),
  paymentScheduleVersionIds: z.array(idSchema),
  activePaymentScheduleVersionId: idSchema.optional(),
  billingStateDerived: z.string().optional(),
  reportRequirement: z.enum(["optional", "required"]),
  createdAt: z.string().min(1),
  closedAt: z.string().optional()
});

export const jobLifecycleDimensionsSchema = z.object({
  jobStatus: jobLifecycleStatusSchema,
  workPackageIds: z.array(idSchema)
});

export const visitScheduleRevisionSchema = z.object({
  originalStart: z.string().min(1),
  currentStart: z.string().min(1),
  revisionCount: z.number().int().min(0),
  lastRescheduleReason: z.string().optional()
});

export const visitLifecycleDimensionsSchema = z.object({
  scheduleStatus: visitScheduleStatusSchema,
  scheduleRevision: visitScheduleRevisionSchema.optional(),
  travelStatus: visitTravelStatusSchema,
  visitStatus: visitLifecycleStatusSchema,
  outcomeReason: z.string().optional()
});

export const fieldDocumentationRecordSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  jobId: idSchema,
  workPackageId: idSchema.optional(),
  visitId: idSchema.optional(),
  fieldDocumentationStatus: fieldDocumentationStatusSchema,
  requiredItems: z.array(z.string()),
  completedItems: z.array(z.string()),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const customerReportRecordSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  jobId: idSchema,
  workPackageId: idSchema.optional(),
  reportStatus: customerReportStatusSchema,
  version: z.number().int().min(1),
  manifestRefIds: z.array(idSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  sentAt: z.string().optional()
});

export const invoiceLifecycleDimensionsSchema = z.object({
  invoiceLifecycle: invoiceLifecycleStatusSchema,
  deliveryStatus: invoiceDeliveryStatusSchema,
  balanceStatus: invoiceBalanceStatusSchema,
  dueStatus: invoiceDueStatusSchema,
  customerViewStatus: invoiceCustomerViewStatusSchema
});

export const quoteAcceptanceSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  quoteId: idSchema,
  quoteVersion: z.number().int().min(1),
  customerId: idSchema,
  signerName: z.string().min(1),
  signature: z.object({
    mode: z.enum(["drawn", "typed"]),
    typedName: z.string().optional(),
    drawnDataUrl: z.string().optional()
  }),
  acceptedAt: z.string().min(1),
  acceptanceMethod: z.enum(["portal", "internal_manual"]),
  termsVersion: z.string().min(1)
});

export const paymentScheduleInstallmentSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  amount: z.number().min(0).optional(),
  percentage: z.number().min(0).max(100).optional(),
  triggerOrDueDate: z.string().min(1),
  status: paymentScheduleInstallmentStatusSchema,
  amountPaid: z.number().min(0)
});

export const lifecyclePaymentScheduleSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  sourceQuoteVersionId: idSchema,
  version: z.number().int().min(1),
  status: paymentScheduleStatusSchema,
  installments: z.array(paymentScheduleInstallmentSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const allocationSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  paymentId: idSchema,
  allocatedEntityType: z.enum(["invoice", "deposit", "credit"]),
  allocatedEntityId: idSchema,
  allocatedAmount: z.number().min(0),
  allocationType: allocationTypeSchema,
  createdAt: z.string().min(1)
});

export const customerDocumentPackageSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  jobId: idSchema,
  workPackageIds: z.array(idSchema),
  recipient: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional()
  }),
  approvedReportVersionIds: z.array(idSchema),
  invoiceVersionIds: z.array(idSchema),
  receiptIds: z.array(idSchema),
  selectedArtifactRefs: z.array(z.object({
    artifactId: idSchema,
    source: z.enum(["nexdocs", "nexcam", "generated"]),
    kind: z.string().min(1).max(100),
    visitId: idSchema.optional()
  })).default([]),
  packageVersion: z.number().int().min(1),
  manifestStatus: customerDocumentPackageManifestStatusSchema,
  deliveryAttemptIds: z.array(idSchema),
  createdBy: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1).optional(),
  deliveryStatus: invoiceDeliveryStatusSchema.optional()
});

export const customerDocumentPackageDeliveryAttemptSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  jobId: idSchema,
  packageId: idSchema,
  channel: z.enum(["email", "sms"]),
  recipient: z.string().min(1),
  copyTarget: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  bodyText: z.string().min(1),
  selectedArtifactRefs: z.array(z.object({
    artifactId: idSchema,
    source: z.enum(["nexdocs", "nexcam", "generated"]),
    kind: z.string().min(1).max(100),
    visitId: idSchema.optional()
  })),
  status: z.enum(["sent", "failed"]),
  providerReceiptId: idSchema.optional(),
  createdBy: idSchema,
  createdAt: z.string().min(1)
});

export const contactInteractionSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  requestId: idSchema,
  channel: z.enum(["call", "email", "sms"]),
  attemptedAt: z.string().min(1),
  outcome: z.string().min(1),
  note: z.string().optional(),
  performedBy: idSchema
});

export const followUpTaskSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  requestId: idSchema,
  owner: idSchema,
  dueAt: z.string().min(1),
  reason: z.string().min(1),
  reminderBehavior: z.enum(["silent", "notify_owner", "notify_team"]),
  status: followUpTaskStatusSchema,
  completedAt: z.string().optional(),
  completedBy: idSchema.optional(),
  completionOutcome: z.string().optional(),
  nextFollowUpTaskId: idSchema.optional()
});

export const outcomePolicySchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  outcomeCode: z.string().min(1),
  feeEligible: z.union([z.boolean(), z.literal("configured")]),
  feeRuleId: idSchema.optional(),
  evidenceRequired: z.boolean(),
  staffReviewRequired: z.boolean(),
  waiverAllowed: z.boolean()
});

export const clientScheduleRequestSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  requestType: clientScheduleRequestTypeSchema,
  requestStatus: clientScheduleRequestStatusSchema,
  visitId: idSchema.optional(),
  jobId: idSchema.optional(),
  requestedWindow: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
    label: z.string().optional()
  }).optional(),
  reason: z.string().optional(),
  submittedAt: z.string().min(1),
  resolvedBy: idSchema.optional(),
  resolvedAt: z.string().optional(),
  resolutionNote: z.string().optional()
});

export const commandConditionSchema = z.object({
  code: z.string().min(1),
  when: z.string().min(1)
});

export const blockingConditionSchema = z.object({
  code: blockingCodeSchema,
  when: z.string().min(1),
  blockerCopy: z.string().min(1)
});

export const commandSideEffectSchema = z.object({
  kind: z.enum(["entity_create", "entity_update", "notification", "communication", "audit", "payment_attempt"]),
  detail: z.string().min(1)
});

export const communicationTriggerRefSchema = z.object({
  templateId: z.string().min(1),
  mode: communicationModeSchema
});

export const idempotencyScopeSchema = z.object({
  keys: z.array(z.string().min(1)).min(1),
  description: z.string().min(1)
});

export const lifecycleCommandContractSchema = z.object({
  commandId: z.string().min(1),
  type: commandKindSchema,
  actorSurface: actorSurfaceSchema,
  requiredPermission: z.string().optional(),
  authorizationProfileId: z.string().optional(),
  currentConditions: z.array(commandConditionSchema),
  dominantLabel: z.string().min(1),
  secondaryActions: z.array(z.string()),
  requiredFields: z.array(z.string()),
  blockingConditions: z.array(blockingConditionSchema),
  transitionResult: z.string().min(1),
  createdEntities: z.array(z.string()),
  sideEffects: z.array(commandSideEffectSchema),
  communicationTriggers: z.array(communicationTriggerRefSchema),
  auditEvent: z.string().min(1),
  confirmationTier: confirmationTierSchema,
  offlineBehavior: z.object({
    supported: z.boolean(),
    behavior: z.string().min(1)
  }),
  idempotencyScope: idempotencyScopeSchema,
  policyDependencies: z.array(decisionIdSchema)
});

export const communicationTemplateSchema = z.object({
  templateId: z.string().min(1),
  trigger: z.string().min(1),
  channels: z.array(z.enum(["email", "sms", "internal"])).min(1),
  mode: communicationModeSchema,
  recipientResolution: z.string().min(1),
  previewRequired: z.boolean(),
  suppressionRule: z.string().min(1),
  idempotencyScope: z.string().min(1),
  failureBehavior: z.string().min(1),
  auditEvent: z.string().min(1),
  attachmentPolicy: z.string().min(1)
});

export const decisionRecordSchema = z.object({
  decisionId: decisionIdSchema,
  question: z.string().min(1),
  confirmedDecision: z.string().min(1)
});

export const dominantActionStateSchema = z.object({
  label: z.string().min(1),
  tone: dominantActionToneSchema,
  reason: z.string().optional(),
  blockedBy: z.string().optional(),
  nextCommandId: z.string().optional()
});

export const lifecycleDashboardCardSchema = z.object({
  id: z.string().min(1),
  zone: z.enum(["now", "needs_attention", "upcoming", "business_overview"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  dominantAction: dominantActionStateSchema
});

export const canonicalLifecycleAddressSchema = addressSchema;
