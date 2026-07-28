import type { NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../runtime/nexiToolRuntime.js";

export function createJobCoreNexiTools(context: CrmToolContext, includeWrites: boolean): NexiTool[] {
  const {
    RailError,
    approvalQueue,
    createJobToolInputSchema,
    getJobDetailInputSchema,
    jobActionToolInputSchema,
    jobMatchesQuery,
    listJobsInputSchema,
    options,
    provider,
    queueJobActionApproval,
    queueJobCreateApproval,
    resolveJobForAction,
    source
  } = context;
  return [
    ...[{
      name: "listJobs",
      description: "Read native NexOps jobs with lifecycle-derived statuses, reminder state, and visit counts.",
      inputSchema: listJobsInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.jobLifecycleService) {
          throw new RailError("Native job lifecycle tools are not wired for this tenant yet.", { provider: "native", op: "listJobs", status: 501 });
        }
        const input = listJobsInputSchema.parse(args);
        const jobs = (await options.jobLifecycleService.listJobs(tenant.id))
          .filter((job) => !input.status || job.status === input.status)
          .filter((job) => jobMatchesQuery(job, input.q));
        return {
          result: {
            jobs
          },
          sources: jobs.length
            ? jobs.map((job) => source(job.id, `Native job ${job.title}`))
            : [source("jobs", "Native job list")]
        };
      }
    }],
    ...[{
      name: "getJobDetail",
      description: "Read one native job in detail, including visits, reminders, invoices, and lifecycle history.",
      inputSchema: getJobDetailInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.jobLifecycleService) {
          throw new RailError("Native job lifecycle tools are not wired for this tenant yet.", { provider: "native", op: "getJobDetail", status: 501 });
        }
        const input = getJobDetailInputSchema.parse(args);
        const job = await resolveJobForAction(tenant.id, input, options.jobLifecycleService);
        return {
          result: { job },
          sources: [source(job.id, `Native job ${job.title}`)]
        };
      }
    }],
    ...(includeWrites ? [{
      name: "createJob",
      description: "Build a native NexOps job draft, read it back in chat, and park the real write behind approval.",
      inputSchema: createJobToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository || !options.jobLifecycleService) {
          throw new RailError("Native job tools are not wired for this tenant yet.", { provider: "native", op: "createJob", status: 501 });
        }
        try {
          const input = createJobToolInputSchema.parse(args);
          const queued = await queueJobCreateApproval(tenant, input, provider, options.requestRepository, approvalQueue);
          return {
            result: queued,
            sources: [source(queued.approval.id, `ApprovalQueue job create ${queued.approval.id}`)]
          };
        } catch (error) {
          if (error instanceof RailError && error.status === 400) {
            return {
              result: {
                job: null,
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
      name: "queueJobAction",
      description: "Read back a job close/invoice action in chat, then park the real execution behind approval.",
      inputSchema: jobActionToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.jobLifecycleService) {
          throw new RailError("Native job lifecycle tools are not wired for this tenant yet.", { provider: "native", op: "queueJobAction", status: 501 });
        }
        try {
          const input = jobActionToolInputSchema.parse(args);
          const queued = await queueJobActionApproval(tenant, input, options.jobLifecycleService, approvalQueue);
          return {
            result: queued,
            sources: [source(queued.approval.id, `ApprovalQueue job action ${queued.approval.id}`)]
          };
        } catch (error) {
          if (error instanceof RailError && error.status === 400) {
            return {
              result: {
                preview: null,
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
