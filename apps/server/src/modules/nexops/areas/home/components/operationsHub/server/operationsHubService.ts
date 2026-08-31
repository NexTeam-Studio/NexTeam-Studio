import {
  type BusEvent,
  type EventBus,
  type Invoice,
  type Quote,
  type ServiceRequest,
  type TenantUser,
  type TenantUserRole
} from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { AccessContext } from "../../../../../../../auth/accessContext.js";
import type { MediaRepository } from "../../../../../../../fielddocs/mediaRepository.js";
import type { PlatformRepository } from "../../../../../../../platform/repository.js";
import type { ScheduledVisit } from "../../../../../../../scheduling/schedulingEngine.js";
import type { SchedulingRepository } from "../../../../../../../scheduling/repository.js";
import { deriveStatus, type JobDetailRecord, type JobLifecycleService, type JobSummaryRecord } from "../../../../jobs/components/jobCore/server/jobLifecycleService.js";
import type { JobActionAlertRecord, JobLifecycleRepository } from "../../../../jobs/components/jobCore/server/jobLifecycleRepository.js";
import type { NotificationStateRepository } from "./notificationStateRepository.js";

export type ActivityFilter = "requests" | "quotes" | "jobs" | "invoices" | "payments";

export interface ScheduleWorkspaceVisit {
  id: string;
  jobId: string;
  requestId?: string | undefined;
  quoteId?: string | undefined;
  clientId: string;
  clientName: string;
  jobTitle: string;
  propertyId?: string | undefined;
  propertyAddress: string;
  status: JobSummaryRecord["status"];
  statusTone: "success" | "warning" | "danger" | "secondary";
  start: string;
  end: string;
  arrivalWindow: string;
  assignedTo: string[];
  assignedTeam: Array<{ id: string; name: string }>;
  details?: string | undefined;
  source?: string | undefined;
  readOnly?: boolean | undefined;
}

export interface ScheduleWorkspaceJobQueueItem {
  jobId: string;
  clientId: string;
  clientName: string;
  title: string;
  number?: string | undefined;
  propertyAddress: string;
  totalValue: number;
}

export interface ScheduleWorkspace {
  visits: ScheduleWorkspaceVisit[];
  unscheduledJobs: ScheduleWorkspaceJobQueueItem[];
  teamMembers: Array<{ id: string; name: string }>;
}

export interface HomeQueueRow {
  key: string;
  label: string;
  count: number;
  totalValue?: number | undefined;
  detail: string;
  target: {
    module: "requests" | "quotes" | "jobs" | "payments" | "schedule" | "capture";
    filterKey: string;
    filterValue: string;
  };
}

export interface HomeHealthMetric {
  key: string;
  label: string;
  value: string;
  delta: string;
}

export interface TechnicianHomeSnapshot {
  todayVisits: ScheduleWorkspaceVisit[];
  queues: HomeQueueRow[];
}

export interface HomeSnapshot {
  role: TenantUserRole;
  queues: HomeQueueRow[];
  health: HomeHealthMetric[];
  technician?: TechnicianHomeSnapshot | undefined;
}

export interface ActivityEntry {
  id: string;
  eventId: string;
  type: string;
  objectType: ActivityFilter;
  actor: string;
  action: string;
  reference: string;
  title: string;
  value?: string | undefined;
  occurredAt: string;
  relativeTime: string;
  target: {
    module: "requests" | "quotes" | "jobs" | "invoices" | "payments";
    objectId: string;
  };
}

export interface NotificationEntry {
  id: string;
  kind: "event" | "alert";
  unread: boolean;
  title: string;
  body: string;
  occurredAt: string;
  relativeTime: string;
  target: {
    module: "requests" | "quotes" | "jobs" | "invoices" | "payments";
    objectId: string;
  };
}

export interface DocumentationActivityRow {
  tenantUserId: string;
  displayName: string;
  role: TenantUserRole;
  photoUploads: number;
  completedChecklists: number;
  totalDocumentationEvents: number;
  lastOccurredAt?: string | undefined;
}

export interface DocumentationActivitySnapshot {
  from: string;
  to: string;
  rows: DocumentationActivityRow[];
}

interface OperationsHubDeps {
  crmRepository: NativeCrmRepository;
  schedulingRepository: SchedulingRepository;
  lifecycleRepository: JobLifecycleRepository;
  jobLifecycleService: JobLifecycleService;
  eventBus: EventBus;
  notificationStateRepository: NotificationStateRepository;
  mediaRepository?: MediaRepository | undefined;
  platformRepository?: Pick<PlatformRepository, "listTenantUsers"> | undefined;
}

interface TenantContext {
  requests: ServiceRequest[];
  quotes: Quote[];
  invoices: Invoice[];
  jobs: JobSummaryRecord[];
  visits: ScheduledVisit[];
  alerts: JobActionAlertRecord[];
  users: TenantUser[];
  detailByJobId: Map<string, JobDetailRecord>;
  requestById: Map<string, ServiceRequest>;
  quoteById: Map<string, Quote>;
  invoiceById: Map<string, Invoice>;
  jobById: Map<string, JobSummaryRecord>;
}

function now(): string {
  return new Date().toISOString();
}

function dayKey(value: string): string {
  return value.slice(0, 10);
}

function startOfDayIso(value: string): string {
  return `${dayKey(value)}T00:00:00.000Z`;
}

function endOfDayIso(value: string): string {
  return `${dayKey(value)}T23:59:59.999Z`;
}

function startOfWeekIso(referenceTime: string): string {
  const date = new Date(referenceTime);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfWeekIso(referenceTime: string): string {
  const start = new Date(startOfWeekIso(referenceTime));
  start.setUTCDate(start.getUTCDate() + 6);
  start.setUTCHours(23, 59, 59, 999);
  return start.toISOString();
}

function previousWeekRange(referenceTime: string): { from: string; to: string } {
  const currentStart = new Date(startOfWeekIso(referenceTime));
  currentStart.setUTCDate(currentStart.getUTCDate() - 7);
  const currentEnd = new Date(currentStart);
  currentEnd.setUTCDate(currentEnd.getUTCDate() + 6);
  currentEnd.setUTCHours(23, 59, 59, 999);
  return { from: currentStart.toISOString(), to: currentEnd.toISOString() };
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function relativeTime(value: string, referenceTime = now()): string {
  const deltaMs = new Date(referenceTime).getTime() - new Date(value).getTime();
  const deltaMinutes = Math.round(deltaMs / 60000);
  if (Math.abs(deltaMinutes) < 1) {
    return "just now";
  }
  if (Math.abs(deltaMinutes) < 60) {
    return `${Math.abs(deltaMinutes)}m ${deltaMinutes >= 0 ? "ago" : "from now"}`;
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return `${Math.abs(deltaHours)}h ${deltaHours >= 0 ? "ago" : "from now"}`;
  }
  const deltaDays = Math.round(deltaHours / 24);
  return `${Math.abs(deltaDays)}d ${deltaDays >= 0 ? "ago" : "from now"}`;
}

function overlap(range: { from?: string; to?: string }, visit: ScheduledVisit): boolean {
  return (!range.from || visit.end >= range.from)
    && (!range.to || visit.start <= range.to);
}

function propertyAddress(job: {
  property?: { address?: { street1: string; city: string; province: string } | undefined } | undefined;
  client?: { billingAddress?: { street1: string } | undefined } | undefined;
}): string {
  const address = job.property?.address;
  return [
    address?.street1,
    address?.city,
    address?.province
  ].filter(Boolean).join(", ") || job.client?.billingAddress?.street1 || "No property address yet";
}

function statusTone(status: JobSummaryRecord["status"]): "success" | "warning" | "danger" | "secondary" {
  if (status === "Late" || status === "Action Required") {
    return "danger";
  }
  if (status === "Requires Invoicing" || status === "Today") {
    return "warning";
  }
  if (status === "Upcoming") {
    return "success";
  }
  return "secondary";
}

function withinIsoRange(value: string, range: { from: string; to: string }): boolean {
  return value >= range.from && value <= range.to;
}

function arrivalWindow(visit: ScheduledVisit): string {
  const start = new Date(visit.start);
  const end = new Date(visit.end);
  return `${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function actorLabel(actorId: string | undefined, users: TenantUser[]): string {
  if (!actorId) {
    return "Office";
  }
  const matched = users.find((user) => user.id === actorId || user.authUid === actorId);
  if (matched) {
    return matched.displayName;
  }
  if (actorId === "stripe_webhook") {
    return "Stripe";
  }
  if (actorId === "request_conversion") {
    return "Office";
  }
  if (actorId.startsWith("internal:")) {
    return "Office";
  }
  return actorId === "system" ? "System" : actorId;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function assignedJobIdsForTechnician(visits: ScheduledVisit[], tenantUserId: string): Set<string> {
  return new Set(
    visits
      .filter((visit) => visit.assignedTo.includes(tenantUserId))
      .map((visit) => visit.jobId)
  );
}

function eventObjectType(event: BusEvent): ActivityFilter {
  if (event.type.startsWith("request.")) {
    return "requests";
  }
  if (event.type.startsWith("quote.")) {
    return "quotes";
  }
  if (event.type.startsWith("payment.") || event.type.startsWith("refund.")) {
    return "payments";
  }
  if (event.type.startsWith("invoice.")) {
    return "invoices";
  }
  return "jobs";
}

function eventObjectId(event: BusEvent): { module: ActivityFilter; objectId: string } | null {
  const payload = recordOf(event.payload);
  const requestId = stringValue(payload, "requestId");
  const quoteId = stringValue(payload, "quoteId");
  const jobId = stringValue(payload, "jobId");
  const invoiceId = stringValue(payload, "invoiceId");
  const paymentId = stringValue(payload, "paymentId");
  if (event.type.startsWith("request.") && requestId) {
    return { module: "requests", objectId: requestId };
  }
  if (event.type.startsWith("quote.") && quoteId) {
    return { module: "quotes", objectId: quoteId };
  }
  if (event.type.startsWith("payment.") || event.type.startsWith("refund.")) {
    if (paymentId) {
      return { module: "payments", objectId: paymentId };
    }
    if (invoiceId) {
      return { module: "payments", objectId: invoiceId };
    }
  }
  if (event.type.startsWith("invoice.") && invoiceId) {
    return { module: "invoices", objectId: invoiceId };
  }
  if (jobId) {
    return { module: "jobs", objectId: jobId };
  }
  if (invoiceId) {
    return { module: "invoices", objectId: invoiceId };
  }
  if (quoteId) {
    return { module: "quotes", objectId: quoteId };
  }
  return requestId ? { module: "requests", objectId: requestId } : null;
}

function notificationEventTypes(): Set<string> {
  return new Set([
    "quote.viewed",
    "quote.approved",
    "quote.deposit_paid",
    "payment.created",
    "payment.failed",
    "request.created",
    "visit.confirmed",
    "review.marked"
  ]);
}

export class OperationsHubService {
  /**
   * The Home surface asks for its queues, activity, and documentation in
   * parallel.  All three need the identical tenant context, which otherwise
   * fans one screen load into three full Firestore read sets (and three sets
   * of job-detail reads).  Share only concurrent builds: completed contexts
   * are never cached, so a later mutation always reads current data.
   */
  private readonly contextBuilds = new Map<string, Promise<TenantContext>>();

  constructor(private readonly deps: OperationsHubDeps) {}

  private async tenantUsers(tenantId: string): Promise<TenantUser[]> {
    return this.deps.platformRepository ? this.deps.platformRepository.listTenantUsers(tenantId) : [];
  }

  private async buildContext(
    tenantId: string,
    referenceTime = now(),
    options: { includeJobDetails?: boolean } = {}
  ): Promise<TenantContext> {
    const includeJobDetails = options.includeJobDetails === true;
    const contextKey = `${tenantId}:${includeJobDetails ? "with-job-details" : "summary-only"}`;
    const pending = this.contextBuilds.get(contextKey);
    if (pending) {
      return pending;
    }
    const build = this.buildContextUncached(tenantId, referenceTime, { includeJobDetails });
    this.contextBuilds.set(contextKey, build);
    try {
      return await build;
    } finally {
      if (this.contextBuilds.get(contextKey) === build) {
        this.contextBuilds.delete(contextKey);
      }
    }
  }

  private async buildContextUncached(
    tenantId: string,
    referenceTime = now(),
    options: { includeJobDetails?: boolean } = {}
  ): Promise<TenantContext> {
    const [requests, quotes, invoices, rawJobs, clients, properties, users, alerts, invoiceReminders, visits] = await Promise.all([
      this.deps.crmRepository.listRequests(tenantId),
      this.deps.crmRepository.listQuotes(tenantId),
      this.deps.crmRepository.listInvoices(tenantId),
      this.deps.crmRepository.listJobs(tenantId),
      this.deps.crmRepository.listClients(tenantId),
      this.deps.crmRepository.listProperties(tenantId),
      this.tenantUsers(tenantId),
      this.deps.lifecycleRepository.listJobActionAlerts(tenantId),
      this.deps.lifecycleRepository.listInvoiceReminders(tenantId),
      this.deps.schedulingRepository.listVisits(tenantId, {})
    ]);
    const visitsByJobId = new Map<string, ScheduledVisit[]>();
    for (const visit of visits) {
      const current = visitsByJobId.get(visit.jobId) ?? [];
      current.push(visit);
      visitsByJobId.set(visit.jobId, current);
    }
    const invoicesByJobId = new Map<string, Invoice[]>();
    for (const invoice of invoices) {
      if (!invoice.jobId) {
        continue;
      }
      const current = invoicesByJobId.get(invoice.jobId) ?? [];
      current.push(invoice);
      invoicesByJobId.set(invoice.jobId, current);
    }
    const pendingAlertByJobId = new Map(
      alerts
        .filter((alert) => alert.status === "pending")
        .map((alert) => [alert.jobId, alert])
    );
    const pendingInvoiceReminderByJobId = new Map(
      invoiceReminders
        .filter((reminder) => reminder.status === "pending")
        .map((reminder) => [reminder.jobId, reminder])
    );
    const clientById = new Map(clients.map((client) => [client.id, client]));
    const propertyById = new Map(properties.map((property) => [property.id, property]));
    const jobs: JobSummaryRecord[] = rawJobs.map((job) => {
      const jobVisits = visitsByJobId.get(job.id) ?? [];
      const activeVisits = jobVisits
        .filter((visit) => visit.status !== "complete" && visit.status !== "cancelled")
        .sort((left, right) => left.start.localeCompare(right.start));
      return {
        ...job,
        status: deriveStatus({
          job,
          visits: jobVisits,
          invoiceReminder: pendingInvoiceReminderByJobId.get(job.id),
          actionAlert: pendingAlertByJobId.get(job.id),
          invoices: invoicesByJobId.get(job.id) ?? [],
          referenceTime
        }),
        client: clientById.get(job.clientId),
        ...(job.propertyId ? { property: propertyById.get(job.propertyId) } : {}),
        ...(activeVisits[0] ? { nextVisit: activeVisits[0] } : {}),
        visitCount: jobVisits.length,
        completedVisitCount: jobVisits.filter((visit) => visit.status === "complete").length,
        ...(pendingAlertByJobId.get(job.id) ? { pendingActionAlert: pendingAlertByJobId.get(job.id) } : {}),
        invoiceCount: (invoicesByJobId.get(job.id) ?? []).length
      };
    });
    const detailIds = options.includeJobDetails ? [...new Set(visits.map((visit) => visit.jobId))] : [];
    const details = await Promise.all(detailIds.map(async (jobId) => this.deps.jobLifecycleService.getJobDetail(tenantId, jobId, referenceTime)));
    const detailByJobId = new Map(
      details
        .filter((detail): detail is JobDetailRecord => Boolean(detail))
        .map((detail) => [detail.id, detail])
    );
    return {
      requests,
      quotes,
      invoices,
      jobs,
      visits,
      alerts,
      users,
      detailByJobId,
      requestById: new Map(requests.map((request) => [request.id, request])),
      quoteById: new Map(quotes.map((quote) => [quote.id, quote])),
      invoiceById: new Map(invoices.map((invoice) => [invoice.id, invoice])),
      jobById: new Map(jobs.map((job) => [job.id, job]))
    };
  }

  async getScheduleWorkspace(input: {
    access: AccessContext;
    from?: string | undefined;
    to?: string | undefined;
    teamMemberIds?: string[] | undefined;
    referenceTime?: string | undefined;
  }): Promise<ScheduleWorkspace> {
    const referenceTime = input.referenceTime ?? now();
    const context = await this.buildContext(input.access.tenantId, referenceTime, { includeJobDetails: true });
    const range = {
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {})
    };
    const scopedTeamIds = input.access.role === "TECHNICIAN"
      ? [input.access.tenantUserId]
      : (input.teamMemberIds ?? []);
    const teamMembers = context.users
      .filter((user) => user.active)
      .map((user) => ({ id: user.id, name: user.displayName }))
      .sort((left, right) => left.name.localeCompare(right.name));
    const visits = context.visits
      .filter((visit) => overlap(range, visit))
      .filter((visit) => scopedTeamIds.length === 0 || visit.assignedTo.some((userId) => scopedTeamIds.includes(userId)))
      .filter((visit) => input.access.role !== "TECHNICIAN" || visit.assignedTo.includes(input.access.tenantUserId))
      .map((visit) => {
        const detail = context.detailByJobId.get(visit.jobId);
        const job = detail ?? context.jobById.get(visit.jobId);
        const clientName = detail?.client?.name ?? job?.client?.name ?? "Unknown client";
        const assignedTeam = visit.assignedTo
          .map((userId) => context.users.find((user) => user.id === userId))
          .filter((user): user is TenantUser => Boolean(user))
          .map((user) => ({ id: user.id, name: user.displayName }));
        return {
          id: visit.id,
          jobId: visit.jobId,
          ...(detail?.requestId ? { requestId: detail.requestId } : {}),
          ...(detail?.quoteId ? { quoteId: detail.quoteId } : {}),
          clientId: detail?.clientId ?? job?.clientId ?? "unknown-client",
          clientName,
          jobTitle: detail?.title ?? job?.title ?? visit.title,
          ...(detail?.propertyId ? { propertyId: detail.propertyId } : {}),
          propertyAddress: detail ? propertyAddress(detail) : visit.location.label,
          status: (detail?.status ?? "Unscheduled") as JobSummaryRecord["status"],
          statusTone: statusTone((detail?.status ?? "Unscheduled") as JobSummaryRecord["status"]),
          start: visit.start,
          end: visit.end,
          arrivalWindow: arrivalWindow(visit),
          assignedTo: visit.assignedTo,
          assignedTeam,
          ...(visit.details ? { details: visit.details } : {}),
          ...(visit.source ? { source: visit.source } : {}),
          ...(visit.readOnly !== undefined ? { readOnly: visit.readOnly } : {})
        };
      })
      .sort((left, right) => left.start.localeCompare(right.start));
    const unscheduledJobs = input.access.role === "TECHNICIAN"
      ? []
      : context.jobs
          .filter((job) => job.status === "Unscheduled")
          .map((job) => ({
            jobId: job.id,
            clientId: job.clientId,
            clientName: job.client?.name ?? "Unknown client",
            title: job.title,
            ...(job.number ? { number: job.number } : {}),
            propertyAddress: propertyAddress(job),
            totalValue: job.totals.total
          }))
          .sort((left, right) => left.clientName.localeCompare(right.clientName));
    return { visits, unscheduledJobs, teamMembers };
  }

  async getHomeSnapshot(input: { access: AccessContext; referenceTime?: string | undefined }): Promise<HomeSnapshot> {
    const referenceTime = input.referenceTime ?? now();
    const context = await this.buildContext(input.access.tenantId, referenceTime);
    const unassignedCaptureBatches = this.deps.mediaRepository
      ? (await this.deps.mediaRepository.listCaptureBatches(input.access.tenantId))
          .filter((batch) => batch.status === "unassigned")
          .filter((batch) => input.access.role !== "TECHNICIAN" || batch.createdBy === input.access.tenantUserId)
      : [];
    if (input.access.role === "TECHNICIAN") {
      const todayRange = { from: startOfDayIso(referenceTime), to: endOfDayIso(referenceTime) };
      const todayVisits = (await this.getScheduleWorkspace({
        access: input.access,
        from: todayRange.from,
        to: todayRange.to,
        teamMemberIds: [input.access.tenantUserId],
        referenceTime
      })).visits;
      const assignedJobs = assignedJobIdsForTechnician(context.visits, input.access.tenantUserId);
      const lateAssigned = context.jobs.filter((job) => assignedJobs.has(job.id) && job.status === "Late").length;
      const upcomingAssigned = context.visits.filter((visit) =>
        visit.assignedTo.includes(input.access.tenantUserId)
        && visit.start > endOfDayIso(referenceTime)
        && visit.status !== "complete"
      ).length;
      const queues: HomeQueueRow[] = [
          {
            key: "today-visits",
            label: "Today's visits",
            count: todayVisits.length,
            detail: todayVisits.length ? "Assigned visits on your board today." : "Nothing assigned on the board today.",
            target: { module: "schedule", filterKey: "scope", filterValue: "today" }
          },
          {
            key: "late-assigned",
            label: "Late assigned jobs",
            count: lateAssigned,
            detail: lateAssigned ? "Assigned work is sitting behind schedule." : "No assigned jobs are running late.",
            target: { module: "jobs", filterKey: "status", filterValue: "Late" }
          },
          {
            key: "upcoming-assigned",
            label: "Upcoming assigned visits",
            count: upcomingAssigned,
            detail: upcomingAssigned ? "Scheduled work is queued behind today's board." : "No future visits are stacked yet.",
            target: { module: "schedule", filterKey: "scope", filterValue: "upcoming" }
          }
      ];
      if (unassignedCaptureBatches.length) {
        queues.push({
            key: "unassigned-photo-batches",
            label: "My unassigned photo batches",
            count: unassignedCaptureBatches.length,
            detail: "Captured photos still need a client before they disappear into the rail.",
            target: { module: "capture", filterKey: "status", filterValue: "unassigned" }
          });
      }
      return {
        role: input.access.role,
        queues,
        health: [],
        technician: {
          todayVisits,
          queues: []
        }
      };
    }

    const newRequests = context.requests.filter((request) => request.status === "new");
    const approvedQuotes = context.quotes.filter((quote) => ["approved", "approved_internal"].includes(quote.status) && !quote.convertedJobId);
    const actionJobs = context.jobs.filter((job) => job.status === "Action Required");
    const todayRange = { from: startOfDayIso(referenceTime), to: endOfDayIso(referenceTime) };
    const todayVisits = context.visits.filter((visit) => overlap(todayRange, visit));
    const upcomingVisits = context.visits.filter((visit) => new Date(visit.start).getTime() > new Date(todayRange.to).getTime());
    const unscheduledJobs = context.jobs.filter((job) => job.status === "Unscheduled");
    const requiresInvoicing = context.jobs.filter((job) => job.status === "Requires Invoicing");
    const awaitingPayment = context.invoices.filter((invoice) => invoice.status === "awaiting_payment" || invoice.status === "partial_pay");
    const pastDue = context.invoices.filter((invoice) => Boolean(invoice.ledger?.overdue));

    const currentWeek = { from: startOfWeekIso(referenceTime), to: endOfWeekIso(referenceTime) };
    const previousWeek = previousWeekRange(referenceTime);
    const currentWeekVisits = context.visits.filter((visit) => overlap(currentWeek, visit));
    const previousWeekVisits = context.visits.filter((visit) => overlap(previousWeek, visit));
    const currentWeekJobIds = [...new Set(currentWeekVisits.map((visit) => visit.jobId))];
    const previousWeekJobIds = [...new Set(previousWeekVisits.map((visit) => visit.jobId))];
    const currentWeekJobValue = roundMoney(currentWeekJobIds.reduce((sum, jobId) => sum + (context.jobById.get(jobId)?.totals.total ?? 0), 0));
    const previousWeekJobValue = roundMoney(previousWeekJobIds.reduce((sum, jobId) => sum + (context.jobById.get(jobId)?.totals.total ?? 0), 0));
    const visitDelta = currentWeekVisits.length - previousWeekVisits.length;
    const valueDelta = currentWeekJobValue - previousWeekJobValue;

    const queues: HomeQueueRow[] = [
        {
          key: "new-requests",
          label: "New requests awaiting action",
          count: newRequests.length,
          detail: newRequests.length ? "Fresh intake is waiting for office review." : "No new intake is waiting right now.",
          target: { module: "requests", filterKey: "status", filterValue: "new" }
        },
        {
          key: "approved-quotes",
          label: "Approved quotes not yet converted",
          count: approvedQuotes.length,
          totalValue: roundMoney(approvedQuotes.reduce((sum, quote) => sum + quote.totals.total, 0)),
          detail: approvedQuotes.length ? "Authorized work still needs to land on the live rail." : "No approved quotes are stalled before scheduling.",
          target: { module: "quotes", filterKey: "status", filterValue: "approved_pending_conversion" }
        },
        {
          key: "action-required",
          label: "Action Required jobs",
          count: actionJobs.length,
          totalValue: roundMoney(actionJobs.reduce((sum, job) => sum + job.totals.total, 0)),
          detail: actionJobs.length ? "Office attention is blocking the next move on these jobs." : "No jobs are stuck on office attention.",
          target: { module: "jobs", filterKey: "status", filterValue: "Action Required" }
        },
        {
          key: "today-visits",
          label: "Today's visits",
          count: todayVisits.length,
          detail: todayVisits.length ? "The live board already has visits scheduled for today." : "Nothing is scheduled on today's board yet.",
          target: { module: "schedule", filterKey: "scope", filterValue: "today" }
        },
        {
          key: "upcoming-visits",
          label: "Upcoming visits",
          count: upcomingVisits.length,
          detail: upcomingVisits.length ? "Future visits are stacked behind today's board." : "No future visits are booked yet.",
          target: { module: "schedule", filterKey: "scope", filterValue: "upcoming" }
        },
        {
          key: "unscheduled-jobs",
          label: "Unscheduled jobs",
          count: unscheduledJobs.length,
          totalValue: roundMoney(unscheduledJobs.reduce((sum, job) => sum + job.totals.total, 0)),
          detail: unscheduledJobs.length ? "Approved or active work is waiting for a visit slot." : "No jobs are stuck without a visit slot.",
          target: { module: "jobs", filterKey: "status", filterValue: "Unscheduled" }
        },
        {
          key: "requires-invoicing",
          label: "Requires Invoicing jobs",
          count: requiresInvoicing.length,
          totalValue: roundMoney(requiresInvoicing.reduce((sum, job) => sum + job.totals.total, 0)),
          detail: requiresInvoicing.length ? "Reminder-driven invoice work is sitting due." : "No jobs are waiting on invoice creation.",
          target: { module: "jobs", filterKey: "status", filterValue: "Requires Invoicing" }
        },
        {
          key: "awaiting-payment",
          label: "Awaiting Payment invoices",
          count: awaitingPayment.length,
          totalValue: roundMoney(awaitingPayment.reduce((sum, invoice) => sum + (invoice.ledger?.balanceDue ?? invoice.totals.total), 0)),
          detail: awaitingPayment.length ? "Invoices still need collection work." : "No invoices are waiting on payment collection.",
          target: { module: "payments", filterKey: "status", filterValue: "awaiting_payment" }
        },
        {
          key: "past-due",
          label: "Past Due invoices",
          count: pastDue.length,
          totalValue: roundMoney(pastDue.reduce((sum, invoice) => sum + (invoice.ledger?.balanceDue ?? invoice.totals.total), 0)),
          detail: pastDue.length ? "Overdue balances need follow-up now." : "No invoice balances are past due.",
          target: { module: "payments", filterKey: "status", filterValue: "past_due" }
        }
    ];
    if (unassignedCaptureBatches.length) {
      queues.push({
          key: "unassigned-photo-batches",
          label: "Unassigned photo batches",
          count: unassignedCaptureBatches.length,
          detail: "Captured media is waiting in the decide-later inbox without a client assignment.",
          target: { module: "capture", filterKey: "status", filterValue: "unassigned" }
        });
    }
    return {
      role: input.access.role,
      queues,
      health: [
        {
          key: "job-value-week",
          label: "Job value this week",
          value: currency(currentWeekJobValue),
          delta: `${valueDelta >= 0 ? "+" : "-"}${currency(Math.abs(valueDelta))} vs last week`
        },
        {
          key: "visits-week",
          label: "Visits scheduled this week",
          value: String(currentWeekVisits.length),
          delta: `${visitDelta >= 0 ? "+" : "-"}${Math.abs(visitDelta)} vs last week`
        }
      ]
    };
  }

  private eventAllowedForAccess(event: BusEvent, access: AccessContext, context: TenantContext): boolean {
    if (access.role !== "TECHNICIAN") {
      return true;
    }
    const objectType = eventObjectType(event);
    if (objectType === "quotes" || objectType === "invoices" || objectType === "payments" || objectType === "requests") {
      return false;
    }
    const payload = recordOf(event.payload);
    const assignedJobs = assignedJobIdsForTechnician(context.visits, access.tenantUserId);
    const jobId = stringValue(payload, "jobId");
    if (jobId && assignedJobs.has(jobId)) {
      return true;
    }
    const invoiceId = stringValue(payload, "invoiceId");
    if (invoiceId) {
      const invoice = context.invoiceById.get(invoiceId);
      return Boolean(invoice?.jobId && assignedJobs.has(invoice.jobId));
    }
    const quoteId = stringValue(payload, "quoteId");
    if (quoteId) {
      const relatedJob = context.jobs.find((job) => job.quoteId === quoteId);
      return Boolean(relatedJob && assignedJobs.has(relatedJob.id));
    }
    return false;
  }

  private activityEntryForEvent(event: BusEvent, context: TenantContext, referenceTime = now()): ActivityEntry | null {
    const payload = recordOf(event.payload);
    const target = eventObjectId(event);
    if (!target) {
      return null;
    }
    const objectType = eventObjectType(event);
    const request = stringValue(payload, "requestId") ? context.requestById.get(stringValue(payload, "requestId")!) : undefined;
    const quote = stringValue(payload, "quoteId") ? context.quoteById.get(stringValue(payload, "quoteId")!) : undefined;
    const invoice = stringValue(payload, "invoiceId") ? context.invoiceById.get(stringValue(payload, "invoiceId")!) : undefined;
    const job = stringValue(payload, "jobId") ? context.jobById.get(stringValue(payload, "jobId")!) : undefined;
    let actor = "Office";
    let action: string = event.type;
    let reference = target.objectId;
    let title = target.objectId;
    let value: string | undefined;

    switch (event.type) {
      case "request.created":
        actor = stringValue(payload, "clientName") ?? request?.clientName ?? "Client";
        action = "submitted a request";
        reference = request?.clientName ?? actor;
        title = request?.subject ?? "Service request";
        break;
      case "request.converted_to_quote":
        actor = "Office";
        action = "converted a request to a quote";
        reference = quote?.number ?? quote?.id ?? target.objectId;
        title = quote?.title ?? request?.subject ?? "Quote";
        break;
      case "request.converted_to_job":
        actor = "Office";
        action = "converted a request to a job";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? request?.subject ?? "Job";
        break;
      case "quote.created":
        actor = actorLabel(stringValue(payload, "createdBy"), context.users);
        action = "created a quote";
        reference = quote?.number ?? quote?.id ?? target.objectId;
        title = quote?.title ?? "Quote";
        value = quote ? currency(quote.totals.total) : undefined;
        break;
      case "quote.sent":
        actor = "Office";
        action = "sent a quote";
        reference = quote?.number ?? quote?.id ?? target.objectId;
        title = quote?.title ?? "Quote";
        value = quote ? currency(quote.totals.total) : undefined;
        break;
      case "quote.viewed":
        actor = quote?.approvedBy ?? quote?.clientId ?? "Client";
        action = "viewed a quote";
        reference = quote?.number ?? quote?.id ?? target.objectId;
        title = quote?.title ?? "Quote";
        break;
      case "quote.signed":
        actor = stringValue(payload, "signerName") ?? "Client";
        action = "signed a quote";
        reference = quote?.number ?? quote?.id ?? target.objectId;
        title = quote?.title ?? "Quote";
        break;
      case "quote.approved":
        actor = actorLabel(stringValue(payload, "approvedBy"), context.users);
        action = "approved a quote";
        reference = quote?.number ?? quote?.id ?? target.objectId;
        title = quote?.title ?? "Quote";
        break;
      case "quote.deposit_paid":
        actor = "Client";
        action = "paid a quote deposit";
        reference = quote?.number ?? quote?.id ?? target.objectId;
        title = quote?.title ?? "Quote";
        value = numberValue(payload, "amount") !== undefined ? currency(numberValue(payload, "amount") ?? 0) : undefined;
        break;
      case "quote.converted_to_job":
        actor = "Office";
        action = "converted a quote to a job";
        reference = job?.number ?? quote?.number ?? target.objectId;
        title = job?.title ?? quote?.title ?? "Job";
        break;
      case "job.created":
        actor = actorLabel(stringValue(payload, "createdBy"), context.users);
        action = "created a job";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? stringValue(payload, "title") ?? "Job";
        value = job ? currency(job.totals.total) : undefined;
        break;
      case "visit.booked":
        actor = "Office";
        action = "scheduled a visit";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? "Job";
        break;
      case "visit.booking_confirmation_sent":
        actor = "Office";
        action = "sent a booking confirmation";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? "Job";
        break;
      case "visit.completed":
        actor = actorLabel(stringValue(payload, "completedBy"), context.users);
        action = "completed a visit";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? "Job";
        break;
      case "visit.confirmed":
        actor = "Client";
        action = "confirmed an appointment";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? "Appointment";
        break;
      case "job.state_changed":
        actor = "System";
        action = stringValue(payload, "reason") === "visit_rescheduled" ? "rescheduled a visit" : "updated job state";
        reference = job?.number ?? "Job";
        title = job?.title ?? "Job";
        break;
      case "job.closed":
        actor = actorLabel(stringValue(payload, "closedBy"), context.users);
        action = "closed a job";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? "Job";
        break;
      case "job.requires_invoicing_cleared":
        actor = "Office";
        action = "cleared a requires-invoicing reminder";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? "Job";
        break;
      case "invoice.reminder_due":
        actor = "System";
        action = "raised an invoice reminder";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? "Job";
        break;
      case "invoice.created":
        actor = "Office";
        action = "created an invoice";
        reference = invoice?.number ?? invoice?.id ?? target.objectId;
        title = invoice?.title ?? "Invoice";
        value = invoice ? currency(invoice.totals.total) : undefined;
        break;
      case "invoice.sent":
        actor = "Office";
        action = "sent an invoice";
        reference = invoice?.number ?? invoice?.id ?? target.objectId;
        title = invoice?.title ?? "Invoice";
        value = invoice ? currency(invoice.ledger?.balanceDue ?? invoice.totals.total) : undefined;
        break;
      case "invoice.paid":
        actor = "Payment rail";
        action = "marked an invoice paid";
        reference = invoice?.number ?? invoice?.id ?? target.objectId;
        title = invoice?.title ?? "Invoice";
        value = invoice ? currency(invoice.totals.total) : undefined;
        break;
      case "payment.created":
        actor = "Payment rail";
        action = "recorded a payment";
        reference = invoice?.number ?? quote?.number ?? target.objectId;
        title = invoice?.title ?? quote?.title ?? "Payment";
        value = numberValue(payload, "amount") !== undefined ? currency(numberValue(payload, "amount") ?? 0) : undefined;
        break;
      case "payment.failed":
        actor = "Payment rail";
        action = "recorded a failed payment";
        reference = invoice?.number ?? target.objectId;
        title = invoice?.title ?? "Payment";
        value = numberValue(payload, "amount") !== undefined ? currency(numberValue(payload, "amount") ?? 0) : undefined;
        break;
      case "portal.link_sent":
        actor = actorLabel(stringValue(payload, "actorId"), context.users) || "Office";
        action = "sent a portal link";
        reference = stringValue(payload, "clientId") ?? target.objectId;
        title = "Client hub";
        break;
      case "portal.session_started":
        actor = "Client";
        action = "opened the client hub";
        reference = stringValue(payload, "clientId") ?? target.objectId;
        title = "Client hub";
        break;
      case "statement.sent":
        actor = actorLabel(stringValue(payload, "actorId"), context.users);
        action = "sent a client statement";
        reference = stringValue(payload, "clientId") ?? target.objectId;
        title = "Client statement";
        break;
      case "review.sequence_started":
        actor = "System";
        action = "started a review follow-up sequence";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? "Review follow-up";
        break;
      case "review.sequence_step_sent":
        actor = "System";
        action = "sent a review follow-up";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? "Review follow-up";
        break;
      case "review.sequence_stopped":
        actor = stringValue(payload, "stopReason") === "opt_out" ? "Client" : "Office";
        action = "stopped a review follow-up";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? "Review follow-up";
        break;
      case "review.marked":
        actor = "Office";
        action = "marked a review complete";
        reference = job?.number ?? job?.id ?? target.objectId;
        title = job?.title ?? "Review follow-up";
        break;
      case "refund.created":
        actor = "Office";
        action = "issued a refund";
        reference = invoice?.number ?? target.objectId;
        title = invoice?.title ?? "Refund";
        value = numberValue(payload, "amount") !== undefined ? currency(numberValue(payload, "amount") ?? 0) : undefined;
        break;
      case "invoice.voided":
        actor = "Office";
        action = "voided an invoice";
        reference = invoice?.number ?? invoice?.id ?? target.objectId;
        title = invoice?.title ?? "Invoice";
        break;
      case "invoice.bad_debt":
        actor = "Office";
        action = "wrote off an invoice as bad debt";
        reference = invoice?.number ?? invoice?.id ?? target.objectId;
        title = invoice?.title ?? "Invoice";
        break;
      case "receipt.review_created":
        actor = "Payment rail";
        action = "created a receipt review";
        reference = invoice?.number ?? target.objectId;
        title = invoice?.title ?? "Receipt review";
        break;
      default:
        actor = "System";
        action = event.type.replaceAll(".", " ");
        reference = target.objectId;
        title = target.objectId;
        break;
    }

    return {
      id: `activity_${event.id}`,
      eventId: event.id,
      type: event.type,
      objectType,
      actor,
      action,
      reference,
      title,
      ...(value ? { value } : {}),
      occurredAt: event.ts,
      relativeTime: relativeTime(event.ts, referenceTime),
      target
    };
  }

  async getDocumentationActivity(input: {
    access: AccessContext;
    from?: string | undefined;
    to?: string | undefined;
    referenceTime?: string | undefined;
  }): Promise<DocumentationActivitySnapshot> {
    const referenceTime = input.referenceTime ?? now();
    const range = {
      from: input.from ?? startOfWeekIso(referenceTime),
      to: input.to ?? referenceTime
    };
    const context = await this.buildContext(input.access.tenantId, referenceTime);
    const users = context.users.filter((user) => user.active && user.role === "TECHNICIAN");
    const visibleUsers = input.access.role === "TECHNICIAN"
      ? users.filter((user) => user.id === input.access.tenantUserId || user.authUid === input.access.tenantUserId)
      : users;
    const rowByUserId = new Map<string, DocumentationActivityRow>(
      visibleUsers.map((user) => [
        user.id,
        {
          tenantUserId: user.id,
          displayName: user.displayName,
          role: user.role,
          photoUploads: 0,
          completedChecklists: 0,
          totalDocumentationEvents: 0
        }
      ])
    );
    const userKeys = new Map<string, string>();
    for (const user of visibleUsers) {
      userKeys.set(user.id, user.id);
      if (user.authUid) {
        userKeys.set(user.authUid, user.id);
      }
    }
    const events = await this.deps.eventBus.listEvents({
      tenantId: input.access.tenantId,
      limit: 250
    });
    for (const event of events) {
      if (!withinIsoRange(event.ts, range)) {
        continue;
      }
      const payload = recordOf(event.payload);
      const actorKey = event.type === "media.uploaded"
        ? stringValue(payload, "capturedBy")
        : event.type === "checklist.completed"
          ? stringValue(payload, "completedBy")
          : undefined;
      if (!actorKey) {
        continue;
      }
      const tenantUserId = userKeys.get(actorKey);
      if (!tenantUserId) {
        continue;
      }
      const current = rowByUserId.get(tenantUserId);
      if (!current) {
        continue;
      }
      if (event.type === "media.uploaded") {
        current.photoUploads += 1;
      }
      if (event.type === "checklist.completed") {
        current.completedChecklists += 1;
      }
      current.totalDocumentationEvents += 1;
      current.lastOccurredAt = current.lastOccurredAt
        ? (current.lastOccurredAt > event.ts ? current.lastOccurredAt : event.ts)
        : event.ts;
    }
    const rows = [...rowByUserId.values()]
      .sort((left, right) => {
        if (right.totalDocumentationEvents !== left.totalDocumentationEvents) {
          return right.totalDocumentationEvents - left.totalDocumentationEvents;
        }
        return left.displayName.localeCompare(right.displayName);
      });
    return {
      from: range.from,
      to: range.to,
      rows
    };
  }

  async getActivityFeed(input: {
    access: AccessContext;
    objectType?: ActivityFilter | undefined;
    limit?: number | undefined;
    referenceTime?: string | undefined;
  }): Promise<ActivityEntry[]> {
    const referenceTime = input.referenceTime ?? now();
    const context = await this.buildContext(input.access.tenantId, referenceTime);
    const events = await this.deps.eventBus.listEvents({
      tenantId: input.access.tenantId,
      limit: input.limit ?? 80
    });
    return events
      .filter((event) => this.eventAllowedForAccess(event, input.access, context))
      .map((event) => this.activityEntryForEvent(event, context, referenceTime))
      .filter((entry): entry is ActivityEntry => Boolean(entry))
      .filter((entry) => !input.objectType || entry.objectType === input.objectType)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }

  private notificationEntryFromAlert(alert: JobActionAlertRecord, context: TenantContext, referenceTime: string): NotificationEntry | null {
    const job = context.jobById.get(alert.jobId);
    if (!job || alert.status !== "pending") {
      return null;
    }
    return {
      id: `alert:${alert.id}`,
      kind: "alert",
      unread: true,
      title: "Final visit completed",
      body: `${job.title} is waiting for Close, Invoice, or Close and Invoice.`,
      occurredAt: alert.createdAt,
      relativeTime: relativeTime(alert.createdAt, referenceTime),
      target: { module: "jobs", objectId: job.id }
    };
  }

  private notificationEntryFromEvent(event: BusEvent, context: TenantContext, referenceTime: string): NotificationEntry | null {
    if (!notificationEventTypes().has(event.type)) {
      return null;
    }
    const activity = this.activityEntryForEvent(event, context, referenceTime);
    if (!activity) {
      return null;
    }
    const title = event.type === "request.created"
      ? "New request submitted"
      : event.type === "quote.viewed"
        ? "Quote viewed"
        : event.type === "quote.approved"
          ? "Quote approved"
          : event.type === "quote.deposit_paid"
            ? "Deposit paid"
            : event.type === "visit.confirmed"
              ? "Appointment confirmed"
              : event.type === "review.marked"
                ? "Review marked complete"
            : event.type === "payment.failed"
              ? "Payment failed"
              : "Payment received";
    return {
      id: `event:${event.id}`,
      kind: "event",
      unread: true,
      title,
      body: `${activity.actor} ${activity.action} for ${activity.reference}.`,
      occurredAt: activity.occurredAt,
      relativeTime: activity.relativeTime,
      target: activity.target
    };
  }

  async getNotifications(input: {
    access: AccessContext;
    limit?: number | undefined;
    referenceTime?: string | undefined;
  }): Promise<{ unreadCount: number; notifications: NotificationEntry[] }> {
    const referenceTime = input.referenceTime ?? now();
    const context = await this.buildContext(input.access.tenantId, referenceTime);
    const readStates = await this.deps.notificationStateRepository.listReadStates(input.access.tenantId, input.access.tenantUserId);
    const readIds = new Set(readStates.map((record) => record.notificationId));
    const events = await this.deps.eventBus.listEvents({
      tenantId: input.access.tenantId,
      limit: input.limit ?? 80
    });
    const eventNotifications = events
      .filter((event) => this.eventAllowedForAccess(event, input.access, context))
      .map((event) => this.notificationEntryFromEvent(event, context, referenceTime))
      .filter((entry): entry is NotificationEntry => Boolean(entry));
    const alertNotifications = input.access.role === "TECHNICIAN"
      ? []
      : context.alerts
          .map((alert) => this.notificationEntryFromAlert(alert, context, referenceTime))
          .filter((entry): entry is NotificationEntry => Boolean(entry));
    const notifications = [...eventNotifications, ...alertNotifications]
      .map((entry) => ({ ...entry, unread: !readIds.has(entry.id) }))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, input.limit ?? 25);
    return {
      unreadCount: notifications.filter((entry) => entry.unread).length,
      notifications
    };
  }

  async markNotificationRead(input: { access: AccessContext; notificationId: string; readAt?: string | undefined }): Promise<void> {
    await this.deps.notificationStateRepository.markRead({
      tenantId: input.access.tenantId,
      tenantUserId: input.access.tenantUserId,
      notificationId: input.notificationId,
      readAt: input.readAt ?? now()
    });
  }

  async markAllNotificationsRead(input: { access: AccessContext; readAt?: string | undefined }): Promise<number> {
    const current = await this.getNotifications({ access: input.access, limit: 100 });
    const unreadIds = current.notifications.filter((entry) => entry.unread).map((entry) => entry.id);
    if (unreadIds.length === 0) {
      return 0;
    }
    await this.deps.notificationStateRepository.markReadMany({
      tenantId: input.access.tenantId,
      tenantUserId: input.access.tenantUserId,
      notificationIds: unreadIds,
      readAt: input.readAt ?? now()
    });
    return unreadIds.length;
  }
}
