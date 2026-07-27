import React, { useEffect, useMemo, useState } from "react";
import type { Address } from "@nexteam/shared";
import {
  PaymentScheduleEditor,
  blankPaymentSchedule,
  paymentScheduleFromRecord,
  paymentScheduleToPayload,
  type PaymentScheduleDraft,
  type PaymentScheduleRecord
} from "../../../../nexopsPaymentSchedule";
import {
  intakeDetailFacts,
  prominentIntakeFacts,
  type IntakeSnapshotLike
} from "../../../../nexopsIntake";
import {
  blankSignatureCaptureValue,
  NexOpsSignatureCapture,
  type SignatureCaptureValue
} from "../../../../nexopsSignatureCapture";
import { ProductInlineLabel } from "../../../../productBranding";

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
    return "Invoice or dismiss reminder";
  }
  if (detail.reminders.actionAlert) {
    return "Review closeout";
  }
  if (!detail.visits.length) {
    return "Schedule first visit";
  }
  if (detail.visits.some((visit) => visit.status !== "complete")) {
    return "Finish field work";
  }
  return "Review package";
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
      label: "Schedule first visit",
      detail: "Get the first visit on the board before confirmation, fieldwork, or closeout can move."
    };
  }
  if (preview && !bookingConfirmationWasSent(detail, preview.visit.id)) {
    return {
      label: "Send booking confirmation",
      detail: "This visit is scheduled, but the client has not received the booking confirmation yet."
    };
  }
  if (detail.reminders.invoice) {
    return {
      label: "Invoice or dismiss reminder",
      detail: "Field work is complete and the invoice reminder is now driving the work state."
    };
  }
  if (detail.reminders.actionAlert) {
    return {
      label: "Review closeout",
      detail: "A technician finished the field step. Owner or office admin still decides close, invoice, or both."
    };
  }
  if (detail.visits.some((visit) => visit.status !== "complete")) {
    return {
      label: "Go to visits",
      detail: "Booking is confirmed. The next live rail is the visit list and technician completion path."
    };
  }
  return {
    label: "Review package",
    detail: "Work is complete and the customer package is waiting on the billing path."
  };
}

export function NexOpsJobsPage(props: {
  tenantId: string;
  role: TenantRole;
  clients: ClientOption[];
  onCrmMutation: () => void;
  onOpenInvoice?: (invoiceId: string) => void;
  focusedJobId?: string;
  initialFilter?: JobFilter;
}): React.ReactElement {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [status, setStatus] = useState("Loading jobs...");
  const [detailStatus, setDetailStatus] = useState("Select a job to review visits and actions.");
  const [createClientId, setCreateClientId] = useState(props.clients[0]?.id ?? "");
  const [showInlineClientCreate, setShowInlineClientCreate] = useState(props.clients.length === 0);
  const [inlineClientDraft, setInlineClientDraft] = useState<InlineJobClientDraft>(() => blankInlineJobClientDraft());
  const [inlineClientBusy, setInlineClientBusy] = useState(false);
  const [inlineClientStatus, setInlineClientStatus] = useState("Pick an existing client or create one here without losing the job draft.");
  const [createdClientOption, setCreatedClientOption] = useState<ClientOption | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createPaymentSchedule, setCreatePaymentSchedule] = useState<PaymentScheduleDraft>(() => blankPaymentSchedule());
  const [visitTitle, setVisitTitle] = useState("");
  const [visitStart, setVisitStart] = useState("");
  const [visitEnd, setVisitEnd] = useState("");
  const [actionBusy, setActionBusy] = useState<JobAction | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobFilter>("All");
  const [detailPaymentSchedule, setDetailPaymentSchedule] = useState<PaymentScheduleDraft>(() => blankPaymentSchedule());
  const [bookingPreview, setBookingPreview] = useState<BookingConfirmationPreview | null>(null);
  const [bookingDraft, setBookingDraft] = useState<BookingConfirmationDraft | null>(null);
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
  const [quickPaymentDraft, setQuickPaymentDraft] = useState({ title: "Quick payment request", amount: "0.00", memo: "" });
  const [signedDocumentDraft, setSignedDocumentDraft] = useState<{ kind: SignedDocumentRecord["kind"]; title: string; bodyText: string }>({
    kind: "completion_signoff",
    title: "Completion sign-off",
    bodyText: "Customer confirms the work shown on this job is complete and accepted."
  });
  const [signingDocumentId, setSigningDocumentId] = useState("");
  const [signatureDraft, setSignatureDraft] = useState<SignatureCaptureValue>(() => blankSignatureCaptureValue());

  const filteredJobs = useMemo(
    () => jobs.filter((job) => statusFilter === "All" || job.status === statusFilter),
    [jobs, statusFilter]
  );
  const createClientOptions = useMemo(
    () => mergeJobClientOptions(props.clients, createdClientOption),
    [props.clients, createdClientOption]
  );
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
    } catch {
      setDetail(null);
      setBookingPreview(null);
      setBookingDraft(null);
      setDetailStatus("Job detail API unreachable.");
    }
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
      setSelectedJobId(props.focusedJobId);
    }
  }, [props.focusedJobId, jobs, selectedJobId]);

  useEffect(() => {
    void loadDetail(selectedJobId);
  }, [selectedJobId]);

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

  function handleClientChoice(value: string): void {
    if (value === NEW_JOB_CLIENT_VALUE) {
      setCreateClientId("");
      setShowInlineClientCreate(true);
      setInlineClientStatus("Create the client here, then the job draft continues with your title and billing plan still in place.");
      return;
    }
    setCreateClientId(value);
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
    if (!detail || !visitStart || !visitEnd) {
      setDetailStatus("Pick a start and end time before booking the visit.");
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
          start: new Date(visitStart).toISOString(),
          end: new Date(visitEnd).toISOString()
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

  return (
    <section className="nexops-module-page">
      <header className="nexops-page-heading">
        <div>
          <p className="eyebrow">M3 Job Engine</p>
          <h1>Jobs</h1>
          <p>Derived status, reminder state, visits, and office actions all live on one rail now.</p>
        </div>
        <div className="nexops-status-pill">{status}</div>
      </header>

      <section className="nexops-jobs-layout">
        <article className="nexops-module-card">
          <p className="eyebrow">Manual create</p>
          <h2>New job</h2>
          <form className="nexops-jobs-form" onSubmit={(event) => void createJob(event)}>
            <label>
              Client
              <select value={showInlineClientCreate ? NEW_JOB_CLIENT_VALUE : createClientId} onChange={(event) => handleClientChoice(event.target.value)}>
                <option value="">Choose client</option>
                {createClientOptions.map((client) => <option key={client.id} value={client.id}>{clientLabel(client)}</option>)}
                <option value={NEW_JOB_CLIENT_VALUE}>+ Create new client</option>
              </select>
            </label>
            {showInlineClientCreate ? (
              <section className="nexops-module-card embedded">
                <div className="nexops-jobs-card-heading">
                  <div>
                    <p className="eyebrow">Inline client create</p>
                    <h3>Keep the job draft open</h3>
                  </div>
                  <span>{inlineClientStatus}</span>
                </div>
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>First name</span>
                    <input value={inlineClientDraft.firstName} onChange={(event) => setInlineClientDraft((current) => ({ ...current, firstName: event.target.value }))} />
                  </label>
                  <label className="nexops-field">
                    <span>Last name</span>
                    <input value={inlineClientDraft.lastName} onChange={(event) => setInlineClientDraft((current) => ({ ...current, lastName: event.target.value }))} />
                  </label>
                </div>
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Company</span>
                    <input value={inlineClientDraft.company} onChange={(event) => setInlineClientDraft((current) => ({ ...current, company: event.target.value }))} />
                  </label>
                  <label className="nexops-field">
                    <span>Main phone</span>
                    <input value={inlineClientDraft.phone} onChange={(event) => setInlineClientDraft((current) => ({ ...current, phone: event.target.value }))} />
                  </label>
                </div>
                <div className="nexops-request-builder-grid">
                  <label className="nexops-field">
                    <span>Main email</span>
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
                    Use existing instead
                  </button>
                  <button type="button" onClick={() => void createInlineClient()} disabled={!inlineClientCanSave || inlineClientBusy}>
                    {inlineClientBusy ? "Saving client..." : "Save client and return"}
                  </button>
                </div>
              </section>
            ) : null}
            <label>
              Job title
              <input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="Leak detection follow-up" />
            </label>
            <PaymentScheduleEditor
              value={createPaymentSchedule}
              onChange={setCreatePaymentSchedule}
              title="Job payment schedule"
              hint="Use this when the work needs a deposit or milestone billing plan even without a quote."
            />
            <button type="submit" disabled={createBusy || inlineClientBusy || !createClientId || !createTitle.trim()}>
              {createBusy ? "Creating..." : "Create job"}
            </button>
          </form>
        </article>

        <article className="nexops-module-card">
          <div className="nexops-jobs-card-heading">
            <div>
              <p className="eyebrow">Native list</p>
              <h2>Job roster</h2>
            </div>
            <span>{filteredJobs.length} shown / {jobs.length} total</span>
          </div>
          <div className="nexops-jobs-filter-row" aria-label="Job status filters">
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
          </div>
          <div className="nexops-jobs-list">
            {filteredJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className={`nexops-jobs-list-item${job.id === selectedJobId ? " active" : ""}`}
                onClick={() => setSelectedJobId(job.id)}
              >
                <div>
                  <strong>{job.title}</strong>
                  <span>{job.client?.name ?? job.clientId}</span>
                </div>
                <div>
                  <span className={`nexops-job-status status-${job.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{job.status}</span>
                  <small>{job.visitCount} visits</small>
                </div>
              </button>
            ))}
            {!jobs.length ? <p className="nexops-empty-copy">No jobs yet. Requests and approved quotes can start here, and manual jobs can too.</p> : null}
            {jobs.length > 0 && !filteredJobs.length ? <p className="nexops-empty-copy">No jobs match this status right now.</p> : null}
          </div>
        </article>
      </section>

      <section className="nexops-two-column">
        <article className="nexops-module-card">
          <div className="nexops-jobs-card-heading">
            <div>
              <p className="eyebrow">Detail</p>
              <h2>{detail?.title ?? "Select a job"}</h2>
            </div>
            {detail?.number ? <span>{detail.number}</span> : null}
          </div>
          <div className="nexops-jobs-filter-row" aria-label="Job detail filters">
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
          </div>
          <p>{detailStatus}</p>
          {detail ? (
            <div className="nexops-jobs-detail">
              <div className="nexops-density-summary-strip">
                <article><span>Status</span><strong>{detail.status}</strong><small>{deriveWorkPackageStatus(detail).replaceAll("_", " ")}</small></article>
                <article><span>Client</span><strong>{detail.client?.name ?? detail.clientId}</strong><small>{detail.number ?? "Native job"}</small></article>
                <article><span>Property</span><strong>{detail.property?.address?.street1 ?? detail.property?.label ?? "Not attached"}</strong><small>{detail.visitCount} visits</small></article>
                <article><span>Total</span><strong>{formatMoney(detail.totals?.total)}</strong><small>{detail.paymentSchedule?.enabled ? `${detail.paymentSchedule.milestones.length} milestones` : "Full-balance rail"}</small></article>
              </div>

              {prominentJobFacts.length ? (
                <div className="nexops-request-alert-strip">
                  {prominentJobFacts.map((fact) => (
                    <span key={`${detail.id}-${fact.key}`}>{fact.label}: {fact.text}</span>
                  ))}
                </div>
              ) : null}

              <div className="nexops-jobs-section">
                <div className="nexops-jobs-card-heading">
                  <h3>Next move</h3>
                  <span>One work rail driven by visits, reminders, and billing state.</span>
                </div>
                <div className="nexops-jobs-grid">
                  <div className="nexops-jobs-stat">
                    <strong>Current status</strong>
                    <span>{deriveWorkPackageStatus(detail).replaceAll("_", " ")}</span>
                  </div>
                  <div className="nexops-jobs-stat">
                    <strong>Source quote</strong>
                    <span>{detail.quote?.number ?? detail.quote?.id ?? "No quote attached"}</span>
                  </div>
                  <div className="nexops-jobs-stat">
                    <strong>Billing rail</strong>
                    <span>{detail.paymentSchedule?.enabled ? `${detail.paymentSchedule.milestones.length} milestones active` : "Full-balance rail"}</span>
                  </div>
                  <div className="nexops-jobs-stat">
                    <strong>Dominant action</strong>
                    <span>{nextMove?.label ?? deriveWorkPackageAction(detail)}</span>
                  </div>
                </div>
                <div className="nexops-jobs-actions">
                  {bookingPreview && !bookingConfirmationWasSent(detail, bookingPreview.visit.id) ? (
                    <button type="button" disabled={bookingBusy} onClick={() => setBookingSheetOpen(true)}>Send booking confirmation</button>
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
                    <span>Quick payment title</span>
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
                  <button type="button" disabled={actionBusy !== null} onClick={() => void createQuickPaymentRequest()}>Create quick payment request</button>
                  <small>Creates a real minimal invoice on the same ledger rail, then opens billing.</small>
                </div>
              </div>

              <div className="nexops-jobs-section">
                <div className="nexops-jobs-card-heading">
                  <h3>Review follow-up</h3>
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
                            <strong>{sequence.status === "active" ? "Active sequence" : sequence.status === "completed" ? "Completed sequence" : "Stopped sequence"}</strong>
                            <span>
                              {activeStep ? `${activeStep.label} · ${new Date(activeStep.dueAt).toLocaleDateString()}` : "No pending step"}
                            </span>
                            <small>{sequence.stopReason ? `Stop reason: ${sequence.stopReason.replace(/_/g, " ")}` : `Provider state: ${sequence.providerState.replace(/_/g, " ")}`}</small>
                          </div>
                          <div className="nexops-inline-actions">
                            {sequence.status === "active" ? (
                              <>
                                <button type="button" disabled={reviewBusy === `reviewed-${sequence.id}`} onClick={() => void markReviewed(sequence.id)}>Mark reviewed</button>
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
                    <button type="button" disabled={reviewBusy === "start"} onClick={() => void startReviewSequence()}>Start review follow-up</button>
                  </div>
                )}
              </div>

              <details className="nexops-quote-panel nexops-density-disclosure-panel" open={Boolean(bookingPreview)}>
                <summary>
                  <div className="nexops-density-disclosure-copy">
                    <h3>Booking confirmation</h3>
                    <small>Open for email/text choice, editable message copy, calendar links, and resend status.</small>
                  </div>
                  <span className="nexops-density-disclosure-caret">Open</span>
                </summary>
                <div className="nexops-density-disclosure-body">
                  {bookingPreview && bookingDraft ? (
                    <>
                      <div className="nexops-density-inline-facts">
                        <article><h3>Selected visit</h3><p>{bookingPreview.visit.title}</p><small>{formatDateTime(bookingPreview.visit.start)} to {formatDateTime(bookingPreview.visit.end)}</small></article>
                        <article><h3>Confirmation status</h3><p>{bookingConfirmationWasSent(detail, bookingPreview.visit.id) ? "Already sent" : "Not sent yet"}</p><small>{bookingConfirmationWasSent(detail, bookingPreview.visit.id) ? "Use resend to send a fresh copy." : "This becomes the dominant action after scheduling."}</small></article>
                        <article><h3>Email path</h3><p>{bookingPreview.emailEnabled ? "Enabled" : "Disabled"}</p><small>{bookingPreview.emailTarget ?? "No client email on file"}</small></article>
                        <article><h3>Text path</h3><p>{bookingPreview.smsEnabled ? "Enabled" : "Disabled"}</p><small>{bookingPreview.smsTarget ?? "No client phone on file"}</small></article>
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
                        <button type="button" disabled={!bookingPreview.emailEnabled} onClick={() => { setBookingDraft(defaultBookingDraft(bookingPreview, "email")); setBookingSheetOpen(true); }}>Send by email</button>
                        <button type="button" disabled={!bookingPreview.smsEnabled} onClick={() => { setBookingDraft(defaultBookingDraft(bookingPreview, "sms")); setBookingSheetOpen(true); }}>Send by text</button>
                        {bookingConfirmationWasSent(detail, bookingPreview.visit.id) ? (
                          <button type="button" disabled={bookingBusy} onClick={() => setBookingSheetOpen(true)}>Resend booking confirmation</button>
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
                  <span>{detail.visits.length} total</span>
                </div>
                <form className="nexops-jobs-form inline" onSubmit={(event) => void scheduleVisit(event)}>
                  <input value={visitTitle} onChange={(event) => setVisitTitle(event.target.value)} placeholder="Visit title" />
                  <input type="datetime-local" value={visitStart} onChange={(event) => setVisitStart(event.target.value)} />
                  <input type="datetime-local" value={visitEnd} onChange={(event) => setVisitEnd(event.target.value)} />
                  <button type="submit" disabled={actionBusy !== null}>Book visit</button>
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
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <details className="nexops-quote-panel nexops-density-disclosure-panel">
                <summary>
                  <div className="nexops-density-disclosure-copy">
                    <h3><ProductInlineLabel product="nexcam" label="NexCam rail" /></h3>
                    <small>Read-only field reports and visit media for this job, plus the client-hub visibility switch.</small>
                  </div>
                  <span className="nexops-density-disclosure-caret">Open</span>
                </summary>
                <div className="nexops-density-disclosure-body">
                  <div className="nexops-jobs-card-heading">
                    <h3>Client hub visibility</h3>
                    {props.role !== "TECHNICIAN" ? (
                      <button
                        type="button"
                        disabled={fieldDocsBusy === "visibility"}
                        onClick={() => void toggleClientHubFieldDocsVisibility(!(detail.clientVisibility?.hideFieldDocsFromPortal === true))}
                      >
                        {detail.clientVisibility?.hideFieldDocsFromPortal ? "Show in client hub" : "Hide from client hub"}
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
                      <h3>Signed docs</h3>
                      <p>{signedDocuments.length}</p>
                      <small>Completion signoffs, waivers, and change orders attach on this same rail.</small>
                    </article>
                  </div>
                  <article className="nexops-module-card wide nexops-request-builder-card">
                    <p className="eyebrow">Signed documents</p>
                    <div className="nexops-request-builder-grid">
                      <label className="nexops-field">
                        <span>Kind</span>
                        <select value={signedDocumentDraft.kind} onChange={(event) => setSignedDocumentDraft((current) => ({ ...current, kind: event.target.value as SignedDocumentRecord["kind"] }))}>
                          <option value="completion_signoff">Completion sign-off</option>
                          <option value="waiver">Waiver</option>
                          <option value="change_order">Change order</option>
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
                        {fieldDocsBusy === "signed-document" ? "Creating..." : "Create signed document"}
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
                        <span>Latest uploads</span>
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
                              Collect signature
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
                    <h3>Billing, reminders, and history</h3>
                    <small>Open this only when you need the milestone plan, reminder records, package preview, or lifecycle history.</small>
                  </div>
                  <span className="nexops-density-disclosure-caret">Open</span>
                </summary>
                <div className="nexops-density-disclosure-body">
                  <div className="nexops-jobs-section">
                    <div className="nexops-jobs-card-heading">
                      <h3>Payment schedule</h3>
                      <button type="button" disabled={actionBusy !== null} onClick={() => void savePaymentSchedule()}>
                        {actionBusy === "invoice" ? "Saving..." : "Save schedule"}
                      </button>
                    </div>
                    <PaymentScheduleEditor
                      value={detailPaymentSchedule}
                      onChange={setDetailPaymentSchedule}
                      hint="Milestones here feed invoice timing and keep recurring billing reminders on the same plan."
                    />
                  </div>

                  <div className="nexops-jobs-section">
                    <h3>Reminders and alerts</h3>
                    <ul className="nexops-jobs-bullets">
                      <li>{detail.reminders.invoice ? `Invoice reminder due ${formatDateTime(detail.reminders.invoice.dueAt)}.` : "No invoice reminder pending."}</li>
                      <li>{detail.reminders.actionAlert?.note ?? "No office review alert pending."}</li>
                      <li>{detail.reminders.visit.length ? `${detail.reminders.visit.length} visit reminder records queued.` : "No visit reminder records pending."}</li>
                    </ul>
                  </div>

                  <div className="nexops-jobs-section">
                    <div className="nexops-jobs-card-heading">
                      <h3>Customer package preview</h3>
                      <span>{deriveDocumentPackagePreview(detail).stage}</span>
                    </div>
                    <ul className="nexops-jobs-bullets">
                      <li>{deriveDocumentPackagePreview(detail).note}</li>
                      <li>{detail.invoices.length ? `${detail.invoices.length} invoice record${detail.invoices.length === 1 ? "" : "s"} currently linked.` : "No invoice linked yet."}</li>
                      <li>{detail.paymentSchedule?.enabled ? "Payment schedule stays attached to the same work rail." : "No active payment schedule on this job."}</li>
                    </ul>
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
          <p className="eyebrow">Billing handoff</p>
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

      {signingDocument ? (
        <div className="nexops-modal-layer" role="presentation">
          <button className="nexops-modal-backdrop" type="button" aria-label="Close document signature capture" onClick={closeSignatureSheet} />
          <section className="nexops-modal-card" role="dialog" aria-modal="true" aria-label="Document signature capture">
            <div className="nexops-modal-head">
              <div>
                <p className="eyebrow">Signed document</p>
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
              <span>Document body</span>
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
                {fieldDocsBusy === "sign-document" ? "Saving..." : "Save signature"}
              </button>
              <a className="nexops-link-button" href={`/api/fielddocs/signed-documents/${encodeURIComponent(signingDocument.id)}/pdf?tenantId=${encodeURIComponent(props.tenantId)}`} target="_blank" rel="noreferrer">Open PDF</a>
            </div>
          </section>
        </div>
      ) : null}

      {bookingSheetOpen && bookingDraft && bookingPreview ? (
        <div className="nexops-modal-layer" role="presentation">
          <button className="nexops-modal-backdrop" type="button" aria-label="Close booking confirmation composer" onClick={() => setBookingSheetOpen(false)} />
          <section className="nexops-modal-card" role="dialog" aria-modal="true" aria-label="Booking confirmation composer">
            <div className="nexops-modal-head">
              <div>
                <p className="eyebrow">Booking confirmation</p>
                <h2>{bookingDraft.mode === "email" ? "Send by email" : "Send by text"}</h2>
              </div>
              <button type="button" onClick={() => setBookingSheetOpen(false)}>Close</button>
            </div>
            <div className="nexops-request-builder-grid">
              <label className="nexops-field">
                <span>Mode</span>
                <select value={bookingDraft.mode} onChange={(event) => setBookingDraft(defaultBookingDraft(bookingPreview, event.target.value as "email" | "sms"))}>
                  <option value="email" disabled={!bookingPreview.emailEnabled}>Email</option>
                  <option value="sms" disabled={!bookingPreview.smsEnabled}>Text message</option>
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
              <span>Message body</span>
              <textarea rows={bookingDraft.mode === "email" ? 7 : 5} value={bookingDraft.bodyText} onChange={(event) => setBookingDraft((current) => current ? { ...current, bodyText: event.target.value } : current)} />
            </label>
            {bookingDraft.mode === "email" ? (
              <div className="nexops-request-builder-grid">
                <label className="nexops-check-field inline"><input type="checkbox" checked={bookingDraft.sendCopy} onChange={(event) => setBookingDraft((current) => current ? { ...current, sendCopy: event.target.checked } : current)} /> Send me a copy</label>
                <label className="nexops-field">
                  <span>Copy target</span>
                  <input value={bookingDraft.copyTarget} onChange={(event) => setBookingDraft((current) => current ? { ...current, copyTarget: event.target.value } : current)} placeholder={bookingPreview.defaultCopyTarget ?? "Office email"} />
                </label>
              </div>
            ) : null}
            <div className="nexops-inline-actions">
              {bookingDraft.mode === "email" ? <small>{bookingPreview.calendarFilename} plus Google/Outlook links will be included.</small> : <small>Text keeps the confirmation short and field-friendly.</small>}
            </div>
            <div className="nexops-inline-actions">
              <button type="button" onClick={() => void sendBookingConfirmation()} disabled={bookingBusy}>{bookingBusy ? "Sending..." : bookingDraft.mode === "email" ? "Send email" : "Send text"}</button>
              <a href={bookingPreview.googleCalendarUrl} target="_blank" rel="noreferrer">Google Calendar</a>
              <a href={bookingPreview.outlookCalendarUrl} target="_blank" rel="noreferrer">Outlook</a>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
