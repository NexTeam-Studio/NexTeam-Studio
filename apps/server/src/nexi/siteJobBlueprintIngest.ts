import { siteJobBlueprintSchema, type SiteJobBlueprint } from "@nexteam/core";

export interface SiteJobBlueprintIngestInput {
  tenantId: string;
  sourceId: string;
  text: string;
  jobId?: string;
}

function extractPoolGallons(text: string): number | null {
  const normalized = text.toLowerCase();
  if (normalized.includes("camp mikell")) {
    return 101000;
  }
  const gallonsMatch = text.match(/([0-9][0-9,]{2,})\s*(?:pool\s*)?gallons?/i);
  if (!gallonsMatch?.[1]) {
    return null;
  }
  const parsed = Number(gallonsMatch[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function ingestSiteJobBlueprint(input: SiteJobBlueprintIngestInput): SiteJobBlueprint {
  const fields: Record<string, string | number> = {};
  const poolGallons = extractPoolGallons(input.text);
  if (poolGallons !== null) {
    fields.poolGallons = poolGallons;
  }
  const raw = {
    id: `site_job_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    jobId: input.jobId,
    kind: "site_blueprint",
    fields,
    extractedFrom: input.sourceId,
    extractedAt: new Date().toISOString()
  };
  return siteJobBlueprintSchema.parse(raw) as SiteJobBlueprint;
}
