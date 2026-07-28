import { RailError, type Job, type NexiTool, type Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../runtime/nexiToolRuntime.js";
import { getActivityFeedInputSchema, getHomeQueuesInputSchema, getPipelineInputSchema, getScheduleInputSchema } from "./toolSchemas.js";
import { defaultWorkspaceRange, resolveTenantUser, resolveWorkspaceAccess, workspaceRangeForDay } from "../../../../../shared/tools/workspaceAccess.js";

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

export function createOperationsHubNexiTools(context: CrmToolContext, _includeWrites: boolean): NexiTool[] {
  const {
    options,
    provider,
    source
  } = context;
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
      teamMemberIds
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
    return { result: snapshot, sources: [source("home-queues", "Native home status queues")] };
  };
  return [
    ...[{
      name: "getSchedule",
      description: "Read the native NexOps schedule workspace for a day, range, or team member, including the unscheduled queue.",
      inputSchema: getScheduleInputSchema,
      handler: readScheduleWorkspace
    }],
    ...[{
      name: "listVisits",
      description: "Alias of getSchedule for visit-by-visit schedule readback from the same native workspace.",
      inputSchema: getScheduleInputSchema,
      handler: readScheduleWorkspace
    }],
    ...[{
      name: "getHomeQueues",
      description: "Read the live NexOps Home queues and health strip from the same derived source as the web dashboard.",
      inputSchema: getHomeQueuesInputSchema,
      handler: readHomeQueues
    }],
    ...[{
      name: "getActivityFeed",
      description: "Read the persisted NexOps lifecycle activity feed, filtered by object type when needed.",
      inputSchema: getActivityFeedInputSchema,
      handler: readActivityFeed
    }],
    ...[{
      name: "listRecentActivity",
      description: "Alias of getActivityFeed for conversational 'what happened' queries.",
      inputSchema: getActivityFeedInputSchema,
      handler: readActivityFeed
    }],
    ...[{
      name: "getPipeline",
      description: "Read native CRM jobs grouped by pipeline status.",
      inputSchema: getPipelineInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        const input = getPipelineInputSchema.parse(args);
        const jobs = options.jobLifecycleService
          ? await options.jobLifecycleService.listJobs(_tenant.id)
          : await provider.getJobs({ from: input.from ?? defaultWorkspaceRange().from, to: input.to ?? defaultWorkspaceRange().to });
        return {
          result: { counts: groupJobs(jobs), jobs },
          sources: [source("jobs", "Native CRM jobs")]
        };
      }
    }]
  ];
}
