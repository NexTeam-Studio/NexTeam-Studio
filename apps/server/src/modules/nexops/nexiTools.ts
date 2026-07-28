import type { ApprovalQueueService, CRMProvider, NexiTool } from "@nexteam/core";
import { createCrmToolContext, type CrmReadToolOptions } from "./runtime/nexiToolRuntime.js";
import { createOperationsHubNexiTools } from "./areas/home/components/operationsHub/server/nexiTools.js";
import { createRequestCoreNexiTools } from "./areas/requests/components/requestCore/server/nexiTools.js";
import { createContactNexiTools } from "./areas/clients/components/contact/server/nexiTools.js";
import { createJobCoreNexiTools } from "./areas/jobs/components/jobCore/server/nexiTools.js";
import { createVisitCoreNexiTools } from "./areas/visits/components/visitCore/server/nexiTools.js";
import { createQuoteEngineNexiTools } from "./areas/quotes/components/quoteEngine/server/nexiTools.js";
import { createQuoteTemplateNexiTools } from "./areas/quotes/components/quoteTemplates/server/nexiTools.js";
import { createCatalogNexiTools } from "./areas/settings/components/catalog/server/nexiTools.js";
import { createTenantConfigNexiTools } from "./areas/settings/components/tenantConfig/server/nexiTools.js";
import { createInvoiceStructureNexiTools } from "./areas/invoices/components/invoiceStructure/server/nexiTools.js";
import { createPortalCoreNexiTools } from "../nexportal/components/portalCore/server/nexiTools.js";

export type { CreateClientInput, CrmReadToolOptions } from "./runtime/nexiToolRuntime.js";
export { clientSaveClarification, clientSaveMissingFields, queueClientCreateApproval } from "./runtime/nexiToolRuntime.js";



function collectCrmTools(provider: CRMProvider, approvalQueue: ApprovalQueueService | undefined, options: CrmReadToolOptions, includeWrites: boolean): NexiTool[] {
  const context = createCrmToolContext(provider, approvalQueue, options);
  return [
    ...createOperationsHubNexiTools(context, includeWrites),
    ...createRequestCoreNexiTools(context, includeWrites),
    ...createContactNexiTools(context, includeWrites),
    ...createJobCoreNexiTools(context, includeWrites),
    ...createVisitCoreNexiTools(context, includeWrites),
    ...createQuoteEngineNexiTools(context, includeWrites),
    ...createQuoteTemplateNexiTools(context, includeWrites),
    ...createCatalogNexiTools(context, includeWrites),
    ...createTenantConfigNexiTools(context, includeWrites),
    ...createInvoiceStructureNexiTools(context, includeWrites),
    ...createPortalCoreNexiTools(context, includeWrites),
  ];
}

export function createCrmReadTools(provider: CRMProvider): NexiTool[] {
  return createCrmReadToolsWithOptions(provider);
}

export function createCrmReadToolsWithOptions(provider: CRMProvider, options: CrmReadToolOptions = {}): NexiTool[] {
  return collectCrmTools(provider, undefined, options, false);
}

export function createCrmTools(provider: CRMProvider, approvalQueue: ApprovalQueueService): NexiTool[] {
  return createCrmToolsWithOptions(provider, approvalQueue);
}

export function createCrmToolsWithOptions(provider: CRMProvider, approvalQueue: ApprovalQueueService, options: CrmReadToolOptions = {}): NexiTool[] {
  return collectCrmTools(provider, approvalQueue, options, true);
}
