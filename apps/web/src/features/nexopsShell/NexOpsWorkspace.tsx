import React, { Suspense, useEffect, useRef, useState } from "react";
import { formatAddress, type Address as CrmAddress } from "@nexteam/shared";
import { type Auth, type User } from "firebase/auth";
import { PlatformMark, ProductLogo, SidebarBrandStack, TenantBrandMark, tenantDisplayName } from "../../productBranding";
import { NexOpsSharedMobileBar, NexOpsSharedWebTopbar } from "../../nexopsHeader";

import { buildClientProfilePath, buildNewClientPath, buildModulePath, buildWorkspaceSwitchPath, createMenuPresentation, isDismissKey, NEXOPS_MOBILE_NAV_GROUPS, NEXOPS_MODULES, NEXTEAM_WORKSPACE_OPTIONS, parseNexOpsLocation, type ClientProfileTab, type NexOpsCreateOption, type NexOpsModule } from "../../nexopsShell";
import { buildLeadSourceOptions, CLIENT_CUSTOM_FIELD_RESERVED_LABELS, customFieldRecordToDraftRows, customFieldDraftRowsToRecord, draftNameFieldsFromClientRecord, PROPERTY_CUSTOM_FIELD_RESERVED_LABELS, primaryClientPhoneValue, type ClientProfileMobileBucket, type CustomFieldDraftRow, validateCustomFieldDraftRows } from "../../features/clients/components/contact/domain/clientProfile";
import { getMobileCreateFabScrollIntent, mobileFabShouldHideOverlays, mobileFabVisibleForViewport, NEXOPS_MOBILE_CREATE_FAB_IDLE_MS, NEXOPS_MOBILE_CREATE_FAB_PULSE_KEY, NEXOPS_SHARED_CREATE_MENU_ID, NexOpsMobileCreateFab, shouldPulseMobileCreateFab } from "../../nexopsMobileCreateFab";
import { ContactRoster } from "../clients/components/contact/ContactRoster";
import { ContactEditorSurface } from "../clients/components/contact/ContactEditorSurface";
import { ContactProfileSurface } from "../clients/components/contact/ContactProfileSurface";
import "../clients/components/contact/contact.css";
import { signOutOperator } from "../../shared/auth/authBootstrap";
import { ApprovalQueuePanel } from "../approvalQueue/areas/queue/components/ApprovalQueuePanel";

const NexOpsHomePage = React.lazy(async () => ({ default: (await import("../../nexopsHome")).NexOpsHomePage }));
const NexOpsInvoicesPage = React.lazy(async () => ({ default: (await import("../../features/invoices/components/invoiceStructure/NexOpsInvoicesPage")).NexOpsInvoicesPage }));
const NexOpsJobsPage = React.lazy(async () => ({ default: (await import("../../features/jobs/components/jobCore/NexOpsJobsPage")).NexOpsJobsPage }));
const NexOpsPatternLibraryPage = React.lazy(async () => ({ default: (await import("../../nexopsPatternLibrary")).NexOpsPatternLibraryPage }));
const NexOpsQuotesPage = React.lazy(async () => ({ default: (await import("../../features/quotes/components/quoteEngine/NexOpsQuotesPage")).NexOpsQuotesPage }));
const NexOpsRequestsPage = React.lazy(async () => ({ default: (await import("../../nexopsRequests")).NexOpsRequestsPage }));
const NexOpsSchedulePage = React.lazy(async () => ({ default: (await import("../../features/visits/components/visitCore/NexOpsSchedulePage")).NexOpsSchedulePage }));
const NexOpsSettingsPage = React.lazy(async () => ({ default: (await import("../../features/settings/components/tenantConfig/NexOpsSettingsPage")).NexOpsSettingsPage }));
const NexOpsCaptureWorkspace = React.lazy(async () => ({ default: (await import("../../nexopsDeferredUi")).NexOpsCaptureWorkspace }));
export const NexOpsCreateMenu = React.lazy(async () => ({ default: (await import("../../nexopsDeferredUi")).NexOpsCreateMenu }));
const NexOpsCreateClientPanel = React.lazy(async () => ({ default: (await import("../../nexopsDeferredUi")).NexOpsCreateClientPanel }));
export const NexOpsNotificationPanel = React.lazy(async () => ({ default: (await import("../../nexopsDeferredUi")).NexOpsNotificationPanel }));


interface Source {
  rail: string;
  ref: string;
  label: string;
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

interface UploadMediaResponse {
  ok: boolean;
  media?: FieldDocsMediaRecord;
  error?: string;
}





















type ContactChannel = "email" | "sms" | "both" | "none";
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

export interface CaptureBatchRecord {
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

export interface CaptureClientTargetJob {
  id: string;
  number?: string;
  title: string;
  status: string;
  propertyId?: string;
}

export interface CaptureClientTargetVisit {
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
export type CaptureSessionMode = "fresh" | "choose" | "new-client" | "existing-client" | "continued" | "unassigned";
export type CaptureSessionOrigin = "new" | "reopened";

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

interface SignedDocumentsResponse {
  ok: boolean;
  records?: SignedDocumentRecord[];
  error?: string;
}

type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";

interface TenantUserRecord {
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

interface NexOpsNotificationsResponse {
  ok: boolean;
  unreadCount?: number;
  notifications?: NexOpsNotificationEntry[];
  error?: string;
}

export const CONFIGURED_TENANT_ID = (import.meta.env.VITE_TENANT_ID as string | undefined)?.trim() ?? "";

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

export function fallbackOperatorContext(user: User): OperatorContext {
  return { tenantId: CONFIGURED_TENANT_ID, tenantUserId: user.uid, role: "OWNER" };
}

export async function loadOperatorContext(user: User): Promise<OperatorContext> {
  const token = await user.getIdTokenResult();
  const claims = token.claims as Record<string, unknown>;
  const claimedTenantId = claimString(claims, "tenantId") ?? claimString(claims, "tenant_id");
  const tenantId = claimedTenantId || CONFIGURED_TENANT_ID;
  if (!tenantId) {
    throw new Error("This sign-in is missing a tenant assignment.");
  }
  return {
    tenantId,
    tenantUserId: claimString(claims, "tenantUserId") ?? user.uid,
    role: claimRole(claims)
  };
}



export function mediaUrl(source: Source, tenantId?: string): string {
  const base = `/api/media/${encodeURIComponent(source.ref)}`;
  return source.rail === "native" && tenantId ? `${base}?tenantId=${encodeURIComponent(tenantId)}` : base;
}



export function sourceIsPhoto(source: Source): boolean {
  const label = source.label.toLowerCase();
  if (/\b(pdf|document|report)\b/.test(label)) {
    return false;
  }
  return source.rail === "native" && /\b(photo|media|before|after|upload)/.test(label);
}

export function formatPhoneActionLabel(phone: string): string {
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







export function fileToBase64(file: File): Promise<string> {
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







function personDisplayName(person?: { firstName?: string; lastName?: string }): string {
  return [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
}

export function clientDisplayName(client: CrmClient): string {
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





export function contactSummary(client: CrmClient): string {
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



export function NexOpsNavGlyph(props: { module: NexOpsModule }): React.ReactElement {
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

export type NexOpsClientDraft = ReturnType<typeof blankNewClientDraft>;

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

export function NexOpsWorkspace(props: { auth: Auth | null; user: User }): React.ReactElement {
  const initialPathState = parseNexOpsLocation(window.location.pathname);
  const [operatorContext, setOperatorContext] = useState<OperatorContext>(() => fallbackOperatorContext(props.user));
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [properties, setProperties] = useState<CrmProperty[]>([]);
  const [jobs, setJobs] = useState<CrmJob[]>([]);
  const [quotes, setQuotes] = useState<CrmQuote[]>([]);
  const [invoices, setInvoices] = useState<CrmInvoice[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUserRecord[]>([]);
  const [requests, setRequests] = useState<CrmRequestSummary[]>([]);
  const [payments, setPayments] = useState<CrmPaymentSummary[]>([]);
  const [receiptReviews, setReceiptReviews] = useState<CrmReceiptReviewSummary[]>([]);
  const [clientPortalActivity, setClientPortalActivity] = useState<ClientPortalActivityEntry[]>([]);
  const [clientReviewSequences, setClientReviewSequences] = useState<ReviewSequenceRecord[]>([]);
  const [clientFieldMedia, setClientFieldMedia] = useState<NonNullable<FieldDocsMediaListResponse["media"]>>([]);
  const [clientFieldReports, setClientFieldReports] = useState<NonNullable<FieldDocsReportsListResponse["reports"]>>([]);
  const [clientSignedDocuments, setClientSignedDocuments] = useState<SignedDocumentRecord[]>([]);
  const [clientRailStatus, setClientRailStatus] = useState("Portal activity and review follow-up will load when a client is selected.");
  const [clientRailBusy, setClientRailBusy] = useState("");
  const [lastPortalLink, setLastPortalLink] = useState("");
  const [status, setStatus] = useState("Loading clients...");
  const [query, setQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(initialPathState.clientId ?? "");
  const [activeClientProfileTab, setActiveClientProfileTab] = useState<ClientProfileTab | null>(initialPathState.clientTab);
  const [activeModule, setActiveModule] = useState<NexOpsModule>(initialPathState.module);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [focusedRequestId, setFocusedRequestId] = useState("");
  const [focusedQuoteId, setFocusedQuoteId] = useState("");
  const [focusedJobId, setFocusedJobId] = useState("");
  const [focusedInvoiceId, setFocusedInvoiceId] = useState("");
  const [requestFilterIntent, setRequestFilterIntent] = useState<"all" | "new" | "archived" | "converted_to_quote" | "converted_to_job" | undefined>();
  const [quoteFilterIntent, setQuoteFilterIntent] = useState<"all" | "draft" | "sent" | "change_requested" | "approved" | "approved_pending_conversion" | "expired" | undefined>();
  const [jobFilterIntent, setJobFilterIntent] = useState<"All" | "Upcoming" | "Today" | "Late" | "Unscheduled" | "Action Required" | "Requires Invoicing" | "Archived" | undefined>();
  const [invoiceFilterIntent, setInvoiceFilterIntent] = useState<"all" | "draft" | "awaiting" | "partial_pay" | "paid" | "void" | "bad_debt" | "past_due" | undefined>();
  const [scheduleScopeIntent, setScheduleScopeIntent] = useState<ScheduleScope | undefined>();
  const [captureWorkspaceView, setCaptureWorkspaceView] = useState<CaptureWorkspaceView>("session");
  const [captureSession, setCaptureSession] = useState<CaptureBatchRecord | null>(null);
  const [captureSessionMode, setCaptureSessionMode] = useState<CaptureSessionMode>("fresh");
  const [captureSessionOrigin, setCaptureSessionOrigin] = useState<CaptureSessionOrigin>("new");
  const [captureSelectedMediaId, setCaptureSelectedMediaId] = useState("");
  const [captureStatus, setCaptureStatus] = useState("Open the camera to start a capture batch.");
  const [captureBusy, setCaptureBusy] = useState("");
  const [captureClientQuery, setCaptureClientQuery] = useState("");
  const [captureSelectedClientId, setCaptureSelectedClientId] = useState("");
  const [captureSelectedJobId, setCaptureSelectedJobId] = useState("");
  const [captureSelectedVisitId, setCaptureSelectedVisitId] = useState("");
  const [captureTargets, setCaptureTargets] = useState<{ jobs: CaptureClientTargetJob[]; visits: CaptureClientTargetVisit[] }>({ jobs: [], visits: [] });
  const [captureInbox, setCaptureInbox] = useState<CaptureBatchRecord[]>([]);
  const [captureInboxStatus, setCaptureInboxStatus] = useState("Loading capture inbox...");
  const [captureRequestIntent, setCaptureRequestIntent] = useState<CaptureRequestIntent | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NexOpsNotificationEntry[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationStatus, setNotificationStatus] = useState("");
  const [moduleSwitcherOpen, setModuleSwitcherOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [mobileCreateFabCollapsed, setMobileCreateFabCollapsed] = useState(false);
  const [mobileCreateFabPulse, setMobileCreateFabPulse] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [creatingClientPage, setCreatingClientPage] = useState(initialPathState.clientDraft === "new");
  const [clientFormMode, setClientFormMode] = useState<ClientFormMode>("create");
  const [createClientSurface, setCreateClientSurface] = useState<"client" | "contact" | "property">("client");
  const [createStatus, setCreateStatus] = useState("");
  const [csvStatus, setCsvStatus] = useState("No CSV selected yet.");
  const [newClient, setNewClient] = useState(() => blankNewClientDraft());
  const [mobileClientViewport, setMobileClientViewport] = useState(() => typeof window !== "undefined" && window.innerWidth <= MOBILE_CLIENT_VIEWPORT_MAX);
  const [mobileClientExpandedBucket, setMobileClientExpandedBucket] = useState<ClientProfileMobileBucket | null>(null);
  const [clientOverviewCustomFieldsDraft, setClientOverviewCustomFieldsDraft] = useState<CustomFieldDraftRow[]>([]);
  const [clientOverviewCustomFieldsOpen, setClientOverviewCustomFieldsOpen] = useState(false);
  const draftDisplayName = [newClient.firstName.trim(), newClient.lastName.trim()].filter(Boolean).join(" ") || newClient.company.trim();
  const newClientHasName = draftDisplayName.length > 0;
  const newClientHasPhone = newClient.phone.trim().length > 0;
  const newClientHasAddress = [
    newClient.street1.trim(),
    newClient.city.trim(),
    newClient.province.trim()
  ].every(Boolean);
  const clientCustomFieldValidation = validateCustomFieldDraftRows(newClient.clientCustomFieldsDraft ?? [], CLIENT_CUSTOM_FIELD_RESERVED_LABELS);
  const propertyCustomFieldValidation = validateCustomFieldDraftRows(newClient.propertyCustomFieldsDraft ?? [], PROPERTY_CUSTOM_FIELD_RESERVED_LABELS);
  const createClientMissingFields = [
    ...(newClientHasName ? [] : ["name"]),
    ...(newClientHasAddress ? [] : ["address"]),
    ...(newClientHasPhone ? [] : ["telephone"])
  ];
  const createClientCanSave = createClientMissingFields.length === 0
    && !clientCustomFieldValidation.hasBlockingIssues
    && !propertyCustomFieldValidation.hasBlockingIssues;
  const leadSourceOptions = buildLeadSourceOptions(clients);
  const captureInputRef = useRef<HTMLInputElement | null>(null);

  function emitCrmMutation(): void {
    window.dispatchEvent(new Event("nexops:crm-mutated"));
  }

  function resetCaptureAssignmentDraft(): void {
    setCaptureClientQuery("");
    setCaptureSelectedClientId("");
    setCaptureSelectedJobId("");
    setCaptureSelectedVisitId("");
    setCaptureTargets({ jobs: [], visits: [] });
  }

  function orderedCaptureMedia(batch: CaptureBatchRecord | null): FieldDocsMediaRecord[] {
    if (!batch) {
      return [];
    }
    const mediaById = new Map(batch.media.map((entry) => [entry.id, entry]));
    return batch.mediaIds
      .map((id) => mediaById.get(id))
      .filter((entry): entry is FieldDocsMediaRecord => Boolean(entry));
  }

  function reopenCaptureBatch(batch: CaptureBatchRecord, nextMode: CaptureSessionMode, statusText: string): void {
    setCaptureSession(batch);
    setCaptureSessionOrigin("reopened");
    setCaptureSessionMode(nextMode);
    setCaptureStatus(statusText);
    openCaptureWorkspace("session");
  }

  function openCaptureWorkspace(view: CaptureWorkspaceView): void {
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    setCaptureWorkspaceView(view);
    setMobileNavOpen(false);
    setNotificationsOpen(false);
    setCreateMenuOpen(false);
    setActiveModule("capture");
    window.history.pushState({}, "", "/nexops/capture");
  }

  async function loadCaptureInbox(tenantId = operatorContext.tenantId): Promise<void> {
    setCaptureInboxStatus("Loading capture inbox...");
    try {
      const body = await fetch(`/api/fielddocs/capture-batches?tenantId=${encodeURIComponent(tenantId)}&status=unassigned&limit=50`)
        .then((response) => response.json() as Promise<CaptureBatchListResponse>);
      if (!body.ok) {
        setCaptureInbox([]);
        setCaptureInboxStatus(body.error ?? "Capture inbox is unavailable right now.");
        return;
      }
      const batches = body.batches ?? [];
      setCaptureInbox(batches);
      setCaptureInboxStatus(batches.length ? `${batches.length} unassigned capture batch${batches.length === 1 ? "" : "es"} ready to route.` : "No unassigned photo batches are waiting right now.");
    } catch {
      setCaptureInbox([]);
      setCaptureInboxStatus("Capture inbox is unavailable right now.");
    }
  }

  async function fetchCaptureBatch(batchId: string, tenantId = operatorContext.tenantId): Promise<CaptureBatchRecord | null> {
    try {
      const body = await fetch(`/api/fielddocs/capture-batches?tenantId=${encodeURIComponent(tenantId)}&limit=100`)
        .then((response) => response.json() as Promise<CaptureBatchListResponse>);
      if (!body.ok) {
        return null;
      }
      return body.batches?.find((batch) => batch.id === batchId) ?? null;
    } catch {
      return null;
    }
  }

  async function startCaptureSession(): Promise<CaptureBatchRecord | null> {
    if (captureBusy) {
      return captureSession;
    }
    setCaptureBusy("capture-start");
    setCaptureStatus("Starting a fresh capture batch...");
    try {
      const body = await fetch("/api/fielddocs/capture-batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId })
      }).then((response) => response.json() as Promise<CaptureBatchMutationResponse>);
      if (!body.ok || !body.batch) {
        setCaptureStatus(body.error ?? "Capture session could not start.");
        return null;
      }
      setCaptureSession({ ...body.batch, media: body.media ?? [] });
      setCaptureSessionMode("fresh");
      setCaptureSessionOrigin("new");
      setCaptureSelectedMediaId("");
      resetCaptureAssignmentDraft();
      setCaptureStatus("Camera is ready. Capture one or more photos, then choose where they go.");
      openCaptureWorkspace("session");
      return { ...body.batch, media: body.media ?? [] };
    } catch {
      setCaptureStatus("Capture session could not start.");
      return null;
    } finally {
      setCaptureBusy("");
    }
  }

  async function loadCaptureTargets(clientId: string): Promise<void> {
    if (!clientId) {
      setCaptureTargets({ jobs: [], visits: [] });
      return;
    }
    setCaptureBusy("capture-targets");
    setCaptureStatus("Loading open jobs and visits for that client...");
    try {
      const body = await fetch(`/api/fielddocs/clients/${encodeURIComponent(clientId)}/targets?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<CaptureClientTargetsResponse>);
      if (!body.ok) {
        setCaptureTargets({ jobs: [], visits: [] });
        setCaptureStatus(body.error ?? "Client capture targets are unavailable.");
        return;
      }
      setCaptureTargets({ jobs: body.jobs ?? [], visits: body.visits ?? [] });
      setCaptureStatus(body.jobs?.length || body.visits?.length ? "Choose a job or visit, or leave this client-level only." : "No open jobs or visits are available. Photos will attach at the client level.");
    } catch {
      setCaptureTargets({ jobs: [], visits: [] });
      setCaptureStatus("Client capture targets are unavailable.");
    } finally {
      setCaptureBusy("");
    }
  }

  async function uploadCapturePhotos(files: FileList | null): Promise<void> {
    if (!files?.length) {
      return;
    }
    const activeBatch = captureSession ?? await startCaptureSession();
    if (!activeBatch) {
      return;
    }
    setCaptureBusy("capture-upload");
    setCaptureStatus(`Uploading ${files.length} capture${files.length === 1 ? "" : "s"}...`);
    try {
      for (const file of Array.from(files)) {
        const fileBase64 = await fileToBase64(file);
        const mime = file.type || "image/jpeg";
        const body = await fetch("/api/fielddocs/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tenantId: operatorContext.tenantId,
            captureBatchId: activeBatch.id,
            filename: file.name,
            mime,
            fileBase64,
            tags: ["nexcam-capture-tool"],
            capturedBy: operatorContext.tenantUserId,
            ...(mime.startsWith("image/") ? { imageBase64: fileBase64, imageMime: mime } : {})
          })
        }).then((response) => response.json() as Promise<UploadMediaResponse>);
        if (!body.ok || !body.media) {
          throw new Error(body.error ?? "Capture upload failed.");
        }
      }
      const refreshed = await fetchCaptureBatch(activeBatch.id);
      if (refreshed) {
        setCaptureSession(refreshed);
        if (refreshed.status === "assigned") {
          setCaptureSessionMode("continued");
        } else if (refreshed.status === "unassigned") {
          setCaptureSessionMode("unassigned");
        } else {
          setCaptureSessionMode("fresh");
        }
      }
      setCaptureStatus(captureSessionOrigin === "reopened"
        ? "Photos saved back into this batch. Markup is optional. Keep capturing or tap Done to return it where it belongs."
        : "Photos saved. Markup is optional. Keep capturing, or tap Done when you're ready to route this batch.");
      await loadCaptureInbox();
    } catch (error) {
      setCaptureStatus(error instanceof Error ? error.message : "Capture upload failed.");
    } finally {
      setCaptureBusy("");
    }
  }

  async function markCaptureDecideLater(): Promise<void> {
    if (!captureSession) {
      return;
    }
    setCaptureBusy("capture-decide-later");
    setCaptureStatus("Parking this batch in the unassigned inbox...");
    try {
      const body = await fetch(`/api/fielddocs/capture-batches/${encodeURIComponent(captureSession.id)}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId, mode: "decide_later" })
      }).then((response) => response.json() as Promise<CaptureBatchMutationResponse>);
      if (!body.ok || !body.batch) {
        setCaptureStatus(body.error ?? "Could not move this batch to the unassigned inbox.");
        return;
      }
      setCaptureSession(body.batch);
      setCaptureSessionMode("unassigned");
      setCaptureStatus("This batch is waiting in the unassigned inbox. You can keep capturing or route it later.");
      emitCrmMutation();
      await loadCaptureInbox();
    } catch {
      setCaptureStatus("Could not move this batch to the unassigned inbox.");
    } finally {
      setCaptureBusy("");
    }
  }

  async function assignCaptureToExistingClient(): Promise<void> {
    if (!captureSession || !captureSelectedClientId) {
      setCaptureStatus("Choose an existing client before attaching this batch.");
      return;
    }
    setCaptureBusy("capture-assign-existing");
    setCaptureStatus("Attaching this batch to the selected client...");
    try {
      const body = await fetch(`/api/fielddocs/capture-batches/${encodeURIComponent(captureSession.id)}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          mode: "existing_client",
          clientId: captureSelectedClientId,
          ...(captureSelectedJobId ? { jobId: captureSelectedJobId } : {}),
          ...(captureSelectedVisitId ? { visitId: captureSelectedVisitId } : {})
        })
      }).then((response) => response.json() as Promise<CaptureBatchMutationResponse>);
      if (!body.ok || !body.batch) {
        setCaptureStatus(body.error ?? "Could not attach this batch to the selected client.");
        return;
      }
      setCaptureSession(body.batch);
      setCaptureSessionMode("continued");
      resetCaptureAssignmentDraft();
      setCaptureStatus("This capture session is now scoped to the selected client. Keep shooting or tap done when you're finished.");
      emitCrmMutation();
      await loadCaptureInbox();
      if (selectedClientId === captureSelectedClientId) {
        await refreshClientRails(selectedClientId);
      }
    } catch {
      setCaptureStatus("Could not attach this batch to the selected client.");
    } finally {
      setCaptureBusy("");
    }
  }

  function routeCaptureToNewRequest(batch = captureSession): void {
    if (!batch) {
      return;
    }
    setCaptureRequestIntent({ batchId: batch.id, mediaIds: batch.media.map((entry) => entry.id) });
    setCaptureSessionMode("new-client");
    resetCaptureAssignmentDraft();
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    setMobileNavOpen(false);
    setNotificationsOpen(false);
    setActiveModule("requests");
    window.history.pushState({}, "", "/nexops/requests");
  }

  async function handleCaptureRequestCreated(request: { id: string; clientName: string; selectedClientId?: string }): Promise<void> {
    if (!captureRequestIntent) {
      return;
    }
    setCaptureBusy("capture-assign-request");
    setCaptureStatus("Attaching the capture batch to the new request...");
    try {
      const body = await fetch(`/api/fielddocs/capture-batches/${encodeURIComponent(captureRequestIntent.batchId)}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          mode: "request",
          requestId: request.id
        })
      }).then((response) => response.json() as Promise<CaptureBatchMutationResponse>);
      if (!body.ok || !body.batch) {
        setCaptureStatus(body.error ?? "The new request saved, but the capture batch did not attach yet.");
        return;
      }
      setCaptureSession(body.batch);
      setCaptureSessionMode("continued");
      setCaptureRequestIntent(null);
      setCaptureWorkspaceView("session");
      setCaptureStatus(`Request ${request.id} saved. Further photos in this session now attach directly to ${request.clientName}.`);
      emitCrmMutation();
      openCaptureWorkspace("session");
      await loadCaptureInbox();
      if (body.clientId) {
        setSelectedClientId(body.clientId);
        await refreshClientRails(body.clientId);
      }
    } catch {
      setCaptureStatus("The new request saved, but the capture batch did not attach yet.");
    } finally {
      setCaptureBusy("");
    }
  }

  function finishCaptureSession(): void {
    if (captureSessionOrigin === "new" && captureSession?.status === "draft" && captureSession.media.length) {
      setCaptureSessionMode("choose");
      setCaptureStatus("Choose where this capture batch should go: New Client, Existing Client, or Decide Later.");
      return;
    }
    const returnToInbox = captureSessionOrigin === "reopened" && captureSession?.status === "unassigned";
    setCaptureSession(null);
    setCaptureSessionMode("fresh");
    setCaptureSessionOrigin("new");
    setCaptureSelectedMediaId("");
    setCaptureRequestIntent(null);
    resetCaptureAssignmentDraft();
    if (returnToInbox) {
      setCaptureStatus("Reopened batch saved. It is back in the unassigned inbox until you route it.");
      setCaptureWorkspaceView("unassigned");
      setActiveModule("capture");
      window.history.pushState({}, "", "/nexops/capture");
      void loadCaptureInbox();
      return;
    }
    setCaptureStatus("Capture session closed. Open the camera again for a fresh batch.");
    setCaptureWorkspaceView("session");
    setActiveModule("home");
    window.history.pushState({}, "", "/nexops");
  }

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeModule]);

  useEffect(() => {
    document.body.classList.toggle("nexops-mobile-nav-open", mobileNavOpen);
    return () => document.body.classList.remove("nexops-mobile-nav-open");
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return undefined;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!createMenuOpen && !notificationsOpen && !moduleSwitcherOpen) {
      return undefined;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (!isDismissKey(event.key)) {
        return;
      }
      setCreateMenuOpen(false);
      setNotificationsOpen(false);
      setModuleSwitcherOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [createMenuOpen, moduleSwitcherOpen, notificationsOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const syncViewport = () => setMobileClientViewport(window.innerWidth <= MOBILE_CLIENT_VIEWPORT_MAX);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !mobileFabVisibleForViewport(window.innerWidth)) {
      return undefined;
    }
    if (!shouldPulseMobileCreateFab(window.localStorage.getItem(NEXOPS_MOBILE_CREATE_FAB_PULSE_KEY))) {
      return undefined;
    }
    setMobileCreateFabPulse(true);
    window.localStorage.setItem(NEXOPS_MOBILE_CREATE_FAB_PULSE_KEY, "seen");
    const timer = window.setTimeout(() => setMobileCreateFabPulse(false), 1600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    let lastScrollY = window.scrollY;
    let idleTimer = 0;
    const syncFabState = () => {
      if (!mobileFabVisibleForViewport(window.innerWidth)) {
        setMobileCreateFabCollapsed(false);
        lastScrollY = window.scrollY;
        return;
      }
      const nextScrollY = window.scrollY;
      const intent = getMobileCreateFabScrollIntent(lastScrollY, nextScrollY);
      if (intent === "collapse") {
        setMobileCreateFabCollapsed(true);
      } else if (intent === "expand") {
        setMobileCreateFabCollapsed(false);
      }
      lastScrollY = nextScrollY;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setMobileCreateFabCollapsed(false), NEXOPS_MOBILE_CREATE_FAB_IDLE_MS);
    };
    window.addEventListener("scroll", syncFabState, { passive: true });
    window.addEventListener("resize", syncFabState);
    return () => {
      window.removeEventListener("scroll", syncFabState);
      window.removeEventListener("resize", syncFabState);
      window.clearTimeout(idleTimer);
    };
  }, []);

  useEffect(() => {
    if (createMenuOpen || mobileNavOpen || notificationsOpen || moduleSwitcherOpen) {
      setMobileCreateFabCollapsed(false);
    }
  }, [createMenuOpen, mobileNavOpen, moduleSwitcherOpen, notificationsOpen]);

  useEffect(() => {
    if (!captureSession?.mediaIds.length) {
      setCaptureSelectedMediaId("");
      return;
    }
    setCaptureSelectedMediaId((current) => current && captureSession.mediaIds.includes(current)
      ? current
      : captureSession.mediaIds[captureSession.mediaIds.length - 1] ?? "");
  }, [captureSession?.id, captureSession?.mediaIds.join("|")]);

  useEffect(() => {
    if (activeModule === "capture") {
      void loadCaptureInbox();
    }
  }, [activeModule, operatorContext.tenantId]);

  async function refreshRelatedRecords(tenantId = operatorContext.tenantId): Promise<void> {
    try {
      const [propertiesBody, jobsBody, quotesBody, invoicesBody, tenantUsersBody, requestsBody, paymentsBody, receiptReviewsBody] = await Promise.all([
        fetch(`/api/crm/properties?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/crm/jobs?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/crm/quotes?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/crm/invoices?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRecordsResponse>),
        fetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}/users`).then((response) => response.json() as Promise<TenantUsersResponse>),
        fetch(`/api/crm/requests?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmRequestsResponse>),
        fetch(`/api/crm/payments?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmPaymentsResponse>),
        fetch(`/api/crm/receipt-reviews?tenantId=${encodeURIComponent(tenantId)}`).then((response) => response.json() as Promise<CrmReceiptReviewsResponse>)
      ]);
      setProperties(propertiesBody.ok ? propertiesBody.properties ?? [] : []);
      setJobs(jobsBody.ok ? jobsBody.jobs ?? [] : []);
      setQuotes(quotesBody.ok ? quotesBody.quotes ?? [] : []);
      setInvoices(invoicesBody.ok ? invoicesBody.invoices ?? [] : []);
      setTenantUsers(tenantUsersBody.ok ? tenantUsersBody.users ?? [] : []);
      setRequests(requestsBody.ok ? requestsBody.requests ?? [] : []);
      setPayments(paymentsBody.ok ? paymentsBody.payments ?? [] : []);
      setReceiptReviews(receiptReviewsBody.ok ? receiptReviewsBody.receiptReviews ?? [] : []);
    } catch {
      setProperties([]);
      setJobs([]);
      setQuotes([]);
      setInvoices([]);
      setTenantUsers([]);
      setRequests([]);
      setPayments([]);
      setReceiptReviews([]);
    }
  }

  async function refresh(): Promise<void> {
    setStatus("Loading clients...");
    try {
      const body = await fetch(`/api/crm/clients?tenantId=${encodeURIComponent(operatorContext.tenantId)}`)
        .then((response) => response.json() as Promise<CrmClientsResponse>);
      if (!body.ok) {
        setClients([]);
        setStatus(body.error ?? "Clients are unavailable right now.");
        return;
      }
      const nextClients = body.clients ?? [];
      setClients(nextClients);
      await refreshRelatedRecords(operatorContext.tenantId);
      setSelectedClientId((current) => {
        if (current && nextClients.some((client) => client.id === current)) {
          return current;
        }
        return activeClientProfileTab ? current : nextClients[0]?.id ?? "";
      });
      setStatus(nextClients.length ? `${nextClients.length} native NexOps client${nextClients.length === 1 ? "" : "s"} loaded.` : "No native NexOps clients yet.");
    } catch {
      setClients([]);
      setProperties([]);
      setJobs([]);
      setQuotes([]);
      setInvoices([]);
      setTenantUsers([]);
      setRequests([]);
      setPayments([]);
      setReceiptReviews([]);
      setStatus("Clients API unreachable.");
    }
  }

  async function refreshClientRails(clientId = selectedClientId, tenantId = operatorContext.tenantId): Promise<void> {
    if (!clientId) {
      setClientPortalActivity([]);
      setClientReviewSequences([]);
      setClientFieldMedia([]);
      setClientFieldReports([]);
      setClientSignedDocuments([]);
      setClientRailStatus("Portal activity and review follow-up will load when a client is selected.");
      return;
    }
    setClientRailStatus("Loading portal activity, review follow-up, and NexCam rails...");
    try {
      const [activityBody, reviewBody, mediaBody, reportsBody, signedDocsBody] = await Promise.all([
        fetch(`/api/crm/clients/${encodeURIComponent(clientId)}/portal-activity?tenantId=${encodeURIComponent(tenantId)}`)
          .then((response) => response.json() as Promise<ClientPortalActivityResponse>),
        fetch(`/api/crm/review-sequences?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}`)
          .then((response) => response.json() as Promise<ReviewSequenceStatusResponse>),
        fetch(`/api/fielddocs/media?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}&limit=8`)
          .then((response) => response.json() as Promise<FieldDocsMediaListResponse>),
        fetch(`/api/fielddocs/reports?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}&limit=6`)
          .then((response) => response.json() as Promise<FieldDocsReportsListResponse>),
        fetch(`/api/fielddocs/signed-documents?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}`)
          .then((response) => response.json() as Promise<SignedDocumentsResponse>)
      ]);
      const nextActivity = activityBody.ok ? activityBody.activity ?? [] : [];
      const nextSequences = reviewBody.ok ? reviewBody.sequences ?? [] : [];
      const nextMedia = mediaBody.ok ? mediaBody.media ?? [] : [];
      const nextReports = reportsBody.ok ? reportsBody.reports ?? [] : [];
      const nextSignedDocs = signedDocsBody.ok ? (signedDocsBody.records ?? []) : [];
      setClientPortalActivity(nextActivity);
      setClientReviewSequences(nextSequences);
      setClientFieldMedia(nextMedia);
      setClientFieldReports(nextReports);
      setClientSignedDocuments(nextSignedDocs);
      if (!activityBody.ok || !reviewBody.ok || !mediaBody.ok || !reportsBody.ok || !signedDocsBody.ok) {
        setClientRailStatus(activityBody.error ?? reviewBody.error ?? mediaBody.error ?? reportsBody.error ?? signedDocsBody.error ?? "Client portal rails are unavailable right now.");
        return;
      }
      setClientRailStatus(
        nextSequences.length
          ? `${nextActivity.length} portal event${nextActivity.length === 1 ? "" : "s"}, ${nextSequences.length} review sequence${nextSequences.length === 1 ? "" : "s"}, ${nextMedia.length} media item${nextMedia.length === 1 ? "" : "s"}, ${nextReports.length} report${nextReports.length === 1 ? "" : "s"}, and ${nextSignedDocs.length} signed doc${nextSignedDocs.length === 1 ? "" : "s"} loaded.`
          : nextActivity.length
            ? `${nextActivity.length} portal event${nextActivity.length === 1 ? "" : "s"} loaded. No review follow-up is active for this client. ${nextMedia.length} media item${nextMedia.length === 1 ? "" : "s"}, ${nextReports.length} report${nextReports.length === 1 ? "" : "s"}, and ${nextSignedDocs.length} signed doc${nextSignedDocs.length === 1 ? "" : "s"} are on the rail.`
            : nextMedia.length || nextReports.length || nextSignedDocs.length
              ? `No portal activity or review follow-up is recorded yet. NexCam already has ${nextMedia.length} media item${nextMedia.length === 1 ? "" : "s"}, ${nextReports.length} report${nextReports.length === 1 ? "" : "s"}, and ${nextSignedDocs.length} signed doc${nextSignedDocs.length === 1 ? "" : "s"} for this client.`
              : "No portal activity, review follow-up, or NexCam media is recorded for this client yet."
      );
    } catch {
      setClientPortalActivity([]);
      setClientReviewSequences([]);
      setClientFieldMedia([]);
      setClientFieldReports([]);
      setClientSignedDocuments([]);
      setClientRailStatus("Client portal rails are unavailable right now.");
    }
  }





  useEffect(() => {
    void refreshClientRails(selectedClientId, operatorContext.tenantId);
  }, [selectedClientId, operatorContext.tenantId]);

  async function sendClientPortalLink(clientId: string, propertyId?: string): Promise<void> {
    setClientRailBusy(propertyId ? `portal-link-${propertyId}` : "portal-link");
    setClientRailStatus("Sending portal link...");
    try {
      const body = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}/portal-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          ...(propertyId ? { propertyId } : {})
        })
      }).then((response) => response.json() as Promise<SendPortalLinkResponse>);
      if (!body.ok || !body.portalLink) {
        setClientRailStatus(body.error ?? "Portal link could not be sent.");
        return;
      }
      setLastPortalLink(body.portalLink);
      setClientRailStatus(`Portal link sent by ${body.delivery ?? "direct"} to ${body.target ?? "the saved client destination"}.`);
      await refreshClientRails(clientId, operatorContext.tenantId);
    } catch {
      setClientRailStatus("Portal link could not be sent.");
    } finally {
      setClientRailBusy("");
    }
  }



  async function sendClientStatement(clientId: string): Promise<void> {
    setClientRailBusy("send-statement");
    setClientRailStatus("Sending client statement...");
    try {
      const body = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}/statements/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: operatorContext.tenantId })
      }).then((response) => response.json() as Promise<{ ok: boolean; target?: string; error?: string }>);
      if (!body.ok) {
        setClientRailStatus(body.error ?? "Statement send failed.");
        return;
      }
      setClientRailStatus(`Statement sent to ${body.target ?? "the saved client destination"}.`);
      await refreshClientRails(clientId, operatorContext.tenantId);
    } catch {
      setClientRailStatus("Statement send failed.");
    } finally {
      setClientRailBusy("");
    }
  }

  async function deleteClientRecord(clientId: string): Promise<void> {
    const client = clients.find((entry) => entry.id === clientId);
    if (!client) {
      setClientRailStatus("That client is no longer on the rail.");
      return;
    }
    const confirmed = window.confirm(
      `Delete ${clientDisplayName(client)}? This removes the client and any linked properties only when there is no saved request, quote, job, or invoice history.`
    );
    if (!confirmed) {
      return;
    }
    setClientRailBusy("delete-client");
    setClientRailStatus(`Deleting ${clientDisplayName(client)}...`);
    try {
      const response = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}?tenantId=${encodeURIComponent(operatorContext.tenantId)}`, {
        method: "DELETE"
      });
      const body = await response.json() as { ok: boolean; error?: string; deletedPropertyIds?: string[] };
      if (!response.ok || !body.ok) {
        setClientRailStatus(body.error ?? "Client delete failed.");
        return;
      }
      emitCrmMutation();
      returnToClientRoster();
      await refresh();
      setClientRailStatus(`${clientDisplayName(client)} deleted${body.deletedPropertyIds?.length ? ` with ${body.deletedPropertyIds.length} linked propert${body.deletedPropertyIds.length === 1 ? "y" : "ies"}` : ""}.`);
    } catch {
      setClientRailStatus("Client delete failed.");
    } finally {
      setClientRailBusy("");
    }
  }



  async function saveClientMarketingConsent(clientId: string, marketing: boolean): Promise<void> {
    setClientRailBusy("marketing-consent");
    setClientRailStatus(marketing
      ? "Turning marketing consent on..."
      : "Turning marketing consent off and checking live showcases...");
    try {
      const body = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          consent: {
            ...(selectedClient?.consent.email !== undefined ? { email: selectedClient.consent.email } : {}),
            ...(selectedClient?.consent.sms !== undefined ? { sms: selectedClient.consent.sms } : {}),
            marketing
          }
        })
      }).then((response) => response.json() as Promise<CrmClientCreateResponse>);
      if (!body.ok || !body.client) {
        setClientRailStatus(body.error ?? "Marketing consent could not be updated.");
        return;
      }
      setClients((current) => current.map((client) => client.id === body.client?.id ? body.client : client));
      setClientRailStatus(marketing
        ? "Marketing consent is on for this client."
        : "Marketing consent is off. Future NexReach generation is blocked and any live showcase is flagged for review.");
    } catch {
      setClientRailStatus("Marketing consent could not be updated.");
    } finally {
      setClientRailBusy("");
    }
  }

  async function saveClientOverviewCustomFields(clientId: string): Promise<void> {
    if (!selectedClient) {
      return;
    }
    if (clientOverviewCustomFieldValidation.hasBlockingIssues) {
      setClientRailStatus("Custom field labels must be unique and cannot reuse built-in labels.");
      return;
    }
    setClientRailBusy("custom-fields");
    setClientRailStatus("Saving custom fields...");
    try {
      const body = await fetch(`/api/crm/clients/${encodeURIComponent(clientId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: operatorContext.tenantId,
          customFields: {
            ...(selectedClient.customFields ?? {}),
            ...customFieldDraftRowsToRecord(clientOverviewCustomFieldsDraft, CLIENT_CUSTOM_FIELD_RESERVED_LABELS)
          }
        })
      }).then((response) => response.json() as Promise<CrmClientCreateResponse>);
      if (!body.ok || !body.client) {
        setClientRailStatus(body.error ?? "Custom fields could not be saved.");
        return;
      }
      setClients((current) => current.map((client) => client.id === body.client?.id ? body.client : client));
      setClientOverviewCustomFieldsDraft(
        customFieldRecordToDraftRows(body.client.customFields, CLIENT_CUSTOM_FIELD_RESERVED_LABELS, "client_profile")
      );
      setClientOverviewCustomFieldsOpen(false);
      setClientRailStatus("Custom fields saved.");
    } catch {
      setClientRailStatus("Custom fields could not be saved.");
    } finally {
      setClientRailBusy("");
    }
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

  function clearWorkspaceTargets(): void {
    setFocusedRequestId("");
    setFocusedQuoteId("");
    setFocusedJobId("");
    setFocusedInvoiceId("");
  }

  function clearWorkspaceFilters(): void {
    setRequestFilterIntent(undefined);
    setQuoteFilterIntent(undefined);
    setJobFilterIntent(undefined);
    setInvoiceFilterIntent(undefined);
    setScheduleScopeIntent(undefined);
  }

  function closeHeaderPanels(): void {
    setMobileNavOpen(false);
    setNotificationsOpen(false);
    setCreateMenuOpen(false);
    setModuleSwitcherOpen(false);
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

  function setModule(module: NexOpsModule): void {
    const targetPath = buildModulePath(module);
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setCreatingClientPage(false);
    setActiveModule(module);
    if (module !== "clients") {
      setActiveClientProfileTab(null);
    }
    window.history.pushState({}, "", targetPath);
  }

  function returnToHomeModule(): void {
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setCreatingClientPage(false);
    setShowCreateClient(false);
    setSelectedClientId("");
    setActiveClientProfileTab(null);
    setActiveModule("home");
    window.history.pushState({}, "", buildModulePath("home"));
  }

  function openClientProfile(clientId: string, tab: ClientProfileTab = "overview"): void {
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setCreatingClientPage(false);
    setShowCreateClient(false);
    setSelectedClientId(clientId);
    setActiveModule("clients");
    setActiveClientProfileTab(tab);
    window.history.pushState({}, "", buildClientProfilePath(clientId, tab));
  }

  function returnToClientRoster(): void {
    closeHeaderPanels();
    setCreatingClientPage(false);
    setShowCreateClient(false);
    setClientFormMode("create");
    setSelectedClientId("");
    setActiveModule("clients");
    setActiveClientProfileTab(null);
    window.history.pushState({}, "", buildModulePath("clients"));
  }

  function setClientProfileTabRoute(tab: ClientProfileTab): void {
    if (!selectedClientId) {
      return;
    }
    closeHeaderPanels();
    setCreatingClientPage(false);
    setActiveModule("clients");
    setActiveClientProfileTab(tab);
    window.history.pushState({}, "", buildClientProfilePath(selectedClientId, tab));
  }

  function openNewClientWorkspace(): void {
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setShowCreateClient(false);
    setCreatingClientPage(true);
    setClientFormMode("create");
    setCreateStatus("");
    setNewClient(blankNewClientDraft());
    setSelectedClientId("");
    setActiveModule("clients");
    setActiveClientProfileTab(null);
    window.history.pushState({}, "", buildNewClientPath());
  }

  function openCreateClientDrawer(surface: "client" | "contact" | "property" = "client"): void {
    setCreateClientSurface(surface);
    setClientFormMode("create");
    setCreateStatus("");
    setNewClient(blankNewClientDraft());
    closeHeaderPanels();
    setShowCreateClient(true);
  }

  function openEditClientWorkspace(): void {
    if (!selectedClient) {
      return;
    }
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setShowCreateClient(false);
    setCreatingClientPage(true);
    setClientFormMode("edit");
    setCreateStatus("");
    setNewClient(draftFromExistingClient(selectedClient, selectedProperties[0] ?? null));
    setActiveModule("clients");
  }

  function closeClientFormWorkspace(): void {
    if (clientFormMode === "edit" && selectedClientId) {
      setClientFormMode("create");
      openClientProfile(selectedClientId, activeClientProfileTab ?? "overview");
      return;
    }
    setClientFormMode("create");
    returnToClientRoster();
  }

  function openWorkspaceProduct(product: "nexops" | "nexcam" | "nexdocs" | "nexportal" | "nexreach"): void {
    if (product === "nexdocs") {
      if (selectedClientId) {
        setClientProfileTabRoute("nexdocs");
        return;
      }
      closeHeaderPanels();
      setClientRailStatus("Open any client to enter NexDocs from the dedicated client profile.");
      setModule("clients");
      return;
    }
    closeHeaderPanels();
    const targetPath = buildWorkspaceSwitchPath(product, operatorContext.tenantId, selectedClientId || undefined);
    if (targetPath.startsWith("/nexops")) {
      window.history.pushState({}, "", targetPath);
      const nextPathState = parseNexOpsLocation(targetPath);
      setActiveModule(nextPathState.module);
      setSelectedClientId(nextPathState.clientId ?? "");
      setActiveClientProfileTab(nextPathState.clientTab);
      return;
    }
    window.location.assign(targetPath);
  }

  function handleCreateSelection(option: NexOpsCreateOption): void {
    if (option.workflow.kind === "client-page") {
      openNewClientWorkspace();
      return;
    }
    if (option.workflow.kind === "drawer") {
      openCreateClientDrawer(option.workflow.surface);
      return;
    }
    closeHeaderPanels();
    setModule(option.workflow.module);
  }

  function openInvoiceWorkspace(invoiceId: string): void {
    clearWorkspaceTargets();
    setFocusedInvoiceId(invoiceId);
    clearWorkspaceFilters();
    closeHeaderPanels();
    setActiveModule("invoices");
    setActiveClientProfileTab(null);
    window.history.pushState({}, "", buildModulePath("invoices"));
  }

  function openWorkspaceTarget(target: WorkspaceTarget): void {
    clearWorkspaceTargets();
    clearWorkspaceFilters();
    closeHeaderPanels();
    setActiveClientProfileTab(null);
    switch (target.module) {
      case "requests":
        if (target.objectId) {
          setFocusedRequestId(target.objectId);
        }
        if (target.filterKey === "status") {
          setRequestFilterIntent(target.filterValue as "all" | "new" | "archived" | "converted_to_quote" | "converted_to_job");
        }
        setActiveModule("requests");
        window.history.pushState({}, "", "/nexops/requests");
        return;
      case "quotes":
        if (target.objectId) {
          setFocusedQuoteId(target.objectId);
        }
        if (target.filterKey === "status") {
          setQuoteFilterIntent(target.filterValue as "all" | "draft" | "sent" | "change_requested" | "approved" | "approved_pending_conversion" | "expired");
        }
        setActiveModule("quotes");
        window.history.pushState({}, "", "/nexops/quotes");
        return;
      case "jobs":
        if (target.objectId) {
          setFocusedJobId(target.objectId);
        }
        if (target.filterKey === "status") {
          setJobFilterIntent(target.filterValue as "All" | "Upcoming" | "Today" | "Late" | "Unscheduled" | "Action Required" | "Requires Invoicing" | "Archived");
        }
        setActiveModule("jobs");
        window.history.pushState({}, "", "/nexops/jobs");
        return;
      case "invoices":
      case "payments":
        if (target.objectId) {
          setFocusedInvoiceId(target.objectId);
        }
        if (target.filterKey === "status") {
          setInvoiceFilterIntent(target.filterValue as "all" | "draft" | "awaiting" | "partial_pay" | "paid" | "void" | "bad_debt" | "past_due");
        }
        setActiveModule(target.module);
        window.history.pushState({}, "", target.module === "payments" ? "/nexops/payments" : "/nexops/invoices");
        return;
      case "capture":
        setCaptureWorkspaceView(target.filterValue === "unassigned" ? "unassigned" : "session");
        setActiveModule("capture");
        window.history.pushState({}, "", "/nexops/capture");
        return;
      case "schedule":
        if (target.filterKey === "scope") {
          setScheduleScopeIntent(target.filterValue as ScheduleScope);
        }
        setActiveModule("schedule");
        window.history.pushState({}, "", "/nexops/schedule");
        return;
      default:
        return;
    }
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
      openWorkspaceTarget({ module: entry.target.module, objectId: entry.target.objectId });
      void loadNotifications();
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

  async function createClientFromForm(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!createClientCanSave) {
      if (clientCustomFieldValidation.hasBlockingIssues) {
        setCreateStatus("Resolve duplicate or reserved client custom field labels before saving.");
        return;
      }
      if (propertyCustomFieldValidation.hasBlockingIssues) {
        setCreateStatus("Resolve duplicate or reserved property custom field labels before saving.");
        return;
      }
      setCreateStatus(`Add ${createClientMissingFields.join(", ")} before this client can be saved. Email is recommended, but it is optional.`);
      return;
    }
    const editing = clientFormMode === "edit";
    if (editing && !selectedClientId) {
      setCreateStatus("Open a saved client record before trying to edit it.");
      return;
    }
    setCreateStatus(editing ? "Saving client changes..." : "Creating client...");
    const personName = {
      ...(newClient.title && newClient.title !== "No title" ? { title: newClient.title } : {}),
      firstName: newClient.firstName.trim(),
      lastName: newClient.lastName.trim()
    };
    const company = newClient.company.trim();
    const displayName = company && newClient.displayNamePreference === "company"
      ? company
      : personDisplayName(personName) || company;
    if (!displayName) {
      setCreateStatus("Add a client name or company name first.");
      return;
    }
    const phoneValue = newClient.phone.trim();
    const emailValue = newClient.email.trim();
    const additionalPhones = (newClient.additionalPhones ?? [])
      .filter((entry: ClientPhoneDraft) => entry.value.trim())
      .map((entry: ClientPhoneDraft) => ({
        label: entry.label,
        value: entry.value.trim(),
        primary: false,
        receivesMessages: entry.receivesMessages,
        smsCapability: entry.smsCapability,
        smsMode: "one_way" as const
      }));
    const additionalEmails = (newClient.additionalEmails ?? [])
      .filter((entry: ClientEmailDraft) => entry.value.trim())
      .map((entry: ClientEmailDraft) => ({
        label: entry.label,
        value: entry.value.trim(),
        primary: false
      }));
    const allContactPhones = [
      ...(phoneValue ? [{
        label: newClient.phoneLabel,
        value: phoneValue,
        primary: true,
        receivesMessages: newClient.phoneReceivesMessages,
        smsCapability: newClient.smsCapability,
        smsMode: "one_way" as const
      }] : []),
      ...additionalPhones
    ];
    const allContactEmails = [
      ...(emailValue ? [{
        label: newClient.emailLabel,
        value: emailValue,
        primary: true
      }] : []),
      ...additionalEmails
    ];
    const contact: CrmContact = {
      personName,
      ...(company ? { company } : {}),
      ...(newClient.role.trim() ? { role: newClient.role.trim() } : {}),
      correspondenceContact: true,
      billingContact: true,
      phones: allContactPhones,
      emails: allContactEmails,
      channelPreference: allContactEmails.length && newClient.phoneReceivesMessages ? "both" : newClient.phoneReceivesMessages ? "sms" : "email"
    };
    const propertyAddress = newClient.street1.trim() ? {
      street1: newClient.street1.trim(),
      ...(newClient.street2.trim() ? { street2: newClient.street2.trim() } : {}),
      city: newClient.city.trim(),
      province: newClient.province.trim(),
      postalCode: newClient.postalCode.trim(),
      country: "USA"
    } : undefined;
    const separateBillingAddress = newClient.billingStreet1.trim() ? {
      street1: newClient.billingStreet1.trim(),
      ...(newClient.billingStreet2.trim() ? { street2: newClient.billingStreet2.trim() } : {}),
      city: newClient.billingCity.trim(),
      province: newClient.billingProvince.trim(),
      postalCode: newClient.billingPostalCode.trim(),
      country: "USA"
    } : undefined;
    const billingAddress = newClient.billingSameAsPrimaryProperty ? propertyAddress : separateBillingAddress;
    const additionalContacts: CrmContact[] = [];
    if (newClient.additionalContactName.trim() || newClient.additionalContactPhone.trim() || newClient.additionalContactEmail.trim()) {
      additionalContacts.push({
        ...(newClient.additionalContactName.trim() ? { company: newClient.additionalContactName.trim() } : {}),
        role: newClient.additionalContactRole.trim() || "Additional contact",
        correspondenceContact: false,
        billingContact: false,
        phones: newClient.additionalContactPhone.trim() ? [{
          label: "Other",
          value: newClient.additionalContactPhone.trim(),
          primary: false,
          receivesMessages: false,
          smsCapability: "unknown",
          smsMode: "one_way"
        }] : [],
        emails: newClient.additionalContactEmail.trim() ? [{
          label: "Other",
          value: newClient.additionalContactEmail.trim(),
          primary: false
        }] : [],
        channelPreference: "none"
      });
    }
    const clientCustomFields: Record<string, string | number | boolean> = {};
    if (newClient.leadSource.trim()) {
      clientCustomFields.leadSource = newClient.leadSource.trim();
    }
    if (newClient.paymentTerms.trim()) {
      clientCustomFields.paymentTerms = newClient.paymentTerms.trim();
    }
    if (newClient.referredBy.trim()) {
      clientCustomFields.referredBy = newClient.referredBy.trim();
    }
    if (newClient.promoCode.trim()) {
      clientCustomFields.promoCode = newClient.promoCode.trim();
    }
    clientCustomFields.askForReview = newClient.askForReview;
    Object.assign(
      clientCustomFields,
      customFieldDraftRowsToRecord(newClient.clientCustomFieldsDraft ?? [], CLIENT_CUSTOM_FIELD_RESERVED_LABELS)
    );
    const propertyCustomFields: Record<string, string | number | boolean> = {};
    propertyCustomFields.gatedEntry = newClient.propertyGatedEntry;
    if (newClient.propertyClientName.trim()) {
      propertyCustomFields.propertyClientName = newClient.propertyClientName.trim();
    }
    if (newClient.propertyClientPhone.trim()) {
      propertyCustomFields.propertyClientPhone = newClient.propertyClientPhone.trim();
    }
    if (newClient.propertyClientEmail.trim()) {
      propertyCustomFields.propertyClientEmail = newClient.propertyClientEmail.trim();
    }
    Object.assign(
      propertyCustomFields,
      customFieldDraftRowsToRecord(newClient.propertyCustomFieldsDraft ?? [], PROPERTY_CUSTOM_FIELD_RESERVED_LABELS)
    );
    const propertyContacts: CrmContact[] = [];
    if (newClient.propertyClientName.trim() || newClient.propertyClientPhone.trim() || newClient.propertyClientEmail.trim()) {
      propertyContacts.push({
        ...(newClient.propertyClientName.trim() ? { company: newClient.propertyClientName.trim() } : {}),
        role: "Property contact",
        correspondenceContact: false,
        billingContact: false,
        phones: newClient.propertyClientPhone.trim() ? [{
          label: "Other",
          value: newClient.propertyClientPhone.trim(),
          primary: true,
          receivesMessages: false,
          smsCapability: "unknown",
          smsMode: "one_way"
        }] : [],
        emails: newClient.propertyClientEmail.trim() ? [{
          label: "Other",
          value: newClient.propertyClientEmail.trim(),
          primary: true
        }] : [],
        channelPreference: "none"
      });
    }
    try {
      const payload = {
        tenantId: operatorContext.tenantId,
        name: displayName,
        ...(company ? { company } : editing ? { company: null } : {}),
        personName,
        displayNamePreference: company ? newClient.displayNamePreference : "person",
        ...(billingAddress ? { billingAddress } : editing ? { billingAddress: null } : {}),
        billingSameAsPrimaryProperty: newClient.billingSameAsPrimaryProperty,
        contacts: [contact, ...additionalContacts],
        communicationSettings: {
          quotesAndInvoices: contact.channelPreference,
          jobReminders: contact.channelPreference,
          jobClosureFollowUps: "email" as const,
          reviewRequests: contact.channelPreference,
          smsDefaultMode: "one_way" as const
        },
        emails: allContactEmails.map((entry) => entry.value),
        phones: allContactPhones.map((entry) => entry.value),
        consent: { email: Boolean(emailValue), sms: newClient.phoneReceivesMessages, marketing: selectedClient?.consent.marketing ?? false },
        customFields: clientCustomFields,
        ...(propertyAddress ? {
          primaryProperty: {
            siteName: newClient.siteName.trim() || undefined,
            label: newClient.siteName.trim() || propertyAddress.street1,
            address: propertyAddress,
            ...(typeof newClient.propertyGeoLat === "number" && typeof newClient.propertyGeoLng === "number"
              ? { geo: { lat: newClient.propertyGeoLat, lng: newClient.propertyGeoLng } }
              : {}),
            billingAddressSameAsClient: newClient.billingSameAsPrimaryProperty,
            access: {
              gateCode: newClient.propertyGateCodes.trim() || undefined,
              accessNotes: newClient.propertyAccessNotes.trim() || (newClient.propertyGatedEntry ? "Gated entry enabled" : undefined)
            },
            contacts: propertyContacts,
            customFields: propertyCustomFields
          }
        } : {})
      };
      const body = await fetch(editing ? `/api/crm/clients/${encodeURIComponent(selectedClientId)}` : "/api/crm/clients", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }).then((response) => response.json() as Promise<CrmClientCreateResponse>);
      if (!body.ok || !body.client) {
        setCreateStatus(body.error ?? (editing ? "Client could not be updated." : "Client could not be created."));
        return;
      }
      setCreateStatus(`${editing ? "Saved" : "Created"} ${clientDisplayName(body.client)}.`);
      setShowCreateClient(false);
      setCreatingClientPage(false);
      setClientFormMode("create");
      setNewClient(blankNewClientDraft());
      await refresh();
      openClientProfile(body.client.id, "overview");
    } catch {
      setCreateStatus(editing ? "Client update request failed." : "Client create request failed.");
    }
  }

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
    void refresh();
    const onCrmMutation = () => void refresh();
    window.addEventListener("nexops:crm-mutated", onCrmMutation);
    return () => window.removeEventListener("nexops:crm-mutated", onCrmMutation);
  }, [operatorContext.tenantId]);

  useEffect(() => {
    void loadNotifications();
    const onCrmMutation = () => void loadNotifications();
    window.addEventListener("nexops:crm-mutated", onCrmMutation);
    return () => window.removeEventListener("nexops:crm-mutated", onCrmMutation);
  }, [operatorContext.tenantId]);

  useEffect(() => {
    const onPopState = () => {
      const nextLocation = parseNexOpsLocation(window.location.pathname);
      setActiveModule(nextLocation.module);
      setActiveClientProfileTab(nextLocation.clientTab);
      setCreatingClientPage(nextLocation.clientDraft === "new");
      setSelectedClientId(nextLocation.clientId ?? "");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const tenantName = tenantDisplayName(tenantBranding, operatorContext.tenantId);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredClients = clients.filter((client) => {
    if (!normalizedQuery) {
      return true;
    }
    return [
      clientDisplayName(client),
      contactSummary(client),
      clientPrimaryAddress(client),
      ...(client.tags ?? [])
    ].join(" ").toLowerCase().includes(normalizedQuery);
  });
  const selectedClient = selectedClientId
    ? clients.find((client) => client.id === selectedClientId) ?? null
    : filteredClients[0] ?? null;
  const selectedContact = selectedClient?.contacts?.find((contact) => contact.correspondenceContact || contact.billingContact) ?? selectedClient?.contacts?.[0];
  const selectedPhone = selectedContact?.phones?.find((phone) => phone.primary) ?? selectedContact?.phones?.[0];
  const selectedPhoneValue = selectedClient
    ? primaryClientPhoneValue({
      contactPhones: selectedContact?.phones,
      clientPhones: selectedClient.phones
    })
    : "";
  const selectedEmail = selectedContact?.emails?.find((email) => email.primary)?.value ?? selectedContact?.emails?.[0]?.value ?? selectedClient?.emails[0];
  const selectedProperties = selectedClient ? properties.filter((property) => property.clientId === selectedClient.id) : [];
  const selectedRequests = selectedClient ? requests.filter((request) => request.selectedClientId === selectedClient.id) : [];
  const selectedJobs = selectedClient ? jobs.filter((job) => job.clientId === selectedClient.id) : [];
  const selectedQuotes = selectedClient ? quotes.filter((quote) => quote.clientId === selectedClient.id) : [];
  const selectedInvoices = selectedClient ? invoices.filter((invoice) => invoice.clientId === selectedClient.id) : [];
  const selectedPayments = selectedClient ? payments.filter((payment) => payment.clientId === selectedClient.id) : [];
  const selectedReceiptReviewSummaries = selectedClient
    ? receiptReviews.filter((review) => review.clientId === selectedClient.id || selectedInvoices.some((invoice) => invoice.id === review.invoiceId))
    : [];
  const directClientMedia = clientFieldMedia.filter((media) => !media.jobId && !media.visitId);
  const workScopedClientMedia = clientFieldMedia.filter((media) => Boolean(media.jobId || media.visitId));
  const orderedClientFieldMedia = [...directClientMedia, ...workScopedClientMedia];
  const activeCount = clients.filter((client) => clientStatusLabel(client) === "Active").length;
  const leadCount = clients.filter((client) => clientStatusLabel(client) === "Lead").length;
  const textReadyCount = clients.filter((client) => clientHasTextReadyContact(client)).length;
  const clientOverviewCustomFieldValidation = validateCustomFieldDraftRows(clientOverviewCustomFieldsDraft, CLIENT_CUSTOM_FIELD_RESERVED_LABELS);
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

  const moduleTitle = NEXOPS_MODULES.find((module) => module.id === activeModule)?.label ?? "NexOps";

  useEffect(() => {
    setClientOverviewCustomFieldsDraft(
      customFieldRecordToDraftRows(selectedClient?.customFields, CLIENT_CUSTOM_FIELD_RESERVED_LABELS, "client_profile")
    );
    setClientOverviewCustomFieldsOpen(false);
    setMobileClientExpandedBucket(null);
  }, [selectedClient?.id]);

  function renderHome(): React.ReactElement {
    return <NexOpsHomePage tenantId={operatorContext.tenantId} onOpenTarget={openWorkspaceTarget} />;
  }

  function renderClients(options?: { compact?: boolean }): React.ReactElement {
    if (creatingClientPage && !options?.compact) {
      return renderNewClientWorkspace();
    }
    if (activeClientProfileTab && !options?.compact) {
      return <ContactProfileSurface bindings={{
        activeClientProfileTab,
        clientContactDisplayName,
        clientDisplayName,
        clientFieldMedia,
        clientFieldReports,
        clientOverviewCustomFieldValidation,
        clientOverviewCustomFieldsDraft,
        clientOverviewCustomFieldsOpen,
        clientPortalActivity,
        clientPrimaryAddress,
        clientRailBusy,
        clientRailStatus,
        clientReviewSequences,
        clientSignedDocuments,
        clientStatusLabel,
        deleteClientRecord,
        formatPhoneDisplay,
        lastPortalLink,
        mobileClientExpandedBucket,
        mobileClientViewport,
        MobileClientEditGlyph,
        MobileClientSummaryGlyph,
        openCreateClientDrawer,
        openEditClientWorkspace,
        openWorkspaceTarget,
        operatorContext,
        orderedClientFieldMedia,
        personDisplayName,
        returnToClientRoster,
        saveClientMarketingConsent,
        saveClientOverviewCustomFields,
        selectedClient,
        selectedContact,
        selectedEmail,
        selectedInvoices,
        selectedJobs,
        selectedPayments,
        selectedPhone,
        selectedPhoneValue,
        selectedProperties,
        selectedQuotes,
        selectedReceiptReviewSummaries,
        selectedRequests,
        sendClientPortalLink,
        sendClientStatement,
        setClientOverviewCustomFieldsDraft,
        setClientOverviewCustomFieldsOpen,
        setClientProfileTabRoute,
        setMobileClientExpandedBucket,
        setModule,
        toggleCreateMenu
      }} />;
    }

    return <ContactRoster
      status={status}
      activeCount={activeCount}
      leadCount={leadCount}
      textReadyCount={textReadyCount}
      propertyCount={properties.length}
      query={query}
      clients={filteredClients}
      selectedClientId={selectedClientId}
      clientDisplayName={clientDisplayName}
      contactSummary={contactSummary}
      clientPrimaryAddress={clientPrimaryAddress}
      clientStatusLabel={clientStatusLabel}
      onQueryChange={setQuery}
      onOpenClient={openClientProfile}
      onNewClient={openNewClientWorkspace}
      onImport={() => setModule("imports")}
      onRefresh={() => void refresh()}
    />;
  }

  function renderNewClientWorkspace(): React.ReactElement {
    return <ContactEditorSurface
      tenantId={operatorContext.tenantId}
      newClient={newClient}
      setNewClient={setNewClient}
      createStatus={createStatus}
      createClientCanSave={createClientCanSave}
      createClientMissingFields={createClientMissingFields}
      leadSourceOptions={leadSourceOptions}
      mode={clientFormMode}
      mobile={mobileClientViewport}
      onClose={closeClientFormWorkspace}
      onSubmit={createClientFromForm}
    />;
  }


  function renderCaptureWorkspace(): React.ReactElement {
    const filteredClients = clients
      .filter((client) => {
        if (!captureClientQuery.trim()) {
          return true;
        }
        const haystack = [
          clientDisplayName(client),
          ...client.emails,
          ...client.phones,
          clientPrimaryAddress(client)
        ].join(" ").toLowerCase();
        return haystack.includes(captureClientQuery.trim().toLowerCase());
      })
      .slice(0, 8);
    const selectedCaptureClient = clients.find((client) => client.id === captureSelectedClientId);
    const assignedCaptureClient = captureSession?.assignedClientId
      ? clients.find((client) => client.id === captureSession.assignedClientId)
      : undefined;
    const visibleCaptureVisits = captureTargets.visits.filter((visit) => !captureSelectedJobId || visit.jobId === captureSelectedJobId);
    const captureSessionMedia = orderedCaptureMedia(captureSession);
    const activeCaptureMedia = captureSessionMedia.find((media) => media.id === captureSelectedMediaId)
      ?? captureSessionMedia[captureSessionMedia.length - 1]
      ?? null;
    const captureAnchorGps = captureSession?.originGps ?? captureSession?.latestGps;
    const captureGpsMoved = Boolean(
      captureSession?.originGps
      && captureSession.latestGps
      && (captureSession.originGps.lat !== captureSession.latestGps.lat || captureSession.originGps.lng !== captureSession.latestGps.lng)
    );
    return (
      <Suspense fallback={<section className="nexops-module-page"><div className="nexops-module-grid"><article className="nexops-module-card"><p className="eyebrow">Loading</p><h2>Opening capture workspace</h2><p>Pulling the deferred capture rail into the shell now.</p></article></div></section>}>
        <NexOpsCaptureWorkspace
          operatorTenantId={operatorContext.tenantId}
          captureInputRef={captureInputRef}
          captureBusy={captureBusy}
          captureStatus={captureStatus}
          captureWorkspaceView={captureWorkspaceView}
          captureSession={captureSession}
          captureSessionOrigin={captureSessionOrigin}
          captureSessionMode={captureSessionMode}
          captureInbox={captureInbox}
          captureInboxStatus={captureInboxStatus}
          activeCaptureMedia={activeCaptureMedia}
          captureSessionMedia={captureSessionMedia}
          captureAnchorGps={captureAnchorGps}
          captureGpsMoved={captureGpsMoved}
          filteredClients={filteredClients}
          selectedCaptureClient={selectedCaptureClient}
          assignedCaptureClient={assignedCaptureClient}
          captureClientQuery={captureClientQuery}
          setCaptureClientQuery={setCaptureClientQuery}
          captureSelectedClientId={captureSelectedClientId}
          setCaptureSelectedClientId={setCaptureSelectedClientId}
          captureSelectedJobId={captureSelectedJobId}
          setCaptureSelectedJobId={setCaptureSelectedJobId}
          captureSelectedVisitId={captureSelectedVisitId}
          setCaptureSelectedVisitId={setCaptureSelectedVisitId}
          captureTargets={captureTargets}
          visibleCaptureVisits={visibleCaptureVisits}
          onStartCaptureSession={startCaptureSession}
          onOpenCaptureWorkspace={openCaptureWorkspace}
          onFinishCaptureSession={finishCaptureSession}
          onUploadCapturePhotos={uploadCapturePhotos}
          onSetCaptureSelectedMediaId={setCaptureSelectedMediaId}
          onRouteCaptureToNewRequest={routeCaptureToNewRequest}
          onMarkCaptureDecideLater={markCaptureDecideLater}
          onSetCaptureSessionMode={setCaptureSessionMode}
          onSetCaptureStatus={setCaptureStatus}
          onLoadCaptureTargets={loadCaptureTargets}
          onAssignCaptureToExistingClient={assignCaptureToExistingClient}
          onReopenCaptureBatch={reopenCaptureBatch}
          onSetCaptureSession={setCaptureSession}
          onSetCaptureSessionOrigin={setCaptureSessionOrigin}
          clientDisplayName={clientDisplayName}
          clientPrimaryAddress={clientPrimaryAddress}
          contactSummary={contactSummary}
        />
      </Suspense>
    );
  }

  function renderLifecycle(module: NexOpsModule): React.ReactElement {
    const money = (value?: number) => `$${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const clientName = (clientId: string) => clientDisplayName(clients.find((client) => client.id === clientId) ?? {
      id: clientId,
      tenantId: operatorContext.tenantId,
      name: clientId,
      emails: [],
      phones: [],
      consent: { email: false, sms: false }
    });
    const labels: Record<string, { title: string; subtitle: string; primaryAction: string; items: string[]; records: Array<{ id: string; title: string; detail: string; status: string; amount?: string }> }> = {
      requests: {
        title: "Requests",
        subtitle: "Lead and client request intake",
        primaryAction: "New request",
        items: ["Manual request creation", "Embeddable form target", "Convert request to quote/job"],
        records: clients
          .filter((client) => clientStatusLabel(client).toLowerCase().includes("lead"))
          .map((client) => ({
            id: client.id,
            title: clientDisplayName(client),
            detail: clientPrimaryAddress(client) || contactSummary(client),
            status: "Lead"
          }))
      },
      quotes: {
        title: "Quotes",
        subtitle: "Catalog, templates, approval links, and expiry",
        primaryAction: "Draft quote",
        items: ["Draft quote from catalog", "Send by email/text/both through ApprovalQueue", "Client approval through NexPortal"],
        records: quotes.map((quote) => ({
          id: quote.id,
          title: quote.title,
          detail: [clientName(quote.clientId), intakeSurfaceSummary(quote.intake, "quote")].filter(Boolean).join(" - "),
          status: quote.status,
          amount: money(quote.totals.total)
        }))
      },
      jobs: {
        title: "Jobs",
        subtitle: "Approved work, visits, closeout, and field handoff",
        primaryAction: "New job",
        items: ["Quote-to-job conversion", "Assigned visits", "NexCam report rollup"],
        records: jobs.map((job) => ({
          id: job.id,
          title: job.title,
          detail: [clientName(job.clientId), job.startAt ? new Date(job.startAt).toLocaleString() : "", intakeSurfaceSummary(job.intake, "job")].filter(Boolean).join(" - "),
          status: job.status.replace("_", " "),
          amount: money(job.totals?.total)
        }))
      },
      invoices: {
        title: "Invoices",
        subtitle: "Billing, PDF invoices, checkout, and receipts",
        primaryAction: "Create invoice",
        items: ["Invoice from signed quote", "Stripe test checkout", "Attach NexCam report PDF on receipt"],
        records: invoices.map((invoice) => ({
          id: invoice.id,
          title: invoice.title,
          detail: [clientName(invoice.clientId), intakeSurfaceSummary(invoice.intake, "invoice")].filter(Boolean).join(" - "),
          status: invoice.status,
          amount: money(invoice.totals.total)
        }))
      },
      payments: {
        title: "Payments",
        subtitle: "Payment state, deposits, balances, and methods",
        primaryAction: "Record payment",
        items: ["Stripe test-mode receipts", "Deposit/payment schedule scaffold", "No live charges without approval"],
        records: invoices
          .filter((invoice) => invoice.status === "paid" || invoice.status === "partial_pay")
          .map((invoice) => ({
            id: invoice.id,
            title: invoice.title,
            detail: clientName(invoice.clientId),
            status: invoice.status,
            amount: money(invoice.totals.total)
          }))
      }
    };
    const page = labels[module] ?? {
      title: "NexOps",
      subtitle: "Module scaffold",
      primaryAction: "Create",
      items: [],
      records: []
    };
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>{page.title}</h1>
            <p>{page.subtitle}</p>
          </div>
          <button type="button">{page.primaryAction}</button>
        </div>
        <div className="nexops-module-grid nexops-module-grid-wide">
          <article className="nexops-module-card">
            <p className="eyebrow">Live native records</p>
            <h2>{page.records.length} visible</h2>
            {page.records.length ? (
              <ul className="nexops-record-list">
                {page.records.slice(0, 12).map((record) => (
                  <li key={record.id}>
                    <span>
                      <strong>{record.title}</strong>
                      <small>{record.detail}</small>
                    </span>
                    <mark>{record.status}</mark>
                    {record.amount ? <b>{record.amount}</b> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No native {page.title.toLowerCase()} are loaded yet. Use create/import/sync, then refresh this page.</p>
            )}
          </article>
          <article className="nexops-module-card">
            <p className="eyebrow">Next build receipts</p>
            <h2>What lands here</h2>
            <ul className="nexops-checklist">
              {page.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        </div>
      </section>
    );
  }

  function renderImports(): React.ReactElement {
    return (
      <section className="nexops-module-page">
        <div className="nexops-page-heading">
          <div>
            <h1>Import & Sync</h1>
            <p>CSV import for every tenant. Third-party adapters stay dormant unless a future tenant explicitly opts in.</p>
          </div>
        </div>
        <div className="nexops-module-grid">
          <article className="nexops-module-card">
            <p className="eyebrow">CSV import</p>
            <h2>Preview before write</h2>
            <p>{csvStatus}</p>
            <input
              aria-label="CSV import file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  setCsvStatus("No CSV selected yet.");
                  return;
                }
                file.text()
                  .then((text) => {
                    const preview = parseCsvPreview(text);
                    setCsvStatus(`${preview.rows} row${preview.rows === 1 ? "" : "s"} detected. Columns: ${preview.columns.join(", ") || "none"}. Commit endpoint remains approval-gated.`);
                  })
                  .catch(() => setCsvStatus("Could not read that CSV file."));
              }}
            />
          </article>
        </div>
      </section>
    );
  }

  function renderSettings(): React.ReactElement {
    return (
      <NexOpsSettingsPage
        tenantId={operatorContext.tenantId}
        tenantName={tenantName}
        role={operatorContext.role}
        tenantUsers={tenantUsers}
        onCrmMutation={() => window.dispatchEvent(new Event("nexops:crm-mutated"))}
      />
    );
  }

  function renderCreateClientPanel(): React.ReactElement | null {
    if (!showCreateClient) {
      return null;
    }
    return (
      <Suspense fallback={<div className="nexops-drawer-backdrop" role="presentation"><div className="nexops-drawer nexops-client-form"><p className="eyebrow">Loading</p><h2>Opening client setup</h2><p>Pulling the deferred client form into view now.</p></div></div>}>
        <NexOpsCreateClientPanel
          tenantId={operatorContext.tenantId}
          newClient={newClient}
          setNewClient={setNewClient}
          createStatus={createStatus}
          createClientCanSave={createClientCanSave}
          createClientMissingFields={createClientMissingFields}
          leadSourceOptions={leadSourceOptions}
          surface={createClientSurface}
          onClose={() => setShowCreateClient(false)}
          onSubmit={createClientFromForm}
        />
      </Suspense>
    );
  }

  function renderCreateMenu(): React.ReactElement | null {
    if (!createMenuOpen) {
      return null;
    }
    const activeContextLabel = activeClientProfileTab && selectedClient
      ? `Create inside ${clientDisplayName(selectedClient)} without leaving the client workspace.`
      : `Start from the ${moduleTitle} rail and jump straight into the right builder.`;
    return (
      <Suspense fallback={<section className="nexops-create-menu nexops-create-menu-flyout" role="dialog" aria-label="Create a new record"><p className="nexops-module-status">Loading create menu...</p></section>}>
        <NexOpsCreateMenu
          presentation={createMenuPresentation(window.innerWidth)}
          activeContextLabel={activeContextLabel}
          onClose={() => setCreateMenuOpen(false)}
          onSelect={handleCreateSelection}
        />
      </Suspense>
    );
  }

  function renderActiveModule(): React.ReactElement {
    if (activeModule === "home") {
      return renderHome();
    }
    if (activeModule === "clients") {
      return renderClients();
    }
    if (activeModule === "requests") {
      return (
        <NexOpsRequestsPage
          tenantId={operatorContext.tenantId}
          clients={clients}
          properties={properties}
          tenantUsers={tenantUsers}
          focusedRequestId={focusedRequestId}
          initialFilter={requestFilterIntent}
          captureIntent={captureRequestIntent}
          onCaptureRequestCreated={handleCaptureRequestCreated}
          onCrmMutation={emitCrmMutation}
        />
      );
    }
    if (activeModule === "quotes") {
      return (
        <NexOpsQuotesPage
          tenantId={operatorContext.tenantId}
          clients={clients}
          tenantUsers={tenantUsers}
          focusedQuoteId={focusedQuoteId}
          initialFilter={quoteFilterIntent}
          onCrmMutation={() => window.dispatchEvent(new Event("nexops:crm-mutated"))}
        />
      );
    }
    if (activeModule === "jobs") {
      return (
        <NexOpsJobsPage
          tenantId={operatorContext.tenantId}
          role={operatorContext.role}
          clients={clients}
          onCrmMutation={() => window.dispatchEvent(new Event("nexops:crm-mutated"))}
          onOpenInvoice={openInvoiceWorkspace}
          focusedJobId={focusedJobId}
          initialFilter={jobFilterIntent}
        />
      );
    }
    if (activeModule === "invoices" || activeModule === "payments") {
      return (
        <NexOpsInvoicesPage
          tenantId={operatorContext.tenantId}
          clients={clients}
          entryPoint={activeModule}
          focusedInvoiceId={focusedInvoiceId}
          initialFilter={invoiceFilterIntent}
          onCrmMutation={() => window.dispatchEvent(new Event("nexops:crm-mutated"))}
        />
      );
    }
    if (activeModule === "schedule") {
      return (
        <NexOpsSchedulePage
          tenantId={operatorContext.tenantId}
          role={operatorContext.role}
          initialScope={scheduleScopeIntent}
          onOpenJob={(jobId) => openWorkspaceTarget({ module: "jobs", objectId: jobId })}
          onCrmMutation={() => window.dispatchEvent(new Event("nexops:crm-mutated"))}
        />
      );
    }
    if (activeModule === "imports") {
      return renderImports();
    }
    if (activeModule === "approvals") {
      return <div className="nexops-embedded-panel"><ApprovalQueuePanel tenantId={operatorContext.tenantId} /></div>;
    }
    if (activeModule === "capture") {
      return renderCaptureWorkspace();
    }
    if (activeModule === "settings") {
      return renderSettings();
    }
    if (activeModule === "patterns") {
      return <NexOpsPatternLibraryPage />;
    }
    return renderLifecycle(activeModule);
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
              <button
                className={option.id === "nexops" ? "active" : ""}
                key={option.id}
                type="button"
                onClick={() => openWorkspaceProduct(option.id)}
              >
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

  return (
      <main className="nexops-app" style={style}>
        <aside className="nexops-app-sidebar" aria-label="NexOps navigation">
          <div className="nexops-app-logo">
            <SidebarBrandStack product="nexops" branding={tenantBranding} tenantId={operatorContext.tenantId} />
          </div>
        <button className="nexops-create-button" type="button" aria-controls={NEXOPS_SHARED_CREATE_MENU_ID} aria-expanded={createMenuOpen} onClick={toggleCreateMenu}>Create</button>
        <nav className="nexops-nav">
          {NEXOPS_MODULES.filter((item) => !item.hidden).map((item) => (
            <button className={item.id === activeModule ? "active" : ""} type="button" key={item.id} onClick={() => setModule(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="nexops-web-main">
        <NexOpsSharedMobileBar
          tenantBranding={tenantBranding}
          tenantId={operatorContext.tenantId}
          onBrandClick={returnToHomeModule}
          brandAriaLabel="Return to NexOps home"
          rightControls={(
            <>
              <button
                className="nexops-mobile-icon-button"
                type="button"
                aria-label="Open camera capture"
                onClick={() => {
                  if (captureSession) {
                    openCaptureWorkspace("session");
                    return;
                  }
                  void startCaptureSession();
                }}
              >
                <NexOpsNavGlyph module="capture" />
              </button>
              <button className="nexops-mobile-icon-button nexops-notification-button" type="button" aria-expanded={notificationsOpen} aria-label="Open notifications" onClick={toggleNotifications}>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                  <path d="M10 3.7a3.1 3.1 0 0 0-3.1 3.1v1.3c0 .8-.3 1.6-.8 2.2l-.9 1v.8h9.6v-.8l-.9-1c-.5-.6-.8-1.4-.8-2.2V6.8A3.1 3.1 0 0 0 10 3.7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M8.3 14.7a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {notificationUnreadCount ? <span className="nexops-notification-badge">{notificationUnreadCount}</span> : null}
              </button>
              <button
                className="nexops-mobile-menu-button"
                type="button"
                aria-expanded={mobileNavOpen}
                aria-controls="nexops-mobile-nav"
                aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
                onClick={() => setMobileNavOpen((current) => !current)}
              >
                <span className="nexops-mobile-menu-glyph" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="nexops-mobile-menu-label">Menu</span>
              </button>
            </>
          )}
        />
        {mobileNavOpen ? (
          <div className="nexops-mobile-nav-layer" role="presentation">
            <button className="nexops-mobile-nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
            <aside className="nexops-mobile-nav-sheet" id="nexops-mobile-nav" role="dialog" aria-modal="true" aria-label="NexOps navigation">
              <div className="nexops-mobile-nav-header">
                <div className="nexops-mobile-brand-stack">
                  <div className="nexops-mobile-brand">
                    <div className="nexops-mobile-brand-lockup">
                      <PlatformMark className="nexops-mobile-platform-mark" alt="NexTeam" />
                      <ProductLogo product="nexops" className="nexops-mobile-product-logo" alt="NexOps" />
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
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    if (captureSession) {
                      openCaptureWorkspace("session");
                      return;
                    }
                    void startCaptureSession();
                  }}
                >
                  <NexOpsNavGlyph module="capture" />
                  <span>NexCam</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    toggleNotifications();
                  }}
                >
                  <span className="nexops-mobile-nav-utility-icon nexops-notification-button" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none">
                      <path d="M10 3.7a3.1 3.1 0 0 0-3.1 3.1v1.3c0 .8-.3 1.6-.8 2.2l-.9 1v.8h9.6v-.8l-.9-1c-.5-.6-.8-1.4-.8-2.2V6.8A3.1 3.1 0 0 0 10 3.7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                      <path d="M8.3 14.7a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    {notificationUnreadCount ? <span className="nexops-notification-badge">{notificationUnreadCount}</span> : null}
                  </span>
                  <span>Notifications</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    closeHeaderPanels();
                    setModule("settings");
                  }}
                >
                  <NexOpsNavGlyph module="settings" />
                  <span>Settings</span>
                </button>
                <button type="button" onClick={() => {
                  setMobileNavOpen(false);
                  void signOutOperator(props.auth);
                }}>
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
                        <button className={module.id === activeModule ? "active" : ""} type="button" key={module.id} onClick={() => setModule(module.id)}>
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
        ) : null}
        <NexOpsSharedWebTopbar
          tenantName={tenantName}
          moduleTitle={moduleTitle}
          moduleSwitcherOpen={moduleSwitcherOpen}
          onToggleModuleSwitcher={toggleModuleSwitcher}
          accountTools={(
            <>
              <button
                className="nexops-web-icon-button"
                type="button"
                aria-label="Open camera capture"
                onClick={() => {
                  if (captureSession) {
                    openCaptureWorkspace("session");
                    return;
                  }
                  void startCaptureSession();
                }}
              >
                <NexOpsNavGlyph module="capture" />
              </button>
              <button className="nexops-web-icon-button nexops-notification-button" type="button" aria-expanded={notificationsOpen} aria-label="Open notifications" onClick={toggleNotifications}>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                  <path d="M10 3.7a3.1 3.1 0 0 0-3.1 3.1v1.3c0 .8-.3 1.6-.8 2.2l-.9 1v.8h9.6v-.8l-.9-1c-.5-.6-.8-1.4-.8-2.2V6.8A3.1 3.1 0 0 0 10 3.7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M8.3 14.7a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {notificationUnreadCount ? <span className="nexops-notification-badge">{notificationUnreadCount}</span> : null}
              </button>
              <button className="nexops-web-icon-button" type="button" aria-label="Open settings" onClick={() => {
                closeHeaderPanels();
                setModule("settings");
              }}>
                <NexOpsNavGlyph module="settings" />
              </button>
              <span>{props.user.email ?? "Operator"}</span>
              <button type="button" onClick={() => void signOutOperator(props.auth)}>Sign out</button>
            </>
          )}
        />
        <NexOpsMobileCreateFab
          collapsed={mobileCreateFabCollapsed}
          expanded={createMenuOpen}
          hidden={mobileFabShouldHideOverlays({ mobileNavOpen, notificationsOpen, moduleSwitcherOpen })}
          pulse={mobileCreateFabPulse}
          onClick={toggleCreateMenu}
        />
        {renderModuleSwitcher()}
        {renderCreateMenu()}
        {renderNotificationPanel()}

        <Suspense fallback={<div className="nexops-embedded-panel"><section className="nexops-module-card"><p className="eyebrow">Loading</p><h2>Opening this workspace</h2><p>Pulling the next screen into the shell now.</p></section></div>}>
          {renderActiveModule()}
        </Suspense>
      </section>
      {renderCreateClientPanel()}
    </main>
  );
}
