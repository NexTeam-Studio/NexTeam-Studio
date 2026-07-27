import type { Request, Response } from "express";
import type { CrmRouteContext } from "../../../../../../../crm/routeRuntime.js";

export function registerJobCoreRoutes(context: CrmRouteContext): void {
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

  app.get("/api/crm/jobs", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const jobs = await jobLifecycle().listJobs(tenantId);
      res.json({ ok: true, jobs });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/jobs/:id", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "getJobDetail", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      if (!job) {
        throw new RailError(`Native job ${jobId} was not found.`, { provider: "native", op: "getJobDetail", status: 404 });
      }
      res.json({ ok: true, job });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs", async (req: Request, res: Response) => {
    try {
      const input = createJobBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "createJob");
      const created = await jobLifecycle().createJob({
        tenantId,
        clientId: input.clientId,
        ...(input.propertyId ? { propertyId: input.propertyId } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.quoteId ? { quoteId: input.quoteId } : {}),
        title: input.title,
        ...(input.lineItems ? { lineItems: input.lineItems } : {}),
        ...(input.paymentSchedule ? { paymentSchedule: input.paymentSchedule } : {}),
        ...(input.intake ? { intake: input.intake } : {}),
        createdBy: access.tenantUserId
      });
      const bundleAttachment = await fieldDocsService().maybeAttachBundleForJob({
        tenantId,
        job: created
      });
      const job = await jobLifecycle().getJobDetail(tenantId, created.id);
      res.status(201).json({
        ok: true,
        tenantId,
        actorRole: access.role,
        job: job ?? created,
        ...(bundleAttachment ? {
          fieldDocsBundle: {
            bundleId: bundleAttachment.bundle.id,
            checklistId: bundleAttachment.checklist.id,
            reportId: bundleAttachment.report.id,
            reportTemplateId: bundleAttachment.reportTemplate.id
          }
        } : {})
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/:id/quick-payment-request", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "createQuickPaymentRequest", status: 400 });
      }
      const input = quickPaymentRequestBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "createQuickPaymentRequest");
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      if (!job) {
        throw new RailError(`Native job ${jobId} was not found.`, { provider: "native", op: "createQuickPaymentRequest", status: 404 });
      }
      const result = await createQuickPaymentRequestRecord({
        tenantId,
        clientId: job.clientId,
        title: input.title.trim(),
        amount: input.amount,
        ...(input.memo?.trim() ? { memo: input.memo.trim() } : {}),
        jobId: job.id,
        ...(job.requestId ? { requestId: job.requestId } : {}),
        actorId: actorIdForAccess(access),
        delivery: input.delivery,
        publicBaseUrl: publicOrigin(req)
      });
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/jobs/:id", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "updateJob", status: 400 });
      }
      const input = updateJobBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "updateJob");
      const detail = await jobLifecycle().getJobDetail(tenantId, jobId);
      if (!detail) {
        throw new RailError(`Native job ${jobId} was not found.`, { provider: "native", op: "updateJob", status: 404 });
      }
      const provider = providerForTenant(tenantId);
      await provider.updateJob(jobId, {
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(input.paymentSchedule !== undefined ? { paymentSchedule: input.paymentSchedule } : {}),
        ...(input.clientVisibility !== undefined ? { clientVisibility: input.clientVisibility } : {}),
        updatedAt: new Date().toISOString()
      });
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      res.json({ ok: true, tenantId, actorRole: access.role, job });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/:id/action-preview", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "prepareJobActionPreview", status: 400 });
      }
      const input = jobActionSchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "prepareJobActionPreview");
      const preview = await jobLifecycle().prepareJobActionPreview(tenantId, jobId, input.action);
      res.json({ ok: true, tenantId, actorRole: access.role, preview });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/:id/actions", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "performJobAction", status: 400 });
      }
      const input = jobActionSchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "performJobAction");
      const result = await jobLifecycle().performJobAction({
        tenantId,
        jobId,
        action: input.action,
        actorId: access.tenantUserId
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
