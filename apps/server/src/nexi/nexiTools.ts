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
