import { z } from "zod";
import { RailError, type ApprovalQueueService, type Client, type CRMProvider, type Invoice, type Job, type Quote, type ServiceRequest, type Source, type Tenant } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { CommsRail } from "../../../comms/gmailRegistry.js";
import type { AccessContext } from "../../../auth/accessContext.js";
import type { PlatformRepository } from "../../../platform/repository.js";
import type { JobLifecycleService } from "../areas/jobs/components/jobCore/server/jobLifecycleService.js";
import type { LedgerService } from "../areas/invoices/components/paymentRails/server/ledgerService.js";
import type { OperationsHubService } from "../areas/home/components/operationsHub/server/operationsHubService.js";
import type { PortalHubService } from "../../nexportal/components/portalCore/server/portalHubService.js";
import type { ReviewSequenceService } from "../../../reputation/reviewSequenceService.js";
import { availableRequestFields, buildServiceRequest, defaultRequestForms, ensureRequestForms, notifyRequestCreated } from "../areas/requests/components/requestCore/server/requestFoundation.js";
import { ensureQuoteConfiguration, materializeQuoteRecord, quoteComposerInputSchema, quotePreviewBody } from "../areas/quotes/components/quoteEngine/domain/quoteFoundation.js";
import type { createQuoteToolInputSchema } from "../areas/quotes/components/quoteEngine/server/toolSchemas.js";
import { getActivityFeedInputSchema, getHomeQueuesInputSchema, getScheduleInputSchema } from "../areas/home/components/operationsHub/server/toolSchemas.js";
import type { createRequestToolInputSchema } from "../areas/requests/components/requestCore/server/toolSchemas.js";
import type { createJobToolInputSchema, getJobDetailInputSchema, jobActionToolInputSchema } from "../areas/jobs/components/jobCore/server/toolSchemas.js";
import type { scheduleJobVisitsToolInputSchema, shiftJobVisitSeriesToolInputSchema } from "../areas/visits/components/visitCore/server/toolSchemas.js";
import type { reviewSequenceActionInputSchema } from "../../../reputation/reviewSequenceToolSchemas.js";
import type { workspaceRoleSchema } from "../shared/tools/workspaceAccessSchemas.js";


interface InvoiceReadableProvider extends CRMProvider {
  getInvoices?: () => Promise<Invoice[]>;
}

export interface CrmReadToolOptions {
  requestRepository?: NativeCrmRepository | undefined;
  platformRepository?: Pick<PlatformRepository, "listTenantUsers"> | undefined;
  commsRail?: CommsRail | undefined;
  jobLifecycleService?: JobLifecycleService | undefined;
  ledgerService?: Pick<LedgerService, "listInvoices"> | undefined;
  operationsHubService?: OperationsHubService | undefined;
  portalHubService?: PortalHubService | undefined;
  reviewSequenceService?: ReviewSequenceService | undefined;
}

function source(ref: string, label: string, rail: Source["rail"] = "native"): Source {
  return { rail, ref, label };
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultRange(): { from: string; to: string } {
  return { from: "1970-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" };
}

function isoRangeForDay(day: string): { from: string; to: string } {
  return {
    from: `${day}T00:00:00.000Z`,
    to: `${day}T23:59:59.999Z`
  };
}

function shiftIso(value: string, deltaMs: number): string {
  const next = new Date(new Date(value).getTime() + deltaMs);
  return next.toISOString();
}


function slugifyToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "item";
}

async function resolveTenantUser(
  tenantId: string,
  platformRepository: Pick<PlatformRepository, "listTenantUsers"> | undefined,
  input: { tenantUserId?: string | undefined; tenantUserQuery?: string | undefined; role?: z.infer<typeof workspaceRoleSchema> | undefined }
): Promise<{ tenantUserId: string; role: z.infer<typeof workspaceRoleSchema> } | null> {
  if (!platformRepository) {
    if (input.tenantUserId?.trim()) {
      return {
        tenantUserId: input.tenantUserId.trim(),
        role: input.role ?? "OWNER"
      };
    }
    return input.role ? { tenantUserId: "nexi", role: input.role } : null;
  }
  const users = await platformRepository.listTenantUsers(tenantId);
  if (input.tenantUserId?.trim()) {
    const user = users.find((entry) => entry.id === input.tenantUserId?.trim());
    if (!user) {
      throw new RailError(`Tenant user ${input.tenantUserId} was not found.`, { provider: "native", op: "resolveTenantUser", status: 404 });
    }
    return { tenantUserId: user.id, role: input.role ?? user.role };
  }
  if (input.tenantUserQuery?.trim()) {
    const needle = normalized(input.tenantUserQuery);
    const matches = users.filter((user) =>
      [user.displayName, user.email, user.role]
        .filter(Boolean)
        .some((value) => normalized(String(value)).includes(needle))
    );
    if (matches.length !== 1) {
      throw new RailError("I need one exact team member match before I can scope that workspace view.", {
        provider: "native",
        op: "resolveTenantUser",
        status: 400
      });
    }
    return { tenantUserId: matches[0]!.id, role: input.role ?? matches[0]!.role };
  }
  const fallback = users.find((user) => user.role === "OWNER" && user.active) ?? users.find((user) => user.active) ?? users[0];
  return fallback ? { tenantUserId: fallback.id, role: input.role ?? fallback.role } : (input.role ? { tenantUserId: "nexi", role: input.role } : null);
}

async function resolveWorkspaceAccess(
  tenantId: string,
  options: CrmReadToolOptions,
  input: { tenantUserId?: string | undefined; tenantUserQuery?: string | undefined; role?: z.infer<typeof workspaceRoleSchema> | undefined }
): Promise<AccessContext> {
  const resolved = await resolveTenantUser(tenantId, options.platformRepository, input);
  return {
    tenantId,
    tenantUserId: resolved?.tenantUserId ?? "nexi",
    role: input.role ?? resolved?.role ?? "OWNER",
    accessKind: "internal"
  };
}

function catalogCodeSeed(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .map((segment) => segment.slice(0, 3))
    .join("-")
    || "CUSTOM";
}



async function queueQuoteCreateApproval(
  tenant: Tenant,
  input: z.infer<typeof createQuoteToolInputSchema>,
  provider: CRMProvider,
  repository: NativeCrmRepository,
  approvalQueue: ApprovalQueueService
): Promise<{
  approval: Awaited<ReturnType<ApprovalQueueService["create"]>>;
  pendingQuote: Quote;
  writesAreApprovalQueuedOnly: true;
}> {
  const clientId = await resolveExactClientId(provider, input.clientId, input.clientQuery, "createQuote");
  const quote = await materializeQuoteRecord(repository, {
    ...input,
    tenantId: tenant.id,
    clientId
  });
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "quote",
    preview: {
      title: `Create quote: ${quote.title}`,
      body: quotePreviewBody(quote)
    },
    execute: {
      service: "crm",
      op: "createQuote",
      args: {
        tenantId: tenant.id,
        quote: jsonClone(quote)
      }
    },
    createdBy: "nexi"
  });
  return {
    approval,
    pendingQuote: {
      ...quote,
      approvalId: approval.id,
      status: "pending_approval"
    },
    writesAreApprovalQueuedOnly: true
  };
}

async function resolveExactClientId(
  provider: CRMProvider,
  clientId: string | undefined,
  clientQuery: string | undefined,
  op: string
): Promise<string> {
  if (clientId) {
    return clientId;
  }
  if (clientQuery?.trim()) {
    const matches = await provider.getClients(clientQuery.trim());
    if (matches.length !== 1 || !exactOrStrongClientMatch(matches, clientQuery.trim())) {
      throw new RailError("I need one exact client match before I can save that. Give me the saved client name or client id.", {
        provider: "native",
        op,
        status: 400
      });
    }
    return matches[0]!.id;
  }
  throw new RailError("A client match is required before I can save that.", { provider: "native", op, status: 400 });
}

async function resolveReviewSequenceIdForAction(
  tenantId: string,
  input: z.infer<typeof reviewSequenceActionInputSchema>,
  reviewSequenceService: ReviewSequenceService,
  jobLifecycleService: JobLifecycleService
): Promise<string> {
  if (input.reviewSequenceId?.trim()) {
    return input.reviewSequenceId.trim();
  }
  const job = await resolveJobForAction(tenantId, { jobId: input.jobId, query: input.jobQuery }, jobLifecycleService);
  const status = await reviewSequenceService.listStatus(tenantId, { jobId: job.id });
  if (status.sequences.length !== 1) {
    throw new RailError("I need one exact review sequence for that job before I can continue.", {
      provider: "native",
      op: "reviewSequenceAction",
      status: 400
    });
  }
  return status.sequences[0]!.id;
}

async function queueJobCreateApproval(
  tenant: Tenant,
  input: z.infer<typeof createJobToolInputSchema>,
  provider: CRMProvider,
  repository: NativeCrmRepository,
  approvalQueue: ApprovalQueueService
): Promise<{
  approval: Awaited<ReturnType<ApprovalQueueService["create"]>>;
  pendingJob: {
    tenantId: string;
    clientId: string;
    propertyId?: string | undefined;
    requestId?: string | undefined;
    quoteId?: string | undefined;
    title: string;
    lineItems: NonNullable<Job["lineItems"]>;
    status: "pending_approval";
  };
  writesAreApprovalQueuedOnly: true;
}> {
  const clientId = await resolveExactClientId(provider, input.clientId, input.clientQuery, "createJob");
  const clientProperties = (await repository.listProperties(tenant.id)).filter((property) => property.clientId === clientId);
  const propertyId = input.propertyId ?? (clientProperties.length === 1 ? clientProperties[0]!.id : undefined);
  const lineItems = materializeJobLineItems(input.lineItems);
  const previewBody = [
    `Title: ${input.title}`,
    `Client id: ${clientId}`,
    propertyId ? `Property id: ${propertyId}` : "Property: not attached yet",
    input.requestId ? `Request link: ${input.requestId}` : "",
    input.quoteId ? `Quote link: ${input.quoteId}` : "",
    lineItems.length ? `Line items: ${lineItems.map((item) => `${item.name} x${item.quantity}`).join("; ")}` : "Line items: none yet",
    "Lifecycle starts at Unscheduled until a visit is booked."
  ].filter(Boolean).join("\n");
  const executeInput = {
    tenantId: tenant.id,
    clientId,
    ...(propertyId ? { propertyId } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.quoteId ? { quoteId: input.quoteId } : {}),
    title: input.title.trim(),
    lineItems,
    createdBy: "nexi"
  };
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "job",
    preview: {
      title: `Create job: ${executeInput.title}`,
      body: previewBody
    },
    execute: {
      service: "crm",
      op: "createJob",
      args: {
        tenantId: tenant.id,
        input: executeInput
      }
    },
    createdBy: "nexi"
  });
  return {
    approval,
    pendingJob: {
      ...executeInput,
      status: "pending_approval"
    },
    writesAreApprovalQueuedOnly: true
  };
}

async function resolveJobForAction(
  tenantId: string,
  input: z.infer<typeof jobActionToolInputSchema> | z.infer<typeof getJobDetailInputSchema>,
  jobLifecycleService: JobLifecycleService
) {
  if (input.jobId) {
    const detail = await jobLifecycleService.getJobDetail(tenantId, input.jobId);
    if (!detail) {
      throw new RailError(`Native job ${input.jobId} was not found.`, { provider: "native", op: "getJobDetail", status: 404 });
    }
    return detail;
  }
  const matches = (await jobLifecycleService.listJobs(tenantId)).filter((job) => jobMatchesQuery(job, input.query ?? ""));
  if (matches.length !== 1) {
    throw new RailError("I need one exact native job match before I can continue. Give me the job title, number, or job id.", {
      provider: "native",
      op: "getJobDetail",
      status: 400
    });
  }
  return (await jobLifecycleService.getJobDetail(tenantId, matches[0]!.id))!;
}

async function queueJobActionApproval(
  tenant: Tenant,
  input: z.infer<typeof jobActionToolInputSchema>,
  jobLifecycleService: JobLifecycleService,
  approvalQueue: ApprovalQueueService
): Promise<{
  approval: Awaited<ReturnType<ApprovalQueueService["create"]>>;
  preview: Awaited<ReturnType<JobLifecycleService["prepareJobActionPreview"]>>;
  writesAreApprovalQueuedOnly: true;
}> {
  const job = await resolveJobForAction(tenant.id, input, jobLifecycleService);
  const preview = await jobLifecycleService.prepareJobActionPreview(tenant.id, job.id, input.action);
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "job",
    preview: {
      title: preview.title,
      body: preview.body
    },
    execute: {
      service: "crm",
      op: "performJobAction",
      args: {
        tenantId: tenant.id,
        jobId: job.id,
        action: input.action
      }
    },
    createdBy: "nexi"
  });
  return {
    approval,
    preview,
    writesAreApprovalQueuedOnly: true
  };
}

async function resolveVisitAssignmentIds(
  tenantId: string,
  platformRepository: Pick<PlatformRepository, "listTenantUsers"> | undefined,
  input: { assignedTo?: string[] | undefined; assignedTeamQuery?: string | undefined }
): Promise<string[]> {
  if (input.assignedTo?.length) {
    return [...new Set(input.assignedTo.map((value) => value.trim()).filter(Boolean))];
  }
  if (!input.assignedTeamQuery?.trim()) {
    return [];
  }
  if (!platformRepository) {
    throw new RailError("Team-member resolution is not wired for this tenant yet.", { provider: "native", op: "resolveVisitAssignmentIds", status: 501 });
  }
  const users = await platformRepository.listTenantUsers(tenantId);
  const needle = normalized(input.assignedTeamQuery);
  const matches = users.filter((user) =>
    user.active
    && normalized([user.displayName, user.email, user.role].filter(Boolean).join(" ")).includes(needle)
  );
  if (matches.length !== 1) {
    throw new RailError("I need one exact team-member match before I can assign that visit.", {
      provider: "native",
      op: "resolveVisitAssignmentIds",
      status: 400
    });
  }
  return [matches[0]!.id];
}

function formatVisitPreviewMoment(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}-${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function activeScheduledVisit(visit: { status?: string | undefined }): boolean {
  return visit.status !== "complete" && visit.status !== "cancelled";
}

export async function queueScheduleJobVisitsApproval(
  tenant: Tenant,
  input: z.infer<typeof scheduleJobVisitsToolInputSchema>,
  jobLifecycleService: JobLifecycleService,
  approvalQueue: ApprovalQueueService,
  platformRepository: Pick<PlatformRepository, "listTenantUsers"> | undefined,
  requireUnscheduled = false
): Promise<{
  approval: Awaited<ReturnType<ApprovalQueueService["create"]>>;
  jobId: string;
  jobTitle: string;
  pendingVisits: Array<{ title?: string | undefined; start: string; end: string; assignedTo: string[]; details?: string | undefined }>;
  writesAreApprovalQueuedOnly: true;
}> {
  const job = await resolveJobForAction(tenant.id, { jobId: input.jobId, query: input.query }, jobLifecycleService);
  if (requireUnscheduled && job.status !== "Unscheduled") {
    throw new RailError(`${job.title} is ${job.status}, so it is not sitting in the Unscheduled queue right now.`, {
      provider: "native",
      op: "scheduleJobVisits",
      status: 400
    });
  }
  const tenantUsers = platformRepository ? await platformRepository.listTenantUsers(tenant.id) : [];
  const visits = await Promise.all(input.visits.map(async (visit) => ({
    ...(visit.title?.trim() ? { title: visit.title.trim() } : {}),
    start: visit.start,
    end: visit.end,
    assignedTo: await resolveVisitAssignmentIds(tenant.id, platformRepository, visit),
    ...(visit.details?.trim() ? { details: visit.details.trim() } : {})
  })));
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "job",
    preview: {
      title: `Schedule job visits: ${job.title}`,
      body: [
        `Job: ${job.title}${job.number ? ` (${job.number})` : ""}`,
        `Visit count: ${visits.length}`,
        ...visits.map((visit, index) => {
          const assignedLabel = visit.assignedTo
            .map((userId) => tenantUsers.find((user) => user.id === userId)?.displayName ?? userId)
            .join(", ");
          return `${index + 1}. ${formatVisitPreviewMoment(visit.start, visit.end)}${visit.title ? ` | ${visit.title}` : ""}${assignedLabel ? ` | assigned: ${assignedLabel}` : ""}${visit.details ? ` | ${visit.details}` : ""}`;
        })
      ].join("\n")
    },
    execute: {
      service: "crm",
      op: "scheduleJobVisitSeries",
      args: {
        tenantId: tenant.id,
        jobId: job.id,
        visits: jsonClone(visits)
      }
    },
    createdBy: "nexi"
  });
  return {
    approval,
    jobId: job.id,
    jobTitle: job.title,
    pendingVisits: visits,
    writesAreApprovalQueuedOnly: true
  };
}

async function resolveVisitShiftAnchor(
  tenantId: string,
  input: z.infer<typeof shiftJobVisitSeriesToolInputSchema>,
  jobLifecycleService: JobLifecycleService,
  operationsHubService: OperationsHubService | undefined,
  platformRepository: Pick<PlatformRepository, "listTenantUsers"> | undefined
): Promise<{ jobId: string; jobTitle: string; visitId: string; start: string; end: string; remainingCount: number }> {
  if (input.visitId?.trim() && operationsHubService) {
    const access = await resolveWorkspaceAccess(tenantId, { platformRepository }, {});
    const workspace = await operationsHubService.getScheduleWorkspace({
      access,
      from: defaultRange().from,
      to: defaultRange().to
    });
    const visit = workspace.visits.find((entry) => entry.id === input.visitId?.trim());
    if (visit) {
      const siblingCount = workspace.visits.filter((entry) => entry.jobId === visit.jobId && entry.start >= visit.start).length;
      return {
        jobId: visit.jobId,
        jobTitle: visit.jobTitle,
        visitId: visit.id,
        start: visit.start,
        end: visit.end,
        remainingCount: Math.max(0, siblingCount - 1)
      };
    }
  }
  const job = await resolveJobForAction(tenantId, { jobId: input.jobId, query: input.query }, jobLifecycleService);
  const anchor = job.visits
    .filter((visit) => activeScheduledVisit(visit))
    .sort((left, right) => left.start.localeCompare(right.start))
    .find((visit) => !input.anchorStart || visit.start === input.anchorStart || visit.start.startsWith(input.anchorStart));
  if (!anchor) {
    throw new RailError("I could not find a remaining scheduled visit to move on that job.", {
      provider: "native",
      op: "shiftJobVisitSeries",
      status: 404
    });
  }
  const remainingCount = job.visits.filter((visit) => activeScheduledVisit(visit) && visit.id !== anchor.id && visit.start >= anchor.start).length;
  return {
    jobId: job.id,
    jobTitle: job.title,
    visitId: anchor.id,
    start: anchor.start,
    end: anchor.end,
    remainingCount
  };
}

export async function queueShiftJobVisitSeriesApproval(
  tenant: Tenant,
  input: z.infer<typeof shiftJobVisitSeriesToolInputSchema>,
  jobLifecycleService: JobLifecycleService,
  operationsHubService: OperationsHubService | undefined,
  approvalQueue: ApprovalQueueService,
  platformRepository: Pick<PlatformRepository, "listTenantUsers"> | undefined
): Promise<{
  approval: Awaited<ReturnType<ApprovalQueueService["create"]>>;
  anchorVisitId: string;
  jobId: string;
  writesAreApprovalQueuedOnly: true;
}> {
  const anchor = await resolveVisitShiftAnchor(tenant.id, input, jobLifecycleService, operationsHubService, platformRepository);
  const deltaMs = ((input.shiftDays ?? 0) * 24 * 60 * 60 * 1000) + ((input.shiftHours ?? 0) * 60 * 60 * 1000);
  const nextStart = input.start ?? shiftIso(anchor.start, deltaMs);
  const nextEnd = input.end ?? shiftIso(anchor.end, deltaMs);
  const approval = await approvalQueue.create({
    tenantId: tenant.id,
    kind: "job",
    preview: {
      title: `Shift job visit series: ${anchor.jobTitle}`,
      body: [
        `Anchor visit: ${formatVisitPreviewMoment(anchor.start, anchor.end)}`,
        `New anchor window: ${formatVisitPreviewMoment(nextStart, nextEnd)}`,
        `Shift remaining visits: ${input.shiftRemaining ? "yes" : "no"}`,
        input.shiftRemaining ? `Remaining visits affected: ${anchor.remainingCount}` : "Remaining visits affected: 0"
      ].join("\n")
    },
    execute: {
      service: "crm",
      op: "moveJobVisitSeries",
      args: {
        tenantId: tenant.id,
        visitId: anchor.visitId,
        start: nextStart,
        end: nextEnd,
        shiftRemaining: input.shiftRemaining
      }
    },
    createdBy: "nexi"
  });
  return {
    approval,
    anchorVisitId: anchor.visitId,
    jobId: anchor.jobId,
    writesAreApprovalQueuedOnly: true
  };
}

function requestQueryValue(request: ServiceRequest, key: string): string | number | boolean | string[] | undefined {
  return request.intake.fieldIndex[key];
}

function findRequestFieldLabel(key: string): string {
  return availableRequestFields().find((field) => field.key === key)?.label ?? key;
}

function requestFieldText(request: ServiceRequest, key: string): string | undefined {
  const value = requestQueryValue(request, key);
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : undefined;
  }
  return typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
}

function quoteMatchesQuery(quote: Quote, query: string, clients: Client[]): boolean {
  const needle = normalized(query.trim());
  if (!needle) {
    return true;
  }
  const client = clients.find((candidate) => candidate.id === quote.clientId);
  return [
    quote.id,
    quote.number,
    quote.title,
    quote.status,
    client?.name,
    ...(client?.emails ?? []),
    ...(client?.phones ?? [])
  ].some((value) => normalized(String(value ?? "")).includes(needle));
}

function quoteSummary(quote: Quote, clients: Client[]): {
  id: string;
  number?: string | undefined;
  title: string;
  clientName: string;
  status: Quote["status"];
  total: number;
  expiresAt?: string | undefined;
  requestId?: string | undefined;
} {
  return {
    id: quote.id,
    ...(quote.number ? { number: quote.number } : {}),
    title: quote.title,
    clientName: clients.find((candidate) => candidate.id === quote.clientId)?.name ?? quote.clientId,
    status: quote.status,
    total: quote.totals.total,
    ...(quote.expiresAt ? { expiresAt: quote.expiresAt } : {}),
    ...(quote.requestId ? { requestId: quote.requestId } : {})
  };
}

function requestSource(ref: string, label: string): Source {
  return source(ref, label);
}

function simplifiedRequestQuery(value: string): string {
  return value
    .replace(/[?.!]+$/g, " ")
    .replace(/\b(?:is|what|tell|show|me|the|details?|request|pool|spa|gate|code|pet|name|combo|only|plus|and|or|losing|daily|water|loss)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requestMatchesQuery(request: ServiceRequest, query: string): boolean {
  const needles = [normalized(query), normalized(simplifiedRequestQuery(query))].filter(Boolean);
  return !needles.length || [
    request.clientName,
    request.subject,
    request.email,
    request.phone,
    request.narrative,
    ...request.intake.fieldValues.map((field) => `${field.label} ${String(field.value)}`)
  ]
    .filter(Boolean)
    .map((value) => normalized(String(value)))
    .some((value) => needles.some((needle) => value.includes(needle)));
}

function parseLooseCreateRequestInput(text: string): z.input<typeof createRequestToolInputSchema> {
  const email = text.match(/\b[\w.+-]+@[\w.-]+\.\w+\b/)?.[0];
  const phone = text.match(/(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}\b/)?.[0];
  const clientName = text.match(/\b(?:create|add|new)\s+(?:a\s+)?request\s+for\s+(.+?)(?=\s+(?:at|phone|email|pool|gate|pet|losing|issue|because|summary)\b|[.!?]|$)/i)?.[1]?.trim().replace(/[,\s]+$/g, "");
  const explicitAddress = text.match(/\b(\d+\s+[a-z0-9.' -]+,\s*[^,]+,\s*[a-z]{2}\s+\d{5}(?:-\d{4})?)\b/i)?.[1]?.trim();
  const address = explicitAddress ?? text.match(/\bat\s+(.+?)(?=\s+(?:phone|email|pool|gate|pet|losing|issue|summary)\b|[.!?]|$)/i)?.[1]?.trim();
  const poolConfiguration = /\b(?:pool\s*\+\s*spa|pool\s+and\s+spa|pool\/spa|combo)\b/i.test(text)
    ? "pool_and_spa"
    : /\bspa\s+only\b/i.test(text)
      ? "spa_only"
      : /\bpool\s+only\b/i.test(text)
        ? "pool_only"
        : undefined;
  const poolType = text.match(/\b(vinyl|fiberglass|gunite|plaster|commercial|residential|custom)\b/i)?.[1]?.toLowerCase();
  const gateCode = text.match(/\bgate\s+code\s+(?:is|=|:)?\s*([a-z0-9-]+)/i)?.[1];
  const petName = text.match(/\bpet\s+(?:name\s+is|named)\s+([a-z0-9' -]+)/i)?.[1]?.trim();
  const petPresent = /\bpet\b/i.test(text) ? true : undefined;
  const waterLossRate = text.match(/\b(?:losing|loss(?:ing)?\s+about|water\s+loss(?:\s+is)?)\s+(.+?)(?=\s+(?:a\s+day|daily|per\s+day)\b|[.!?]|$)/i)?.[1]?.trim();
  return {
    rawText: text,
    ...(clientName ? { clientName } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(address ? { address } : {}),
    ...(poolConfiguration ? { poolConfiguration } : {}),
    ...(poolType ? { poolType } : {}),
    ...(gateCode ? { gateCode } : {}),
    ...(petPresent !== undefined ? { petPresent } : {}),
    ...(petName ? { petName } : {}),
    ...(waterLossRate ? { waterLossRate } : {}),
    issueSummary: text.trim()
  };
}

function mergedCreateRequestInput(input: z.infer<typeof createRequestToolInputSchema>): z.infer<typeof createRequestToolInputSchema> {
  const loose = input.rawText.trim() ? parseLooseCreateRequestInput(input.rawText) : { rawText: input.rawText };
  return {
    rawText: input.rawText.trim() || loose.rawText || "",
    clientName: input.clientName ?? loose.clientName,
    email: input.email ?? loose.email,
    phone: input.phone ?? loose.phone,
    address: input.address ?? loose.address,
    poolConfiguration: input.poolConfiguration ?? loose.poolConfiguration,
    poolType: input.poolType ?? loose.poolType,
    gateCode: input.gateCode ?? loose.gateCode,
    petPresent: input.petPresent ?? loose.petPresent,
    petName: input.petName ?? loose.petName,
    waterLossRate: input.waterLossRate ?? loose.waterLossRate,
    issueSummary: input.issueSummary ?? loose.issueSummary
  };
}

function groupJobs(jobs: Job[]): Record<Job["status"], number> {
  return jobs.reduce<Record<Job["status"], number>>((groups, job) => {
    groups[job.status] = (groups[job.status] ?? 0) + 1;
    return groups;
  }, {
    Upcoming: 0,
    Today: 0,
    Late: 0,
    Unscheduled: 0,
    "Action Required": 0,
    "Requires Invoicing": 0,
    Archived: 0
  });
}

function jobMatchesQuery(job: {
  id: string;
  number?: string | undefined;
  title: string;
  status: string;
  client?: Client | undefined;
  property?: { label?: string | undefined; siteName?: string | undefined; address?: { street1?: string | undefined; city?: string | undefined } } | undefined;
}, query: string): boolean {
  const needle = normalized(query);
  if (!needle) {
    return true;
  }
  const values = [
    job.id,
    job.number ?? "",
    job.title,
    job.status,
    job.client?.name ?? "",
    job.client?.company ?? "",
    job.property?.label ?? "",
    job.property?.siteName ?? "",
    job.property?.address?.street1 ?? "",
    job.property?.address?.city ?? ""
  ].map(normalized).filter(Boolean);
  return values.some((value) => value === needle || value.includes(needle));
}

function materializeJobLineItems(items: z.infer<typeof createJobToolInputSchema>["lineItems"]): NonNullable<Job["lineItems"]> {
  return (items ?? []).map((item, index) => {
    const quantity = item.quantity ?? 1;
    const unitPrice = item.unitPrice ?? 0;
  return {
      id: `job_line_${index + 1}`,
      source: item.kind === "catalog" ? "catalog" : "custom",
      ...(item.catalogCode ? { catalogCode: item.catalogCode } : {}),
      code: item.code?.trim() || `LINE-${index + 1}`,
      name: item.name.trim(),
      ...(item.description?.trim() ? { description: item.description.trim() } : {}),
      quantity,
      unitPrice,
      total: Number((quantity * unitPrice).toFixed(2)),
      ...(item.taxable !== undefined ? { taxable: item.taxable } : {}),
      clientSelectable: false,
      defaultSelected: true
    };
  });
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function exactOrStrongClientMatch(clients: Client[], query: string): boolean {
  const needle = normalized(query);
  return !needle || clients.some((client) => {
    const contactValues = (client.contacts ?? []).flatMap((contact) => [
      contact.personName?.firstName,
      contact.personName?.lastName,
      contact.company,
      contact.role,
      ...contact.emails.map((email) => email.value),
      ...contact.phones.map((phone) => phone.value)
    ]);
    const values = [
      client.name,
      client.company ?? "",
      client.personName?.firstName ?? "",
      client.personName?.lastName ?? "",
      ...client.emails,
      ...client.phones,
      ...contactValues
    ].filter((value): value is string => Boolean(value)).map(normalized).filter(Boolean);
    return values.some((value) => value === needle || value.includes(needle));
  });
}

function dedupeClients(clients: Client[]): Client[] {
  const seen = new Set<string>();
  return clients.filter((client) => {
    if (seen.has(client.id)) return false;
    seen.add(client.id);
    return true;
  });
}

export function createCrmToolContext(
  provider: CRMProvider,
  approvalQueue: ApprovalQueueService | undefined,
  options: CrmReadToolOptions = {}
) {
  const readable = provider as InvoiceReadableProvider;
    const readScheduleWorkspace = async (tenant: Tenant, args: unknown) => {
      if (!options.operationsHubService) {
        throw new RailError("Native schedule workspace tools are not wired for this tenant yet.", { provider: "native", op: "getSchedule", status: 501 });
      }
      const input = getScheduleInputSchema.parse(args);
      const access = await resolveWorkspaceAccess(tenant.id, options, input);
      const dayRange = input.day?.trim() ? isoRangeForDay(input.day.trim()) : null;
      const teamMemberIds = input.teamMemberIds?.length
        ? input.teamMemberIds
        : input.teamMemberQuery?.trim()
          ? [(await resolveTenantUser(tenant.id, options.platformRepository, { tenantUserQuery: input.teamMemberQuery }))?.tenantUserId ?? ""].filter(Boolean)
          : undefined;
      const workspace = await options.operationsHubService.getScheduleWorkspace({
        access,
        from: input.from ?? dayRange?.from,
        to: input.to ?? dayRange?.to,
        teamMemberIds,
      });
      return {
        result: {
          from: input.from ?? dayRange?.from ?? null,
          to: input.to ?? dayRange?.to ?? null,
          visits: workspace.visits,
          unscheduledJobs: input.includeUnscheduled ? workspace.unscheduledJobs : [],
          teamMembers: workspace.teamMembers
        },
        sources: [
          source("schedule-workspace", "Native schedule workspace"),
          ...workspace.visits.slice(0, 10).map((visit) => source(visit.id, `Scheduled visit ${visit.jobTitle}`))
        ]
      };
    };
    const readActivityFeed = async (tenant: Tenant, args: unknown) => {
      if (!options.operationsHubService) {
        throw new RailError("Native activity tools are not wired for this tenant yet.", { provider: "native", op: "getActivityFeed", status: 501 });
      }
      const input = getActivityFeedInputSchema.parse(args);
      const access = await resolveWorkspaceAccess(tenant.id, options, input);
      const activity = await options.operationsHubService.getActivityFeed({
        access,
        ...(input.objectType ? { objectType: input.objectType } : {}),
        limit: input.limit
      });
      return {
        result: { activity },
        sources: activity.length
          ? activity.slice(0, 20).map((entry) => source(entry.eventId, `${entry.actor} ${entry.action}`))
          : [source("activity-feed", "Native activity feed")]
      };
    };
    const readHomeQueues = async (tenant: Tenant, args: unknown) => {
      if (!options.operationsHubService) {
        throw new RailError("Native home queue tools are not wired for this tenant yet.", { provider: "native", op: "getHomeQueues", status: 501 });
      }
      const input = getHomeQueuesInputSchema.parse(args);
      const access = await resolveWorkspaceAccess(tenant.id, options, input);
      const snapshot = await options.operationsHubService.getHomeSnapshot({ access });
      return {
        result: snapshot,
        sources: [source("home-queues", "Native home status queues")]
      };
    };

  return {
    RailError,
    activeScheduledVisit,
    approvalQueue: approvalQueue as ApprovalQueueService,
    availableRequestFields,
    buildServiceRequest,
    catalogCodeSeed,
    defaultRange,
    defaultRequestForms,
    dedupeClients,
    ensureQuoteConfiguration,
    ensureRequestForms,
    findRequestFieldLabel,
    formatVisitPreviewMoment,
    groupJobs,
    isoRangeForDay,
    jobMatchesQuery,
    jsonClone,
    materializeJobLineItems,
    materializeQuoteRecord,
    mergedCreateRequestInput,
    notifyRequestCreated,
    normalized,
    options,
    parseLooseCreateRequestInput,
    provider,
    queueJobActionApproval,
    queueJobCreateApproval,
    queueQuoteCreateApproval,
    queueScheduleJobVisitsApproval,
    queueShiftJobVisitSeriesApproval,
    quoteComposerInputSchema,
    quoteMatchesQuery,
    quotePreviewBody,
    quoteSummary,
    readActivityFeed,
    readHomeQueues,
    readScheduleWorkspace,
    readable,
    requestFieldText,
    requestMatchesQuery,
    requestQueryValue,
    requestSource,
    resolveExactClientId,
    resolveJobForAction,
    resolveReviewSequenceIdForAction,
    resolveTenantUser,
    resolveVisitAssignmentIds,
    resolveVisitShiftAnchor,
    resolveWorkspaceAccess,
    shiftIso,
    simplifiedRequestQuery,
    slugifyToken,
    source,
    z,
  };
}

export type CrmToolContext = ReturnType<typeof createCrmToolContext>;
