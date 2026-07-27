import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { addressSchema, clientCommunicationSettingsSchema, clientContactSchema, intakeSnapshotSchema, InMemoryEventBus, invoiceDeliveryPreferencesSchema, lineItemSchema, paymentSchedulePlanSchema, personNameSchema, quoteDiscountSchema, RailError, receiptReviewChannelSchema, type ApprovalQueueService, type Client, type CrmSettings, type EventBus, type Invoice, type QuoteDeliveryRecord, type Quote, type RequestForm, type ServiceRequest } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter, type NativeCrmRepository } from "@nexteam/providers";
import { actorIdForAccess, requireAccessContext, requireTenantRole } from "../auth/accessContext.js";
import { getAdminDb, getAdminStorageBucket } from "../firebase.js";
import { FieldDocsService } from "../fielddocs/fieldDocsService.js";
import { FirestoreMediaRepository, MemoryMediaRepository, type MediaRepository } from "../fielddocs/mediaRepository.js";
import { NexDocsService, portalDocumentHref } from "../fielddocs/nexDocsService.js";
import type { CommsRail } from "../comms/gmailRegistry.js";
import type { NexReachService } from "../content/nexreachService.js";
import { defaultTenantBranding, type PlatformRepository } from "../platform/repository.js";
import type { SitesRepository } from "../sites/repository.js";
import { fetchAddressSuggestions } from "../shared/addressLocation/geocodingService.js";
import { configuredTenantId } from "../core/tenantConfig.js";
import { ensureDocumentNumbers, reserveDocumentNumber } from "./documentNumbering.js";
import { bookingTemplateVariables, communicationChannelEnabled, invoiceTemplateVariables, quoteTemplateVariables, renderTemplateText, resolveTemplateMessage } from "./communicationTemplates.js";
import type { LedgerService } from "./ledgerFoundation.js";
import type { OperationsHubService } from "./operationsHub.js";
import { renderPortalAppointmentsHtml, renderPortalDocumentsHtml, renderPortalHomeHtml, renderPortalInvoicesHtml, renderPortalOptOutHtml, renderPortalQuotesHtml, renderUnifiedPortalDocumentsHtml, renderPortalReviewLandingHtml, renderPortalReverifyHtml } from "./portalHubHtml.js";
import type { PortalHubService } from "./portalHubService.js";
import type { PortalSessionRecord } from "./portalHubRepository.js";
import type { ReviewSequenceService } from "./reviewSequenceService.js";
import { FirestoreNativeCrmRepository } from "./nativeRepository.js";
import { archiveQuoteVersion, createPortalToken, ensureQuoteConfiguration, hashPortalToken, materializeQuoteRecord, portalQuoteApprovalInputSchema, portalQuoteChangeRequestInputSchema, portalUrlForQuote, quoteApprovalBlockedReason, quoteComposerInputSchema, quoteDeliveryMessage, quoteLocked, quoteRenewInputSchema, quoteTemplateInputSchema, syncExpiredQuote } from "./quoteFoundation.js";
import { crmSettingsPatchSchema } from "../modules/nexops/areas/settings/components/tenantConfig/domain/crmSettingsPatchSchema.js";
import { buildInvoiceDraftFromJobs, buildInvoiceDraftFromQuote, buildQuickPaymentRequestInvoice } from "./invoiceFoundation.js";
import { availableRequestFields, backfillLegacyLeads, buildServiceRequest, convertRequestToJob, convertRequestToQuote, ensureRequestForms, notifyRequestCreated, publicFormSubmissionValues, renderPublicRequestForm, requestFormEmbedCode, requestFormSharePath, selectRequestFields, updateServiceRequestShape } from "./requestFoundation.js";
import type { JobLifecycleService } from "./jobLifecycle.js";
import { renderInvoicePdf, renderInvoicePortalHtml, renderQuotePdf, renderQuotePortalHtml } from "./quotePdf.js";
import { capturePaypalCheckoutOrder, createPaypalCheckoutOrder } from "./paypal.js";
import { createStripeCheckoutSession, verifyStripeWebhookEvent } from "./stripe.js";

const customFieldValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const createClientPrimaryPropertySchema = z.object({
  siteName: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  address: addressSchema,
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
  billingAddressSameAsClient: z.boolean().optional(),
  access: z.object({
    gateCode: z.string().optional(),
    accessNotes: z.string().optional()
  }).optional(),
  contacts: z.array(clientContactSchema).optional(),
  customFields: z.record(customFieldValueSchema).optional()
});

function hasClientCreatePhone(input: {
  phones?: string[] | undefined;
  contacts?: Array<{ phones?: Array<{ value?: string | undefined }> | undefined }> | undefined;
}): boolean {
  return (input.phones ?? []).some((phone) => phone.trim().length > 0)
    || (input.contacts ?? []).some((contact) => (contact.phones ?? []).some((phone) => (phone.value ?? "").trim().length > 0));
}

function hasClientCreateAddress(input: {
  billingAddress?: unknown;
  primaryProperty?: { address?: unknown } | undefined;
}): boolean {
  const billingAddress = input.billingAddress as { street1?: string } | undefined;
  const propertyAddress = input.primaryProperty?.address as { street1?: string } | undefined;
  return Boolean(
    billingAddress?.street1?.trim()
    || propertyAddress?.street1?.trim()
  );
}

const createClientBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  name: z.string().min(1),
  company: z.string().min(1).optional(),
  personName: personNameSchema.optional(),
  displayNamePreference: z.enum(["person", "company"]).optional(),
  billingAddress: addressSchema.optional(),
  billingSameAsPrimaryProperty: z.boolean().optional(),
  contacts: z.array(clientContactSchema).optional(),
  communicationSettings: clientCommunicationSettingsSchema.optional(),
  emails: z.array(z.string()).default([]),
  phones: z.array(z.string()).default([]),
  consent: z.object({ email: z.boolean(), sms: z.boolean(), marketing: z.boolean().default(false) }).default({ email: false, sms: false, marketing: false }),
  customFields: z.record(customFieldValueSchema).optional(),
  primaryProperty: createClientPrimaryPropertySchema.optional()
}).superRefine((input, ctx) => {
  if (!hasClientCreateAddress(input)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Address is required before a client can be saved.",
      path: ["primaryProperty", "address"]
    });
  }
  if (!hasClientCreatePhone(input)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Telephone is required before a client can be saved.",
      path: ["phones"]
    });
  }
});

const updateClientBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  company: z.string().min(1).nullable().optional(),
  personName: personNameSchema.optional(),
  displayNamePreference: z.enum(["person", "company"]).optional(),
  billingAddress: addressSchema.nullable().optional(),
  billingSameAsPrimaryProperty: z.boolean().optional(),
  contacts: z.array(clientContactSchema).optional(),
  communicationSettings: clientCommunicationSettingsSchema.optional(),
  emails: z.array(z.string()).optional(),
  phones: z.array(z.string()).optional(),
  customFields: z.record(customFieldValueSchema).optional(),
  consent: z.object({
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    marketing: z.boolean().optional()
  }).optional(),
  primaryProperty: createClientPrimaryPropertySchema.optional()
}).refine((input) => Boolean(
  input.name
  || input.company !== undefined
  || input.personName
  || input.displayNamePreference
  || input.billingAddress !== undefined
  || input.billingSameAsPrimaryProperty !== undefined
  || input.contacts
  || input.communicationSettings
  || input.emails
  || input.phones
  || input.consent
  || input.customFields
  || input.primaryProperty
), {
  message: "At least one client field update is required."
});

const createQuoteRouteBodySchema = quoteComposerInputSchema.extend({
  delivery: quoteComposerInputSchema.shape.delivery.default({ mode: "draft" })
});

const updateQuoteRouteBodySchema = quoteComposerInputSchema.partial().extend({
  tenantId: z.string().min(1).optional()
});

const quoteSendBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  mode: z.enum(["email", "sms", "mark_sent"]),
  target: z.string().optional(),
  note: z.string().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional()
});

const quoteManualApprovalBodySchema = z.object({
  tenantId: z.string().min(1).optional()
});

const createInvoiceFromQuoteBodySchema = z.object({
  tenantId: z.string().min(1).optional()
});
const paymentMethodDetailsBodySchema = z.object({
  checkNumber: z.string().optional(),
  bankTransferReference: z.string().optional(),
  otherReference: z.string().optional(),
  payerName: z.string().optional(),
  failureMessage: z.string().optional(),
  collectionChannel: z.enum(["hosted_link", "saved_card", "manual_entry", "tap_to_pay", "quick_request"]).optional(),
  deviceLabel: z.string().optional(),
  devicePlatform: z.string().optional(),
  requestMemo: z.string().optional()
});
const recordInvoicePaymentBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  amount: z.number().positive(),
  tipAmount: z.number().min(0).optional(),
  provider: z.enum(["stripe", "paypal", "manual", "quote_bridge"]).default("manual"),
  method: z.enum(["card", "ach", "cash", "check", "bank_transfer", "other", "paypal", "venmo"]),
  note: z.string().optional(),
  savedCardId: z.string().optional(),
  methodDetails: paymentMethodDetailsBodySchema.optional(),
  externalIds: z.object({
    stripeCheckoutSessionId: z.string().optional(),
    stripePaymentIntentId: z.string().optional(),
    paypalOrderId: z.string().optional(),
    paypalCaptureId: z.string().optional()
  }).optional(),
  status: z.enum(["succeeded", "failed"]).optional()
});
const updateInvoiceDraftBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  title: z.string().optional(),
  lineItems: z.array(lineItemSchema).optional(),
  discount: quoteDiscountSchema.optional(),
  taxRate: z.number().min(0).optional(),
  dueAt: z.string().optional(),
  terms: z.string().optional(),
  paymentSchedule: paymentSchedulePlanSchema.optional(),
  deliveryDefaults: invoiceDeliveryPreferencesSchema.optional()
});
const sendInvoiceBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  mode: z.enum(["email", "sms", "mark_sent"]),
  target: z.string().optional(),
  note: z.string().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  includePdf: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  includePayLink: z.boolean().optional(),
  includeHostedLink: z.boolean().optional()
});
const sendBookingConfirmationBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  mode: z.enum(["email", "sms"]),
  target: z.string().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  sendCopy: z.boolean().optional(),
  copyTarget: z.string().optional()
});
const invoiceCheckoutBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  provider: z.enum(["stripe", "paypal"]).default("stripe"),
  method: z.enum(["card", "paypal", "venmo"]).default("card"),
  tipAmount: z.coerce.number().min(0).optional()
});
const composeInvoiceFromJobsBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  jobIds: z.array(z.string().min(1)).min(1),
  title: z.string().optional(),
  discount: quoteDiscountSchema.optional(),
  taxRate: z.number().min(0).optional(),
  terms: z.string().optional(),
  paymentSchedule: paymentSchedulePlanSchema.optional()
});
const quickPaymentRequestBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  title: z.string().min(1),
  amount: z.number().positive(),
  memo: z.string().optional(),
  delivery: z.object({
    mode: z.enum(["draft", "email", "sms", "mark_sent"]).default("draft"),
    target: z.string().optional(),
    subject: z.string().optional(),
    bodyText: z.string().optional()
  }).optional()
});
const updateReceiptReviewBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  emailRecipients: z.array(z.string().email()).optional(),
  smsRecipients: z.array(z.string()).optional(),
  sendChannels: z.array(receiptReviewChannelSchema).optional(),
  attachmentIds: z.array(z.string().min(1)).optional()
});
const sendPortalLinkBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  target: z.string().optional(),
  preferredChannel: z.enum(["email", "sms"]).optional(),
  sourceObjectType: z.enum(["quote", "invoice"]).optional(),
  sourceObjectId: z.string().min(1).optional()
});
const clientStatementQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional()
});
const sendStatementBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  target: z.string().optional()
});
const startReviewSequenceBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  jobId: z.string().min(1),
  source: z.enum(["automatic", "manual"]).optional()
});
const reviewSequenceActionBodySchema = z.object({
  tenantId: z.string().min(1).optional()
});
const portalPhoneReverifyBodySchema = z.object({
  tenantId: z.string().min(1),
  sessionId: z.string().min(1),
  last4: z.string().min(4).max(4),
  returnPath: z.string().optional()
});
const portalSessionQuoteApprovalBodySchema = portalQuoteApprovalInputSchema.omit({
  token: true
});
const portalSessionQuoteChangeRequestBodySchema = portalQuoteChangeRequestInputSchema.omit({
  token: true
});
const portalNexDocsUploadBodySchema = z.object({
  tenantId: z.string().min(1),
  folderId: z.string().min(1).optional(),
  label: z.string().trim().min(1).optional(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileBase64: z.string().min(1)
});
const refundPaymentBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  reason: z.string().optional()
});
const invoiceLedgerActionBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  reason: z.string().optional()
});

const requestFieldInputSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string().min(1))]),
  visibility: z.object({
    request: z.boolean().optional(),
    quote: z.boolean().optional(),
    job: z.boolean().optional(),
    visit: z.boolean().optional(),
    invoice: z.boolean().optional()
  }).optional()
});

const createRequestBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  source: z.enum(["website_form", "office_existing_client", "office_new_client", "legacy_lead_backfill"]).default("office_new_client"),
  formId: z.string().min(1).optional(),
  formSlug: z.string().min(1).optional(),
  subject: z.string().optional(),
  narrative: z.string().optional(),
  selectedClientId: z.string().min(1).optional(),
  selectedPropertyId: z.string().min(1).optional(),
  consent: z.object({ email: z.boolean().optional(), sms: z.boolean().optional(), marketing: z.boolean().optional() }).optional(),
  allowIncomplete: z.boolean().optional(),
  fieldValues: z.array(requestFieldInputSchema).default([])
});

const updateRequestBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  subject: z.string().optional(),
  narrative: z.string().optional(),
  selectedClientId: z.string().optional(),
  selectedPropertyId: z.string().optional(),
  reviewedAt: z.string().optional(),
  fieldPatches: z.array(requestFieldInputSchema.extend({
    visibility: z.object({
      request: z.boolean().optional(),
      quote: z.boolean().optional(),
      job: z.boolean().optional(),
      visit: z.boolean().optional(),
      invoice: z.boolean().optional()
    }).optional(),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string().min(1))]).optional()
  })).optional()
});

const requestFormBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  title: z.string().min(1),
  slug: z.string().min(1).optional(),
  intro: z.string().optional(),
  active: z.boolean().default(true),
  fieldKeys: z.array(z.string().min(1)).min(1)
});
const createJobBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  clientId: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  quoteId: z.string().min(1).optional(),
  title: z.string().min(1),
  lineItems: z.array(lineItemSchema).optional(),
  paymentSchedule: paymentSchedulePlanSchema.optional(),
  intake: intakeSnapshotSchema.optional()
});
const updateJobBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  paymentSchedule: paymentSchedulePlanSchema.optional(),
  clientVisibility: z.object({
    hideFieldDocsFromPortal: z.boolean().optional()
  }).optional()
});
const scheduleJobVisitBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  assignedTo: z.array(z.string().min(1)).optional(),
  details: z.string().optional()
});
const scheduleJobVisitSeriesBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  visits: z.array(z.object({
    title: z.string().min(1).optional(),
    start: z.string().min(1),
    end: z.string().min(1),
    assignedTo: z.array(z.string().min(1)).optional(),
    details: z.string().optional()
  })).min(1)
});
const moveJobVisitBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  shiftRemaining: z.boolean().optional()
});
const completeJobVisitBodySchema = z.object({
  tenantId: z.string().min(1).optional()
});
const scheduleWorkspaceQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  team: z.string().optional()
});
const activityFeedQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  objectType: z.enum(["requests", "quotes", "jobs", "invoices", "payments"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});
const documentationActivityQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional()
});
const notificationActionBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  notificationId: z.string().min(1).optional()
});
const jobActionSchema = z.object({
  tenantId: z.string().min(1).optional(),
  action: z.enum(["close", "invoice", "close_and_invoice", "dismiss_invoice_reminder"])
});

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
    z,
  };
}

export type CrmRouteContext = ReturnType<typeof createCrmRouteContext>;
