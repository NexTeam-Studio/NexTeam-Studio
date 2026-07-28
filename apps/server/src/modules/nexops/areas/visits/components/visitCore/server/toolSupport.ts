import { RailError, type ApprovalQueueService, type Tenant } from "@nexteam/core";
import type { z } from "zod";
import type { PlatformRepository } from "../../../../../../../platform/repository.js";
import type { OperationsHubService } from "../../../../home/components/operationsHub/server/operationsHubService.js";
import { resolveJobForAction } from "../../../../jobs/components/jobCore/server/toolSupport.js";
import { defaultWorkspaceRange, resolveWorkspaceAccess } from "../../../../../shared/tools/workspaceAccess.js";
import type { JobLifecycleService } from "../../../../jobs/components/jobCore/server/jobLifecycleService.js";
import type { scheduleJobVisitsToolInputSchema, shiftJobVisitSeriesToolInputSchema } from "./toolSchemas.js";

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function shiftIso(value: string, deltaMs: number): string {
  return new Date(new Date(value).getTime() + deltaMs).toISOString();
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
  const matches = users.filter((user) => user.active && normalized([user.displayName, user.email, user.role].filter(Boolean).join(" ")).includes(needle));
  if (matches.length !== 1) {
    throw new RailError("I need one exact team-member match before I can assign that visit.", { provider: "native", op: "resolveVisitAssignmentIds", status: 400 });
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
) {
  const job = await resolveJobForAction(tenant.id, { jobId: input.jobId, query: input.query }, jobLifecycleService);
  if (requireUnscheduled && job.status !== "Unscheduled") {
    throw new RailError(`${job.title} is ${job.status}, so it is not sitting in the Unscheduled queue right now.`, { provider: "native", op: "scheduleJobVisits", status: 400 });
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
          const assignedLabel = visit.assignedTo.map((userId) => tenantUsers.find((user) => user.id === userId)?.displayName ?? userId).join(", ");
          return `${index + 1}. ${formatVisitPreviewMoment(visit.start, visit.end)}${visit.title ? ` | ${visit.title}` : ""}${assignedLabel ? ` | assigned: ${assignedLabel}` : ""}${visit.details ? ` | ${visit.details}` : ""}`;
        })
      ].join("\n")
    },
    execute: { service: "crm", op: "scheduleJobVisitSeries", args: { tenantId: tenant.id, jobId: job.id, visits: JSON.parse(JSON.stringify(visits)) as typeof visits } },
    createdBy: "nexi"
  });
  return { approval, jobId: job.id, jobTitle: job.title, pendingVisits: visits, writesAreApprovalQueuedOnly: true as const };
}

async function resolveVisitShiftAnchor(
  tenantId: string,
  input: z.infer<typeof shiftJobVisitSeriesToolInputSchema>,
  jobLifecycleService: JobLifecycleService,
  operationsHubService: OperationsHubService | undefined,
  platformRepository: Pick<PlatformRepository, "listTenantUsers"> | undefined
) {
  if (input.visitId?.trim() && operationsHubService) {
    const access = await resolveWorkspaceAccess(tenantId, platformRepository, {});
    const range = defaultWorkspaceRange();
    const workspace = await operationsHubService.getScheduleWorkspace({ access, from: range.from, to: range.to });
    const visit = workspace.visits.find((entry) => entry.id === input.visitId?.trim());
    if (visit) {
      const siblingCount = workspace.visits.filter((entry) => entry.jobId === visit.jobId && entry.start >= visit.start).length;
      return { jobId: visit.jobId, jobTitle: visit.jobTitle, visitId: visit.id, start: visit.start, end: visit.end, remainingCount: Math.max(0, siblingCount - 1) };
    }
  }
  const job = await resolveJobForAction(tenantId, { jobId: input.jobId, query: input.query }, jobLifecycleService);
  const anchor = job.visits.filter(activeScheduledVisit).sort((left, right) => left.start.localeCompare(right.start))
    .find((visit) => !input.anchorStart || visit.start === input.anchorStart || visit.start.startsWith(input.anchorStart));
  if (!anchor) {
    throw new RailError("I could not find a remaining scheduled visit to move on that job.", { provider: "native", op: "shiftJobVisitSeries", status: 404 });
  }
  const remainingCount = job.visits.filter((visit) => activeScheduledVisit(visit) && visit.id !== anchor.id && visit.start >= anchor.start).length;
  return { jobId: job.id, jobTitle: job.title, visitId: anchor.id, start: anchor.start, end: anchor.end, remainingCount };
}

export async function queueShiftJobVisitSeriesApproval(
  tenant: Tenant,
  input: z.infer<typeof shiftJobVisitSeriesToolInputSchema>,
  jobLifecycleService: JobLifecycleService,
  operationsHubService: OperationsHubService | undefined,
  approvalQueue: ApprovalQueueService,
  platformRepository: Pick<PlatformRepository, "listTenantUsers"> | undefined
) {
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
    execute: { service: "crm", op: "moveJobVisitSeries", args: { tenantId: tenant.id, visitId: anchor.visitId, start: nextStart, end: nextEnd, shiftRemaining: input.shiftRemaining } },
    createdBy: "nexi"
  });
  return { approval, anchorVisitId: anchor.visitId, jobId: anchor.jobId, writesAreApprovalQueuedOnly: true as const };
}
