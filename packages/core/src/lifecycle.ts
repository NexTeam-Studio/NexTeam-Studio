import type { Address, ID } from "./types.js";

export const DECISION_IDS = [
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
] as const;

export type DecisionId = (typeof DECISION_IDS)[number];
export type RequestLifecycleStatus =
  | "new"
  | "contact_attempted"
  | "awaiting_customer_info"
  | "follow_up_scheduled"
  | "qualified"
  | "not_serviceable"
  | "outside_service_area"
  | "duplicate"
  | "spam"
  | "needs_manager_review"
  | "closed";
export type QuoteLifecycleStatus = "draft" | "sent" | "superseded" | "accepted" | "declined" | "expired";
export type QuoteClientResponseStatus = "none" | "changes_requested";
export type WorkPackageStatus = "draft" | "awaiting_authorization" | "authorized" | "in_progress" | "work_complete" | "closed" | "canceled";
export type JobLifecycleStatus = "open" | "on_hold" | "work_complete" | "closed" | "canceled";
export type VisitScheduleStatus = "unscheduled" | "scheduled" | "canceled";
export type VisitTravelStatus = "not_started" | "traveling" | "arrived";
export type VisitLifecycleStatus = "not_started" | "in_progress" | "paused" | "unable_to_complete" | "completed" | "canceled";
export type FieldDocumentationStatus = "not_started" | "incomplete" | "requirements_complete";
export type CustomerReportStatus = "not_started" | "draft" | "awaiting_review" | "approved" | "sent";
export type InvoiceLifecycleStatus = "draft" | "open" | "void" | "written_off";
export type InvoiceDeliveryStatus = "not_sent" | "sent" | "delivered" | "failed";
export type InvoiceBalanceStatus = "unpaid" | "partially_paid" | "paid" | "credit_balance";
export type InvoiceDueStatus = "not_due" | "due_today" | "overdue";
export type InvoiceCustomerViewStatus = "not_viewed" | "viewed";
export type LedgerTransactionType = "charge" | "refund" | "adjustment";
export type LedgerTransactionStatus = "pending" | "succeeded" | "failed" | "disputed";
export type AllocationType = "deposit" | "invoice_payment" | "account_credit";
export type PaymentScheduleStatus = "draft" | "active" | "completed" | "superseded" | "canceled";
export type PaymentScheduleInstallmentStatus = "pending" | "partially_paid" | "paid" | "past_due";
export type CustomerDocumentPackageManifestStatus = "draft" | "finalized" | "superseded";
export type FeeEligible = boolean | "configured";
export type FollowUpTaskStatus = "pending" | "completed" | "snoozed" | "canceled" | "overdue";
export type ClientScheduleRequestType = "reschedule" | "cancellation";
export type ClientScheduleRequestStatus = "pending" | "accepted" | "declined" | "counter_proposed" | "withdrawn" | "expired";
export type ActorSurface = "office_web" | "field_mobile" | "portal" | "chat" | "automation";
export type ConfirmationTier = "none" | "undo" | "standard" | "high" | "financial";
export type CommunicationMode = "manual" | "auto" | "review_gated";
export type CommandKind = "command" | "query";
export type BlockingCode =
  | "missing_required_field"
  | "permission_denied"
  | "offline_restricted"
  | "invalid_state"
  | "payment_failure"
  | "amount_exceeds_balance"
  | "amount_below_minimum"
  | "payment_method_invalid"
  | "duplicate_payment_in_progress"
  | "capacity_conflict"
  | "availability_conflict"
  | "authorization_missing"
  | "financial_policy_block"
  | "document_not_approved"
  | "communication_suppressed";
export type DominantActionTone = "dominant" | "secondary" | "quiet" | "danger" | "blocked";

export interface RequestLifecycle {
  requestStatus: RequestLifecycleStatus;
}

export interface QuoteLifecycle {
  quoteStatus: QuoteLifecycleStatus;
  clientResponseStatus: QuoteClientResponseStatus;
  version: number;
}

export interface WorkPackage {
  id: ID;
  tenantId: ID;
  jobId: ID;
  label: string;
  scope: string;
  status: WorkPackageStatus;
  quoteVersionIds: ID[];
  activeQuoteVersionId?: ID | undefined;
  authorizationIds: ID[];
  visitIds: ID[];
  invoiceIds: ID[];
  reportIds: ID[];
  paymentScheduleVersionIds: ID[];
  activePaymentScheduleVersionId?: ID | undefined;
  billingStateDerived?: string | undefined;
  reportRequirement: "optional" | "required";
  createdAt: string;
  closedAt?: string | undefined;
}

export interface JobLifecycleDimensions {
  jobStatus: JobLifecycleStatus;
  workPackageIds: ID[];
}

export interface VisitScheduleRevision {
  originalStart: string;
  currentStart: string;
  revisionCount: number;
  lastRescheduleReason?: string | undefined;
}

export interface VisitLifecycleDimensions {
  scheduleStatus: VisitScheduleStatus;
  scheduleRevision?: VisitScheduleRevision | undefined;
  travelStatus: VisitTravelStatus;
  visitStatus: VisitLifecycleStatus;
  outcomeReason?: string | undefined;
}

export interface FieldDocumentationRecord {
  id: ID;
  tenantId: ID;
  jobId: ID;
  workPackageId?: ID | undefined;
  visitId?: ID | undefined;
  fieldDocumentationStatus: FieldDocumentationStatus;
  requiredItems: string[];
  completedItems: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerReportRecord {
  id: ID;
  tenantId: ID;
  jobId: ID;
  workPackageId?: ID | undefined;
  reportStatus: CustomerReportStatus;
  version: number;
  manifestRefIds: ID[];
  createdAt: string;
  updatedAt: string;
  sentAt?: string | undefined;
}

export interface InvoiceLifecycleDimensions {
  invoiceLifecycle: InvoiceLifecycleStatus;
  deliveryStatus: InvoiceDeliveryStatus;
  balanceStatus: InvoiceBalanceStatus;
  dueStatus: InvoiceDueStatus;
  customerViewStatus: InvoiceCustomerViewStatus;
}

export interface QuoteAcceptance {
  id: ID;
  tenantId: ID;
  quoteId: ID;
  quoteVersion: number;
  customerId: ID;
  signerName: string;
  signature: {
    mode: "drawn" | "typed";
    typedName?: string | undefined;
    drawnDataUrl?: string | undefined;
  };
  acceptedAt: string;
  acceptanceMethod: "portal" | "internal_manual";
  termsVersion: string;
}

export interface PaymentScheduleInstallment {
  id: ID;
  label: string;
  amount?: number | undefined;
  percentage?: number | undefined;
  triggerOrDueDate: string;
  status: PaymentScheduleInstallmentStatus;
  amountPaid: number;
}

export interface PaymentSchedule {
  id: ID;
  tenantId: ID;
  sourceQuoteVersionId: ID;
  version: number;
  status: PaymentScheduleStatus;
  installments: PaymentScheduleInstallment[];
  createdAt: string;
  updatedAt: string;
}

export interface Allocation {
  id: ID;
  tenantId: ID;
  paymentId: ID;
  allocatedEntityType: "invoice" | "deposit" | "credit";
  allocatedEntityId: ID;
  allocatedAmount: number;
  allocationType: AllocationType;
  createdAt: string;
}

export interface CustomerDocumentPackage {
  id: ID;
  tenantId: ID;
  jobId: ID;
  workPackageIds: ID[];
  recipient: {
    name?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
  };
  approvedReportVersionIds: ID[];
  invoiceVersionIds: ID[];
  receiptIds: ID[];
  /** References only: the authoritative file/media remains in NexDocs/NexCam. */
  selectedArtifactRefs: CustomerDocumentPackageArtifactRef[];
  packageVersion: number;
  manifestStatus: CustomerDocumentPackageManifestStatus;
  deliveryAttemptIds: ID[];
  createdBy: ID;
  createdAt: string;
  updatedAt?: string | undefined;
  deliveryStatus?: InvoiceDeliveryStatus | undefined;
}

export interface CustomerDocumentPackageArtifactRef {
  artifactId: ID;
  source: "nexdocs" | "nexcam" | "generated";
  kind: string;
  visitId?: ID | undefined;
}

export interface ContactInteraction {
  id: ID;
  tenantId: ID;
  requestId: ID;
  channel: "call" | "email" | "sms";
  attemptedAt: string;
  outcome: string;
  note?: string | undefined;
  performedBy: ID;
}

export interface FollowUpTask {
  id: ID;
  tenantId: ID;
  requestId: ID;
  owner: ID;
  dueAt: string;
  reason: string;
  reminderBehavior: "silent" | "notify_owner" | "notify_team";
  status: FollowUpTaskStatus;
  completedAt?: string | undefined;
  completedBy?: ID | undefined;
  completionOutcome?: string | undefined;
  nextFollowUpTaskId?: ID | undefined;
}

export interface OutcomePolicy {
  id: ID;
  tenantId: ID;
  outcomeCode: string;
  feeEligible: FeeEligible;
  feeRuleId?: ID | undefined;
  evidenceRequired: boolean;
  staffReviewRequired: boolean;
  waiverAllowed: boolean;
}

export interface ClientScheduleRequest {
  id: ID;
  tenantId: ID;
  requestType: ClientScheduleRequestType;
  requestStatus: ClientScheduleRequestStatus;
  visitId?: ID | undefined;
  jobId?: ID | undefined;
  requestedWindow?: {
    start?: string | undefined;
    end?: string | undefined;
    label?: string | undefined;
  } | undefined;
  reason?: string | undefined;
  submittedAt: string;
  resolvedBy?: ID | undefined;
  resolvedAt?: string | undefined;
  resolutionNote?: string | undefined;
}

export interface CommandCondition {
  code: string;
  when: string;
}

export interface BlockingCondition {
  code: BlockingCode;
  when: string;
  blockerCopy: string;
}

export interface CommandSideEffect {
  kind: "entity_create" | "entity_update" | "notification" | "communication" | "audit" | "payment_attempt";
  detail: string;
}

export interface CommunicationTriggerRef {
  templateId: string;
  mode: CommunicationMode;
}

export interface IdempotencyScope {
  keys: string[];
  description: string;
}

export interface LifecycleCommandContract {
  commandId: string;
  type: CommandKind;
  actorSurface: ActorSurface;
  requiredPermission?: string | undefined;
  authorizationProfileId?: string | undefined;
  currentConditions: CommandCondition[];
  dominantLabel: string;
  secondaryActions: string[];
  requiredFields: string[];
  blockingConditions: BlockingCondition[];
  transitionResult: string;
  createdEntities: string[];
  sideEffects: CommandSideEffect[];
  communicationTriggers: CommunicationTriggerRef[];
  auditEvent: string;
  confirmationTier: ConfirmationTier;
  offlineBehavior: {
    supported: boolean;
    behavior: string;
  };
  idempotencyScope: IdempotencyScope;
  policyDependencies: DecisionId[];
}

export interface CommunicationTemplate {
  templateId: string;
  trigger: string;
  channels: Array<"email" | "sms" | "internal">;
  mode: CommunicationMode;
  recipientResolution: string;
  previewRequired: boolean;
  suppressionRule: string;
  idempotencyScope: string;
  failureBehavior: string;
  auditEvent: string;
  attachmentPolicy: string;
}

export interface DecisionRecord {
  decisionId: DecisionId;
  question: string;
  confirmedDecision: string;
}

export interface DominantActionState {
  label: string;
  tone: DominantActionTone;
  reason?: string | undefined;
  blockedBy?: string | undefined;
  nextCommandId?: string | undefined;
}

export interface LifecycleDashboardCard {
  id: string;
  zone: "now" | "needs_attention" | "upcoming" | "business_overview";
  title: string;
  summary: string;
  dominantAction: DominantActionState;
}

export interface CanonicalLifecycleAddress extends Address {}
