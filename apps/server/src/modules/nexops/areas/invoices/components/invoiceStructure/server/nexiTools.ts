import type { NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../../../crm/nexiToolRuntime.js";

export function createInvoiceStructureNexiTools(context: CrmToolContext, includeWrites: boolean): NexiTool[] {
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
      name: "invoiceStatus",
      description: "Read native CRM invoice status by invoice id or client id.",
      inputSchema: invoiceStatusInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        if (!readable.getInvoices && !options.ledgerService) {
          throw new RailError("The configured CRM provider cannot read native invoices.", { provider: "native", op: "invoiceStatus", status: 501 });
        }
        const input = invoiceStatusInputSchema.parse(args);
        const invoices = (options.ledgerService ? await options.ledgerService.listInvoices(_tenant.id) : await readable.getInvoices!()).filter((invoice) =>
          (input.invoiceId ? invoice.id === input.invoiceId : true)
          && (input.clientId ? invoice.clientId === input.clientId : true)
        );
        return {
          result: { invoices },
          sources: invoices.length
            ? invoices.map((invoice) => source(invoice.id, `Native invoice ${invoice.title}`))
            : [source("invoices", "Native CRM invoices")]
        };
      }
    }]
  ];
}
