import { z } from "zod";
import { RailError, type ApprovalQueueService, type Client, type CRMProvider, type Invoice, type Job, type ServiceRequest, type Source, type Tenant } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { CommsRail } from "../../../comms/gmailRegistry.js";
import type { PlatformRepository } from "../../../platform/repository.js";
import type { JobLifecycleService } from "../areas/jobs/components/jobCore/server/jobLifecycleService.js";
import type { LedgerService } from "../areas/invoices/components/paymentRails/server/ledgerService.js";
import type { OperationsHubService } from "../areas/home/components/operationsHub/server/operationsHubService.js";
import type { PortalHubService } from "../../nexportal/components/portalCore/server/portalHubService.js";
import type { ReviewSequenceService } from "../../../reputation/reviewSequenceService.js";
import { availableRequestFields, buildServiceRequest, defaultRequestForms, ensureRequestForms, notifyRequestCreated } from "../areas/requests/components/requestCore/server/requestFoundation.js";
import { ensureQuoteConfiguration, quoteComposerInputSchema, quotePreviewBody } from "../areas/quotes/components/quoteEngine/domain/quoteFoundation.js";
import { getActivityFeedInputSchema, getHomeQueuesInputSchema, getScheduleInputSchema } from "../areas/home/components/operationsHub/server/toolSchemas.js";
import type { createRequestToolInputSchema } from "../areas/requests/components/requestCore/server/toolSchemas.js";
import type { reviewSequenceActionInputSchema } from "../../../reputation/reviewSequenceToolSchemas.js";
import { resolveExactClientId } from "../shared/tools/clientResolution.js";
import { resolveJobForAction } from "../areas/jobs/components/jobCore/server/toolSupport.js";
import { defaultWorkspaceRange, resolveTenantUser, resolveWorkspaceAccess, workspaceRangeForDay } from "../shared/tools/workspaceAccess.js";


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


function slugifyToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "item";
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

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
      const access = await resolveWorkspaceAccess(tenant.id, options.platformRepository, input);
      const dayRange = input.day?.trim() ? workspaceRangeForDay(input.day.trim()) : null;
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
      const access = await resolveWorkspaceAccess(tenant.id, options.platformRepository, input);
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
      const access = await resolveWorkspaceAccess(tenant.id, options.platformRepository, input);
      const snapshot = await options.operationsHubService.getHomeSnapshot({ access });
      return {
        result: snapshot,
        sources: [source("home-queues", "Native home status queues")]
      };
    };

  return {
    RailError,
    approvalQueue: approvalQueue as ApprovalQueueService,
    availableRequestFields,
    buildServiceRequest,
    catalogCodeSeed,
    defaultRange: defaultWorkspaceRange,
    defaultRequestForms,
    dedupeClients,
    ensureQuoteConfiguration,
    ensureRequestForms,
    findRequestFieldLabel,
    groupJobs,
    jsonClone,
    mergedCreateRequestInput,
    notifyRequestCreated,
    normalized,
    options,
    parseLooseCreateRequestInput,
    provider,
    quoteComposerInputSchema,
    quotePreviewBody,
    readActivityFeed,
    readHomeQueues,
    readScheduleWorkspace,
    readable,
    requestFieldText,
    requestMatchesQuery,
    requestQueryValue,
    requestSource,
    resolveExactClientId,
    resolveReviewSequenceIdForAction,
    resolveTenantUser,
    resolveWorkspaceAccess,
    simplifiedRequestQuery,
    slugifyToken,
    source,
    z,
  };
}

export type CrmToolContext = ReturnType<typeof createCrmToolContext>;
