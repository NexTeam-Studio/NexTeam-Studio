import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { addressSchema, clientCommunicationSettingsSchema, clientContactSchema, intakeSnapshotSchema, InMemoryEventBus, invoiceDeliveryPreferencesSchema, lineItemSchema, paymentSchedulePlanSchema, personNameSchema, quoteDiscountSchema, RailError, receiptReviewChannelSchema, type ApprovalQueueService, type Client, type CrmSettings, type EventBus, type Invoice, type QuoteDeliveryRecord, type Quote, type RequestForm, type ServiceRequest } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter, type NativeCrmRepository } from "@nexteam/providers";
import { actorIdForAccess, requireAccessContext, requireTenantRole } from "../../../auth/accessContext.js";
import { getAdminDb, getAdminStorageBucket } from "../../../firebase.js";
import { FieldDocsService } from "../../../fielddocs/fieldDocsService.js";
import { FirestoreMediaRepository, MemoryMediaRepository, type MediaRepository } from "../../../fielddocs/mediaRepository.js";
import { NexDocsService, portalDocumentHref } from "../../../fielddocs/nexDocsService.js";
import type { CommsRail } from "../../../comms/gmailRegistry.js";
import type { NexReachService } from "../../../content/nexreachService.js";
import { defaultTenantBranding, type PlatformRepository } from "../../../platform/repository.js";
import type { SitesRepository } from "../../../sites/repository.js";
import { fetchAddressSuggestions } from "../../../shared/addressLocation/geocodingService.js";
import { configuredTenantId } from "../../../core/tenantConfig.js";
import { ensureDocumentNumbers, reserveDocumentNumber } from "../../../shared/numbering/numberingService.js";
import { bookingTemplateVariables, communicationChannelEnabled, invoiceTemplateVariables, quoteTemplateVariables, renderTemplateText, resolveTemplateMessage } from "../areas/settings/components/tenantConfig/server/communicationTemplates.js";
import type { LedgerService } from "../areas/invoices/components/paymentRails/server/ledgerService.js";
import type { OperationsHubService } from "../areas/home/components/operationsHub/server/operationsHubService.js";
import { renderPortalAppointmentsHtml, renderPortalDocumentsHtml, renderPortalHomeHtml, renderPortalInvoicesHtml, renderPortalOptOutHtml, renderPortalQuotesHtml, renderUnifiedPortalDocumentsHtml, renderPortalReviewLandingHtml, renderPortalReverifyHtml } from "../../nexportal/components/portalCore/server/portalHubHtml.js";
import type { PortalHubService } from "../../nexportal/components/portalCore/server/portalHubService.js";
import type { PortalSessionRecord } from "../../nexportal/components/portalCore/server/portalHubRepository.js";
import type { ReviewSequenceService } from "../../../reputation/reviewSequenceService.js";
import { FirestoreNativeCrmRepository } from "../shared/persistence/nativeRepository.js";
import { archiveQuoteVersion, createPortalToken, ensureQuoteConfiguration, hashPortalToken, materializeQuoteRecord, portalQuoteApprovalInputSchema, portalQuoteChangeRequestInputSchema, portalUrlForQuote, quoteApprovalBlockedReason, quoteComposerInputSchema, quoteDeliveryMessage, quoteLocked, quoteRenewInputSchema, quoteTemplateInputSchema, syncExpiredQuote } from "../areas/quotes/components/quoteEngine/domain/quoteFoundation.js";
import { crmSettingsPatchSchema } from "../areas/settings/components/tenantConfig/domain/crmSettingsPatchSchema.js";
import { buildInvoiceDraftFromJobs, buildInvoiceDraftFromQuote, buildQuickPaymentRequestInvoice } from "../areas/invoices/components/invoiceStructure/domain/invoiceFoundation.js";
import { availableRequestFields, backfillLegacyLeads, buildServiceRequest, convertRequestToJob, convertRequestToQuote, ensureRequestForms, notifyRequestCreated, publicFormSubmissionValues, renderPublicRequestForm, requestFormEmbedCode, requestFormSharePath, selectRequestFields, updateServiceRequestShape } from "../areas/requests/components/requestCore/server/requestFoundation.js";
import type { JobLifecycleService } from "../areas/jobs/components/jobCore/server/jobLifecycleService.js";
import { renderInvoicePdf, renderInvoicePortalHtml } from "../areas/invoices/components/invoiceStructure/server/invoiceDocument.js";
import { renderQuotePdf, renderQuotePortalHtml } from "../areas/quotes/components/quoteEngine/server/quoteDocument.js";
import { capturePaypalCheckoutOrder, createPaypalCheckoutOrder } from "../areas/invoices/components/paymentRails/server/paypal.js";
import { createStripeCheckoutSession, verifyStripeWebhookEvent } from "../areas/invoices/components/paymentRails/server/stripe.js";
import type { quickPaymentRequestBodySchema } from "../areas/invoices/components/paymentRails/server/routeSchemas.js";
import type { createRequestBodySchema } from "../areas/requests/components/requestCore/server/routeSchemas.js";

export interface CrmRouteDeps {
  approvalQueue: ApprovalQueueService;
  eventBus?: EventBus | undefined;
  memoryRepository?: NativeCrmRepository | undefined;
  fieldDocsRepository?: MediaRepository | undefined;
  nexDocsService?: NexDocsService | undefined;
  platformRepository?: Pick<PlatformRepository, "listTenantUsers" | "getTenantBranding"> | undefined;
  sitesRepository?: Pick<SitesRepository, "listLeads"> | undefined;
  commsRail?: CommsRail | undefined;
  jobLifecycleService?: JobLifecycleService | undefined;
  ledgerService?: Pick<LedgerService, "getInvoice" | "getInvoiceDetail" | "updateInvoiceDraft" | "sendInvoice" | "updateReceiptReviewDraft" | "sendReceiptReview" | "listInvoices" | "listPayments" | "listDeposits" | "listRefunds" | "listCredits" | "listReceiptReviews" | "getPaymentDetail" | "recordInvoicePayment" | "performLedgerAction" | "createPendingStripeCheckout" | "markStripeCheckoutPaid" | "syncQuoteDepositBridge" | "syncInvoiceAfterCreate" | "composeInvoiceFromJobs"> | undefined;
  portalHubService?: PortalHubService | undefined;
  reviewSequenceService?: ReviewSequenceService | undefined;
  nexReachService?: Pick<NexReachService, "handleConsentChange"> | undefined;
  operationsHubService?: OperationsHubService | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return configuredTenantId(env, "crmRoute");
}

function publicOrigin(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${forwardedProto || req.protocol}://${req.get("host") ?? "localhost:3000"}`;
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : error instanceof z.ZodError ? 400 : 500;
  const message = error instanceof z.ZodError
    ? error.issues.map((issue) => issue.message).join(" ")
    : error instanceof Error
      ? error.message
      : "Unknown CRM route error";
  res.status(status).json({ ok: false, error: message });
}

function sanitizeFieldVisibility(visibility?: {
  request?: boolean | undefined;
  quote?: boolean | undefined;
  job?: boolean | undefined;
  visit?: boolean | undefined;
  invoice?: boolean | undefined;
}): {
  request?: boolean;
  quote?: boolean;
  job?: boolean;
  visit?: boolean;
  invoice?: boolean;
} | undefined {
  if (!visibility) {
    return undefined;
  }
  const next = {
    ...(visibility.request !== undefined ? { request: visibility.request } : {}),
    ...(visibility.quote !== undefined ? { quote: visibility.quote } : {}),
    ...(visibility.job !== undefined ? { job: visibility.job } : {}),
    ...(visibility.visit !== undefined ? { visit: visibility.visit } : {}),
    ...(visibility.invoice !== undefined ? { invoice: visibility.invoice } : {})
  };
  return Object.keys(next).length ? next : undefined;
}

export function createCrmRouteContext(app: Express, deps: CrmRouteDeps) {
  const env = deps.env ?? process.env;
  const fallbackRepository = deps.memoryRepository ?? new MemoryNativeCrmRepository();
  const fallbackFieldDocsRepository = deps.fieldDocsRepository ?? new MemoryMediaRepository();
  const eventBus = deps.eventBus ?? new InMemoryEventBus();

  function repositoryForTenant(): NativeCrmRepository {
    const db = getAdminDb(env);
    return db ? new FirestoreNativeCrmRepository(db) : fallbackRepository;
  }

  function providerForTenant(tenantId: string): NativeAdapter {
    return new NativeAdapter(repositoryForTenant(), tenantId);
  }

  function fieldDocsRepository(): MediaRepository {
    const db = getAdminDb(env);
    return db ? new FirestoreMediaRepository(db) : fallbackFieldDocsRepository;
  }

  function fieldDocsService(): FieldDocsService {
    return new FieldDocsService({
      mediaRepository: fieldDocsRepository(),
      crmRepository: repositoryForTenant()
    });
  }

  function nexDocsService(): NexDocsService {
    return deps.nexDocsService ?? new NexDocsService({
      mediaRepository: fieldDocsRepository(),
      crmRepository: repositoryForTenant(),
      ledgerService: deps.ledgerService
    });
  }

  function jobLifecycle(): JobLifecycleService {
    if (!deps.jobLifecycleService) {
      throw new RailError("Job lifecycle service is not wired for this tenant yet.", { provider: "native", op: "jobLifecycle", status: 501 });
    }
    return deps.jobLifecycleService;
  }

  function ledger() {
    if (!deps.ledgerService) {
      throw new RailError("Ledger service is not wired for this tenant yet.", { provider: "native", op: "ledger", status: 501 });
    }
    return deps.ledgerService;
  }

  function operationsHub(): OperationsHubService {
    if (!deps.operationsHubService) {
      throw new RailError("Operations hub service is not wired for this tenant yet.", { provider: "native", op: "operationsHub", status: 501 });
    }
    return deps.operationsHubService;
  }

  function portalHub(): PortalHubService {
    if (!deps.portalHubService) {
      throw new RailError("Portal hub service is not wired for this tenant yet.", { provider: "native", op: "portalHub", status: 501 });
    }
    return deps.portalHubService;
  }

  function reviewSequences(): ReviewSequenceService {
    if (!deps.reviewSequenceService) {
      throw new RailError("Review sequence service is not wired for this tenant yet.", { provider: "native", op: "reviewSequence", status: 501 });
    }
    return deps.reviewSequenceService;
  }

  function parseStorageRef(storageRef: string): { bucketName: string; objectPath: string } | null {
    const match = storageRef.match(/^gs:\/\/([^/]+)\/(.+)$/);
    return match ? { bucketName: match[1]!, objectPath: match[2]! } : null;
  }

  async function sendPortalNexDocsFile(res: Response, input: {
    storageRef: string;
    fallbackFileName: string;
    fallbackMimeType: string;
  }): Promise<void> {
    const storageRef = parseStorageRef(input.storageRef);
    if (!storageRef) {
      throw new RailError("NexDocs file is missing a valid storage reference.", { provider: "firebase", op: "portalFetchNexDocsFile", status: 409 });
    }
    const bucket = getAdminStorageBucket(env);
    if (!bucket) {
      throw new RailError("Firebase Storage is not configured for NexDocs file reads.", { provider: "firebase", op: "portalFetchNexDocsFile", status: 503 });
    }
    if (bucket.name !== storageRef.bucketName) {
      throw new RailError("NexDocs file is stored in a different Firebase bucket.", { provider: "firebase", op: "portalFetchNexDocsFile", status: 409 });
    }
    const file = bucket.file(storageRef.objectPath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new RailError("NexDocs file was not found in Storage.", { provider: "firebase", op: "portalFetchNexDocsFile", status: 404 });
    }
    const [metadata] = await file.getMetadata();
    res.setHeader("content-type", String(metadata.contentType ?? input.fallbackMimeType));
    res.setHeader("content-disposition", `inline; filename="${input.fallbackFileName.replace(/"/g, "")}"`);
    file.createReadStream().pipe(res);
  }

  async function tenantBranding(tenantId: string) {
    return await deps.platformRepository?.getTenantBranding(tenantId) ?? defaultTenantBranding(tenantId);
  }

  async function createQuickPaymentRequestRecord(input: {
    tenantId: string;
    clientId: string;
    title: string;
    amount: number;
    memo?: string | undefined;
    jobId?: string | undefined;
    requestId?: string | undefined;
    actorId: string;
    delivery?: z.infer<typeof quickPaymentRequestBodySchema>["delivery"];
    publicBaseUrl: string;
  }): Promise<{
    invoice: Invoice;
    delivery?: { mode: "email" | "sms" | "mark_sent"; target?: string | undefined } | undefined;
    portalUrl?: string | undefined;
    preview?: { title: string; body: string } | undefined;
  }> {
    const repository = repositoryForTenant();
    const provider = providerForTenant(input.tenantId);
    const settings = await repository.getCrmSettings(input.tenantId);
    const created = await provider.createInvoice(buildQuickPaymentRequestInvoice({
      tenantId: input.tenantId,
      clientId: input.clientId,
      settings,
      number: await reserveDocumentNumber(repository, input.tenantId, "invoice"),
      title: input.title,
      amount: input.amount,
      ...(input.memo?.trim() ? { memo: input.memo.trim() } : {}),
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {})
    }));
    const synced = await ledger().syncInvoiceAfterCreate(created);
    if (!input.delivery || input.delivery.mode === "draft") {
      return { invoice: synced };
    }
    const sent = await ledger().sendInvoice({
      tenantId: input.tenantId,
      invoiceId: synced.id,
      mode: input.delivery.mode,
      actorId: input.actorId,
      publicBaseUrl: input.publicBaseUrl,
      ...(input.delivery.target?.trim() ? { target: input.delivery.target.trim() } : {}),
      ...(input.delivery.subject?.trim() ? { subject: input.delivery.subject.trim() } : {}),
      ...(input.delivery.bodyText?.trim() ? { bodyText: input.delivery.bodyText.trim() } : {})
    });
    return {
      invoice: sent.invoice,
      portalUrl: sent.portalUrl,
      delivery: {
        mode: sent.delivery.mode,
        ...(sent.delivery.target ? { target: sent.delivery.target } : {})
      },
      preview: {
        title: sent.delivery.subject ?? sent.invoice.title,
        body: input.delivery.bodyText?.trim() ?? ""
      }
    };
  }

  function portalTenantId(req: Request): string {
    return typeof req.query.tenantId === "string" && req.query.tenantId.trim()
      ? req.query.tenantId
      : defaultTenantId(env);
  }

  function portalSessionDestination(session: PortalSessionRecord): string {
    if (session.sourceObjectType === "quote" && session.sourceObjectId) {
      return `/nexportal/quotes/${encodeURIComponent(session.sourceObjectId)}`;
    }
    if (session.sourceObjectType === "invoice" && session.sourceObjectId) {
      return `/nexportal/invoices/${encodeURIComponent(session.sourceObjectId)}`;
    }
    return "/nexportal";
  }

  function portalPathWithTenant(tenantId: string, path: string, search?: URLSearchParams): string {
    const query = search ?? new URLSearchParams();
    if (!query.get("tenantId")) {
      query.set("tenantId", tenantId);
    }
    return `${path}?${query.toString()}`;
  }

  async function assignedTechniciansByVisitId(tenantId: string, visitIds: Array<{ id: string; assignedTo: string[] }>): Promise<Record<string, string[]>> {
    const users = deps.platformRepository ? await deps.platformRepository.listTenantUsers(tenantId) : [];
    const byId = new Map(users.map((user) => [user.id, user.displayName]));
    return Object.fromEntries(
      visitIds.map((visit) => [
        visit.id,
        visit.assignedTo.map((id) => {
          const displayName = byId.get(id) ?? id;
          return displayName.split(/\s+/)[0] ?? displayName;
        })
      ])
    );
  }

  async function requirePortalSession(req: Request): Promise<{ tenantId: string; session: PortalSessionRecord; needsReverify: boolean }> {
    const tenantId = portalTenantId(req);
    const authenticated = await portalHub().authenticateCookie({
      tenantId,
      cookieHeader: req.header("cookie")
    });
    if (!authenticated) {
      throw new RailError("Portal access is not active on this device. Open the latest magic link to continue.", { provider: "native", op: "portalSession", status: 401 });
    }
    return {
      tenantId,
      session: authenticated.session,
      needsReverify: authenticated.needsReverify
    };
  }

  async function buildPortalSnapshotOrRedirect(req: Request, res: Response): Promise<{
    tenantId: string;
    session: PortalSessionRecord;
    snapshot: Awaited<ReturnType<PortalHubService["buildSnapshot"]>>;
  } | null> {
    const portalAccess = await requirePortalSession(req);
    if (portalAccess.needsReverify) {
      const query = new URLSearchParams({
        tenantId: portalAccess.tenantId,
        returnPath: req.originalUrl
      });
      res.redirect(303, `/nexportal/reverify?${query.toString()}`);
      return null;
    }
    const snapshot = await portalHub().buildSnapshot({
      tenantId: portalAccess.tenantId,
      session: portalAccess.session
    });
    return {
      tenantId: portalAccess.tenantId,
      session: portalAccess.session,
      snapshot
    };
  }

  async function requireQuoteAccess(req: Request, tenantId: string, op: string) {
    return requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op });
  }

  async function requireBillingAccess(req: Request, tenantId: string, op: string) {
    return requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op });
  }

  async function getQuoteAndClient(tenantId: string, quoteId: string): Promise<{ provider: NativeAdapter; quote: Quote; client?: Client }> {
    const provider = providerForTenant(tenantId);
    const repository = repositoryForTenant();
    const existing = await repository.getQuote(tenantId, quoteId);
    const quote = existing ? await syncExpiredQuote(repository, existing) : null;
    if (!quote) {
      throw new RailError(`Native quote ${quoteId} was not found.`, { provider: "native", op: "getQuote", status: 404 });
    }
    const clients = await provider.getClients("");
    const client = clients.find((candidate) => candidate.id === quote.clientId);
    return client ? { provider, quote, client } : { provider, quote };
  }

  async function getInvoiceAndClient(tenantId: string, invoiceId: string): Promise<{ provider: NativeAdapter; invoice: Invoice; client?: Client }> {
    const provider = providerForTenant(tenantId);
    const invoice = deps.ledgerService
      ? await ledger().getInvoice(tenantId, invoiceId)
      : (await provider.getInvoices()).find((candidate) => candidate.id === invoiceId) ?? null;
    if (!invoice) {
      throw new RailError(`Native invoice ${invoiceId} was not found.`, { provider: "native", op: "getInvoice", status: 404 });
    }
    const clients = await provider.getClients("");
    const client = clients.find((candidate) => candidate.id === invoice.clientId);
    return client ? { provider, invoice, client } : { provider, invoice };
  }

  async function getRequestOrThrow(tenantId: string, requestId: string): Promise<ServiceRequest> {
    const request = await repositoryForTenant().getRequest(tenantId, requestId);
    if (!request) {
      throw new RailError(`Native request ${requestId} was not found.`, { provider: "native", op: "getRequest", status: 404 });
    }
    return request;
  }

  async function createAndNotifyRequest(input: z.infer<typeof createRequestBodySchema>): Promise<ServiceRequest> {
    const tenantId = input.tenantId ?? defaultTenantId(env);
    const repository = repositoryForTenant();
    const built = await buildServiceRequest(repository, {
      tenantId,
      source: input.source,
      formId: input.formId,
      formSlug: input.formSlug,
      subject: input.subject,
      narrative: input.narrative,
      selectedClientId: input.selectedClientId,
      selectedPropertyId: input.selectedPropertyId,
      consent: input.consent,
      allowIncomplete: input.allowIncomplete,
      fieldValues: input.fieldValues.map((field) => ({
        key: field.key,
        value: field.value,
        ...(sanitizeFieldVisibility(field.visibility) ? { visibility: sanitizeFieldVisibility(field.visibility) } : {})
      }))
    });
    const created = await repository.createRequest(built);
    await eventBus.emit({
      tenantId: created.tenantId,
      type: "request.created",
      payload: {
        requestId: created.id,
        clientName: created.clientName,
        source: created.source,
        ...(created.email ? { email: created.email } : {}),
        ...(created.phone ? { phone: created.phone } : {})
      }
    });
    const notified = await notifyRequestCreated(created, {
      approvalQueue: deps.approvalQueue,
      commsRail: deps.commsRail,
      platformRepository: deps.platformRepository,
      crmRepository: repository
    });
    if (notified.notifications && (
      notified.notifications.adminNotifiedAt !== created.notifications?.adminNotifiedAt
      || notified.notifications.clientConfirmationAt !== created.notifications?.clientConfirmationAt
    )) {
      return repository.updateRequest(created.id, {
        tenantId: created.tenantId,
        notifications: notified.notifications,
        updatedAt: notified.updatedAt
      });
    }
    return created;
  }

  async function sendQuoteDelivery(input: {
    quote: Quote;
    client?: Client | undefined;
    settings?: CrmSettings | undefined;
    mode: "email" | "sms" | "mark_sent";
    target?: string | undefined;
    note?: string | undefined;
    subject?: string | undefined;
    bodyText?: string | undefined;
    actorId: string;
  }): Promise<{ quote: Quote; portalUrl: string; delivery: QuoteDeliveryRecord }> {
    const provider = providerForTenant(input.quote.tenantId);
    const portalToken = createPortalToken();
    const portalUrl = portalUrlForQuote(input.quote, portalToken);
    const fallback = quoteDeliveryMessage(input.quote, input.mode === "mark_sent" ? "email" : input.mode, portalUrl);
    const rendered = resolveTemplateMessage({
      settings: input.settings,
      category: "quote_send",
      channel: input.mode === "sms" ? "sms" : "email",
      fallbackSubject: fallback.subject,
      fallbackBodyText: fallback.bodyText,
      variables: quoteTemplateVariables({
        quote: input.quote,
        client: input.client,
        portalUrl
      })
    });
    if (input.mode !== "mark_sent" && !rendered.enabled) {
      throw new RailError(`The quote ${input.mode} channel is disabled in Settings.`, { provider: "native", op: "sendQuote", status: 409 });
    }
    const subject = input.subject?.trim() || rendered.subject;
    const bodyText = input.bodyText?.trim() || rendered.bodyText;
    const sentAt = new Date().toISOString();
    const delivery: QuoteDeliveryRecord = {
      id: `quote_delivery_${randomUUID()}`,
      mode: input.mode,
      sentAt,
      ...(input.target ? { target: input.target } : {}),
      sentBy: input.actorId,
      ...(subject ? { subject } : {}),
      ...(input.note ? { note: input.note } : {})
    };
    if (input.mode === "email") {
      const target = input.target?.trim() || input.client?.emails[0];
      if (!target) {
        throw new RailError("An email destination is required to send this quote.", { provider: "native", op: "sendQuoteEmail", status: 400 });
      }
      if (!deps.commsRail?.sendAdapter) {
        throw new RailError("Email delivery is not configured for this tenant.", { provider: "native", op: "sendQuoteEmail", status: 501 });
      }
      const receipt = await deps.commsRail.sendAdapter.sendEmail({
        tenantId: input.quote.tenantId,
        mailbox: deps.commsRail.sendAdapter.mailbox,
        to: [target],
        subject,
        bodyText
      });
      delivery.target = target;
      delivery.receiptId = receipt.id;
    } else if (input.mode === "sms") {
      const target = input.target?.trim() || input.client?.phones[0];
      if (!target) {
        throw new RailError("A phone number is required to text this quote.", { provider: "native", op: "sendQuoteSms", status: 400 });
      }
      if (!deps.commsRail?.sendSms) {
        throw new RailError("SMS delivery is not configured for this tenant.", { provider: "native", op: "sendQuoteSms", status: 501 });
      }
      const receipt = await deps.commsRail.sendSms({
        tenantId: input.quote.tenantId,
        to: target,
        body: bodyText
      });
      delivery.target = target;
      delivery.receiptId = receipt.id;
    }
    const saved = await provider.updateQuote(input.quote.id, {
      status: "sent",
      sentAt,
      updatedAt: sentAt,
      portal: {
        ...(input.quote.portal ?? {}),
        tokenHash: hashPortalToken(portalToken),
        tokenIssuedAt: sentAt
      },
      delivery: [...(input.quote.delivery ?? []), delivery]
    });
    await eventBus.emit({
      tenantId: saved.tenantId,
      type: "quote.sent",
      payload: {
        quoteId: saved.id,
        mode: input.mode,
        sentAt,
        ...(delivery.target ? { target: delivery.target } : {})
      }
    });
    return { quote: saved, portalUrl, delivery };
  }

  async function createInvoiceCheckout(input: {
    tenantId: string;
    invoice: Invoice;
    req: Request;
    provider: "stripe" | "paypal";
    method: "card" | "paypal" | "venmo";
    portalToken?: string | undefined;
    tipAmount?: number | undefined;
    successPath?: string | undefined;
    cancelPath?: string | undefined;
    paypalReturnPath?: string | undefined;
  }): Promise<{
    invoice: Invoice;
    checkout: {
      provider: "stripe" | "paypal";
      method: "card" | "paypal" | "venmo";
      sessionId?: string | undefined;
      orderId?: string | undefined;
      url: string | null;
    };
  }> {
    const provider = providerForTenant(input.tenantId);
    if (input.invoice.status === "paid" || input.invoice.status === "void" || input.invoice.status === "bad_debt") {
      throw new RailError("Only open invoices can create checkout sessions.", {
        provider: input.provider,
        op: "createInvoiceCheckout",
        status: 409
      });
    }
    const tipAmount = Number((input.tipAmount ?? 0).toFixed(2));
    if (tipAmount < 0) {
      throw new RailError("Tip amount must be zero or greater.", {
        provider: input.provider,
        op: "createInvoiceCheckout",
        status: 400
      });
    }
    const totalCheckoutAmount = Number(((input.invoice.ledger?.balanceDue ?? input.invoice.totals.total) + tipAmount).toFixed(2));
    if (input.provider === "stripe") {
      const session = await createStripeCheckoutSession(env, input.invoice, input.req, {
        ...(input.portalToken ? { portalToken: input.portalToken } : {}),
        ...(input.successPath ? { successPath: input.successPath } : {}),
        ...(input.cancelPath ? { cancelPath: input.cancelPath } : {}),
        ...(tipAmount > 0 ? { tipAmount, amountOverride: totalCheckoutAmount } : {})
      });
      const updatedInvoice = await provider.updateInvoice(input.invoice.id, {
        externalIds: { ...(input.invoice.externalIds ?? {}), stripe: session.id }
      });
      if (deps.ledgerService) {
        await ledger().createPendingStripeCheckout({
          tenantId: input.tenantId,
          invoiceId: updatedInvoice.id,
          checkoutSessionId: session.id,
          amount: totalCheckoutAmount,
          ...(tipAmount > 0 ? { tipAmount } : {})
        });
      }
  return {
        invoice: updatedInvoice,
        checkout: {
          provider: "stripe",
          method: "card",
          sessionId: session.id,
          url: session.url
        }
      };
    }
    const paypalMethod = input.method === "venmo" ? "venmo" : "paypal";
    const { order, approveUrl } = await createPaypalCheckoutOrder({
      env,
      invoice: input.invoice,
      req: input.req,
      method: paypalMethod,
      ...(input.portalToken ? { portalToken: input.portalToken } : {}),
      ...(input.paypalReturnPath ? { returnPath: input.paypalReturnPath } : {}),
      ...(input.cancelPath ? { cancelPath: input.cancelPath } : {}),
      ...(tipAmount > 0 ? { tipAmount, amountOverride: totalCheckoutAmount } : {})
    });
    return {
      invoice: input.invoice,
      checkout: {
        provider: "paypal",
        method: paypalMethod,
        orderId: order.id,
        url: approveUrl
      }
    };
  }

  function formPresentation(form: RequestForm): { sharePath: string; embedCode: string } {
    const origin = env.NEXOPS_PUBLIC_BASE_URL?.trim() || "http://127.0.0.1:4175";
    return {
      sharePath: requestFormSharePath(form),
      embedCode: requestFormEmbedCode(form, origin)
    };
  }

  return {
    FieldDocsService,
    FirestoreMediaRepository,
    FirestoreNativeCrmRepository,
    InMemoryEventBus,
    MemoryMediaRepository,
    MemoryNativeCrmRepository,
    NativeAdapter,
    NexDocsService,
    RailError,
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
    communicationChannelEnabled,
    convertRequestToJob,
    convertRequestToQuote,
    createAndNotifyRequest,
    createInvoiceCheckout,
    createPaypalCheckoutOrder,
    createPortalToken,
    createQuickPaymentRequestRecord,
    createStripeCheckoutSession,
    crmSettingsPatchSchema,
    defaultTenantBranding,
    defaultTenantId,
    deps,
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
    hashPortalToken,
    intakeSnapshotSchema,
    invoiceDeliveryPreferencesSchema,
    invoiceTemplateVariables,
    jobLifecycle,
    ledger,
    lineItemSchema,
    materializeQuoteRecord,
    nexDocsService,
    notifyRequestCreated,
    operationsHub,
    parseStorageRef,
    paymentSchedulePlanSchema,
    personNameSchema,
    portalDocumentHref,
    portalHub,
    portalPathWithTenant,
    portalQuoteApprovalInputSchema,
    portalQuoteChangeRequestInputSchema,
    portalSessionDestination,
    portalTenantId,
    portalUrlForQuote,
    providerForTenant,
    publicFormSubmissionValues,
    publicOrigin,
    quoteApprovalBlockedReason,
    quoteComposerInputSchema,
    quoteDeliveryMessage,
    quoteDiscountSchema,
    quoteLocked,
    quoteRenewInputSchema,
    quoteTemplateInputSchema,
    quoteTemplateVariables,
    randomUUID,
    receiptReviewChannelSchema,
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
    requestFormEmbedCode,
    requestFormSharePath,
    requireAccessContext,
    requireBillingAccess,
    requirePortalSession,
    requireQuoteAccess,
    requireTenantRole,
    reserveDocumentNumber,
    resolveTemplateMessage,
    reviewSequences,
    sanitizeFieldVisibility,
    selectRequestFields,
    sendPortalNexDocsFile,
    sendQuoteDelivery,
    sendRouteError,
    syncExpiredQuote,
    tenantBranding,
    updateServiceRequestShape,
    verifyStripeWebhookEvent,
    z,
  };
}

export type CrmRouteContext = ReturnType<typeof createCrmRouteContext>;
