import { randomUUID } from "node:crypto";
import { RailError, type Client, type CustomerDocumentPackage, type CustomerDocumentPackageArtifactRef, type CustomerDocumentPackageDeliveryAttempt, type EventBus, type Invoice, type Job, type JobDetail, type JobStatus, type LineItem, type Property, type Quote, type ServiceRequest, type TenantUser } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { CommsRail } from "../../../../../../../comms/gmailRegistry.js";
import type { PlatformRepository } from "../../../../../../../platform/repository.js";
import type { SchedulingRepository } from "../../../../../../../scheduling/repository.js";
import type { ScheduledVisit } from "../../../../../../../scheduling/schedulingEngine.js";
import { bookingTemplateVariables, communicationChannelEnabled, resolveTemplateMessage } from "../../../../../../../crm/communicationTemplates.js";
import type { LedgerService } from "../../../../../../../crm/ledgerFoundation.js";
import { buildInvoiceDraftFromJobs } from "../../../../../../../crm/invoiceFoundation.js";
import { type InvoiceReminderRecord, type JobActionAlertRecord, type JobLifecycleEventRecord, type JobLifecycleRepository, type VisitReminderRecord, pendingInvoiceReminderForJob, pendingJobAlertForJob, requireJobLifecycleRecord } from "./jobLifecycleRepository.js";
import { VisitCoreService, type CompleteJobVisitInput, type MoveJobVisitInput, type MoveJobVisitSeriesInput, type ScheduleJobVisitInput, type ScheduleJobVisitSeriesInput } from "../../../../visits/components/visitCore/server/visitCoreService.js";

export type {
  CompleteJobVisitInput,
  MoveJobVisitInput,
  MoveJobVisitSeriesInput,
  ScheduleJobVisitInput,
  ScheduleJobVisitSeriesInput
} from "../../../../visits/components/visitCore/server/visitCoreService.js";

export interface JobSummaryRecord extends Job {
  client?: Client | undefined;
  property?: Property | undefined;
  nextVisit?: ScheduledVisit | undefined;
  visitCount: number;
  completedVisitCount: number;
  pendingInvoiceReminder?: InvoiceReminderRecord | undefined;
  pendingActionAlert?: JobActionAlertRecord | undefined;
  invoiceCount: number;
}

export interface JobDetailRecord extends JobDetail {
  visits: ScheduledVisit[];
  reminders: {
    invoice?: InvoiceReminderRecord | undefined;
    visit: VisitReminderRecord[];
    actionAlert?: JobActionAlertRecord | undefined;
  };
  history: JobLifecycleEventRecord[];
  invoices: Invoice[];
  quote?: Quote | undefined;
  request?: ServiceRequest | undefined;
}

export interface CreateJobInput {
  id?: string | undefined;
  tenantId: string;
  clientId: string;
  propertyId?: string | undefined;
  requestId?: string | undefined;
  quoteId?: string | undefined;
  title: string;
  lineItems?: LineItem[] | undefined;
  paymentSchedule?: Job["paymentSchedule"] | undefined;
  intake?: Job["intake"] | undefined;
  createdBy?: string | undefined;
}

export interface PerformJobActionInput {
  tenantId: string;
  jobId: string;
  action: "close" | "invoice" | "close_and_invoice" | "dismiss_invoice_reminder";
  actorId: string;
}

export interface PrepareJobActionPreview {
  job: JobDetailRecord;
  action: PerformJobActionInput["action"];
  title: string;
  body: string;
}

export interface SaveCustomerDocumentPackageSelectionInput {
  tenantId: string;
  jobId: string;
  actorId: string;
  selectedArtifactRefs: CustomerDocumentPackageArtifactRef[];
  expectedPackageVersion?: number | undefined;
}

export interface PrepareCustomerDocumentPackageDeliveryInput {
  tenantId: string;
  jobId: string;
  artifacts: Array<{ artifactId: string; source: "nexdocs" | "nexcam" | "generated"; kind: string; label: string; fileName: string; visitId?: string | undefined }>;
  recipient?: string | undefined;
}

export interface CustomerDocumentPackageDeliveryPreview {
  package: CustomerDocumentPackage;
  job: JobDetailRecord;
  selectedArtifacts: PrepareCustomerDocumentPackageDeliveryInput["artifacts"];
  email: { available: boolean; recipient?: string | undefined; defaultCopyTarget?: string | undefined; subject: string; bodyText: string; unavailableReason?: string | undefined };
  sms: { available: false; unavailableReason: string };
  attempts: CustomerDocumentPackageDeliveryAttempt[];
}

export interface SendCustomerDocumentPackageDeliveryInput {
  tenantId: string;
  jobId: string;
  actorId: string;
  recipient: string;
  subject: string;
  bodyText: string;
  copyTarget?: string | undefined;
  sendCopy?: boolean | undefined;
  selectedArtifactRefs: CustomerDocumentPackageArtifactRef[];
  artifacts: PrepareCustomerDocumentPackageDeliveryInput["artifacts"];
}

export interface BookingConfirmationPreview {
  job: JobDetailRecord;
  visit: ScheduledVisit;
  defaultCopyTarget?: string | undefined;
  emailEnabled: boolean;
  smsEnabled: boolean;
  emailTarget?: string | undefined;
  smsTarget?: string | undefined;
  emailSubject: string;
  emailBodyText: string;
  smsBodyText: string;
  googleCalendarUrl: string;
  outlookCalendarUrl: string;
  calendarFilename: string;
}

export interface SendBookingConfirmationInput {
  tenantId: string;
  jobId: string;
  actorId: string;
  visitId?: string | undefined;
  mode: "email" | "sms";
  target?: string | undefined;
  subject?: string | undefined;
  bodyText?: string | undefined;
  sendCopy?: boolean | undefined;
  copyTarget?: string | undefined;
}

interface JobLifecycleDeps {
  crmRepository: NativeCrmRepository;
  schedulingRepository: SchedulingRepository;
  lifecycleRepository: JobLifecycleRepository;
  platformRepository?: Pick<PlatformRepository, "listTenantUsers"> | undefined;
  commsRail?: CommsRail | undefined;
  eventBus?: EventBus | undefined;
  ledgerService?: Pick<LedgerService, "syncInvoiceAfterCreate"> | undefined;
}

function now(input?: Date | string): string {
  if (input instanceof Date) {
    return input.toISOString();
  }
  if (typeof input === "string") {
    return new Date(input).toISOString();
  }
  return new Date().toISOString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function defaultEnd(start: string): string {
  const parsed = new Date(start);
  if (!Number.isFinite(parsed.getTime())) {
    return start;
  }
  parsed.setUTCHours(parsed.getUTCHours() + 2);
  return parsed.toISOString();
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function buildTotals(lineItems: LineItem[]): Job["totals"] {
  const subtotal = roundMoney(lineItems.reduce((sum, item) => sum + item.total, 0));
  return {
    subtotal,
    tax: 0,
    total: subtotal
  };
}

function activeVisit(visit: ScheduledVisit): boolean {
  return visit.status !== "complete" && visit.status !== "cancelled";
}

function completeVisit(visit: ScheduledVisit): boolean {
  return visit.status === "complete";
}

function dayKey(value: string): string {
  return value.slice(0, 10);
}





function compareIso(left: string, right: string): number {
  return left.localeCompare(right);
}

function nextDailyNineIso(referenceTime: string): string {
  const base = new Date(referenceTime);
  const next = new Date(Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate(),
    9,
    0,
    0,
    0
  ));
  if (next.getTime() <= base.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
}

function earliestByStart(visits: ScheduledVisit[]): ScheduledVisit | undefined {
  return [...visits].sort((left, right) => compareIso(left.start, right.start))[0];
}

function latestByEnd(visits: ScheduledVisit[]): ScheduledVisit | undefined {
  return [...visits].sort((left, right) => compareIso(right.end, left.end))[0];
}

function legacyVisitStatus(job: Job): ScheduledVisit["status"] {
  if (job.status === "Archived" || job.archivedAt) {
    return "complete";
  }
  return "scheduled";
}

function legacyVisitForJob(job: Job): ScheduledVisit | null {
  if (!job.startAt) {
    return null;
  }
  return {
    id: `legacy_visit_${job.id}`,
    tenantId: job.tenantId,
    jobId: job.id,
    title: job.title,
    start: job.startAt,
    end: job.endAt && job.endAt !== job.startAt ? job.endAt : defaultEnd(job.startAt),
    assignedTo: [],
    location: { label: "Legacy schedule window" },
    status: legacyVisitStatus(job),
    source: "native",
    readOnly: true
  };
}

function jobLocationLabel(property?: Property | undefined, client?: Client | undefined): string {
  if (property?.siteName?.trim()) {
    return property.siteName.trim();
  }
  if (property?.label?.trim()) {
    return property.label.trim();
  }
  if (property?.address?.street1?.trim()) {
    return property.address.street1.trim();
  }
  return client?.name ?? "Job site";
}

function technicianNames(tenantUsers: TenantUser[], assignedTo: string[]): string {
  const names = assignedTo
    .map((tenantUserId) => tenantUsers.find((candidate) => candidate.id === tenantUserId)?.displayName)
    .filter((value): value is string => Boolean(value?.trim()));
  if (!names.length) {
    return "your assigned technician";
  }
  return names.join(", ");
}

function reminderAccessNote(job: Job, property?: Property | undefined): string | undefined {
  const gateCode = property?.access?.gateCode
    || (typeof job.intake?.fieldIndex?.gate_code === "string" ? job.intake.fieldIndex.gate_code : undefined);
  const accessNotes = property?.access?.accessNotes;
  if (gateCode && accessNotes) {
    return `Gate code ${gateCode}. ${accessNotes}`;
  }
  if (gateCode) {
    return `Gate code ${gateCode}.`;
  }
  return accessNotes;
}

function invoiceReminderActive(reminder?: InvoiceReminderRecord | undefined, referenceTime = now()): boolean {
  if (!reminder || reminder.status !== "pending") {
    return false;
  }
  if (reminder.recurrence === "daily_9am") {
    return true;
  }
  return reminder.dueAt <= referenceTime;
}

export function deriveStatus(input: {
  job: Job;
  visits: ScheduledVisit[];
  invoiceReminder?: InvoiceReminderRecord | undefined;
  actionAlert?: JobActionAlertRecord | undefined;
  invoices: Invoice[];
  referenceTime: string;
}): JobStatus {
  const { job, invoiceReminder, actionAlert, invoices, referenceTime } = input;
  const actionableVisits = input.visits.filter(activeVisit);
  const closedOrArchived = Boolean(job.archivedAt || job.closedAt);
  if (closedOrArchived && !invoiceReminderActive(invoiceReminder, referenceTime)) {
    return "Archived";
  }
  if (invoiceReminderActive(invoiceReminder, referenceTime)) {
    return "Requires Invoicing";
  }
  if (actionAlert?.status === "pending") {
    return "Action Required";
  }
  if (!actionableVisits.length) {
    if (job.status === "Action Required" || invoices.some((invoice) => invoice.jobId === job.id)) {
      return "Action Required";
    }
    return "Unscheduled";
  }
  const today = dayKey(referenceTime);
  if (actionableVisits.some((visit) => dayKey(visit.start) < today)) {
    return "Late";
  }
  if (actionableVisits.some((visit) => dayKey(visit.start) === today)) {
    return "Today";
  }
  return "Upcoming";
}



async function sendLifecycleSms(
  commsRail: CommsRail | undefined,
  outbound: { tenantId: string; to: string; body: string }
): Promise<void> {
  if (!commsRail?.sendSms || !outbound.to.trim()) {
    return;
  }
  await commsRail.sendSms(outbound);
}

function googleCalendarUrl(visit: ScheduledVisit, title: string, location: string, details: string): string {
  const start = visit.start.replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
  const end = visit.end.replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
    details,
    location
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookCalendarUrl(visit: ScheduledVisit, title: string, location: string, details: string): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title,
    startdt: visit.start,
    enddt: visit.end,
    location,
    body: details
  });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}

function bookingCalendarAttachment(visit: ScheduledVisit, title: string, location: string, description: string): { filename: string; mime: string; contentBase64: string } {
  const uid = `${visit.id}@nexops.local`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NexOps//Booking Confirmation//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    `DTSTART:${visit.start.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    `DTEND:${visit.end.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    `SUMMARY:${title.replace(/\n/g, " ")}`,
    `LOCATION:${location.replace(/\n/g, " ")}`,
    `DESCRIPTION:${description.replace(/\n/g, "\\n")}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  return {
    filename: `booking-${visit.id}.ics`,
    mime: "text/calendar",
    contentBase64: Buffer.from(lines, "utf8").toString("base64")
  };
}

export class JobLifecycleService {
  private readonly visitCoreService: VisitCoreService;

  constructor(private readonly deps: JobLifecycleDeps) {
    this.visitCoreService = new VisitCoreService({
      schedulingRepository: deps.schedulingRepository,
      lifecycleRepository: deps.lifecycleRepository,
      ...(deps.commsRail ? { commsRail: deps.commsRail } : {}),
      getJobDetail: (tenantId, jobId, referenceTime) => this.getJobDetail(tenantId, jobId, referenceTime),
      getReminderJobDetail: (tenantId, jobId, referenceTime) => this.getJobDetailWithoutReminderProcessing(tenantId, jobId, referenceTime),
      tenantUsers: (tenantId) => this.tenantUsers(tenantId),
      emitLifecycleEvent: (record) => this.emitLifecycleEvent(record)
    });
  }

  private async emitLifecycleEvent(record: Omit<JobLifecycleEventRecord, "id">): Promise<JobLifecycleEventRecord> {
    const appended = await this.deps.lifecycleRepository.appendLifecycleEvent(record);
    await this.deps.eventBus?.emit({
      tenantId: record.tenantId,
      type: record.type,
      payload: {
        jobId: record.jobId,
        ...record.payload
      }
    });
    return appended;
  }

  private async tenantUsers(tenantId: string): Promise<TenantUser[]> {
    return this.deps.platformRepository ? await this.deps.platformRepository.listTenantUsers(tenantId) : [];
  }

  async getCustomerDocumentPackage(tenantId: string, jobId: string): Promise<CustomerDocumentPackage> {
    requireJobLifecycleRecord(await this.getJobDetail(tenantId, jobId), `Native job ${jobId} was not found.`, "getCustomerDocumentPackage");
    const existing = await this.deps.lifecycleRepository.getCustomerDocumentPackage(tenantId, jobId);
    if (existing) return existing;
    return {
      id: `customer_document_package_${jobId}`,
      tenantId,
      jobId,
      workPackageIds: [],
      recipient: {},
      approvedReportVersionIds: [],
      invoiceVersionIds: [],
      receiptIds: [],
      selectedArtifactRefs: [],
      packageVersion: 1,
      manifestStatus: "draft",
      deliveryAttemptIds: [],
      createdBy: "system",
      createdAt: now(),
      updatedAt: now()
    };
  }

  async saveCustomerDocumentPackageSelection(input: SaveCustomerDocumentPackageSelectionInput): Promise<CustomerDocumentPackage> {
    const detail = requireJobLifecycleRecord(await this.getJobDetail(input.tenantId, input.jobId), `Native job ${input.jobId} was not found.`, "saveCustomerDocumentPackageSelection");
    const existing = await this.deps.lifecycleRepository.getCustomerDocumentPackage(input.tenantId, input.jobId);
    if (existing && existing.manifestStatus !== "draft") {
      throw new RailError("A finalized or superseded closeout package cannot be edited.", { provider: "native", op: "saveCustomerDocumentPackageSelection", status: 409 });
    }
    if (existing && input.expectedPackageVersion !== undefined && existing.packageVersion !== input.expectedPackageVersion) {
      throw new RailError("This closeout package changed elsewhere. Refresh it before saving.", { provider: "native", op: "saveCustomerDocumentPackageSelection", status: 409 });
    }
    const timestamp = now();
    const selectedArtifactRefs = [...new Map(input.selectedArtifactRefs.map((reference) => [`${reference.source}:${reference.artifactId}`, reference])).values()];
    const saved: CustomerDocumentPackage = {
      ...(existing ?? {
        id: `customer_document_package_${detail.id}`,
        tenantId: input.tenantId,
        jobId: detail.id,
        workPackageIds: [],
        recipient: {},
        approvedReportVersionIds: [],
        invoiceVersionIds: [],
        receiptIds: [],
        manifestStatus: "draft" as const,
        deliveryAttemptIds: [],
        createdBy: input.actorId,
        createdAt: timestamp
      }),
      selectedArtifactRefs,
      packageVersion: (existing?.packageVersion ?? 0) + 1,
      updatedAt: timestamp
    };
    return this.deps.lifecycleRepository.upsertCustomerDocumentPackage(saved);
  }

  async prepareCustomerDocumentPackageDelivery(input: PrepareCustomerDocumentPackageDeliveryInput): Promise<CustomerDocumentPackageDeliveryPreview> {
    const job = requireJobLifecycleRecord(await this.getJobDetail(input.tenantId, input.jobId), `Native job ${input.jobId} was not found.`, "prepareCustomerDocumentPackageDelivery");
    const pkg = await this.getCustomerDocumentPackage(input.tenantId, input.jobId);
    const selectedByKey = new Map(pkg.selectedArtifactRefs.map((reference) => [`${reference.source}:${reference.artifactId}`, reference]));
    const selectedArtifacts = input.artifacts.filter((artifact) => selectedByKey.has(`${artifact.source}:${artifact.artifactId}`));
    const clientName = job.client?.name ?? "there";
    const fallbackSubject = `Your closeout package for ${job.title}`;
    const fileList = selectedArtifacts.length
      ? selectedArtifacts.map((artifact) => `- ${artifact.fileName || artifact.label}${artifact.visitId ? ` (Visit ${artifact.visitId})` : ""}`).join("\n")
      : "- No artifacts have been selected yet.";
    const fallbackBodyText = [
      `Hi ${clientName},`,
      "",
      `Your closeout package for ${job.title} is ready for review.`,
      "",
      "Selected package artifacts:",
      fileList,
      "",
      "Reply to this email if you have any questions."
    ].join("\n");
    const settings = await this.deps.crmRepository.getCrmSettings(input.tenantId);
    const template = resolveTemplateMessage({
      settings,
      category: "customer_document_package",
      channel: "email",
      fallbackSubject,
      fallbackBodyText,
      variables: {
        TENANT_NAME: input.tenantId.split(/[^a-z0-9]+/i).filter(Boolean).map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" "),
        CLIENT_NAME: clientName,
        JOB_TITLE: job.title,
        PACKAGE_ARTIFACTS: fileList
      }
    });
    const attempts = await this.deps.lifecycleRepository.listCustomerDocumentPackageDeliveryAttempts(input.tenantId, input.jobId);
    const recipient = input.recipient?.trim() || pkg.recipient.email?.trim() || job.client?.emails?.[0]?.trim();
    return {
      package: pkg,
      job,
      selectedArtifacts,
      email: recipient
        ? { available: template.enabled && Boolean(this.deps.commsRail?.sendAdapter), recipient, defaultCopyTarget: this.deps.commsRail?.operatorEmail, subject: template.subject, bodyText: template.bodyText, ...(!template.enabled ? { unavailableReason: "Email delivery is disabled for Closeout packages in Settings." } : !this.deps.commsRail?.sendAdapter ? { unavailableReason: "Email delivery is not configured for this tenant." } : {}) }
        : { available: false, subject: template.subject, bodyText: template.bodyText, unavailableReason: "A recipient email is required before this package can be sent." },
      sms: { available: false, unavailableReason: "SMS delivery is not connected for this tenant yet." },
      attempts
    };
  }

  async sendCustomerDocumentPackageDelivery(input: SendCustomerDocumentPackageDeliveryInput): Promise<CustomerDocumentPackageDeliveryPreview> {
    const recipient = input.recipient.trim();
    const preview = await this.prepareCustomerDocumentPackageDelivery({ tenantId: input.tenantId, jobId: input.jobId, artifacts: input.artifacts, recipient });
    if (preview.package.manifestStatus !== "draft") {
      throw new RailError("Only a draft closeout package can be sent for review.", { provider: "native", op: "sendCustomerDocumentPackageDelivery", status: 409 });
    }
    if (!preview.package.selectedArtifactRefs.length) {
      throw new RailError("Select at least one closeout artifact before sending.", { provider: "native", op: "sendCustomerDocumentPackageDelivery", status: 400 });
    }
    const selectedKeys = new Set(input.selectedArtifactRefs.map((reference) => `${reference.source}:${reference.artifactId}`));
    const packageKeys = new Set(preview.package.selectedArtifactRefs.map((reference) => `${reference.source}:${reference.artifactId}`));
    if (selectedKeys.size !== packageKeys.size || [...selectedKeys].some((key) => !packageKeys.has(key))) {
      throw new RailError("Save the package selection before sending it.", { provider: "native", op: "sendCustomerDocumentPackageDelivery", status: 409 });
    }
    const subject = input.subject.trim();
    const bodyText = input.bodyText.trim();
    if (!recipient || !subject || !bodyText) {
      throw new RailError("Recipient, subject, and message are required before sending.", { provider: "native", op: "sendCustomerDocumentPackageDelivery", status: 400 });
    }
    if (!preview.email.available) {
      throw new RailError(preview.email.unavailableReason ?? "Email delivery is unavailable for this Closeout package.", { provider: "native", op: "sendCustomerDocumentPackageDelivery", status: 409 });
    }
    const sendAdapter = this.deps.commsRail?.sendAdapter;
    if (!sendAdapter) {
      throw new RailError("Email delivery is not configured for this tenant.", { provider: "native", op: "sendCustomerDocumentPackageDelivery", status: 501 });
    }
    const manifest = [
      `Closeout package: ${preview.job.title}`,
      `Job: ${preview.job.id}`,
      "",
      "Selected authoritative artifacts:",
      ...preview.selectedArtifacts.map((artifact) => `- ${artifact.fileName || artifact.label} | ${artifact.kind} | ${artifact.source}${artifact.visitId ? ` | Visit ${artifact.visitId}` : ""}`)
    ].join("\n");
    const receipt = await sendAdapter.sendEmail({
      tenantId: input.tenantId,
      mailbox: sendAdapter.mailbox,
      to: [recipient],
      ...(input.copyTarget?.trim() && input.sendCopy !== false ? { cc: [input.copyTarget.trim()] } : {}),
      subject,
      bodyText,
      bodyHtml: `<p>${escapeHtml(bodyText).replace(/\n/g, "<br/>")}</p>`,
      attachments: [{ filename: `closeout-package-${preview.job.id}.txt`, mime: "text/plain", contentBase64: Buffer.from(manifest, "utf8").toString("base64") }]
    });
    const timestamp = now();
    const attempt = await this.deps.lifecycleRepository.appendCustomerDocumentPackageDeliveryAttempt({
      tenantId: input.tenantId,
      jobId: input.jobId,
      packageId: preview.package.id,
      channel: "email",
      recipient,
      ...(input.copyTarget?.trim() && input.sendCopy !== false ? { copyTarget: input.copyTarget.trim() } : {}),
      subject,
      bodyText,
      selectedArtifactRefs: preview.package.selectedArtifactRefs,
      status: "sent",
      providerReceiptId: receipt.id,
      createdBy: input.actorId,
      createdAt: timestamp
    });
    await this.deps.lifecycleRepository.upsertCustomerDocumentPackage({
      ...preview.package,
      recipient: { ...preview.package.recipient, email: recipient },
      deliveryAttemptIds: [...new Set([...preview.package.deliveryAttemptIds, attempt.id])],
      deliveryStatus: "sent",
      packageVersion: preview.package.packageVersion + 1,
      updatedAt: timestamp
    });
    await this.emitLifecycleEvent({
      tenantId: input.tenantId,
      jobId: input.jobId,
      type: "closeout.package_delivery_sent",
      createdAt: timestamp,
      payload: { packageId: preview.package.id, deliveryAttemptId: attempt.id, channel: "email", recipient, artifactCount: preview.package.selectedArtifactRefs.length }
    });
    return this.prepareCustomerDocumentPackageDelivery({ tenantId: input.tenantId, jobId: input.jobId, artifacts: input.artifacts });
  }

  private async hydratedState(tenantId: string, jobId?: string): Promise<{
    jobs: Job[];
    clients: Client[];
    properties: Property[];
    quotes: Quote[];
    requests: ServiceRequest[];
    invoices: Invoice[];
    visits: ScheduledVisit[];
    invoiceReminders: InvoiceReminderRecord[];
    visitReminders: VisitReminderRecord[];
    actionAlerts: JobActionAlertRecord[];
    history: JobLifecycleEventRecord[];
  }> {
    const [jobs, clients, properties, quotes, requests, invoices, visits, invoiceReminders, visitReminders, actionAlerts, history] = await Promise.all([
      this.deps.crmRepository.listJobs(tenantId),
      this.deps.crmRepository.listClients(tenantId),
      this.deps.crmRepository.listProperties(tenantId),
      this.deps.crmRepository.listQuotes(tenantId),
      this.deps.crmRepository.listRequests(tenantId),
      this.deps.crmRepository.listInvoices(tenantId),
      this.deps.schedulingRepository.listVisits(tenantId, { from: "1970-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" }),
      this.deps.lifecycleRepository.listInvoiceReminders(tenantId),
      this.deps.lifecycleRepository.listVisitReminders(tenantId),
      this.deps.lifecycleRepository.listJobActionAlerts(tenantId),
      this.deps.lifecycleRepository.listLifecycleEvents(tenantId, jobId)
    ]);
    return { jobs, clients, properties, quotes, requests, invoices, visits, invoiceReminders, visitReminders, actionAlerts, history };
  }

  private visitsForJob(job: Job, visits: ScheduledVisit[]): ScheduledVisit[] {
    const nativeVisits = visits
      .filter((visit) => visit.jobId === job.id)
      .sort((left, right) => left.start.localeCompare(right.start));
    if (nativeVisits.length) {
      return nativeVisits;
    }
    const legacy = legacyVisitForJob(job);
    return legacy ? [legacy] : [];
  }

  private async syncStatus(job: Job, context: {
    visits: ScheduledVisit[];
    invoiceReminder?: InvoiceReminderRecord | undefined;
    actionAlert?: JobActionAlertRecord | undefined;
    invoices: Invoice[];
    referenceTime: string;
  }): Promise<Job> {
    const derived = deriveStatus({
      job,
      visits: context.visits,
      invoiceReminder: context.invoiceReminder,
      actionAlert: context.actionAlert,
      invoices: context.invoices,
      referenceTime: context.referenceTime
    });
    if (job.status === derived) {
      return job;
    }
    const updated = await this.deps.crmRepository.updateJob(job.id, {
      tenantId: job.tenantId,
      status: derived,
      updatedAt: context.referenceTime
    });
    await this.emitLifecycleEvent({
      tenantId: job.tenantId,
      jobId: job.id,
      type: "job.state_changed",
      createdAt: context.referenceTime,
      payload: {
        from: job.status,
        to: derived
      }
    });
    return updated;
  }

  private async syncScheduleWindow(job: Job, visits: ScheduledVisit[]): Promise<Job> {
    const nativeVisits = visits.filter((visit) => visit.jobId === job.id && visit.readOnly !== true);
    if (!nativeVisits.length) {
      return job;
    }
    const first = earliestByStart(nativeVisits);
    const last = latestByEnd(nativeVisits);
    if (!first || !last) {
      return job;
    }
    if (job.startAt === first.start && job.endAt === last.end) {
      return job;
    }
    return this.deps.crmRepository.updateJob(job.id, {
      tenantId: job.tenantId,
      startAt: first.start,
      endAt: last.end,
      updatedAt: now()
    });
  }

  private async processDueVisitReminders(tenantId: string, referenceTime = now()): Promise<void> {
    await this.visitCoreService.processDueVisitReminders(tenantId, referenceTime);
  }

  private async processRecurringInvoiceReminders(tenantId: string, referenceTime = now()): Promise<void> {
    const reminders = await this.deps.lifecycleRepository.listInvoiceReminders(tenantId);
    for (const reminder of reminders.filter((record) => record.status === "pending" && record.recurrence === "daily_9am")) {
      let nextRecord = { ...reminder };
      let changed = false;
      while (nextRecord.dueAt <= referenceTime) {
        await this.emitLifecycleEvent({
          tenantId,
          jobId: nextRecord.jobId,
          type: "invoice.reminder_due",
          createdAt: nextRecord.dueAt,
          payload: {
            reminderId: nextRecord.id,
            recurrence: "daily_9am"
          }
        });
        const nextDueAt = nextDailyNineIso(nextRecord.dueAt);
        nextRecord = {
          ...nextRecord,
          lastTriggeredAt: nextRecord.dueAt,
          dueAt: nextDueAt,
          nextDueAt
        };
        changed = true;
      }
      if (changed) {
        await this.deps.lifecycleRepository.upsertInvoiceReminder(nextRecord);
      }
    }
  }

  async listJobs(tenantId: string, referenceTime = now()): Promise<JobSummaryRecord[]> {
    await this.processDueVisitReminders(tenantId, referenceTime);
    await this.processRecurringInvoiceReminders(tenantId, referenceTime);
    const state = await this.hydratedState(tenantId);
    const summaries: JobSummaryRecord[] = [];
    for (const rawJob of state.jobs) {
      const visits = this.visitsForJob(rawJob, state.visits);
      const invoiceReminder = pendingInvoiceReminderForJob(state.invoiceReminders, rawJob.id);
      const actionAlert = pendingJobAlertForJob(state.actionAlerts, rawJob.id);
      const invoices = state.invoices.filter((invoice) => invoice.jobId === rawJob.id);
      const syncedWindowJob = await this.syncScheduleWindow(rawJob, visits);
      const job = await this.syncStatus(syncedWindowJob, {
        visits,
        invoiceReminder,
        actionAlert,
        invoices,
        referenceTime
      });
      summaries.push({
        ...job,
        client: state.clients.find((client) => client.id === job.clientId),
        property: job.propertyId ? state.properties.find((property) => property.id === job.propertyId) : undefined,
        nextVisit: visits.filter(activeVisit).sort((left, right) => left.start.localeCompare(right.start))[0],
        visitCount: visits.length,
        completedVisitCount: visits.filter(completeVisit).length,
        pendingInvoiceReminder: invoiceReminder,
        pendingActionAlert: actionAlert,
        invoiceCount: invoices.length
      });
    }
    return summaries.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
  }

  async getJobDetail(tenantId: string, jobId: string, referenceTime = now()): Promise<JobDetailRecord | null> {
    await this.processDueVisitReminders(tenantId, referenceTime);
    await this.processRecurringInvoiceReminders(tenantId, referenceTime);
    return this.getJobDetailWithoutReminderProcessing(tenantId, jobId, referenceTime);
  }

  private async getJobDetailWithoutReminderProcessing(tenantId: string, jobId: string, referenceTime: string): Promise<JobDetailRecord | null> {
    const state = await this.hydratedState(tenantId, jobId);
    const rawJob = state.jobs.find((candidate) => candidate.id === jobId);
    if (!rawJob) {
      return null;
    }
    const visits = this.visitsForJob(rawJob, state.visits);
    const invoiceReminder = pendingInvoiceReminderForJob(state.invoiceReminders, rawJob.id);
    const actionAlert = pendingJobAlertForJob(state.actionAlerts, rawJob.id);
    const invoices = state.invoices.filter((invoice) => invoice.jobId === rawJob.id);
    const syncedWindowJob = await this.syncScheduleWindow(rawJob, visits);
    const job = await this.syncStatus(syncedWindowJob, {
      visits,
      invoiceReminder,
      actionAlert,
      invoices,
      referenceTime
    });
    return {
      ...job,
      client: state.clients.find((client) => client.id === job.clientId),
      property: job.propertyId ? state.properties.find((property) => property.id === job.propertyId) : undefined,
      quote: job.quoteId ? state.quotes.find((quote) => quote.id === job.quoteId) : undefined,
      request: job.requestId ? state.requests.find((request) => request.id === job.requestId) : undefined,
      visits,
      reminders: {
        invoice: invoiceReminder,
        visit: state.visitReminders.filter((record) => record.jobId === job.id),
        actionAlert
      },
      history: state.history.filter((record) => record.jobId === job.id),
      invoices
    };
  }

  async prepareBookingConfirmation(tenantId: string, jobId: string, visitId?: string | undefined): Promise<BookingConfirmationPreview> {
    const detail = requireJobLifecycleRecord(await this.getJobDetail(tenantId, jobId), `Native job ${jobId} was not found.`, "prepareBookingConfirmation");
    const sortedVisits = [...detail.visits].sort((left, right) => left.start.localeCompare(right.start));
    const visit = visitId
      ? sortedVisits.find((candidate) => candidate.id === visitId)
      : sortedVisits.find((candidate) => activeVisit(candidate)) ?? sortedVisits[0];
    const selectedVisit = requireJobLifecycleRecord(visit, "Schedule a visit before sending a booking confirmation.", "prepareBookingConfirmation");
    const settings = await this.deps.crmRepository.getCrmSettings(tenantId);
    const users = await this.tenantUsers(tenantId);
    const technicianLabel = technicianNames(users, selectedVisit.assignedTo);
    const location = jobLocationLabel(detail.property, detail.client);
    const accessNote = reminderAccessNote(detail, detail.property);
    const visitWindow = `${new Date(selectedVisit.start).toLocaleString()} to ${new Date(selectedVisit.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    const emailFallback = [
      `Hi ${detail.client?.name ?? "there"},`,
      "",
      `Your visit for ${detail.title} is booked for ${visitWindow}.`,
      `Service address: ${location}.`,
      "Arrival window: morning jobs arrive between 8:00 AM and noon; afternoon jobs arrive between noon and 5:00 PM unless the office confirms a tighter slot.",
      `Technician: ${technicianLabel}.`,
      accessNote ? `Access note: ${accessNote}.` : "",
      "",
      "Add this visit to your calendar with the links below or the attached .ics file."
    ].filter(Boolean).join("\n");
    const googleUrl = googleCalendarUrl(selectedVisit, detail.title, location, emailFallback);
    const outlookUrl = outlookCalendarUrl(selectedVisit, detail.title, location, emailFallback);
    const vars = bookingTemplateVariables({
      job: detail,
      visit: selectedVisit,
      client: detail.client,
      property: detail.property,
      technicianLabel,
      googleCalendarUrl: googleUrl,
      outlookCalendarUrl: outlookUrl
    });
    const emailTemplate = resolveTemplateMessage({
      settings,
      category: "booking_confirmation",
      channel: "email",
      fallbackSubject: "Your job is booked",
      fallbackBodyText: emailFallback,
      variables: vars
    });
    const smsTemplate = resolveTemplateMessage({
      settings,
      category: "booking_confirmation",
      channel: "sms",
      fallbackSubject: "Booking confirmation",
      fallbackBodyText: [
        `${detail.title} is booked for ${visitWindow}.`,
        location,
        accessNote ? `Access: ${accessNote}.` : ""
      ].filter(Boolean).join(" "),
      variables: vars
    });
    return {
      job: detail,
      visit: selectedVisit,
      defaultCopyTarget: this.deps.commsRail?.operatorEmail,
      emailEnabled: emailTemplate.enabled && communicationChannelEnabled(settings, "booking_confirmation", "email"),
      smsEnabled: smsTemplate.enabled && communicationChannelEnabled(settings, "booking_confirmation", "sms"),
      emailTarget: detail.client?.emails[0],
      smsTarget: detail.client?.phones[0],
      emailSubject: emailTemplate.subject,
      emailBodyText: emailTemplate.bodyText,
      smsBodyText: smsTemplate.bodyText,
      googleCalendarUrl: googleUrl,
      outlookCalendarUrl: outlookUrl,
      calendarFilename: `booking-${selectedVisit.id}.ics`
    };
  }

  async sendBookingConfirmation(input: SendBookingConfirmationInput): Promise<{ job: JobDetailRecord; visit: ScheduledVisit }> {
    const preview = await this.prepareBookingConfirmation(input.tenantId, input.jobId, input.visitId);
    const target = input.target?.trim() || (input.mode === "email" ? preview.emailTarget : preview.smsTarget);
    if (!target) {
      throw new RailError(`A ${input.mode === "email" ? "client email" : "client phone number"} is required before sending a booking confirmation.`, { provider: "native", op: "sendBookingConfirmation", status: 400 });
    }
    const subject = input.subject?.trim() || preview.emailSubject;
    const bodyText = input.bodyText?.trim() || (input.mode === "email" ? preview.emailBodyText : preview.smsBodyText);
    const copyTarget = (input.copyTarget ?? preview.defaultCopyTarget)?.trim();
    if (input.mode === "email") {
      if (!preview.emailEnabled) {
        throw new RailError("Email booking confirmations are disabled in Settings.", { provider: "native", op: "sendBookingConfirmation", status: 409 });
      }
      if (!this.deps.commsRail?.sendAdapter) {
        throw new RailError("Email delivery is not configured for this tenant.", { provider: "native", op: "sendBookingConfirmation", status: 501 });
      }
      const htmlBody = `<p>${escapeHtml(bodyText).replace(/\n/g, "<br/>")}</p><p><a href="${preview.googleCalendarUrl}">Add to Google Calendar</a> | <a href="${preview.outlookCalendarUrl}">Add to Outlook</a></p>`;
      await this.deps.commsRail.sendAdapter.sendEmail({
        tenantId: input.tenantId,
        mailbox: this.deps.commsRail.sendAdapter.mailbox,
        to: [target],
        ...(copyTarget && (input.sendCopy ?? true) ? { cc: [copyTarget] } : {}),
        subject,
        bodyText,
        bodyHtml: htmlBody,
        attachments: [bookingCalendarAttachment(preview.visit, preview.job.title, jobLocationLabel(preview.job.property, preview.job.client), bodyText)]
      });
    } else {
      if (!preview.smsEnabled) {
        throw new RailError("Text booking confirmations are disabled in Settings.", { provider: "native", op: "sendBookingConfirmation", status: 409 });
      }
      await sendLifecycleSms(this.deps.commsRail, {
        tenantId: input.tenantId,
        to: target,
        body: bodyText
      });
    }
    await this.emitLifecycleEvent({
      tenantId: input.tenantId,
      jobId: input.jobId,
      type: "visit.booking_confirmation_sent",
      createdAt: now(),
      payload: {
        visitId: preview.visit.id,
        mode: input.mode,
        target,
        subject,
        ...(copyTarget && input.mode === "email" && (input.sendCopy ?? true) ? { copyTarget } : {})
      }
    });
    const refreshed = requireJobLifecycleRecord(await this.getJobDetail(input.tenantId, input.jobId), `Native job ${input.jobId} was not found.`, "sendBookingConfirmation");
    return { job: refreshed, visit: preview.visit };
  }

  async createJob(input: CreateJobInput): Promise<Job> {
    if (input.id) {
      const existing = (await this.deps.crmRepository.listJobs(input.tenantId)).find((job) => job.id === input.id);
      if (existing) return existing;
    }
    const timestamp = now();
    const lineItems = input.lineItems ?? [];
    const job = await this.deps.crmRepository.upsertJob({
      id: input.id ?? `job_${randomUUID()}`,
      tenantId: input.tenantId,
      number: await this.deps.crmRepository.reserveDocumentNumber(input.tenantId, "job"),
      clientId: input.clientId,
      ...(input.propertyId ? { propertyId: input.propertyId } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.quoteId ? { quoteId: input.quoteId } : {}),
      status: "Unscheduled",
      title: input.title.trim(),
      lineItems,
      totals: buildTotals(lineItems),
      ...(input.paymentSchedule ? { paymentSchedule: input.paymentSchedule } : {}),
      intake: input.intake,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    await this.emitLifecycleEvent({
      tenantId: job.tenantId,
      jobId: job.id,
      type: "job.created",
      createdAt: timestamp,
      payload: {
        title: job.title,
        createdBy: input.createdBy ?? "system"
      }
    });
    return job;
  }

  async markInvoiceCreated(input: {
    tenantId: string;
    jobId: string;
    invoiceId: string;
    actorId: string;
  }): Promise<JobDetailRecord> {
    const timestamp = now();
    const state = await this.hydratedState(input.tenantId, input.jobId);
    const rawJob = state.jobs.find((candidate) => candidate.id === input.jobId);
    const job = requireJobLifecycleRecord(rawJob, `Native job ${input.jobId} was not found.`, "markInvoiceCreated");
    const existingReminder = pendingInvoiceReminderForJob(state.invoiceReminders, job.id);
    const existingAlert = pendingJobAlertForJob(state.actionAlerts, job.id);
    if (existingAlert) {
      await this.deps.lifecycleRepository.upsertJobActionAlert({
        ...existingAlert,
        status: "resolved",
        resolvedAt: timestamp,
        resolvedByAction: "invoice"
      });
    }
    if (existingReminder) {
      await this.deps.lifecycleRepository.upsertInvoiceReminder({
        ...existingReminder,
        status: "resolved",
        resolvedAt: timestamp,
        resolvedByAction: "invoice_created"
      });
      await this.emitLifecycleEvent({
        tenantId: input.tenantId,
        jobId: job.id,
        type: "job.requires_invoicing_cleared",
        createdAt: timestamp,
        payload: {
          resolvedByAction: "invoice_created",
          invoiceId: input.invoiceId
        }
      });
    }
    return requireJobLifecycleRecord(
      await this.getJobDetail(input.tenantId, input.jobId, timestamp),
      `Native job ${input.jobId} was not found.`,
      "markInvoiceCreated"
    );
  }

  async scheduleVisit(input: ScheduleJobVisitInput): Promise<ScheduledVisit> {
    return this.visitCoreService.scheduleVisit(input);
  }

  async scheduleVisitSeries(input: ScheduleJobVisitSeriesInput): Promise<ScheduledVisit[]> {
    return this.visitCoreService.scheduleVisitSeries(input);
  }

  async moveVisit(input: MoveJobVisitInput): Promise<ScheduledVisit> {
    return this.visitCoreService.moveVisit(input);
  }

  async moveVisitSeries(input: MoveJobVisitSeriesInput): Promise<{ visit: ScheduledVisit; shiftedVisits: ScheduledVisit[] }> {
    return this.visitCoreService.moveVisitSeries(input);
  }

  async completeVisit(input: CompleteJobVisitInput): Promise<{ visit: ScheduledVisit; job: JobDetailRecord; actionAlert?: JobActionAlertRecord | undefined }> {
    return this.visitCoreService.completeVisit(input);
  }

  private async createInvoiceFromJob(job: Job, existingInvoices?: Invoice[]): Promise<Invoice> {
    const reused = existingInvoices?.find((invoice) => invoice.jobId === job.id && invoice.status !== "void");
    if (reused) {
      return reused;
    }
    const settings = await this.deps.crmRepository.getCrmSettings(job.tenantId);
    const created = await this.deps.crmRepository.createInvoice(buildInvoiceDraftFromJobs({
      tenantId: job.tenantId,
      jobs: [job],
      settings,
      number: await this.deps.crmRepository.reserveDocumentNumber(job.tenantId, "invoice"),
      ...(job.quoteId ? { quoteId: job.quoteId } : {}),
      ...(job.requestId ? { requestId: job.requestId } : {}),
      ...(job.intake ? { intake: job.intake } : {}),
      ...(job.paymentSchedule ? { paymentSchedule: job.paymentSchedule } : {})
    }));
    return this.deps.ledgerService ? this.deps.ledgerService.syncInvoiceAfterCreate(created) : created;
  }

  async prepareJobActionPreview(tenantId: string, jobId: string, action: PerformJobActionInput["action"]): Promise<PrepareJobActionPreview> {
    const detail = requireJobLifecycleRecord(await this.getJobDetail(tenantId, jobId), `Native job ${jobId} was not found.`, "prepareJobActionPreview");
    const titleMap: Record<PerformJobActionInput["action"], string> = {
      close: `Close job: ${detail.title}`,
      invoice: `Invoice job: ${detail.title}`,
      close_and_invoice: `Close and invoice job: ${detail.title}`,
      dismiss_invoice_reminder: `Dismiss invoice reminder: ${detail.title}`
    };
    const body = [
      `Job: ${detail.title}`,
      detail.number ? `Job number: ${detail.number}` : "",
      `Current status: ${detail.status}`,
      `Visits: ${detail.visits.length} total / ${detail.visits.filter(completeVisit).length} completed`,
      detail.reminders.invoice ? `Invoice reminder due: ${detail.reminders.invoice.dueAt}` : "",
      action === "close" ? "This closes the job now and leaves invoicing to the recurring reminder-driven follow-up, starting immediately and then every day at 9:00 AM until cleared." : "",
      action === "invoice" ? "This creates the draft invoice now but leaves the job open until you close it." : "",
      action === "close_and_invoice" ? "This closes the job and creates the draft invoice in one step." : "",
      action === "dismiss_invoice_reminder" ? "This clears the active invoice reminder and archives the job without creating an invoice." : ""
    ].filter(Boolean).join("\n");
    return {
      job: detail,
      action,
      title: titleMap[action],
      body
    };
  }

  async performJobAction(input: PerformJobActionInput): Promise<{ job: JobDetailRecord; invoice?: Invoice | undefined; reminder?: InvoiceReminderRecord | undefined }> {
    const timestamp = now();
    const state = await this.hydratedState(input.tenantId, input.jobId);
    const rawJob = state.jobs.find((candidate) => candidate.id === input.jobId);
    const job = requireJobLifecycleRecord(rawJob, `Native job ${input.jobId} was not found.`, "performJobAction");
    const existingReminder = pendingInvoiceReminderForJob(state.invoiceReminders, job.id);
    const existingAlert = pendingJobAlertForJob(state.actionAlerts, job.id);
    if (existingAlert) {
      await this.deps.lifecycleRepository.upsertJobActionAlert({
        ...existingAlert,
        status: "resolved",
        resolvedAt: timestamp,
        resolvedByAction: input.action
      });
    }
    if (input.action === "dismiss_invoice_reminder") {
      const reminder = requireJobLifecycleRecord(existingReminder, "No pending invoice reminder was found for that job.", "dismissInvoiceReminder");
      await this.deps.lifecycleRepository.upsertInvoiceReminder({
        ...reminder,
        status: "dismissed",
        resolvedAt: timestamp,
        resolvedByAction: "dismissed"
      });
      await this.deps.crmRepository.updateJob(job.id, {
        tenantId: input.tenantId,
        archivedAt: timestamp,
        archivedBy: input.actorId,
        updatedAt: timestamp
      });
      await this.emitLifecycleEvent({
        tenantId: input.tenantId,
        jobId: job.id,
        type: "job.requires_invoicing_cleared",
        createdAt: timestamp,
        payload: {
          resolvedByAction: "dismissed"
        }
      });
      return {
        job: requireJobLifecycleRecord(await this.getJobDetail(input.tenantId, input.jobId, timestamp), `Native job ${input.jobId} was not found.`, "dismissInvoiceReminder")
      };
    }

    let updatedJob = job;
    if (input.action === "close" || input.action === "close_and_invoice") {
      updatedJob = await this.deps.crmRepository.updateJob(job.id, {
        tenantId: input.tenantId,
        closedAt: timestamp,
        closedBy: input.actorId,
        updatedAt: timestamp
      });
      await this.emitLifecycleEvent({
        tenantId: input.tenantId,
        jobId: job.id,
        type: "job.closed",
        createdAt: timestamp,
        payload: {
          closedBy: input.actorId
        }
      });
    }

    let invoice: Invoice | undefined;
    if (input.action === "invoice" || input.action === "close_and_invoice") {
      invoice = await this.createInvoiceFromJob(updatedJob, state.invoices.filter((candidate) => candidate.jobId === job.id));
      if (existingReminder) {
        await this.deps.lifecycleRepository.upsertInvoiceReminder({
          ...existingReminder,
          status: "resolved",
          resolvedAt: timestamp,
          resolvedByAction: "invoice_created"
        });
      }
      await this.emitLifecycleEvent({
        tenantId: input.tenantId,
        jobId: job.id,
        type: "job.requires_invoicing_cleared",
        createdAt: timestamp,
        payload: {
          resolvedByAction: "invoice_created",
          invoiceId: invoice.id
        }
      });
    }

    let reminder: InvoiceReminderRecord | undefined;
    if (input.action === "close" && !invoice) {
      if (state.invoices.some((candidate) => candidate.jobId === job.id && candidate.status !== "void")) {
        await this.deps.crmRepository.updateJob(job.id, {
          tenantId: input.tenantId,
          archivedAt: timestamp,
          archivedBy: input.actorId,
          updatedAt: timestamp
        });
      } else {
        reminder = await this.deps.lifecycleRepository.upsertInvoiceReminder(existingReminder ?? {
          id: `inv_reminder_${randomUUID()}`,
          tenantId: input.tenantId,
          jobId: job.id,
          kind: "job_close_follow_up",
          dueAt: timestamp,
          recurrence: "daily_9am",
          nextDueAt: nextDailyNineIso(timestamp),
          status: "pending",
          createdByRule: "job_closed_without_invoice",
          createdAt: timestamp
        });
      }
    }

    return {
      job: requireJobLifecycleRecord(await this.getJobDetail(input.tenantId, input.jobId, timestamp), `Native job ${input.jobId} was not found.`, "performJobAction"),
      ...(invoice ? { invoice } : {}),
      ...(reminder ? { reminder } : {})
    };
  }
}
