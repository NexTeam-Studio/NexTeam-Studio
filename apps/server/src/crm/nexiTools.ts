import { z } from "zod";
import type { CRMProvider, Job, NexiTool, Source, Tenant } from "@nexteam/core";

const clientLookupInputSchema = z.object({ q: z.string() });
const getPipelineInputSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

function defaultRange(): { from: string; to: string } {
  return { from: "1970-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" };
}

function groupJobs(jobs: Job[]): Record<Job["status"], number> {
  return jobs.reduce<Record<Job["status"], number>>((groups, job) => {
    groups[job.status] = (groups[job.status] ?? 0) + 1;
    return groups;
  }, {
    lead: 0,
    quoted: 0,
    scheduled: 0,
    in_progress: 0,
    complete: 0,
    invoiced: 0,
    paid: 0
  });
}

export function createCrmReadTools(provider: CRMProvider): NexiTool[] {
  return [
    {
      name: "clientLookup",
      description: "Read native CRM clients by name, company, email, or phone.",
      inputSchema: clientLookupInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        const input = clientLookupInputSchema.parse(args);
        const clients = await provider.getClients(input.q);
        return {
          result: { clients },
          sources: [source("clients", "Native CRM clients")]
        };
      }
    },
    {
      name: "getPipeline",
      description: "Read native CRM jobs grouped by pipeline status.",
      inputSchema: getPipelineInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        const input = getPipelineInputSchema.parse(args);
        const fallback = defaultRange();
        const jobs = await provider.getJobs({ from: input.from ?? fallback.from, to: input.to ?? fallback.to });
        return {
          result: { counts: groupJobs(jobs), jobs },
          sources: [source("jobs", "Native CRM jobs")]
        };
      }
    }
  ];
}
