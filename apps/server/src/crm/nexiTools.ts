import type { ApprovalQueueService, CRMProvider, NexiTool } from "@nexteam/core";
import { createCrmToolContext, type CrmReadToolOptions } from "./nexiToolRuntime.js";
import { createOperationsHubNexiTools } from "../modules/nexops/areas/home/components/operationsHub/server/nexiTools.js";
import { createRequestCoreNexiTools } from "../modules/nexops/areas/requests/components/requestCore/server/nexiTools.js";
import { createContactNexiTools } from "../modules/nexops/areas/clients/components/contact/server/nexiTools.js";
import { createJobCoreNexiTools } from "../modules/nexops/areas/jobs/components/jobCore/server/nexiTools.js";
import { createVisitCoreNexiTools } from "../modules/nexops/areas/visits/components/visitCore/server/nexiTools.js";
import { createQuoteEngineNexiTools } from "../modules/nexops/areas/quotes/components/quoteEngine/server/nexiTools.js";
import { createQuoteTemplateNexiTools } from "../modules/nexops/areas/quotes/components/quoteTemplates/server/nexiTools.js";
import { createCatalogNexiTools } from "../modules/nexops/areas/settings/components/catalog/server/nexiTools.js";
import { createTenantConfigNexiTools } from "../modules/nexops/areas/settings/components/tenantConfig/server/nexiTools.js";
import { createInvoiceStructureNexiTools } from "../modules/nexops/areas/invoices/components/invoiceStructure/server/nexiTools.js";
import { createPortalCoreNexiTools } from "../modules/nexportal/components/portalCore/server/nexiTools.js";

export type { CreateClientInput, CrmReadToolOptions } from "./nexiToolRuntime.js";
export { clientSaveClarification, clientSaveMissingFields, queueClientCreateApproval } from "./nexiToolRuntime.js";



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
