import React, { Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { formatAddress, type Address as CrmAddress } from "@nexteam/shared";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, type Auth, type User } from "firebase/auth";
import "./styles.css";
import "./features/quotes/components/quoteTemplates/quoteTemplates.css";
import "./features/jobs/components/jobCore/jobCore.css";
import "./features/visits/components/visitCore/visitCore.css";
import { NexiIdentityMark, PlatformMark, ProductInlineLabel, ProductLogo, SidebarBrandStack, TenantBrandMark, tenantDisplayName } from "./productBranding";
import { NexOpsSharedMobileBar, NexOpsSharedWebTopbar } from "./nexopsHeader";
import { NexDocsClientWorkspace } from "./nexopsNexDocs";
import {
  buildClientProfilePath,
  buildNewClientPath,
  buildModulePath,
  buildWorkspaceSwitchPath,
  CLIENT_PROFILE_TABS,
  createMenuPresentation,
  isDismissKey,
  NEXOPS_MOBILE_NAV_GROUPS,
  NEXOPS_MODULES,
  NEXTEAM_WORKSPACE_OPTIONS,
  nexOpsModuleFromPath,
  parseClientProfilePath,
  parseNexOpsLocation,
  type ClientProfileTab,
  type NexOpsCreateOption,
  type NexOpsModule
} from "./nexopsShell";
import {
  buildLeadSourceOptions,
  CLIENT_CUSTOM_FIELD_RESERVED_LABELS,
  CLIENT_PROFILE_MOBILE_BUCKET_LABELS,
  customFieldRecordToDraftRows,
  createCustomFieldDraftRow,
  customFieldDraftRowsToRecord,
  draftNameFieldsFromClientRecord,
  mobileBucketForClientTab,
  mobileTabsForBucket,
  PROPERTY_CUSTOM_FIELD_RESERVED_LABELS,
  primaryClientPhoneValue,
  type ClientProfileMobileBucket,
  type CustomFieldDraftRow,
  validateCustomFieldDraftRows,
  visibleCustomFields
} from "./features/clients/components/contact/domain/clientProfile";
import {
  getMobileCreateFabScrollIntent,
  mobileFabShouldHideOverlays,
  mobileFabVisibleForViewport,
  NEXOPS_MOBILE_CREATE_FAB_IDLE_MS,
  NEXOPS_MOBILE_CREATE_FAB_PULSE_KEY,
  NEXOPS_SHARED_CREATE_MENU_ID,
  NexOpsMobileCreateFab,
  shouldPulseMobileCreateFab
} from "./nexopsMobileCreateFab";
import {
  nexiActiveApprovalPrompt,
  nexiConversationOffer,
  nexiConversationOfferReplyAction,
  NEXI_FRIENDLY_FAILURE_MESSAGE,
  formatNexiOperatorDisplayName,
  nexiIsApprovalPrompt,
  nexiAddressActionValue,
  nexiMapsHref,
  nexiPhoneActionValue,
  nexiShouldHideRenderedSource,
  NexiStandaloneLayout,
  nexiStoredSessionKey,
  parseNexiStoredSession,
  sanitizeNexiRenderedText,
  stringifyNexiStoredSession,
  type NexiStandalonePendingApproval
} from "./nexiStandalone";
import { resolveRequestorOriginForNexiMessage } from "./nexiRequestContext";
import { NexOpsWorkspace } from "./features/nexopsShell/NexOpsWorkspace";

const NexOpsHomePage = React.lazy(async () => ({ default: (await import("./nexopsHome")).NexOpsHomePage }));
const NexOpsInvoicesPage = React.lazy(async () => ({ default: (await import("./features/invoices/components/invoiceStructure/NexOpsInvoicesPage")).NexOpsInvoicesPage }));
const NexOpsJobsPage = React.lazy(async () => ({ default: (await import("./features/jobs/components/jobCore/NexOpsJobsPage")).NexOpsJobsPage }));
const NexOpsPatternLibraryPage = React.lazy(async () => ({ default: (await import("./nexopsPatternLibrary")).NexOpsPatternLibraryPage }));
const NexOpsQuotesPage = React.lazy(async () => ({ default: (await import("./features/quotes/components/quoteEngine/NexOpsQuotesPage")).NexOpsQuotesPage }));
const NexOpsRequestsPage = React.lazy(async () => ({ default: (await import("./nexopsRequests")).NexOpsRequestsPage }));
const NexOpsSchedulePage = React.lazy(async () => ({ default: (await import("./features/visits/components/visitCore/NexOpsSchedulePage")).NexOpsSchedulePage }));
const NexOpsSettingsPage = React.lazy(async () => ({ default: (await import("./features/settings/components/tenantConfig/NexOpsSettingsPage")).NexOpsSettingsPage }));
const NexOpsCaptureWorkspace = React.lazy(async () => ({ default: (await import("./nexopsDeferredUi")).NexOpsCaptureWorkspace }));
const NexOpsCreateMenu = React.lazy(async () => ({ default: (await import("./nexopsDeferredUi")).NexOpsCreateMenu }));
const NexOpsCreateClientPanel = React.lazy(async () => ({ default: (await import("./nexopsDeferredUi")).NexOpsCreateClientPanel }));
const NexOpsNotificationPanel = React.lazy(async () => ({ default: (await import("./nexopsDeferredUi")).NexOpsNotificationPanel }));
const NexReachPage = React.lazy(async () => ({ default: (await import("./nexreach")).NexReachPage }));

interface Source {
  rail: string;
  ref: string;
  label: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: Source[];
  pendingApproval?: NexiStandalonePendingApproval | null;
}

interface NexiResponse {
  ok: boolean;
  answer?: string;
  sources?: Source[];
  conversationId?: string;
  pendingApproval?: NexiStandalonePendingApproval | null;
  error?: string;
}

interface NexiHistoryResponse {
  ok: boolean;
  conversationId?: string;
  pendingApproval?: NexiStandalonePendingApproval | null;
  messages?: ChatMessage[];
  error?: string;
}

interface FieldDocsMediaCommentRecord {
  id: string;
  text: string;
  createdAt: string;
  author?: string;
}

interface FieldDocsMediaAnnotationRecord {
  id: string;
  kind: "path";
  color?: string;
  createdAt: string;
  points: Array<{ x: number; y: number }>;
}

interface FieldDocsMediaRecord {
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

interface UploadMediaResponse {
  ok: boolean;
  media?: FieldDocsMediaRecord;
  error?: string;
}

interface ScheduledVisit {
  id: string;
  jobId: string;
  title: string;
  start: string;
  end: string;
  assignedTo: string[];
  status: string;
  source?: string;
  readOnly?: boolean;
  location?: {
    label: string;
    geo?: { lat: number; lng: number };
    address?: {
      street1: string;
      city: string;
      province: string;
      postalCode: string;
      country: string;
    };
  };
}

interface CalendarResponse {
  ok: boolean;
  visits?: ScheduledVisit[];
  sourceCounts?: { native: number };
  warnings?: string[];
  error?: string;
}

interface ContentDraft {
  id: string;
  kind: "gbp_post" | "social_post" | "article";
  title: string;
  body: string;
  status: "draft" | "approval_pending" | "publish_ready" | "published_deferred" | "rejected";
  createdAt: string;
  mediaRefs: string[];
}

interface ContentQueueResponse {
  ok: boolean;
  drafts?: ContentDraft[];
  error?: string;
}

interface ApprovalQueueItem {
  id: string;
  tenantId: string;
  kind: string;
  preview: {
    title: string;
    body: string;
    mediaRefs?: string[];
  };
  execute: {
    service: string;
    op: string;
    args?: unknown;
  };
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  createdBy: "nexi" | "system" | "user";
  decidedAt?: string;
}

interface ApprovalQueueResponse {
  ok: boolean;
  items?: ApprovalQueueItem[];
  error?: string;
}

interface ApprovalActionResponse {
  ok: boolean;
  item?: ApprovalQueueItem;
  result?: unknown;
  error?: string;
}

interface ReputationReview {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  reviewedAt: string;
  replyStatus: "none" | "drafted" | "approved" | "published_deferred";
}

interface ReputationProfile {
  id: string;
  locationId: string;
  status: "draft" | "approval_pending" | "publish_ready" | "published_deferred";
}

interface ReputationQueueResponse {
  ok: boolean;
  reviews?: ReputationReview[];
  profiles?: ReputationProfile[];
  pendingReplies?: ReputationReview[];
  error?: string;
  blocker?: string;
  imported?: ReputationReview[];
}

type ContactChannel = "email" | "sms" | "both" | "none";
type SmsCapability = "mobile" | "landline" | "fax" | "invalid" | "unknown";

interface CrmPhone {
  label: "Main" | "Work" | "Mobile" | "Home" | "Fax" | "Other";
  value: string;
  primary?: boolean;
  receivesMessages?: boolean;
  smsCapability?: SmsCapability;
  smsMode?: "one_way" | "two_way";
}

interface CrmEmail {
  label: "Main" | "Work" | "Personal" | "Other";
  value: string;
  primary?: boolean;
}

interface ClientPhoneDraft {
  id: string;
  label: CrmPhone["label"];
  value: string;
  receivesMessages: boolean;
  smsCapability: SmsCapability;
}

interface ClientEmailDraft {
  id: string;
  label: CrmEmail["label"];
  value: string;
}

type ClientFormMode = "create" | "edit";

interface CrmContact {
  personName?: { title?: string; firstName?: string; lastName?: string };
  company?: string;
  role?: string;
  billingContact?: boolean;
  correspondenceContact?: boolean;
  phones?: CrmPhone[];
  emails?: CrmEmail[];
  channelPreference?: ContactChannel;
}

interface CrmIntakeFieldValue {
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

interface CrmIntakeSnapshot {
  narrative: string;
  fieldValues: CrmIntakeFieldValue[];
  fieldIndex: Record<string, string | number | boolean>;
}

interface CrmClient {
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

interface CrmProperty {
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

interface CrmJob {
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

interface CrmQuote {
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

interface CrmInvoice {
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

interface CrmRequestSummary {
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

interface CrmPaymentSummary {
  id: string;
  clientId?: string;
  invoiceId?: string;
  status: "pending" | "failed" | "succeeded" | "refunded" | "partially_refunded";
  provider?: string;
  method?: string;
  amount?: number;
  createdAt?: string;
}

interface CrmReceiptReviewSummary {
  id: string;
  clientId?: string;
  invoiceId?: string;
  status: "draft" | "ready_to_send" | "sent";
  subject?: string;
  updatedAt?: string;
}

interface ClientPortalActivityEntry {
  id: string;
  occurredAt: string;
  title: string;
  detail: string;
  objectType: "quote" | "invoice" | "visit" | "statement" | "payment" | "portal";
  objectId?: string;
}

interface ReviewSequenceStepRecord {
  id: string;
  label: string;
  offsetDays: number;
  channels: "email" | "sms" | "both";
  templateCategory: "review_request_initial" | "review_request_nudge";
  dueAt: string;
  status: "pending" | "sent" | "stopped";
  sentAt?: string;
}

interface ReviewSequenceRecord {
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

interface CrmClientsResponse {
  ok: boolean;
  clients?: CrmClient[];
  error?: string;
}

interface CrmRecordsResponse {
  ok: boolean;
  properties?: CrmProperty[];
  jobs?: CrmJob[];
  quotes?: CrmQuote[];
  invoices?: CrmInvoice[];
  error?: string;
}

interface CrmRequestsResponse {
  ok: boolean;
  requests?: CrmRequestSummary[];
  error?: string;
}

interface CrmPaymentsResponse {
  ok: boolean;
  payments?: CrmPaymentSummary[];
  error?: string;
}

interface CrmReceiptReviewsResponse {
  ok: boolean;
  receiptReviews?: CrmReceiptReviewSummary[];
  error?: string;
}

interface ClientPortalActivityResponse {
  ok: boolean;
  activity?: ClientPortalActivityEntry[];
  error?: string;
}

interface ReviewSequenceStatusResponse {
  ok: boolean;
  sequences?: ReviewSequenceRecord[];
  activeCount?: number;
  error?: string;
}

interface SendPortalLinkResponse {
  ok: boolean;
  portalLink?: string;
  target?: string;
  delivery?: "email" | "sms" | "direct";
  error?: string;
}

interface CrmClientCreateResponse {
  ok: boolean;
  client?: CrmClient;
  property?: CrmProperty;
  error?: string;
}

interface FieldDocsTemplateField {
  id: string;
  label: string;
  section: string;
  type: "multi_select" | "count" | "measurement" | "pass_fail" | "free_text" | "photo_attachment";
  memory: "property" | "visit";
  required: boolean;
  photoRequiredDefault?: boolean;
  helpText?: string;
  options?: string[];
  unit?: string;
}

interface FieldDocsTemplateSection {
  id: string;
  title: string;
  allowNa: boolean;
}

interface FieldDocsTemplate {
  id: string;
  slug: string;
  title: string;
  description?: string;
  active: boolean;
  version: number;
  appliesTo: "job" | "visit" | "job_or_visit";
  system?: boolean;
  sections: FieldDocsTemplateSection[];
  itemCount: number;
  propertyPersistentCount: number;
  visitFreshCount: number;
  fieldTypes?: string[];
  fields: FieldDocsTemplateField[];
}

interface FieldDocsTemplatesResponse {
  ok: boolean;
  templates?: FieldDocsTemplate[];
  error?: string;
}

interface FieldDocsChecklistResponse {
  ok: boolean;
  checklist?: {
    id: string;
    title: string;
    templateId: string;
    propertyId?: string;
    jobId?: string;
    visitId?: string;
    status: "draft" | "completed";
    sectionStates: Array<{
      section: string;
      status: "active" | "not_applicable";
      updatedAt: string;
      updatedBy?: string;
    }>;
    fields: Array<{
      fieldId: string;
      label: string;
      section: string;
      type: "multi_select" | "count" | "measurement" | "pass_fail" | "free_text" | "photo_attachment";
      memory: "property" | "visit";
      required: boolean;
      photoRequired?: boolean;
      status: "pending" | "pass" | "fail" | "not_applicable";
      note?: string;
      numberValue?: number;
      multiValue?: string[];
      mediaIds?: string[];
      unit?: string;
      options?: string[];
    }>;
  };
  error?: string;
}

interface FieldDocsChecklistListResponse {
  ok: boolean;
  checklists?: NonNullable<FieldDocsChecklistResponse["checklist"]>[];
  error?: string;
}

interface FieldDocsSearchResponse {
  ok: boolean;
  hits?: Array<FieldDocsMediaRecord & {
    score?: number;
    matched?: string[];
  }>;
  error?: string;
}

interface FieldDocsMediaListResponse {
  ok: boolean;
  media?: NonNullable<FieldDocsSearchResponse["hits"]>;
  error?: string;
}

interface CaptureBatchRecord {
  id: string;
  tenantId: string;
  status: "draft" | "unassigned" | "assigned";
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  mediaIds: string[];
  latestCapturedAt?: string;
  originGps?: { lat: number; lng: number };
  latestGps?: { lat: number; lng: number };
  assignedClientId?: string;
  assignedJobId?: string;
  assignedVisitId?: string;
  assignedRequestId?: string;
  assignmentMode?: "existing_client" | "request" | "decide_later";
  assignedAt?: string;
  media: FieldDocsMediaRecord[];
}

interface CaptureBatchListResponse {
  ok: boolean;
  batches?: CaptureBatchRecord[];
  error?: string;
}

interface CaptureBatchMutationResponse {
  ok: boolean;
  batch?: CaptureBatchRecord;
  media?: FieldDocsMediaRecord[];
  requestId?: string;
  clientId?: string;
  error?: string;
}

interface CaptureClientTargetJob {
  id: string;
  number?: string;
  title: string;
  status: string;
  propertyId?: string;
}

interface CaptureClientTargetVisit {
  id: string;
  jobId: string;
  title: string;
  status: string;
  start: string;
  end: string;
}

interface CaptureClientTargetsResponse {
  ok: boolean;
  jobs?: CaptureClientTargetJob[];
  visits?: CaptureClientTargetVisit[];
  error?: string;
}

type CaptureWorkspaceView = "session" | "unassigned";
type CaptureSessionMode = "fresh" | "choose" | "new-client" | "existing-client" | "continued" | "unassigned";
type CaptureSessionOrigin = "new" | "reopened";

interface CaptureRequestIntent {
  batchId: string;
  mediaIds: string[];
}

interface FieldDocsReportResponse {
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

interface FieldDocsReportsListResponse {
  ok: boolean;
  reports?: NonNullable<FieldDocsReportResponse["report"]>[];
  error?: string;
}

interface FieldDocsPropertyHistoryResponse {
  ok: boolean;
  history?: NonNullable<FieldDocsChecklistListResponse["checklists"]>;
  error?: string;
}

interface FieldReportTemplate {
  id: string;
  tenantId: string;
  title: string;
  defaultReportTitle: string;
  sections: Array<{ id: string; label: string; defaultText?: string; snippetIds: string[] }>;
  watermarkByDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FieldReportTemplatesResponse {
  ok: boolean;
  templates?: FieldReportTemplate[];
  error?: string;
}

interface FieldDocsBundleRecord {
  id: string;
  tenantId: string;
  jobTypeKey: string;
  label: string;
  checklistTemplateId: string;
  reportTemplateId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FieldDocsBundlesResponse {
  ok: boolean;
  bundles?: FieldDocsBundleRecord[];
  error?: string;
}

interface FieldDocsTextSnippetRecord {
  id: string;
  tenantId: string;
  label: string;
  bodyText: string;
  createdAt: string;
  updatedAt: string;
}

interface FieldDocsTextSnippetsResponse {
  ok: boolean;
  snippets?: FieldDocsTextSnippetRecord[];
  error?: string;
}

interface SignedDocumentRecord {
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

interface SignedDocumentsResponse {
  ok: boolean;
  records?: SignedDocumentRecord[];
  error?: string;
}

type FieldDocsMediaHit = NonNullable<FieldDocsSearchResponse["hits"]>[number];
type FieldDocsMediaAnnotation = NonNullable<FieldDocsMediaHit["annotations"]>[number];

interface PlatformPlan {
  id: "nexi" | "marketing" | "suite";
  name: string;
  monthlyUsd: number;
  modules: string[];
}

interface PlatformTenantRow {
  tenant: {
    id: string;
    name: string;
    plan: "nexi" | "marketing" | "suite";
  };
  plan: PlatformPlan;
  modules: string[];
  subscription?: {
    status: string;
    stripeSubscriptionId?: string;
  } | null;
  adapterStatuses: Array<{
    adapter: string;
    provider: string;
    configured: boolean;
    ok: boolean;
    detail?: string;
  }>;
  cost: {
    estimatedCostUsd: number;
    usageLogCount: number;
  };
}

interface PlatformTenantResponse {
  ok: boolean;
  tenants?: PlatformTenantRow[];
  error?: string;
}

interface PlatformPlansResponse {
  ok: boolean;
  plans?: PlatformPlan[];
  error?: string;
}

interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

interface RuntimeConfigResponse {
  ok: boolean;
  firebase: FirebasePublicConfig;
  firebaseConfigured: boolean;
  authRequired?: boolean;
  localAuthEnabled?: boolean;
  localProfiles?: LocalAuthProfileSummary[];
}

type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";

interface LocalAuthProfileSummary {
  id: string;
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
  email: string;
  displayName: string;
  label: string;
}

interface LocalAuthSessionResponse {
  ok: boolean;
  token?: string;
  profile?: LocalAuthProfileSummary;
  error?: string;
}

interface TenantUserRecord {
  id: string;
  tenantId: string;
  email?: string;
  displayName: string;
  role: TenantRole;
  active: boolean;
}

interface OperatorContext {
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
}

interface OperatorUiTheme {
  tenantId: string;
  name: string;
  colors: {
    shellBackground?: string;
    panelBackground?: string;
    headerBackground?: string;
    accent?: string;
    accentText?: string;
    userBubble?: string;
    assistantBubble?: string;
    text?: string;
  };
  density: "comfortable" | "compact";
  updatedBy?: string;
  updatedAt: string;
}

interface OperatorUiThemeResponse {
  ok: boolean;
  theme?: OperatorUiTheme;
  error?: string;
}

interface TenantBranding {
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

interface TenantBrandingResponse {
  ok: boolean;
  branding?: TenantBranding;
  error?: string;
}

interface TenantUsersResponse {
  ok: boolean;
  tenantId?: string;
  users?: TenantUserRecord[];
  error?: string;
}

type WorkspaceFilterTargetModule = "requests" | "quotes" | "jobs" | "invoices" | "payments" | "schedule" | "capture";
type ScheduleScope = "all" | "today" | "upcoming";

interface WorkspaceTarget {
  module: WorkspaceFilterTargetModule;
  objectId?: string;
  filterKey?: string;
  filterValue?: string;
}

interface NexOpsNotificationEntry {
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

interface NexOpsNotificationsResponse {
  ok: boolean;
  unreadCount?: number;
  notifications?: NexOpsNotificationEntry[];
  error?: string;
}

interface VoiceSession {
  id: string;
  tenantId: string;
  tenantUserId?: string;
  state: "listening" | "thinking" | "speaking" | "interrupted" | "ended";
  targetFirstAudioMs: number;
  avatarProviderSlot: "provider_agnostic";
  turnCount: number;
  interruptionCount: number;
  lastFirstAudioLatencyMs?: number;
  lastEstimatedCostUsd?: number;
  lastCharacterCount?: number;
  lastAudioBytes?: number;
}

interface VoiceSessionResponse {
  ok: boolean;
  session?: VoiceSession;
  error?: string;
}

interface BrowserSpeechRecognitionResult {
  0: { transcript: string };
  isFinal?: boolean;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex?: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type VoiceWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

const buildTimeFirebaseConfig: FirebasePublicConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string || ""
};

const DEFAULT_TENANT_ID = "aquatrace";
const LOCAL_SESSION_TOKEN_KEY = "nexops.local-auth-token";

function claimString(claims: Record<string, unknown>, key: string): string | undefined {
  const value = claims[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function claimRole(claims: Record<string, unknown>): TenantRole {
  const explicit = claimString(claims, "tenantRole") ?? claimString(claims, "role");
  const roles = Array.isArray(claims.roles) ? claims.roles.map((role) => String(role).toUpperCase()) : [];
  const candidates = [explicit, ...roles].filter(Boolean).map((role) => String(role).toUpperCase());
  if (candidates.includes("OFFICE_ADMIN") || candidates.includes("OFFICE") || candidates.includes("ADMIN")) return "OFFICE_ADMIN";
  if (candidates.includes("TECHNICIAN") || candidates.includes("TECH")) return "TECHNICIAN";
  return "OWNER";
}

function fallbackOperatorContext(user: User): OperatorContext {
  return { tenantId: DEFAULT_TENANT_ID, tenantUserId: user.uid, role: "OWNER" };
}

async function loadOperatorContext(user: User): Promise<OperatorContext> {
  const token = await user.getIdTokenResult();
  const claims = token.claims as Record<string, unknown>;
  const claimedTenantId = claimString(claims, "tenantId") ?? claimString(claims, "tenant_id");
  // This Job Desk build is the Aquatrace operator surface. Platform-level Firebase
  // claims can be "nexteam-studio"; do not let that silently move Aquatrace tools
  // onto the wrong tenant until a real tenant switcher exists.
  const tenantId = claimedTenantId && claimedTenantId !== "nexteam-studio" ? claimedTenantId : DEFAULT_TENANT_ID;
  return {
    tenantId,
    tenantUserId: claimString(claims, "tenantUserId") ?? user.uid,
    role: claimRole(claims)
  };
}

function completeFirebaseConfig(config: FirebasePublicConfig): boolean {
  return Object.values(config).every((value) => value.length > 0);
}

function createFirebaseAuth(config: FirebasePublicConfig): Auth | null {
  if (!completeFirebaseConfig(config)) {
    return null;
  }
  const existingApp = getApps()[0];
  const app = existingApp ?? initializeApp(config);
  return getAuth(app);
}

function readLocalSessionToken(): string | null {
  try {
    return window.localStorage.getItem(LOCAL_SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeLocalSessionToken(token: string): void {
  try {
    window.localStorage.setItem(LOCAL_SESSION_TOKEN_KEY, token);
  } catch {
    // Ignore local-storage failures in dev mode.
  }
}

function clearLocalSessionToken(): void {
  try {
    window.localStorage.removeItem(LOCAL_SESSION_TOKEN_KEY);
  } catch {
    // Ignore local-storage failures in dev mode.
  }
}

function installLocalSessionFetchBridge(): void {
  const bridgeWindow = window as Window & {
    __nexopsLocalFetchBridgeInstalled?: boolean;
    __nexopsOriginalFetch?: typeof window.fetch;
  };
  if (bridgeWindow.__nexopsLocalFetchBridgeInstalled) {
    return;
  }
  const originalFetch = window.fetch.bind(window);
  bridgeWindow.__nexopsOriginalFetch = originalFetch;
  bridgeWindow.__nexopsLocalFetchBridgeInstalled = true;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const token = readLocalSessionToken();
    if (!token) {
      return originalFetch(input, init);
    }
    const requestUrl = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const isSameOrigin = requestUrl.startsWith("/") || requestUrl.startsWith(window.location.origin);
    if (!isSameOrigin) {
      return originalFetch(input, init);
    }
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
    if (!headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }
    return originalFetch(input, {
      ...init,
      headers
    });
  }) as typeof window.fetch;
}

function localSessionUser(token: string, profile: LocalAuthProfileSummary): User {
  return {
    uid: profile.tenantUserId,
    email: profile.email,
    async getIdToken() {
      return token;
    },
    async getIdTokenResult() {
      return {
        token,
        authTime: "",
        issuedAtTime: "",
        expirationTime: "",
        signInProvider: "custom",
        signInSecondFactor: null,
        claims: {
          tenantId: profile.tenantId,
          tenantUserId: profile.tenantUserId,
          tenantRole: profile.role,
          role: profile.role
        }
      };
    }
  } as unknown as User;
}

async function restoreLocalSession(tenantId: string): Promise<User | null> {
  const token = readLocalSessionToken();
  if (!token) {
    return null;
  }
  try {
    const response = await fetch(`/api/public/local-auth/session?tenantId=${encodeURIComponent(tenantId)}`, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      clearLocalSessionToken();
      return null;
    }
    const body = await response.json() as LocalAuthSessionResponse;
    if (!body.ok || !body.token || !body.profile) {
      clearLocalSessionToken();
      return null;
    }
    writeLocalSessionToken(body.token);
    return localSessionUser(body.token, body.profile);
  } catch {
    clearLocalSessionToken();
    return null;
  }
}

async function signInWithLocalCredentials(email: string, tenantId: string): Promise<User> {
  const response = await fetch("/api/public/local-auth/sign-in", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      email,
      tenantId
    })
  });
  const body = await response.json() as LocalAuthSessionResponse;
  if (!response.ok || !body.ok || !body.token || !body.profile) {
    throw new Error(body.error || "Local sign-in failed.");
  }
  writeLocalSessionToken(body.token);
  return localSessionUser(body.token, body.profile);
}

async function signOutOperator(auth: Auth | null): Promise<void> {
  clearLocalSessionToken();
  if (auth) {
    await signOut(auth);
    window.location.assign("/nexops/sign-in");
    return;
  }
  window.location.assign("/nexops/sign-in");
}

async function loadAuthBootstrap(): Promise<{
  auth: Auth | null;
  authRequired: boolean;
  localUser: User | null;
  localAuthEnabled: boolean;
  localTenantId: string;
  localProfiles: LocalAuthProfileSummary[];
}> {
  let runtime: RuntimeConfigResponse | null = null;
  try {
    const response = await fetch("/api/public/runtime-config");
    runtime = await response.json() as RuntimeConfigResponse;
  } catch {
    runtime = null;
  }
  const config = completeFirebaseConfig(buildTimeFirebaseConfig)
    ? buildTimeFirebaseConfig
    : runtime?.ok && runtime.firebaseConfigured
      ? runtime.firebase
      : buildTimeFirebaseConfig;
  const authRequired = runtime?.ok ? runtime.authRequired !== false : true;
  const localAuthEnabled = runtime?.ok && runtime.localAuthEnabled === true;
  const localProfiles = runtime?.ok ? runtime.localProfiles ?? [] : [];
  const localTenantId = localProfiles[0]?.tenantId ?? DEFAULT_TENANT_ID;
  if (localAuthEnabled) {
    installLocalSessionFetchBridge();
  }
  return {
    auth: createFirebaseAuth(config),
    authRequired,
    localAuthEnabled,
    localProfiles,
    localTenantId,
    localUser: localAuthEnabled ? await restoreLocalSession(localTenantId) : null
  };
}

function sourceThumb(source: Source, tenantId?: string): React.ReactElement | null {
  if (!sourceIsPhoto(source)) {
    return null;
  }
  return <img className="photo-tile-image" src={mediaUrl(source, tenantId)} alt={source.label} loading="lazy" />;
}

function mediaUrl(source: Source, tenantId?: string): string {
  const base = `/api/media/${encodeURIComponent(source.ref)}`;
  return source.rail === "native" && tenantId ? `${base}?tenantId=${encodeURIComponent(tenantId)}` : base;
}

function mediaDownloadUrl(source: Source, tenantId?: string): string {
  const url = mediaUrl(source, tenantId);
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

function sourceIsPhoto(source: Source): boolean {
  const label = source.label.toLowerCase();
  if (/\b(pdf|document|report)\b/.test(label)) {
    return false;
  }
  return source.rail === "native" && /\b(photo|media|before|after|upload)/.test(label);
}

function formatPhoneActionLabel(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) {
    return `Call (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `Call (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return `Call ${phone}`;
}

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function messageQuickActions(text: string): Array<{ kind: "call" | "maps"; href: string; label: string }> {
  if (nexiIsApprovalPrompt(text)) {
    return [];
  }
  const actions: Array<{ kind: "call" | "maps"; href: string; label: string }> = [];
  const phone = nexiPhoneActionValue(text);
  if (phone) {
    actions.push({
      kind: "call",
      href: `tel:${phone}`,
      label: formatPhoneActionLabel(phone)
    });
  }
  const address = nexiAddressActionValue(text);
  if (address) {
    actions.push({
      kind: "maps",
      href: nexiMapsHref(address),
      label: "Open in Maps"
    });
  }
  return actions;
}

function mediaDownloadName(source: Source): string {
  return `${source.rail}-${source.ref.replace(/[^a-z0-9_-]/gi, "_")}.jpg`;
}

function isOwnerCustomizedOperatorTheme(theme: OperatorUiTheme | null): theme is OperatorUiTheme {
  return Boolean(theme && theme.updatedBy && theme.updatedBy !== "system");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const encoded = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      resolve(encoded);
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function dayRange(day: string, view: "day" | "week" | "map"): { from: string; to: string } {
  const from = new Date(`${day}T00:00:00.000Z`);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + (view === "week" ? 7 : 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatVisitTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function visitStatusLabel(visit: ScheduledVisit): string {
  return visit.readOnly ? "Read-only" : visit.status;
}

function personDisplayName(person?: { firstName?: string; lastName?: string }): string {
  return [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
}

function clientDisplayName(client: CrmClient): string {
  const personName = personDisplayName(client.personName);
  if (client.company && client.displayNamePreference !== "person") {
    return client.company;
  }
  return personName || client.name;
}

function clientContactDisplayName(client: CrmClient, primaryContact?: CrmContact): string {
  const companyDisplay = Boolean(client.company && client.displayNamePreference !== "person");
  if (!companyDisplay) {
    return "";
  }
  const primaryPerson = personDisplayName(primaryContact?.personName);
  const clientPerson = personDisplayName(client.personName);
  const fallback = primaryPerson || clientPerson || primaryContact?.company || "";
  if (!fallback) {
    return "";
  }
  return fallback.trim().toLowerCase() === clientDisplayName(client).trim().toLowerCase() ? "" : fallback;
}

function clientPrimaryAddress(client: CrmClient): string {
  const billingAddress = formatAddress(client.billingAddress);
  if (billingAddress) {
    return billingAddress;
  }
  return client.billingSameAsPrimaryProperty === false ? "Separate billing address" : "No address on native record yet";
}

function clientStatusLabel(client: CrmClient): string {
  return client.tags?.some((tag) => tag.toLowerCase() === "lead") ? "Lead" : "Active";
}

function intakeSurfaceSummary(intake: CrmIntakeSnapshot | undefined, surface: "quote" | "job" | "invoice"): string {
  if (!intake) {
    return "";
  }
  const summary = intake.fieldValues
    .filter((field) => field.visibility[surface] && (field.prominent || ["pool_configuration", "pool_type", "gate_code", "water_loss_rate", "pet_name", "pet_present"].includes(field.key)))
    .slice(0, 3)
    .map((field) => `${field.label}: ${typeof field.value === "boolean" ? (field.value ? "Yes" : "No") : String(field.value).replaceAll("_", " ")}`);
  return summary.join(" · ");
}

function channelLabel(channel: ContactChannel | undefined): string {
  if (channel === "both") {
    return "Email + one-way text";
  }
  if (channel === "sms") {
    return "One-way text";
  }
  if (channel === "none") {
    return "Off";
  }
  return "Email";
}

function smsEligibilityLabel(phone: CrmPhone): string {
  if (!phone.receivesMessages) {
    return "Text off";
  }
  if (phone.smsCapability === "mobile") {
    return phone.smsMode === "two_way" ? "Text on, two-way" : "Text on, one-way";
  }
  if (phone.smsCapability === "landline" || phone.smsCapability === "fax" || phone.smsCapability === "invalid") {
    return "Needs prompt before text";
  }
  return "Text on, confirm mobile";
}

function contactSummary(client: CrmClient): string {
  const primaryContact = client.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? client.contacts?.[0];
  const name = personDisplayName(primaryContact?.personName) || primaryContact?.company || personDisplayName(client.personName);
  const email = primaryContact?.emails?.find((entry) => entry.primary)?.value ?? primaryContact?.emails?.[0]?.value ?? client.emails[0];
  const phone = primaryContact?.phones?.find((entry) => entry.primary)?.value ?? primaryContact?.phones?.[0]?.value ?? client.phones[0];
  return [name, email, phone].filter(Boolean).join(" / ") || "No contact details yet";
}

function clientHasTextReadyContact(client: CrmClient): boolean {
  const contact = client.contacts?.find((entry) => entry.correspondenceContact) ?? client.contacts?.[0];
  const phone = contact?.phones?.find((entry) => entry.receivesMessages) ?? contact?.phones?.[0];
  return Boolean(phone?.receivesMessages && phone.smsCapability === "mobile");
}

function preferredChannelForClient(client: CrmClient): ContactChannel {
  const primaryContact = client.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? client.contacts?.[0];
  return primaryContact?.channelPreference ?? (client.consent.email && client.consent.sms ? "both" : client.consent.sms ? "sms" : "email");
}

function NexOpsCrmPanel(props: { tenantId: string }): React.ReactElement {
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [status, setStatus] = useState("Loading NexOps clients...");

  async function refresh(): Promise<void> {
    setStatus("Loading NexOps clients...");
    try {
      const body = await fetch(`/api/crm/clients?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<CrmClientsResponse>);
      if (!body.ok) {
        setClients([]);
        setStatus(body.error ?? "NexOps CRM unavailable.");
        return;
      }
      const nextClients = body.clients ?? [];
      setClients(nextClients);
      setStatus(nextClients.length ? `${nextClients.length} client${nextClients.length === 1 ? "" : "s"} visible.` : "No native NexOps clients yet.");
    } catch {
      setClients([]);
      setStatus("NexOps CRM API unreachable.");
    }
  }

  useEffect(() => {
    void refresh();
    const onCrmMutation = () => void refresh();
    window.addEventListener("nexops:crm-mutated", onCrmMutation);
    return () => window.removeEventListener("nexops:crm-mutated", onCrmMutation);
  }, [props.tenantId]);

  const richRecords = clients.filter((client) => (client.contacts?.length ?? 0) > 0 || client.displayNamePreference || client.communicationSettings);
  const previewClients = clients.slice(0, 6);
  const selectedClient = previewClients[0];
  const totalContacts = clients.reduce((count, client) => count + (client.contacts?.length ?? 0), 0);
  const textReadyCount = clients.filter((client) => {
    const contact = client.contacts?.find((entry) => entry.correspondenceContact) ?? client.contacts?.[0];
    const phone = contact?.phones?.find((entry) => entry.receivesMessages) ?? contact?.phones?.[0];
    return phone?.receivesMessages && phone.smsCapability === "mobile";
  }).length;

  return (
    <aside className="nexops-card nexops-crm-workspace">
      <div className="nexops-topline">
        <div>
          <p className="eyebrow">NexOps</p>
          <h2>Clients</h2>
          <p>{status}</p>
        </div>
        <div className="nexops-actions" aria-label="Client actions">
          <button type="button">New client</button>
          <button type="button">CSV import</button>
          <button type="button" onClick={() => void refresh()}>Refresh</button>
        </div>
      </div>

      <div className="nexops-metrics" aria-label="Client snapshot">
        <article>
          <span>Clients</span>
          <strong>{clients.length}</strong>
          <small>{richRecords.length} NexOps-ready</small>
        </article>
        <article>
          <span>Contacts</span>
          <strong>{totalContacts}</strong>
          <small>Parent correspondence</small>
        </article>
        <article>
          <span>Text-ready</span>
          <strong>{textReadyCount}</strong>
          <small>One-way unless upgraded</small>
        </article>
      </div>

      <div className="nexops-board">
        <section className="nexops-list-pane" aria-label="Client list">
          <div className="nexops-search-row">
            <input aria-label="Search clients" placeholder="Search clients, sites, phone, email" />
            <button type="button">Filter</button>
          </div>
          <div className="nexops-tabs" aria-label="Client filters">
            <button type="button" className="active">All</button>
            <button type="button">Needs review</button>
            <button type="button">Text setup</button>
          </div>
          <div className="nexops-client-list">
            {previewClients.map((client) => {
              const primaryContact = client.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? client.contacts?.[0];
              const primaryPhone = primaryContact?.phones?.find((phone) => phone.primary) ?? primaryContact?.phones?.[0];
              return (
                <article className="nexops-client-row" key={client.id}>
                  <div>
                    <h3>{clientDisplayName(client)}</h3>
                    <p>{contactSummary(client)}</p>
                  </div>
                  <span>{primaryPhone ? smsEligibilityLabel(primaryPhone) : client.consent.sms ? "Confirm mobile" : "Email only"}</span>
                </article>
              );
            })}
            {!previewClients.length ? (
              <article className="nexops-empty-list">
                <h3>No native clients loaded yet</h3>
                <p>Import by CSV for any tenant, or start with a native intake request.</p>
              </article>
            ) : null}
          </div>
        </section>

        <section className="nexops-detail-pane" aria-label="Client detail preview">
          <div className="nexops-detail-header">
            <div>
              <p className="eyebrow">{selectedClient ? "Client record" : "CRM workspace"}</p>
              <h3>{selectedClient ? clientDisplayName(selectedClient) : "Client detail will open here"}</h3>
              <p>{selectedClient ? contactSummary(selectedClient) : "Built around parent client, sites, contacts, work, billing, and files."}</p>
            </div>
            <button type="button">Edit</button>
          </div>

          <div className="nexops-detail-sections">
            <article>
              <h4>Primary contact</h4>
              <p>{selectedClient ? channelLabel(preferredChannelForClient(selectedClient)) : "Email, text, or both per client. SMS prompts when number type is unknown."}</p>
            </article>
            <article>
              <h4>Properties & sites</h4>
              <p>{selectedClient ? "Site hierarchy ready for parent client -> site -> address." : "Supports named site/facility plus address. Billing can stay on parent client."}</p>
            </article>
            <article>
              <h4>Work overview</h4>
              <p>Requests, quotes, jobs, invoices, and visit history will roll up here.</p>
            </article>
            <article>
              <h4>Billing</h4>
              <p>Parent billing contact by default, separate billing address when unchecked.</p>
            </article>
            <article>
              <h4>Files & media</h4>
              <p>NexCam photos, PDFs, reports, and uploads attach to client/site/job.</p>
            </article>
            <article>
              <h4>Import status</h4>
              <p>{clients.length ? `${clients.length} native records loaded.` : "CSV import and native intake are the current receipt paths."}</p>
            </article>
          </div>
        </section>
      </div>
    </aside>
  );
}

function NexOpsNavGlyph(props: { module: NexOpsModule }): React.ReactElement {
  switch (props.module) {
    case "home":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M3.5 8.2 10 3.5l6.5 4.7v7.3a1 1 0 0 1-1 1h-3.7v-4.5H8.2v4.5H4.5a1 1 0 0 1-1-1V8.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case "clients":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M6.3 9.2a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6ZM13.8 10.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6ZM2.8 16.2c.5-2.2 2.3-3.5 4.8-3.5 2.5 0 4.3 1.3 4.8 3.5M11.3 16.2c.4-1.5 1.6-2.5 3.5-2.5 1 0 1.8.2 2.4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "requests":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M6 4.5h8.4a1.1 1.1 0 0 1 1.1 1.1v9.5a1.1 1.1 0 0 1-1.1 1.1H5.6a1.1 1.1 0 0 1-1.1-1.1V5.6A1.1 1.1 0 0 1 5.6 4.5H6Zm0 0V3.3m4 1.2V3.3m-3.8 4h7.4M6.2 10h7.6M6.2 12.8H11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "quotes":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M5.4 3.8h6.8l3 3v9.4a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12.2 3.8v3h3M6.8 10.3h6.4M6.8 13h4.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "schedule":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M4.8 5.1h10.4a1.2 1.2 0 0 1 1.2 1.2v8.5a1.2 1.2 0 0 1-1.2 1.2H4.8a1.2 1.2 0 0 1-1.2-1.2V6.3a1.2 1.2 0 0 1 1.2-1.2Zm0 0V3.4m10.4 1.7V3.4m-11.6 5h12.8M7 11.2h2.2v2.2H7z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "jobs":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="m7.3 5.2 2.8 2.8-5.4 5.4H2v-2.7l5.3-5.5Zm0 0 1.9-1.9a1.4 1.4 0 0 1 2 0l1.4 1.4a1.4 1.4 0 0 1 0 2l-1.9 1.9M11.7 12.5h4.9M10.5 15.8h6.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "invoices":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M5 3.6h10a1 1 0 0 1 1 1v11.1l-2-1-2 1-2-1-2 1-2-1-2 1V4.6a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M7 7.3h6M7 10.1h6M7 12.9h3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "payments":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <rect x="2.8" y="5.2" width="14.4" height="9.6" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
          <path d="M2.8 8.2h14.4M6.2 11.8h2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "imports":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M6.2 6.4h8.3m0 0-2-2m2 2-2 2M13.8 13.6H5.5m0 0 2 2m-2-2 2-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3.2" y="3.2" width="13.6" height="13.6" rx="2.3" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
        </svg>
      );
    case "approvals":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M10 3.5 15.5 6v4.2c0 3-2 5.8-5.5 7.2-3.5-1.4-5.5-4.2-5.5-7.2V6L10 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="m7.5 10.2 1.6 1.6 3.4-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "settings":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M10 5.9a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2Zm0 0V3.5m0 13v-2.4m4.1-6.5 1.7-1.7m-11.6 11.6 1.7-1.7m0-8.2L4.2 5.9m11.6 11.6-1.7-1.7M16.5 10h-2.4m-8.2 0H3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "capture":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M4.4 6.2h2l1-1.4h5.2l1 1.4h2a1.4 1.4 0 0 1 1.4 1.4v6.2a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 13.8V7.6a1.4 1.4 0 0 1 1.4-1.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="10" cy="10.7" r="2.7" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "patterns":
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
  }
}

function MobileClientSummaryGlyph(props: { kind: "phone" | "email" | "directions" }): React.ReactElement {
  switch (props.kind) {
    case "phone":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M5.4 3.9h2.4l1.1 2.8-1.5 1.5a11.8 11.8 0 0 0 4.4 4.4l1.5-1.5 2.8 1.1v2.4a1.6 1.6 0 0 1-1.6 1.6A10.6 10.6 0 0 1 3.8 5.5 1.6 1.6 0 0 1 5.4 3.9Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "email":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <rect x="3.2" y="4.6" width="13.6" height="10.8" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="m4.6 6.2 5.4 4.3 5.4-4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "directions":
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path d="M10 16.8s4.7-4.7 4.7-8.1A4.7 4.7 0 1 0 5.3 8.7c0 3.4 4.7 8.1 4.7 8.1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="10" cy="8.7" r="1.8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}

function MobileClientEditGlyph(): React.ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="m5.2 14.8 1-3.3 6.5-6.5a1.7 1.7 0 0 1 2.4 0l.9.9a1.7 1.7 0 0 1 0 2.4l-6.5 6.5-3.3 1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m10.8 6.8 2.4 2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function parseCsvPreview(text: string): { rows: number; columns: string[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines[0] ?? "";
  return {
    rows: Math.max(0, lines.length - 1),
    columns: header ? header.split(",").map((column) => column.trim()).filter(Boolean) : []
  };
}

function blankNewClientDraft() {
  return {
    title: "No title",
    firstName: "",
    lastName: "",
    company: "",
    role: "",
    displayNamePreference: "person" as "person" | "company",
    phone: "",
    phoneLabel: "Main" as CrmPhone["label"],
    phoneReceivesMessages: false,
    smsCapability: "unknown" as SmsCapability,
    additionalPhones: [] as ClientPhoneDraft[],
    email: "",
    emailLabel: "Main" as CrmEmail["label"],
    additionalEmails: [] as ClientEmailDraft[],
    paymentTerms: "",
    askForReview: true,
    referredBy: "",
    promoCode: "",
    clientCustomFieldName: "",
    clientCustomFieldValue: "",
    clientCustomFieldsDraft: [] as CustomFieldDraftRow[],
    additionalContactName: "",
    additionalContactRole: "",
    additionalContactPhone: "",
    additionalContactEmail: "",
    siteName: "",
    street1: "",
    street2: "",
    city: "",
    province: "",
    postalCode: "",
    country: "US",
    propertyGeoLat: undefined as number | undefined,
    propertyGeoLng: undefined as number | undefined,
    billingSameAsPrimaryProperty: true,
    billingStreet1: "",
    billingStreet2: "",
    billingCity: "",
    billingProvince: "",
    billingPostalCode: "",
    leadSource: "",
    propertyGatedEntry: false,
    propertyGateCodes: "",
    propertyClientName: "",
    propertyClientPhone: "",
    propertyClientEmail: "",
    propertyAccessNotes: "",
    propertyCustomFieldName: "",
    propertyCustomFieldValue: "",
    propertyCustomFieldsDraft: [] as CustomFieldDraftRow[]
  };
}

function draftPhoneFromRecord(phone: CrmPhone, index: number): ClientPhoneDraft {
  return {
    id: `phone_edit_${index}_${Math.random().toString(36).slice(2, 8)}`,
    label: phone.label ?? "Other",
    value: phone.value,
    receivesMessages: phone.receivesMessages === true,
    smsCapability: phone.smsCapability ?? "unknown"
  };
}

function draftEmailFromRecord(email: CrmEmail, index: number): ClientEmailDraft {
  return {
    id: `email_edit_${index}_${Math.random().toString(36).slice(2, 8)}`,
    label: email.label ?? "Other",
    value: email.value
  };
}

function normalizeDraftCountry(country?: string): string {
  if (!country) {
    return "US";
  }
  return country.toUpperCase() === "USA" ? "US" : country;
}

function draftFromExistingClient(client: CrmClient, property: CrmProperty | null): ReturnType<typeof blankNewClientDraft> {
  const draft = blankNewClientDraft();
  const primaryContact = client.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? client.contacts?.[0];
  const draftPersonName = draftNameFieldsFromClientRecord({
    clientName: client.name,
    company: client.company,
    displayNamePreference: client.displayNamePreference,
    personFirstName: client.personName?.firstName,
    personLastName: client.personName?.lastName,
    contactFirstName: primaryContact?.personName?.firstName,
    contactLastName: primaryContact?.personName?.lastName
  });
  const otherContacts = (client.contacts ?? []).filter((contact) => contact !== primaryContact);
  const primaryPhones = primaryContact?.phones?.length ? primaryContact.phones : client.phones.map((value) => ({
    label: "Main" as CrmPhone["label"],
    value,
    primary: false,
    receivesMessages: false,
    smsCapability: "unknown" as SmsCapability
  }));
  const mainPhone = primaryPhones.find((phone) => phone.primary) ?? primaryPhones[0];
  const extraPhones = primaryPhones.filter((phone) => phone !== mainPhone);
  const primaryEmails = primaryContact?.emails?.length ? primaryContact.emails : client.emails.map((value) => ({
    label: "Main" as CrmEmail["label"],
    value,
    primary: false
  }));
  const mainEmail = primaryEmails.find((email) => email.primary) ?? primaryEmails[0];
  const extraEmails = primaryEmails.filter((email) => email !== mainEmail);
  const additionalContact = otherContacts[0];
  const propertyContact = property?.contacts?.[0];
  const billingAddress = client.billingAddress;
  const propertyAddress = property?.address;

  return {
    ...draft,
    title: client.personName?.title ?? "No title",
    firstName: draftPersonName.firstName,
    lastName: draftPersonName.lastName,
    company: client.company ?? "",
    role: primaryContact?.role ?? "",
    displayNamePreference: client.displayNamePreference ?? (client.company ? "company" : "person"),
    phone: mainPhone?.value ?? "",
    phoneLabel: mainPhone?.label ?? "Main",
    phoneReceivesMessages: mainPhone?.receivesMessages === true,
    smsCapability: mainPhone?.smsCapability ?? "unknown",
    additionalPhones: extraPhones.map(draftPhoneFromRecord),
    email: mainEmail?.value ?? "",
    emailLabel: mainEmail?.label ?? "Main",
    additionalEmails: extraEmails.map(draftEmailFromRecord),
    paymentTerms: typeof client.customFields?.paymentTerms === "string" ? client.customFields.paymentTerms : "",
    askForReview: client.customFields?.askForReview === false ? false : true,
    referredBy: typeof client.customFields?.referredBy === "string" ? client.customFields.referredBy : "",
    promoCode: typeof client.customFields?.promoCode === "string" ? client.customFields.promoCode : "",
    clientCustomFieldsDraft: customFieldRecordToDraftRows(client.customFields, CLIENT_CUSTOM_FIELD_RESERVED_LABELS, "client_edit"),
    additionalContactName: personDisplayName(additionalContact?.personName) || additionalContact?.company || "",
    additionalContactRole: additionalContact?.role ?? "",
    additionalContactPhone: additionalContact?.phones?.[0]?.value ?? "",
    additionalContactEmail: additionalContact?.emails?.[0]?.value ?? "",
    siteName: property?.siteName ?? property?.label ?? "",
    street1: propertyAddress?.street1 ?? billingAddress?.street1 ?? "",
    street2: propertyAddress?.street2 ?? billingAddress?.street2 ?? "",
    city: propertyAddress?.city ?? billingAddress?.city ?? "",
    province: propertyAddress?.province ?? billingAddress?.province ?? "",
    postalCode: propertyAddress?.postalCode ?? billingAddress?.postalCode ?? "",
    country: normalizeDraftCountry(propertyAddress?.country ?? billingAddress?.country),
    billingSameAsPrimaryProperty: client.billingSameAsPrimaryProperty !== false,
    billingStreet1: client.billingSameAsPrimaryProperty === false ? (billingAddress?.street1 ?? "") : "",
    billingStreet2: client.billingSameAsPrimaryProperty === false ? (billingAddress?.street2 ?? "") : "",
    billingCity: client.billingSameAsPrimaryProperty === false ? (billingAddress?.city ?? "") : "",
    billingProvince: client.billingSameAsPrimaryProperty === false ? (billingAddress?.province ?? "") : "",
    billingPostalCode: client.billingSameAsPrimaryProperty === false ? (billingAddress?.postalCode ?? "") : "",
    leadSource: typeof client.customFields?.leadSource === "string" ? client.customFields.leadSource : "",
    propertyGatedEntry: property?.customFields?.gatedEntry === true,
    propertyGateCodes: property?.access?.gateCode ?? "",
    propertyClientName: String(property?.customFields?.propertyClientName ?? propertyContact?.company ?? personDisplayName(propertyContact?.personName) ?? ""),
    propertyClientPhone: String(property?.customFields?.propertyClientPhone ?? propertyContact?.phones?.[0]?.value ?? ""),
    propertyClientEmail: String(property?.customFields?.propertyClientEmail ?? propertyContact?.emails?.[0]?.value ?? ""),
    propertyAccessNotes: property?.access?.accessNotes ?? "",
    propertyCustomFieldsDraft: customFieldRecordToDraftRows(property?.customFields, PROPERTY_CUSTOM_FIELD_RESERVED_LABELS, "property_edit")
  };
}

const MOBILE_CLIENT_VIEWPORT_MAX = 860;


type NexCamModule = "overview" | "templates" | "photos" | "reports";

const NEXCAM_MODULES: Array<{ id: NexCamModule; label: string; path: string }> = [
  { id: "overview", label: "Overview", path: "/nexcam" },
  { id: "templates", label: "Checklist Templates", path: "/nexcam/templates" },
  { id: "photos", label: "Photos & Media", path: "/nexcam/photos" },
  { id: "reports", label: "Reports", path: "/nexcam/reports" }
];

function nexCamModuleFromPath(pathname: string): NexCamModule {
  const exact = NEXCAM_MODULES.find((module) => pathname === module.path);
  if (exact) {
    return exact.id;
  }
  const nested = [...NEXCAM_MODULES]
    .sort((left, right) => right.path.length - left.path.length)
    .find((module) => pathname.startsWith(`${module.path}/`));
  return nested?.id ?? "overview";
}

function NexCamPage(props: { auth: Auth | null; user: User }): React.ReactElement {
  const mediaStageRef = useRef<HTMLDivElement | null>(null);
  const [operatorContext, setOperatorContext] = useState<OperatorContext>(() => fallbackOperatorContext(props.user));
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
  const [activeModule, setActiveModule] = useState<NexCamModule>(() => nexCamModuleFromPath(window.location.pathname));
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [templates, setTemplates] = useState<FieldDocsTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [mediaHits, setMediaHits] = useState<NonNullable<FieldDocsSearchResponse["hits"]>>([]);
  const [recentMedia, setRecentMedia] = useState<NonNullable<FieldDocsMediaListResponse["media"]>>([]);
  const [history, setHistory] = useState<NonNullable<FieldDocsPropertyHistoryResponse["history"]>>([]);
  const [recentChecklists, setRecentChecklists] = useState<NonNullable<FieldDocsChecklistListResponse["checklists"]>>([]);
  const [checklist, setChecklist] = useState<FieldDocsChecklistResponse["checklist"] | null>(null);
  const [report, setReport] = useState<FieldDocsReportResponse["report"] | null>(null);
  const [reports, setReports] = useState<NonNullable<FieldDocsReportsListResponse["reports"]>>([]);
  const [reportTemplates, setReportTemplates] = useState<FieldReportTemplate[]>([]);
  const [bundles, setBundles] = useState<FieldDocsBundleRecord[]>([]);
  const [textSnippets, setTextSnippets] = useState<FieldDocsTextSnippetRecord[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<FieldDocsMediaHit | null>(null);
  const [mediaCommentDraft, setMediaCommentDraft] = useState("");
  const [mediaManualTagsDraft, setMediaManualTagsDraft] = useState("");
  const [mediaHiddenFromClientDraft, setMediaHiddenFromClientDraft] = useState(false);
  const [mediaReviewSaving, setMediaReviewSaving] = useState(false);
  const [mediaAnnotationsDraft, setMediaAnnotationsDraft] = useState<FieldDocsMediaAnnotation[]>([]);
  const [drawingPath, setDrawingPath] = useState<Array<{ x: number; y: number }> | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [reportUrl, setReportUrl] = useState("");
  const [status, setStatus] = useState("Loading NexCam...");
  const [mediaQuery, setMediaQuery] = useState("Deborah Justice");
  const [clientFilterId, setClientFilterId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeTrashed, setIncludeTrashed] = useState(false);
  const [reportTitle, setReportTitle] = useState("Aquatrace Leak Detection Report");
  const [reportKind, setReportKind] = useState<"field_report" | "ai_recap">("field_report");
  const [selectedReportTemplateId, setSelectedReportTemplateId] = useState("");
  const [selectedSnippetIds, setSelectedSnippetIds] = useState<string[]>([]);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [activeChecklistSection, setActiveChecklistSection] = useState("");
  const [contextIds, setContextIds] = useState({
    propertyId: "property_demo_pool",
    jobId: "job_demo_leak_detection",
    visitId: "visit_demo_2026_07_18"
  });
  const [templateDraft, setTemplateDraft] = useState({
    title: "",
    slug: "",
    description: "",
    appliesTo: "visit" as "job" | "visit" | "job_or_visit"
  });
  const [draftSections, setDraftSections] = useState<Array<{ id: string; title: string; allowNa: boolean }>>([
    { id: "overview", title: "Overview", allowNa: false }
  ]);
  const [draftFields, setDraftFields] = useState<FieldDocsTemplateField[]>([]);
  const [draftField, setDraftField] = useState({
    label: "",
    section: "Overview",
    type: "free_text" as FieldDocsTemplateField["type"],
    memory: "visit" as FieldDocsTemplateField["memory"],
    required: true,
    photoRequiredDefault: false,
    helpText: "",
    unit: "",
    optionsText: ""
  });
  const [reportTemplateDraft, setReportTemplateDraft] = useState({
    title: "",
    defaultReportTitle: "",
    watermarkByDefault: false
  });
  const [reportTemplateSections, setReportTemplateSections] = useState<Array<{ id: string; label: string; defaultText: string; snippetIds: string[] }>>([
    { id: "summary", label: "Summary", defaultText: "", snippetIds: [] }
  ]);
  const [snippetDraft, setSnippetDraft] = useState({ label: "", bodyText: "" });
  const [bundleDraft, setBundleDraft] = useState({
    label: "",
    jobTypeKey: "",
    checklistTemplateId: "",
    reportTemplateId: "",
    active: true
  });

  useEffect(() => {
    let cancelled = false;
    loadOperatorContext(props.user)
      .then((context) => {
        if (!cancelled) setOperatorContext(context);
      })
      .catch(() => {
        if (!cancelled) setOperatorContext(fallbackOperatorContext(props.user));
      });
    return () => {
      cancelled = true;
    };
  }, [props.user]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/tenant-branding?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
      .then((response) => response.json() as Promise<TenantBrandingResponse>)
      .then((body) => {
        if (!cancelled && body.ok && body.branding) setTenantBranding(body.branding);
      })
      .catch(() => {
        if (!cancelled) setTenantBranding(null);
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/clients?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
      .then((response) => response.json() as Promise<CrmClientsResponse>)
      .then((body) => {
        if (!cancelled) {
          setClients(body.ok ? (body.clients ?? []) : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClients([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId]);

  useEffect(() => {
    const onPopState = () => setActiveModule(nexCamModuleFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function refreshTemplates(): Promise<void> {
    setStatus("Loading checklist templates...");
    try {
      const body = await fetch(`/api/fielddocs/checklists/templates?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<FieldDocsTemplatesResponse>);
      if (!body.ok) {
        setTemplates([]);
        setStatus(body.error ?? "Checklist templates are unavailable.");
        return;
      }
      const nextTemplates = body.templates ?? [];
      setTemplates(nextTemplates);
      setSelectedTemplateId((current) => current && nextTemplates.some((template) => template.id === current)
        ? current
        : (nextTemplates[0]?.id ?? ""));
      setStatus(`${body.templates?.length ?? 0} checklist template${body.templates?.length === 1 ? "" : "s"} ready.`);
    } catch {
      setTemplates([]);
      setStatus("Checklist template API unreachable.");
    }
  }

  async function refreshReportTemplates(): Promise<void> {
    try {
      const body = await fetch(`/api/fielddocs/report-templates?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<FieldReportTemplatesResponse>);
      const nextTemplates = body.ok ? (body.templates ?? []) : [];
      setReportTemplates(nextTemplates);
      setSelectedReportTemplateId((current) => current && nextTemplates.some((template) => template.id === current)
        ? current
        : (nextTemplates[0]?.id ?? ""));
      setWatermarkEnabled((current) => current || Boolean(nextTemplates[0]?.watermarkByDefault));
    } catch {
      setReportTemplates([]);
    }
  }

  async function refreshBundles(): Promise<void> {
    try {
      const body = await fetch(`/api/fielddocs/bundles?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<FieldDocsBundlesResponse>);
      setBundles(body.ok ? (body.bundles ?? []) : []);
    } catch {
      setBundles([]);
    }
  }

  async function refreshTextSnippets(): Promise<void> {
    try {
      const body = await fetch(`/api/fielddocs/text-snippets?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<FieldDocsTextSnippetsResponse>);
      setTextSnippets(body.ok ? (body.snippets ?? []) : []);
    } catch {
      setTextSnippets([]);
    }
  }

  async function refreshRecentMedia(): Promise<void> {
    try {
      const params = new URLSearchParams({
        tenantId: operatorContext.tenantId,
        propertyId: contextIds.propertyId,
        jobId: contextIds.jobId,
        visitId: contextIds.visitId,
        limit: "12",
        includeTrashed: String(includeTrashed)
      });
      if (clientFilterId.trim()) params.set("clientId", clientFilterId.trim());
      if (dateFrom) params.set("dateFrom", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) params.set("dateTo", `${dateTo}T23:59:59.999Z`);
      const body = await fetch(`/api/fielddocs/media?${params.toString()}`)
        .then((response) => response.json() as Promise<FieldDocsMediaListResponse>);
      setRecentMedia(body.ok ? (body.media ?? []) : []);
    } catch {
      setRecentMedia([]);
    }
  }

  async function refreshHistory(): Promise<void> {
    if (!contextIds.propertyId.trim()) {
      setHistory([]);
      return;
    }
    try {
      const body = await fetch(`/api/fielddocs/properties/${encodeURIComponent(contextIds.propertyId)}/history?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<FieldDocsPropertyHistoryResponse>);
      setHistory(body.ok ? (body.history ?? []) : []);
    } catch {
      setHistory([]);
    }
  }

  async function refreshChecklists(): Promise<void> {
    try {
      const params = new URLSearchParams({ tenantId: operatorContext.tenantId });
      if (contextIds.propertyId.trim()) params.set("propertyId", contextIds.propertyId.trim());
      if (contextIds.jobId.trim()) params.set("jobId", contextIds.jobId.trim());
      if (contextIds.visitId.trim()) params.set("visitId", contextIds.visitId.trim());
      const body = await fetch(`/api/fielddocs/checklists?${params.toString()}`)
        .then((response) => response.json() as Promise<FieldDocsChecklistListResponse>);
      setRecentChecklists(body.ok ? (body.checklists ?? []) : []);
    } catch {
      setRecentChecklists([]);
    }
  }

  async function refreshReports(): Promise<void> {
    try {
      const params = new URLSearchParams({
        tenantId: operatorContext.tenantId,
        propertyId: contextIds.propertyId,
        jobId: contextIds.jobId,
        visitId: contextIds.visitId,
        limit: "12"
      });
      if (clientFilterId.trim()) params.set("clientId", clientFilterId.trim());
      if (dateFrom) params.set("dateFrom", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) params.set("dateTo", `${dateTo}T23:59:59.999Z`);
      const body = await fetch(`/api/fielddocs/reports?${params.toString()}`)
        .then((response) => response.json() as Promise<FieldDocsReportsListResponse>);
      const nextReports = body.ok ? (body.reports ?? []) : [];
      setReports(nextReports);
      setReport((current) => current ?? nextReports[0] ?? null);
    } catch {
      setReports([]);
    }
  }

  async function createChecklist(): Promise<void> {
    setStatus("Creating checklist from library...");
    try {
      const body = await fetch("/api/fielddocs/checklists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          templateId: selectedTemplateId || templates[0]?.id,
          propertyId: contextIds.propertyId.trim() || undefined,
          jobId: contextIds.jobId.trim() || undefined,
          visitId: contextIds.visitId.trim() || undefined
        })
      }).then((response) => response.json() as Promise<FieldDocsChecklistResponse>);
      if (!body.ok || !body.checklist) {
        setStatus(body.error ?? "Checklist could not be created.");
        return;
      }
      setChecklist(body.checklist);
      setActiveChecklistSection(body.checklist.fields[0]?.section ?? "");
      await refreshChecklists();
      setStatus(`Checklist ${body.checklist.id} created with ${body.checklist.fields.length} fields.`);
    } catch {
      setStatus("Checklist create request failed.");
    }
  }

  async function saveChecklist(complete = false): Promise<void> {
    if (!checklist) {
      return;
    }
    setStatus(complete ? "Completing checklist..." : "Saving checklist...");
    try {
      const body = await fetch(`/api/fielddocs/checklists/${encodeURIComponent(checklist.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          complete,
          updates: checklist.fields.map((field) => ({
            fieldId: field.fieldId,
            status: field.status,
            photoRequired: field.photoRequired ?? false,
            ...(field.note !== undefined ? { note: field.note } : {}),
            ...(field.numberValue !== undefined ? { numberValue: field.numberValue } : {}),
            ...(field.multiValue !== undefined ? { multiValue: field.multiValue } : {}),
            ...(field.mediaIds !== undefined ? { mediaIds: field.mediaIds } : {})
          })),
          sectionStateUpdates: checklist.sectionStates.map((section) => ({
            section: section.section,
            status: section.status
          }))
        })
      }).then((response) => response.json() as Promise<FieldDocsChecklistResponse>);
      if (!body.ok || !body.checklist) {
        setStatus(body.error ?? "Checklist save failed.");
        return;
      }
      setChecklist(body.checklist);
      await Promise.all([refreshHistory(), refreshReports(), refreshChecklists()]);
      setStatus(complete ? "Checklist completed and property memory updated." : "Checklist draft saved.");
    } catch {
      setStatus("Checklist save request failed.");
    }
  }

  function patchChecklistField(fieldId: string, patch: Partial<NonNullable<FieldDocsChecklistResponse["checklist"]>["fields"][number]>): void {
    setChecklist((current) => current ? {
      ...current,
      fields: current.fields.map((field) => field.fieldId === fieldId ? { ...field, ...patch } : field)
    } : current);
  }

  function patchChecklistSection(sectionName: string, status: "active" | "not_applicable"): void {
    setChecklist((current) => current ? {
      ...current,
      sectionStates: current.sectionStates.map((section) => section.section === sectionName ? {
        ...section,
        status,
        updatedAt: new Date().toISOString()
      } : section)
    } : current);
  }

  async function searchMedia(): Promise<void> {
    setStatus("Searching NexCam media...");
    try {
      const body = await fetch(`/api/fielddocs/search?tenantId=${encodeURIComponent(operatorContext.tenantId)}&q=${encodeURIComponent(mediaQuery)}&limit=12`)
        .then((response) => response.json() as Promise<FieldDocsSearchResponse>);
      if (!body.ok) {
        setMediaHits([]);
        setStatus(body.error ?? "Media search failed.");
        return;
      }
      setMediaHits(body.hits ?? []);
      setStatus(`${body.hits?.length ?? 0} media item${body.hits?.length === 1 ? "" : "s"} found for "${mediaQuery}".`);
    } catch {
      setMediaHits([]);
      setStatus("Media search API unreachable.");
    }
  }

  async function createReport(): Promise<void> {
    setStatus("Generating NexCam report...");
    try {
      const mediaIds = (recentMedia.length ? recentMedia : mediaHits).map((hit) => hit.id);
      const template = reportTemplates.find((entry) => entry.id === selectedReportTemplateId);
      const body = await fetch("/api/fielddocs/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          propertyId: contextIds.propertyId.trim() || undefined,
          jobId: contextIds.jobId.trim() || undefined,
          visitId: contextIds.visitId.trim() || undefined,
          kind: reportKind,
          title: reportTitle,
          findings: [
            reportKind === "ai_recap"
              ? "AI recap assembled from captured field media, checklist completion, and the current visit context."
              : "Checklist-driven report generated from NexCam.",
            "Report can attach to closeout receipts and approval-gated emails."
          ],
          mediaIds,
          checklistId: checklist?.id,
          ...(template ? { templateId: template.id } : {}),
          ...(selectedSnippetIds.length ? { snippetIds: selectedSnippetIds } : {}),
          watermarkEnabled,
          status: "posted"
        })
      }).then((response) => response.json() as Promise<FieldDocsReportResponse>);
      if (!body.ok || !body.report) {
        setStatus(body.error ?? "Report could not be created.");
        return;
      }
      setReport(body.report);
      setReportUrl(body.pdfUrl ?? "");
      await refreshReports();
      setStatus(`Report ${body.report.id} generated.`);
    } catch {
      setStatus("Report create request failed.");
    }
  }

  async function saveTemplate(): Promise<void> {
    if (!templateDraft.title.trim() || !templateDraft.slug.trim() || !draftFields.length) {
      setStatus("Template title, slug, and at least one field are required.");
      return;
    }
    setStatus("Saving checklist template...");
    try {
      const body = await fetch("/api/fielddocs/checklists/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          title: templateDraft.title.trim(),
          slug: templateDraft.slug.trim(),
          description: templateDraft.description.trim() || undefined,
          appliesTo: templateDraft.appliesTo,
          active: true,
          version: 1,
          sections: draftSections
            .filter((section) => draftFields.some((field) => field.section === section.title))
            .map((section) => ({
              id: section.id,
              title: section.title,
              allowNa: section.allowNa
            })),
          fields: draftFields
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setStatus(body.error ?? "Template save failed.");
        return;
      }
      setDraftFields([]);
      setTemplateDraft({ title: "", slug: "", description: "", appliesTo: "visit" });
      setDraftSections([{ id: "overview", title: "Overview", allowNa: false }]);
      setDraftField({
        label: "",
        section: "Overview",
        type: "free_text",
        memory: "visit",
        required: true,
        photoRequiredDefault: false,
        helpText: "",
        unit: "",
        optionsText: ""
      });
      await refreshTemplates();
      setStatus("Template saved to the NexCam library.");
    } catch {
      setStatus("Template save request failed.");
    }
  }

  function addDraftField(): void {
    if (!draftField.label.trim() || !draftField.section.trim()) {
      setStatus("Each field needs a label and section.");
      return;
    }
    const sectionTitle = draftField.section.trim();
    setDraftFields((current) => [
      ...current,
      {
        id: `field_${crypto.randomUUID()}`,
        label: draftField.label.trim(),
        section: sectionTitle,
        type: draftField.type,
        memory: draftField.memory,
        required: draftField.required,
        photoRequiredDefault: draftField.photoRequiredDefault,
        ...(draftField.helpText.trim() ? { helpText: draftField.helpText.trim() } : {}),
        ...(draftField.unit.trim() ? { unit: draftField.unit.trim() } : {}),
        ...(draftField.optionsText.trim() ? { options: draftField.optionsText.split(",").map((option) => option.trim()).filter(Boolean) } : {})
      }
    ]);
    setDraftSections((current) => current.some((section) => section.title === sectionTitle)
      ? current
      : [...current, {
          id: sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          title: sectionTitle,
          allowNa: false
        }]
    );
    setDraftField({
      label: "",
      section: sectionTitle,
      type: "free_text",
      memory: "visit",
      required: true,
      photoRequiredDefault: false,
      helpText: "",
      unit: "",
      optionsText: ""
    });
    setStatus("Field added to the draft template.");
  }

  function removeDraftField(fieldId: string): void {
    setDraftFields((current) => current.filter((field) => field.id !== fieldId));
  }

  function toggleDraftSectionAllowNa(sectionId: string): void {
    setDraftSections((current) => current.map((section) => section.id === sectionId ? {
      ...section,
      allowNa: !section.allowNa
    } : section));
  }

  function removeDraftSection(sectionId: string): void {
    const section = draftSections.find((entry) => entry.id === sectionId);
    if (!section) {
      return;
    }
    setDraftSections((current) => current.filter((entry) => entry.id !== sectionId));
    setDraftFields((current) => current.filter((field) => field.section !== section.title));
  }

  async function saveReportTemplate(): Promise<void> {
    if (!reportTemplateDraft.title.trim() || !reportTemplateDraft.defaultReportTitle.trim() || !reportTemplateSections.length) {
      setStatus("Report templates need a title, default report title, and at least one section.");
      return;
    }
    setStatus("Saving report template...");
    try {
      const body = await fetch("/api/fielddocs/report-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          title: reportTemplateDraft.title.trim(),
          defaultReportTitle: reportTemplateDraft.defaultReportTitle.trim(),
          sections: reportTemplateSections.map((section) => ({
            id: section.id,
            label: section.label,
            ...(section.defaultText.trim() ? { defaultText: section.defaultText.trim() } : {}),
            snippetIds: section.snippetIds
          })),
          watermarkByDefault: reportTemplateDraft.watermarkByDefault
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setStatus(body.error ?? "Report template save failed.");
        return;
      }
      setReportTemplateDraft({ title: "", defaultReportTitle: "", watermarkByDefault: false });
      setReportTemplateSections([{ id: "summary", label: "Summary", defaultText: "", snippetIds: [] }]);
      await refreshReportTemplates();
      setStatus("Report template saved.");
    } catch {
      setStatus("Report template save failed.");
    }
  }

  async function saveTextSnippet(): Promise<void> {
    if (!snippetDraft.label.trim() || !snippetDraft.bodyText.trim()) {
      setStatus("Snippets need both a label and body text.");
      return;
    }
    setStatus("Saving reusable text snippet...");
    try {
      const body = await fetch("/api/fielddocs/text-snippets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          label: snippetDraft.label.trim(),
          bodyText: snippetDraft.bodyText.trim()
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setStatus(body.error ?? "Text snippet save failed.");
        return;
      }
      setSnippetDraft({ label: "", bodyText: "" });
      await refreshTextSnippets();
      setStatus("Reusable text snippet saved.");
    } catch {
      setStatus("Text snippet save failed.");
    }
  }

  async function saveBundle(): Promise<void> {
    if (!bundleDraft.label.trim() || !bundleDraft.jobTypeKey.trim() || !bundleDraft.checklistTemplateId || !bundleDraft.reportTemplateId) {
      setStatus("Bundles need a label, job-type key, checklist template, and report template.");
      return;
    }
    setStatus("Saving job-type bundle...");
    try {
      const body = await fetch("/api/fielddocs/bundles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          label: bundleDraft.label.trim(),
          jobTypeKey: bundleDraft.jobTypeKey.trim(),
          checklistTemplateId: bundleDraft.checklistTemplateId,
          reportTemplateId: bundleDraft.reportTemplateId,
          active: bundleDraft.active
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setStatus(body.error ?? "Bundle save failed.");
        return;
      }
      setBundleDraft({
        label: "",
        jobTypeKey: "",
        checklistTemplateId: templates[0]?.id ?? "",
        reportTemplateId: reportTemplates[0]?.id ?? "",
        active: true
      });
      await refreshBundles();
      setStatus("Job-type bundle saved.");
    } catch {
      setStatus("Bundle save failed.");
    }
  }

  function toggleSnippetSelection(snippetId: string): void {
    setSelectedSnippetIds((current) => current.includes(snippetId)
      ? current.filter((entry) => entry !== snippetId)
      : [...current, snippetId]
    );
  }

  function setModule(module: NexCamModule): void {
    const target = NEXCAM_MODULES.find((entry) => entry.id === module) ?? NEXCAM_MODULES[0];
    setActiveModule(module);
    window.history.pushState({}, "", target.path);
  }

  useEffect(() => {
    void refreshTemplates();
    void refreshReportTemplates();
    void refreshBundles();
    void refreshTextSnippets();
  }, [operatorContext.tenantId]);

  useEffect(() => {
    setBundleDraft((current) => ({
      ...current,
      checklistTemplateId: current.checklistTemplateId || templates[0]?.id || "",
      reportTemplateId: current.reportTemplateId || reportTemplates[0]?.id || ""
    }));
  }, [reportTemplates, templates]);

  useEffect(() => {
    void Promise.all([refreshRecentMedia(), refreshHistory(), refreshReports(), refreshChecklists()]);
  }, [operatorContext.tenantId, contextIds.propertyId, contextIds.jobId, contextIds.visitId, clientFilterId, dateFrom, dateTo, includeTrashed]);

  useEffect(() => {
    if (!checklist) {
      setActiveChecklistSection("");
      return;
    }
    const firstSection = checklist.fields[0]?.section ?? "";
    const hasCurrentSection = checklist.fields.some((field) => field.section === activeChecklistSection);
    if (!hasCurrentSection) {
      setActiveChecklistSection(firstSection);
    }
  }, [checklist, activeChecklistSection]);

  const style = {
    "--nexops-brand-primary": "#0c1118",
    "--nexops-brand-accent": "#A8E600",
    "--nexops-brand-gradient": "linear-gradient(135deg, #D4FF20 0%, #25D238 100%)",
    "--nexops-brand-background": "#f5f7f1",
    "--nexops-brand-surface": "#ffffff",
    "--nexops-brand-text": "#101822",
    "--nexops-brand-muted": "#68717c",
    "--nexops-font-family": "Montserrat, Aptos, Segoe UI, Helvetica Neue, sans-serif"
  } as React.CSSProperties;
  const template = templates.find((item) => item.id === selectedTemplateId) ?? templates[0];
  const checklistTemplate = checklist
    ? templates.find((item) => item.id === checklist.templateId) ?? template
    : template;
  const propertyItems = template?.fields.filter((item) => item.memory === "property") ?? [];
  const visitItems = template?.fields.filter((item) => item.memory === "visit") ?? [];
  const activeSectionRecord = checklist?.sectionStates.find((section) => section.section === activeChecklistSection);
  const activeSectionTemplate = checklistTemplate?.sections.find((section) => section.title === activeChecklistSection);
  const activeSectionAllowsNa = activeSectionTemplate?.allowNa === true;
  const activeSectionIsNa = activeSectionRecord?.status === "not_applicable";

  function renderChecklistField(field: NonNullable<FieldDocsChecklistResponse["checklist"]>["fields"][number]): React.ReactElement {
    return (
      <article className="nexops-module-card" key={field.fieldId}>
        <p className="eyebrow">{field.section} · {field.memory === "property" ? "Property field" : "Visit field"}</p>
        <h2>{field.label}</h2>
        <p className="nexcam-field-note">
          {field.required ? "Required" : "Optional"}
          {field.photoRequired ? " - photo required on this checklist" : ""}
        </p>
        {field.type === "pass_fail" ? (
          <>
            <label className="nexops-field">
              <span>Status</span>
              <select value={field.status} onChange={(event) => patchChecklistField(field.fieldId, { status: event.target.value as typeof field.status })}>
                <option value="pending">Pending</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="not_applicable">Not applicable</option>
              </select>
            </label>
            <label className="nexops-field">
              <span>Notes</span>
              <textarea rows={3} value={field.note ?? ""} onChange={(event) => patchChecklistField(field.fieldId, { note: event.target.value })} />
            </label>
          </>
        ) : null}
        {field.type === "free_text" ? (
          <label className="nexops-field">
            <span>Notes</span>
            <textarea rows={3} value={field.note ?? ""} onChange={(event) => patchChecklistField(field.fieldId, { note: event.target.value })} />
          </label>
        ) : null}
        {(field.type === "count" || field.type === "measurement") ? (
          <label className="nexops-field">
            <span>{field.unit ? `Value (${field.unit})` : "Value"}</span>
            <input
              type="number"
              value={field.numberValue ?? ""}
              onChange={(event) => patchChecklistField(field.fieldId, { numberValue: event.target.value === "" ? undefined : Number(event.target.value) })}
            />
          </label>
        ) : null}
        {field.type === "multi_select" ? (
          <div className="nexops-field">
            <span>Choices</span>
            <div className="nexops-request-toggle-row">
              {(field.options ?? []).map((option) => {
                const selected = field.multiValue?.includes(option) ?? false;
                return (
                  <button
                    type="button"
                    className={selected ? "active" : ""}
                    key={option}
                    onClick={() => patchChecklistField(field.fieldId, {
                      multiValue: selected
                        ? (field.multiValue ?? []).filter((candidate) => candidate !== option)
                        : [...(field.multiValue ?? []), option]
                    })}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {field.type === "photo_attachment" ? (
          <label className="nexops-field">
            <span>Attached media IDs (comma separated)</span>
            <textarea
              rows={2}
              value={(field.mediaIds ?? []).join(", ")}
              onChange={(event) => patchChecklistField(field.fieldId, {
                mediaIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean)
              })}
            />
          </label>
        ) : null}
        <label className="nexops-check-field inline">
          <input
            type="checkbox"
            checked={field.photoRequired ?? false}
            onChange={(event) => patchChecklistField(field.fieldId, { photoRequired: event.target.checked })}
          />
          Photo required on this checklist instance
        </label>
      </article>
    );
  }

  const checklistSections = checklist
    ? Array.from(new Set(checklist.fields.map((field) => field.section)))
    : [];
  const visibleChecklistFields = checklist
    ? checklist.fields.filter((field) => field.section === (activeChecklistSection || checklistSections[0] || field.section))
    : [];
  const latestHistory = history[0];
  const carryforwardFields = latestHistory?.fields.filter((field) => field.memory === "property") ?? [];

  function fieldHasValue(field: NonNullable<FieldDocsChecklistResponse["checklist"]>["fields"][number]): boolean {
    return field.status !== "pending"
      || (field.note ?? "").trim().length > 0
      || field.numberValue !== undefined
      || (field.multiValue?.length ?? 0) > 0
      || (field.mediaIds?.length ?? 0) > 0;
  }

  function describeFieldValue(field: NonNullable<FieldDocsChecklistResponse["checklist"]>["fields"][number]): string {
    if (field.type === "multi_select") {
      return field.multiValue?.length ? field.multiValue.join(", ") : "Blank";
    }
    if (field.type === "count" || field.type === "measurement") {
      return field.numberValue !== undefined
        ? `${field.numberValue}${field.unit ? ` ${field.unit}` : ""}`
        : "Blank";
    }
    if (field.type === "photo_attachment") {
      return `${field.mediaIds?.length ?? 0} attached`;
    }
    if ((field.note ?? "").trim()) {
      return field.note ?? "";
    }
    if (field.status !== "pending") {
      return field.status.replaceAll("_", " ");
    }
    return "Blank";
  }

  function syncMediaRecord(nextMedia: FieldDocsMediaHit): void {
    setSelectedMedia(nextMedia);
    setMediaAnnotationsDraft(nextMedia.annotations ?? []);
    setCaptureSession((current) => current && current.media.some((item) => item.id === nextMedia.id)
      ? {
          ...current,
          media: current.media.map((item) => item.id === nextMedia.id ? { ...item, ...nextMedia } : item)
        }
      : current);
    setRecentMedia((current) => current.map((item) => item.id === nextMedia.id ? nextMedia : item));
    setMediaHits((current) => current.map((item) => item.id === nextMedia.id ? nextMedia : item));
  }

  function openMediaReview(hit: FieldDocsMediaHit): void {
    setSelectedMedia(hit);
    setMediaCommentDraft("");
    setMediaManualTagsDraft((hit.manualTags ?? []).join(", "));
    setMediaHiddenFromClientDraft(hit.hiddenFromClient === true);
    setMediaAnnotationsDraft(hit.annotations ?? []);
    setDrawingPath(null);
    setDrawMode(false);
  }

  function closeMediaReview(): void {
    setSelectedMedia(null);
    setMediaCommentDraft("");
    setMediaManualTagsDraft("");
    setMediaHiddenFromClientDraft(false);
    setMediaAnnotationsDraft([]);
    setDrawingPath(null);
    setDrawMode(false);
  }

  function mediaPoint(event: React.PointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const bounds = mediaStageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
    };
  }

  function beginMediaDraw(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawMode || !selectedMedia || selectedMedia.type !== "photo") {
      return;
    }
    const point = mediaPoint(event);
    if (!point) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawingPath([point]);
  }

  function updateMediaDraw(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawMode || !drawingPath) {
      return;
    }
    const point = mediaPoint(event);
    if (!point) {
      return;
    }
    setDrawingPath((current) => current ? [...current, point] : current);
  }

  function finishMediaDraw(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawMode || !drawingPath) {
      return;
    }
    const point = mediaPoint(event);
    const points = point ? [...drawingPath, point] : drawingPath;
    if (points.length >= 2) {
      setMediaAnnotationsDraft((current) => [
        ...current,
        {
          id: `annotation_${crypto.randomUUID()}`,
          kind: "path",
          color: "#106060",
          createdAt: new Date().toISOString(),
          points
        }
      ]);
      setStatus("Markup added. Save media review to keep it.");
    }
    setDrawingPath(null);
  }

  function removeLastMarkup(): void {
    setMediaAnnotationsDraft((current) => current.slice(0, -1));
    setStatus("Last markup removed. Save media review to keep the change.");
  }

  function annotationPolyline(points: Array<{ x: number; y: number }>): string {
    return points.map((point) => `${(point.x * 100).toFixed(2)},${(point.y * 100).toFixed(2)}`).join(" ");
  }

  async function saveMediaReview(): Promise<void> {
    if (!selectedMedia || mediaReviewSaving) {
      return;
    }
    setMediaReviewSaving(true);
    setStatus("Saving photo review...");
    try {
      const response = await fetch(`/api/fielddocs/media/${encodeURIComponent(selectedMedia.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          ...(mediaCommentDraft.trim() ? { comment: mediaCommentDraft.trim() } : {}),
          manualTags: mediaManualTagsDraft.split(",").map((tag) => tag.trim()).filter(Boolean),
          hiddenFromClient: mediaHiddenFromClientDraft,
          annotations: mediaAnnotationsDraft
        })
      });
      const body = await response.json() as { ok: boolean; media?: FieldDocsMediaHit; error?: string };
      if (!response.ok || !body.ok || !body.media) {
        throw new Error(body.error ?? "Photo review save failed.");
      }
      syncMediaRecord(body.media);
      setMediaCommentDraft("");
      setDrawingPath(null);
      setDrawMode(false);
      setStatus("Photo review saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Photo review save failed.");
    } finally {
      setMediaReviewSaving(false);
    }
  }

  async function setMediaTrashState(trashed: boolean): Promise<void> {
    if (!selectedMedia || mediaReviewSaving) {
      return;
    }
    setMediaReviewSaving(true);
    setStatus(trashed ? "Moving photo to tenant trash..." : "Restoring photo from tenant trash...");
    try {
      const response = await fetch(`/api/fielddocs/media/${encodeURIComponent(selectedMedia.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          trashedAt: trashed ? new Date().toISOString() : null,
          purgeAfter: trashed ? new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString() : null
        })
      });
      const body = await response.json() as { ok: boolean; media?: FieldDocsMediaHit; error?: string };
      if (!response.ok || !body.ok || !body.media) {
        throw new Error(body.error ?? "Photo trash update failed.");
      }
      syncMediaRecord(body.media);
      await refreshRecentMedia();
      setStatus(trashed ? "Photo moved to tenant trash. It will purge after 30 days unless restored." : "Photo restored from tenant trash.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Photo trash update failed.");
    } finally {
      setMediaReviewSaving(false);
    }
  }

  function mediaContextLabel(hit: NonNullable<FieldDocsSearchResponse["hits"]>[number]): string {
    if (hit.visitId) return `Visit ${hit.visitId}`;
    if (hit.jobId) return `Job ${hit.jobId}`;
    if (hit.propertyId) return `Property ${hit.propertyId}`;
    return "Unassigned review queue";
  }

  function formatFieldType(field: FieldDocsTemplateField): string {
    return field.type.replaceAll("_", " ");
  }

  function renderMediaCard(hit: FieldDocsMediaHit, eyebrow: string): React.ReactElement {
    const timestamp = hit.exif?.ts ? hit.exif.ts.slice(0, 16).replace("T", " ") : "No capture time";
    const gps = hit.exif?.gps ? `${hit.exif.gps.lat.toFixed(4)}, ${hit.exif.gps.lng.toFixed(4)}` : "No GPS on file";
    const allTags = Array.from(new Set([...(hit.aiTags ?? []), ...(hit.manualTags ?? [])]));
    return (
      <article className="nexops-module-card" key={`${eyebrow}-${hit.id}`}>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{hit.aiCaption || hit.storageRef}</h2>
        <p>{allTags.length ? allTags.join(", ") : "AI tags still pending or not available."}</p>
        <small>{mediaContextLabel(hit)}</small>
        <small>{timestamp}</small>
        <small>{gps}</small>
        <small>
          {hit.manualTags?.length ? `Manual tags: ${hit.manualTags.join(", ")}` : "No manual tags yet"}
          {hit.hiddenFromClient ? " - hidden from client" : ""}
          {hit.trashedAt ? " - in tenant trash" : ""}
        </small>
        <small>{(hit.comments?.length ?? 0)} comment{(hit.comments?.length ?? 0) === 1 ? "" : "s"} · {(hit.annotations?.length ?? 0)} markup path{(hit.annotations?.length ?? 0) === 1 ? "" : "s"}</small>
        <div className="nexops-inline-actions">
          {hit.type === "photo" ? (
            <button className="nexops-link-button" type="button" onClick={() => openMediaReview(hit)}>Review photo</button>
          ) : null}
          <a className="nexops-link-button" href={`/api/media/${encodeURIComponent(hit.id)}?tenantId=${encodeURIComponent(operatorContext.tenantId)}`} target="_blank" rel="noreferrer">Open file</a>
        </div>
      </article>
    );
  }

  function renderOverview(): React.ReactElement {
    const filledCount = checklist ? checklist.fields.filter((field) => fieldHasValue(field)).length : 0;
    const activeSection = activeChecklistSection || checklistSections[0] || "No section yet";
    return (
      <section className="nexops-dashboard">
        <div className="nexops-page-heading">
          <div>
            <ProductLogo product="nexcam" className="nexcam-heading-logo" alt="NexCam" />
            <p>Template-driven field capture, visit media, property carryforward, and closeout-ready reports.</p>
          </div>
          <div className="nexops-inline-actions">
            <button className="nexops-link-button" type="button" onClick={() => void refreshChecklists()}>Refresh context</button>
            <button type="button" onClick={() => void createChecklist()}>Start checklist</button>
          </div>
        </div>
        <div className="nexops-workflow-strip">
          {[
            ["Templates", String(templates.length), "Reusable library, not a one-off checklist."],
            ["Carryforward", String(carryforwardFields.length), "Property memory pulled from the latest completed visit."],
            ["Recent media", String(recentMedia.length), "Visit-scoped photos, PDFs, and uploads."],
            ["Reports", String(reports.length), "PDF exports ready for the receipt rail."]
          ].map(([title, value, detail]) => (
            <article key={title}>
              <span>{title}</span>
              <strong>{value}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </div>
        <div className="nexops-two-column">
          <section className="nexops-module-page">
            <article className="nexops-module-card wide nexcam-context-card">
              <p className="eyebrow">Visit context</p>
              <h2>Start from a real property, job, and visit rail</h2>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Property ID</span>
                  <input value={contextIds.propertyId} onChange={(event) => setContextIds((current) => ({ ...current, propertyId: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Job ID</span>
                  <input value={contextIds.jobId} onChange={(event) => setContextIds((current) => ({ ...current, jobId: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Visit ID</span>
                  <input value={contextIds.visitId} onChange={(event) => setContextIds((current) => ({ ...current, visitId: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Template</span>
                  <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                    {templates.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
                  </select>
                </label>
              </div>
              {template ? (
                <div className="nexops-request-summary-grid">
                  <article>
                    <h3>{template.title}</h3>
                    <p>{template.itemCount} fields across {template.sections.length} sections.</p>
                    <small>{template.appliesTo.replaceAll("_", " ")} rail</small>
                  </article>
                  <article>
                    <h3>{template.propertyPersistentCount} property fields</h3>
                    <p>{template.visitFreshCount} visit-fresh fields start blank every time.</p>
                    <small>{template.fieldTypes?.join(", ") ?? "Field types ready"}</small>
                  </article>
                </div>
              ) : null}
            </article>
            {checklist ? (
              <article className="nexops-module-card wide nexcam-checklist-shell">
                <p className="eyebrow">Active checklist</p>
                <h2>{checklist.title}</h2>
                <p>{filledCount} of {checklist.fields.length} fields have data. Current section: {activeSection}.</p>
                <div className="nexcam-section-pills">
                  {checklistSections.map((section) => {
                    const sectionCount = checklist.fields.filter((field) => field.section === section).length;
                    const sectionFilled = checklist.fields.filter((field) => field.section === section && fieldHasValue(field)).length;
                    return (
                      <button
                        type="button"
                        key={section}
                        className={section === activeSection ? "active" : ""}
                        onClick={() => setActiveChecklistSection(section)}
                      >
                        {section} ({sectionFilled}/{sectionCount}){checklist.sectionStates.find((entry) => entry.section === section)?.status === "not_applicable" ? " - N/A" : ""}
                      </button>
                    );
                  })}
                </div>
                {activeSectionAllowsNa ? (
                  <div className="nexops-inline-actions">
                    <button
                      className={activeSectionIsNa ? "" : "nexops-link-button"}
                      type="button"
                      onClick={() => patchChecklistSection(activeSection, activeSectionIsNa ? "active" : "not_applicable")}
                    >
                      {activeSectionIsNa ? "Section marked N/A - restore section" : "Mark this section N/A"}
                    </button>
                    <small>{activeSectionIsNa ? "This section will not block completion or show as incomplete in the report." : "Use this only when the full section does not apply on this checklist."}</small>
                  </div>
                ) : null}
                {activeSectionIsNa ? (
                  <p className="nexops-form-note">This live checklist section is currently marked not applicable.</p>
                ) : null}
                <div className="nexcam-media-grid">
                  {visibleChecklistFields.map((field) => renderChecklistField(field))}
                </div>
                <div className="nexops-inline-actions">
                  <button className="nexops-link-button" type="button" onClick={() => void saveChecklist(false)}>Save draft</button>
                  <button type="button" onClick={() => void saveChecklist(true)}>Complete checklist</button>
                </div>
              </article>
            ) : (
              <article className="nexops-module-card wide">
                <p className="eyebrow">No checklist open</p>
                <h2>Pick a template, then start the visit checklist</h2>
                <p>NexCam now reads from the real template library and stores property-memory fields back on the property rail.</p>
              </article>
            )}
          </section>
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Property carryforward</p>
              <h2>{latestHistory ? `Latest completed checklist ${latestHistory.id}` : "Nothing completed for this property yet"}</h2>
              <p>{latestHistory ? "These are the property-persistent values ready to prefill the next visit on this exact property." : "Complete one visit checklist for this property to see carryforward values here."}</p>
              {carryforwardFields.length ? (
                <ul className="nexcam-history-values">
                  {carryforwardFields.map((field) => (
                    <li key={field.fieldId}>
                      <strong>{field.label}</strong>
                      <span>{describeFieldValue(field)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
            <ul className="nexops-mini-list">
              {recentChecklists.slice(0, 4).map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.title}</strong>
                  <span>{entry.visitId ?? entry.jobId ?? entry.propertyId ?? "Current context"} - {entry.status}</span>
                </li>
              ))}
              {!recentChecklists.length ? (
                <li>
                  <strong>No checklists in this context yet</strong>
                  <span>Create one from the selected template to start the history rail.</span>
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      </section>
    );
  }

  function renderTemplates(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Checklist Templates</h1>
            <p>{status}</p>
          </div>
          <div className="nexops-inline-actions">
            <button type="button" onClick={() => void refreshTemplates()}>Refresh</button>
            <button type="button" onClick={() => void createChecklist()}>Create visit checklist</button>
          </div>
        </div>
        <article className="nexops-module-card wide nexops-request-builder-card">
          <p className="eyebrow">New reusable template</p>
          <div className="nexops-request-builder-grid">
            <label className="nexops-field">
              <span>Title</span>
              <input value={templateDraft.title} onChange={(event) => setTemplateDraft((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="nexops-field">
              <span>Slug</span>
              <input value={templateDraft.slug} onChange={(event) => setTemplateDraft((current) => ({ ...current, slug: event.target.value }))} />
            </label>
            <label className="nexops-field">
              <span>Applies to</span>
              <select value={templateDraft.appliesTo} onChange={(event) => setTemplateDraft((current) => ({ ...current, appliesTo: event.target.value as typeof current.appliesTo }))}>
                <option value="visit">Visit</option>
                <option value="job">Job</option>
                <option value="job_or_visit">Job or visit</option>
              </select>
            </label>
            <label className="nexops-field">
              <span>Description</span>
              <input value={templateDraft.description} onChange={(event) => setTemplateDraft((current) => ({ ...current, description: event.target.value }))} />
            </label>
          </div>
          <div className="nexops-request-builder-grid">
            <label className="nexops-field">
              <span>Field label</span>
              <input value={draftField.label} onChange={(event) => setDraftField((current) => ({ ...current, label: event.target.value }))} />
            </label>
            <label className="nexops-field">
              <span>Section</span>
              <input value={draftField.section} onChange={(event) => setDraftField((current) => ({ ...current, section: event.target.value }))} />
            </label>
            <label className="nexops-field">
              <span>Field type</span>
              <select value={draftField.type} onChange={(event) => setDraftField((current) => ({ ...current, type: event.target.value as typeof current.type }))}>
                <option value="free_text">Free text</option>
                <option value="pass_fail">Pass / fail</option>
                <option value="count">Count</option>
                <option value="measurement">Measurement</option>
                <option value="multi_select">Multi-select</option>
                <option value="photo_attachment">Photo attachment</option>
              </select>
            </label>
            <label className="nexops-field">
              <span>Memory rail</span>
              <select value={draftField.memory} onChange={(event) => setDraftField((current) => ({ ...current, memory: event.target.value as typeof current.memory }))}>
                <option value="visit">Visit field</option>
                <option value="property">Property field</option>
              </select>
            </label>
            <label className="nexops-field">
              <span>Unit (optional)</span>
              <input value={draftField.unit} onChange={(event) => setDraftField((current) => ({ ...current, unit: event.target.value }))} />
            </label>
            <label className="nexops-field">
              <span>Options (comma separated)</span>
              <input value={draftField.optionsText} onChange={(event) => setDraftField((current) => ({ ...current, optionsText: event.target.value }))} />
            </label>
          </div>
          <div className="nexops-inline-actions">
            <button type="button" onClick={addDraftField}>Add field</button>
            <button type="button" onClick={() => void saveTemplate()}>Save template</button>
          </div>
          <ul className="nexops-mini-list">
            {draftFields.map((field) => (
              <li key={field.id}>
                <strong>{field.label}</strong>
                <span>{field.section} · {field.type} · {field.memory}</span>
              </li>
            ))}
          </ul>
        </article>
        <div className="nexcam-template-grid">
          {templates.map((item) => (
            <article className="nexops-module-card wide" key={item.id}>
              <p className="eyebrow">Owner-editable template</p>
              <h2>{item.title}</h2>
              <p>{item.itemCount} fields across {item.sections.length} sections. {item.propertyPersistentCount} property-persistent, {item.visitFreshCount} visit-fresh.</p>
              <div className="nexcam-item-columns">
                <div>
                  <h3>Property-persistent</h3>
                  <ul className="nexcam-item-list">
                    {item.fields.filter((field) => field.memory === "property").slice(0, 10).map((field) => <li key={`${field.id}`}>{field.section}: {field.label}</li>)}
                  </ul>
                </div>
                <div>
                  <h3>Visit-fresh</h3>
                  <ul className="nexcam-item-list">
                    {item.fields.filter((field) => field.memory === "visit").slice(0, 10).map((field) => <li key={`${field.id}`}>{field.section}: {field.label}</li>)}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
        {checklist ? (
          <section className="nexops-module-page">
            <div className="nexops-page-heading">
              <div>
                <h1>Checklist Editor</h1>
                <p>{checklist.status === "completed" ? "Completed" : "Draft"} for {checklist.visitId ?? checklist.jobId ?? "current context"}.</p>
              </div>
              <div className="nexops-inline-actions">
                <button type="button" onClick={() => void saveChecklist(false)}>Save draft</button>
                <button type="button" onClick={() => void saveChecklist(true)}>Complete checklist</button>
              </div>
            </div>
            <div className="nexcam-media-grid">
              {checklist.fields.map((field) => renderChecklistField(field))}
            </div>
          </section>
        ) : null}
      </section>
    );
  }

  function renderPhotos(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Photos & Media</h1>
            <p>Search native NexCam media by client/job/visit terms.</p>
          </div>
          <div className="nexops-inline-actions">
            <input value={mediaQuery} onChange={(event) => setMediaQuery(event.target.value)} placeholder="Deborah Justice" />
            <button type="button" onClick={() => void refreshRecentMedia()}>Refresh recent</button>
            <button type="button" onClick={() => void searchMedia()}>Search media</button>
          </div>
        </div>
        <div className="nexcam-media-grid">
          {recentMedia.map((hit) => (
            <article className="nexops-module-card" key={`recent-${hit.id}`}>
              <p className="eyebrow">Recent {hit.type}</p>
              <h2>{hit.aiCaption || hit.storageRef}</h2>
              <p>{hit.aiTags.length ? hit.aiTags.join(", ") : "No tags yet"}</p>
              <small>{hit.visitId ? `Visit ${hit.visitId}` : hit.jobId ? `Job ${hit.jobId}` : "Unassigned review queue"}</small>
            </article>
          ))}
          {mediaHits.map((hit) => (
            <article className="nexops-module-card" key={hit.id}>
              <p className="eyebrow">{hit.type}</p>
              <h2>{hit.aiCaption || hit.storageRef}</h2>
              <p>{hit.aiTags.length ? hit.aiTags.join(", ") : "No tags yet"}</p>
              <small>{hit.visitId ? `Visit ${hit.visitId}` : hit.jobId ? `Job ${hit.jobId}` : "Unassigned review queue"}</small>
            </article>
          ))}
          {!mediaHits.length && !recentMedia.length ? (
            <article className="nexops-module-card">
              <p className="eyebrow">Unresolved queue</p>
              <h2>No media loaded in this view yet</h2>
              <p>Search a real client or job after native uploads populate the media repository.</p>
            </article>
          ) : null}
        </div>
      </section>
    );
  }

  function renderReports(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Reports</h1>
            <p>Checklist to branded PDF, ready for closeout receipt attachments.</p>
          </div>
          <div className="nexops-inline-actions">
            <input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} />
            <button type="button" onClick={() => void refreshReports()}>Refresh reports</button>
            <button type="button" onClick={() => void createReport()}>Generate report</button>
          </div>
        </div>
        <article className="nexops-module-card wide">
          <p className="eyebrow">Latest report</p>
          <h2>{report?.title ?? "No report generated in this session yet"}</h2>
          <p>{report ? `${report.status} report ${report.id}` : "Create a checklist, search media, then generate a report."}</p>
          {reportUrl ? <a href={reportUrl} target="_blank" rel="noreferrer">Open PDF</a> : null}
        </article>
        <ul className="nexops-record-list">
          {reports.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.title}</strong>
                <small>{entry.visitId ? `Visit ${entry.visitId}` : `Job ${entry.jobId}`}</small>
              </div>
              <mark>{entry.status}</mark>
              <a href={`/api/fielddocs/reports/${encodeURIComponent(entry.id)}/pdf?tenantId=${encodeURIComponent(operatorContext.tenantId)}`} target="_blank" rel="noreferrer">PDF</a>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  function renderTemplatesPanel(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Checklist Templates</h1>
            <p>Generalized library with explicit property-field vs visit-field storage rails.</p>
          </div>
          <div className="nexops-inline-actions">
            <button className="nexops-link-button" type="button" onClick={() => void refreshTemplates()}>Refresh</button>
            <button type="button" onClick={() => void createChecklist()}>Create visit checklist</button>
          </div>
        </div>
        <div className="nexops-two-column">
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Library</p>
              <h2>{template?.title ?? "No templates found"}</h2>
              <p>{template?.description ?? "Create reusable NexCam templates, then launch visit checklists from them."}</p>
              {template ? (
                <div className="nexops-request-summary-grid">
                  <article>
                    <h3>{template.propertyPersistentCount} property fields</h3>
                    <p>Carry forward on the next visit for this exact property.</p>
                    <small>{template.sections.join(", ")}</small>
                  </article>
                  <article>
                    <h3>{template.visitFreshCount} visit fields</h3>
                    <p>Always blank when a new visit checklist starts.</p>
                    <small>{template.fieldTypes?.join(", ") ?? "Mixed field types"}</small>
                  </article>
                </div>
              ) : null}
            </article>
            <ul className="nexops-record-list">
              {templates.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.itemCount} fields - {item.appliesTo.replaceAll("_", " ")} - {item.system ? "Seeded template" : "Owner template"}</small>
                  </div>
                  <mark>{item.sections.length} sections</mark>
                  <button className="nexops-link-button" type="button" onClick={() => setSelectedTemplateId(item.id)}>Use</button>
                </li>
              ))}
            </ul>
          </section>
          <section className="nexops-module-page">
            <article className="nexops-module-card wide nexops-request-builder-card">
              <p className="eyebrow">New reusable template</p>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Title</span>
                  <input value={templateDraft.title} onChange={(event) => setTemplateDraft((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Slug</span>
                  <input value={templateDraft.slug} onChange={(event) => setTemplateDraft((current) => ({ ...current, slug: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Applies to</span>
                  <select value={templateDraft.appliesTo} onChange={(event) => setTemplateDraft((current) => ({ ...current, appliesTo: event.target.value as typeof current.appliesTo }))}>
                    <option value="visit">Visit</option>
                    <option value="job">Job</option>
                    <option value="job_or_visit">Job or visit</option>
                  </select>
                </label>
                <label className="nexops-field">
                  <span>Description</span>
                  <input value={templateDraft.description} onChange={(event) => setTemplateDraft((current) => ({ ...current, description: event.target.value }))} />
                </label>
              </div>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Field label</span>
                  <input value={draftField.label} onChange={(event) => setDraftField((current) => ({ ...current, label: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Section</span>
                  <input value={draftField.section} onChange={(event) => setDraftField((current) => ({ ...current, section: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Field type</span>
                  <select value={draftField.type} onChange={(event) => setDraftField((current) => ({ ...current, type: event.target.value as typeof current.type }))}>
                    <option value="free_text">Free text</option>
                    <option value="pass_fail">Pass / fail</option>
                    <option value="count">Count</option>
                    <option value="measurement">Measurement</option>
                    <option value="multi_select">Multi-select</option>
                    <option value="photo_attachment">Photo attachment</option>
                  </select>
                </label>
                <label className="nexops-field">
                  <span>Memory rail</span>
                  <select value={draftField.memory} onChange={(event) => setDraftField((current) => ({ ...current, memory: event.target.value as typeof current.memory }))}>
                    <option value="visit">Visit field</option>
                    <option value="property">Property field</option>
                  </select>
                </label>
                <label className="nexops-field">
                  <span>Help text</span>
                  <input value={draftField.helpText} onChange={(event) => setDraftField((current) => ({ ...current, helpText: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Unit (optional)</span>
                  <input value={draftField.unit} onChange={(event) => setDraftField((current) => ({ ...current, unit: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Options (comma separated)</span>
                  <input value={draftField.optionsText} onChange={(event) => setDraftField((current) => ({ ...current, optionsText: event.target.value }))} />
                </label>
                <label className="nexops-field nexcam-checkbox-field">
                  <span>Required</span>
                  <input type="checkbox" checked={draftField.required} onChange={(event) => setDraftField((current) => ({ ...current, required: event.target.checked }))} />
                </label>
                <label className="nexops-field nexcam-checkbox-field">
                  <span>Photo required by default</span>
                  <input type="checkbox" checked={draftField.photoRequiredDefault} onChange={(event) => setDraftField((current) => ({ ...current, photoRequiredDefault: event.target.checked }))} />
                </label>
              </div>
              <article className="nexops-module-card wide">
                <p className="eyebrow">Sections</p>
                <ul className="nexops-mini-list nexcam-template-draft-fields">
                  {draftSections.map((section) => (
                    <li key={section.id}>
                      <span>
                        <strong>{section.title}</strong>
                        <small>{section.allowNa ? "Can be marked N/A on live checklists" : "Always active on live checklists"}</small>
                      </span>
                      <span className="nexops-inline-actions">
                        <button className="nexops-link-button" type="button" onClick={() => toggleDraftSectionAllowNa(section.id)}>
                          {section.allowNa ? "Disable N/A" : "Allow N/A"}
                        </button>
                        {draftSections.length > 1 ? (
                          <button className="nexops-link-button" type="button" onClick={() => removeDraftSection(section.id)}>Remove</button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
              <div className="nexops-inline-actions">
                <button className="nexops-link-button" type="button" onClick={addDraftField}>Add field</button>
                <button type="button" onClick={() => void saveTemplate()}>Save template</button>
              </div>
              <ul className="nexops-mini-list nexcam-template-draft-fields">
                {draftFields.map((field) => (
                  <li key={field.id}>
                    <strong>{field.label}</strong>
                    <span>{field.section} - {formatFieldType(field)} - {field.memory}{field.required ? " - required" : ""}{field.photoRequiredDefault ? " - photo required" : ""}</span>
                    <button className="nexops-link-button" type="button" onClick={() => removeDraftField(field.id)}>Remove</button>
                  </li>
                ))}
                {!draftFields.length ? (
                  <li>
                    <strong>No draft fields yet</strong>
                    <span>Add the property-field and visit-field mix first, then save the reusable template.</span>
                  </li>
                ) : null}
              </ul>
            </article>
            <article className="nexops-module-card wide nexops-request-builder-card">
              <p className="eyebrow">Report templates</p>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Title</span>
                  <input value={reportTemplateDraft.title} onChange={(event) => setReportTemplateDraft((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Default report title</span>
                  <input value={reportTemplateDraft.defaultReportTitle} onChange={(event) => setReportTemplateDraft((current) => ({ ...current, defaultReportTitle: event.target.value }))} />
                </label>
                <label className="nexops-field nexcam-checkbox-field">
                  <span>Watermark on by default</span>
                  <input type="checkbox" checked={reportTemplateDraft.watermarkByDefault} onChange={(event) => setReportTemplateDraft((current) => ({ ...current, watermarkByDefault: event.target.checked }))} />
                </label>
              </div>
              <ul className="nexops-mini-list nexcam-template-draft-fields">
                {reportTemplateSections.map((section, index) => (
                  <li key={section.id}>
                    <div className="nexops-request-builder-grid">
                      <label className="nexops-field">
                        <span>Section label</span>
                        <input value={section.label} onChange={(event) => setReportTemplateSections((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, label: event.target.value } : entry))} />
                      </label>
                      <label className="nexops-field">
                        <span>Default text</span>
                        <textarea rows={3} value={section.defaultText} onChange={(event) => setReportTemplateSections((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, defaultText: event.target.value } : entry))} />
                      </label>
                    </div>
                    <div className="nexops-inline-actions">
                      {textSnippets.map((snippet) => {
                        const selected = section.snippetIds.includes(snippet.id);
                        return (
                          <button
                            key={`${section.id}-${snippet.id}`}
                            className={selected ? "active" : "nexops-link-button"}
                            type="button"
                            onClick={() => setReportTemplateSections((current) => current.map((entry, entryIndex) => entryIndex === index ? {
                              ...entry,
                              snippetIds: selected
                                ? entry.snippetIds.filter((id) => id !== snippet.id)
                                : [...entry.snippetIds, snippet.id]
                            } : entry))}
                          >
                            {snippet.label}
                          </button>
                        );
                      })}
                      <button className="nexops-link-button" type="button" onClick={() => setReportTemplateSections((current) => current.length === 1 ? current : current.filter((_, entryIndex) => entryIndex !== index))}>Remove section</button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="nexops-inline-actions">
                <button className="nexops-link-button" type="button" onClick={() => setReportTemplateSections((current) => [...current, { id: `section_${crypto.randomUUID()}`, label: "New section", defaultText: "", snippetIds: [] }])}>Add report section</button>
                <button type="button" onClick={() => void saveReportTemplate()}>Save report template</button>
              </div>
              <ul className="nexops-record-list">
                {reportTemplates.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{entry.title}</strong>
                      <small>{entry.sections.length} sections - default title: {entry.defaultReportTitle}</small>
                    </div>
                    <mark>{entry.watermarkByDefault ? "Watermark on" : "Watermark optional"}</mark>
                    <button className="nexops-link-button" type="button" onClick={() => {
                      setSelectedReportTemplateId(entry.id);
                      setReportTitle(entry.defaultReportTitle);
                      setWatermarkEnabled(entry.watermarkByDefault);
                    }}>Use</button>
                  </li>
                ))}
              </ul>
            </article>
            <article className="nexops-module-card wide nexops-request-builder-card">
              <p className="eyebrow">Text snippets</p>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Label</span>
                  <input value={snippetDraft.label} onChange={(event) => setSnippetDraft((current) => ({ ...current, label: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Snippet text</span>
                  <textarea rows={3} value={snippetDraft.bodyText} onChange={(event) => setSnippetDraft((current) => ({ ...current, bodyText: event.target.value }))} />
                </label>
              </div>
              <div className="nexops-inline-actions">
                <button type="button" onClick={() => void saveTextSnippet()}>Save snippet</button>
              </div>
              <ul className="nexops-record-list">
                {textSnippets.map((snippet) => (
                  <li key={snippet.id}>
                    <div>
                      <strong>{snippet.label}</strong>
                      <small>{snippet.bodyText}</small>
                    </div>
                    <mark>Reusable</mark>
                    <button className="nexops-link-button" type="button" onClick={() => toggleSnippetSelection(snippet.id)}>
                      {selectedSnippetIds.includes(snippet.id) ? "Selected" : "Select"}
                    </button>
                  </li>
                ))}
              </ul>
            </article>
            <article className="nexops-module-card wide nexops-request-builder-card">
              <p className="eyebrow">Job-type bundles</p>
              <div className="nexops-request-builder-grid">
                <label className="nexops-field">
                  <span>Bundle label</span>
                  <input value={bundleDraft.label} onChange={(event) => setBundleDraft((current) => ({ ...current, label: event.target.value }))} />
                </label>
                <label className="nexops-field">
                  <span>Job type key</span>
                  <input value={bundleDraft.jobTypeKey} onChange={(event) => setBundleDraft((current) => ({ ...current, jobTypeKey: event.target.value }))} placeholder="pool_leak_detection" />
                </label>
                <label className="nexops-field">
                  <span>Checklist template</span>
                  <select value={bundleDraft.checklistTemplateId} onChange={(event) => setBundleDraft((current) => ({ ...current, checklistTemplateId: event.target.value }))}>
                    <option value="">Choose checklist</option>
                    {templates.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
                  </select>
                </label>
                <label className="nexops-field">
                  <span>Report template</span>
                  <select value={bundleDraft.reportTemplateId} onChange={(event) => setBundleDraft((current) => ({ ...current, reportTemplateId: event.target.value }))}>
                    <option value="">Choose report template</option>
                    {reportTemplates.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
                  </select>
                </label>
                <label className="nexops-field nexcam-checkbox-field">
                  <span>Active</span>
                  <input type="checkbox" checked={bundleDraft.active} onChange={(event) => setBundleDraft((current) => ({ ...current, active: event.target.checked }))} />
                </label>
              </div>
              <div className="nexops-inline-actions">
                <button type="button" onClick={() => void saveBundle()}>Save bundle</button>
              </div>
              <ul className="nexops-record-list">
                {bundles.map((bundle) => (
                  <li key={bundle.id}>
                    <div>
                      <strong>{bundle.label}</strong>
                      <small>{bundle.jobTypeKey} - checklist {bundle.checklistTemplateId} - report {bundle.reportTemplateId}</small>
                    </div>
                    <mark>{bundle.active ? "Active" : "Inactive"}</mark>
                    <span />
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </div>
      </section>
    );
  }

  function renderPhotosPanel(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Photos & Media</h1>
            <p>Visit-scoped uploads, AI tags, and generic content search over the native media rail.</p>
          </div>
          <div className="nexops-inline-actions">
            <input value={mediaQuery} onChange={(event) => setMediaQuery(event.target.value)} placeholder="Deborah Justice" />
            <button className="nexops-link-button" type="button" onClick={() => void refreshRecentMedia()}>Refresh recent</button>
            <button type="button" onClick={() => void searchMedia()}>Search media</button>
          </div>
        </div>
        <article className="nexops-module-card wide">
          <p className="eyebrow">Staff filters</p>
          <div className="nexops-request-builder-grid">
            <label className="nexops-field">
              <span>Client</span>
              <select value={clientFilterId} onChange={(event) => setClientFilterId(event.target.value)}>
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{clientDisplayName(client)}</option>
                ))}
              </select>
            </label>
            <label className="nexops-field">
              <span>From</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="nexops-field">
              <span>To</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label className="nexops-check-field inline">
              <input type="checkbox" checked={includeTrashed} onChange={(event) => setIncludeTrashed(event.target.checked)} />
              Include tenant trash
            </label>
          </div>
        </article>
        <div className="nexops-two-column">
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Recent visit media</p>
              <h2>{recentMedia.length ? `${recentMedia.length} items in this context` : "No media in this context yet"}</h2>
              <p>Media stays grouped by property, job, and dated visit so one job never becomes a flat pile.</p>
            </article>
            <div className="nexcam-media-grid">
              {recentMedia.map((hit) => renderMediaCard(hit, `Recent ${hit.type}`))}
            </div>
          </section>
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Generic content search</p>
              <h2>{mediaHits.length ? `${mediaHits.length} match${mediaHits.length === 1 ? "" : "es"} for "${mediaQuery}"` : "Search by content, tag, or context"}</h2>
              <p>Search reads the same AI caption, AI tags, and manual tags Nexi can query conversationally later.</p>
            </article>
            <div className="nexcam-media-grid">
              {mediaHits.map((hit) => renderMediaCard(hit, "Search match"))}
              {!mediaHits.length && !recentMedia.length ? (
                <article className="nexops-module-card">
                  <p className="eyebrow">Unresolved queue</p>
                  <h2>No media loaded in this view yet</h2>
                  <p>Search a real client or visit after uploads populate the native media repository.</p>
                </article>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderReportsPanel(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Reports</h1>
            <p>Checklist to branded PDF, ready for closeout receipt attachments.</p>
          </div>
          <div className="nexops-inline-actions">
            <button className="nexops-link-button" type="button" onClick={() => void refreshReports()}>Refresh reports</button>
            <button type="button" onClick={() => void createReport()}>Generate report</button>
          </div>
        </div>
        <article className="nexops-module-card wide">
          <p className="eyebrow">Staff filters</p>
          <div className="nexops-request-builder-grid">
            <label className="nexops-field">
              <span>Client</span>
              <select value={clientFilterId} onChange={(event) => setClientFilterId(event.target.value)}>
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{clientDisplayName(client)}</option>
                ))}
              </select>
            </label>
            <label className="nexops-field">
              <span>From</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="nexops-field">
              <span>To</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label className="nexops-field">
              <span>Report type</span>
              <select value={reportKind} onChange={(event) => setReportKind(event.target.value as "field_report" | "ai_recap")}>
                <option value="field_report">Field report</option>
                <option value="ai_recap">AI recap</option>
              </select>
            </label>
            <label className="nexops-field">
              <span>Report template</span>
              <select
                value={selectedReportTemplateId}
                onChange={(event) => {
                  const nextTemplateId = event.target.value;
                  const nextTemplate = reportTemplates.find((entry) => entry.id === nextTemplateId);
                  setSelectedReportTemplateId(nextTemplateId);
                  if (nextTemplate) {
                    setReportTitle(nextTemplate.defaultReportTitle);
                    setWatermarkEnabled(nextTemplate.watermarkByDefault);
                  }
                }}
              >
                <option value="">No template</option>
                {reportTemplates.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
              </select>
            </label>
          </div>
        </article>
        <div className="nexops-two-column">
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Generate</p>
              <h2>{report?.title ?? "Create the visit report from the completed checklist"}</h2>
              <label className="nexops-field">
                <span>Report title</span>
                <input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} />
              </label>
              <div className="nexops-inline-actions">
                {textSnippets.map((snippet) => (
                  <button
                    key={snippet.id}
                    type="button"
                    className={selectedSnippetIds.includes(snippet.id) ? "active" : "nexops-link-button"}
                    onClick={() => toggleSnippetSelection(snippet.id)}
                  >
                    {snippet.label}
                  </button>
                ))}
              </div>
              <label className="nexops-check-field inline">
                <input type="checkbox" checked={watermarkEnabled} onChange={(event) => setWatermarkEnabled(event.target.checked)} />
                Add tenant watermark on export
              </label>
              <p>{report ? `${report.status} report ${report.id} ready for the closeout receipt rail.` : "Use the current context and checklist to generate the report PDF."}</p>
              <div className="nexops-inline-actions">
                {reportUrl ? <a className="nexops-link-button" href={reportUrl} target="_blank" rel="noreferrer">Open latest PDF</a> : null}
              </div>
            </article>
          </section>
          <section className="nexops-module-page">
            <article className="nexops-module-card wide">
              <p className="eyebrow">Recent reports</p>
              <ul className="nexops-record-list">
                {reports.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{entry.title}</strong>
                      <small>{entry.visitId ? `Visit ${entry.visitId}` : `Job ${entry.jobId}`} - {entry.kind === "ai_recap" ? "AI recap" : "Field report"}</small>
                    </div>
                    <mark>{entry.status}</mark>
                    <a className="nexops-link-button" href={`/api/fielddocs/reports/${encodeURIComponent(entry.id)}/pdf?tenantId=${encodeURIComponent(operatorContext.tenantId)}`} target="_blank" rel="noreferrer">PDF</a>
                  </li>
                ))}
                {!reports.length ? (
                  <li>
                    <div>
                      <strong>No reports in this context yet</strong>
                      <small>Complete a checklist, then generate the branded PDF here.</small>
                    </div>
                    <mark>pending</mark>
                    <span />
                  </li>
                ) : null}
              </ul>
            </article>
          </section>
        </div>
      </section>
    );
  }

  function renderActiveModule(): React.ReactElement {
    if (activeModule === "templates") return renderTemplatesPanel();
    if (activeModule === "photos") return renderPhotosPanel();
    if (activeModule === "reports") return renderReportsPanel();
    return renderOverview();
  }

  const tenantName = tenantDisplayName(tenantBranding, operatorContext.tenantId);

  return (
    <main className="nexops-app nexcam-app" style={style}>
      <aside className="nexops-app-sidebar" aria-label="NexCam navigation">
        <div className="nexops-app-logo">
          <SidebarBrandStack product="nexcam" branding={tenantBranding} tenantId={operatorContext.tenantId} />
        </div>
        <button className="nexops-create-button" type="button" onClick={() => void createChecklist()}>Start Checklist</button>
        <nav className="nexops-nav">
          {NEXCAM_MODULES.map((item) => (
            <button className={item.id === activeModule ? "active" : ""} type="button" key={item.id} onClick={() => setModule(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="nexops-web-main">
        <header className="nexops-web-topbar">
          <div className="nexops-web-brand">
            <ProductLogo product="nexcam" className="nexops-header-product-logo" alt="NexCam" />
            <div className="nexops-web-brand-copy">
              <strong>NexCam</strong>
              <span>{tenantName}</span>
            </div>
          </div>
          <div className="nexops-web-tools">
            <span>{status}</span>
            <span>{props.user.email ?? "Operator"}</span>
            <button type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button>
          </div>
        </header>
        {renderActiveModule()}
      </section>
      {selectedMedia ? (
        <>
          <button className="nexops-overlay-backdrop" type="button" aria-label="Close NexCam photo review" onClick={closeMediaReview} />
          <section className="nexops-overlay-panel nexcam-review-panel" role="dialog" aria-modal="true" aria-label="NexCam photo review">
            <div className="nexops-overlay-head">
              <div>
                <p className="eyebrow">Photo review</p>
                <h2>{selectedMedia.aiCaption || selectedMedia.id}</h2>
                <small>{mediaContextLabel(selectedMedia)}</small>
              </div>
              <button type="button" className="nexops-link-button" onClick={closeMediaReview}>Close</button>
            </div>
            <div className="nexcam-review-layout">
              <div className="nexcam-review-stage-card">
                <div className="nexops-inline-actions">
                  <button type="button" className={drawMode ? "active" : ""} onClick={() => setDrawMode((current) => !current)}>
                    {drawMode ? "Stop drawing" : "Draw markup"}
                  </button>
                  <button type="button" className="nexops-link-button" onClick={removeLastMarkup} disabled={!mediaAnnotationsDraft.length}>
                    Remove last markup
                  </button>
                  <a className="nexops-link-button" href={`/api/media/${encodeURIComponent(selectedMedia.id)}?tenantId=${encodeURIComponent(operatorContext.tenantId)}`} target="_blank" rel="noreferrer">Open original</a>
                </div>
                <div
                  ref={mediaStageRef}
                  className={`nexcam-review-stage${drawMode ? " draw-mode" : ""}`}
                  onPointerDown={beginMediaDraw}
                  onPointerMove={updateMediaDraw}
                  onPointerUp={finishMediaDraw}
                  onPointerLeave={finishMediaDraw}
                >
                  <img
                    className="nexcam-review-image"
                    src={`/api/media/${encodeURIComponent(selectedMedia.id)}?tenantId=${encodeURIComponent(operatorContext.tenantId)}`}
                    alt={selectedMedia.aiCaption || selectedMedia.id}
                  />
                  <svg className="nexcam-review-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {mediaAnnotationsDraft.map((annotation) => (
                      <polyline
                        key={annotation.id}
                        points={annotationPolyline(annotation.points)}
                        fill="none"
                        stroke={annotation.color ?? "#106060"}
                        strokeWidth={1.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                    {drawingPath?.length ? (
                      <polyline
                        points={annotationPolyline(drawingPath)}
                        fill="none"
                        stroke="#28d7ff"
                        strokeWidth={1.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="2 2"
                      />
                    ) : null}
                  </svg>
                </div>
                <small>{selectedMedia.exif?.ts ? `Captured ${new Date(selectedMedia.exif.ts).toLocaleString()}` : "No capture timestamp"} · {selectedMedia.exif?.gps ? `${selectedMedia.exif.gps.lat.toFixed(4)}, ${selectedMedia.exif.gps.lng.toFixed(4)}` : "No GPS on file"}</small>
              </div>
              <div className="nexcam-review-sidebar">
                <article className="nexops-module-card wide">
                  <p className="eyebrow">Tags</p>
                  <h3>{selectedMedia.aiTags.length ? selectedMedia.aiTags.join(", ") : "No AI tags yet"}</h3>
                  <small>Search and Nexi read this same tag/caption rail.</small>
                  <label className="nexops-field">
                    <span>Manual tags</span>
                    <input value={mediaManualTagsDraft} onChange={(event) => setMediaManualTagsDraft(event.target.value)} placeholder="pool, leak, equipment pad" />
                  </label>
                  <label className="nexops-check-field inline">
                    <input type="checkbox" checked={mediaHiddenFromClientDraft} onChange={(event) => setMediaHiddenFromClientDraft(event.target.checked)} />
                    Hide this single photo from the client
                  </label>
                  <div className="nexops-inline-actions">
                    <button type="button" className="nexops-link-button" onClick={() => void setMediaTrashState(!selectedMedia.trashedAt)} disabled={mediaReviewSaving}>
                      {selectedMedia.trashedAt ? "Restore from trash" : "Move to tenant trash"}
                    </button>
                  </div>
                  {selectedMedia.purgeAfter ? <small>Trash purges after {new Date(selectedMedia.purgeAfter).toLocaleDateString()} unless restored.</small> : null}
                </article>
                <article className="nexops-module-card wide">
                  <p className="eyebrow">Comments</p>
                  <ul className="nexops-mini-list nexcam-comment-list">
                    {(selectedMedia.comments ?? []).map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.author ?? "Field note"}</strong>
                        <span>{entry.text}</span>
                        <small>{new Date(entry.createdAt).toLocaleString()}</small>
                      </li>
                    ))}
                    {!(selectedMedia.comments ?? []).length ? (
                      <li>
                        <strong>No comments yet</strong>
                        <span>Add a job-specific note without editing the AI caption.</span>
                      </li>
                    ) : null}
                  </ul>
                  <label className="nexops-field">
                    <span>Add comment</span>
                    <textarea rows={4} value={mediaCommentDraft} onChange={(event) => setMediaCommentDraft(event.target.value)} />
                  </label>
                  <div className="nexops-inline-actions">
                    <button type="button" onClick={() => void saveMediaReview()} disabled={mediaReviewSaving}>
                      {mediaReviewSaving ? "Saving..." : "Save review"}
                    </button>
                  </div>
                </article>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

function SchedulePanel(props: { tenantId: string }): React.ReactElement {
  const [view, setView] = useState<"day" | "week" | "map">("day");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [visits, setVisits] = useState<ScheduledVisit[]>([]);
  const [status, setStatus] = useState("Loading schedule...");

  useEffect(() => {
    let cancelled = false;
    const range = dayRange(day, view);
    setStatus("Loading schedule...");
    fetch(`/api/scheduling/calendar?tenantId=${encodeURIComponent(props.tenantId)}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)
      .then((response) => response.json() as Promise<CalendarResponse>)
      .then((body) => {
        if (cancelled) {
          return;
        }
        if (!body.ok) {
          setStatus(body.error ?? "Schedule unavailable.");
          setVisits([]);
          return;
        }
        setVisits(body.visits ?? []);
        if (!(body.visits ?? []).length) {
          setStatus("No visits in this window yet.");
          return;
        }
        setStatus("");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("Schedule API unreachable.");
          setVisits([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [day, props.tenantId, view]);

  return (
    <aside className="schedule-card">
      <div className="schedule-heading">
        <div>
          <p className="eyebrow">M3 Scheduling</p>
          <h2>Calendar Board</h2>
        </div>
        <input aria-label="Schedule date" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
      </div>
      <div className="view-tabs" aria-label="Calendar views">
        {(["day", "week", "map"] as const).map((candidate) => (
          <button
            className={candidate === view ? "active" : ""}
            key={candidate}
            type="button"
            onClick={() => setView(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
      {status ? <p className="schedule-status">{status}</p> : null}
      <div className={`visit-list ${view}`}>
        {visits.map((visit) => (
          <article className="visit-card" key={visit.id}>
            <div>
              <p className="visit-time">{formatVisitTime(visit.start)} - {formatVisitTime(visit.end)}</p>
              <h3>{visit.title}</h3>
              <p>{visit.location?.label ?? "No location label"} - {visit.assignedTo.join(", ") || "Unassigned"}</p>
            </div>
            <span className="visit-status">{visitStatusLabel(visit)}</span>
            {view === "map" ? (
              <p className="map-line">
                {visit.location?.geo ? `${visit.location.geo.lat.toFixed(4)}, ${visit.location.geo.lng.toFixed(4)}` : "No coordinates yet"}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </aside>
  );
}

function ContentQueuePanel(props: { tenantId: string }): React.ReactElement {
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [status, setStatus] = useState("Loading content queue...");
  const [workingId, setWorkingId] = useState("");

  async function refresh(): Promise<void> {
    setStatus("Loading content queue...");
    try {
      const body = await fetch(`/api/content/queue?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<ContentQueueResponse>);
      if (!body.ok) {
        setDrafts([]);
        setStatus(body.error ?? "Content queue unavailable.");
        return;
      }
      const pending = (body.drafts ?? []).filter((draft) => draft.status === "approval_pending");
      setDrafts(pending);
      setStatus(pending.length ? "Publishing stays parked until you approve it." : "No content drafts are waiting right now.");
    } catch {
      setDrafts([]);
      setStatus("Content queue API unreachable.");
    }
  }

  async function decide(draftId: string, action: "approve" | "reject"): Promise<void> {
    setWorkingId(draftId);
    setStatus(action === "approve" ? "Approving draft..." : "Rejecting draft...");
    try {
      const body = await fetch(`/api/content/drafts/${encodeURIComponent(draftId)}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      setStatus(body.ok ? `Draft ${action === "approve" ? "approved" : "rejected"}.` : body.error ?? "Content decision failed.");
      await refresh();
    } catch {
      setStatus("Content decision request failed.");
    } finally {
      setWorkingId("");
    }
  }

  useEffect(() => {
    void refresh();
  }, [props.tenantId]);

  return (
    <aside className="content-card">
      <div className="schedule-heading">
        <div>
          <p className="eyebrow">M5 Content</p>
          <h2>Content Queue</h2>
        </div>
        <button className="refresh-button" type="button" onClick={() => void refresh()}>Refresh</button>
      </div>
      <p className="schedule-status">{status}</p>
      <div className="content-list">
        {drafts.map((draft) => (
          <article className="content-draft" key={draft.id}>
            <div className="content-draft-head">
              <span>{draft.kind.replace("_", " ")}</span>
              <span>{new Date(draft.createdAt).toLocaleDateString()}</span>
            </div>
            <h3>{draft.title}</h3>
            <p>{draft.body.split(/\n+/)[0]}</p>
            <div className="content-actions">
              <button type="button" disabled={workingId === draft.id} onClick={() => void decide(draft.id, "approve")}>Approve</button>
              <button className="secondary" type="button" disabled={workingId === draft.id} onClick={() => void decide(draft.id, "reject")}>Reject</button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}

function canExecuteApproval(item: ApprovalQueueItem): boolean {
  return (item.execute.service === "comms" && item.execute.op === "sendEmail")
    || (item.execute.service === "crm" && item.execute.op === "createClient")
    || (item.execute.service === "intake" && item.execute.op === "provisionTenant");
}

function approvalPrimaryLabel(item: ApprovalQueueItem): string {
  if (item.execute.service === "comms" && item.execute.op === "sendEmail") {
    return "Approve & send";
  }
  if (item.execute.service === "crm" && item.execute.op === "createClient") {
    return "Approve & create";
  }
  if (item.execute.service === "intake" && item.execute.op === "provisionTenant") {
    return "Approve & provision";
  }
  return "Approve";
}

function approvalKindLabel(item: ApprovalQueueItem): string {
  return item.kind.replaceAll("_", " ");
}

function responseQueuedApproval(sources: Source[] | undefined): boolean {
  return (sources ?? []).some((source) => source.ref.startsWith("appr_") || source.label.startsWith("ApprovalQueue "));
}

function ApprovalQueuePanel(props: { tenantId: string }): React.ReactElement {
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [status, setStatus] = useState("Loading approvals...");
  const [workingId, setWorkingId] = useState("");

  async function refresh(): Promise<void> {
    setStatus("Loading approvals...");
    try {
      const body = await fetch(`/api/approval-queue?tenantId=${encodeURIComponent(props.tenantId)}&includeHistory=true`)
        .then((response) => response.json() as Promise<ApprovalQueueResponse>);
      if (!body.ok) {
        setItems([]);
        setStatus(body.error ?? "Approval queue unavailable.");
        return;
      }
      const nextItems = body.items ?? [];
      const pending = nextItems.filter((item) => item.status === "pending");
      const history = nextItems.filter((item) => item.status !== "pending");
      setItems(nextItems);
      setStatus(`${pending.length} pending. ${history.length} historical.`);
    } catch {
      setItems([]);
      setStatus("Approval queue API unreachable.");
    }
  }

  async function approve(item: ApprovalQueueItem): Promise<void> {
    setWorkingId(item.id);
    setStatus(canExecuteApproval(item) ? "Approving and running..." : "Approving...");
    try {
      const approved = await fetch(`/api/approval-queue/${encodeURIComponent(item.id)}/approve`, {
        method: "POST"
      }).then((response) => response.json() as Promise<ApprovalActionResponse>);
      if (!approved.ok) {
        setStatus(approved.error ?? "Approval failed.");
        return;
      }
      if (canExecuteApproval(item)) {
        const executed = await fetch(`/api/approval-queue/${encodeURIComponent(item.id)}/execute`, {
          method: "POST"
        }).then((response) => response.json() as Promise<ApprovalActionResponse>);
        setStatus(executed.ok ? "Approved and completed." : executed.error ?? "Approved, but running it failed.");
        if (executed.ok && item.execute.service === "crm" && item.execute.op === "createClient") {
          window.dispatchEvent(new CustomEvent("nexops:crm-mutated"));
        }
      } else {
        setStatus("Approved.");
      }
      await refresh();
    } catch {
      setStatus("Approval request failed.");
    } finally {
      setWorkingId("");
    }
  }

  async function reject(item: ApprovalQueueItem): Promise<void> {
    setWorkingId(item.id);
    setStatus("Rejecting...");
    try {
      const body = await fetch(`/api/approval-queue/${encodeURIComponent(item.id)}/reject`, {
        method: "POST"
      }).then((response) => response.json() as Promise<ApprovalActionResponse>);
      setStatus(body.ok ? "Rejected." : body.error ?? "Reject failed.");
      await refresh();
    } catch {
      setStatus("Reject request failed.");
    } finally {
      setWorkingId("");
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    const handleQueued = () => void refresh();
    window.addEventListener("nexops:approval-queued", handleQueued);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("nexops:approval-queued", handleQueued);
    };
  }, [props.tenantId]);

  const pendingItems = items.filter((item) => item.status === "pending");
  const historicalItems = items.filter((item) => item.status !== "pending");

  function renderApprovalItem(item: ApprovalQueueItem): React.ReactElement {
    const isPending = item.status === "pending";
    return (
      <article className="content-draft approval-item" key={item.id}>
        <div className="content-draft-head">
          <span>{approvalKindLabel(item)}</span>
          <span>{isPending ? item.createdBy : item.status}</span>
        </div>
        <h3>{item.preview.title}</h3>
        <p>{item.preview.body.split(/\n+/).filter(Boolean).slice(0, 3).join(" ")}</p>
        {item.preview.mediaRefs?.length ? (
          <div className="approval-attachments">
            {item.preview.mediaRefs.map((ref) => <span key={ref}>{ref}</span>)}
          </div>
        ) : null}
        {item.decidedAt ? <p className="approval-decided">Decided {new Date(item.decidedAt).toLocaleString()}</p> : null}
        {isPending ? (
          <div className="content-actions">
            <button type="button" disabled={workingId === item.id} onClick={() => void approve(item)}>{approvalPrimaryLabel(item)}</button>
            <button className="secondary" type="button" disabled={workingId === item.id} onClick={() => void reject(item)}>Reject</button>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <aside className="approval-card">
      <div className="schedule-heading">
        <div>
          <p className="eyebrow">ApprovalQueue</p>
          <h2>Approvals</h2>
        </div>
        <button className="refresh-button" type="button" onClick={() => void refresh()}>Refresh</button>
      </div>
      <p className="schedule-status">{status}</p>
      <h3 className="queue-section-heading">Pending</h3>
      <div className="content-list">
        {pendingItems.length ? pendingItems.map(renderApprovalItem) : <p className="empty-state">No approvals are waiting right now.</p>}
      </div>
      <h3 className="queue-section-heading">Approved / Rejected History</h3>
      <div className="content-list">
        {historicalItems.length ? historicalItems.map(renderApprovalItem) : <p className="empty-state">No approval history yet.</p>}
      </div>
    </aside>
  );
}

function reputationUserMessage(error?: string): string {
  const message = error ?? "";
  if (/not allowed for this tenant|missing a tenant|missing a tenant role|role cannot perform|sign in is required/i.test(message)) {
    return "Reviews are not connected for this sign-in yet. I need this user set up as an Aquatrace owner or office admin, then your Google Business Profile connected, before I can pull reviews.";
  }
  if (/GBP OAuth|location identifiers|not configured|credential/i.test(message)) {
    return "Google reviews are not connected yet. Once your Google Business Profile is connected, this panel will show reviews and draft replies for approval.";
  }
  return message || "Review queue unavailable.";
}

function ReputationPanel(props: { tenantId: string; user: User }): React.ReactElement {
  const [reviews, setReviews] = useState<ReputationReview[]>([]);
  const [profiles, setProfiles] = useState<ReputationProfile[]>([]);
  const [status, setStatus] = useState("Loading review queue...");
  const [working, setWorking] = useState("");

  async function headers(): Promise<HeadersInit> {
    const token = await props.user.getIdToken();
    return { authorization: `Bearer ${token}`, "content-type": "application/json" };
  }

  async function refresh(): Promise<void> {
    setStatus("Loading review queue...");
    try {
      const body = await fetch(`/api/reputation/queue?tenantId=${encodeURIComponent(props.tenantId)}`, {
        headers: await headers()
      }).then((response) => response.json() as Promise<ReputationQueueResponse>);
      if (!body.ok) {
        setReviews([]);
        setProfiles([]);
        setStatus(reputationUserMessage(body.error));
        return;
      }
      setReviews(body.reviews ?? []);
      setProfiles(body.profiles ?? []);
      setStatus((body.reviews ?? []).length ? "Review replies stay parked until you approve them." : "No reviews are waiting right now.");
    } catch {
      setReviews([]);
      setProfiles([]);
      setStatus("Review queue API unreachable.");
    }
  }

  async function pollReviews(): Promise<void> {
    setWorking("poll");
    setStatus("Checking Google reviews...");
    try {
      const body = await fetch("/api/reputation/gbp/poll", {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<ReputationQueueResponse>);
      if (!body.ok) {
        setStatus(reputationUserMessage(body.error));
        return;
      }
      const count = body.imported?.length ?? 0;
      setStatus(count ? `Imported ${count} review${count === 1 ? "" : "s"}.` : body.blocker ?? "No new reviews found.");
      await refresh();
    } catch {
      setStatus("Review check request failed.");
    } finally {
      setWorking("");
    }
  }

  async function draftReply(reviewId: string): Promise<void> {
    setWorking(reviewId);
    setStatus("Drafting reply...");
    try {
      const body = await fetch(`/api/reputation/reviews/${encodeURIComponent(reviewId)}/reply/draft`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      setStatus(body.ok ? "Reply drafted and parked for approval." : body.error ?? "Reply draft failed.");
      await refresh();
    } catch {
      setStatus("Reply draft request failed.");
    } finally {
      setWorking("");
    }
  }

  useEffect(() => {
    void refresh();
  }, [props.tenantId, props.user]);

  return (
    <aside className="content-card reputation-card">
      <div className="schedule-heading">
        <div>
          <p className="eyebrow">M7 Reputation</p>
          <h2>Reviews</h2>
        </div>
        <button className="refresh-button" type="button" disabled={working === "poll"} onClick={() => void pollReviews()}>
          Check reviews
        </button>
      </div>
      <p className="schedule-status">{status}</p>
      <div className="content-list">
        {reviews.map((review) => (
          <article className="content-draft" key={review.id}>
            <div className="content-draft-head">
              <span>{review.rating}/5 stars</span>
              <span>{new Date(review.reviewedAt).toLocaleDateString()}</span>
            </div>
            <h3>{review.authorName}</h3>
            <p>{review.comment || "No public review text."}</p>
            <p className="review-state">Reply: {review.replyStatus.replace("_", " ")}</p>
            <div className="content-actions">
              <button type="button" disabled={working === review.id || review.replyStatus === "drafted"} onClick={() => void draftReply(review.id)}>
                Draft reply
              </button>
            </div>
          </article>
        ))}
        {profiles.map((profile) => (
          <article className="content-draft" key={profile.id}>
            <div className="content-draft-head">
              <span>Profile update</span>
              <span>{profile.status.replace("_", " ")}</span>
            </div>
            <h3>{profile.locationId}</h3>
            <p>Google Business Profile changes are approval-gated before publishing.</p>
          </article>
        ))}
      </div>
    </aside>
  );
}

function AuthGate(props: {
  auth: Auth | null;
  user: User | null;
  authReady: boolean;
  localAuthEnabled: boolean;
  localTenantId: string;
  localProfiles: LocalAuthProfileSummary[];
  onSignedIn: (user: User | null) => void;
}): React.ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (working) {
      return;
    }
    setWorking(true);
    setError("");
    try {
      if (props.localAuthEnabled) {
        const result = await signInWithLocalCredentials(email.trim(), props.localTenantId);
        props.onSignedIn(result);
      } else if (props.auth) {
        const result = await signInWithEmailAndPassword(props.auth, email.trim(), password);
        props.onSignedIn(result.user);
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : props.localAuthEnabled ? "Local sign-in failed." : "Firebase sign-in failed.");
    } finally {
      setWorking(false);
    }
  }

  if (!props.authReady) {
    return (
      <main className="shell">
        <section className="auth-card">
          <NexiIdentityMark className="auth-card-brand" caption="Nexi" />
          <p className="eyebrow">Nexi access</p>
          <h1>Checking session</h1>
          <p>Loading operator access.</p>
        </section>
      </main>
    );
  }

  if (props.user) {
    if (window.location.pathname.startsWith("/platform")) {
      return <PlatformConsole auth={props.auth} user={props.user} />;
    }
    if (window.location.pathname.startsWith("/nexcam")) {
      return <NexCamPage auth={props.auth} user={props.user} />;
    }
    if (window.location.pathname.startsWith("/nexreach")) {
      return (
        <Suspense fallback={<main className="shell"><section className="auth-card"><h1>Loading NexReach</h1></section></main>}>
          <NexReachPage auth={props.auth} user={props.user} />
        </Suspense>
      );
    }
    if (window.location.pathname.startsWith("/nexops")) {
      return <NexOpsWorkspace auth={props.auth} user={props.user} />;
    }
    return <NexiStandaloneChat auth={props.auth} user={props.user} />;
  }

  if (props.localAuthEnabled) {
    return (
      <main className="shell">
        <section className="auth-card">
          <ProductLogo product="nexops" className="auth-card-brand" alt="NexOps" />
          <p className="eyebrow">Aquatrace staff access</p>
          <h1>NexOps Sign-In</h1>
          <p>Use a local staff email to unlock the Aquatrace workspace for testing. Owner, office admin, and technician sessions stay role-scoped after sign-in.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              Email
              <input autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button type="submit" disabled={working || !email.trim()}>
              {working ? "Signing in..." : "Sign In"}
            </button>
          </form>
          <div className="auth-profile-hints" aria-label="Available local role accounts">
            {props.localProfiles.map((profile) => (
              <article key={profile.id}>
                <strong>{profile.label}</strong>
                <span>{profile.email}</span>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (!props.auth) {
    return (
      <main className="shell">
        <section className="auth-card">
          <NexiIdentityMark className="auth-card-brand" caption="Nexi" />
          <p className="eyebrow">Nexi access</p>
          <h1>Firebase config missing</h1>
          <p>The chat is locked until the Firebase web config is present in staging runtime variables.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="auth-card">
        <NexiIdentityMark className="auth-card-brand" caption="Nexi" />
        <p className="eyebrow">Aquatrace ops</p>
        <h1>Nexi Sign-In</h1>
        <p>Use your Firebase operator account to unlock the Job Desk.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button type="submit" disabled={working || !email.trim() || !password}>
            {working ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </section>
    </main>
  );
}

function PlatformConsole(props: { auth: Auth | null; user: User }): React.ReactElement {
  const [rows, setRows] = useState<PlatformTenantRow[]>([]);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [status, setStatus] = useState("Loading platform console...");
  const [workingTenant, setWorkingTenant] = useState("");

  async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await props.user.getIdToken();
    return fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      }
    });
  }

  async function refresh(): Promise<void> {
    setStatus("Loading platform console...");
    try {
      const [tenantBody, planBody] = await Promise.all([
        authedFetch("/api/platform/tenants").then((response) => response.json() as Promise<PlatformTenantResponse>),
        authedFetch("/api/platform/plans").then((response) => response.json() as Promise<PlatformPlansResponse>)
      ]);
      if (!tenantBody.ok || !planBody.ok) {
        setStatus(tenantBody.error ?? planBody.error ?? "Platform console unavailable.");
        return;
      }
      setRows(tenantBody.tenants ?? []);
      setPlans(planBody.plans ?? []);
      setStatus("");
    } catch {
      setStatus("Platform console could not reach the server.");
    }
  }

  async function runBackup(tenantId: string): Promise<void> {
    setWorkingTenant(tenantId);
    setStatus(`Running backup for ${tenantId}...`);
    try {
      const body = await authedFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}/backups/run`, { method: "POST", body: "{}" })
        .then((response) => response.json() as Promise<{ ok: boolean; backup?: { storageRef: string }; error?: string }>);
      setStatus(body.ok ? `Backup saved: ${body.backup?.storageRef ?? "storage file"}` : body.error ?? "Backup failed.");
      await refresh();
    } catch {
      setStatus("Backup request failed.");
    } finally {
      setWorkingTenant("");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <main className="shell platform-shell">
      <section className="platform-hero">
        <div>
          <p className="eyebrow">M13 Platform</p>
          <h1>Tenant Command Center</h1>
          <p className="signed-in">{props.user.email ?? "Platform operator"}</p>
        </div>
        <button className="sign-out" type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button>
      </section>

      <section className="plan-grid">
        {plans.map((plan) => (
          <article className="plan-card" key={plan.id}>
            <p className="eyebrow">{plan.id}</p>
            <h2>{plan.name}</h2>
            <p className="plan-price">${plan.monthlyUsd}/mo</p>
            <p>{plan.modules.join(", ")}</p>
          </article>
        ))}
      </section>

      {status ? <p className="schedule-status">{status}</p> : null}

      <section className="tenant-table">
        {rows.map((row) => (
          <article className="tenant-row" key={row.tenant.id}>
            <div>
              <p className="eyebrow">{row.tenant.id}</p>
              <h2>{row.tenant.name}</h2>
              <p>{row.plan.name} plan · {row.subscription?.status ?? "no subscription"} · ${row.cost.estimatedCostUsd.toFixed(4)} tracked</p>
            </div>
            <div className="adapter-pills">
              {row.adapterStatuses.map((adapter) => (
                <span className={adapter.ok ? "pill ok" : "pill warn"} key={adapter.adapter}>
                  {adapter.adapter}: {adapter.configured ? adapter.provider : "not set"}
                </span>
              ))}
            </div>
            <div className="tenant-actions">
              <a href={`/api/platform/tenants/${encodeURIComponent(row.tenant.id)}/export`} target="_blank" rel="noreferrer">Export</a>
              <button type="button" disabled={workingTenant === row.tenant.id} onClick={() => void runBackup(row.tenant.id)}>
                {workingTenant === row.tenant.id ? "Backing up..." : "Run backup"}
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function NexiStandaloneChat(props: { auth: Auth | null; user: User }): React.ReactElement {
  const [operatorContext, setOperatorContext] = useState<OperatorContext>(() => fallbackOperatorContext(props.user));
  const [operatorTheme, setOperatorTheme] = useState<OperatorUiTheme | null>(null);
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<NexiStandalonePendingApproval | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [working, setWorking] = useState(false);
  const [activeMedia, setActiveMedia] = useState<Source | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Voice off");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [lastVoiceLatencyMs, setLastVoiceLatencyMs] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NexOpsNotificationEntry[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationStatus, setNotificationStatus] = useState("");
  const [moduleSwitcherOpen, setModuleSwitcherOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const handsFreeRef = useRef(false);
  const voiceSessionRef = useRef<string | null>(null);
  const voiceWindow = window as VoiceWindow;
  const SpeechRecognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
  const speechSupported = Boolean(SpeechRecognition);
  const storedSessionKey = nexiStoredSessionKey(operatorContext.tenantId, props.user.uid);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    voiceSessionRef.current = voiceSessionId;
  }, [voiceSessionId]);

  useEffect(() => {
    let cancelled = false;
    loadOperatorContext(props.user)
      .then((context) => {
        if (!cancelled) {
          setOperatorContext(context);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOperatorContext(fallbackOperatorContext(props.user));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.user]);

  useEffect(() => {
    let cancelled = false;
    props.user.getIdToken()
      .then((idToken) => fetch(`/api/sites/operator-ui?tenantId=${encodeURIComponent(operatorContext.tenantId)}`, {
        headers: { authorization: `Bearer ${idToken}` }
      }))
      .then((response) => response.json() as Promise<OperatorUiThemeResponse>)
      .then((body) => {
        if (!cancelled && body.ok && body.theme) {
          setOperatorTheme(body.theme);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOperatorTheme(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId, props.user]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/tenant-branding?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
      .then((response) => response.json() as Promise<TenantBrandingResponse>)
      .then((body) => {
        if (!cancelled && body.ok && body.branding) {
          setTenantBranding(body.branding);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTenantBranding(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId]);

  useEffect(() => {
    document.body.classList.toggle("nexops-mobile-nav-open", mobileNavOpen);
    return () => {
      document.body.classList.remove("nexops-mobile-nav-open");
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const restored = parseNexiStoredSession(window.localStorage.getItem(storedSessionKey));
    if (!restored) {
      setConversationId(null);
      setPendingApproval(null);
      setMessages([]);
      setHistoryLoaded(true);
      return;
    }
    setConversationId(restored.conversationId);
    setPendingApproval(restored.pendingApproval);
    setHistoryLoaded(false);
    let cancelled = false;
    props.user.getIdToken()
      .then((idToken) => fetch(`/api/nexi/history?tenantId=${encodeURIComponent(operatorContext.tenantId)}&conversationId=${encodeURIComponent(restored.conversationId)}`, {
        headers: { authorization: `Bearer ${idToken}` }
      }))
      .then((response) => response.json() as Promise<NexiHistoryResponse>)
      .then((body) => {
        if (cancelled) {
          return;
        }
        if (!body.ok) {
          setHistoryLoaded(true);
          return;
        }
        setConversationId(body.conversationId ?? restored.conversationId);
        setPendingApproval(body.pendingApproval ?? restored.pendingApproval);
        setMessages(Array.isArray(body.messages) ? body.messages : []);
        setHistoryLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId, props.user, storedSessionKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !historyLoaded || !conversationId) {
      return;
    }
    window.localStorage.setItem(storedSessionKey, stringifyNexiStoredSession({
      conversationId,
      pendingApproval
    }));
  }, [conversationId, historyLoaded, pendingApproval, storedSessionKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !historyLoaded || conversationId) {
      return;
    }
    window.localStorage.removeItem(storedSessionKey);
  }, [conversationId, historyLoaded, storedSessionKey]);

  useEffect(() => {
    void loadNotifications();
    const reloadNotifications = () => void loadNotifications();
    window.addEventListener("nexops:crm-mutated", reloadNotifications);
    window.addEventListener("nexops:approval-queued", reloadNotifications);
    return () => {
      window.removeEventListener("nexops:crm-mutated", reloadNotifications);
      window.removeEventListener("nexops:approval-queued", reloadNotifications);
      recognitionRef.current?.stop();
      audioRef.current?.pause();
      ttsAbortRef.current?.abort();
    };
  }, [operatorContext.tenantId]);

  async function startVoiceSession(): Promise<string | null> {
    if (voiceSessionRef.current) {
      return voiceSessionRef.current;
    }
    try {
      const response = await fetch("/api/voice/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          tenantUserId: operatorContext.tenantUserId
        })
      });
      const body = await response.json() as VoiceSessionResponse;
      if (!body.ok || !body.session) {
        throw new Error(body.error ?? "Voice session did not start.");
      }
      setVoiceSessionId(body.session.id);
      voiceSessionRef.current = body.session.id;
      return body.session.id;
    } catch {
      setVoiceStatus("Voice session did not start. Basic voice still works.");
      return null;
    }
  }

  async function updateVoiceSession(path: string, body?: unknown): Promise<void> {
    const sessionId = voiceSessionRef.current;
    if (!sessionId) {
      return;
    }
    await fetch(`/api/voice/session/${encodeURIComponent(sessionId)}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? "{}" : JSON.stringify(body)
    }).catch(() => undefined);
  }

  function finishSpokenReply(status = "Voice ready"): void {
    setSpeaking(false);
    ttsAbortRef.current = null;
    if (handsFreeRef.current) {
      void updateVoiceSession("/listen");
      setVoiceStatus("Listening for the next question");
      startDictation(true);
      return;
    }
    setVoiceStatus(status);
  }

  async function speakAssistantWithBrowserVoice(text: string): Promise<boolean> {
    if (typeof window === "undefined" || typeof SpeechSynthesisUtterance === "undefined" || !window.speechSynthesis) {
      return false;
    }
    return await new Promise<boolean>((resolve) => {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 1;
        utterance.pitch = 1;
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find((voice) => /aria|samantha|jenny|ava|zira/i.test(voice.name))
          ?? voices.find((voice) => /^en(?:-|_)/i.test(voice.lang))
          ?? voices[0];
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
        utterance.onend = () => {
          finishSpokenReply("Voice ready (device voice)");
          resolve(true);
        };
        utterance.onerror = () => {
          setSpeaking(false);
          ttsAbortRef.current = null;
          setVoiceStatus("Voice playback blocked");
          resolve(false);
        };
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve(false);
      }
    });
  }

  function stopVoicePlayback(): void {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  async function interruptVoice(reason = "operator_started_talking"): Promise<void> {
    stopVoicePlayback();
    await updateVoiceSession("/interrupt", { reason });
    setVoiceStatus("Stopped. Listening.");
    if (handsFreeRef.current) {
      startDictation(true);
    }
  }

  async function speakAssistant(text: string): Promise<void> {
    if (!voiceEnabled || !text.trim()) {
      return;
    }
    setSpeaking(true);
    setVoiceStatus("Nexi is speaking");
    const startedAt = performance.now();
    const controller = new AbortController();
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = controller;
    try {
      audioRef.current?.pause();
      recognitionRef.current?.stop();
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId, text }),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error("TTS unavailable");
      }
      const audioBlob = await response.blob();
      const firstAudioLatencyMs = Math.round(performance.now() - startedAt);
      setLastVoiceLatencyMs(firstAudioLatencyMs);
      await updateVoiceSession("/turn", {
        firstAudioLatencyMs,
        estimatedCostUsd: Number(response.headers.get("x-voice-estimated-cost-usd") ?? 0),
        characterCount: Number(response.headers.get("x-voice-character-count") ?? 0),
        audioBytes: Number(response.headers.get("x-voice-audio-bytes") ?? audioBlob.size)
      });
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        finishSpokenReply();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
        ttsAbortRef.current = null;
        setVoiceStatus("Voice playback failed");
      };
      await audio.play();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const fellBackToDeviceVoice = await speakAssistantWithBrowserVoice(text);
        if (fellBackToDeviceVoice) {
          return;
        }
      }
      setSpeaking(false);
      ttsAbortRef.current = null;
      setVoiceStatus(error instanceof DOMException && error.name === "AbortError" ? "Stopped." : "Voice playback blocked");
    }
  }

  async function toggleVoice(): Promise<void> {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setVoiceStatus(next ? "Voice ready" : "Voice off");
    if (!next) {
      stopVoicePlayback();
      recognitionRef.current?.stop();
      setListening(false);
      setHandsFree(false);
      setInterimTranscript("");
      return;
    }
    await startVoiceSession();
    if (speechSupported) {
      startDictation(false);
      return;
    }
    setVoiceStatus("Mic not supported here");
  }

  async function toggleHandsFree(): Promise<void> {
    if (handsFree) {
      setHandsFree(false);
      handsFreeRef.current = false;
      recognitionRef.current?.stop();
      setListening(false);
      setInterimTranscript("");
      setVoiceStatus("Hands-free paused.");
      return;
    }
    if (!speechSupported) {
      setVoiceStatus("Mic not supported here");
      return;
    }
    setVoiceEnabled(true);
    setHandsFree(true);
    handsFreeRef.current = true;
    await startVoiceSession();
    startDictation(true);
  }

  function startDictation(fullDuplex = false): void {
    if (!SpeechRecognition || listening) {
      setVoiceStatus("Mic not supported here");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = fullDuplex;
    recognition.interimResults = fullDuplex;
    recognition.onresult = (event) => {
      const startIndex = event.resultIndex ?? 0;
      const finalParts: string[] = [];
      const interimParts: string[] = [];
      for (let index = startIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? "";
        if (!transcript) {
          continue;
        }
        if (result?.isFinal || !fullDuplex) {
          finalParts.push(transcript);
        } else {
          interimParts.push(transcript);
        }
      }
      setInterimTranscript(interimParts.join(" "));
      const transcript = finalParts.join(" ").trim();
      if (!transcript) {
        return;
      }
      if (fullDuplex) {
        recognition.stop();
        setListening(false);
        setInterimTranscript("");
        setVoiceStatus("Heard you. Checking now.");
        void sendTextMessage(transcript);
        return;
      }
      setDraft((current) => [current, transcript].filter(Boolean).join(" ").trim());
      setVoiceStatus("Dictation captured");
    };
    recognition.onerror = () => {
      setListening(false);
      setVoiceStatus("Mic capture failed");
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    setVoiceStatus("Listening");
    recognition.start();
  }

  async function loadNotifications(): Promise<void> {
    try {
      const body = await fetch(`/api/crm/notifications?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<NexOpsNotificationsResponse>);
      if (!body.ok) {
        setNotifications([]);
        setNotificationUnreadCount(0);
        setNotificationStatus(body.error ?? "Notifications are unavailable right now.");
        return;
      }
      setNotifications(body.notifications ?? []);
      setNotificationUnreadCount(body.unreadCount ?? 0);
      setNotificationStatus("");
    } catch {
      setNotifications([]);
      setNotificationUnreadCount(0);
      setNotificationStatus("Notifications API unreachable.");
    }
  }

  function closeShellPanels(): void {
    setMobileNavOpen(false);
    setNotificationsOpen(false);
    setCreateMenuOpen(false);
    setModuleSwitcherOpen(false);
  }

  function navigateTo(path: string): void {
    closeShellPanels();
    window.location.assign(path);
  }

  function toggleCreateMenu(): void {
    setMobileNavOpen(false);
    setNotificationsOpen(false);
    setModuleSwitcherOpen(false);
    setCreateMenuOpen((current) => !current);
  }

  function toggleNotifications(): void {
    setMobileNavOpen(false);
    setCreateMenuOpen(false);
    setModuleSwitcherOpen(false);
    setNotificationsOpen((current) => !current);
  }

  function toggleModuleSwitcher(): void {
    setMobileNavOpen(false);
    setCreateMenuOpen(false);
    setNotificationsOpen(false);
    setModuleSwitcherOpen((current) => !current);
  }

  function openWorkspaceProduct(product: "nexops" | "nexcam" | "nexdocs" | "nexportal" | "nexreach"): void {
    navigateTo(buildWorkspaceSwitchPath(product, operatorContext.tenantId));
  }

  function handleCreateSelection(option: NexOpsCreateOption): void {
    if (option.workflow.kind === "client-page" || option.workflow.kind === "drawer") {
      navigateTo(buildNewClientPath());
      return;
    }
    navigateTo(buildModulePath(option.workflow.module));
  }

  async function openNotification(entry: NexOpsNotificationEntry): Promise<void> {
    try {
      if (entry.unread) {
        await fetch("/api/crm/notifications/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tenantId: operatorContext.tenantId, notificationId: entry.id })
        });
      }
    } finally {
      navigateTo(buildModulePath(entry.target.module));
    }
  }

  async function markAllNotificationsRead(): Promise<void> {
    await fetch("/api/crm/notifications/read-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: operatorContext.tenantId })
    });
    void loadNotifications();
  }

  async function sendTextMessage(rawText: string, approvalContextOverride?: NexiStandalonePendingApproval | null): Promise<void> {
    const text = rawText.trim();
    if (!text || working) {
      return;
    }
    const activeApprovalPrompt = nexiActiveApprovalPrompt(messages, pendingApproval);
    const effectivePendingApproval = approvalContextOverride ?? activeApprovalPrompt.pendingApproval ?? pendingApproval ?? null;
    const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
    const conversationOffer = !effectivePendingApproval && latestAssistantMessage
      ? nexiConversationOffer(
        latestAssistantMessage.text,
        typeof navigator !== "undefined" ? navigator.userAgent : undefined
      )
      : null;
    const offerReply = nexiConversationOfferReplyAction(text, conversationOffer);
    if (conversationOffer && offerReply !== "none") {
      const assistantText = offerReply === "confirm"
        ? conversationOffer.kind === "call"
          ? "Opening the phone dialer now."
          : "Opening directions in Maps now."
        : conversationOffer.kind === "call"
          ? "Okay, I won't place the call right now."
          : "Okay, I won't open Maps right now.";
      setDraft("");
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", text, sources: [] },
        { id: crypto.randomUUID(), role: "assistant", text: assistantText, sources: [] }
      ]);
      if (offerReply === "confirm") {
        if (conversationOffer.kind === "maps") {
          window.open(conversationOffer.href, "_blank", "noopener,noreferrer");
        } else {
          window.location.assign(conversationOffer.href);
        }
      }
      void speakAssistant(assistantText);
      return;
    }
    const actorDisplayName = formatNexiOperatorDisplayName(props.user.displayName, props.user.email);
    const requestorOrigin = await resolveRequestorOriginForNexiMessage(
      text,
      typeof navigator !== "undefined" ? navigator.geolocation : undefined
    );
    setDraft("");
    setWorking(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text, sources: [] }]);
    try {
      const idToken = await props.user.getIdToken();
      const response = await fetch("/api/nexi/message", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          conversationId,
          pendingApproval: effectivePendingApproval,
          actorDisplayName,
          ...(requestorOrigin ? { requestorOrigin } : {}),
          message: text
        })
      });
      const body = await response.json() as NexiResponse;
      const assistantText = sanitizeNexiRenderedText(
        body.ok
          ? body.answer ?? "I do not have an answer yet."
          : body.error ?? NEXI_FRIENDLY_FAILURE_MESSAGE
      );
      const nextPendingApproval = body.ok ? (body.pendingApproval ?? null) : null;
      if (body.ok) {
        setConversationId(body.conversationId ?? conversationId ?? null);
        setPendingApproval(nextPendingApproval);
      }
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: assistantText,
          sources: body.sources ?? [],
          pendingApproval: body.ok && nextPendingApproval && nexiIsApprovalPrompt(assistantText) ? nextPendingApproval : null
        }
      ]);
      if (body.ok && responseQueuedApproval(body.sources)) {
        window.dispatchEvent(new CustomEvent("nexops:approval-queued"));
      }
      void speakAssistant(assistantText);
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: NEXI_FRIENDLY_FAILURE_MESSAGE, sources: [] }
      ]);
      void speakAssistant(NEXI_FRIENDLY_FAILURE_MESSAGE);
    } finally {
      setWorking(false);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await sendTextMessage(draft);
  }

  async function uploadJobDeskFile(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || uploading) {
      return;
    }
    setUploading(true);
    setUploadStatus(`Uploading ${file.name}...`);
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: `Upload ${file.name}`,
        sources: []
      }
    ]);
    try {
      const fileBase64 = await fileToBase64(file);
      const mime = file.type || "application/octet-stream";
      const isImage = mime.startsWith("image/");
      const response = await fetch("/api/fielddocs/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          filename: file.name,
          mime,
          fileBase64,
          tags: ["job-desk-upload"],
          capturedBy: operatorContext.tenantUserId,
          ...(isImage ? { imageBase64: fileBase64, imageMime: mime } : {})
        })
      });
      const body = await response.json() as UploadMediaResponse;
      if (!response.ok || !body.ok || !body.media) {
        throw new Error(body.error ?? "Upload failed");
      }
      const mediaSource: Source = {
        rail: "native",
        ref: body.media.id,
        label: `Uploaded ${body.media.type} ${file.name}`
      };
      const assistantText = `Uploaded ${file.name} to the shared tenant media rail.`;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: assistantText,
          sources: [mediaSource]
        }
      ]);
      setUploadStatus("Upload saved.");
      void speakAssistant(assistantText);
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: NEXI_FRIENDLY_FAILURE_MESSAGE, sources: [] }
      ]);
      setUploadStatus("Upload failed.");
      void speakAssistant(NEXI_FRIENDLY_FAILURE_MESSAGE);
    } finally {
      setUploading(false);
    }
  }

  const brandColors = tenantBranding?.colors;
  const customOperatorTheme = isOwnerCustomizedOperatorTheme(operatorTheme) ? operatorTheme : null;
  const themeStyle = {
    "--jobdesk-shell-background": customOperatorTheme?.colors.shellBackground ?? brandColors?.background,
    "--jobdesk-panel-background": customOperatorTheme?.colors.panelBackground ?? brandColors?.surface,
    "--jobdesk-header-background": customOperatorTheme?.colors.headerBackground ?? brandColors?.primary,
    "--jobdesk-accent": customOperatorTheme?.colors.accent ?? brandColors?.accent,
    "--jobdesk-accent-text": customOperatorTheme?.colors.accentText ?? brandColors?.accentText,
    "--jobdesk-user-bubble": customOperatorTheme?.colors.userBubble ?? brandColors?.userBubble,
    "--jobdesk-assistant-bubble": customOperatorTheme?.colors.assistantBubble ?? brandColors?.assistantBubble,
    "--jobdesk-text": customOperatorTheme?.colors.text ?? brandColors?.text,
    "--jobdesk-muted-text": brandColors?.mutedText,
    "--jobdesk-font-family": tenantBranding?.fontFamily
  } as React.CSSProperties;
  const tenantName = tenantDisplayName(tenantBranding, operatorContext.tenantId);
  const liveStatus = [
    voiceStatus,
    uploadStatus,
    interimTranscript ? `Heard: ${interimTranscript}` : "",
    lastVoiceLatencyMs !== null ? `Audio start ${(lastVoiceLatencyMs / 1000).toFixed(1)}s` : ""
  ].filter(Boolean).join(" | ");

  function renderMessageSources(message: ChatMessage): React.ReactNode {
    const photoSources = message.sources.filter(sourceIsPhoto);
    const textSources = message.sources.filter((source) => !sourceIsPhoto(source) && !nexiShouldHideRenderedSource(source));
    const actions = message.role === "assistant" ? messageQuickActions(message.text) : [];
    const activeApprovalPrompt = nexiActiveApprovalPrompt(messages, pendingApproval);
    const showConfirmationButtons = message.role === "assistant"
      && activeApprovalPrompt.messageId === message.id
      && Boolean(activeApprovalPrompt.pendingApproval);
    return (
      <>
        {photoSources.length > 0 ? (
          <div className="photo-strip" aria-label="Photos from this answer">
            {photoSources.map((source) => (
              <figure className="photo-tile" key={`${source.rail}:${source.ref}`}>
                <button
                  aria-label={`Open full-size ${source.label}`}
                  className="photo-open"
                  type="button"
                  onClick={() => setActiveMedia(source)}
                >
                  {sourceThumb(source, operatorContext.tenantId)}
                </button>
                <figcaption className="photo-caption">
                  <span>{source.label}</span>
                  <a href={mediaDownloadUrl(source, operatorContext.tenantId)} download={mediaDownloadName(source)}>
                    Save
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
        {textSources.length > 0 ? (
          <div className="sources">
            {textSources.map((source) => (
              <span className="source" key={`${source.rail}:${source.ref}`}>
                <span>{source.label}</span>
              </span>
            ))}
          </div>
        ) : null}
        {actions.length > 0 ? (
          <div className="nexi-message-actions" aria-label="Quick actions from this answer">
            {actions.map((action) => (
              <a
                className={`nexi-message-action ${action.kind}`}
                href={action.href}
                key={`${action.kind}:${action.href}`}
                rel="noreferrer"
                target={action.kind === "maps" ? "_blank" : undefined}
              >
                {action.label}
              </a>
            ))}
          </div>
        ) : null}
        {showConfirmationButtons ? (
          <div className="nexi-confirmation-actions" aria-label="Approval choices">
            <button
              className="nexi-confirmation-button yes"
              disabled={working}
              type="button"
              onClick={() => void sendTextMessage("yes", activeApprovalPrompt.pendingApproval)}
            >
              Yes
            </button>
            <button
              className="nexi-confirmation-button no"
              disabled={working}
              type="button"
              onClick={() => void sendTextMessage("no", activeApprovalPrompt.pendingApproval)}
            >
              No
            </button>
          </div>
        ) : null}
      </>
    );
  }

  function renderCreateMenu(): React.ReactElement | null {
    if (!createMenuOpen) {
      return null;
    }
    return (
      <Suspense fallback={<section className="nexops-create-menu nexops-create-menu-flyout" role="dialog" aria-label="Create a new record"><p className="nexops-module-status">Loading create menu...</p></section>}>
        <NexOpsCreateMenu
          presentation={createMenuPresentation(window.innerWidth)}
          activeContextLabel="Pick the object you want to create. Nexi will route you into the matching NexOps workspace."
          onClose={() => setCreateMenuOpen(false)}
          onSelect={handleCreateSelection}
        />
      </Suspense>
    );
  }

  function renderNotificationPanel(): React.ReactElement | null {
    if (!notificationsOpen) {
      return null;
    }
    return (
      <Suspense fallback={<section className="nexops-notification-panel" role="dialog" aria-label="Notifications"><p className="nexops-module-status">Loading notifications...</p></section>}>
        <>
          <button className="nexops-overlay-backdrop" type="button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)} />
          <NexOpsNotificationPanel
            notificationStatus={notificationStatus}
            notifications={notifications}
            onMarkAllRead={markAllNotificationsRead}
            onOpenNotification={openNotification}
            onClose={() => setNotificationsOpen(false)}
          />
        </>
      </Suspense>
    );
  }

  function renderModuleSwitcher(): React.ReactElement | null {
    if (!moduleSwitcherOpen) {
      return null;
    }
    return (
      <>
        <button className="nexops-overlay-backdrop" type="button" aria-label="Close module switcher" onClick={() => setModuleSwitcherOpen(false)} />
        <section className="nexops-workspace-switcher" role="dialog" aria-label="Switch NexTeam modules">
          <div className="nexops-workspace-switcher-head">
            <div>
              <p className="eyebrow">Modules</p>
              <h2>Move across the platform</h2>
            </div>
            <button type="button" onClick={() => setModuleSwitcherOpen(false)}>Close</button>
          </div>
          <div className="nexops-workspace-switcher-grid">
            {NEXTEAM_WORKSPACE_OPTIONS.map((option) => (
              <button className={option.id === "nexops" ? "active" : ""} key={option.id} type="button" onClick={() => openWorkspaceProduct(option.id)}>
                <ProductLogo product={option.id === "nexportal" ? "nexportal" : option.id} className="nexops-workspace-switcher-logo" alt={option.label} />
                <div>
                  <strong>{option.label}</strong>
                  <p>{option.detail}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </>
    );
  }

  function renderMobileNav(): React.ReactElement | null {
    if (!mobileNavOpen) {
      return null;
    }
    return (
      <div className="nexops-mobile-nav-layer" role="presentation">
        <button className="nexops-mobile-nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
        <aside className="nexops-mobile-nav-sheet" id="nexops-mobile-nav" role="dialog" aria-modal="true" aria-label="Nexi navigation">
          <div className="nexops-mobile-nav-header">
            <div className="nexops-mobile-brand-stack">
              <div className="nexops-mobile-brand">
                <div className="nexops-mobile-brand-lockup">
                  <PlatformMark className="nexops-mobile-platform-mark" alt="NexTeam" />
                  <ProductLogo product="nexi" className="nexops-mobile-product-logo" alt="Nexi" />
                </div>
              </div>
              <TenantBrandMark branding={tenantBranding} tenantId={operatorContext.tenantId} className="nexops-mobile-tenant-mark" />
            </div>
            <button className="nexops-mobile-close-button" type="button" onClick={() => setMobileNavOpen(false)}>Close</button>
          </div>
          <div className="nexops-mobile-nav-quick-actions">
            <button className="nexops-create-button mobile" type="button" onClick={() => {
              setMobileNavOpen(false);
              setCreateMenuOpen(true);
            }}>
              Create
            </button>
            <button type="button" onClick={() => {
              setMobileNavOpen(false);
              toggleModuleSwitcher();
            }}>
              Modules
            </button>
          </div>
          <div className="nexops-mobile-nav-utility-grid" aria-label="Mobile quick tools">
            <button type="button" onClick={() => navigateTo("/nexcam")}>
              <NexOpsNavGlyph module="capture" />
              <span>NexCam</span>
            </button>
            <button type="button" onClick={() => {
              setMobileNavOpen(false);
              toggleNotifications();
            }}>
              <span className="nexops-mobile-nav-utility-icon nexops-notification-button" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none">
                  <path d="M10 3.7a3.1 3.1 0 0 0-3.1 3.1v1.3c0 .8-.3 1.6-.8 2.2l-.9 1v.8h9.6v-.8l-.9-1c-.5-.6-.8-1.4-.8-2.2V6.8A3.1 3.1 0 0 0 10 3.7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M8.3 14.7a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {notificationUnreadCount ? <span className="nexops-notification-badge">{notificationUnreadCount}</span> : null}
              </span>
              <span>Notifications</span>
            </button>
            <button type="button" onClick={() => navigateTo("/nexops/settings")}>
              <NexOpsNavGlyph module="settings" />
              <span>Settings</span>
            </button>
            <button type="button" onClick={() => void signOutOperator(props.auth)}>
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <path d="M12 4.5h2a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 14 15.5h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M9 13.5 12.5 10 9 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 10H4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
          {NEXOPS_MOBILE_NAV_GROUPS.map((group) => (
            <section className="nexops-mobile-nav-group" key={group.title} aria-label={group.title}>
              <p>{group.title}</p>
              <div className="nexops-mobile-nav-grid">
                {group.items.map((moduleId) => {
                  const module = NEXOPS_MODULES.find((entry) => entry.id === moduleId);
                  if (!module || module.hidden) {
                    return null;
                  }
                  return (
                    <button type="button" key={module.id} onClick={() => navigateTo(buildModulePath(module.id))}>
                      <NexOpsNavGlyph module={module.id} />
                      <span>{module.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="nexops-mobile-nav-footer">
            <div>
              <strong>{props.user.email ?? "Operator"}</strong>
              <span>Signed in for this tenant</span>
            </div>
          </div>
        </aside>
      </div>
    );
  }

  const header = (
    <>
      <NexOpsSharedMobileBar
        product="nexi"
        tenantBranding={tenantBranding}
        tenantId={operatorContext.tenantId}
        onBrandClick={() => navigateTo(buildModulePath("home"))}
        brandAriaLabel="Return to NexOps home"
        rightControls={(
          <div className="nexi-mobile-header-controls">
            <div className="nexi-mobile-header-icons">
              <button className="nexops-mobile-icon-button nexi-header-control" type="button" aria-label="Open camera capture" onClick={() => navigateTo("/nexcam")}>
                <NexOpsNavGlyph module="capture" />
              </button>
              <button className="nexops-mobile-icon-button nexi-header-control" type="button" aria-expanded={mobileNavOpen} aria-controls="nexops-mobile-nav" aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"} onClick={() => setMobileNavOpen((current) => !current)}>
                <span className="nexops-mobile-menu-glyph" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
            <button
              className={`nexi-voice-toggle ${voiceEnabled ? "on" : ""}`}
              type="button"
              role="switch"
              aria-checked={voiceEnabled}
              aria-label={voiceEnabled ? "Turn Nexi Voice off" : "Turn Nexi Voice on"}
              onClick={() => void toggleVoice()}
            >
              <span className="nexi-voice-toggle-label" aria-hidden="true">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                  <rect x="7.2" y="3.6" width="5.6" height="9.4" rx="2.8" stroke="currentColor" strokeWidth="1.9" />
                  <path d="M5.2 10.6c0 3.4 2.6 6 4.8 6s4.8-2.6 4.8-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M10 16.6v3.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M7.3 19.8h5.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M16.8 8.2c1 .7 1.6 1.7 1.6 2.8 0 1.2-.6 2.2-1.6 2.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M19.3 6.3c1.5 1.1 2.4 2.8 2.4 4.7 0 1.9-.9 3.6-2.4 4.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <span className="nexi-voice-toggle-switch" aria-hidden="true">
                <span className="nexi-voice-toggle-thumb">
                  <span className="nexi-voice-toggle-mark" aria-hidden="true">{voiceEnabled ? "✓" : "✕"}</span>
                </span>
              </span>
            </button>
          </div>
        )}
      />
      {renderMobileNav()}
      <NexOpsSharedWebTopbar
        product="nexi"
        tenantName={tenantName}
        moduleTitle="Nexi"
        moduleSwitcherOpen={moduleSwitcherOpen}
        onToggleModuleSwitcher={toggleModuleSwitcher}
        accountTools={(
          <>
            <button className="nexops-web-icon-button nexi-header-control" type="button" aria-label="Open camera capture" onClick={() => navigateTo("/nexcam")}>
              <NexOpsNavGlyph module="capture" />
            </button>
            <button className="nexops-web-icon-button nexi-header-control" type="button" aria-label="Open navigation menu" onClick={() => setMobileNavOpen((current) => !current)}>
              <span className="nexops-mobile-menu-glyph" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
            <span>{props.user.email ?? "Operator"}</span>
            <button type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button>
          </>
        )}
      />
    </>
  );

  const overlays = (
    <>
      {renderModuleSwitcher()}
      {renderCreateMenu()}
      {renderNotificationPanel()}
      {activeMedia ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={activeMedia.label} onClick={() => setActiveMedia(null)}>
          <div className="lightbox-card" onClick={(event) => event.stopPropagation()}>
            <img src={mediaUrl(activeMedia, operatorContext.tenantId)} alt={activeMedia.label} />
            <div className="lightbox-actions">
              <a href={mediaDownloadUrl(activeMedia, operatorContext.tenantId)} download={mediaDownloadName(activeMedia)}>
                Save full-size
              </a>
              <button type="button" onClick={() => setActiveMedia(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <NexiStandaloneLayout
      className={`density-${customOperatorTheme?.density ?? "comfortable"}`}
      style={themeStyle}
      header={header}
      overlays={overlays}
      statusLiveText={liveStatus}
      messages={messages}
      working={working}
      draft={draft}
      uploading={uploading}
      speechSupported={speechSupported}
      listening={listening}
      speaking={speaking}
      onDraftChange={setDraft}
      onSubmit={sendMessage}
      onAttachFiles={(event) => void uploadJobDeskFile(event)}
      onMicClick={() => {
        if (speaking) {
          void interruptVoice();
          return;
        }
        if (handsFree) {
          void toggleHandsFree();
          return;
        }
        startDictation(false);
      }}
      renderMessageSources={renderMessageSources}
    />
  );
}

function Chat(props: { auth: Auth | null; user: User }): React.ReactElement {
  const [operatorContext, setOperatorContext] = useState<OperatorContext>(() => fallbackOperatorContext(props.user));
  const [operatorTheme, setOperatorTheme] = useState<OperatorUiTheme | null>(null);
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Nexi Job Desk is ready. Ask about schedule, job details, photos, or the Camp Mikell SiteJobBlueprint.",
      sources: []
    }
  ]);
  const [draft, setDraft] = useState("");
  const [conversationId] = useState(() => `web-${crypto.randomUUID()}`);
  const [working, setWorking] = useState(false);
  const [health, setHealth] = useState<"checking" | "green" | "red">("checking");
  const [activeMedia, setActiveMedia] = useState<Source | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Voice off");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [lastVoiceLatencyMs, setLastVoiceLatencyMs] = useState<number | null>(null);
  const [uploadTarget, setUploadTarget] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const handsFreeRef = useRef(false);
  const voiceSessionRef = useRef<string | null>(null);
  const voiceWindow = window as VoiceWindow;
  const SpeechRecognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
  const speechSupported = Boolean(SpeechRecognition);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    voiceSessionRef.current = voiceSessionId;
  }, [voiceSessionId]);

  useEffect(() => {
    let cancelled = false;
    loadOperatorContext(props.user)
      .then((context) => {
        if (!cancelled) {
          setOperatorContext(context);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOperatorContext(fallbackOperatorContext(props.user));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.user]);

  useEffect(() => {
    let cancelled = false;
    props.user.getIdToken()
      .then((idToken) => fetch(`/api/sites/operator-ui?tenantId=${encodeURIComponent(operatorContext.tenantId)}`, {
        headers: { authorization: `Bearer ${idToken}` }
      }))
      .then((response) => response.json() as Promise<OperatorUiThemeResponse>)
      .then((body) => {
        if (!cancelled && body.ok && body.theme) {
          setOperatorTheme(body.theme);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOperatorTheme(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId, props.user]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/tenant-branding?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
      .then((response) => response.json() as Promise<TenantBrandingResponse>)
      .then((body) => {
        if (!cancelled && body.ok && body.branding) {
          setTenantBranding(body.branding);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTenantBranding(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorContext.tenantId, props.user]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => response.json() as Promise<{ ok?: boolean }>)
      .then((body) => {
        if (!cancelled) {
          setHealth(body.ok ? "green" : "red");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealth("red");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    audioRef.current?.pause();
    ttsAbortRef.current?.abort();
  }, []);

  async function startVoiceSession(): Promise<string | null> {
    if (voiceSessionRef.current) {
      return voiceSessionRef.current;
    }
    try {
      const response = await fetch("/api/voice/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          tenantUserId: operatorContext.tenantUserId
        })
      });
      const body = await response.json() as VoiceSessionResponse;
      if (!body.ok || !body.session) {
        throw new Error(body.error ?? "Voice session did not start.");
      }
      setVoiceSessionId(body.session.id);
      voiceSessionRef.current = body.session.id;
      return body.session.id;
    } catch {
      setVoiceStatus("Voice session did not start. Basic voice still works.");
      return null;
    }
  }

  async function updateVoiceSession(path: string, body?: unknown): Promise<void> {
    const sessionId = voiceSessionRef.current;
    if (!sessionId) {
      return;
    }
    await fetch(`/api/voice/session/${encodeURIComponent(sessionId)}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? "{}" : JSON.stringify(body)
    }).catch(() => undefined);
  }

  function finishSpokenReply(status = "Voice ready"): void {
    setSpeaking(false);
    ttsAbortRef.current = null;
    if (handsFreeRef.current) {
      void updateVoiceSession("/listen");
      setVoiceStatus("Listening for the next question");
      startDictation(true);
      return;
    }
    setVoiceStatus(status);
  }

  async function speakAssistantWithBrowserVoice(text: string): Promise<boolean> {
    if (typeof window === "undefined" || typeof SpeechSynthesisUtterance === "undefined" || !window.speechSynthesis) {
      return false;
    }
    return await new Promise<boolean>((resolve) => {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 1;
        utterance.pitch = 1;
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find((voice) => /aria|samantha|jenny|ava|zira/i.test(voice.name))
          ?? voices.find((voice) => /^en(?:-|_)/i.test(voice.lang))
          ?? voices[0];
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
        utterance.onend = () => {
          finishSpokenReply("Voice ready (device voice)");
          resolve(true);
        };
        utterance.onerror = () => {
          setSpeaking(false);
          ttsAbortRef.current = null;
          setVoiceStatus("Voice playback blocked");
          resolve(false);
        };
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve(false);
      }
    });
  }

  function stopVoicePlayback(): void {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  async function interruptVoice(reason = "operator_started_talking"): Promise<void> {
    stopVoicePlayback();
    await updateVoiceSession("/interrupt", { reason });
    setVoiceStatus("Stopped. Listening.");
    if (handsFreeRef.current) {
      startDictation(true);
    }
  }

  async function speakAssistant(text: string): Promise<void> {
    if (!voiceEnabled || !text.trim()) {
      return;
    }
    setSpeaking(true);
    setVoiceStatus("Nexi is speaking");
    const startedAt = performance.now();
    const controller = new AbortController();
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = controller;
    try {
      audioRef.current?.pause();
      recognitionRef.current?.stop();
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId, text }),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error("TTS unavailable");
      }
      const audioBlob = await response.blob();
      const firstAudioLatencyMs = Math.round(performance.now() - startedAt);
      setLastVoiceLatencyMs(firstAudioLatencyMs);
      await updateVoiceSession("/turn", {
        firstAudioLatencyMs,
        estimatedCostUsd: Number(response.headers.get("x-voice-estimated-cost-usd") ?? 0),
        characterCount: Number(response.headers.get("x-voice-character-count") ?? 0),
        audioBytes: Number(response.headers.get("x-voice-audio-bytes") ?? audioBlob.size)
      });
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        finishSpokenReply();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
        ttsAbortRef.current = null;
        setVoiceStatus("Voice playback failed");
      };
      await audio.play();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const fellBackToDeviceVoice = await speakAssistantWithBrowserVoice(text);
        if (fellBackToDeviceVoice) {
          return;
        }
      }
      setSpeaking(false);
      ttsAbortRef.current = null;
      setVoiceStatus(error instanceof DOMException && error.name === "AbortError" ? "Stopped." : "Voice playback blocked");
    }
  }

  async function toggleVoice(): Promise<void> {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setVoiceStatus(next ? "Voice ready" : "Voice off");
    if (!next) {
      stopVoicePlayback();
      recognitionRef.current?.stop();
      setListening(false);
      setHandsFree(false);
      setInterimTranscript("");
      setSpeaking(false);
      return;
    }
    await startVoiceSession();
  }

  async function toggleHandsFree(): Promise<void> {
    if (handsFree) {
      setHandsFree(false);
      handsFreeRef.current = false;
      recognitionRef.current?.stop();
      setListening(false);
      setInterimTranscript("");
      setVoiceStatus("Hands-free paused.");
      return;
    }
    if (!speechSupported) {
      setVoiceStatus("Mic not supported here");
      return;
    }
    setVoiceEnabled(true);
    setHandsFree(true);
    handsFreeRef.current = true;
    await startVoiceSession();
    startDictation(true);
  }

  function startDictation(fullDuplex = false): void {
    if (!SpeechRecognition || listening) {
      setVoiceStatus("Mic not supported here");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = fullDuplex;
    recognition.interimResults = fullDuplex;
    recognition.onresult = (event) => {
      const startIndex = event.resultIndex ?? 0;
      const finalParts: string[] = [];
      const interimParts: string[] = [];
      for (let index = startIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? "";
        if (!transcript) {
          continue;
        }
        if (result?.isFinal || !fullDuplex) {
          finalParts.push(transcript);
        } else {
          interimParts.push(transcript);
        }
      }
      setInterimTranscript(interimParts.join(" "));
      const transcript = finalParts.join(" ").trim();
      if (!transcript) {
        return;
      }
      if (fullDuplex) {
        recognition.stop();
        setListening(false);
        setInterimTranscript("");
        setVoiceStatus("Heard you. Checking now.");
        void sendTextMessage(transcript);
        return;
      }
      setDraft((current) => [current, transcript].filter(Boolean).join(" ").trim());
      setVoiceStatus("Dictation captured");
    };
    recognition.onerror = () => {
      setListening(false);
      setVoiceStatus("Mic capture failed");
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    setVoiceStatus("Listening");
    recognition.start();
  }

  async function sendTextMessage(rawText: string): Promise<void> {
    const text = rawText.trim();
    if (!text || working) {
      return;
    }
    const requestorOrigin = await resolveRequestorOriginForNexiMessage(
      text,
      typeof navigator !== "undefined" ? navigator.geolocation : undefined
    );
    setDraft("");
    setWorking(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text, sources: [] }]);
    try {
      const idToken = await props.user.getIdToken();
      const response = await fetch("/api/nexi/message", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          conversationId,
          ...(requestorOrigin ? { requestorOrigin } : {}),
          message: text
        })
      });
      const body = await response.json() as NexiResponse;
      const assistantText = body.ok ? body.answer ?? "I do not have an answer yet." : body.error ?? "Nexi could not answer that.";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: assistantText,
          sources: body.sources ?? []
        }
      ]);
      if (body.ok && responseQueuedApproval(body.sources)) {
        window.dispatchEvent(new CustomEvent("nexops:approval-queued"));
      }
      void speakAssistant(assistantText);
    } catch {
      const fallback = "Nexi could not reach the authenticated Job Desk API.";
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: fallback, sources: [] }
      ]);
      void speakAssistant(fallback);
    } finally {
      setWorking(false);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await sendTextMessage(draft);
  }

  async function uploadJobDeskFile(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || uploading) {
      return;
    }
    const linkTarget = uploadTarget.trim().slice(0, 120);
    setUploading(true);
    setUploadStatus(`Uploading ${file.name}...`);
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: `Upload ${file.name}${linkTarget ? ` for ${linkTarget}` : ""}`,
        sources: []
      }
    ]);
    try {
      const fileBase64 = await fileToBase64(file);
      const mime = file.type || "application/octet-stream";
      const isImage = mime.startsWith("image/");
      const response = await fetch("/api/fielddocs/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          ...(linkTarget ? { jobId: linkTarget } : {}),
          filename: file.name,
          mime,
          fileBase64,
          tags: ["job-desk-upload", ...(linkTarget ? [`linked:${linkTarget}`] : [])],
          capturedBy: operatorContext.tenantUserId,
          ...(isImage ? { imageBase64: fileBase64, imageMime: mime } : {})
        })
      });
      const body = await response.json() as UploadMediaResponse;
      if (!response.ok || !body.ok || !body.media) {
        throw new Error(body.error ?? "Upload failed");
      }
      const mediaSource: Source = {
        rail: "native",
        ref: body.media.id,
        label: `Uploaded ${body.media.type} ${file.name}`
      };
      const assistantText = linkTarget
        ? `Uploaded ${file.name} and linked it to ${linkTarget}.`
        : `Uploaded ${file.name} to the Job Desk media file.`;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: assistantText,
          sources: [mediaSource]
        }
      ]);
      setUploadStatus("Upload saved.");
      void speakAssistant(assistantText);
    } catch {
      const failure = "I couldn't upload that file yet. I wrote it down so we can fix the upload path instead of losing it.";
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: failure, sources: [] }]);
      setUploadStatus("Upload failed.");
      void speakAssistant(failure);
    } finally {
      setUploading(false);
    }
  }

  const brandColors = tenantBranding?.colors;
  const customOperatorTheme = isOwnerCustomizedOperatorTheme(operatorTheme) ? operatorTheme : null;
  const themeStyle = {
    "--jobdesk-shell-background": customOperatorTheme?.colors.shellBackground ?? brandColors?.background,
    "--jobdesk-panel-background": customOperatorTheme?.colors.panelBackground ?? brandColors?.surface,
    "--jobdesk-header-background": customOperatorTheme?.colors.headerBackground ?? brandColors?.primary,
    "--jobdesk-accent": customOperatorTheme?.colors.accent ?? brandColors?.accent,
    "--jobdesk-accent-text": customOperatorTheme?.colors.accentText ?? brandColors?.accentText,
    "--jobdesk-user-bubble": customOperatorTheme?.colors.userBubble ?? brandColors?.userBubble,
    "--jobdesk-assistant-bubble": customOperatorTheme?.colors.assistantBubble ?? brandColors?.assistantBubble,
    "--jobdesk-text": customOperatorTheme?.colors.text ?? brandColors?.text,
    "--jobdesk-muted-text": brandColors?.mutedText,
    "--jobdesk-font-family": tenantBranding?.fontFamily
  } as React.CSSProperties;

  return (
    <main className={`shell ops-shell density-${customOperatorTheme?.density ?? "comfortable"}`} style={themeStyle}>
      <div className="ops-grid">
      <section className="phone">
        <header className="topbar">
          <div className="brand-stack">
            <div className="brand-stack-row">
              <NexiIdentityMark className="brand-stack-nexi" />
              <TenantBrandMark branding={tenantBranding} tenantId={operatorContext.tenantId} />
            </div>
            <h1>Nexi Job Desk</h1>
            <p className="signed-in">{props.user.email ?? "Firebase operator"}</p>
          </div>
          <div className="top-actions">
            <span className={`health ${health}`} aria-label={`Health ${health}`} />
            <button className={`voice-toggle ${voiceEnabled ? "on" : ""}`} type="button" onClick={() => void toggleVoice()}>
              {voiceEnabled ? "Voice on" : "Enable voice"}
            </button>
            <button
              className={`voice-toggle ${handsFree ? "on" : ""}`}
              disabled={!speechSupported}
              type="button"
              onClick={() => void toggleHandsFree()}
            >
              {handsFree ? "Hands-free on" : "Hands-free"}
            </button>
            <button className="sign-out" type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button>
          </div>
        </header>

        <div className="thread" aria-live="polite">
          {messages.map((message) => {
            const photoSources = message.sources.filter(sourceIsPhoto);
            const textSources = message.sources.filter((source) => !sourceIsPhoto(source));
            return (
            <article className={`bubble ${message.role}`} key={message.id}>
              <p>{message.text}</p>
              {photoSources.length > 0 ? (
                <div className="photo-strip" aria-label="Photos from this answer">
                  {photoSources.map((source) => (
                    <figure className="photo-tile" key={`${source.rail}:${source.ref}`}>
                      <button
                        aria-label={`Open full-size ${source.label}`}
                        className="photo-open"
                        type="button"
                        onClick={() => setActiveMedia(source)}
                      >
                        {sourceThumb(source)}
                      </button>
                      <figcaption className="photo-caption">
                        <span>{source.label}</span>
                        <a href={mediaDownloadUrl(source)} download={mediaDownloadName(source)}>
                          Save
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
              {textSources.length > 0 ? (
                <div className="sources">
                  {textSources.map((source) => (
                    <span className="source" key={`${source.rail}:${source.ref}`}>
                      <span>{source.label}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          );
          })}
          {working ? <div className="typing">Nexi is checking...</div> : null}
        </div>

        <div className="voice-strip" aria-live="polite">
          <span className={`voice-dot ${listening ? "listening" : speaking ? "speaking" : voiceEnabled ? "ready" : ""}`} />
          <span>{voiceStatus}</span>
          {lastVoiceLatencyMs !== null ? <span className="latency-chip">audio start {(lastVoiceLatencyMs / 1000).toFixed(1)}s</span> : null}
          {interimTranscript ? <span className="interim-text">"{interimTranscript}"</span> : null}
          {speaking ? (
            <button className="voice-action" type="button" onClick={() => void interruptVoice()}>
              Stop Nexi
            </button>
          ) : null}
          {!speechSupported ? <span className="voice-note">Speech input unsupported in this browser</span> : null}
        </div>

        <div className="upload-strip" aria-live="polite">
          <label className={`upload-button ${uploading ? "disabled" : ""}`}>
            <span>{uploading ? "Uploading..." : "📎 Attach file"}</span>
            <input
              disabled={uploading}
              type="file"
              onChange={(event) => void uploadJobDeskFile(event)}
            />
          </label>
          <input
            aria-label="Optional job or client link for upload"
            className="upload-target"
            disabled={uploading}
            placeholder="Job/client link"
            value={uploadTarget}
            onChange={(event) => setUploadTarget(event.target.value)}
          />
          {uploadStatus ? <span className="upload-status">{uploadStatus}</span> : null}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <button
            aria-label="Dictate message"
            className={`mic ${listening ? "active" : ""}`}
            disabled={!speechSupported || working}
            type="button"
            onClick={() => {
              if (speaking) {
                void interruptVoice();
                return;
              }
              startDictation(handsFree);
            }}
          >
            {speaking ? "Stop" : "Mic"}
          </button>
          <input
            aria-label="Message Nexi"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask: What is on today's schedule?"
          />
          <button type="submit" disabled={working || !draft.trim()}>Send</button>
        </form>
      </section>
      <div className="side-panels">
        <NexOpsCrmPanel tenantId={operatorContext.tenantId} />
        <SchedulePanel tenantId={operatorContext.tenantId} />
        <ApprovalQueuePanel tenantId={operatorContext.tenantId} />
        <ContentQueuePanel tenantId={operatorContext.tenantId} />
        <ReputationPanel tenantId={operatorContext.tenantId} user={props.user} />
      </div>
      </div>
      {activeMedia ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={activeMedia.label} onClick={() => setActiveMedia(null)}>
          <div className="lightbox-card" onClick={(event) => event.stopPropagation()}>
            <img src={mediaUrl(activeMedia)} alt={activeMedia.label} />
            <div className="lightbox-actions">
              <a href={mediaDownloadUrl(activeMedia)} download={mediaDownloadName(activeMedia)}>
                Save full-size
              </a>
              <button type="button" onClick={() => setActiveMedia(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function App(): React.ReactElement {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [localAuthEnabled, setLocalAuthEnabled] = useState(false);
  const [localTenantId, setLocalTenantId] = useState(DEFAULT_TENANT_ID);
  const [localProfiles, setLocalProfiles] = useState<LocalAuthProfileSummary[]>([]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    loadAuthBootstrap()
      .then(({ auth: nextAuth, localUser, localAuthEnabled: nextLocalAuthEnabled, localTenantId: nextLocalTenantId, localProfiles: nextLocalProfiles }) => {
        if (cancelled) {
          return;
        }
        setAuth(nextAuth);
        setLocalAuthEnabled(nextLocalAuthEnabled);
        setLocalTenantId(nextLocalTenantId);
        setLocalProfiles(nextLocalProfiles);
        if (localUser) {
          setUser(localUser);
          setAuthReady(true);
          return;
        }
        if (nextLocalAuthEnabled || !nextAuth) {
          setAuthReady(true);
          return;
        }
        unsubscribe = onAuthStateChanged(nextAuth, (nextUser) => {
          setUser(nextUser);
          setAuthReady(true);
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAuthReady(true);
        }
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return <AuthGate auth={auth} user={user} authReady={authReady} localAuthEnabled={localAuthEnabled} localTenantId={localTenantId} localProfiles={localProfiles} onSignedIn={setUser} />;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}

