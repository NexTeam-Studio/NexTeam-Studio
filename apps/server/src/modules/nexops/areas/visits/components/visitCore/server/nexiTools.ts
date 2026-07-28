import type { NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../runtime/nexiToolRuntime.js";

export function createVisitCoreNexiTools(context: CrmToolContext, includeWrites: boolean): NexiTool[] {
  const {
    RailError,
    approvalQueue,
    options,
    queueScheduleJobVisitsApproval,
    queueShiftJobVisitSeriesApproval,
    scheduleJobVisitsToolInputSchema,
    shiftJobVisitSeriesToolInputSchema,
    source
  } = context;
  return [
    ...(includeWrites ? [{
      name: "scheduleUnscheduledJob",
      description: "Read back a visit plan for an unscheduled job, then park the real scheduling write behind approval.",
      inputSchema: scheduleJobVisitsToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.jobLifecycleService) {
          throw new RailError("Native scheduling tools are not wired for this tenant yet.", { provider: "native", op: "scheduleUnscheduledJob", status: 501 });
        }
        try {
          const input = scheduleJobVisitsToolInputSchema.parse(args);
          const queued = await queueScheduleJobVisitsApproval(
            tenant,
            input,
            options.jobLifecycleService,
            approvalQueue,
            options.platformRepository,
            true
          );
          return {
            result: queued,
            sources: [source(queued.approval.id, `ApprovalQueue visit series ${queued.approval.id}`)]
          };
        } catch (error) {
          if (error instanceof RailError && error.status === 400) {
            return {
              result: {
                approval: null,
                needsClarification: error.message
              },
              sources: []
            };
          }
          throw error;
        }
      }
    }] : []),
    ...(includeWrites ? [{
      name: "scheduleJobVisits",
      description: "Read back one or many job visits in chat, then park the real scheduling write behind approval.",
      inputSchema: scheduleJobVisitsToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.jobLifecycleService) {
          throw new RailError("Native scheduling tools are not wired for this tenant yet.", { provider: "native", op: "scheduleJobVisits", status: 501 });
        }
        try {
          const input = scheduleJobVisitsToolInputSchema.parse(args);
          const queued = await queueScheduleJobVisitsApproval(
            tenant,
            input,
            options.jobLifecycleService,
            approvalQueue,
            options.platformRepository
          );
          return {
            result: queued,
            sources: [source(queued.approval.id, `ApprovalQueue visit series ${queued.approval.id}`)]
          };
        } catch (error) {
          if (error instanceof RailError && error.status === 400) {
            return {
              result: {
                approval: null,
                needsClarification: error.message
              },
              sources: []
            };
          }
          throw error;
        }
      }
    }] : []),
    ...(includeWrites ? [{
      name: "shiftJobVisitSeries",
      description: "Read back a visit move or remaining-series shift in chat, then park the real reschedule write behind approval.",
      inputSchema: shiftJobVisitSeriesToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.jobLifecycleService) {
          throw new RailError("Native scheduling tools are not wired for this tenant yet.", { provider: "native", op: "shiftJobVisitSeries", status: 501 });
        }
        try {
          const input = shiftJobVisitSeriesToolInputSchema.parse(args);
          const queued = await queueShiftJobVisitSeriesApproval(
            tenant,
            input,
            options.jobLifecycleService,
            options.operationsHubService,
            approvalQueue,
            options.platformRepository
          );
          return {
            result: queued,
            sources: [source(queued.approval.id, `ApprovalQueue visit shift ${queued.approval.id}`)]
          };
        } catch (error) {
          if (error instanceof RailError && error.status === 400) {
            return {
              result: {
                approval: null,
                needsClarification: error.message
              },
              sources: []
            };
          }
          throw error;
        }
      }
    }] : [])
  ];
}
