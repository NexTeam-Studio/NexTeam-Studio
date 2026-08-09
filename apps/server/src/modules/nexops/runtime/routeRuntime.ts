import { randomUUID } from "node:crypto";
import type { Express, Request } from "express";
import { z } from "zod";
import { addressSchema, clientCommunicationSettingsSchema, clientContactSchema, intakeSnapshotSchema, InMemoryEventBus, invoiceDeliveryPreferencesSchema, lineItemSchema, paymentSchedulePlanSchema, personNameSchema, quoteDiscountSchema, RailError, receiptReviewChannelSchema } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { actorIdForAccess, requireAccessContext, requireTenantRole } from "../../../auth/accessContext.js";
import { getAdminDb, getAdminStorageBucket } from "../../../firebase.js";
import { FieldDocsService } from "../../../fielddocs/fieldDocsService.js";
import { FirestoreMediaRepository, MemoryMediaRepository } from "../../../fielddocs/mediaRepository.js";
import { NexDocsService, portalDocumentHref } from "../../../fielddocs/nexDocsService.js";
import { defaultTenantBranding } from "../../../platform/repository.js";
import { fetchAddressSuggestions } from "../../../shared/addressLocation/geocodingService.js";
import { ensureDocumentNumbers, reserveDocumentNumber } from "../../../shared/numbering/numberingService.js";
import { bookingTemplateVariables, communicationChannelEnabled, invoiceTemplateVariables, quoteTemplateVariables, renderTemplateText, resolveTemplateMessage } from "../areas/settings/components/tenantConfig/server/communicationTemplates.js";
import { renderPortalAppointmentsHtml, renderPortalDocumentsHtml, renderPortalHomeHtml, renderPortalInvoicesHtml, renderPortalOptOutHtml, renderPortalQuotesHtml, renderUnifiedPortalDocumentsHtml, renderPortalReviewLandingHtml, renderPortalReverifyHtml } from "../../nexportal/components/portalCore/server/portalHubHtml.js";
import { FirestoreNativeCrmRepository } from "../shared/persistence/nativeRepository.js";
import { archiveQuoteVersion, createPortalToken, ensureQuoteConfiguration, hashPortalToken, materializeQuoteRecord, portalQuoteApprovalInputSchema, portalQuoteChangeRequestInputSchema, portalUrlForQuote, quoteApprovalBlockedReason, quoteComposerInputSchema, quoteDeliveryMessage, quoteLocked, quoteRenewInputSchema, quoteTemplateInputSchema, syncExpiredQuote } from "../areas/quotes/components/quoteEngine/domain/quoteFoundation.js";
import { crmSettingsPatchSchema } from "../areas/settings/components/tenantConfig/domain/crmSettingsPatchSchema.js";
import { buildInvoiceDraftFromJobs, buildInvoiceDraftFromQuote, buildQuickPaymentRequestInvoice } from "../areas/invoices/components/invoiceStructure/domain/invoiceFoundation.js";
import { availableRequestFields, backfillLegacyLeads, buildServiceRequest, convertRequestToJob, convertRequestToQuote, ensureRequestForms, notifyRequestCreated, publicFormSubmissionValues, renderPublicRequestForm, requestFormEmbedCode, requestFormSharePath, selectRequestFields, updateServiceRequestShape } from "../areas/requests/components/requestCore/server/requestFoundation.js";
import { renderInvoicePdf, renderInvoicePortalHtml } from "../areas/invoices/components/invoiceStructure/server/invoiceDocument.js";
import { renderQuotePdf, renderQuotePortalHtml } from "../areas/quotes/components/quoteEngine/server/quoteDocument.js";
import { capturePaypalCheckoutOrder, createPaypalCheckoutOrder } from "../areas/invoices/components/paymentRails/server/paypal.js";
import { createStripeCheckoutSession, verifyStripeWebhookEvent } from "../areas/invoices/components/paymentRails/server/stripe.js";
import { createCrmRouteServices, type CrmRouteDeps } from "../shared/runtime/routeComposition.js";
import { createPortalRouteSupport } from "../../nexportal/components/portalCore/server/routeSupport.js";
import { createPaymentRouteSupport } from "../areas/invoices/components/paymentRails/server/routeSupport.js";
import { createRequestRouteSupport, sanitizeFieldVisibility } from "../areas/requests/components/requestCore/server/routeSupport.js";
import { createQuoteRouteSupport } from "../areas/quotes/components/quoteEngine/server/routeSupport.js";
import { createInvoiceRouteSupport } from "../areas/invoices/components/invoiceStructure/server/routeSupport.js";
import { defaultCrmTenantId, publicRequestOrigin, requireOfficeAccess, sendCrmRouteError } from "../shared/runtime/routeHttpSupport.js";
import { AgreementService, agreementCreateInputSchema, agreementPatchInputSchema } from "../shared/agreements/agreementFoundation.js";

export type { CrmRouteDeps } from "../shared/runtime/routeComposition.js";

export function createCrmRouteContext(app: Express, deps: CrmRouteDeps) {
  const defaultTenantId = defaultCrmTenantId;
  const publicOrigin = publicRequestOrigin;
  const sendRouteError = sendCrmRouteError;
  const {
    agreementService,
    env,
    eventBus,
    fallbackFieldDocsRepository,
    fallbackRepository,
    fieldDocsRepository,
    fieldDocsService,
    jobLifecycle,
    ledger,
    nexDocsService,
    operationsHub,
    portalHub,
    providerForTenant,
    repositoryForTenant,
    reviewSequences
  } = createCrmRouteServices(deps);
  const {
    assignedTechniciansByVisitId,
    buildPortalSnapshotOrRedirect,
    parseStorageRef,
    portalPathWithTenant,
    portalSessionDestination,
    portalTenantId,
    requirePortalSession,
    sendPortalNexDocsFile,
    tenantBranding
  } = createPortalRouteSupport({ env, platformRepository: deps.platformRepository, portalHub });
  const { createInvoiceCheckout, createQuickPaymentRequestRecord } = createPaymentRouteSupport({
    env,
    providerForTenant,
    repositoryForTenant,
    ledger,
    hasLedgerService: Boolean(deps.ledgerService),
    stripeConnectedAccountForTenant: async (tenantId) => {
      const tenant = await deps.platformRepository?.getTenant(tenantId);
      return tenant?.payments?.stripeConnect?.accountId;
    }
  });
  const { createAndNotifyRequest, formPresentation, getRequestOrThrow } = createRequestRouteSupport({
    env,
    deps,
    eventBus,
    repositoryForTenant,
    defaultTenantId
  });
  const { getQuoteAndClient, sendQuoteDelivery } = createQuoteRouteSupport({
    providerForTenant,
    repositoryForTenant,
    eventBus,
    commsRail: deps.commsRail
  });
  const { getInvoiceAndClient } = createInvoiceRouteSupport({
    providerForTenant,
    ledger,
    hasLedgerService: Boolean(deps.ledgerService)
  });

  async function requireQuoteAccess(req: Request, tenantId: string, op: string) {
    return requireOfficeAccess(req, env, tenantId, op);
  }

  async function requireBillingAccess(req: Request, tenantId: string, op: string) {
    return requireOfficeAccess(req, env, tenantId, op);
  }

  return {
    FieldDocsService,
    AgreementService,
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
    agreementCreateInputSchema,
    agreementPatchInputSchema,
    agreementService,
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
