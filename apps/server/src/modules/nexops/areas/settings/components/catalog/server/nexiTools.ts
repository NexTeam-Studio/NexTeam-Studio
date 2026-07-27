import type { NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../../../crm/nexiToolRuntime.js";

export function createCatalogNexiTools(context: CrmToolContext, includeWrites: boolean): NexiTool[] {
  const {
    RailError,
    activeScheduledVisit,
    addressSchema,
    approvalQueue,
    availableRequestFields,
    buildServiceRequest,
    catalogCodeSeed,
    clientCommunicationSettingsSchema,
    clientContactSchema,
    clientLookupInputSchema,
    clientPortalActivityInputSchema,
    clientSaveClarification,
    clientSaveMissingFields,
    createClientInputSchema,
    createJobToolInputSchema,
    createQuoteToolInputSchema,
    createRequestToolInputSchema,
    defaultRange,
    defaultRequestForms,
    ensureQuoteConfiguration,
    ensureRequestForms,
    findRequestFieldLabel,
    formatVisitPreviewMoment,
    getActivityFeedInputSchema,
    getHomeQueuesInputSchema,
    getJobDetailInputSchema,
    getPipelineInputSchema,
    getQuoteDetailInputSchema,
    getRequestDetailInputSchema,
    getScheduleInputSchema,
    groupJobs,
    hasClientSavePhone,
    invoiceStatusInputSchema,
    isoRangeForDay,
    jobActionToolInputSchema,
    jobMatchesQuery,
    jsonClone,
    listCatalogItemsInputSchema,
    listCommunicationTemplatesInputSchema,
    listJobsInputSchema,
    listQuoteTemplatesInputSchema,
    listQuotesInputSchema,
    listRequestsInputSchema,
    listTeamMembersInputSchema,
    materializeJobLineItems,
    materializeQuoteRecord,
    mergedCreateRequestInput,
    normalizedPhone,
    notifyRequestCreated,
    options,
    parseAddress,
    parseLooseCreateRequestInput,
    parseRequestAddress,
    personNameSchema,
    provider,
    queueClientCreateApproval,
    queueJobActionApproval,
    queueJobCreateApproval,
    queueQuoteCreateApproval,
    queueScheduleJobVisitsApproval,
    queueShiftJobVisitSeriesApproval,
    queuedClientPreviewBody,
    queuedClientPrimaryProperty,
    queuedClientRecord,
    quoteComposerInputSchema,
    quoteMatchesQuery,
    quotePreviewBody,
    quoteStatusSchema,
    quoteSummary,
    readActivityFeed,
    readHomeQueues,
    readScheduleWorkspace,
    readable,
    requestFieldText,
    requestMatchesQuery,
    requestQueryValue,
    requestSource,
    resolveExactClientId,
    resolveJobForAction,
    resolveReviewSequenceIdForAction,
    resolveTenantUser,
    resolveVisitAssignmentIds,
    resolveVisitShiftAnchor,
    resolveWorkspaceAccess,
    reviewSequenceActionInputSchema,
    reviewSequenceStatusInputSchema,
    sanitizeAddressText,
    sanitizeRequestAddress,
    saveCatalogItemInputSchema,
    saveCommunicationTemplateInputSchema,
    scheduleJobVisitsToolInputSchema,
    sendPortalLinkInputSchema,
    sendStatementToolInputSchema,
    shiftIso,
    shiftJobVisitSeriesToolInputSchema,
    simplifiedRequestQuery,
    slugifyToken,
    source,
    startReviewSequenceToolInputSchema,
    statementToolInputSchema,
    workspaceAccessInputFields,
    workspaceRoleSchema,
    z
  } = context;
  return [
    ...[{
      name: "listCatalogItems",
      description: "Read tenant Products & Services catalog items by code, name, description, or tag.",
      inputSchema: listCatalogItemsInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native catalog tools are not wired for this tenant yet.", { provider: "native", op: "listCatalogItems", status: 501 });
        }
        const input = listCatalogItemsInputSchema.parse(args);
        const needle = input.q.trim().toLowerCase();
        const settings = await options.requestRepository.getCrmSettings(tenant.id);
        const items = settings.catalogItems
          .filter((item) => !input.visibleOnly || item.visible)
          .filter((item) => !needle || [item.code, item.name, item.description, item.tag].filter(Boolean).join(" ").toLowerCase().includes(needle))
          .sort((left, right) => left.name.localeCompare(right.name));
        return {
          result: { items },
          sources: items.length
            ? items.map((item) => source(item.id, `Catalog item ${item.name}`))
            : [source("catalog", "Tenant Products & Services catalog")]
        };
      }
    }],
    ...(includeWrites ? [{
      name: "saveCatalogItem",
      description: "Create or update a tenant Products & Services catalog item in the shared Settings catalog.",
      inputSchema: saveCatalogItemInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native catalog tools are not wired for this tenant yet.", { provider: "native", op: "saveCatalogItem", status: 501 });
        }
        const input = saveCatalogItemInputSchema.parse(args);
        const settings = await options.requestRepository.getCrmSettings(tenant.id);
        const timestamp = new Date().toISOString();
        const code = input.code?.trim() || catalogCodeSeed(input.name);
        const existing = settings.catalogItems.find((item) =>
          (input.id?.trim() && item.id === input.id.trim())
          || item.code.trim().toLowerCase() === code.trim().toLowerCase()
        );
        const item = {
          id: existing?.id ?? input.id?.trim() ?? `catalog_${slugifyToken(code)}`,
          tenantId: tenant.id,
          code,
          name: input.name.trim(),
          ...(input.description?.trim() ? { description: input.description.trim() } : {}),
          price: Math.round(input.price * 100) / 100,
          tag: input.tag.trim() || "Service",
          taxable: input.taxable,
          visible: input.visible,
          source: "tenant" as const,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp
        };
        const nextCatalog = existing
          ? settings.catalogItems.map((entry) => entry.id === existing.id ? item : entry)
          : [...settings.catalogItems, item];
        const savedSettings = await options.requestRepository.saveCrmSettings({
          ...settings,
          catalogItems: nextCatalog,
          updatedAt: timestamp
        });
        return {
          result: {
            item,
            catalogCount: savedSettings.catalogItems.length,
            created: !existing
          },
          sources: [source(item.id, `Catalog item ${item.name}`)]
        };
      }
    }] : [])
  ];
}
