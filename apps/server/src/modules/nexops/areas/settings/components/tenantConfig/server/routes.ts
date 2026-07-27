import type { Request, Response } from "express";
import type { CrmRouteContext } from "../../../../../../../crm/routeRuntime.js";

export function registerTenantConfigRoutes(context: CrmRouteContext): void {
  const {
    FieldDocsService,
    FirestoreMediaRepository,
    FirestoreNativeCrmRepository,
    InMemoryEventBus,
    MemoryMediaRepository,
    MemoryNativeCrmRepository,
    NativeAdapter,
    NexDocsService,
    RailError,
    activityFeedQuerySchema,
    actorIdForAccess,
    addressSchema,
    app,
    archiveQuoteVersion,
    assignedTechniciansByVisitId,
    availableRequestFields,
    backfillLegacyLeads,
    bookingTemplateVariables,
    buildInvoiceDraftFromJobs,
    buildInvoiceDraftFromQuote,
    buildPortalSnapshotOrRedirect,
    buildQuickPaymentRequestInvoice,
    buildServiceRequest,
    capturePaypalCheckoutOrder,
    clientCommunicationSettingsSchema,
    clientContactSchema,
    clientStatementQuerySchema,
    communicationChannelEnabled,
    completeJobVisitBodySchema,
    composeInvoiceFromJobsBodySchema,
    convertRequestToJob,
    convertRequestToQuote,
    createAndNotifyRequest,
    createClientBodySchema,
    createClientPrimaryPropertySchema,
    createInvoiceCheckout,
    createInvoiceFromQuoteBodySchema,
    createJobBodySchema,
    createPaypalCheckoutOrder,
    createPortalToken,
    createQuickPaymentRequestRecord,
    createQuoteRouteBodySchema,
    createRequestBodySchema,
    createStripeCheckoutSession,
    crmSettingsPatchSchema,
    customFieldValueSchema,
    defaultTenantBranding,
    defaultTenantId,
    deps,
    documentationActivityQuerySchema,
    ensureDocumentNumbers,
    ensureQuoteConfiguration,
    ensureRequestForms,
    env,
    eventBus,
    fallbackFieldDocsRepository,
    fallbackRepository,
    fetchAddressSuggestions,
    fieldDocsRepository,
    fieldDocsService,
    formPresentation,
    getAdminDb,
    getAdminStorageBucket,
    getInvoiceAndClient,
    getQuoteAndClient,
    getRequestOrThrow,
    hasClientCreateAddress,
    hasClientCreatePhone,
    hashPortalToken,
    intakeSnapshotSchema,
    invoiceCheckoutBodySchema,
    invoiceDeliveryPreferencesSchema,
    invoiceLedgerActionBodySchema,
    invoiceTemplateVariables,
    jobActionSchema,
    jobLifecycle,
    ledger,
    lineItemSchema,
    materializeQuoteRecord,
    moveJobVisitBodySchema,
    nexDocsService,
    notificationActionBodySchema,
    notifyRequestCreated,
    operationsHub,
    parseStorageRef,
    paymentMethodDetailsBodySchema,
    paymentSchedulePlanSchema,
    personNameSchema,
    portalDocumentHref,
    portalHub,
    portalNexDocsUploadBodySchema,
    portalPathWithTenant,
    portalPhoneReverifyBodySchema,
    portalQuoteApprovalInputSchema,
    portalQuoteChangeRequestInputSchema,
    portalSessionDestination,
    portalSessionQuoteApprovalBodySchema,
    portalSessionQuoteChangeRequestBodySchema,
    portalTenantId,
    portalUrlForQuote,
    providerForTenant,
    publicFormSubmissionValues,
    publicOrigin,
    quickPaymentRequestBodySchema,
    quoteApprovalBlockedReason,
    quoteComposerInputSchema,
    quoteDeliveryMessage,
    quoteDiscountSchema,
    quoteLocked,
    quoteManualApprovalBodySchema,
    quoteRenewInputSchema,
    quoteSendBodySchema,
    quoteTemplateInputSchema,
    quoteTemplateVariables,
    randomUUID,
    receiptReviewChannelSchema,
    recordInvoicePaymentBodySchema,
    refundPaymentBodySchema,
    renderInvoicePdf,
    renderInvoicePortalHtml,
    renderPortalAppointmentsHtml,
    renderPortalDocumentsHtml,
    renderPortalHomeHtml,
    renderPortalInvoicesHtml,
    renderPortalOptOutHtml,
    renderPortalQuotesHtml,
    renderPortalReverifyHtml,
    renderPortalReviewLandingHtml,
    renderPublicRequestForm,
    renderQuotePdf,
    renderQuotePortalHtml,
    renderTemplateText,
    renderUnifiedPortalDocumentsHtml,
    repositoryForTenant,
    requestFieldInputSchema,
    requestFormBodySchema,
    requestFormEmbedCode,
    requestFormSharePath,
    requireAccessContext,
    requireBillingAccess,
    requirePortalSession,
    requireQuoteAccess,
    requireTenantRole,
    reserveDocumentNumber,
    resolveTemplateMessage,
    reviewSequenceActionBodySchema,
    reviewSequences,
    sanitizeFieldVisibility,
    scheduleJobVisitBodySchema,
    scheduleJobVisitSeriesBodySchema,
    scheduleWorkspaceQuerySchema,
    selectRequestFields,
    sendBookingConfirmationBodySchema,
    sendInvoiceBodySchema,
    sendPortalLinkBodySchema,
    sendPortalNexDocsFile,
    sendQuoteDelivery,
    sendRouteError,
    sendStatementBodySchema,
    startReviewSequenceBodySchema,
    syncExpiredQuote,
    tenantBranding,
    updateClientBodySchema,
    updateInvoiceDraftBodySchema,
    updateJobBodySchema,
    updateQuoteRouteBodySchema,
    updateReceiptReviewBodySchema,
    updateRequestBodySchema,
    updateServiceRequestShape,
    verifyStripeWebhookEvent,
    z
  } = context;

  app.get("/api/crm/settings", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "getCrmSettings");
      const settings = await repositoryForTenant().getCrmSettings(tenantId);
      res.json({ ok: true, tenantId, actorRole: access.role, settings });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/settings", async (req: Request, res: Response) => {
    try {
      const input = crmSettingsPatchSchema.parse(req.body);
      const access = await requireQuoteAccess(req, input.tenantId, "updateCrmSettings");
      const repository = repositoryForTenant();
      const current = await repository.getCrmSettings(input.tenantId);
      const saved = await repository.saveCrmSettings({
        ...current,
        documentNumbering: {
          request: {
            ...current.documentNumbering.request,
            prefix: input.documentNumbering?.request?.prefix ?? current.documentNumbering.request.prefix,
            separator: input.documentNumbering?.request?.separator ?? current.documentNumbering.request.separator,
            padWidth: input.documentNumbering?.request?.padWidth ?? current.documentNumbering.request.padWidth
          },
          quote: {
            ...current.documentNumbering.quote,
            prefix: input.documentNumbering?.quote?.prefix ?? current.documentNumbering.quote.prefix,
            separator: input.documentNumbering?.quote?.separator ?? current.documentNumbering.quote.separator,
            padWidth: input.documentNumbering?.quote?.padWidth ?? current.documentNumbering.quote.padWidth
          },
          job: {
            ...current.documentNumbering.job,
            prefix: input.documentNumbering?.job?.prefix ?? current.documentNumbering.job.prefix,
            separator: input.documentNumbering?.job?.separator ?? current.documentNumbering.job.separator,
            padWidth: input.documentNumbering?.job?.padWidth ?? current.documentNumbering.job.padWidth
          },
          invoice: {
            ...current.documentNumbering.invoice,
            prefix: input.documentNumbering?.invoice?.prefix ?? current.documentNumbering.invoice.prefix,
            separator: input.documentNumbering?.invoice?.separator ?? current.documentNumbering.invoice.separator,
            padWidth: input.documentNumbering?.invoice?.padWidth ?? current.documentNumbering.invoice.padWidth
          },
          receipt: {
            ...current.documentNumbering.receipt,
            prefix: input.documentNumbering?.receipt?.prefix ?? current.documentNumbering.receipt.prefix,
            separator: input.documentNumbering?.receipt?.separator ?? current.documentNumbering.receipt.separator,
            padWidth: input.documentNumbering?.receipt?.padWidth ?? current.documentNumbering.receipt.padWidth
          }
        },
        quoteDefaults: {
          ...current.quoteDefaults,
          ...(input.quoteDefaults?.expiryDays !== undefined ? { expiryDays: input.quoteDefaults.expiryDays } : {}),
          ...(input.quoteDefaults?.autoSaveCardOnDeposit !== undefined ? { autoSaveCardOnDeposit: input.quoteDefaults.autoSaveCardOnDeposit } : {}),
          approvalRules: {
            ...current.quoteDefaults.approvalRules,
            ...(input.quoteDefaults?.approvalRules?.requireSignature !== undefined ? { requireSignature: input.quoteDefaults.approvalRules.requireSignature } : {}),
            ...(input.quoteDefaults?.approvalRules?.requireDeposit !== undefined ? { requireDeposit: input.quoteDefaults.approvalRules.requireDeposit } : {}),
            ...(input.quoteDefaults?.approvalRules?.requireCardOnFile !== undefined ? { requireCardOnFile: input.quoteDefaults.approvalRules.requireCardOnFile } : {}),
            ...(input.quoteDefaults?.approvalRules?.depositKind !== undefined ? { depositKind: input.quoteDefaults.approvalRules.depositKind } : {}),
            ...(input.quoteDefaults?.approvalRules?.depositValue !== undefined ? { depositValue: input.quoteDefaults.approvalRules.depositValue } : {})
          },
          ...(input.quoteDefaults?.terms !== undefined ? { terms: input.quoteDefaults.terms } : {})
        },
        invoiceDefaults: {
          ...current.invoiceDefaults,
          ...(input.invoiceDefaults?.dueDays !== undefined ? { dueDays: input.invoiceDefaults.dueDays } : {}),
          ...(input.invoiceDefaults?.terms !== undefined ? { terms: input.invoiceDefaults.terms } : {}),
          ...(input.invoiceDefaults?.tippingEnabled !== undefined ? { tippingEnabled: input.invoiceDefaults.tippingEnabled } : {}),
          delivery: {
            ...current.invoiceDefaults.delivery,
            ...(input.invoiceDefaults?.delivery?.emailIncludePdf !== undefined ? { emailIncludePdf: input.invoiceDefaults.delivery.emailIncludePdf } : {}),
            ...(input.invoiceDefaults?.delivery?.emailIncludeSummary !== undefined ? { emailIncludeSummary: input.invoiceDefaults.delivery.emailIncludeSummary } : {}),
            ...(input.invoiceDefaults?.delivery?.emailIncludePayLink !== undefined ? { emailIncludePayLink: input.invoiceDefaults.delivery.emailIncludePayLink } : {}),
            ...(input.invoiceDefaults?.delivery?.smsIncludeSummary !== undefined ? { smsIncludeSummary: input.invoiceDefaults.delivery.smsIncludeSummary } : {}),
            ...(input.invoiceDefaults?.delivery?.smsIncludePayLink !== undefined ? { smsIncludePayLink: input.invoiceDefaults.delivery.smsIncludePayLink } : {}),
            ...(input.invoiceDefaults?.delivery?.smsIncludeHostedLink !== undefined ? { smsIncludeHostedLink: input.invoiceDefaults.delivery.smsIncludeHostedLink } : {})
          }
        },
        portalDefaults: {
          ...current.portalDefaults,
          ...(input.portalDefaults?.keepBusinessAddressPrivate !== undefined ? { keepBusinessAddressPrivate: input.portalDefaults.keepBusinessAddressPrivate } : {}),
          ...(input.portalDefaults?.hubSessionReverifyDays !== undefined ? { hubSessionReverifyDays: input.portalDefaults.hubSessionReverifyDays } : {})
        },
        reviewDefaults: {
          ...current.reviewDefaults,
          ...(input.reviewDefaults?.enabled !== undefined ? { enabled: input.reviewDefaults.enabled } : {}),
          ...(input.reviewDefaults?.steps ? { steps: input.reviewDefaults.steps } : {})
        },
        ...(input.catalogItems ? { catalogItems: input.catalogItems } : {}),
        ...(input.communicationTemplates ? { communicationTemplates: input.communicationTemplates } : {}),
        updatedAt: new Date().toISOString()
      });
      res.json({ ok: true, tenantId: input.tenantId, actorRole: access.role, settings: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
