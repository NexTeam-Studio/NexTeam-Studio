import type { Readable } from "node:stream";
import type { ZodSchema } from "zod";

export type ID = string;

export interface Address {
  street1: string;
  street2?: string | undefined;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export type IndustryPack = "pool_leak" | "hvac" | "plumbing" | "pressure_washing";
export type CrmAdapterKind = "jobber" | "native";
export type MediaAdapterKind = "companycam" | "native";
/**
 * Transactional transport selected for a tenant. Mailbox search remains a
 * separate capability and must not be inferred from this setting.
 */
export type EmailAdapterKind = "gmail_relay" | "resend" | "sendgrid";
export type SmsAdapterKind = "twilio";
export type TenantPlan = "nexi" | "marketing" | "suite";
export type TenantUserRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";
export type TenantCapability = "team.view" | "team.manage" | "team.invite" | "tenant.audit.read";
export type JobAccessScope = "job.read" | "checklist.write" | "media.upload" | "notes.write";
export type PlatformModule =
  | "nexi"
  | "crm"
  | "fielddocs"
  | "scheduling"
  | "content"
  | "campaigns"
  | "reputation"
  | "comms"
  | "voice"
  | "platform"
  | "evaporation"
  | "seo"
  | "sites";
export type TenantOnboardingStep =
  | "company-profile"
  | "module-selection"
  | "office-defaults"
  | "launch-review";
export type SecureOnboardingTaskStatus = "not_started" | "in_progress" | "complete" | "skipped";
export type SecureOnboardingAuditAction = "task.claimed" | "task.status_changed" | "task.reassigned";

export interface SecureOnboardingTask {
  id: ID;
  label: string;
  description: string;
  required: boolean;
  status: SecureOnboardingTaskStatus;
  ownerUserId?: ID | undefined;
  completedAt?: string | undefined;
}

export interface SecureOnboardingAuditEvent {
  id: ID;
  action: SecureOnboardingAuditAction;
  actorId: ID;
  taskId: ID;
  detail: string;
  createdAt: string;
}

export type ArtifactKind =
  | "client"
  | "document"
  | "job"
  | "tenant_provisioning"
  | "email"
  | "sms"
  | "payment"
  | "gbp_post"
  | "social_post"
  | "article"
  | "quote"
  | "invoice"
  | "site_publish"
  | "gbp_profile_update"
  | "seo_fix"
  | "review_reply";

export interface Tenant {
  id: ID;
  name: string;
  industryPack: IndustryPack;
  branding: {
    assistantName: string;
    logoRef?: string | undefined;
    colors?: Record<string, string> | undefined;
  };
  nexiBusinessProfile?: {
    mission: string;
    coreValues: string[];
    approvedWhatWeDoReply: string;
  } | undefined;
  adapters: {
    crm: CrmAdapterKind;
    media: MediaAdapterKind;
    email: EmailAdapterKind;
    sms?: SmsAdapterKind | undefined;
  };
  approval: Record<ArtifactKind, { autoApprove: boolean; cleanStreak: number }>;
  timezone: string;
  plan: TenantPlan;
  /** Server-authoritative access state. Tenant identity and all tenant data survive archival. */
  lifecycleState?: "ACTIVE" | "DISABLED_ARCHIVED" | undefined;
  lifecycleUpdatedAt?: string | undefined;
  payments?: {
    stripeConnect?: {
      accountId: string;
      onboardingEmail: string;
      country: string;
      createdAt: string;
      updatedAt: string;
      onboardingFlowTokenHash?: string | undefined;
      onboardingFlowExpiresAt?: string | undefined;
    } | undefined;
  } | undefined;
}

export interface TenantBranding {
  tenantId: ID;
  displayName: string;
  logo?: {
    storageRef?: string | undefined;
    mediaId?: ID | undefined;
    url?: string | undefined;
    mimeType?: "image/png" | "image/jpeg" | "image/webp" | undefined;
    alt?: string | undefined;
    updatedAt?: string | undefined;
  } | undefined;
  colors: {
    primary?: string | undefined;
    secondary?: string | undefined;
    accent?: string | undefined;
    accentText?: string | undefined;
    background?: string | undefined;
    surface?: string | undefined;
    text?: string | undefined;
    mutedText?: string | undefined;
    userBubble?: string | undefined;
    assistantBubble?: string | undefined;
  };
  fontFamily?: string | undefined;
  source: "default" | "manual" | "extracted";
  updatedBy: ID;
  updatedAt: string;
}

export interface PlatformPlan {
  id: TenantPlan;
  name: string;
  monthlyUsd: number;
  modules: PlatformModule[];
}

export interface TenantSubscription {
  id: ID;
  tenantId: ID;
  plan: TenantPlan;
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  stripeCustomerId?: string | undefined;
  stripeSubscriptionId?: string | undefined;
  currentPeriodEnd?: string | undefined;
  updatedAt: string;
}

export interface PlatformSubscriptionPackage {
  id: ID;
  version: string;
  name: string;
  priceCents: number;
  currency: "USD";
  includedModules: PlatformModule[];
  active: boolean;
}

/** A platform subscription assignment exists before tenant activation, then links to the tenant. */
export interface PlatformSubscriptionAssignment {
  id: ID;
  prospectId: ID;
  tenantId?: ID | undefined;
  packageId: ID;
  packageVersion: string;
  status: "ASSIGNED" | "ACTIVE" | "CANCELED";
  effectiveAt: string;
  assignedBy: ID;
  createdAt: string;
  updatedAt: string;
}

/** A tenant-scoped onboarding obstacle tracked by NexTeam Admin. */
export interface TenantBlocker {
  id: ID;
  tenantId: ID;
  title: string;
  detail: string;
  category: "CONFIGURATION" | "DATA_MIGRATION" | "INTEGRATION" | "TRAINING" | "BILLING" | "OTHER";
  severity: "BLOCKING" | "HIGH" | "NORMAL";
  status: "OPEN" | "ESCALATED" | "RESOLVED";
  createdAt: string;
  createdBy: ID;
  updatedAt: string;
  resolvedAt?: string | undefined;
  resolvedBy?: ID | undefined;
}

/**
 * A tenant-scoped onboarding migration record.  It contains planning and
 * lifecycle metadata only; credentials, exports, and source records stay out
 * of the platform database.
 */
export interface TenantMigrationRecord {
  id: ID;
  tenantId: ID;
  sourceSystem: string;
  scope: string;
  classification?: "INCLUDED_BASIC" | "PAID_COMPLEX" | "NEEDS_REVIEW" | undefined;
  status: "PENDING" | "IN_PROGRESS" | "VALIDATION" | "DEFERRED" | "COMPLETED";
  expectedRecords?: number | undefined;
  importedRecords?: number | undefined;
  rejectedRecords?: number | undefined;
  conflictOrDuplicateRecords?: number | undefined;
  launchImpact?: "NONE" | "WATCH" | "BLOCKING" | undefined;
  deferredReason?: string | undefined;
  deferredUntil?: string | undefined;
  createdAt: string;
  createdBy: ID;
  updatedAt: string;
  updatedBy: ID;
  completedAt?: string | undefined;
}

/** Platform-operated support case linked to a tenant blocker. */
export interface PlatformSupportEscalation {
  id: ID;
  tenantId: ID;
  blockerId: ID;
  summary: string;
  priority: "P1" | "P2" | "P3";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  createdAt: string;
  createdBy: ID;
  updatedAt: string;
  resolvedAt?: string | undefined;
  resolvedBy?: ID | undefined;
}

/**
 * Platform-owned, non-sensitive lifecycle for a company before it becomes a tenant.
 * A Prospect deliberately has no credentials, payment credentials, tax data, or
 * provider secrets. Those belong to secure onboarding after activation.
 */
export type ProspectStatus = "DRAFT" | "INTAKE_COMPLETE" | "BLUEPRINT_READY" | "SUBSCRIPTION_REQUIRED" | "CONVERTED" | "LOST" | "ABANDONED";
export type BlueprintRevisionSource = "NEXI" | "NEXTEAM_STAFF" | "TENANT_OWNER" | "TENANT_TEAM_MEMBER" | "SYSTEM";
export type BlueprintApprovalState = "DRAFT" | "APPROVED" | "DELIVERED" | "SUPERSEDED";

export interface Prospect {
  id: ID;
  status: ProspectStatus;
  businessName: string;
  website?: string | undefined;
  industry: string;
  primaryLocation?: Address | undefined;
  additionalLocations: Address[];
  serviceArea: string[];
  yearsInBusiness?: number | undefined;
  primaryContactName?: string | undefined;
  primaryContactRole?: string | undefined;
  notes?: string | undefined;
  /** Shared non-sensitive draft state used by Nexi and NexCommand before activation. */
  onboardingCurrentStep?: string | undefined;
  onboardingProgressPercent?: number | undefined;
  onboardingLastSavedAt?: string | undefined;
  onboardingLastUpdatedBy?: ID | undefined;
  createdAt: string;
  updatedAt: string;
  createdBy: ID;
}

export interface ProspectSoftwareInventoryItem {
  id: ID;
  category: string;
  provider: string;
  purpose?: string | undefined;
  replacementTiming: "REPLACE_NOW" | "REPLACE_LATER" | "COEXIST" | "UNKNOWN";
  notes?: string | undefined;
}

/** This object contains only the approved, non-sensitive pre-subscription intake fields. */
export interface ProspectIntake {
  id: ID;
  prospectId: ID;
  services: string[];
  customerTypes: string[];
  serviceAreaNotes?: string | undefined;
  teamSize?: number | undefined;
  operatingHoursNotes?: string | undefined;
  brandVoice?: string | undefined;
  currentSystems: ProspectSoftwareInventoryItem[];
  migrationRecommendation?: string | undefined;
  source: "MANUAL" | "NEXI";
  createdAt: string;
  updatedAt: string;
  createdBy: ID;
  lastSavedAt?: string | undefined;
  lastUpdatedBy?: ID | undefined;
}

export interface TenantOnboardingBlueprint {
  id: ID;
  prospectId: ID;
  recommendedLayout: string[];
  nexiResponsibilities: string[];
  opportunities: Partial<Record<"nexcam" | "nexdocs" | "nexreach" | "nexportal", string[] | undefined>>;
  recommendedForms: string[];
  recommendedWorkflows: string[];
  recommendedAutomations: string[];
  recommendedModules: PlatformModule[];
  migrationRecommendation?: string | undefined;
  futureOpportunities: string[];
  createdAt: string;
  createdBy: ID;
}

/**
 * Revisions are append-only snapshots. There is intentionally no mutable
 * "update onboarding plan" contract: every accepted change creates another record.
 */
export interface TenantOnboardingBlueprintRevision {
  id: ID;
  prospectId: ID;
  blueprintId: ID;
  previousRevisionId?: ID | undefined;
  revisionNumber: number;
  snapshot: TenantOnboardingBlueprint;
  actorId: ID;
  actorType: BlueprintRevisionSource;
  source: BlueprintRevisionSource;
  fieldsChanged: string[];
  reason?: string | undefined;
  approvalState: BlueprintApprovalState;
  createdAt: string;
}

export interface TenantUser {
  id: ID;
  tenantId: ID;
  authUid?: string | undefined;
  email?: string | undefined;
  phones?: string[] | undefined;
  address?: Address | undefined;
  displayName: string;
  role: TenantUserRole;
  /** A named custom role retains a safe base role and grants only these capabilities. */
  customRoleName?: string | undefined;
  capabilities?: TenantCapability[] | undefined;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantMembershipAudit {
  id: ID;
  tenantId: ID;
  action: "member.upserted" | "member.claims_applied" | "member.owner_assigned" | "tenant.cancellation_confirmation_one" | "tenant.subscription_canceled" | "tenant.resubscribed";
  actorId: ID;
  targetUserId: ID;
  detail: string;
  createdAt: string;
  correlationId?: string | undefined;
  subscriptionId?: ID | undefined;
}

export interface JobAccessLink {
  id: ID;
  tenantId: ID;
  jobId: ID;
  propertyId?: ID | undefined;
  externalName: string;
  externalEmail?: string | undefined;
  tokenHash: string;
  scopes: JobAccessScope[];
  expiresAt: string;
  revokedAt?: string | undefined;
  createdAt: string;
  createdBy: ID;
}

export interface TenantAdapterStatus {
  tenantId: ID;
  adapter: "crm" | "media" | "email" | "sms" | "maps" | "llm" | "voice";
  provider: string;
  configured: boolean;
  ok: boolean;
  checkedAt: string;
  detail?: string | undefined;
}

export interface TenantCostSummary {
  tenantId: ID;
  periodStart: string;
  periodEnd: string;
  estimatedCostUsd: number;
  usageLogCount: number;
}

export interface PlatformBackupRecord {
  id: ID;
  tenantId: ID;
  storageRef: string;
  collectionCounts: Record<string, number>;
  createdAt: string;
}

export interface TenantDataExport {
  tenantId: ID;
  exportedAt: string;
  collections: Record<string, unknown[]>;
}

export type ContactChannel = "email" | "sms" | "both" | "none";
export type ReviewSequenceChannel = "email" | "sms" | "both";
export type PhoneLabel = "Main" | "Work" | "Mobile" | "Home" | "Fax" | "Other";
export type EmailLabel = "Main" | "Work" | "Personal" | "Other";
export type SmsCapability = "mobile" | "landline" | "fax" | "invalid" | "unknown";
export type DocumentSequenceKind = "request" | "quote" | "job" | "invoice" | "receipt";
export type InvoiceStatus = "draft" | "sent" | "awaiting_payment" | "partial_pay" | "paid" | "void" | "bad_debt";
export type QuoteStatus =
  | "draft"
  | "pending_approval"
  | "sent"
  | "change_requested"
  | "approved"
  | "approved_internal"
  | "declined"
  | "expired"
  | "archived";
export type QuoteDeliveryMode = "email" | "sms" | "mark_sent";
export type QuoteSignatureMode = "drawn" | "typed";
export type QuoteDepositKind = "amount" | "percent";
export type InvoiceDeliveryMode = "email" | "sms" | "mark_sent";
export type PaymentScheduleTrigger = "on_approval" | "on_job_close" | "on_date";
export type PaymentScheduleAmountKind = "amount" | "percent";
export type ReceiptReviewChannel = "email" | "sms";
export type SignedDocumentKind = "completion_signoff" | "waiver" | "change_order" | "custom";

export interface DocumentNumberingRule {
  prefix: string;
  separator: string;
  padWidth: number;
  nextValue: number;
}

export interface DocumentNumberingSettings {
  request: DocumentNumberingRule;
  quote: DocumentNumberingRule;
  job: DocumentNumberingRule;
  invoice: DocumentNumberingRule;
  receipt: DocumentNumberingRule;
}

export interface QuoteDiscount {
  kind: "amount" | "percent";
  value: number;
}

export interface PaymentScheduleMilestone {
  id: ID;
  label: string;
  trigger: PaymentScheduleTrigger;
  dueAt?: string | undefined;
  amountKind: PaymentScheduleAmountKind;
  amount: number;
  note?: string | undefined;
}

export interface PaymentSchedulePlan {
  enabled: boolean;
  milestones: PaymentScheduleMilestone[];
  updatedAt?: string | undefined;
}

export interface LedgerStatusEntry<TStatus extends string = string> {
  status: TStatus;
  changedAt: string;
  changedBy?: ID | undefined;
  note?: string | undefined;
}

export interface QuoteApprovalRules {
  requireSignature: boolean;
  requireDeposit: boolean;
  requireCardOnFile: boolean;
  depositKind?: QuoteDepositKind | undefined;
  depositValue?: number | undefined;
}

export interface QuoteTotals {
  subtotal: number;
  discount?: number | undefined;
  tax: number;
  total: number;
  taxRate?: number | undefined;
}

export interface PhoneContact {
  id?: ID | undefined;
  label: PhoneLabel;
  value: string;
  normalized?: string | undefined;
  primary: boolean;
  receivesMessages: boolean;
  smsCapability: SmsCapability;
  smsMode: "one_way" | "two_way";
}

export interface EmailContact {
  id?: ID | undefined;
  label: EmailLabel;
  value: string;
  primary: boolean;
}

export interface PersonName {
  title?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
}

export interface ClientContact {
  id?: ID | undefined;
  personName?: PersonName | undefined;
  company?: string | undefined;
  role?: string | undefined;
  billingContact: boolean;
  correspondenceContact: boolean;
  phones: PhoneContact[];
  emails: EmailContact[];
  channelPreference: ContactChannel;
}

export interface ClientCommunicationSettings {
  quotesAndInvoices: ContactChannel;
  jobReminders: ContactChannel;
  jobClosureFollowUps: ContactChannel;
  reviewRequests: ContactChannel;
  smsDefaultMode: "one_way" | "two_way";
}

export type JobStatus =
  | "Upcoming"
  | "Today"
  | "Late"
  | "Unscheduled"
  | "Action Required"
  | "Requires Invoicing"
  | "Archived";

export interface Client {
  id: ID;
  tenantId: ID;
  name: string;
  company?: string | undefined;
  personName?: PersonName | undefined;
  displayNamePreference?: "person" | "company" | undefined;
  primaryContactId?: ID | undefined;
  billingContactId?: ID | undefined;
  correspondenceContactId?: ID | undefined;
  billingAddress?: Address | undefined;
  billingSameAsPrimaryProperty?: boolean | undefined;
  contacts?: ClientContact[] | undefined;
  communicationSettings?: ClientCommunicationSettings | undefined;
  emails: string[];
  phones: string[];
  tags: string[];
  consent: { email: boolean; sms: boolean; marketing?: boolean | undefined };
  customFields?: Record<string, string | number | boolean> | undefined;
  externalIds?: { jobber?: string | undefined } | undefined;
  archivedAt?: string | undefined;
  archivedBy?: ID | undefined;
}

export interface Asset {
  id: ID;
  kind: string;
  label: string;
  fields: Record<string, string | number | boolean>;
}

export interface PropertyAssetFieldDefinition {
  key: string;
  label: string;
  type: "text" | "number" | "boolean";
  required?: boolean | undefined;
}

export interface PropertyAssetDefinition {
  kind: string;
  label: string;
  fields: PropertyAssetFieldDefinition[];
}

export type FieldDocsChecklistFieldType =
  | "multi_select"
  | "count"
  | "measurement"
  | "pass_fail"
  | "free_text"
  | "photo_attachment";
export type FieldDocsChecklistFieldMemory = "property" | "visit";
export type FieldDocsChecklistPassFailStatus = "pending" | "pass" | "fail" | "not_applicable";

export interface FieldDocsPersistentChecklistValue {
  templateId: ID;
  fieldId: ID;
  label: string;
  type: FieldDocsChecklistFieldType;
  status?: FieldDocsChecklistPassFailStatus | undefined;
  note?: string | undefined;
  numberValue?: number | undefined;
  multiValue?: string[] | undefined;
  mediaIds?: string[] | undefined;
  unit?: string | undefined;
  updatedAt: string;
  sourceChecklistId: ID;
  sourceVisitId?: ID | undefined;
}

export interface Property {
  id: ID;
  tenantId: ID;
  clientId: ID;
  parentSiteId?: ID | undefined;
  siteName?: string | undefined;
  label?: string | undefined;
  address: Address;
  billingAddressSameAsClient?: boolean | undefined;
  access?: {
    gateCode?: string | undefined;
    accessNotes?: string | undefined;
  } | undefined;
  contacts?: ClientContact[] | undefined;
  geo?: { lat: number; lng: number } | undefined;
  assets: Asset[];
  customFields?: Record<string, string | number | boolean> | undefined;
  fieldDocs?: {
    persistentChecklistValues?: Record<string, FieldDocsPersistentChecklistValue> | undefined;
  } | undefined;
  externalIds?: { jobber?: string | undefined } | undefined;
}

export type IntakeSurface = "request" | "quote" | "job" | "visit" | "invoice";
export type IntakeFieldType = "text" | "textarea" | "email" | "phone" | "select" | "boolean" | "number" | "multi_image";
export type IntakeFieldGroup = "contact" | "property" | "pool" | "safety" | "service" | "notes";
export type RequestStatus = "new" | "archived" | "converted_to_quote" | "converted_to_job";
export type RequestSource = "website_form" | "office_existing_client" | "office_new_client" | "legacy_lead_backfill";
export type RequestMatchType = "none" | "exact_email" | "exact_phone" | "selected_existing_client" | "selected_existing_property";

export interface IntakeFieldVisibility {
  request: boolean;
  quote: boolean;
  job: boolean;
  visit: boolean;
  invoice: boolean;
}

export interface IntakeFieldDefinition {
  key: string;
  label: string;
  type: IntakeFieldType;
  group: IntakeFieldGroup;
  required?: boolean | undefined;
  options?: string[] | undefined;
  helpText?: string | undefined;
  prominent?: boolean | undefined;
  maxItems?: number | undefined;
}

export interface IntakeFieldValue extends IntakeFieldDefinition {
  value: string | number | boolean | string[];
  visibility: IntakeFieldVisibility;
}

export interface IntakeSnapshot {
  narrative?: string | undefined;
  fieldValues: IntakeFieldValue[];
  fieldIndex: Record<string, string | number | boolean | string[]>;
}

export interface RequestForm {
  id: ID;
  tenantId: ID;
  slug: string;
  title: string;
  intro?: string | undefined;
  active: boolean;
  fieldDefinitions: IntakeFieldDefinition[];
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRequestMatch {
  matchedClientId?: ID | undefined;
  matchedPropertyId?: ID | undefined;
  matchedBy: RequestMatchType;
  matchedValue?: string | undefined;
  reviewRequired: boolean;
  reviewedAt?: string | undefined;
}

export interface ServiceRequest {
  id: ID;
  tenantId: ID;
  number?: string | undefined;
  formId?: ID | undefined;
  formSlug?: string | undefined;
  source: RequestSource;
  status: RequestStatus;
  subject: string;
  clientName: string;
  email?: string | undefined;
  phone?: string | undefined;
  propertyAddress?: Address | undefined;
  narrative: string;
  consent: { email: boolean; sms: boolean; marketing?: boolean | undefined };
  intake: IntakeSnapshot;
  match: ServiceRequestMatch;
  selectedClientId?: ID | undefined;
  selectedPropertyId?: ID | undefined;
  reviewedAt?: string | undefined;
  convertedQuoteId?: ID | undefined;
  convertedJobId?: ID | undefined;
  sourceLeadId?: ID | undefined;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | undefined;
  reopenedAt?: string | undefined;
  notifications?: {
    adminNotifiedAt?: string | undefined;
    clientConfirmationAt?: string | undefined;
  } | undefined;
}

export interface LineItem {
  id: ID;
  code: string;
  name: string;
  description?: string | undefined;
  quantity: number;
  unitPrice: number;
  total: number;
  source?: "catalog" | "custom" | undefined;
  /** Immutable tenant catalog record selected when this line was created. */
  catalogItemId?: ID | undefined;
  /** Legacy/display code snapshot. Never use this as the catalog lookup key. */
  catalogCode?: string | undefined;
  clientSelectable?: boolean | undefined;
  defaultSelected?: boolean | undefined;
}

export interface Job {
  id: ID;
  tenantId: ID;
  number?: string | undefined;
  clientId: ID;
  propertyId?: ID;
  requestId?: ID | undefined;
  quoteId?: ID | undefined;
  status: JobStatus;
  title: string;
  startAt?: string | undefined;
  endAt?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  closedAt?: string | undefined;
  closedBy?: ID | undefined;
  archivedAt?: string | undefined;
  archivedBy?: ID | undefined;
  lineItems: LineItem[];
  totals: QuoteTotals;
  paymentSchedule?: PaymentSchedulePlan | undefined;
  intake?: IntakeSnapshot | undefined;
  clientVisibility?: {
    hideFieldDocsFromPortal?: boolean | undefined;
  } | undefined;
  externalIds?: { jobber?: string | undefined } | undefined;
}

export interface Visit {
  id: ID;
  tenantId: ID;
  jobId: ID;
  requestId?: ID | undefined;
  start: string;
  end: string;
  assignedTo: ID[];
  checklistRef?: ID | undefined;
  outcome?: string | undefined;
  intake?: IntakeSnapshot | undefined;
}

export interface Media {
  id: ID;
  tenantId: ID;
  clientId?: ID | undefined;
  jobId?: ID | undefined;
  visitId?: ID | undefined;
  propertyId?: ID | undefined;
  captureBatchId?: ID | undefined;
  type: "photo" | "video" | "audio" | "pdf";
  storageRef: string;
  thumbRef?: string | undefined;
  exif?: { gps?: { lat: number; lng: number } | undefined; ts?: string | undefined } | undefined;
  aiTags: string[];
  manualTags?: string[] | undefined;
  aiCaption?: string | undefined;
  comments?: Array<{
    id: ID;
    text: string;
    createdAt: string;
    author?: string | undefined;
  }> | undefined;
  annotations?: Array<{
    id: ID;
    kind: "path";
    color?: string | undefined;
    createdAt: string;
    points: Array<{ x: number; y: number }>;
  }> | undefined;
  capturedBy?: string | undefined;
  hiddenFromClient?: boolean | undefined;
  trashedAt?: string | undefined;
  trashedBy?: string | undefined;
  purgeAfter?: string | undefined;
  externalIds?: { companycam?: string | undefined } | undefined;
  sourceUrlNeverExposed?: never;
}

export interface NexDocsFolder {
  id: ID;
  tenantId: ID;
  clientId: ID;
  label: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: ID | undefined;
}

export type NexDocsDocumentKind =
  | "uploaded_file"
  | "quote_pdf"
  | "invoice_pdf"
  | "receipt"
  | "statement"
  | "field_report"
  | "photo"
  | "signed_document";

export type NexDocsDocumentSource = "staff_upload" | "client_upload" | "generated";

export interface NexDocsDocument {
  id: ID;
  tenantId: ID;
  clientId: ID;
  folderId?: ID | undefined;
  propertyId?: ID | undefined;
  jobId?: ID | undefined;
  visitId?: ID | undefined;
  quoteId?: ID | undefined;
  invoiceId?: ID | undefined;
  receiptReviewId?: ID | undefined;
  signedDocumentId?: ID | undefined;
  kind: NexDocsDocumentKind;
  source: NexDocsDocumentSource;
  label: string;
  fileName: string;
  mimeType: string;
  storageRef: string;
  sizeBytes?: number | undefined;
  searchText?: string | undefined;
  hiddenFromClient?: boolean | undefined;
  uploadedBy?: ID | undefined;
  createdAt: string;
  updatedAt: string;
}

export type CaptureBatchStatus = "draft" | "unassigned" | "assigned";
export type CaptureBatchAssignmentMode = "existing_client" | "request" | "decide_later";

export interface CaptureBatch {
  id: ID;
  tenantId: ID;
  status: CaptureBatchStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: ID | undefined;
  mediaIds: ID[];
  latestCapturedAt?: string | undefined;
  originGps?: { lat: number; lng: number } | undefined;
  latestGps?: { lat: number; lng: number } | undefined;
  assignedClientId?: ID | undefined;
  assignedJobId?: ID | undefined;
  assignedVisitId?: ID | undefined;
  assignedRequestId?: ID | undefined;
  assignmentMode?: CaptureBatchAssignmentMode | undefined;
  assignedAt?: string | undefined;
}

export interface ServiceDef {
  id: ID;
  name: string;
  description: string;
  active: boolean;
}

export interface SiteJobBlueprint {
  id: ID;
  tenantId: ID;
  jobId?: ID | undefined;
  kind: "site_blueprint";
  fields: Record<string, string | number>;
  extractedFrom: ID;
  extractedAt: string;
}

export interface NexiBlueprint {
  id: ID;
  tenantId: ID;
  services: ServiceDef[];
  pricingNotes: string;
  serviceArea: string[];
  brandVoice: string;
  terminology: Record<string, string>;
}

export interface NewClient {
  tenantId: ID;
  name: string;
  company?: string | undefined;
  personName?: PersonName | undefined;
  displayNamePreference?: "person" | "company" | undefined;
  billingAddress?: Address | undefined;
  billingSameAsPrimaryProperty?: boolean | undefined;
  contacts?: ClientContact[] | undefined;
  communicationSettings?: ClientCommunicationSettings | undefined;
  emails: string[];
  phones: string[];
  consent: { email: boolean; sms: boolean; marketing?: boolean | undefined };
  customFields?: Record<string, string | number | boolean> | undefined;
}

export interface QuoteDraft {
  tenantId: ID;
  clientId: ID;
  jobId?: ID | undefined;
  requestId?: ID | undefined;
  templateId?: ID | undefined;
  salespersonUserId?: ID | undefined;
  title: string;
  lineItems: LineItem[];
  approvalRules: QuoteApprovalRules;
  discount?: QuoteDiscount | undefined;
  taxRate?: number | undefined;
  expiresAt?: string | undefined;
  terms?: string | undefined;
}

export interface QuotePortalAccess {
  tokenHash?: string | undefined;
  tokenIssuedAt?: string | undefined;
  viewedAt?: string | undefined;
  lastApprovalAttemptAt?: string | undefined;
}

export interface QuoteSignatureRecord {
  mode: QuoteSignatureMode;
  typedName?: string | undefined;
  drawnDataUrl?: string | undefined;
  signedAt: string;
  ipAddress: string;
}

export interface SignedDocumentRecord {
  id: ID;
  tenantId: ID;
  clientId: ID;
  jobId?: ID | undefined;
  propertyId?: ID | undefined;
  visitId?: ID | undefined;
  kind: SignedDocumentKind;
  title: string;
  bodyText: string;
  status: "pending_signature" | "signed";
  signature?: QuoteSignatureRecord | undefined;
  createdBy?: string | undefined;
  createdAt: string;
  updatedAt: string;
  signedAt?: string | undefined;
}

export interface QuoteDeliveryRecord {
  id: ID;
  mode: QuoteDeliveryMode;
  sentAt: string;
  target?: string | undefined;
  sentBy?: string | undefined;
  receiptId?: ID | undefined;
  subject?: string | undefined;
  note?: string | undefined;
}

export interface QuoteLineComment {
  lineItemId: ID;
  comment: string;
}

export interface QuoteChangeRequest {
  id: ID;
  requestedAt: string;
  requestedBy?: string | undefined;
  lineComments: QuoteLineComment[];
  note?: string | undefined;
  resolvedAt?: string | undefined;
}

export interface QuoteDepositBridge {
  required: boolean;
  kind: QuoteDepositKind;
  amount: number;
  capturedAt?: string | undefined;
  cardholderName?: string | undefined;
  cardBrand?: string | undefined;
  cardLast4?: string | undefined;
  cardOnFileAuthorized?: boolean | undefined;
  autoSavedCardOnFile?: boolean | undefined;
}

export interface QuoteVersionSnapshot {
  version: number;
  archivedAt: string;
  reason: "renewed" | "edited_before_send";
  title: string;
  lineItems: LineItem[];
  totals: QuoteTotals;
  status: QuoteStatus;
  expiresAt?: string | undefined;
  terms?: string | undefined;
  discount?: QuoteDiscount | undefined;
  approvalRules: QuoteApprovalRules;
}

export interface Quote {
  id: ID;
  tenantId: ID;
  number?: string | undefined;
  clientId: ID;
  /** The service location selected for this quote when the client has one or more properties. */
  propertyId?: ID | undefined;
  jobId?: ID | undefined;
  requestId?: ID | undefined;
  convertedJobId?: ID | undefined;
  templateId?: ID | undefined;
  salespersonUserId?: ID | undefined;
  version?: number | undefined;
  status: QuoteStatus;
  title: string;
  lineItems: LineItem[];
  totals: QuoteTotals;
  approvalRules: QuoteApprovalRules;
  discount?: QuoteDiscount | undefined;
  expiresAt?: string | undefined;
  sentAt?: string | undefined;
  approvedAt?: string | undefined;
  approvedBy?: string | undefined;
  approvedByRole?: "client" | "OWNER" | "OFFICE_ADMIN" | undefined;
  archivedAt?: string | undefined;
  approvalId?: ID | undefined;
  pdfRef?: string | undefined;
  portal?: QuotePortalAccess | undefined;
  signature?: QuoteSignatureRecord | undefined;
  delivery?: QuoteDeliveryRecord[] | undefined;
  changeRequests?: QuoteChangeRequest[] | undefined;
  deposit?: QuoteDepositBridge | undefined;
  paymentSchedule?: PaymentSchedulePlan | undefined;
  terms?: string | undefined;
  versions?: QuoteVersionSnapshot[] | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  intake?: IntakeSnapshot | undefined;
  externalIds?: { jobber?: string | undefined; stripe?: string | undefined } | undefined;
}

export interface QuoteTemplate {
  id: ID;
  tenantId: ID;
  name: string;
  description?: string | undefined;
  titlePrefix?: string | undefined;
  defaultLineItems?: LineItem[] | undefined;
  defaultApprovalRules: QuoteApprovalRules;
  defaultPaymentSchedule?: PaymentSchedulePlan | undefined;
  expiryDays?: number | undefined;
  terms?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface ProductServiceCatalogItem {
  id: ID;
  tenantId: ID;
  code: string;
  name: string;
  description?: string | undefined;
  price: number;
  category: "service" | "material" | "equipment";
  tag: string;
  taxable: boolean;
  visible: boolean;
  source: "seed" | "tenant";
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationTemplateRecord {
  id: ID;
  tenantId: ID;
  category: string;
  label: string;
  description?: string | undefined;
  emailEnabled: boolean;
  smsEnabled: boolean;
  emailSubject?: string | undefined;
  emailBody?: string | undefined;
  smsBody?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSequenceStepSetting {
  id: ID;
  label: string;
  offsetDays: number;
  channels: ReviewSequenceChannel;
  templateCategory: "review_request_initial" | "review_request_nudge";
}

export interface InvoiceDeliveryPreferences {
  emailIncludePdf: boolean;
  emailIncludeSummary: boolean;
  emailIncludePayLink: boolean;
  smsIncludeSummary: boolean;
  smsIncludePayLink: boolean;
  smsIncludeHostedLink: boolean;
}

export interface CrmSettings {
  tenantId: ID;
  operatingProfile: {
    company: {
      legalName?: string | undefined;
      publicName?: string | undefined;
      industry?: string | undefined;
      timezone: string;
    };
    locations: Array<{
      id: ID;
      label: string;
      address?: Address | undefined;
      active: boolean;
    }>;
    businessHours: Array<{
      day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
      open?: string | undefined;
      close?: string | undefined;
      closed: boolean;
    }>;
    tax: {
      enabled: boolean;
      defaultRate: number;
      registrationId?: string | undefined;
    };
    communicationIdentity: {
      replyToEmail?: string | undefined;
      replyToName?: string | undefined;
      phone?: string | undefined;
    };
    securityAudit: {
      auditEventsEnabled: boolean;
      requireApprovalForExternalSend: boolean;
    };
    onboarding: {
      completedSteps: TenantOnboardingStep[];
      selectedModules: PlatformModule[];
      launchReviewedAt?: string | undefined;
      checklist: {
        tasks: SecureOnboardingTask[];
        auditHistory: SecureOnboardingAuditEvent[];
      };
    };
  };
  documentNumbering: DocumentNumberingSettings;
  quoteDefaults: {
    expiryDays: number;
    autoSaveCardOnDeposit: boolean;
    approvalRules: QuoteApprovalRules;
    terms: string;
  };
  invoiceDefaults: {
    dueDays: number;
    terms: string;
    delivery: InvoiceDeliveryPreferences;
    tippingEnabled: boolean;
  };
  portalDefaults: {
    keepBusinessAddressPrivate: boolean;
    hubSessionReverifyDays: number;
  };
  reviewDefaults: {
    enabled: boolean;
    steps: ReviewSequenceStepSetting[];
  };
  propertyAssetDefinitions: PropertyAssetDefinition[];
  catalogItems: ProductServiceCatalogItem[];
  communicationTemplates: CommunicationTemplateRecord[];
  createdAt: string;
  updatedAt: string;
}

export type PaymentProvider = "stripe" | "paypal" | "manual" | "quote_bridge";
export type PaymentMethodKind = "card" | "ach" | "cash" | "check" | "bank_transfer" | "other" | "paypal" | "venmo";
export type PaymentStatus = "pending" | "failed" | "succeeded" | "refunded" | "partially_refunded";
export type DepositStatus = "available" | "partially_applied" | "applied" | "released" | "refunded";
export type CreditStatus = "available" | "partially_applied" | "applied";
export type RefundStatus = "pending" | "succeeded" | "failed";
export type ReceiptReviewStatus = "draft" | "ready_to_send" | "sent";
export type ReceiptReviewKind = "payment" | "refund";
export type ReceiptAttachmentKind = "invoice_pdf" | "quote_pdf" | "field_report" | "photo" | "job_file" | "signed_document";

export interface SavedBillingCard {
  id: ID;
  label: string;
  cardholderName?: string | undefined;
  brand?: string | undefined;
  last4?: string | undefined;
  reusable: boolean;
  source: "quote_approval" | "manual" | "migration";
  sourceQuoteId?: ID | undefined;
  externalIds?: {
    stripePaymentMethodId?: string | undefined;
    paypalVaultTokenId?: string | undefined;
    localReusableToken?: string | undefined;
  } | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodDetails {
  checkNumber?: string | undefined;
  bankTransferReference?: string | undefined;
  otherReference?: string | undefined;
  payerName?: string | undefined;
  failureMessage?: string | undefined;
  collectionChannel?: "hosted_link" | "saved_card" | "manual_entry" | "tap_to_pay" | "quick_request" | undefined;
  deviceLabel?: string | undefined;
  devicePlatform?: string | undefined;
  requestMemo?: string | undefined;
}

export interface ClientBillingProfile {
  id: ID;
  tenantId: ID;
  clientId: ID;
  savedCards: SavedBillingCard[];
  createdAt: string;
  updatedAt: string;
}

export interface LedgerApplication {
  invoiceId: ID;
  amount: number;
  appliedAt: string;
  releasedAt?: string | undefined;
  releasedBy?: ID | undefined;
  note?: string | undefined;
}

export interface Payment {
  id: ID;
  tenantId: ID;
  clientId: ID;
  invoiceId?: ID | undefined;
  quoteId?: ID | undefined;
  depositId?: ID | undefined;
  provider: PaymentProvider;
  method: PaymentMethodKind;
  status: PaymentStatus;
  amount: number;
  appliedAmount: number;
  excessCreditAmount?: number | undefined;
  tipAmount?: number | undefined;
  currency: "usd";
  note?: string | undefined;
  capturedAt?: string | undefined;
  failedAt?: string | undefined;
  savedCardId?: ID | undefined;
  methodDetails?: PaymentMethodDetails | undefined;
  cardSummary?: {
    cardholderName?: string | undefined;
    brand?: string | undefined;
    last4?: string | undefined;
  } | undefined;
  externalIds?: {
    stripeCheckoutSessionId?: string | undefined;
    stripePaymentIntentId?: string | undefined;
    paypalOrderId?: string | undefined;
    paypalCaptureId?: string | undefined;
  } | undefined;
  statusHistory: LedgerStatusEntry<PaymentStatus>[];
  createdAt: string;
  updatedAt: string;
}

export interface Deposit {
  id: ID;
  tenantId: ID;
  clientId: ID;
  paymentId: ID;
  quoteId?: ID | undefined;
  invoiceId?: ID | undefined;
  source: "quote_approval" | "billing_history";
  amount: number;
  availableAmount: number;
  status: DepositStatus;
  applications: LedgerApplication[];
  statusHistory: LedgerStatusEntry<DepositStatus>[];
  createdAt: string;
  updatedAt: string;
}

export interface Credit {
  id: ID;
  tenantId: ID;
  clientId: ID;
  invoiceId?: ID | undefined;
  paymentId?: ID | undefined;
  depositId?: ID | undefined;
  source: "overpayment" | "manual_adjustment" | "released_deposit";
  amount: number;
  availableAmount: number;
  status: CreditStatus;
  applications: LedgerApplication[];
  statusHistory: LedgerStatusEntry<CreditStatus>[];
  createdAt: string;
  updatedAt: string;
}

export interface Refund {
  id: ID;
  tenantId: ID;
  clientId: ID;
  paymentId: ID;
  invoiceId?: ID | undefined;
  provider: PaymentProvider;
  method: PaymentMethodKind;
  amount: number;
  reason?: string | undefined;
  status: RefundStatus;
  externalIds?: {
    stripeRefundId?: string | undefined;
    paypalRefundId?: string | undefined;
  } | undefined;
  statusHistory: LedgerStatusEntry<RefundStatus>[];
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptReviewAttachment {
  id: ID;
  kind: ReceiptAttachmentKind;
  label: string;
  refId?: ID | undefined;
  storageRef?: string | undefined;
  mime?: string | undefined;
}

export interface ReceiptReviewSendRecord {
  id: ID;
  channel: ReceiptReviewChannel;
  target: string;
  sentAt: string;
  receiptId?: ID | undefined;
}

export interface ReceiptReview {
  id: ID;
  tenantId: ID;
  number?: string | undefined;
  clientId: ID;
  kind: ReceiptReviewKind;
  paymentId?: ID | undefined;
  refundId?: ID | undefined;
  invoiceId?: ID | undefined;
  quoteId?: ID | undefined;
  jobId?: ID | undefined;
  status: ReceiptReviewStatus;
  attachments: ReceiptReviewAttachment[];
  subject: string;
  bodyText: string;
  emailRecipients: string[];
  smsRecipients: string[];
  sendChannels: ReceiptReviewChannel[];
  hostedLink: string;
  statusHistory: LedgerStatusEntry<ReceiptReviewStatus>[];
  createdAt: string;
  updatedAt: string;
  sentAt?: string | undefined;
  sendHistory?: ReceiptReviewSendRecord[] | undefined;
}

export interface InvoiceLedgerSummary {
  depositApplied: number;
  creditApplied: number;
  paymentApplied: number;
  refundedAmount: number;
  balanceDue: number;
  overdue: boolean;
  writtenOffAmount?: number | undefined;
}

export interface InvoicePortalAccess {
  tokenHash?: string | undefined;
  tokenIssuedAt?: string | undefined;
  viewedAt?: string | undefined;
  lastPaymentAttemptAt?: string | undefined;
}

export interface InvoiceDeliveryRecord {
  id: ID;
  mode: InvoiceDeliveryMode;
  sentAt: string;
  target?: string | undefined;
  sentBy?: string | undefined;
  receiptId?: string | undefined;
  subject?: string | undefined;
  note?: string | undefined;
  includePdf?: boolean | undefined;
  includeSummary?: boolean | undefined;
  includePayLink?: boolean | undefined;
  includeHostedLink?: boolean | undefined;
}

export interface InvoiceJobReference {
  jobId: ID;
  number?: string | undefined;
  title: string;
  amount: number;
}

export interface Invoice {
  id: ID;
  tenantId: ID;
  number?: string | undefined;
  clientId: ID;
  jobId?: ID | undefined;
  jobIds?: ID[] | undefined;
  jobReferences?: InvoiceJobReference[] | undefined;
  quoteId?: ID | undefined;
  requestId?: ID | undefined;
  status: InvoiceStatus;
  title: string;
  lineItems: LineItem[];
  totals: QuoteTotals;
  discount?: QuoteDiscount | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  sentAt?: string | undefined;
  dueAt?: string | undefined;
  paidAt?: string | undefined;
  voidedAt?: string | undefined;
  voidedBy?: ID | undefined;
  badDebtAt?: string | undefined;
  badDebtBy?: ID | undefined;
  terms?: string | undefined;
  paymentSchedule?: PaymentSchedulePlan | undefined;
  deliveryDefaults?: InvoiceDeliveryPreferences | undefined;
  portal?: InvoicePortalAccess | undefined;
  delivery?: InvoiceDeliveryRecord[] | undefined;
  statusHistory?: LedgerStatusEntry<InvoiceStatus>[] | undefined;
  ledger?: InvoiceLedgerSummary | undefined;
  intake?: IntakeSnapshot | undefined;
  externalIds?: { jobber?: string | undefined; stripe?: string | undefined } | undefined;
}

export interface JobDetail extends Job {
  client?: Client | undefined;
  property?: Property | undefined;
  candidates?: Job[] | undefined;
  notes?: string | undefined;
}

export interface ProjectRef {
  id: ID;
  name: string;
  externalIds?: { companycam?: string | undefined } | undefined;
  address?: Partial<Address> | undefined;
}

export interface DocRef {
  id: ID;
  tenantId: ID;
  label: string;
  storageRef: string;
  mime?: string | undefined;
  byteSize?: number | undefined;
  updatedAt?: string | undefined;
  externalIds?: { companycam?: string | undefined } | undefined;
}

export interface Binary {
  stream: Readable | ReadableStream<Uint8Array>;
  mime: string;
  filename?: string | undefined;
}

export interface MediaMeta {
  filename: string;
  mime: string;
  capturedAt?: string | undefined;
  tags?: string[] | undefined;
}

export interface OutboundEmail {
  tenantId: ID;
  mailbox?: string | undefined;
  /**
   * Optional dispatch key supplied by the calling workflow. A transport may
   * use this to make its own retry safe without turning a deliberate resend
   * into a duplicate suppression rule.
   */
  idempotencyKey?: string | undefined;
  to: string[];
  cc?: string[] | undefined;
  bcc?: string[] | undefined;
  subject: string;
  bodyText: string;
  bodyHtml?: string | undefined;
  attachments?: OutboundEmailAttachment[] | undefined;
  replyToMessageId?: ID | undefined;
}

export interface OutboundEmailAttachment {
  filename: string;
  mime: string;
  contentBase64: string;
}

export interface OutboundSms {
  tenantId: ID;
  to: string;
  body: string;
}

export interface SendReceipt {
  provider: string;
  id: ID;
  acceptedAt: string;
  mailbox?: string | undefined;
  threadId?: ID | undefined;
}

export interface EmailSearchQuery {
  mailbox?: string | undefined;
  sender?: string | undefined;
  subject?: string | undefined;
  keywords?: string | undefined;
  after?: string | undefined;
  before?: string | undefined;
  maxResults?: number | undefined;
}

export interface EmailMessageSummary {
  id: ID;
  tenantId: ID;
  mailbox: string;
  threadId: ID;
  from?: string | undefined;
  to?: string | undefined;
  subject?: string | undefined;
  receivedAt?: string | undefined;
  snippet?: string | undefined;
  labels: string[];
}

export interface EmailAttachmentSummary {
  id: ID;
  tenantId: ID;
  mailbox: string;
  messageId: ID;
  filename: string;
  mime?: string | undefined;
  byteSize?: number | undefined;
  inline: boolean;
}

export interface EmailMessageDetail extends EmailMessageSummary {
  bodyText?: string | undefined;
  bodyHtml?: string | undefined;
  attachments: EmailAttachmentSummary[];
}

export interface EmailThread {
  id: ID;
  tenantId: ID;
  mailbox: string;
  messages: EmailMessageSummary[] | EmailMessageDetail[];
}

export interface CRMProvider {
  getClients(q: string): Promise<Client[]>;
  getJobs(range: { from: string; to: string }): Promise<Job[]>;
  getJobDetail(ref: { id?: ID; nameQuery?: string }): Promise<JobDetail>;
  createClient?(d: NewClient): Promise<Client>;
  updateClient?(id: ID, patch: Partial<Client>): Promise<Client>;
  deleteClient?(id: ID): Promise<void>;
  upsertProperty?(property: Property): Promise<Property>;
  createJob?(job: Job): Promise<Job>;
  getQuotes?(): Promise<Quote[]>;
  createQuote?(quote: Quote): Promise<Quote>;
  draftQuote?(d: QuoteDraft): Promise<Quote>;
  updateQuote?(id: ID, patch: Partial<Quote>): Promise<Quote>;
  getInvoices?(): Promise<Invoice[]>;
  createInvoice?(invoice: Invoice): Promise<Invoice>;
  updateInvoice?(id: ID, patch: Partial<Invoice>): Promise<Invoice>;
  updateJobStatus?(id: ID, s: JobStatus): Promise<Job>;
}

export interface MediaProvider {
  findProjects(q: string): Promise<ProjectRef[]>;
  getMedia(projectRef: ProjectRef): Promise<Media[]>;
  getDocuments(projectRef: ProjectRef): Promise<DocRef[]>;
  fetchBinary(mediaId: ID): Promise<{ stream: Readable | ReadableStream<Uint8Array>; mime: string }>;
  upload?(jobId: ID, file: Binary, meta: MediaMeta): Promise<Media>;
}

export interface CommsProvider {
  sendEmail(m: OutboundEmail): Promise<SendReceipt>;
  sendSms?(m: OutboundSms): Promise<SendReceipt>;
  suppressionCheck(clientId: ID, channel: "email" | "sms"): Promise<boolean>;
}

export interface EmailReadProvider {
  readonly mailbox: string;
  searchEmail(query: EmailSearchQuery): Promise<EmailMessageSummary[]>;
  getEmailThread(threadId: ID): Promise<EmailThread>;
  getEmailMessage(messageId: ID): Promise<EmailMessageDetail>;
  getEmailAttachment(messageId: ID, attachmentId: ID): Promise<Binary>;
}

export interface EmailSendProvider {
  readonly mailbox: string;
  sendEmail(message: OutboundEmail): Promise<SendReceipt>;
}

export type EventType =
  | "client.created"
  | "request.created"
  | "request.converted_to_quote"
  | "request.converted_to_job"
  | "job.created"
  | "job.completed"
  | "job.state_changed"
  | "job.closed"
  | "job.requires_invoicing_cleared"
  | "visit.booked"
  | "visit.confirmed"
  | "visit.booking_confirmation_sent"
  | "closeout.package_delivery_sent"
  | "visit.completed"
  | "invoice.reminder_due"
  | "media.uploaded"
  | "checklist.completed"
  | "quote.created"
  | "quote.sent"
  | "quote.viewed"
  | "quote.deposit_paid"
  | "quote.approved"
  | "quote.signed"
  | "quote.change_requested"
  | "quote.renewed"
  | "quote.converted_to_job"
  | "invoice.created"
  | "invoice.sent"
  | "invoice.paid"
  | "payment.created"
  | "payment.failed"
  | "refund.created"
  | "invoice.voided"
  | "invoice.bad_debt"
  | "receipt.review_created"
  | "signed_document.created"
  | "signed_document.signed"
  | "portal.link_sent"
  | "portal.session_started"
  | "statement.sent"
  | "review.sequence_started"
  | "review.sequence_step_sent"
  | "review.sequence_stopped"
  | "review.marked"
  | "lead.received"
  | "review.received"
  | "content.published";

export interface BusEvent {
  id: ID;
  tenantId: ID;
  type: EventType;
  payload: unknown;
  ts: string;
  processedBy: string[];
}

export interface EventBus {
  emit(e: Omit<BusEvent, "id" | "ts" | "processedBy">): Promise<void>;
  emitOnce(idempotencyKey: ID, e: Omit<BusEvent, "id" | "ts" | "processedBy">): Promise<void>;
  subscribe(type: EventType, handlerName: string, h: (e: BusEvent) => Promise<void>): void;
  listEvents(input?: {
    tenantId?: ID | undefined;
    limit?: number | undefined;
    types?: EventType[] | undefined;
  }): Promise<BusEvent[]>;
}

export interface ApprovalItem {
  id: ID;
  tenantId: ID;
  kind: ArtifactKind;
  preview: { title: string; body: string; mediaRefs?: ID[] | undefined };
  execute: { service: string; op: string; args: unknown };
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  createdBy: "nexi" | "system" | "user";
  decidedAt?: string | undefined;
  decidedBy?: string | undefined;
  executedAt?: string | undefined;
  executedBy?: string | undefined;
}

export interface NexiTool {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  inputJsonSchema?: Record<string, unknown> | undefined;
  handler: (tenant: Tenant, args: unknown) => Promise<{ result: unknown; sources: Source[] }>;
}

export interface Source {
  rail: "jobber" | "companycam" | "native" | "gsc" | "gbp" | "email";
  ref: string;
  label: string;
}

export interface ConversationRecord {
  id: ID;
  tenantId: ID;
  tenantUserId?: ID | undefined;
  conversationId?: ID | undefined;
  userText: string;
  assistantText: string;
  sources: Source[];
  toolRuns?: Array<{ name: string; sources: Source[]; result: unknown }> | undefined;
  createdAt: string;
}

export interface FailureLogRecord {
  id: ID;
  tenantId: ID;
  module: "nexi";
  op: string;
  question: string;
  reason: string;
  sources: Source[];
  correctionText?: string | undefined;
  flaggedConversationId?: ID | undefined;
  flaggedQuestion?: string | undefined;
  flaggedAnswer?: string | undefined;
  flaggedAnswerSources?: Source[] | undefined;
  createdAt: string;
}

export interface UsageLogRecord {
  tenantId: ID;
  provider: "anthropic" | "elevenlabs" | "openai";
  model: string;
  routeActionName: string;
  taskType: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
    totalTokens: number;
    characters?: number | undefined;
    audioBytes?: number | undefined;
  };
  estimatedCostUsd: number | null;
  ok: boolean;
  errorSummary: string;
  createdAt: string;
}
