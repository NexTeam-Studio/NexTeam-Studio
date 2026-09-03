import type { Address as CrmAddress } from "@nexteam/shared";
export type {
  CaptureBatchListResponse,
  CaptureBatchMutationResponse,
  CaptureBatchRecord,
  CaptureClientTargetJob,
  CaptureClientTargetsResponse,
  CaptureClientTargetVisit,
  CaptureRequestIntent,
  CaptureSessionMode,
  CaptureSessionOrigin,
  CaptureWorkspaceView
} from "../../nexcam/areas/capture/contracts/captureContracts";

export interface Source {
  rail: string;
  ref: string;
  label: string;
}







export interface FieldDocsMediaCommentRecord {
  id: string;
  text: string;
  createdAt: string;
  author?: string;
}

export interface FieldDocsMediaAnnotationRecord {
  id: string;
  kind: "path";
  color?: string;
  createdAt: string;
  points: Array<{ x: number; y: number }>;
}

export interface FieldDocsMediaRecord {
  id: string;
  type: "photo" | "video" | "pdf";
  clientId?: string;
  jobId?: string;
  visitId?: string;
  propertyId?: string;
  captureBatchId?: string;
  storageRef?: string;
  thumbRef?: string;
  aiTags?: string[];
  manualTags?: string[];
  aiCaption?: string;
  exif?: { gps?: { lat: number; lng: number }; ts?: string };
  comments?: FieldDocsMediaCommentRecord[];
  annotations?: FieldDocsMediaAnnotationRecord[];
  capturedBy?: string;
  hiddenFromClient?: boolean;
  trashedAt?: string;
  purgeAfter?: string;
}

export interface UploadMediaResponse {
  ok: boolean;
  media?: FieldDocsMediaRecord;
  error?: string;
}





















export type ContactChannel = "email" | "sms" | "both" | "none";
export type SmsCapability = "mobile" | "landline" | "fax" | "invalid" | "unknown";

export interface CrmPhone {
  label: "Main" | "Work" | "Mobile" | "Home" | "Fax" | "Other";
  value: string;
  primary?: boolean;
  receivesMessages?: boolean;
  smsCapability?: SmsCapability;
  smsMode?: "one_way" | "two_way";
}

export interface CrmEmail {
  label: "Main" | "Work" | "Personal" | "Other";
  value: string;
  primary?: boolean;
}

export interface ClientPhoneDraft {
  id: string;
  label: CrmPhone["label"];
  value: string;
  receivesMessages: boolean;
  smsCapability: SmsCapability;
}

export interface ClientEmailDraft {
  id: string;
  label: CrmEmail["label"];
  value: string;
}

export type ClientFormMode = "create" | "edit";

export interface CrmContact {
  personName?: { title?: string; firstName?: string; lastName?: string };
  company?: string;
  role?: string;
  billingContact?: boolean;
  correspondenceContact?: boolean;
  phones?: CrmPhone[];
  emails?: CrmEmail[];
  channelPreference?: ContactChannel;
}

export interface CrmIntakeFieldValue {
  key: string;
  label: string;
  value: string | number | boolean;
  prominent?: boolean;
  visibility: {
    request: boolean;
    quote: boolean;
    job: boolean;
    visit: boolean;
    invoice: boolean;
  };
}

export interface CrmIntakeSnapshot {
  narrative: string;
  fieldValues: CrmIntakeFieldValue[];
  fieldIndex: Record<string, string | number | boolean>;
}

export interface CrmClient {
  id: string;
  tenantId: string;
  name: string;
  company?: string;
  personName?: { title?: string; firstName?: string; lastName?: string };
  displayNamePreference?: "person" | "company";
  billingAddress?: CrmAddress;
  billingSameAsPrimaryProperty?: boolean;
  contacts?: CrmContact[];
  communicationSettings?: {
    quotesAndInvoices: ContactChannel;
    jobReminders: ContactChannel;
    jobClosureFollowUps: ContactChannel;
    reviewRequests: ContactChannel;
    smsDefaultMode: "one_way" | "two_way";
  };
  emails: string[];
  phones: string[];
  tags?: string[];
  consent: { email: boolean; sms: boolean; marketing?: boolean };
  customFields?: Record<string, string | number | boolean>;
}

export interface CrmProperty {
  id: string;
  tenantId: string;
  clientId: string;
  parentSiteId?: string;
  siteName?: string;
  label?: string;
  address: CrmAddress;
  billingAddressSameAsClient?: boolean;
  access?: {
    gateCode?: string;
    accessNotes?: string;
  };
  contacts?: CrmContact[];
  assets?: Array<{ id: string; kind: string; label: string; fields: Record<string, string | number | boolean> }>;
  customFields?: Record<string, string | number | boolean>;
  externalIds?: Record<string, string>;
}

export interface CrmJob {
  id: string;
  tenantId: string;
  number?: string;
  clientId: string;
  propertyId?: string;
  requestId?: string;
  quoteId?: string;
  status: "Upcoming" | "Today" | "Late" | "Unscheduled" | "Action Required" | "Requires Invoicing" | "Archived";
  title: string;
  startAt?: string;
  endAt?: string;
  lineItems?: Array<{ id: string; code: string; name: string; quantity: number; unitPrice: number; total: number }>;
  totals?: { subtotal: number; tax: number; total: number };
  intake?: CrmIntakeSnapshot;
  createdAt?: string;
  updatedAt?: string;
  externalIds?: Record<string, string>;
}

export interface CrmQuote {
  id: string;
  tenantId: string;
  clientId: string;
  jobId?: string;
  requestId?: string;
  number?: string;
  status: string;
  title: string;
  totals: { subtotal: number; tax: number; total: number };
  intake?: CrmIntakeSnapshot;
  convertedJobId?: string;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CrmInvoice {
  id: string;
  tenantId: string;
  clientId: string;
  jobId?: string;
  quoteId?: string;
  requestId?: string;
  number?: string;
  status: string;
  title: string;
  totals: { subtotal: number; tax: number; total: number };
  intake?: CrmIntakeSnapshot;
  dueAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CrmRequestSummary {
  id: string;
  status: "new" | "archived" | "converted_to_quote" | "converted_to_job";
  subject?: string;
  clientName?: string;
  selectedClientId?: string;
  convertedQuoteId?: string;
  convertedJobId?: string;
  createdAt?: string;
  reviewedAt?: string;
}

export interface CrmPaymentSummary {
  id: string;
  clientId?: string;
  invoiceId?: string;
  status: "pending" | "failed" | "succeeded" | "refunded" | "partially_refunded";
  provider?: string;
  method?: string;
  amount?: number;
  createdAt?: string;
}

export interface CrmReceiptReviewSummary {
  id: string;
  clientId?: string;
  invoiceId?: string;
  status: "draft" | "ready_to_send" | "sent";
  subject?: string;
  updatedAt?: string;
}

export interface ClientPortalActivityEntry {
  id: string;
  occurredAt: string;
  title: string;
  detail: string;
  objectType: "quote" | "invoice" | "visit" | "statement" | "payment" | "portal";
  objectId?: string;
}

export interface ReviewSequenceStepRecord {
  id: string;
  label: string;
  offsetDays: number;
  channels: "email" | "sms" | "both";
  templateCategory: "review_request_initial" | "review_request_nudge";
  dueAt: string;
  status: "pending" | "sent" | "stopped";
  sentAt?: string;
}

export interface ReviewSequenceRecord {
  id: string;
  tenantId: string;
  clientId: string;
  jobId: string;
  invoiceId?: string;
  source: "automatic" | "manual";
  providerState: "manual_only" | "gbp_pending";
  status: "active" | "stopped" | "completed";
  activeStepId?: string;
  nextSendAt?: string;
  stopReason?: "reviewed" | "opt_out" | "exhausted" | "manual";
  reviewedAt?: string;
  optOutAt?: string;
  stoppedAt?: string;
  steps: ReviewSequenceStepRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface CrmClientsResponse {
  ok: boolean;
  clients?: CrmClient[];
  nextCursor?: string;
  error?: string;
}

export interface CrmRecordsResponse {
  ok: boolean;
  properties?: CrmProperty[];
  jobs?: CrmJob[];
  quotes?: CrmQuote[];
  invoices?: CrmInvoice[];
  error?: string;
}

export interface CrmRequestsResponse {
  ok: boolean;
  requests?: CrmRequestSummary[];
  error?: string;
}

export interface CrmPaymentsResponse {
  ok: boolean;
  payments?: CrmPaymentSummary[];
  error?: string;
}

export interface CrmReceiptReviewsResponse {
  ok: boolean;
  receiptReviews?: CrmReceiptReviewSummary[];
  error?: string;
}

export interface ClientPortalActivityResponse {
  ok: boolean;
  activity?: ClientPortalActivityEntry[];
  error?: string;
}

export interface ReviewSequenceStatusResponse {
  ok: boolean;
  sequences?: ReviewSequenceRecord[];
  activeCount?: number;
  error?: string;
}

export interface SendPortalLinkResponse {
  ok: boolean;
  portalLink?: string;
  target?: string;
  delivery?: "email" | "sms" | "direct";
  error?: string;
}

export interface CrmClientCreateResponse {
  ok: boolean;
  client?: CrmClient;
  property?: CrmProperty;
  error?: string;
}













export interface FieldDocsSearchResponse {
  ok: boolean;
  hits?: Array<FieldDocsMediaRecord & {
    score?: number;
    matched?: string[];
  }>;
  error?: string;
}

export interface FieldDocsMediaListResponse {
  ok: boolean;
  media?: NonNullable<FieldDocsSearchResponse["hits"]>;
  error?: string;
}

export interface FieldDocsReportResponse {
  ok: boolean;
  report?: {
    id: string;
    title: string;
    pdfRef: string;
    status: string;
    jobId: string;
    propertyId?: string;
    visitId?: string;
    kind?: "field_report" | "ai_recap";
    templateId?: string;
    snippetIds?: string[];
    watermarkEnabled?: boolean;
    createdAt?: string;
    postedAt?: string;
  };
  pdfUrl?: string;
  error?: string;
}

export interface FieldDocsReportsListResponse {
  ok: boolean;
  reports?: NonNullable<FieldDocsReportResponse["report"]>[];
  error?: string;
}















export interface SignedDocumentRecord {
  id: string;
  tenantId: string;
  clientId: string;
  jobId?: string;
  propertyId?: string;
  visitId?: string;
  kind: "completion_signoff" | "waiver" | "change_order" | "custom";
  title: string;
  bodyText: string;
  status: "pending_signature" | "signed";
  signature?: {
    mode: "typed" | "drawn";
    typedName?: string;
    drawnDataUrl?: string;
    signedAt: string;
    ipAddress: string;
  };
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  signedAt?: string;
}

export interface SignedDocumentsResponse {
  ok: boolean;
  records?: SignedDocumentRecord[];
  error?: string;
}

export type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";

export interface TenantUserRecord {
  id: string;
  tenantId: string;
  email?: string;
  displayName: string;
  role: TenantRole;
  active: boolean;
}

export interface OperatorContext {
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
}





export interface TenantBranding {
  tenantId: string;
  displayName: string;
  logo?: {
    storageRef?: string;
    mediaId?: string;
    url?: string;
    mimeType?: "image/png" | "image/jpeg" | "image/webp";
    alt?: string;
    updatedAt?: string;
  };
  colors: {
    primary?: string;
    secondary?: string;
    accent?: string;
    accentText?: string;
    background?: string;
    surface?: string;
    text?: string;
    mutedText?: string;
    userBubble?: string;
    assistantBubble?: string;
  };
  fontFamily?: string;
  source: "default" | "manual" | "extracted";
  updatedBy: string;
  updatedAt: string;
}

export interface TenantBrandingResponse {
  ok: boolean;
  branding?: TenantBranding;
  error?: string;
}

export interface TenantUsersResponse {
  ok: boolean;
  tenantId?: string;
  users?: TenantUserRecord[];
  error?: string;
}

export type WorkspaceFilterTargetModule = "requests" | "quotes" | "jobs" | "invoices" | "payments" | "schedule" | "capture";
export type ScheduleScope = "all" | "today" | "upcoming";

export interface WorkspaceTarget {
  module: WorkspaceFilterTargetModule;
  objectId?: string;
  filterKey?: string;
  filterValue?: string;
}

export interface NexOpsNotificationEntry {
  id: string;
  unread: boolean;
  title: string;
  body: string;
  relativeTime: string;
  target: {
    module: "requests" | "quotes" | "jobs" | "invoices" | "payments";
    objectId: string;
  };
}

export interface NexOpsNotificationsResponse {
  ok: boolean;
  unreadCount?: number;
  notifications?: NexOpsNotificationEntry[];
  error?: string;
}
