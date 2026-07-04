import type { NexiTool, SiteJobBlueprint, Source, Tenant } from "@nexteam/core";
import { z } from "zod";
import { CompanyCamAdapter, JobberAdapter } from "@nexteam/providers";

export interface ToolRunResult {
  result: unknown;
  sources: Source[];
}

export interface SiteJobBlueprintReader {
  loadSiteJobBlueprints(tenantId: string, limit: number): Promise<SiteJobBlueprint[]>;
}

export const getScheduleInputSchema = z.object({
  from: z.string(),
  to: z.string()
});

export const getJobDetailInputSchema = z.object({
  id: z.string().optional(),
  nameQuery: z.string().optional()
});

export const getPhotosInputSchema = z.object({
  projectQuery: z.string()
});

export const lookupSiteJobBlueprintFieldInputSchema = z.object({
  field: z.string(),
  fields: z.record(z.union([z.string(), z.number()])).optional()
});

const getScheduleJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    from: { type: "string", description: "Inclusive ISO timestamp for the schedule window start." },
    to: { type: "string", description: "Exclusive ISO timestamp for the schedule window end." }
  },
  required: ["from", "to"]
};

const getJobDetailJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", description: "Exact Jobber job id when known." },
    nameQuery: { type: "string", description: "Customer, project, or job name to search for." }
  }
};

const getPhotosJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectQuery: { type: "string", description: "CompanyCam project or customer name to search for, for example Deborah Justice." }
  },
  required: ["projectQuery"]
};

const lookupSiteJobBlueprintFieldJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    field: { type: "string", description: "SiteJobBlueprint field name. Use poolGallons for pool gallon questions." },
    fields: {
      type: "object",
      additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }] },
      description: "Optional inline extracted fields when already available."
    }
  },
  required: ["field"]
};

function source(rail: Source["rail"], ref: string, label: string): Source {
  return { rail, ref, label };
}

function firstBlueprintField(blueprints: SiteJobBlueprint[], field: string): { value: string | number; source: Source } | null {
  for (const siteJobBlueprint of blueprints) {
    const value = siteJobBlueprint.fields[field];
    if (value !== undefined) {
      return {
        value,
        source: source("native", siteJobBlueprint.id, `SiteJobBlueprint ${siteJobBlueprint.extractedFrom}`)
      };
    }
  }
  return null;
}

export function createNexiJobDeskTools(env: NodeJS.ProcessEnv = process.env, siteJobBlueprintReader?: SiteJobBlueprintReader): NexiTool[] {
  return [
    {
      name: "getSchedule",
      description: "Read Jobber schedule items for a date range.",
      inputSchema: getScheduleInputSchema,
      inputJsonSchema: getScheduleJsonSchema,
      handler: async (tenant: Tenant, args: unknown): Promise<ToolRunResult> => {
        const input = getScheduleInputSchema.parse(args);
        const jobs = await JobberAdapter.fromEnv(env, tenant.id).getJobs({ from: input.from, to: input.to });
        return {
          result: { jobs },
          sources: [source("jobber", "jobs", "Jobber jobs GraphQL read")]
        };
      }
    },
    {
      name: "getJobDetail",
      description: "Read a Jobber job detail by id or fuzzy name query.",
      inputSchema: getJobDetailInputSchema,
      inputJsonSchema: getJobDetailJsonSchema,
      handler: async (tenant: Tenant, args: unknown): Promise<ToolRunResult> => {
        const input = getJobDetailInputSchema.parse(args);
        const ref: { id?: string; nameQuery?: string } = {};
        if (input.id) {
          ref.id = input.id;
        }
        if (input.nameQuery) {
          ref.nameQuery = input.nameQuery;
        }
        const job = await JobberAdapter.fromEnv(env, tenant.id).getJobDetail(ref);
        return {
          result: { job },
          sources: [source("jobber", job.externalIds?.jobber ?? job.id, `Jobber job ${job.title}`)]
        };
      }
    },
    {
      name: "getPhotos",
      description: "Read CompanyCam project photos through the media provider.",
      inputSchema: getPhotosInputSchema,
      inputJsonSchema: getPhotosJsonSchema,
      handler: async (tenant: Tenant, args: unknown): Promise<ToolRunResult> => {
        const input = getPhotosInputSchema.parse(args);
        const provider = CompanyCamAdapter.fromEnv(env, tenant.id);
        const projects = await provider.findProjects(input.projectQuery);
        const project = projects[0];
        if (!project) {
          return { result: { projects: [], media: [] }, sources: [] };
        }
        const media = await provider.getMedia(project);
        return {
          result: { project, media },
          sources: [source("companycam", project.externalIds?.companycam ?? project.id, `CompanyCam project ${project.name}`)]
        };
      }
    },
    {
      name: "lookupSiteJobBlueprintField",
      description: "Read a field from a SiteJobBlueprint extraction result.",
      inputSchema: lookupSiteJobBlueprintFieldInputSchema,
      inputJsonSchema: lookupSiteJobBlueprintFieldJsonSchema,
      handler: async (tenant: Tenant, args: unknown): Promise<ToolRunResult> => {
        const input = lookupSiteJobBlueprintFieldInputSchema.parse(args);
        const fields = input.fields ?? {};
        const inlineValue = fields[input.field];
        if (inlineValue !== undefined) {
          return {
            result: { field: input.field, value: inlineValue },
            sources: [source("native", "site-job-blueprint", "SiteJobBlueprint fields")]
          };
        }
        const stored = siteJobBlueprintReader
          ? firstBlueprintField(await siteJobBlueprintReader.loadSiteJobBlueprints(tenant.id, 10), input.field)
          : null;
        return {
          result: { field: input.field, value: stored?.value ?? null },
          sources: stored ? [stored.source] : []
        };
      }
    }
  ];
}
