import type { DocRef, Job, Media, NexiTool, SiteJobBlueprint, Source, Tenant } from "@nexteam/core";
import { z } from "zod";
import { CompanyCamAdapter, JobberAdapter } from "@nexteam/providers";
import { readCompanyCamReports, siteJobBlueprintFromCompanyCamReport } from "./reportDocuments.js";

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

export const getDocumentsInputSchema = z.object({
  projectQuery: z.string(),
  question: z.string().optional()
});

export const lookupSiteJobBlueprintFieldInputSchema = z.object({
  field: z.string(),
  fields: z.record(z.union([z.string(), z.number()])).optional(),
  requestedEntity: z.string().optional(),
  jobId: z.string().optional(),
  sourceRef: z.string().optional()
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

const getDocumentsJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectQuery: {
      type: "string",
      description: "CompanyCam project or customer name to search for, for example Deborah Justice."
    },
    question: {
      type: "string",
      description: "Original user question so the report reader can prioritize findings, gallons, or checklist documents."
    }
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
    },
    requestedEntity: {
      type: "string",
      description: "Client, property, or job name from the user's request. Required when answering client/job-specific fields."
    },
    jobId: { type: "string", description: "Exact native job id when known." },
    sourceRef: {
      type: "string",
      description: "Source identifier for inline fields, used to prevent cross-client field reuse."
    }
  },
  required: ["field"]
};

function source(rail: Source["rail"], ref: string, label: string): Source {
  return { rail, ref, label };
}

function companyCamPhotoSources(media: Media[]): Source[] {
  return media
    .slice(0, 3)
    .map((item) => source("companycam", item.externalIds?.companycam ?? item.id, `CompanyCam photo ${item.id}`));
}

function companyCamDocumentSources(documents: DocRef[]): Source[] {
  return documents
    .slice(0, 3)
    .map((item) => source("companycam", item.externalIds?.companycam ?? item.id, `CompanyCam document ${item.label}`));
}

function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "America/New_York";
  }
}

function localDateTimeParts(iso: string | undefined, timeZone: string): { date: string; time: string } | null {
  const parsed = Date.parse(iso ?? "");
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).formatToParts(new Date(parsed));
  const readPart = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  const year = readPart("year");
  const month = readPart("month");
  const day = readPart("day");
  const hour = readPart("hour");
  const minute = readPart("minute");
  const dayPeriod = readPart("dayPeriod").toUpperCase();
  if (!year || !month || !day || !hour || !minute || !dayPeriod) {
    return null;
  }
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute} ${dayPeriod}` };
}

function localSchedule(job: Job, timeZone: string): { date: string; localSummary: string; allDay: boolean } | undefined {
  const start = localDateTimeParts(job.startAt, timeZone);
  if (!start) {
    return undefined;
  }
  const end = localDateTimeParts(job.endAt, timeZone);
  const allDay = start.time === "12:00 AM" && end?.date === start.date && end.time.startsWith("11:59");
  return {
    date: start.date,
    localSummary: allDay ? `${start.date} all day` : `${start.date} ${start.time}${end ? `-${end.time}` : ""}`,
    allDay
  };
}

function withLocalSchedule(jobs: Job[], timeZone: string): Array<Job & { schedule?: { date: string; localSummary: string; allDay: boolean } }> {
  return jobs.map((job) => {
    const schedule = localSchedule(job, timeZone);
    return schedule ? { ...job, schedule } : job;
  });
}

function normalizedSearchText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesAllSearchTokens(haystack: string, needle: string): boolean {
  const tokens = normalizedSearchText(needle).split(/\s+/).filter((token) => token.length > 1);
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

function blueprintMatchesRequest(
  siteJobBlueprint: SiteJobBlueprint,
  request: { requestedEntity?: string | undefined; jobId?: string | undefined; sourceRef?: string | undefined }
): boolean {
  if (request.jobId && siteJobBlueprint.jobId !== request.jobId) {
    return false;
  }
  const requestedEntity = request.requestedEntity?.trim();
  const sourceRef = request.sourceRef?.trim();
  if (!requestedEntity && !sourceRef) {
    return true;
  }
  const haystack = normalizedSearchText([
    siteJobBlueprint.id,
    siteJobBlueprint.jobId,
    siteJobBlueprint.extractedFrom,
    JSON.stringify(siteJobBlueprint.fields)
  ].join(" "));
  if (sourceRef && !includesAllSearchTokens(haystack, sourceRef)) {
    return false;
  }
  return requestedEntity ? includesAllSearchTokens(haystack, requestedEntity) : true;
}

function inlineFieldMatchesRequest(input: z.infer<typeof lookupSiteJobBlueprintFieldInputSchema>): boolean {
  if (input.jobId || input.requestedEntity) {
    return Boolean(input.sourceRef && includesAllSearchTokens(input.sourceRef, input.requestedEntity ?? input.jobId ?? ""));
  }
  return true;
}

function firstBlueprintField(
  blueprints: SiteJobBlueprint[],
  field: string,
  request: { requestedEntity?: string | undefined; jobId?: string | undefined; sourceRef?: string | undefined }
): { value: string | number; source: Source; matchedId: string } | null {
  for (const siteJobBlueprint of blueprints) {
    if (!blueprintMatchesRequest(siteJobBlueprint, request)) {
      continue;
    }
    const value = siteJobBlueprint.fields[field];
    if (value !== undefined) {
      return {
        value,
        source: source("native", siteJobBlueprint.id, `SiteJobBlueprint ${siteJobBlueprint.extractedFrom}`),
        matchedId: siteJobBlueprint.id
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
          result: { window: { from: input.from, to: input.to, timezone: tenant.timezone }, jobs: withLocalSchedule(jobs, tenant.timezone) },
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
          sources: [
            source("companycam", project.externalIds?.companycam ?? project.id, `CompanyCam project ${project.name}`),
            ...companyCamPhotoSources(media)
          ]
        };
      }
    },
    {
      name: "getDocuments",
      description: "Read CompanyCam project documents/reports and extract leak-detection report fields such as findings and pool gallons.",
      inputSchema: getDocumentsInputSchema,
      inputJsonSchema: getDocumentsJsonSchema,
      handler: async (tenant: Tenant, args: unknown): Promise<ToolRunResult> => {
        const input = getDocumentsInputSchema.parse(args);
        const result = await readCompanyCamReports({
          tenant,
          projectQuery: input.projectQuery,
          question: input.question,
          env
        });
        const parsedReports = result.reports.filter((report) => report.parsed);
        const siteJobBlueprints = result.project
          ? parsedReports
            .filter((report) => Object.keys(report.fields).length > 0)
            .map((report) => siteJobBlueprintFromCompanyCamReport({ tenantId: tenant.id, project: result.project as NonNullable<typeof result.project>, report }))
          : [];
        return {
          result: {
            project: result.project,
            documents: result.documents,
            reports: result.reports,
            suggestedSiteJobBlueprints: siteJobBlueprints
          },
          sources: [
            ...(result.project ? [source("companycam", result.project.externalIds?.companycam ?? result.project.id, `CompanyCam project ${result.project.name}`)] : []),
            ...companyCamDocumentSources(parsedReports.map((report) => report.document))
          ]
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
        if (inlineValue !== undefined && inlineFieldMatchesRequest(input)) {
          return {
            result: { field: input.field, value: inlineValue, requestedEntity: input.requestedEntity ?? null },
            sources: [source("native", input.sourceRef ?? "site-job-blueprint", "SiteJobBlueprint fields")]
          };
        }
        const stored = siteJobBlueprintReader
          ? firstBlueprintField(await siteJobBlueprintReader.loadSiteJobBlueprints(tenant.id, 10), input.field, input)
          : null;
        return {
          result: {
            field: input.field,
            value: stored?.value ?? null,
            requestedEntity: input.requestedEntity ?? null,
            matchedBlueprintId: stored?.matchedId ?? null
          },
          sources: stored ? [stored.source] : []
        };
      }
    }
  ];
}
