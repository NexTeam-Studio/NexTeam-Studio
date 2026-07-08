import { RailError, type NexiTool, type PlatformModule, type Tenant } from "@nexteam/core";
import { modulesForPlan } from "./plans.js";

const TOOL_MODULES: Record<string, PlatformModule> = {
  getSchedule: "nexi",
  getJobDetail: "nexi",
  getPhotos: "fielddocs",
  getDocuments: "fielddocs",
  lookupSiteJobBlueprintField: "fielddocs",
  clientLookup: "crm",
  createClient: "crm",
  getPipeline: "crm",
  invoiceStatus: "crm",
  draftQuote: "crm",
  searchEmail: "comms",
  getEmailThread: "comms",
  getEmailMessage: "comms",
  getEmailAttachment: "comms",
  summarizeInbox: "comms",
  triageInbox: "comms",
  draftEmail: "comms",
  draftPostFromJob: "content",
  contentQueue: "content",
  approve: "content",
  rejectContentDraft: "content",
  contentStats: "content",
  audiencePreview: "campaigns",
  draftCampaign: "campaigns",
  campaignQueue: "campaigns",
  suppressCampaignContact: "campaigns",
  queueReportDelivery: "campaigns",
  queueReviewRequest: "campaigns",
  findSlot: "scheduling",
  bookVisit: "scheduling",
  moveVisit: "scheduling",
  whatsMyDay: "scheduling",
  runEvaporation: "evaporation"
};

export interface EntitlementResult {
  tools: NexiTool[];
  blocked: Array<{ name: string; module: PlatformModule }>;
}

export function moduleForTool(toolName: string): PlatformModule {
  return TOOL_MODULES[toolName] ?? "nexi";
}

export function enforceToolEntitlements(tenant: Tenant, tools: NexiTool[]): EntitlementResult {
  const allowedModules = modulesForPlan(tenant.plan);
  const blocked: EntitlementResult["blocked"] = [];
  const allowedTools = tools.filter((tool) => {
    const module = moduleForTool(tool.name);
    const allowed = allowedModules.has(module);
    if (!allowed) {
      blocked.push({ name: tool.name, module });
    }
    return allowed;
  });
  return { tools: allowedTools, blocked };
}

export function requireTenantModule(tenant: Tenant, module: PlatformModule): void {
  if (!modulesForPlan(tenant.plan).has(module)) {
    throw new RailError(`${tenant.name} is not subscribed to ${module}.`, { provider: "platform", op: "entitlement", status: 403 });
  }
}

export function toolEntitlementMatrix(tenant: Tenant): Array<{ name: string; module: PlatformModule; allowed: boolean }> {
  const allowedModules = modulesForPlan(tenant.plan);
  return Object.entries(TOOL_MODULES)
    .map(([name, module]) => ({ name, module, allowed: allowedModules.has(module) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
