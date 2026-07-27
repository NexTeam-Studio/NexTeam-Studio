import type { NexiTool, Tenant } from "@nexteam/core";
import type { CrmToolContext } from "../../../../../../../crm/nexiToolRuntime.js";

export function createQuoteEngineNexiTools(context: CrmToolContext, includeWrites: boolean): NexiTool[] {
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
      name: "listQuotes",
      description: "Read native NexOps quotes by client, quote number, title, or status.",
      inputSchema: listQuotesInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        if (!provider.getQuotes) {
          throw new RailError("The configured CRM provider cannot read native quotes.", { provider: "native", op: "listQuotes", status: 501 });
        }
        const input = listQuotesInputSchema.parse(args);
        const [quotes, clients] = await Promise.all([
          provider.getQuotes(),
          provider.getClients("")
        ]);
        const matches = quotes
          .filter((quote) => !input.status || quote.status === input.status)
          .filter((quote) => quoteMatchesQuery(quote, input.q, clients));
        return {
          result: {
            quotes: matches.map((quote) => quoteSummary(quote, clients))
          },
          sources: matches.length
            ? matches.map((quote) => source(quote.id, `Native quote ${quote.title}`))
            : [source("quotes", "Native quote list")]
        };
      }
    }],
    ...[{
      name: "getQuoteDetail",
      description: "Read one native quote in detail, including number, totals, approval rules, expiry, and request link.",
      inputSchema: getQuoteDetailInputSchema,
      handler: async (_tenant: Tenant, args: unknown) => {
        if (!provider.getQuotes) {
          throw new RailError("The configured CRM provider cannot read native quotes.", { provider: "native", op: "getQuoteDetail", status: 501 });
        }
        const input = getQuoteDetailInputSchema.parse(args);
        const [quotes, clients] = await Promise.all([
          provider.getQuotes(),
          provider.getClients("")
        ]);
        const quote = input.quoteId
          ? quotes.find((candidate) => candidate.id === input.quoteId || candidate.number === input.quoteId)
          : quotes.find((candidate) => quoteMatchesQuery(candidate, input.query ?? "", clients));
        if (!quote) {
          return {
            result: { quote: null },
            sources: [source("quotes", "Native quote list")]
          };
        }
        const client = clients.find((candidate) => candidate.id === quote.clientId);
        return {
          result: {
            quote,
            client: client ? {
              id: client.id,
              name: client.name,
              emails: client.emails,
              phones: client.phones
            } : null
          },
          sources: [source(quote.id, `Native quote ${quote.title}`)]
        };
      }
    }],
    ...(includeWrites ? [{
      name: "createQuote",
      description: "Build a native NexOps quote draft, read it back in chat, and park the real write behind approval.",
      inputSchema: createQuoteToolInputSchema,
      handler: async (tenant: Tenant, args: unknown) => {
        if (!options.requestRepository) {
          throw new RailError("Native quote tools are not wired for this tenant yet.", { provider: "native", op: "createQuote", status: 501 });
        }
        try {
          const input = createQuoteToolInputSchema.parse(args);
          const queued = await queueQuoteCreateApproval(tenant, input, provider, options.requestRepository, approvalQueue);
          return {
            result: queued,
            sources: [
              source(queued.approval.id, `ApprovalQueue quote create ${queued.approval.id}`),
              source("native-quote-config", "Native quote templates, numbering, and totals")
            ]
          };
        } catch (error) {
          if (error instanceof RailError && error.status === 400) {
            return {
              result: {
                quote: null,
                needsClarification: error.message
              },
              sources: []
            };
          }
          throw error;
        }
      }
    }] : [])
  ];
}
