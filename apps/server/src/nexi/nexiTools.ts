import type { NexiTool, SiteJobBlueprint, Source, Tenant } from "@nexteam/core";
import { z } from "zod";

export interface ToolRunResult {
  result: unknown;
  sources: Source[];
}

export interface SiteJobBlueprintReader {
  loadSiteJobBlueprints(tenantId: string, limit: number): Promise<SiteJobBlueprint[]>;
}

export const lookupSiteJobBlueprintFieldInputSchema = z.object({
  field: z.string(),
  fields: z.record(z.union([z.string(), z.number()])).optional(),
  requestedEntity: z.string().optional(),
  jobId: z.string().optional(),
  sourceRef: z.string().optional()
});

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

function fieldValue(fields: Record<string, string | number>, field: string): string | number | undefined {
  const direct = fields[field];
  if (direct !== undefined) {
    return direct;
  }
  const pooled = fields.poolSpaCountsJson;
  if (typeof pooled !== "string") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(pooled) as Record<string, unknown>;
    const value = parsed[field];
    return typeof value === "string" || typeof value === "number" ? value : undefined;
  } catch {
    return undefined;
  }
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
    const value = fieldValue(siteJobBlueprint.fields, field);
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

function firstMatchingSiteJobBlueprint(
  blueprints: SiteJobBlueprint[],
  request: { requestedEntity?: string | undefined; jobId?: string | undefined; sourceRef?: string | undefined }
): SiteJobBlueprint | null {
  for (const siteJobBlueprint of blueprints) {
    if (blueprintMatchesRequest(siteJobBlueprint, request)) {
      return siteJobBlueprint;
    }
  }
  return null;
}

export function createNexiLookupTools(siteJobBlueprintReader?: SiteJobBlueprintReader): NexiTool[] {
  return [
    {
      name: "lookupSiteJobBlueprintField",
      description: "Read a field from a SiteJobBlueprint extraction result.",
      inputSchema: lookupSiteJobBlueprintFieldInputSchema,
      inputJsonSchema: lookupSiteJobBlueprintFieldJsonSchema,
      handler: async (_tenant: Tenant, args: unknown): Promise<ToolRunResult> => {
        const input = lookupSiteJobBlueprintFieldInputSchema.parse(args);
        const fields = input.fields ?? {};
        const inlineValue = fieldValue(fields, input.field);
        if (inlineValue !== undefined && inlineFieldMatchesRequest(input)) {
          return {
            result: { field: input.field, value: inlineValue, requestedEntity: input.requestedEntity ?? null },
            sources: [source("native", input.sourceRef ?? "site-job-blueprint", "SiteJobBlueprint fields")]
          };
        }
        const storedSiteJobBlueprints = siteJobBlueprintReader
          ? await siteJobBlueprintReader.loadSiteJobBlueprints(_tenant.id, 10)
          : [];
        const stored = firstBlueprintField(storedSiteJobBlueprints, input.field, input);
        const matchedSiteJobBlueprint = stored ? null : firstMatchingSiteJobBlueprint(storedSiteJobBlueprints, input);
        return {
          result: {
            field: input.field,
            value: stored?.value ?? null,
            requestedEntity: input.requestedEntity ?? null,
            matchedBlueprintId: stored?.matchedId ?? matchedSiteJobBlueprint?.id ?? null
          },
          sources: stored
            ? [stored.source]
            : matchedSiteJobBlueprint
              ? [source("native", matchedSiteJobBlueprint.id, `SiteJobBlueprint ${matchedSiteJobBlueprint.extractedFrom}`)]
              : []
        };
      }
    }
  ];
}

export const createNexiJobDeskTools = createNexiLookupTools;
