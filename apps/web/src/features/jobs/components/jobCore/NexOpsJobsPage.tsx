import React, { useEffect, useMemo, useState } from "react";
import { NexOpsDetailTemplate, NexOpsRosterTemplate } from "../../../../shared/ui/NexOpsBusinessTemplates";
import { NexOpsNavGlyph } from "../../../nexopsShell/workspaceSupport";
import type { Address } from "@nexteam/shared";
import {
  PaymentScheduleEditor,
  blankPaymentSchedule,
  paymentScheduleFromRecord,
  paymentScheduleToPayload,
  type PaymentScheduleDraft,
  type PaymentScheduleRecord
} from "../../../../features/invoices/components/invoiceStructure/PaymentScheduleEditor";
import {
  intakeDetailFacts,
  prominentIntakeFacts,
  type IntakeSnapshotLike
} from "../../../../shared/intake/intakePresentation";
import {
  blankSignatureCaptureValue,
  NexOpsSignatureCapture,
  type SignatureCaptureValue
} from "../../../../shared/signature/NexOpsSignatureCapture";
import { ProductInlineLabel } from "../../../../shared/branding/ProductBranding";
import { NexDocsClientWorkspace } from "../../../nexdocs/areas/clientWorkspace/components/NexDocsClientWorkspace";

type JobStatus = "Upcoming" | "Today" | "Late" | "Unscheduled" | "Action Required" | "Requires Invoicing" | "Archived";
type JobAction = "close" | "invoice" | "close_and_invoice" | "dismiss_invoice_reminder";
type JobFilter = "All" | JobStatus;
type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";

const JOB_FILTERS: JobFilter[] = ["All", "Upcoming", "Today", "Late", "Unscheduled", "Action Required", "Requires Invoicing", "Archived"];

interface ClientOption {
  id: string;
  name: string;
  company?: string;
  personName?: { firstName?: string; lastName?: string };
  displayNamePreference?: "person" | "company";
  emails: string[];
  phones: string[];
}

interface PropertyOption {
  id: string;
  clientId: string;
  siteName?: string;
  label?: string;
  address?: Address;
}

interface InlineJobClientDraft {
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  email: string;
  street1: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

interface LineItem {
  id: string;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface VisitRecord {
  id: string;
  title: string;
  start: string;
  end: string;
  assignedTo: string[];
  status: string;
  completedAt?: string;
}

interface InvoiceReminderRecord {
  id: string;
  dueAt: string;
  status: string;
}

interface JobActionAlertRecord {
  id: string;
  note?: string;
  status: string;
}

interface JobEventRecord {
  id: string;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

interface InvoiceRecord {
  id: string;
  number?: string;
  title: string;
  status: string;
  totals: { total: number };
}

interface FieldDocsMediaRecord {
  id: string;
  type: "photo" | "video" | "pdf";
  jobId?: string;
  visitId?: string;
  propertyId?: string;
  storageRef: string;
  thumbRef?: string;
  aiTags: string[];
  aiCaption?: string;
  exif?: { gps?: { lat: number; lng: number }; ts?: string };
}

interface FieldDocsMediaListResponse {
  ok: boolean;
  media?: FieldDocsMediaRecord[];
  error?: string;
}

interface FieldDocsReportRecord {
  id: string;
  title: string;
  pdfRef: string;
  status: string;
  jobId: string;
  propertyId?: string;
  visitId?: string;
  createdAt?: string;
  postedAt?: string;
}

interface FieldDocsReportsListResponse {
  ok: boolean;
  reports?: FieldDocsReportRecord[];
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
  createdAt: string;
  updatedAt: string;
  signedAt?: string;
}

interface SignedDocumentsResponse {
  ok: boolean;
  records?: SignedDocumentRecord[];
  error?: string;
}

interface JobSummary {
  id: string;
  tenantId: string;
  number?: string;
  clientId: string;
  propertyId?: string;
  requestId?: string;
  quoteId?: string;
  status: JobStatus;
  title: string;
  startAt?: string;
  endAt?: string;
  lineItems?: LineItem[];
  totals?: { subtotal: number; tax: number; total: number };
  paymentSchedule?: PaymentScheduleRecord;
  intake?: IntakeSnapshotLike;
  createdAt?: string;
  updatedAt?: string;
  client?: { id: string; name: string; company?: string };
  property?: { id: string; label?: string; siteName?: string; address?: Address };
  nextVisit?: VisitRecord;
  visitCount: number;
  completedVisitCount: number;
  pendingInvoiceReminder?: InvoiceReminderRecord;
  pendingActionAlert?: JobActionAlertRecord;
  invoiceCount: number;
  clientVisibility?: {
    hideFieldDocsFromPortal?: boolean;
  };
  archivedAt?: string;
}

interface JobDetail extends JobSummary {
  quote?: { id: string; number?: string; title: string };
  request?: { id: string; subject: string };
  visits: VisitRecord[];
  reminders: {
    invoice?: InvoiceReminderRecord;
    visit: Array<{ id: string; channel: string; trigger: string; dueAt: string; status: string }>;
    actionAlert?: JobActionAlertRecord;
  };
  history: JobEventRecord[];
  invoices: InvoiceRecord[];
}

interface JobsResponse {
  ok: boolean;
  jobs?: JobSummary[];
  error?: string;
}

interface JobDetailResponse {
  ok: boolean;
  job?: JobDetail;
  error?: string;
}

interface JobMutationResponse {
  ok: boolean;
  job?: JobDetail;
  visit?: VisitRecord;
  invoice?: InvoiceRecord;
  reminder?: InvoiceReminderRecord;
  error?: string;
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

interface ReviewSequenceStatusResponse {
  ok: boolean;
  sequences?: ReviewSequenceRecord[];
  activeCount?: number;
  error?: string;
}

interface BookingConfirmationPreview {
  job: JobDetail;
  visit: VisitRecord;
  defaultCopyTarget?: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  emailTarget?: string;
  smsTarget?: string;
  emailSubject: string;
  emailBodyText: string;
  smsBodyText: string;
  googleCalendarUrl: string;
  outlookCalendarUrl: string;
  calendarFilename: string;
}

interface BookingConfirmationPreviewResponse {
  ok: boolean;
  preview?: BookingConfirmationPreview;
  error?: string;
}

interface InlineJobClientCreateResponse {
  ok: boolean;
  client?: ClientOption & { id: string };
  property?: PropertyOption | undefined;
  error?: string;
}

const NEW_JOB_CLIENT_VALUE = "__create_new_client__";

function blankInlineJobClientDraft(): InlineJobClientDraft {
  return {
    firstName: "",
    lastName: "",
    company: "",
    phone: "",
    email: "",
    street1: "",
    city: "",
    province: "",
    postalCode: "",
    country: "US"
  };
}

export function inlineJobClientDraftMissingFields(draft: InlineJobClientDraft): string[] {
  const displayName = [draft.firstName.trim(), draft.lastName.trim()].filter(Boolean).join(" ") || draft.company.trim();
  return [
    ...(displayName ? [] : ["name"]),
    ...(draft.phone.trim() ? [] : ["telephone"]),
    ...([draft.street1.trim(), draft.city.trim(), draft.province.trim(), draft.postalCode.trim()].every(Boolean) ? [] : ["address"])
  ];
}

export function inlineJobClientDraftCanSave(draft: InlineJobClientDraft): boolean {
  return inlineJobClientDraftMissingFields(draft).length === 0;
}

export function mergeJobClientOptions(clients: ClientOption[], createdClient: ClientOption | null): ClientOption[] {
  if (!createdClient || clients.some((client) => client.id === createdClient.id)) {
    return clients;
  }
  return [createdClient, ...clients];
}

/**
 * Archived records are historical records. This deliberately does not depend
 * on an upstream system name, so every import path gets the same treatment.
 */
export function isHistoricalJob(job: Pick<JobSummary, "status" | "archivedAt">): boolean {
  return job.status === "Archived" || Boolean(job.archivedAt);
}

export function matchesJobSearch(
  job: Pick<JobSummary, "title" | "number" | "clientId" | "client">,
  query: string
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return true;
  }
  return [job.title, job.number, job.client?.name, job.client?.company, job.clientId]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase().includes(needle));
}

export function followUpDraftFromHistory(job: Pick<JobSummary, "clientId" | "title" | "propertyId">): {
  clientId: string;
  title: string;
  propertyId?: string;
} {
  return {
    clientId: job.clientId,
    title: `Follow-up: ${job.title}`,
    ...(job.propertyId ? { propertyId: job.propertyId } : {})
  };
}

export interface CloseoutArtifact {
  artifactId: string;
  source: "nexdocs" | "nexcam" | "generated";
  kind: string;
  label: string;
  fileName: string;
  mimeType: string;
  occurredAt: string;
  propertyId?: string;
  visitId?: string;
}

export interface CloseoutPackage {
  id: string;
  packageVersion: number;
  manifestStatus: "draft" | "finalized" | "superseded";
  selectedArtifactRefs: Array<Pick<CloseoutArtifact, "artifactId" | "source" | "kind" | "visitId">>;
}

interface CloseoutPackageResponse {
  ok: boolean;
  package?: CloseoutPackage;
  artifacts?: CloseoutArtifact[];
  error?: string;
}

export type CloseoutHydrationState =
  | { phase: "idle" }
  | { phase: "loading"; jobId: string }
  | { phase: "ready"; jobId: string }
  | { phase: "error"; jobId: string };

export function closeoutArtifactKey(artifact: Pick<CloseoutArtifact, "source" | "artifactId">): string {
  return `${artifact.source}:${artifact.artifactId}`;
}

export function selectedCloseoutArtifactRefs(
  artifacts: CloseoutArtifact[],
  selection: readonly string[]
): CloseoutPackage["selectedArtifactRefs"] {
  const selectedKeys = new Set(selection);
  return artifacts
    .filter((artifact) => selectedKeys.has(closeoutArtifactKey(artifact)))
    .map((artifact) => ({
      artifactId: artifact.artifactId,
      source: artifact.source,
      kind: artifact.kind,
      ...(artifact.visitId ? { visitId: artifact.visitId } : {})
    }));
}

export function closeoutHydrationView(
  state: CloseoutHydrationState,
  jobId: string | undefined,
  packageRecord: CloseoutPackage | null
): { loading: boolean; ready: boolean; selectedCount: number; editable: boolean } {
  const ready = state.phase === "ready" && state.jobId === jobId && Boolean(packageRecord);
  return {
    loading: state.phase === "loading" && state.jobId === jobId,
    ready,
    selectedCount: ready ? packageRecord!.selectedArtifactRefs.length : 0,
    editable: ready && packageRecord!.manifestStatus === "draft"
  };
}

export function isCurrentCloseoutDeliveryReviewRequest(
  expected: { loadSequence: number; selectionGeneration: number },
  current: { loadSequence: number; selectionGeneration: number }
): boolean {
  return expected.loadSequence === current.loadSequence && expected.selectionGeneration === current.selectionGeneration;
}

interface CloseoutDeliveryAttempt {
  id: string;
  channel: "email" | "sms";
  recipient: string;
  subject?: string;
  status: "sent" | "failed";
  createdAt: string;
}

interface CloseoutDeliveryPreview {
  package: CloseoutPackage;
  selectedArtifacts: CloseoutArtifact[];
  email: { available: boolean; recipient?: string; defaultCopyTarget?: string; subject: string; bodyText: string; unavailableReason?: string };
  sms: { available: false; unavailableReason: string };
  attempts: CloseoutDeliveryAttempt[];
}

interface CloseoutDeliveryResponse {
  ok: boolean;
  preview?: CloseoutDeliveryPreview;
  error?: string;
}

interface CloseoutDeliveryDraft {
  recipient: string;
  subject: string;
  bodyText: string;
  copyTarget: string;
  sendCopy: boolean;
}

/**
 * Keeps the visit scheduler operable where native date/time pickers are not
 * available to the interaction surface. Browser-local semantics stay the
 * same as the previous datetime-local controls before API serialization.
 */
export function parseVisitDateTime(dateValue: string, timeValue: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) {
    return null;
  }
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const parsed = new Date(year, month - 1, day, hour, minute);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
    || parsed.getHours() !== hour
    || parsed.getMinutes() !== minute
  ) {
    return null;
  }
  return parsed;
}

interface BookingConfirmationDraft {
  visitId: string;
  mode: "email" | "sms";
  target: string;
  subject: string;
  bodyText: string;
  sendCopy: boolean;
  copyTarget: string;
}

function clientLabel(client: ClientOption): string {
  const person = [client.personName?.firstName, client.personName?.lastName].filter(Boolean).join(" ").trim();
  if (client.displayNamePreference === "company" && client.company?.trim()) {
    return client.company.trim();
  }
  return person || client.name;
}

function propertyLabel(property: PropertyOption): string {
  return property.siteName?.trim() || property.label?.trim() || property.address?.street1?.trim() || "Service location";
}

export function defaultManualJobPropertyId(properties: PropertyOption[], clientId: string): string {
  const matching = properties.filter((property) => property.clientId === clientId);
  return matching.length === 1 ? matching[0]!.id : "";
}

export function mergeJobPropertyOptions(properties: PropertyOption[], created?: PropertyOption | null): PropertyOption[] {
  if (!created || properties.some((property) => property.id === created.id)) return properties;
  return [created, ...properties];
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "Not set";
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

function formatMoney(value?: number): string {
  return typeof value === "number" ? `$${value.toFixed(2)}` : "$0.00";
}

function deriveWorkPackageStatus(detail: JobSummary | JobDetail): "draft" | "awaiting_authorization" | "authorized" | "in_progress" | "work_complete" | "closed" {
  switch (detail.status) {
    case "Archived":
      return "closed";
    case "Action Required":
    case "Requires Invoicing":
      return "work_complete";
    case "Unscheduled":
      return detail.quoteId ? "authorized" : "awaiting_authorization";
    case "Upcoming":
    case "Today":
    case "Late":
    default:
      return "in_progress";
  }
}

function deriveWorkPackageAction(detail: JobDetail): string {
  if (detail.reminders.invoice) {
    return "Invoice or Dismiss Reminder";
  }
  if (detail.reminders.actionAlert) {
    return "Review Closeout";
  }
  if (!detail.visits.length) {
    return "Schedule First Visit";
  }
  if (detail.visits.some((visit) => visit.status !== "complete")) {
    return "Finish Field Work";
  }
  return "Review Package";
}

function deriveVisitNextStep(visit: VisitRecord): string {
  if (visit.status === "complete") {
    return "Completed";
  }
  if (visit.status === "canceled") {
    return "Canceled";
  }
  if (visit.status === "scheduled") {
    return "Start travel when the crew heads out";
  }
  return "Continue field work";
}

function deriveDocumentPackagePreview(detail: JobDetail): { stage: string; note: string } {
  const hasPaidInvoice = detail.invoices.some((invoice) => invoice.status === "paid");
  if (hasPaidInvoice) {
    return {
      stage: "Ready to finalize",
      note: "Approved report, paid invoice, and receipt should bundle into the immutable customer package."
    };
  }
  if (detail.invoices.length) {
    return {
      stage: "Waiting on payment",
      note: "Report + invoice can go out first, but the receipt stays separate until money settles."
    };
  }
  if (detail.reminders.actionAlert) {
    return {
      stage: "Awaiting office review",
      note: "Technician completion is in; owner or office-admin still decides the closeout path."
    };
  }
  return {
    stage: "No package yet",
    note: "A customer package appears only after closeout reaches its approved send path."
  };
}

function bookingConfirmationWasSent(detail: JobDetail, visitId: string): boolean {
  return detail.history.some((entry) => entry.type === "visit.booking_confirmation_sent" && entry.payload.visitId === visitId);
}

function defaultBookingDraft(preview: BookingConfirmationPreview, mode: "email" | "sms" = "email"): BookingConfirmationDraft {
  return {
    visitId: preview.visit.id,
    mode,
    target: mode === "email" ? (preview.emailTarget ?? "") : (preview.smsTarget ?? ""),
    subject: mode === "email" ? preview.emailSubject : "",
    bodyText: mode === "email" ? preview.emailBodyText : preview.smsBodyText,
    sendCopy: true,
    copyTarget: preview.defaultCopyTarget ?? ""
  };
}

function deriveNextMoveCopy(detail: JobDetail, preview: BookingConfirmationPreview | null): { label: string; detail: string } {
  if (!detail.visits.length) {
    return {
      label: "Schedule First Visit",
      detail: "Get the first visit on the board before confirmation, fieldwork, or closeout can move."
    };
  }
  if (preview && !bookingConfirmationWasSent(detail, preview.visit.id)) {
    return {
      label: "Send Booking Confirmation",
      detail: "This visit is scheduled, but the client has not received the booking confirmation yet."
    };
  }
  if (detail.reminders.invoice) {
    return {
      label: "Invoice or Dismiss Reminder",
      detail: "Field work is complete and the invoice reminder is now driving the work state."
    };
  }
  if (detail.reminders.actionAlert) {
    return {
      label: "Review Closeout",
      detail: "A technician finished the field step. Owner or office admin still decides close, invoice, or both."
    };
  }
  if (detail.visits.some((visit) => visit.status !== "complete")) {
    return {
      label: "Go to Visits",
      detail: "Booking is confirmed. The next live rail is the visit list and technician completion path."
    };
  }
  return {
    label: "Review Package",
    detail: "Work is complete and the customer package is waiting on the billing path."
  };
}

export function NexOpsJobsPage(props: {
  tenantId: string;
  role: TenantRole;
  clients: ClientOption[];
  properties: PropertyOption[];
  onCrmMutation: () => void;
  onOpenInvoice?: (invoiceId: string) => void;
  focusedJobId?: string;
  initialClientId?: string;
  initialFilter?: JobFilter;
}): React.ReactElement {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [detailOpen, setDetailOpen] = useState(Boolean(props.focusedJobId));
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [status, setStatus] = useState("Loading jobs...");
  const [detailStatus, setDetailStatus] = useState("Select a job to review visits and actions.");
  const [createClientId, setCreateClientId] = useState(() => props.initialClientId && props.clients.some((client) => client.id === props.initialClientId) ? props.initialClientId : props.clients[0]?.id ?? "");
  const [createPropertyId, setCreatePropertyId] = useState("");
  const [createdPropertyOption, setCreatedPropertyOption] = useState<PropertyOption | null>(null);
  const [showInlineClientCreate, setShowInlineClientCreate] = useState(props.clients.length === 0);
  const [inlineClientDraft, setInlineClientDraft] = useState<InlineJobClientDraft>(() => blankInlineJobClientDraft());
  const [inlineClientBusy, setInlineClientBusy] = useState(false);
  const [inlineClientStatus, setInlineClientStatus] = useState("Pick an existing client or create one here without losing the job draft.");
  const [createdClientOption, setCreatedClientOption] = useState<ClientOption | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createPaymentSchedule, setCreatePaymentSchedule] = useState<PaymentScheduleDraft>(() => blankPaymentSchedule());
  const [visitTitle, setVisitTitle] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [visitStartTime, setVisitStartTime] = useState("");
  const [visitEndDate, setVisitEndDate] = useState("");
  const [visitEndTime, setVisitEndTime] = useState("");
  const [activeVisitDocumentsId, setActiveVisitDocumentsId] = useState("");
  const [jobDocumentsOpen, setJobDocumentsOpen] = useState(false);
  const [closeoutPackage, setCloseoutPackage] = useState<CloseoutPackage | null>(null);
  const [closeoutArtifacts, setCloseoutArtifacts] = useState<CloseoutArtifact[]>([]);
  const [closeoutSelection, setCloseoutSelection] = useState<string[]>([]);
  const [closeoutHydration, setCloseoutHydration] = useState<CloseoutHydrationState>({ phase: "idle" });
  const [closeoutStatus, setCloseoutStatus] = useState("Load the Job to review closeout artifacts.");
  const [closeoutBusy, setCloseoutBusy] = useState(false);
  const [closeoutDelivery, setCloseoutDelivery] = useState<CloseoutDeliveryPreview | null>(null);
  const [closeoutDeliveryDraft, setCloseoutDeliveryDraft] = useState<CloseoutDeliveryDraft | null>(null);
  const [closeoutDeliveryStatus, setCloseoutDeliveryStatus] = useState("");
  const [closeoutDeliveryBusy, setCloseoutDeliveryBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<JobAction | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobFilter>("All");
  const [jobSearch, setJobSearch] = useState("");
  const [jobFiltersOpen, setJobFiltersOpen] = useState(false);
  const [detailPaymentSchedule, setDetailPaymentSchedule] = useState<PaymentScheduleDraft>(() => blankPaymentSchedule());
  const [bookingPreview, setBookingPreview] = useState<BookingConfirmationPreview | null>(null);
  const [bookingDraft, setBookingDraft] = useState<BookingConfirmationDraft | null>(null);
  const jobDetailRef = React.useRef<HTMLElement | null>(null);
  const mobileDetailFocusJobIdRef = React.useRef("");
  const closeoutLoadSequenceRef = React.useRef(0);
  const closeoutSelectionGenerationRef = React.useRef(0);
  const [bookingSheetOpen, setBookingSheetOpen] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [reviewSequences, setReviewSequences] = useState<ReviewSequenceRecord[]>([]);
  const [reviewStatus, setReviewStatus] = useState("Review follow-up status will load with the job detail.");
  const [reviewBusy, setReviewBusy] = useState("");
  const [fieldDocsMedia, setFieldDocsMedia] = useState<FieldDocsMediaRecord[]>([]);
  const [fieldDocsReports, setFieldDocsReports] = useState<FieldDocsReportRecord[]>([]);
  const [signedDocuments, setSignedDocuments] = useState<SignedDocumentRecord[]>([]);
  const [fieldDocsStatus, setFieldDocsStatus] = useState("NexCam media and reports will load with the job detail.");
  const [fieldDocsBusy, setFieldDocsBusy] = useState("");
  const [quickPaymentDraft, setQuickPaymentDraft] = useState({ title: "Quick Payment Request", amount: "0.00", memo: "" });
  const [signedDocumentDraft, setSignedDocumentDraft] = useState<{ kind: SignedDocumentRecord["kind"]; title: string; bodyText: string }>({
    kind: "completion_signoff",
    title: "Completion sign-off",
    bodyText: "Customer confirms the work shown on this job is complete and accepted."
  });
  const [signingDocumentId, setSigningDocumentId] = useState("");
  const [signatureDraft, setSignatureDraft] = useState<SignatureCaptureValue>(() => blankSignatureCaptureValue());

  const filteredJobs = useMemo(
    () => jobs.filter((job) => (statusFilter === "All" || job.status === statusFilter) && matchesJobSearch(job, jobSearch)),
    [jobs, statusFilter, jobSearch]
  );
  const createClientOptions = useMemo(
    () => mergeJobClientOptions(props.clients, createdClientOption),
    [props.clients, createdClientOption]
  );
  const createClientProperties = useMemo(() => {
    const options = mergeJobPropertyOptions(props.properties, createdPropertyOption);
    return options.filter((property) => property.clientId === createClientId);
  }, [createClientId, createdPropertyOption, props.properties]);
  const inlineClientMissingFields = inlineJobClientDraftMissingFields(inlineClientDraft);
  const inlineClientCanSave = inlineClientMissingFields.length === 0;

  const filterCounts = useMemo(
    () => JOB_FILTERS.reduce<Record<JobFilter, number>>((counts, filter) => {
      counts[filter] = filter === "All" ? jobs.length : jobs.filter((job) => job.status === filter).length;
      return counts;
    }, {
      All: 0,
      Upcoming: 0,
      Today: 0,
      Late: 0,
      Unscheduled: 0,
      "Action Required": 0,
      "Requires Invoicing": 0,
      Archived: 0
    }),
    [jobs]
  );
  const selectedClient = detail?.clientId ? createClientOptions.find((client) => client.id === detail.clientId) : undefined;
  const prominentJobFacts = prominentIntakeFacts(detail?.intake, "job");
  const jobCarryForwardFacts = intakeDetailFacts(detail?.intake, "job", 10);
  const nextMove = detail ? deriveNextMoveCopy(detail, bookingPreview) : null;
  const signingDocument = useMemo(
    () => signedDocuments.find((record) => record.id === signingDocumentId) ?? null,
    [signedDocuments, signingDocumentId]
  );
  const closeoutView = closeoutHydrationView(closeoutHydration, detail?.id, closeoutPackage);

  function prepareFollowUpFromHistory(job: JobSummary): void {
    const draft = followUpDraftFromHistory(job);
    setShowInlineClientCreate(false);
    setCreateClientId(draft.clientId);
    setCreateTitle(draft.title);
    setStatus(`New job is ready for ${job.client?.name ?? "this client"}. Historical record stays unchanged.`);
  }

  async function loadJobs(preferredJobId?: string): Promise<void> {
    try {
      const body = await fetch(`/api/crm/jobs?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<JobsResponse>);
      if (!body.ok) {
        setJobs([]);
        setStatus(body.error ?? "Jobs are unavailable right now.");
        return;
      }
      const nextJobs = body.jobs ?? [];
      setJobs(nextJobs);
      setStatus(nextJobs.length ? `${nextJobs.length} job${nextJobs.length === 1 ? "" : "s"} loaded.` : "No jobs yet.");
      const nextSelected = preferredJobId && nextJobs.some((job) => job.id === preferredJobId)
        ? preferredJobId
        : selectedJobId && nextJobs.some((job) => job.id === selectedJobId)
          ? selectedJobId
          : nextJobs[0]?.id ?? "";
      setSelectedJobId(nextSelected);
    } catch {
      setJobs([]);
      setStatus("Jobs API unreachable.");
    }
  }

  async function loadDetail(jobId: string): Promise<void> {
    closeoutLoadSequenceRef.current += 1;
    closeoutSelectionGenerationRef.current += 1;
    setActiveVisitDocumentsId("");
    setJobDocumentsOpen(false);
    setCloseoutPackage(null);
    setCloseoutArtifacts([]);
    setCloseoutSelection([]);
    setCloseoutDelivery(null);
    setCloseoutDeliveryDraft(null);
    setCloseoutDeliveryStatus("");
    setCloseoutHydration({ phase: "idle" });
    if (!jobId) {
      setDetail(null);
      setBookingPreview(null);
      setBookingDraft(null);
      setDetailStatus("Select a job to review visits and actions.");
      return;
    }
    setDetailStatus("Loading job detail...");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(jobId)}?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<JobDetailResponse>);
      if (!body.ok || !body.job) {
        setDetail(null);
        setBookingPreview(null);
        setBookingDraft(null);
        setDetailStatus(body.error ?? "Job detail is unavailable right now.");
        return;
      }
      setDetail(body.job);
      setDetailStatus(`Viewing ${body.job.title}.`);
      setVisitTitle(body.job.title);
      setDetailPaymentSchedule(paymentScheduleFromRecord(body.job.paymentSchedule));
      void loadCloseoutPackage(body.job.id);
    } catch {
      setDetail(null);
      setBookingPreview(null);
      setBookingDraft(null);
      setDetailStatus("Job detail API unreachable.");
    }
  }

  async function loadCloseoutPackage(jobId: string): Promise<void> {
    const loadSequence = ++closeoutLoadSequenceRef.current;
    closeoutSelectionGenerationRef.current += 1;
    setCloseoutPackage(null);
    setCloseoutArtifacts([]);
    setCloseoutSelection([]);
    setCloseoutDelivery(null);
    setCloseoutDeliveryDraft(null);
    setCloseoutHydration({ phase: "loading", jobId });
    setCloseoutStatus("Loading eligible Closeout artifacts...");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(jobId)}/closeout-package?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<CloseoutPackageResponse>);
      if (!body.ok || !body.package) {
        if (loadSequence !== closeoutLoadSequenceRef.current) return;
        setCloseoutHydration({ phase: "error", jobId });
        setCloseoutStatus(body.error ?? "Closeout artifacts are unavailable right now.");
        return;
      }
      if (loadSequence !== closeoutLoadSequenceRef.current) return;
      setCloseoutPackage(body.package);
      setCloseoutArtifacts(body.artifacts ?? []);
      setCloseoutSelection((body.package.selectedArtifactRefs ?? []).map(closeoutArtifactKey));
      setCloseoutHydration({ phase: "ready", jobId });
      setCloseoutStatus((body.artifacts ?? []).length ? "Choose the artifacts to include in the customer package." : "No eligible Job artifacts are available yet.");
    } catch {
      if (loadSequence !== closeoutLoadSequenceRef.current) return;
      setCloseoutHydration({ phase: "error", jobId });
      setCloseoutStatus("Closeout artifacts are unavailable right now.");
    }
  }

  async function saveCloseoutPackage(): Promise<void> {
    if (!detail || !closeoutPackage || !closeoutView.ready || !closeoutView.editable) return;
    const jobId = detail.id;
    const packageVersion = closeoutPackage.packageVersion;
    const loadSequence = closeoutLoadSequenceRef.current;
    const selectedArtifactRefs = selectedCloseoutArtifactRefs(closeoutArtifacts, closeoutSelection);
    setCloseoutBusy(true);
    closeoutSelectionGenerationRef.current += 1;
    setCloseoutDelivery(null);
    setCloseoutDeliveryDraft(null);
    setCloseoutDeliveryStatus("Selection changed. Save and reopen Delivery Review to use the authoritative package.");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(jobId)}/closeout-package`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId, expectedPackageVersion: packageVersion, selectedArtifactRefs })
      }).then((response) => response.json() as Promise<CloseoutPackageResponse>);
      if (loadSequence !== closeoutLoadSequenceRef.current) return;
      if (!body.ok || !body.package) {
        setCloseoutStatus(body.error ?? "Closeout selection could not be saved.");
        return;
      }
      setCloseoutPackage(body.package);
      setCloseoutArtifacts(body.artifacts ?? closeoutArtifacts);
      setCloseoutSelection((body.package.selectedArtifactRefs ?? []).map(closeoutArtifactKey));
      setCloseoutHydration({ phase: "ready", jobId });
      setCloseoutStatus(body.package.selectedArtifactRefs.length ? `${body.package.selectedArtifactRefs.length} artifact${body.package.selectedArtifactRefs.length === 1 ? "" : "s"} selected. Package remains draft until delivery review.` : "No artifacts selected. Package remains a draft.");
    } catch {
      setCloseoutStatus("Closeout selection could not be saved.");
    } finally { setCloseoutBusy(false); }
  }

  async function loadCloseoutDeliveryReview(): Promise<void> {
    if (!detail || !closeoutView.ready || !closeoutPackage?.selectedArtifactRefs.length) return;
    const expectedRequest = {
      loadSequence: closeoutLoadSequenceRef.current,
      selectionGeneration: closeoutSelectionGenerationRef.current
    };
    setCloseoutDeliveryStatus("Loading the saved Closeout package for delivery review...");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(detail.id)}/closeout-package/delivery-review?tenantId=${encodeURIComponent(props.tenantId)}`)
        .then((response) => response.json() as Promise<CloseoutDeliveryResponse>);
      if (!isCurrentCloseoutDeliveryReviewRequest(expectedRequest, {
        loadSequence: closeoutLoadSequenceRef.current,
        selectionGeneration: closeoutSelectionGenerationRef.current
      })) return;
      if (!body.ok || !body.preview) {
        setCloseoutDelivery(null);
        setCloseoutDeliveryDraft(null);
        setCloseoutDeliveryStatus(body.error ?? "Delivery review is unavailable right now.");
        return;
      }
      setCloseoutDelivery(body.preview);
      setCloseoutPackage(body.preview.package);
      setCloseoutSelection(body.preview.package.selectedArtifactRefs.map(closeoutArtifactKey));
      setCloseoutDeliveryDraft({
        recipient: body.preview.email.recipient ?? "",
        subject: body.preview.email.subject,
        bodyText: body.preview.email.bodyText,
        copyTarget: body.preview.email.defaultCopyTarget ?? "",
        sendCopy: Boolean(body.preview.email.defaultCopyTarget)
      });
      setCloseoutDeliveryStatus(body.preview.package.selectedArtifactRefs.length ? "Review this package before a separate delivery action." : "Select and save at least one artifact before delivery review.");
    } catch {
      if (!isCurrentCloseoutDeliveryReviewRequest(expectedRequest, {
        loadSequence: closeoutLoadSequenceRef.current,
        selectionGeneration: closeoutSelectionGenerationRef.current
      })) return;
      setCloseoutDeliveryStatus("Delivery review is unavailable right now.");
    }
  }

  async function sendCloseoutPackageDelivery(): Promise<void> {
    if (!detail || !closeoutDelivery || !closeoutDeliveryDraft) return;
    setCloseoutDeliveryBusy(true);
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(detail.id)}/closeout-package/delivery`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          recipient: closeoutDeliveryDraft.recipient,
          subject: closeoutDeliveryDraft.subject,
          bodyText: closeoutDeliveryDraft.bodyText,
          ...(closeoutDeliveryDraft.copyTarget ? { copyTarget: closeoutDeliveryDraft.copyTarget } : {}),
          sendCopy: closeoutDeliveryDraft.sendCopy,
          selectedArtifactRefs: closeoutDelivery.package.selectedArtifactRefs
        })
      }).then((response) => response.json() as Promise<CloseoutDeliveryResponse>);
      if (!body.ok || !body.preview) {
        setCloseoutDeliveryStatus(body.error ?? "Closeout package delivery could not be sent.");
        return;
      }
      setCloseoutDelivery(body.preview);
      setCloseoutPackage(body.preview.package);
      setCloseoutDeliveryStatus("Closeout package email sent. Package selection and delivery history remain separate records.");
    } catch {
      setCloseoutDeliveryStatus("Closeout package delivery could not be sent.");
    } finally { setCloseoutDeliveryBusy(false); }
  }

  async function loadBookingPreview(jobId: string, visitId?: string): Promise<void> {
    if (!jobId) {
      setBookingPreview(null);
      setBookingDraft(null);
      return;
    }
    try {
      const params = new URLSearchParams({ tenantId: props.tenantId });
      if (visitId) {
        params.set("visitId", visitId);
      }
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(jobId)}/booking-confirmation-preview?${params.toString()}`)
        .then((response) => response.json() as Promise<BookingConfirmationPreviewResponse>);
      if (!body.ok || !body.preview) {
        setBookingPreview(null);
        setBookingDraft(null);
        return;
      }
      setBookingPreview(body.preview);
      setBookingDraft((current) => current && current.visitId === body.preview!.visit.id ? current : defaultBookingDraft(body.preview));
    } catch {
      setBookingPreview(null);
      setBookingDraft(null);
    }
  }

  async function loadReviewSequences(jobId: string): Promise<void> {
    if (!jobId) {
      setReviewSequences([]);
      setReviewStatus("Review follow-up status will load with the job detail.");
      return;
    }
    try {
      const body = await fetch(`/api/crm/review-sequences?tenantId=${encodeURIComponent(props.tenantId)}&jobId=${encodeURIComponent(jobId)}`)
        .then((response) => response.json() as Promise<ReviewSequenceStatusResponse>);
      if (!body.ok) {
        setReviewSequences([]);
        setReviewStatus(body.error ?? "Review follow-up status is unavailable right now.");
        return;
      }
      const nextSequences = body.sequences ?? [];
      setReviewSequences(nextSequences);
      setReviewStatus(
        nextSequences.length
          ? `${nextSequences.length} review sequence${nextSequences.length === 1 ? "" : "s"} linked to this job.`
          : "No review follow-up is active for this job yet."
      );
    } catch {
      setReviewSequences([]);
      setReviewStatus("Review follow-up status is unavailable right now.");
    }
  }

  async function loadFieldDocs(jobId: string): Promise<void> {
    if (!jobId) {
      setFieldDocsMedia([]);
      setFieldDocsReports([]);
      setSignedDocuments([]);
      setFieldDocsStatus("NexCam media and reports will load with the job detail.");
      return;
    }
    setFieldDocsStatus("Loading NexCam media and reports...");
    try {
      const [mediaBody, reportsBody, signedDocsBody] = await Promise.all([
        fetch(`/api/fielddocs/media?tenantId=${encodeURIComponent(props.tenantId)}&jobId=${encodeURIComponent(jobId)}&limit=12`)
          .then((response) => response.json() as Promise<FieldDocsMediaListResponse>),
        fetch(`/api/fielddocs/reports?tenantId=${encodeURIComponent(props.tenantId)}&jobId=${encodeURIComponent(jobId)}&limit=8`)
          .then((response) => response.json() as Promise<FieldDocsReportsListResponse>),
        fetch(`/api/fielddocs/signed-documents?tenantId=${encodeURIComponent(props.tenantId)}&jobId=${encodeURIComponent(jobId)}`)
          .then((response) => response.json() as Promise<SignedDocumentsResponse>)
      ]);
      const nextMedia = mediaBody.ok ? (mediaBody.media ?? []) : [];
      const nextReports = reportsBody.ok ? (reportsBody.reports ?? []) : [];
      const nextSignedDocs = signedDocsBody.ok ? (signedDocsBody.records ?? []) : [];
      setFieldDocsMedia(nextMedia);
      setFieldDocsReports(nextReports);
      setSignedDocuments(nextSignedDocs);
      if (!mediaBody.ok || !reportsBody.ok || !signedDocsBody.ok) {
        setFieldDocsStatus(mediaBody.error ?? reportsBody.error ?? signedDocsBody.error ?? "NexCam read rails are unavailable right now.");
        return;
      }
      setFieldDocsStatus(
        `${nextMedia.length} media item${nextMedia.length === 1 ? "" : "s"}, ${nextReports.length} report${nextReports.length === 1 ? "" : "s"}, and ${nextSignedDocs.length} signed doc${nextSignedDocs.length === 1 ? "" : "s"} loaded for this job.`
      );
    } catch {
      setFieldDocsMedia([]);
      setFieldDocsReports([]);
      setSignedDocuments([]);
      setFieldDocsStatus("NexCam read rails are unavailable right now.");
    }
  }

  useEffect(() => {
    void loadJobs();
    const handleMutation = () => void loadJobs();
    window.addEventListener("nexops:crm-mutated", handleMutation);
    return () => window.removeEventListener("nexops:crm-mutated", handleMutation);
  }, [props.tenantId]);

  useEffect(() => {
    if (props.initialFilter) {
      setStatusFilter(props.initialFilter);
    }
  }, [props.initialFilter]);

  useEffect(() => {
    if (!props.focusedJobId) {
      return;
    }
    if (props.focusedJobId === selectedJobId) {
      return;
    }
    if (jobs.some((job) => job.id === props.focusedJobId)) {
      setDetailOpen(true);
      setSelectedJobId(props.focusedJobId);
    }
  }, [props.focusedJobId, jobs, selectedJobId]);

  useEffect(() => {
    void loadDetail(detailOpen ? selectedJobId : "");
  }, [detailOpen, selectedJobId]);

  useEffect(() => {
    if (!detailOpen || !detail?.id || mobileDetailFocusJobIdRef.current !== detail.id || !window.matchMedia("(max-width: 1080px)").matches) {
      return;
    }
    mobileDetailFocusJobIdRef.current = "";
    const detailElement = jobDetailRef.current;
    if (!detailElement) {
      return;
    }
    detailElement.focus({ preventScroll: true });
    detailElement.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
  }, [detail?.id, detailOpen]);

  useEffect(() => {
    if (!filteredJobs.length) {
      if (selectedJobId) {
        setSelectedJobId("");
      }
      return;
    }
    if (!filteredJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(filteredJobs[0]?.id ?? "");
    }
  }, [filteredJobs, selectedJobId]);

  useEffect(() => {
    if (!detail?.id) {
      setBookingPreview(null);
      setBookingDraft(null);
      setReviewSequences([]);
      setFieldDocsMedia([]);
      setFieldDocsReports([]);
      return;
    }
    void Promise.all([loadBookingPreview(detail.id), loadReviewSequences(detail.id), loadFieldDocs(detail.id)]);
  }, [detail?.id, detail?.visits.length, detail?.updatedAt]);

  useEffect(() => {
    if (!filteredJobs.length) {
      if (selectedJobId) {
        setSelectedJobId("");
      }
      return;
    }
    if (!filteredJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(filteredJobs[0]?.id ?? "");
    }
  }, [filteredJobs, selectedJobId]);

  useEffect(() => {
    if (!createClientOptions.length) {
      setShowInlineClientCreate(true);
      return;
    }
    if (!createClientId && !showInlineClientCreate) {
      setCreateClientId(createClientOptions[0]?.id ?? "");
    }
  }, [createClientId, createClientOptions, showInlineClientCreate]);

  useEffect(() => {
    if (!createClientId || showInlineClientCreate) {
      if (createPropertyId) setCreatePropertyId("");
      return;
    }
    if (createClientProperties.some((property) => property.id === createPropertyId)) return;
    setCreatePropertyId(defaultManualJobPropertyId(props.properties, createClientId));
  }, [createClientId, createClientProperties, createPropertyId, props.properties, showInlineClientCreate]);

  function handleClientChoice(value: string): void {
    if (value === NEW_JOB_CLIENT_VALUE) {
      setCreateClientId("");
      setCreatePropertyId("");
      setCreatedPropertyOption(null);
      setShowInlineClientCreate(true);
      setInlineClientStatus("Create the client here, then the job draft continues with your title and billing plan still in place.");
      return;
    }
    setCreateClientId(value);
    setCreatePropertyId(defaultManualJobPropertyId(props.properties, value));
    setCreatedPropertyOption(null);
    setShowInlineClientCreate(false);
    setInlineClientStatus("Using an existing client on this manual job draft.");
  }

  async function createInlineClient(): Promise<void> {
    if (!inlineClientCanSave || inlineClientBusy) {
      return;
    }
    setInlineClientBusy(true);
    setInlineClientStatus("Saving the new client and returning you to the job draft...");
    try {
      const displayName = [inlineClientDraft.firstName.trim(), inlineClientDraft.lastName.trim()].filter(Boolean).join(" ") || inlineClientDraft.company.trim();
      const body = await fetch("/api/crm/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          name: displayName,
          ...(inlineClientDraft.company.trim() ? { company: inlineClientDraft.company.trim() } : {}),
          ...((inlineClientDraft.firstName.trim() || inlineClientDraft.lastName.trim())
            ? {
                personName: {
                  ...(inlineClientDraft.firstName.trim() ? { firstName: inlineClientDraft.firstName.trim() } : {}),
                  ...(inlineClientDraft.lastName.trim() ? { lastName: inlineClientDraft.lastName.trim() } : {})
                },
                displayNamePreference: inlineClientDraft.company.trim() ? "company" : "person"
              }
            : {}),
          emails: inlineClientDraft.email.trim() ? [inlineClientDraft.email.trim()] : [],
          phones: [inlineClientDraft.phone.trim()],
          consent: { email: false, sms: false, marketing: false },
          primaryProperty: {
            address: {
              street1: inlineClientDraft.street1.trim(),
              city: inlineClientDraft.city.trim(),
              province: inlineClientDraft.province.trim(),
              postalCode: inlineClientDraft.postalCode.trim(),
              country: inlineClientDraft.country.trim() || "US"
            }
          }
        })
      }).then((response) => response.json() as Promise<InlineJobClientCreateResponse>);
      if (!body.ok || !body.client) {
        setInlineClientStatus(body.error ?? "Client create failed inside the job rail.");
        return;
      }
      const nextClient: ClientOption = {
        id: body.client.id,
        name: body.client.name,
        company: body.client.company,
        personName: body.client.personName,
        displayNamePreference: body.client.displayNamePreference,
        emails: body.client.emails ?? [],
        phones: body.client.phones ?? []
      };
      setCreatedClientOption(nextClient);
      setCreateClientId(nextClient.id);
      setCreatedPropertyOption(body.property ?? null);
      setCreatePropertyId(body.property?.id ?? "");
      setShowInlineClientCreate(false);
      setInlineClientDraft(blankInlineJobClientDraft());
      setInlineClientStatus(`${clientLabel(nextClient)} is ready. Your job title and draft billing plan stayed in place.`);
      props.onCrmMutation();
    } catch {
      setInlineClientStatus("Client create failed inside the job rail.");
    } finally {
      setInlineClientBusy(false);
    }
  }

  async function createJob(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!createClientId || !createTitle.trim()) {
      setStatus(showInlineClientCreate ? "Create the client first, then save the job." : "Pick a client and title before creating the job.");
      return;
    }
    setCreateBusy(true);
    try {
      const body = await fetch("/api/crm/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          clientId: createClientId,
          ...(createPropertyId ? { propertyId: createPropertyId } : {}),
          title: createTitle.trim(),
          ...(paymentScheduleToPayload(createPaymentSchedule) ? { paymentSchedule: paymentScheduleToPayload(createPaymentSchedule) } : {})
        })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok || !body.job) {
        setStatus(body.error ?? "Job create failed.");
        return;
      }
      setCreateTitle("");
      setCreatePaymentSchedule(blankPaymentSchedule());
      props.onCrmMutation();
      setDetailOpen(true);
      await loadJobs(body.job.id);
      await loadDetail(body.job.id);
      setStatus(`Created ${body.job.title}.`);
    } catch {
      setStatus("Job create failed.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function toggleClientHubFieldDocsVisibility(hidden: boolean): Promise<void> {
    if (!detail?.id) {
      return;
    }
    setFieldDocsBusy("visibility");
    setFieldDocsStatus(hidden ? "Hiding this job from the client hub..." : "Restoring this job to the client hub...");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(detail.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          clientVisibility: {
            hideFieldDocsFromPortal: hidden
          }
        })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok || !body.job) {
        setFieldDocsStatus(body.error ?? "Client-hub visibility could not be updated.");
        return;
      }
      setDetail(body.job);
      setFieldDocsStatus(hidden ? "This job's NexCam rail is now hidden from the client hub." : "This job's NexCam rail is visible in the client hub again.");
      props.onCrmMutation();
    } catch {
      setFieldDocsStatus("Client-hub visibility could not be updated.");
    } finally {
      setFieldDocsBusy("");
    }
  }

  async function startReviewSequence(): Promise<void> {
    if (!detail?.id) {
      return;
    }
    setReviewBusy("start");
    setReviewStatus("Starting review follow-up...");
    try {
      const body = await fetch("/api/crm/review-sequences/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          jobId: detail.id,
          source: "manual"
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setReviewStatus(body.error ?? "Review follow-up could not be started.");
        return;
      }
      await loadReviewSequences(detail.id);
    } catch {
      setReviewStatus("Review follow-up could not be started.");
    } finally {
      setReviewBusy("");
    }
  }

  async function stopReviewSequence(reviewSequenceId: string): Promise<void> {
    setReviewBusy(`stop-${reviewSequenceId}`);
    setReviewStatus("Stopping review follow-up...");
    try {
      const body = await fetch(`/api/crm/review-sequences/${encodeURIComponent(reviewSequenceId)}/stop`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setReviewStatus(body.error ?? "Review follow-up could not be stopped.");
        return;
      }
      if (detail?.id) {
        await loadReviewSequences(detail.id);
      }
    } catch {
      setReviewStatus("Review follow-up could not be stopped.");
    } finally {
      setReviewBusy("");
    }
  }

  async function markReviewed(reviewSequenceId: string): Promise<void> {
    setReviewBusy(`reviewed-${reviewSequenceId}`);
    setReviewStatus("Marking review complete...");
    try {
      const body = await fetch(`/api/crm/review-sequences/${encodeURIComponent(reviewSequenceId)}/mark-reviewed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<{ ok: boolean; error?: string }>);
      if (!body.ok) {
        setReviewStatus(body.error ?? "Review completion could not be recorded.");
        return;
      }
      if (detail?.id) {
        await loadReviewSequences(detail.id);
      }
    } catch {
      setReviewStatus("Review completion could not be recorded.");
    } finally {
      setReviewBusy("");
    }
  }

  async function scheduleVisit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!detail || !visitDate || !visitStartTime || !visitEndDate || !visitEndTime) {
      setDetailStatus("Pick start and end dates and times before booking the visit.");
      return;
    }
    const start = parseVisitDateTime(visitDate, visitStartTime);
    const end = parseVisitDateTime(visitEndDate, visitEndTime);
    if (!start || !end) {
      setDetailStatus("Enter dates as YYYY-MM-DD and times as HH:MM before booking the visit.");
      return;
    }
    if (!(end.getTime() > start.getTime())) {
      setDetailStatus("Visit end must be after the start.");
      return;
    }
    setActionBusy("close");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(detail.id)}/visits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          title: visitTitle.trim() || detail.title,
          start: start.toISOString(),
          end: end.toISOString()
        })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok) {
        setDetailStatus(body.error ?? "Visit booking failed.");
        return;
      }
      props.onCrmMutation();
      await loadJobs(detail.id);
      await loadDetail(detail.id);
      setDetailStatus("Visit booked.");
    } catch {
      setDetailStatus("Visit booking failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function savePaymentSchedule(): Promise<void> {
    if (!detail) {
      return;
    }
    setActionBusy("invoice");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(detail.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          paymentSchedule: paymentScheduleToPayload(detailPaymentSchedule)
        })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok || !body.job) {
        setDetailStatus(body.error ?? "Payment schedule update failed.");
        return;
      }
      props.onCrmMutation();
      await loadJobs(detail.id);
      await loadDetail(detail.id);
      setDetailStatus("Payment schedule saved.");
    } catch {
      setDetailStatus("Payment schedule update failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function performAction(action: JobAction): Promise<void> {
    if (!detail) {
      return;
    }
    setActionBusy(action);
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(detail.id)}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId, action })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok) {
        setDetailStatus(body.error ?? "Job action failed.");
        return;
      }
      props.onCrmMutation();
      await loadJobs(detail.id);
      await loadDetail(detail.id);
      if ((action === "invoice" || action === "close_and_invoice") && body.invoice?.id) {
        props.onOpenInvoice?.(body.invoice.id);
      }
      setDetailStatus(action === "close_and_invoice"
        ? "Job closed and invoice drafted."
        : action === "invoice"
          ? "Invoice drafted."
          : action === "dismiss_invoice_reminder"
            ? "Invoice reminder dismissed."
            : "Job closed.");
    } catch {
      setDetailStatus("Job action failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function createQuickPaymentRequest(): Promise<void> {
    if (!detail) {
      return;
    }
    if (!quickPaymentDraft.title.trim() || Number(quickPaymentDraft.amount) <= 0) {
      setDetailStatus("Quick payment requests need a title and amount.");
      return;
    }
    setActionBusy("invoice");
    setDetailStatus("Creating quick payment request...");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(detail.id)}/quick-payment-request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          title: quickPaymentDraft.title.trim(),
          amount: Number(quickPaymentDraft.amount),
          ...(quickPaymentDraft.memo.trim() ? { memo: quickPaymentDraft.memo.trim() } : {})
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; invoice?: InvoiceRecord; error?: string }>);
      if (!body.ok || !body.invoice) {
        setDetailStatus(body.error ?? "Quick payment request failed.");
        return;
      }
      props.onCrmMutation();
      await loadJobs(detail.id);
      await loadDetail(detail.id);
      props.onOpenInvoice?.(body.invoice.id);
      setDetailStatus(`Quick payment request created as invoice ${body.invoice.number ?? body.invoice.id}.`);
    } catch {
      setDetailStatus("Quick payment request failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function createSignedDocument(): Promise<void> {
    if (!detail) {
      return;
    }
    if (!signedDocumentDraft.title.trim() || !signedDocumentDraft.bodyText.trim()) {
      setFieldDocsStatus("Signed documents need a title and body text.");
      return;
    }
    setFieldDocsBusy("signed-document");
    setFieldDocsStatus("Creating signed document...");
    try {
      const body = await fetch("/api/fielddocs/signed-documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          clientId: detail.clientId,
          jobId: detail.id,
          ...(detail.propertyId ? { propertyId: detail.propertyId } : {}),
          kind: signedDocumentDraft.kind,
          title: signedDocumentDraft.title.trim(),
          bodyText: signedDocumentDraft.bodyText.trim()
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; record?: SignedDocumentRecord; error?: string }>);
      if (!body.ok || !body.record) {
        setFieldDocsStatus(body.error ?? "Signed document could not be created.");
        return;
      }
      await loadFieldDocs(detail.id);
      setFieldDocsStatus(`Signed document ${body.record.title} created and waiting on signature.`);
    } catch {
      setFieldDocsStatus("Signed document could not be created.");
    } finally {
      setFieldDocsBusy("");
    }
  }

  function openSignatureSheet(record: SignedDocumentRecord): void {
    setSigningDocumentId(record.id);
    setSignatureDraft(blankSignatureCaptureValue(selectedClient?.name ?? detail?.client?.name ?? ""));
  }

  function closeSignatureSheet(): void {
    setSigningDocumentId("");
    setSignatureDraft(blankSignatureCaptureValue(selectedClient?.name ?? detail?.client?.name ?? ""));
  }

  async function submitSignedDocument(): Promise<void> {
    if (!signingDocument) {
      return;
    }
    const typedName = signatureDraft.typedName.trim();
    if (signatureDraft.mode === "typed" && !typedName) {
      setFieldDocsStatus("Type the signer name before saving the signature.");
      return;
    }
    if (signatureDraft.mode === "drawn" && !signatureDraft.drawnDataUrl.trim()) {
      setFieldDocsStatus("Draw the signature before saving it.");
      return;
    }
    setFieldDocsBusy("sign-document");
    setFieldDocsStatus(`Saving signature on ${signingDocument.title}...`);
    try {
      const body = await fetch(`/api/fielddocs/signed-documents/${encodeURIComponent(signingDocument.id)}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          signatureMode: signatureDraft.mode,
          ...(typedName ? { typedName } : {}),
          ...(signatureDraft.drawnDataUrl.trim() ? { drawnDataUrl: signatureDraft.drawnDataUrl.trim() } : {})
        })
      }).then((response) => response.json() as Promise<{ ok: boolean; record?: SignedDocumentRecord; error?: string }>);
      if (!body.ok || !body.record) {
        setFieldDocsStatus(body.error ?? "Signed document could not be finalized.");
        return;
      }
      if (detail) {
        await loadFieldDocs(detail.id);
      }
      closeSignatureSheet();
      setFieldDocsStatus(`Signed document ${body.record.title} now has a captured ${body.record.signature?.mode ?? "customer"} signature.`);
    } catch {
      setFieldDocsStatus("Signed document could not be finalized.");
    } finally {
      setFieldDocsBusy("");
    }
  }

  async function completeVisit(visitId: string): Promise<void> {
    if (!detail) {
      return;
    }
    setActionBusy("invoice");
    try {
      const body = await fetch(`/api/crm/jobs/visits/${encodeURIComponent(visitId)}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: props.tenantId })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok) {
        setDetailStatus(body.error ?? "Visit completion failed.");
        return;
      }
      props.onCrmMutation();
      await loadJobs(detail.id);
      await loadDetail(detail.id);
      setDetailStatus("Visit completed and lifecycle updated.");
    } catch {
      setDetailStatus("Visit completion failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function sendBookingConfirmation(): Promise<void> {
    if (!detail || !bookingDraft) {
      return;
    }
    setBookingBusy(true);
    setDetailStatus(bookingDraft.mode === "email" ? "Sending booking confirmation email..." : "Sending booking confirmation text...");
    try {
      const body = await fetch(`/api/crm/jobs/${encodeURIComponent(detail.id)}/booking-confirmation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: props.tenantId,
          visitId: bookingDraft.visitId,
          mode: bookingDraft.mode,
          ...(bookingDraft.target.trim() ? { target: bookingDraft.target.trim() } : {}),
          ...(bookingDraft.subject.trim() ? { subject: bookingDraft.subject.trim() } : {}),
          ...(bookingDraft.bodyText.trim() ? { bodyText: bookingDraft.bodyText.trim() } : {}),
          sendCopy: bookingDraft.sendCopy,
          ...(bookingDraft.copyTarget.trim() ? { copyTarget: bookingDraft.copyTarget.trim() } : {})
        })
      }).then((response) => response.json() as Promise<JobMutationResponse>);
      if (!body.ok) {
        setDetailStatus(body.error ?? "Booking confirmation failed.");
        return;
      }
      setBookingSheetOpen(false);
      props.onCrmMutation();
      await loadJobs(detail.id);
      await loadDetail(detail.id);
      await loadBookingPreview(detail.id, bookingDraft.visitId);
      setDetailStatus(bookingDraft.mode === "email" ? "Booking confirmation email sent." : "Booking confirmation text sent.");
    } catch {
      setDetailStatus("Booking confirmation failed.");
    } finally {
      setBookingBusy(false);
    }
  }

  function selectJobFromRoster(jobId: string): void {
    mobileDetailFocusJobIdRef.current = jobId;
    setDetailOpen(true);
    setSelectedJobId(jobId);
  }

  return (
    <section className="nexops-module-page">
      <NexOpsRosterTemplate
        eyebrow="Job Engine"
        title="Jobs"
        detail="Manage active work, visits, reminders, documents, and closeout from one connected operational rail."
        icon={<NexOpsNavGlyph module="jobs" />}
        primaryAction={<button type="button" onClick={() => document.getElementById("nexops-new-job-form")?.scrollIntoView({ behavior: "smooth", block: "start" })}>New Job</button>}
        heroClassName="module-hero-card--jobs"
        controls={<section className="nexops-jobs-roster-filter-card" aria-label="Search and filter jobs">
          <h2>Search Jobs</h2>
          <label className="nexops-jobs-roster-search">
            <span className="sr-only">Search all jobs, including history</span>
            <input
              value={jobSearch}
              onChange={(event) => setJobSearch(event.target.value)}
              placeholder="Search jobs"
            />
          </label>
          <button
            type="button"
            className="nexops-jobs-filter-toggle"
            onClick={() => setJobFiltersOpen((current) => !current)}
            aria-expanded={jobFiltersOpen}
          >
            <span aria-hidden="true">☷</span>
            <b>Filter</b>
            <small>{filteredJobs.length}</small>
          </button>
          {jobFiltersOpen ? <div className="nexops-jobs-filter-options" aria-label="Job Status Filters">
            {JOB_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`nexops-jobs-filter-pill${statusFilter === filter ? " active" : ""}`}
                onClick={() => setStatusFilter(filter)}
              >
                <span>{filter}</span>
                <small>{filterCounts[filter]}</small>
              </button>
            ))}
          </div> : null}
          <span className="nexops-status-pill">{status}</span>
        </section>}
      >
      <section className="nexops-jobs-layout">
        <article className="nexops-module-card nexops-jobs-create-card">
          <p className="eyebrow">Manual Create</p>
          <h2>New Job</h2>
          <form id="nexops-new-job-form" className="nexops-jobs-form" onSubmit={(event) => void createJob(event)}>
            <label>
              Client
              <select value={showInlineClientCreate ? NEW_JOB_CLIENT_VALUE : createClientId} onChange={(event) => handleClientChoice(event.target.value)}>
                <option value="">Choose Client</option>
                {createClientOptions.map((client) => <option key={client.id} value={client.id}>{clientLabel(client)}</option>)}
                <option value={NEW_JOB_CLIENT_VALUE}>+ Create New Client</option>
              </select>
            </label>
            {!showInlineClientCreate && createClientId ? (
              <label>
                Property / service location
                <select value={createPropertyId} onChange={(event) => setCreatePropertyId(event.target.value)}>
                  <option value="">{createClientProperties.length ? "Choose a property" : "No property on file yet"}</option>
                  {createClientProperties.map((property) => <option key={property.id} value={property.id}>{propertyLabel(property)}</option>)}
                </select>
              </label>
            ) : null}
            {showInlineClientCreate ? (
              <section className="nexops-module-card embedded">
                <div className="nexops-jobs-card-heading">
                  <div>
                    <p className="eyebrow">Inline Client Create</p>
                    <h3>Keep the Job Draft Open</h3>
                  </div>
                  <span>{inlineClientStatus}</span>
                </div>
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>First Name</span>
                    <input value={inlineClientDraft.firstName} onChange={(event) => setInlineClientDraft((current) => ({ ...current, firstName: event.target.value }))} />
                  </label>
                  <label className="nexops-field">
                    <span>Last Name</span>
                    <input value={inlineClientDraft.lastName} onChange={(event) => setInlineClientDraft((current) => ({ ...current, lastName: event.target.value }))} />
                  </label>
                </div>
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Company</span>
                    <input value={inlineClientDraft.company} onChange={(event) => setInlineClientDraft((current) => ({ ...current, company: event.target.value }))} />
                  </label>
                  <label className="nexops-field">
                    <span>Main Phone</span>
                    <input value={inlineClientDraft.phone} onChange={(event) => setInlineClientDraft((current) => ({ ...current, phone: event.target.value }))} />
                  </label>
                </div>
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Main Email</span>
                    <input type="email" value={inlineClientDraft.email} onChange={(event) => setInlineClientDraft((current) => ({ ...current, email: event.target.value }))} />
                  </label>
                  <label className="nexops-field">
                    <span>Street</span>
                    <input value={inlineClientDraft.street1} onChange={(event) => setInlineClientDraft((current) => ({ ...current, street1: event.target.value }))} />
                  </label>
                </div>
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>City</span>
                    <input value={inlineClientDraft.city} onChange={(event) => setInlineClientDraft((current) => ({ ...current, city: event.target.value }))} />
                  </label>
                  <label className="nexops-field">
                    <span>State</span>
                    <input value={inlineClientDraft.province} onChange={(event) => setInlineClientDraft((current) => ({ ...current, province: event.target.value }))} />
                  </label>
                  <label className="nexops-field">
                    <span>ZIP</span>
                    <input value={inlineClientDraft.postalCode} onChange={(event) => setInlineClientDraft((current) => ({ ...current, postalCode: event.target.value }))} />
                  </label>
                </div>
                <div className="nexops-inline-actions wrap">
                  <small>{inlineClientCanSave ? "Name, address, and telephone are present. Email stays optional." : `Add ${inlineClientMissingFields.join(", ")} before saving the client.`}</small>
                  <button type="button" className="ghost" onClick={() => {
                    setShowInlineClientCreate(false);
                    setInlineClientStatus("Switched back to existing-client selection.");
                  }} disabled={!createClientOptions.length || inlineClientBusy}>
                    Use Existing Instead
                  </button>
                  <button type="button" onClick={() => void createInlineClient()} disabled={!inlineClientCanSave || inlineClientBusy}>
                    {inlineClientBusy ? "Saving Client..." : "Save Client and Return"}
                  </button>
                </div>
              </section>
            ) : null}
            <label>
              Job Title
              <input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="Leak detection follow-up" />
            </label>
            <PaymentScheduleEditor
              value={createPaymentSchedule}
              onChange={setCreatePaymentSchedule}
              title="Job Payment Schedule"
              hint="Use this when the work needs a deposit or milestone billing plan even without a quote."
            />
            <button type="submit" disabled={createBusy || inlineClientBusy || !createClientId || !createTitle.trim()}>
              {createBusy ? "Creating..." : "Create Job"}
            </button>
          </form>
        </article>

        <article className="nexops-module-card nexops-jobs-roster-card">
          <div className="nexops-jobs-card-heading">
            <div>
              <p className="eyebrow">Job Results</p>
              <h2>{filteredJobs.length} Results</h2>
              <span className="sr-only">Job Roster</span>
            </div>
            <span>{jobs.length} total</span>
          </div>
          <div className="nexops-jobs-list">
            {filteredJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className={`nexops-jobs-list-item${detailOpen && job.id === selectedJobId ? " active" : ""}`}
                onClick={() => selectJobFromRoster(job.id)}
              >
                <div className="nexops-jobs-list-banner">
                  <strong>{job.number ?? job.id}</strong>
                  <span>{job.client?.name ?? job.clientId}</span>
                </div>
                <div className="nexops-jobs-list-body">
                  <strong>{job.title}</strong>
                  <span>{job.property?.address?.street1 ?? job.property?.label ?? "No service property selected"}{isHistoricalJob(job) ? " · Historical record" : ""}</span>
                  <div>
                    <span className={`nexops-job-status status-${job.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{job.status}</span>
                    <small>{job.visitCount} visit{job.visitCount === 1 ? "" : "s"} · {formatMoney(job.totals?.total)}</small>
                  </div>
                </div>
              </button>
            ))}
            {!jobs.length ? <p className="nexops-empty-copy">No jobs yet. Requests and approved quotes can start here, and manual jobs can too.</p> : null}
            {jobs.length > 0 && !filteredJobs.length ? <p className="nexops-empty-copy">No jobs match this search or status right now.</p> : null}
          </div>
        </article>
      </section>
      </NexOpsRosterTemplate>

      {detailOpen ? <NexOpsDetailTemplate
        back={<button type="button" onClick={() => setDetailOpen(false)}>Back to Job Roster</button>}
        eyebrow="Job Detail"
        title={detail?.title ?? "Loading Job"}
        detail={detail?.client?.name ?? detailStatus}
        status={detail ? <mark>{detail.status}</mark> : null}
        navigation={<div className="nexops-jobs-filter-row" aria-label="Job Detail Filters">
          {JOB_FILTERS.map((filter) => (
            <button
              key={`detail-${filter}`}
              type="button"
              className={`nexops-jobs-filter-pill${statusFilter === filter ? " active" : ""}`}
              onClick={() => setStatusFilter(filter)}
            >
              <span>{filter}</span>
              <small>{filterCounts[filter]}</small>
            </button>
          ))}
        </div>}
      >
      <section className="nexops-two-column nexops-jobs-detail-shell" ref={jobDetailRef} tabIndex={-1} aria-label="Job details">
        <article className="nexops-module-card">
          <p>{detailStatus}</p>
          {detail ? (
            <div className="nexops-jobs-detail">
              <div className="nexops-density-summary-strip">
                <article><span>Status</span><strong>{detail.status}</strong><small>{deriveWorkPackageStatus(detail).replaceAll("_", " ")}</small></article>
                <article><span>Client</span><strong>{detail.client?.name ?? detail.clientId}</strong><small>{detail.number ?? "Native Job"}</small></article>
                <article><span>Property</span><strong>{detail.property?.address?.street1 ?? detail.property?.label ?? "Not attached"}</strong><small>{detail.visitCount} visits</small></article>
                <article><span>Total</span><strong>{formatMoney(detail.totals?.total)}</strong><small>{detail.paymentSchedule?.enabled ? `${detail.paymentSchedule.milestones.length} milestones` : "Full-balance rail"}</small></article>
              </div>

              {isHistoricalJob(detail) ? (
                <section className="nexops-jobs-history-context" aria-label="Historical job context">
                  <div>
                    <p className="eyebrow">Historical record</p>
                    <h3>Saved history for this client</h3>
                    <p>This job and its past visit information stay read-only. Start new work from the same client without changing this history.</p>
                  </div>
                  <button type="button" onClick={() => prepareFollowUpFromHistory(detail)}>Start new work from this history</button>
                </section>
              ) : null}

              {prominentJobFacts.length ? (
                <div className="nexops-request-alert-strip">
                  {prominentJobFacts.map((fact) => (
                    <span key={`${detail.id}-${fact.key}`}>{fact.label}: {fact.text}</span>
                  ))}
                </div>
              ) : null}

              <div className="nexops-jobs-section">
                <div className="nexops-jobs-card-heading">
                  <h3>Next Move</h3>
                  <span>One work rail driven by visits, reminders, and billing state.</span>
                </div>
                <div className="nexops-jobs-grid">
                  <div className="nexops-jobs-stat">
                    <strong>Current Status</strong>
                    <span>{deriveWorkPackageStatus(detail).replaceAll("_", " ")}</span>
                  </div>
                  <div className="nexops-jobs-stat">
                    <strong>Source Quote</strong>
                    <span>{detail.quote?.number ?? detail.quote?.id ?? "No quote attached"}</span>
                  </div>
                  <div className="nexops-jobs-stat">
                    <strong>Billing Rail</strong>
                    <span>{detail.paymentSchedule?.enabled ? `${detail.paymentSchedule.milestones.length} milestones active` : "Full-balance rail"}</span>
                  </div>
                  <div className="nexops-jobs-stat">
                    <strong>Dominant Action</strong>
                    <span>{nextMove?.label ?? deriveWorkPackageAction(detail)}</span>
                  </div>
                </div>
                <div className="nexops-jobs-actions">
                  {bookingPreview && !bookingConfirmationWasSent(detail, bookingPreview.visit.id) ? (
                    <button type="button" disabled={bookingBusy} onClick={() => setBookingSheetOpen(true)}>Send Booking Confirmation</button>
                  ) : null}
                  <button type="button" disabled={actionBusy !== null} onClick={() => void performAction("close")}>Close</button>
                  <button type="button" disabled={actionBusy !== null} onClick={() => void performAction("invoice")}>Invoice</button>
                  <button type="button" disabled={actionBusy !== null} onClick={() => void performAction("close_and_invoice")}>Close and Invoice</button>
                  {detail.reminders.invoice ? (
                    <button type="button" disabled={actionBusy !== null} onClick={() => void performAction("dismiss_invoice_reminder")}>Dismiss Reminder</button>
                  ) : null}
                </div>
                {nextMove ? <p className="nexops-empty-copy">{nextMove.detail}</p> : null}
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Quick Payment Title</span>
                    <input value={quickPaymentDraft.title} onChange={(event) => setQuickPaymentDraft((current) => ({ ...current, title: event.target.value }))} />
                  </label>
                  <label className="nexops-field">
                    <span>Amount</span>
                    <input type="number" min="0.01" step="0.01" value={quickPaymentDraft.amount} onChange={(event) => setQuickPaymentDraft((current) => ({ ...current, amount: event.target.value }))} />
                  </label>
                  <label className="nexops-field">
                    <span>Memo</span>
                    <input value={quickPaymentDraft.memo} onChange={(event) => setQuickPaymentDraft((current) => ({ ...current, memo: event.target.value }))} />
                  </label>
                </div>
                <div className="nexops-inline-actions">
                  <button type="button" disabled={actionBusy !== null} onClick={() => void createQuickPaymentRequest()}>Create Quick Payment Request</button>
                  <small>Creates a real minimal invoice on the same ledger rail, then opens billing.</small>
                </div>
              </div>

              <div className="nexops-jobs-section">
                <div className="nexops-jobs-card-heading">
                  <h3>Review Follow-Up</h3>
                  <span>Starts only after closeout and final payment settle.</span>
                </div>
                <p className="nexops-empty-copy">{reviewStatus}</p>
                {reviewSequences.length ? (
                  <div className="nexops-jobs-sublist">
                    {reviewSequences.map((sequence) => {
                      const activeStep = sequence.steps.find((step) => step.id === sequence.activeStepId) ?? sequence.steps.find((step) => step.status === "pending");
                      return (
                        <div key={sequence.id} className="nexops-jobs-sublist-item">
                          <div>
                            <strong>{sequence.status === "active" ? "Active Sequence" : sequence.status === "completed" ? "Completed Sequence" : "Stopped Sequence"}</strong>
                            <span>
                              {activeStep ? `${activeStep.label} · ${new Date(activeStep.dueAt).toLocaleDateString()}` : "No pending step"}
                            </span>
                            <small>{sequence.stopReason ? `Stop reason: ${sequence.stopReason.replace(/_/g, " ")}` : `Provider state: ${sequence.providerState.replace(/_/g, " ")}`}</small>
                          </div>
                          <div className="nexops-inline-actions">
                            {sequence.status === "active" ? (
                              <>
                                <button type="button" disabled={reviewBusy === `reviewed-${sequence.id}`} onClick={() => void markReviewed(sequence.id)}>Mark Reviewed</button>
                                <button type="button" disabled={reviewBusy === `stop-${sequence.id}`} onClick={() => void stopReviewSequence(sequence.id)}>Stop</button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="nexops-inline-actions">
                    <button type="button" disabled={reviewBusy === "start"} onClick={() => void startReviewSequence()}>Start Review Follow-Up</button>
                  </div>
                )}
              </div>

              <details className="nexops-quote-panel nexops-density-disclosure-panel" open={Boolean(bookingPreview)}>
                <summary>
                  <div className="nexops-density-disclosure-copy">
                    <h3>Booking Confirmation</h3>
                    <small>Open for email/text choice, editable message copy, calendar links, and resend status.</small>
                  </div>
                  <span className="nexops-density-disclosure-caret">Open</span>
                </summary>
                <div className="nexops-density-disclosure-body">
                  {bookingPreview && bookingDraft ? (
                    <>
                      <div className="nexops-density-inline-facts">
                        <article><h3>Selected Visit</h3><p>{bookingPreview.visit.title}</p><small>{formatDateTime(bookingPreview.visit.start)} to {formatDateTime(bookingPreview.visit.end)}</small></article>
                        <article><h3>Confirmation Status</h3><p>{bookingConfirmationWasSent(detail, bookingPreview.visit.id) ? "Already Sent" : "Not Sent Yet"}</p><small>{bookingConfirmationWasSent(detail, bookingPreview.visit.id) ? "Use resend to send a fresh copy." : "This becomes the dominant action after scheduling."}</small></article>
                        <article><h3>Email Path</h3><p>{bookingPreview.emailEnabled ? "Enabled" : "Disabled"}</p><small>{bookingPreview.emailTarget ?? "No client email on file"}</small></article>
                        <article><h3>Text Path</h3><p>{bookingPreview.smsEnabled ? "Enabled" : "Disabled"}</p><small>{bookingPreview.smsTarget ?? "No client phone on file"}</small></article>
                      </div>
                      {jobCarryForwardFacts.length ? (
                        <div className="nexops-density-inline-facts">
                          {jobCarryForwardFacts.map((fact) => (
                            <article key={`${detail.id}-carry-${fact.key}`}>
                              <h3>{fact.label}</h3>
                              <p>{fact.text}</p>
                              <small>Included in the job rail and available to reminders.</small>
                            </article>
                          ))}
                        </div>
                      ) : null}
                      <div className="nexops-inline-actions">
                        <button type="button" disabled={!bookingPreview.emailEnabled} onClick={() => { setBookingDraft(defaultBookingDraft(bookingPreview, "email")); setBookingSheetOpen(true); }}>Send by Email</button>
                        <button type="button" disabled={!bookingPreview.smsEnabled} onClick={() => { setBookingDraft(defaultBookingDraft(bookingPreview, "sms")); setBookingSheetOpen(true); }}>Send by Text</button>
                        {bookingConfirmationWasSent(detail, bookingPreview.visit.id) ? (
                          <button type="button" disabled={bookingBusy} onClick={() => setBookingSheetOpen(true)}>Resend Booking Confirmation</button>
                        ) : null}
                        <a href={bookingPreview.googleCalendarUrl} target="_blank" rel="noreferrer">Add to Google Calendar</a>
                        <a href={bookingPreview.outlookCalendarUrl} target="_blank" rel="noreferrer">Add to Outlook</a>
                      </div>
                    </>
                  ) : (
                    <p className="nexops-empty-copy">Schedule a visit first. The booking confirmation rail appears as soon as a visit exists.</p>
                  )}
                </div>
              </details>

              <div className="nexops-jobs-section">
                <div className="nexops-jobs-card-heading">
                  <h3>Visits</h3>
                  <div className="nexops-inline-actions">
                    <span>{detail.visits.length} total</span>
                    <button type="button" className="nexops-link-button" onClick={() => setJobDocumentsOpen((current) => !current)}>
                      {jobDocumentsOpen ? "Hide Job Files" : "Job Files / Closeout Documents"}
                    </button>
                  </div>
                </div>
                <form className="nexops-jobs-form inline" onSubmit={(event) => void scheduleVisit(event)}>
                  <input aria-label="Visit Title" value={visitTitle} onChange={(event) => setVisitTitle(event.target.value)} placeholder="Visit Title" />
                  <input aria-label="Visit Date" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
                  <input aria-label="Visit Start Time" type="text" inputMode="numeric" placeholder="HH:MM" value={visitStartTime} onChange={(event) => setVisitStartTime(event.target.value)} />
                  <input aria-label="Visit End Date" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={visitEndDate} onChange={(event) => setVisitEndDate(event.target.value)} />
                  <input aria-label="Visit End Time" type="text" inputMode="numeric" placeholder="HH:MM" value={visitEndTime} onChange={(event) => setVisitEndTime(event.target.value)} />
                  <button type="submit" disabled={actionBusy !== null}>Book Visit</button>
                </form>
                <div className="nexops-jobs-sublist">
                  {detail.visits.map((visit) => (
                    <div key={visit.id} className="nexops-jobs-sublist-item">
                      <div>
                        <strong>{visit.title}</strong>
                        <span>{formatDateTime(visit.start)} to {formatDateTime(visit.end)}</span>
                        <small>{deriveVisitNextStep(visit)}</small>
                      </div>
                      <div>
                        <span className={`nexops-job-status status-${visit.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{visit.status}</span>
                        {visit.status !== "complete" ? (
                          <button type="button" disabled={actionBusy !== null} onClick={() => void completeVisit(visit.id)}>Complete</button>
                        ) : null}
                        <button type="button" className="nexops-link-button" onClick={() => setActiveVisitDocumentsId(visit.id)}>Files / Documents</button>
                      </div>
                    </div>
                  ))}
                </div>
                {activeVisitDocumentsId ? (
                  <NexDocsClientWorkspace
                    tenantId={props.tenantId}
                    clientId={detail.clientId}
                    clientName={detail.client?.name ?? "this client"}
                    role={props.role}
                    propertyId={detail.propertyId}
                    jobId={detail.id}
                    visitId={activeVisitDocumentsId}
                    contextLabel={`Visit ${activeVisitDocumentsId}`}
                    nexcamCounts={{ media: fieldDocsMedia.length, reports: fieldDocsReports.length, signedDocuments: signedDocuments.length }}
                  />
                ) : null}
                {jobDocumentsOpen ? (
                  <NexDocsClientWorkspace
                    tenantId={props.tenantId}
                    clientId={detail.clientId}
                    clientName={detail.client?.name ?? "this client"}
                    role={props.role}
                    propertyId={detail.propertyId}
                    jobId={detail.id}
                    contextLabel={`Job ${detail.number ?? detail.id} files`}
                    nexcamCounts={{ media: fieldDocsMedia.length, reports: fieldDocsReports.length, signedDocuments: signedDocuments.length }}
                  />
                ) : null}
              </div>

              <details className="nexops-quote-panel nexops-density-disclosure-panel">
                <summary>
                  <div className="nexops-density-disclosure-copy">
                    <h3><ProductInlineLabel product="nexcam" label="NexCam Rail" /></h3>
                    <small>Read-only field reports and visit media for this job, plus the client-hub visibility switch.</small>
                  </div>
                  <span className="nexops-density-disclosure-caret">Open</span>
                </summary>
                <div className="nexops-density-disclosure-body">
                  <div className="nexops-jobs-card-heading">
                    <h3>Client Hub Visibility</h3>
                    {props.role !== "TECHNICIAN" ? (
                      <button
                        type="button"
                        disabled={fieldDocsBusy === "visibility"}
                        onClick={() => void toggleClientHubFieldDocsVisibility(!(detail.clientVisibility?.hideFieldDocsFromPortal === true))}
                      >
                        {detail.clientVisibility?.hideFieldDocsFromPortal ? "Show in Client Hub" : "Hide from Client Hub"}
                      </button>
                    ) : null}
                  </div>
                  <p className="nexops-empty-copy">
                    {detail.clientVisibility?.hideFieldDocsFromPortal
                      ? "Client hub visibility is currently off for this job's field reports and photos."
                      : "Client hub visibility is currently on for this job's field reports and photos."}
                  </p>
                  <p className="nexops-empty-copy">{fieldDocsStatus}</p>
                  <div className="nexops-density-inline-facts">
                    <article>
                      <h3>Reports</h3>
                      <p>{fieldDocsReports.length}</p>
                      <small>Posted PDFs ready for closeout and the client hub.</small>
                    </article>
                    <article>
                      <h3>Media</h3>
                      <p>{fieldDocsMedia.length}</p>
                      <small>Visit-scoped photos and uploads tied to this job.</small>
                    </article>
                    <article>
                      <h3>Signed Docs</h3>
                      <p>{signedDocuments.length}</p>
                      <small>Completion signoffs, waivers, and change orders attach on this same rail.</small>
                    </article>
                  </div>
                  <article className="nexops-module-card wide nexops-request-builder-card">
                    <p className="eyebrow">Signed Documents</p>
                    <div className="nexops-request-builder-grid">
                      <label className="nexops-field">
                        <span>Kind</span>
                        <select value={signedDocumentDraft.kind} onChange={(event) => setSignedDocumentDraft((current) => ({ ...current, kind: event.target.value as SignedDocumentRecord["kind"] }))}>
                          <option value="completion_signoff">Completion Sign-Off</option>
                          <option value="waiver">Waiver</option>
                          <option value="change_order">Change Order</option>
                          <option value="custom">Custom</option>
                        </select>
                      </label>
                      <label className="nexops-field">
                        <span>Title</span>
                        <input value={signedDocumentDraft.title} onChange={(event) => setSignedDocumentDraft((current) => ({ ...current, title: event.target.value }))} />
                      </label>
                    </div>
                    <label className="nexops-field">
                      <span>Body</span>
                      <textarea rows={4} value={signedDocumentDraft.bodyText} onChange={(event) => setSignedDocumentDraft((current) => ({ ...current, bodyText: event.target.value }))} />
                    </label>
                    <div className="nexops-inline-actions">
                      <button type="button" disabled={fieldDocsBusy === "signed-document"} onClick={() => void createSignedDocument()}>
                        {fieldDocsBusy === "signed-document" ? "Creating..." : "Create Signed Document"}
                      </button>
                    </div>
                  </article>
                  <div className="nexops-two-column">
                    <section className="nexops-module-page">
                      <div className="nexops-jobs-card-heading">
                        <h3>Reports</h3>
                        <span>Latest PDFs</span>
                      </div>
                      <ul className="nexops-record-list">
                        {fieldDocsReports.map((report) => (
                          <li key={report.id}>
                            <div>
                              <strong>{report.title}</strong>
                              <small>{report.visitId ? `Visit ${report.visitId}` : `Job ${report.jobId}`} · {(report.postedAt ?? report.createdAt) ? new Date(report.postedAt ?? report.createdAt ?? "").toLocaleString() : "No timestamp"}</small>
                            </div>
                            <mark>{report.status}</mark>
                            <a className="nexops-link-button" href={`/api/fielddocs/reports/${encodeURIComponent(report.id)}/pdf?tenantId=${encodeURIComponent(props.tenantId)}`} target="_blank" rel="noreferrer">Open PDF</a>
                          </li>
                        ))}
                        {!fieldDocsReports.length ? (
                          <li>
                            <div>
                              <strong>No reports on this job yet</strong>
                              <small>Generate the visit report in NexCam after the checklist is complete.</small>
                            </div>
                            <mark>pending</mark>
                            <span />
                          </li>
                        ) : null}
                      </ul>
                    </section>
                    <section className="nexops-module-page">
                      <div className="nexops-jobs-card-heading">
                        <h3>Media</h3>
                        <span>Latest Uploads</span>
                      </div>
                      <ul className="nexops-record-list">
                        {fieldDocsMedia.slice(0, 8).map((media) => (
                          <li key={media.id}>
                            <div>
                              <strong>{media.aiCaption ?? `Visit ${media.type}`}</strong>
                              <small>{media.visitId ? `Visit ${media.visitId}` : detail.number ?? detail.id}{media.exif?.ts ? ` · ${new Date(media.exif.ts).toLocaleString()}` : ""}</small>
                            </div>
                            <mark>{media.type}</mark>
                            <a className="nexops-link-button" href={`/api/media/${encodeURIComponent(media.id)}?tenantId=${encodeURIComponent(props.tenantId)}`} target="_blank" rel="noreferrer">Open</a>
                          </li>
                        ))}
                        {!fieldDocsMedia.length ? (
                          <li>
                            <div>
                              <strong>No media on this job yet</strong>
                              <small>Uploaded visit photos land here automatically once NexCam captures them.</small>
                            </div>
                            <mark>pending</mark>
                            <span />
                          </li>
                        ) : null}
                      </ul>
                    </section>
                  </div>
                  <ul className="nexops-record-list">
                    {signedDocuments.map((record) => (
                      <li key={record.id}>
                        <div>
                          <strong>{record.title}</strong>
                          <small>{record.kind.replaceAll("_", " ")} - {record.status}{record.signedAt ? ` - ${new Date(record.signedAt).toLocaleDateString()}` : ""}</small>
                        </div>
                        <div className="nexops-inline-actions">
                          <mark>{record.signature?.mode ?? "pending"}</mark>
                          {record.status !== "signed" ? (
                            <button
                              type="button"
                              className="nexops-link-button"
                              disabled={fieldDocsBusy === "sign-document"}
                              onClick={() => openSignatureSheet(record)}
                            >
                              Collect Signature
                            </button>
                          ) : null}
                          <a className="nexops-link-button" href={`/api/fielddocs/signed-documents/${encodeURIComponent(record.id)}/pdf?tenantId=${encodeURIComponent(props.tenantId)}`} target="_blank" rel="noreferrer">Open PDF</a>
                        </div>
                      </li>
                    ))}
                    {!signedDocuments.length ? (
                      <li>
                        <div>
                          <strong>No signed documents on this job yet</strong>
                          <small>Create a completion sign-off, waiver, or change order here so it lands on the client hub too.</small>
                        </div>
                        <mark>pending</mark>
                        <span />
                      </li>
                    ) : null}
                  </ul>
                </div>
              </details>

              <details className="nexops-quote-panel nexops-density-disclosure-panel">
                <summary>
                  <div className="nexops-density-disclosure-copy">
                    <h3>Billing, Reminders, and History</h3>
                    <small>Open this only when you need the milestone plan, reminder records, package preview, or lifecycle history.</small>
                  </div>
                  <span className="nexops-density-disclosure-caret">Open</span>
                </summary>
                <div className="nexops-density-disclosure-body">
                  <div className="nexops-jobs-section">
                    <div className="nexops-jobs-card-heading">
                      <h3>Payment Schedule</h3>
                      <button type="button" disabled={actionBusy !== null} onClick={() => void savePaymentSchedule()}>
                        {actionBusy === "invoice" ? "Saving..." : "Save Schedule"}
                      </button>
                    </div>
                    <PaymentScheduleEditor
                      value={detailPaymentSchedule}
                      onChange={setDetailPaymentSchedule}
                      hint="Milestones here feed invoice timing and keep recurring billing reminders on the same plan."
                    />
                  </div>

                  <div className="nexops-jobs-section">
                    <h3>Reminders and Alerts</h3>
                    <ul className="nexops-jobs-bullets">
                      <li>{detail.reminders.invoice ? `Invoice reminder due ${formatDateTime(detail.reminders.invoice.dueAt)}.` : "No invoice reminder pending."}</li>
                      <li>{detail.reminders.actionAlert?.note ?? "No office review alert pending."}</li>
                      <li>{detail.reminders.visit.length ? `${detail.reminders.visit.length} visit reminder records queued.` : "No visit reminder records pending."}</li>
                    </ul>
                  </div>

                  <div className="nexops-jobs-section">
                    <div className="nexops-jobs-card-heading">
                      <h3>Closeout Package Review</h3>
                      <span>{closeoutView.loading ? "Loading selection..." : closeoutView.ready ? `${closeoutView.selectedCount} selected` : "Selection unavailable"}</span>
                    </div>
                    <p className="nexops-empty-copy" aria-live="polite">{closeoutStatus}</p>
                    {closeoutView.loading ? <p className="nexops-empty-copy">The authoritative package and its eligible artifacts are loading.</p> : null}
                    {closeoutView.ready ? <div className="nexops-jobs-sublist">
                      {closeoutArtifacts.map((artifact) => {
                        const key = closeoutArtifactKey(artifact);
                        return (
                          <label key={key} className="nexops-jobs-sublist-item">
                            <input
                              type="checkbox"
                              checked={closeoutSelection.includes(key)}
                              disabled={!closeoutView.editable || closeoutBusy}
                              onChange={(event) => {
                                closeoutSelectionGenerationRef.current += 1;
                                setCloseoutSelection((current) => event.target.checked ? [...new Set([...current, key])] : current.filter((value) => value !== key));
                                setCloseoutDelivery(null);
                                setCloseoutDeliveryDraft(null);
                                setCloseoutDeliveryStatus("Selection changed. Save the package before returning to Delivery Review.");
                              }}
                            />
                            <div>
                              <strong>{artifact.label || artifact.fileName}</strong>
                              <span>{artifact.kind} · {artifact.source}</span>
                              <small>{artifact.visitId ? `Originating Visit: ${artifact.visitId}` : "Job-wide artifact"} · {formatDateTime(artifact.occurredAt)}</small>
                            </div>
                          </label>
                        );
                      })}
                      {!closeoutArtifacts.length ? <p className="nexops-empty-copy">Visit files, Job documents, NexCam media, and eligible records appear here when they exist.</p> : null}
                    </div> : null}
                    <div className="nexops-inline-actions">
                      <button type="button" disabled={closeoutBusy || !closeoutView.editable} onClick={() => void saveCloseoutPackage()}>{closeoutBusy ? "Saving..." : "Save Closeout Selection"}</button>
                      <button type="button" disabled={closeoutBusy || !closeoutView.ready || !closeoutPackage?.selectedArtifactRefs.length} onClick={() => void loadCloseoutDeliveryReview()}>Continue to Delivery Review</button>
                      <span>{closeoutView.loading ? "Package lifecycle is loading." : closeoutView.ready ? closeoutView.editable ? "Draft only — delivery remains a separate review." : "Package is not editable after finalization." : "Package lifecycle is unavailable until the authoritative package loads."}</span>
                    </div>
                    {closeoutDeliveryStatus ? <p className="nexops-empty-copy" role="status" aria-live="polite">{closeoutDeliveryStatus}</p> : null}
                    {closeoutDelivery ? (
                      <section className="nexops-jobs-section" aria-label="Closeout Delivery Review">
                        <div className="nexops-jobs-card-heading"><h3>Closeout Delivery Review</h3><span>{closeoutDelivery.package.selectedArtifactRefs.length} saved artifact{closeoutDelivery.package.selectedArtifactRefs.length === 1 ? "" : "s"}</span></div>
                        <p className="nexops-empty-copy">{closeoutDeliveryStatus}</p>
                        <div className="nexops-jobs-sublist">
                          {closeoutDelivery.selectedArtifacts.map((artifact) => <div key={`${artifact.source}:${artifact.artifactId}`} className="nexops-jobs-sublist-item"><div><strong>{artifact.fileName || artifact.label}</strong><span>{artifact.kind} Â· {artifact.source}</span><small>{artifact.visitId ? `Originating Visit: ${artifact.visitId}` : "Job-wide artifact"}</small></div></div>)}
                        </div>
                        <div className="nexops-density-form-grid">
                          <label>Recipient email<input aria-label="Recipient email" type="email" value={closeoutDeliveryDraft?.recipient ?? ""} onChange={(event) => setCloseoutDeliveryDraft((current) => current ? { ...current, recipient: event.target.value } : current)} /></label>
                          <label>Email subject<input aria-label="Email subject" value={closeoutDeliveryDraft?.subject ?? ""} onChange={(event) => setCloseoutDeliveryDraft((current) => current ? { ...current, subject: event.target.value } : current)} /></label>
                          <label className="nexops-density-form-full">Email message<textarea aria-label="Email message" rows={7} value={closeoutDeliveryDraft?.bodyText ?? ""} onChange={(event) => setCloseoutDeliveryDraft((current) => current ? { ...current, bodyText: event.target.value } : current)} /></label>
                          <label>Copy to self/company<input aria-label="Copy to self/company" type="email" value={closeoutDeliveryDraft?.copyTarget ?? ""} onChange={(event) => setCloseoutDeliveryDraft((current) => current ? { ...current, copyTarget: event.target.value } : current)} /></label>
                          <label className="nexops-jobs-sublist-item"><input aria-label="Send the copy" type="checkbox" checked={closeoutDeliveryDraft?.sendCopy ?? false} onChange={(event) => setCloseoutDeliveryDraft((current) => current ? { ...current, sendCopy: event.target.checked } : current)} />Send the copy</label>
                        </div>
                        <div className="nexops-density-inline-facts"><article><h3>Email</h3><p>{closeoutDelivery.email.available ? "Available for this reviewed package" : closeoutDelivery.email.unavailableReason}</p></article><article><h3>SMS</h3><p>{closeoutDelivery.sms.unavailableReason}</p></article><article><h3>Both</h3><p>Unavailable until the SMS provider is connected.</p></article></div>
                        <div className="nexops-inline-actions"><button type="button" onClick={() => { setCloseoutDelivery(null); setCloseoutDeliveryDraft(null); setCloseoutDeliveryStatus("Edit the saved attachment selection, save it, then return to delivery review."); }}>Edit Saved Attachments</button><button type="button" disabled={closeoutDeliveryBusy || !closeoutDeliveryDraft?.recipient.trim() || (!closeoutDelivery.email.available && closeoutDelivery.email.unavailableReason !== "A recipient email is required before this package can be sent.")} onClick={() => void sendCloseoutPackageDelivery()}>{closeoutDeliveryBusy ? "Sending..." : "Send Closeout Email"}</button><span>Sending records delivery separately; selecting an artifact never marks it delivered.</span></div>
                        {closeoutDelivery.attempts.length ? <div className="nexops-jobs-history">{closeoutDelivery.attempts.map((attempt) => <div key={attempt.id}><strong>{attempt.channel} {attempt.status}</strong><span>{attempt.recipient} Â· {formatDateTime(attempt.createdAt)}</span></div>)}</div> : null}
                      </section>
                    ) : null}
                  </div>

                  <div className="nexops-jobs-section">
                    <h3>History</h3>
                    <div className="nexops-jobs-history">
                      {detail.history.map((entry) => <div key={entry.id}><strong>{entry.type}</strong><span>{formatDateTime(entry.createdAt)}</span></div>)}
                      {!detail.history.length ? <p className="nexops-empty-copy">No lifecycle events yet.</p> : null}
                    </div>
                  </div>
                </div>
              </details>
            </div>
          ) : (
            <p className="nexops-empty-copy">Pick a job from the roster to review visits, reminders, invoices, and history.</p>
          )}
        </article>

        <article className="nexops-module-card">
          <p className="eyebrow">Billing Handoff</p>
          <h2>Invoices</h2>
          <div className="nexops-jobs-sublist">
            {(detail?.invoices ?? []).map((invoice) => (
              <div key={invoice.id} className="nexops-jobs-sublist-item">
                <div>
                  <strong>{invoice.number ?? invoice.id}</strong>
                  <span>{invoice.title}</span>
                </div>
                <div>
                  <span className={`nexops-job-status status-${invoice.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{invoice.status}</span>
                  <small>{formatMoney(invoice.totals.total)}</small>
                </div>
              </div>
            ))}
            {detail && !detail.invoices.length ? <p className="nexops-empty-copy">No invoices tied to this job yet.</p> : null}
          </div>
        </article>
      </section>
      </NexOpsDetailTemplate> : null}

      {signingDocument ? (
        <div className="nexops-modal-layer" role="presentation">
          <button className="nexops-modal-backdrop" type="button" aria-label="Close Document Signature Capture" onClick={closeSignatureSheet} />
          <section className="nexops-modal-card" role="dialog" aria-modal="true" aria-label="Document Signature Capture">
            <div className="nexops-modal-head">
              <div>
                <p className="eyebrow">Signed Document</p>
                <h2>{signingDocument.title}</h2>
              </div>
              <button type="button" onClick={closeSignatureSheet}>Close</button>
            </div>
            <p className="nexops-empty-copy">
              Capture the customer sign-off directly on this job record. The same signature proof travels with the PDF and the client field rail.
            </p>
            <div className="nexops-density-inline-facts">
              <article>
                <h3>Kind</h3>
                <p>{signingDocument.kind.replaceAll("_", " ")}</p>
                <small>Status: {signingDocument.status.replaceAll("_", " ")}</small>
              </article>
              <article>
                <h3>Created</h3>
                <p>{formatDateTime(signingDocument.createdAt)}</p>
                <small>Signature timestamp writes when the customer signs.</small>
              </article>
            </div>
            <label className="nexops-field">
              <span>Document Body</span>
              <textarea rows={6} value={signingDocument.bodyText} readOnly />
            </label>
            <NexOpsSignatureCapture
              value={signatureDraft}
              disabled={fieldDocsBusy === "sign-document"}
              typedPlaceholder={selectedClient?.name ?? detail?.client?.name ?? "Type the signer name"}
              onChange={setSignatureDraft}
            />
            <div className="nexops-inline-actions">
              <button type="button" onClick={() => void submitSignedDocument()} disabled={fieldDocsBusy === "sign-document"}>
                {fieldDocsBusy === "sign-document" ? "Saving..." : "Save Signature"}
              </button>
              <a className="nexops-link-button" href={`/api/fielddocs/signed-documents/${encodeURIComponent(signingDocument.id)}/pdf?tenantId=${encodeURIComponent(props.tenantId)}`} target="_blank" rel="noreferrer">Open PDF</a>
            </div>
          </section>
        </div>
      ) : null}

      {bookingSheetOpen && bookingDraft && bookingPreview ? (
        <div className="nexops-modal-layer" role="presentation">
          <button className="nexops-modal-backdrop" type="button" aria-label="Close Booking Confirmation Composer" onClick={() => setBookingSheetOpen(false)} />
          <section className="nexops-modal-card" role="dialog" aria-modal="true" aria-label="Booking Confirmation Composer">
            <div className="nexops-modal-head">
              <div>
                <p className="eyebrow">Booking Confirmation</p>
                <h2>{bookingDraft.mode === "email" ? "Send by Email" : "Send by Text"}</h2>
              </div>
              <button type="button" onClick={() => setBookingSheetOpen(false)}>Close</button>
            </div>
            <div className="nexops-request-builder-grid">
              <label className="nexops-field">
                <span>Mode</span>
                <select value={bookingDraft.mode} onChange={(event) => setBookingDraft(defaultBookingDraft(bookingPreview, event.target.value as "email" | "sms"))}>
                  <option value="email" disabled={!bookingPreview.emailEnabled}>Email</option>
                  <option value="sms" disabled={!bookingPreview.smsEnabled}>Text Message</option>
                </select>
              </label>
              <label className="nexops-field">
                <span>Recipient</span>
                <input
                  value={bookingDraft.target}
                  onChange={(event) => setBookingDraft((current) => current ? { ...current, target: event.target.value } : current)}
                  placeholder={bookingDraft.mode === "email" ? (selectedClient?.emails[0] ?? "Client email") : (selectedClient?.phones[0] ?? "Client phone")}
                />
              </label>
            </div>
            {bookingDraft.mode === "email" ? (
              <label className="nexops-field">
                <span>Subject</span>
                <input value={bookingDraft.subject} onChange={(event) => setBookingDraft((current) => current ? { ...current, subject: event.target.value } : current)} />
              </label>
            ) : null}
            <label className="nexops-field">
              <span>Message Body</span>
              <textarea rows={bookingDraft.mode === "email" ? 7 : 5} value={bookingDraft.bodyText} onChange={(event) => setBookingDraft((current) => current ? { ...current, bodyText: event.target.value } : current)} />
            </label>
            {bookingDraft.mode === "email" ? (
              <div className="nexops-request-builder-grid">
                <label className="nexops-check-field inline"><input type="checkbox" checked={bookingDraft.sendCopy} onChange={(event) => setBookingDraft((current) => current ? { ...current, sendCopy: event.target.checked } : current)} /> Send Me a Copy</label>
                <label className="nexops-field">
                  <span>Copy Target</span>
                  <input value={bookingDraft.copyTarget} onChange={(event) => setBookingDraft((current) => current ? { ...current, copyTarget: event.target.value } : current)} placeholder={bookingPreview.defaultCopyTarget ?? "Office email"} />
                </label>
              </div>
            ) : null}
            <div className="nexops-inline-actions">
              {bookingDraft.mode === "email" ? <small>{bookingPreview.calendarFilename} plus Google/Outlook links will be included.</small> : <small>Text keeps the confirmation short and field-friendly.</small>}
            </div>
            <div className="nexops-inline-actions">
              <button type="button" onClick={() => void sendBookingConfirmation()} disabled={bookingBusy}>{bookingBusy ? "Sending..." : bookingDraft.mode === "email" ? "Send Email" : "Send Text"}</button>
              <a href={bookingPreview.googleCalendarUrl} target="_blank" rel="noreferrer">Google Calendar</a>
              <a href={bookingPreview.outlookCalendarUrl} target="_blank" rel="noreferrer">Outlook</a>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
