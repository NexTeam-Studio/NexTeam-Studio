import type { NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../../../crm/nexiToolRuntime.js";

export function createOperationsHubNexiTools(context: CrmToolContext, includeWrites: boolean): NexiTool[] {
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
      name: "getSchedule",
      description: "Read the native NexOps schedule workspace for a day, range, or team member, including the unscheduled queue.",
      inputSchema: getScheduleInputSchema,
      handler: readScheduleWorkspace
    }],
    ...[{
      name: "listVisits",
      description: "Alias of getSchedule for visit-by-visit schedule readback from the same native workspace.",
      inputSchema: getScheduleInputSchema,
      handler: readScheduleWorkspace
    }],
    ...[{
      name: "getHomeQueues",
      description: "Read the live NexOps Home queues and health strip from the same derived source as the web dashboard.",
      inputSchema: getHomeQueuesInputSchema,
      handler: readHomeQueues
    }],
    ...[{
      name: "getActivityFeed",
      description: "Read the persisted NexOps lifecycle activity feed, filtered by object type when needed.",
      inputSchema: getActivityFeedInputSchema,
      handler: readActivityFeed
    }],
    ...[{
      name: "listRecentActivity",
      description: "Alias of getActivityFeed for conversational 'what happened' queries.",
      inputSchema: getActivityFeedInputSchema,
      handler: readActivityFeed
    }],
    ...[{
      name: "getPipeline",
      description: "Read native CRM jobs grouped by pipeline status.",
      inputSchema: getPipelineInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        const input = getPipelineInputSchema.parse(args);
        const jobs = options.jobLifecycleService
          ? await options.jobLifecycleService.listJobs(_tenant.id)
          : await provider.getJobs({ from: input.from ?? defaultRange().from, to: input.to ?? defaultRange().to });
        return {
          result: { counts: groupJobs(jobs), jobs },
          sources: [source("jobs", "Native CRM jobs")]
        };
      }
    }]
  ];
}
