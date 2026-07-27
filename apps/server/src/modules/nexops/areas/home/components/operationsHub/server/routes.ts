import type { Request, Response } from "express";
import type { CrmRouteContext } from "../../../../../../../crm/routeRuntime.js";

export function registerOperationsHubRoutes(context: CrmRouteContext): void {
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

  app.get("/api/crm/schedule/workspace", async (req: Request, res: Response) => {
    try {
      const query = scheduleWorkspaceQuerySchema.parse(req.query);
      const tenantId = query.tenantId?.trim() || defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "scheduleWorkspace" });
      const teamMemberIds = query.team
        ? query.team.split(",").map((value) => value.trim()).filter(Boolean)
        : [];
      const workspace = await operationsHub().getScheduleWorkspace({
        access,
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
        ...(teamMemberIds.length ? { teamMemberIds } : {})
      });
      res.json({ ok: true, tenantId: access.tenantId, actorRole: access.role, workspace });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/home", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "homeSnapshot" });
      const home = await operationsHub().getHomeSnapshot({ access });
      res.json({ ok: true, tenantId: access.tenantId, actorRole: access.role, home });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/activity", async (req: Request, res: Response) => {
    try {
      const query = activityFeedQuerySchema.parse(req.query);
      const tenantId = query.tenantId?.trim() || defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "activityFeed" });
      const entries = await operationsHub().getActivityFeed({
        access,
        ...(query.objectType ? { objectType: query.objectType } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {})
      });
      res.json({ ok: true, tenantId: access.tenantId, actorRole: access.role, entries });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/documentation-activity", async (req: Request, res: Response) => {
    try {
      const query = documentationActivityQuerySchema.parse(req.query);
      const tenantId = query.tenantId?.trim() || defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "documentationActivity" });
      const documentation = await operationsHub().getDocumentationActivity({
        access,
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {})
      });
      res.json({ ok: true, tenantId: access.tenantId, actorRole: access.role, documentation });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/notifications", async (req: Request, res: Response) => {
    try {
      const query = activityFeedQuerySchema.parse(req.query);
      const tenantId = query.tenantId?.trim() || defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "listNotifications" });
      const notifications = await operationsHub().getNotifications({
        access,
        ...(query.limit !== undefined ? { limit: query.limit } : {})
      });
      res.json({ ok: true, tenantId: access.tenantId, actorRole: access.role, ...notifications });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/notifications/read", async (req: Request, res: Response) => {
    try {
      const input = notificationActionBodySchema.parse(req.body);
      const tenantId = input.tenantId?.trim() || defaultTenantId(env);
      if (!input.notificationId) {
        throw new RailError("Notification id is required.", { provider: "native", op: "markNotificationRead", status: 400 });
      }
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "markNotificationRead" });
      await operationsHub().markNotificationRead({
        access,
        notificationId: input.notificationId
      });
      res.json({ ok: true, tenantId: access.tenantId, notificationId: input.notificationId });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/notifications/read-all", async (req: Request, res: Response) => {
    try {
      const input = notificationActionBodySchema.parse(req.body);
      const tenantId = input.tenantId?.trim() || defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "markAllNotificationsRead" });
      const markedCount = await operationsHub().markAllNotificationsRead({ access });
      res.json({ ok: true, tenantId: access.tenantId, markedCount });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
