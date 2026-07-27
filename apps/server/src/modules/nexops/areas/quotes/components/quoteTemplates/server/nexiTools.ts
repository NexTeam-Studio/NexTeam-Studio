import type { NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../../../crm/nexiToolRuntime.js";

export function createQuoteTemplateNexiTools(context: CrmToolContext, includeWrites: boolean): NexiTool[] {
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
      name: "listQuoteTemplates",
      description: "Read tenant quote templates so Nexi can select the right template id before drafting a quote.",
      inputSchema: listQuoteTemplatesInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native quote template tools are not wired for this tenant yet.", { provider: "native", op: "listQuoteTemplates", status: 501 });
        }
        const input = listQuoteTemplatesInputSchema.parse(args);
        const needle = input.q.trim().toLowerCase();
        const { templates } = await ensureQuoteConfiguration(options.requestRepository, tenant.id);
        const matches = templates
          .filter((template) => !needle || [template.name, template.description, template.titlePrefix].filter(Boolean).join(" ").toLowerCase().includes(needle))
          .sort((left, right) => left.name.localeCompare(right.name));
        return {
          result: { templates: matches },
          sources: matches.length
            ? matches.map((template) => source(template.id, `Quote template ${template.name}`))
            : [source("quote-templates", "Tenant quote template list")]
        };
      }
    }]
  ];
}
