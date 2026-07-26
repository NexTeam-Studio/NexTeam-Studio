import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  addressSchema,
  clientCommunicationSettingsSchema,
  clientContactSchema,
  intakeSnapshotSchema,
  InMemoryEventBus,
  invoiceDeliveryPreferencesSchema,
  lineItemSchema,
  paymentSchedulePlanSchema,
  personNameSchema,
  quoteDiscountSchema,
  RailError,
  receiptReviewChannelSchema,
  type ApprovalQueueService,
  type Client,
  type CrmSettings,
  type EventBus,
  type Invoice,
  type QuoteDeliveryRecord,
  type QuoteTemplate,
  type Property,
  type Quote,
  type RequestForm,
  type ServiceRequest
} from "@nexteam/core";
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
import { ensureDocumentNumbers, reserveDocumentNumber } from "./documentNumbering.js";
import {
  bookingTemplateVariables,
  communicationChannelEnabled,
  invoiceTemplateVariables,
  quoteTemplateVariables,
  renderTemplateText,
  resolveTemplateMessage
} from "./communicationTemplates.js";
import type { LedgerService } from "./ledgerFoundation.js";
import type { OperationsHubService } from "./operationsHub.js";
import {
  renderPortalAppointmentsHtml,
  renderPortalDocumentsHtml,
  renderPortalHomeHtml,
  renderPortalInvoicesHtml,
  renderPortalOptOutHtml,
  renderPortalQuotesHtml,
  renderUnifiedPortalDocumentsHtml,
  renderPortalReviewLandingHtml,
  renderPortalReverifyHtml
} from "./portalHubHtml.js";
import type { PortalHubService } from "./portalHubService.js";
import type { PortalSessionRecord } from "./portalHubRepository.js";
import type { ReviewSequenceService } from "./reviewSequenceService.js";
import { FirestoreNativeCrmRepository } from "./nativeRepository.js";
import {
  archiveQuoteVersion,
  createPortalToken,
  crmSettingsPatchSchema,
  ensureQuoteConfiguration,
  hashPortalToken,
  materializeQuoteRecord,
  portalQuoteApprovalInputSchema,
  portalQuoteChangeRequestInputSchema,
  portalUrlForQuote,
  quoteApprovalBlockedReason,
  quoteComposerInputSchema,
  quoteDeliveryMessage,
  quoteLocked,
  quoteRenewInputSchema,
  quoteTemplateInputSchema,
  syncExpiredQuote
} from "./quoteFoundation.js";
import { buildInvoiceDraftFromJobs, buildInvoiceDraftFromQuote, buildQuickPaymentRequestInvoice } from "./invoiceFoundation.js";
import {
  availableRequestFields,
  backfillLegacyLeads,
  buildServiceRequest,
  convertRequestToJob,
  convertRequestToQuote,
  ensureRequestForms,
  notifyRequestCreated,
  publicFormSubmissionValues,
  renderPublicRequestForm,
  requestFormEmbedCode,
  requestFormSharePath,
  selectRequestFields,
  updateServiceRequestShape
} from "./requestFoundation.js";
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
  return env.TENANT_ID || "aquatrace";
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

export interface CrmAddressSuggestion {
  label: string;
  street1: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  lat: number;
  lng: number;
}

function googleComponent(components: Array<{ long_name?: string; short_name?: string; types?: string[] }>, type: string, short = false): string {
  const match = components.find((component) => component.types?.includes(type));
  if (!match) {
    return "";
  }
  return (short ? match.short_name : match.long_name) ?? "";
}

export function mapGoogleGeocodeSuggestion(result: {
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
}): CrmAddressSuggestion | null {
  const components = result.address_components ?? [];
  const streetNumber = googleComponent(components, "street_number");
  const route = googleComponent(components, "route");
  const city = googleComponent(components, "locality") || googleComponent(components, "postal_town") || googleComponent(components, "administrative_area_level_2");
  const province = googleComponent(components, "administrative_area_level_1", true);
  const postalCode = googleComponent(components, "postal_code");
  const country = googleComponent(components, "country", true) || googleComponent(components, "country");
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  const street1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  if (!street1 || !city || !province || !postalCode || !country || typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }
  return {
    label: result.formatted_address ?? `${street1}, ${city}, ${province} ${postalCode}`,
    street1,
    city,
    province,
    postalCode,
    country,
    lat,
    lng
  };
}

async function fetchAddressSuggestions(query: string, apiKey: string, fetchFn: typeof fetch = fetch): Promise<CrmAddressSuggestion[]> {
  if (query.trim().length < 3 || !apiKey.trim()) {
    return [];
  }
  const params = new URLSearchParams({
    address: query.trim(),
    key: apiKey.trim()
  });
  const response = await fetchFn(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
  const body = await response.json() as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
      address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
    }>;
    error_message?: string;
  };
  if (!response.ok) {
    throw new RailError(body.error_message ?? "Address suggestions are unavailable right now.", { provider: "native", op: "addressSuggestions", status: response.status });
  }
  if (body.status && !["OK", "ZERO_RESULTS"].includes(body.status)) {
    throw new RailError(body.error_message ?? `Google geocode returned ${body.status}.`, { provider: "native", op: "addressSuggestions", status: 502 });
  }
  return (body.results ?? [])
    .map((result) => mapGoogleGeocodeSuggestion(result))
    .filter((result): result is CrmAddressSuggestion => Boolean(result))
    .slice(0, 5);
}

export function registerCrmRoutes(app: Express, deps: CrmRouteDeps): void {
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

  app.get("/api/crm/request-forms", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const forms = await ensureRequestForms(repositoryForTenant(), tenantId);
      res.json({
        ok: true,
        forms: forms.map((form) => ({ ...form, ...formPresentation(form) })),
        availableFields: availableRequestFields()
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/request-forms", async (req: Request, res: Response) => {
    try {
      const input = requestFormBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const timestamp = new Date().toISOString();
      const form: RequestForm = {
        id: `request_form_${randomUUID()}`,
        tenantId,
        slug: input.slug ? input.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        title: input.title.trim(),
        ...(input.intro?.trim() ? { intro: input.intro.trim() } : {}),
        active: input.active,
        fieldDefinitions: selectRequestFields(input.fieldKeys),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      if (!form.fieldDefinitions.length) {
        throw new RailError("Select at least one valid request field before saving the form.", { provider: "native", op: "saveRequestForm", status: 400 });
      }
      const saved = await repositoryForTenant().upsertRequestForm(form);
      res.status(201).json({ ok: true, form: { ...saved, ...formPresentation(saved) } });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/request-forms/:id", async (req: Request, res: Response) => {
    try {
      const formId = req.params.id;
      if (!formId) {
        throw new RailError("Request form id is required.", { provider: "native", op: "updateRequestForm", status: 400 });
      }
      const input = requestFormBodySchema.partial().parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const existing = await repositoryForTenant().getRequestForm(tenantId, formId);
      if (!existing) {
        throw new RailError(`Request form ${formId} was not found.`, { provider: "native", op: "updateRequestForm", status: 404 });
      }
      const nextFieldDefinitions = input.fieldKeys ? selectRequestFields(input.fieldKeys) : existing.fieldDefinitions;
      const saved = await repositoryForTenant().upsertRequestForm({
        ...existing,
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(input.slug?.trim() ? { slug: input.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") } : {}),
        ...(input.intro !== undefined ? { intro: input.intro?.trim() || undefined } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        fieldDefinitions: nextFieldDefinitions,
        updatedAt: new Date().toISOString()
      });
      res.json({ ok: true, form: { ...saved, ...formPresentation(saved) } });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/request-forms/:tenantId/:slug", async (req: Request, res: Response) => {
    try {
      const tenantId = String(req.params.tenantId ?? "");
      const slug = String(req.params.slug ?? "");
      const repository = repositoryForTenant();
      await ensureRequestForms(repository, tenantId);
      const form = await repository.getRequestFormBySlug(tenantId, slug);
      if (!form || !form.active) {
        throw new RailError("Request form was not found.", { provider: "native", op: "renderRequestForm", status: 404 });
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPublicRequestForm(form));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/request-forms/:tenantId/:slug/submit", async (req: Request, res: Response) => {
    try {
      const tenantId = String(req.params.tenantId ?? "");
      const slug = String(req.params.slug ?? "");
      const repository = repositoryForTenant();
      await ensureRequestForms(repository, tenantId);
      const form = await repository.getRequestFormBySlug(tenantId, slug);
      if (!form || !form.active) {
        throw new RailError("Request form was not found.", { provider: "native", op: "submitRequestForm", status: 404 });
      }
      const record = req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body as Record<string, unknown>
        : {};
      const request = await createAndNotifyRequest({
        tenantId,
        source: "website_form",
        formId: form.id,
        formSlug: form.slug,
        allowIncomplete: false,
        fieldValues: publicFormSubmissionValues(form, record)
      });
      if ((req.headers["content-type"] ?? "").toString().includes("application/json")) {
        res.status(201).json({ ok: true, request });
        return;
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Request received</title><style>body{font-family:Montserrat,Arial,sans-serif;background:#f5f7f1;color:#0c1118;margin:0}main{max-width:720px;margin:0 auto;padding:40px 16px}section{border:1px solid rgba(12,17,24,.12);border-radius:28px;background:#fff;padding:24px;box-shadow:0 24px 70px rgba(12,17,24,.08)}h1{margin:0 0 12px}p{line-height:1.5}</style></head><body><main><section><h1>Request received</h1><p>The office has your request and will review it shortly.</p><p><strong>${request.clientName}</strong><br/>${request.subject}</p></section></main></body></html>`);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/requests", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      await ensureRequestForms(repositoryForTenant(), tenantId);
      const requests = await repositoryForTenant().listRequests(tenantId);
      res.json({ ok: true, requests });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/requests/:id", async (req: Request, res: Response) => {
    try {
      const requestId = req.params.id;
      if (!requestId) {
        throw new RailError("Request id is required.", { provider: "native", op: "getRequest", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const request = await getRequestOrThrow(tenantId, requestId);
      res.json({ ok: true, request });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/requests", async (req: Request, res: Response) => {
    try {
      const input = createRequestBodySchema.parse(req.body);
      const request = await createAndNotifyRequest(input);
      res.status(201).json({ ok: true, request });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/requests/:id", async (req: Request, res: Response) => {
    try {
      const requestId = req.params.id;
      if (!requestId) {
        throw new RailError("Request id is required.", { provider: "native", op: "updateRequest", status: 400 });
      }
      const input = updateRequestBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const existing = await getRequestOrThrow(tenantId, requestId);
      const next = updateServiceRequestShape(existing, {
        subject: input.subject,
        narrative: input.narrative,
        selectedClientId: input.selectedClientId,
        selectedPropertyId: input.selectedPropertyId,
        reviewedAt: input.reviewedAt,
        fieldPatches: input.fieldPatches?.map((field) => ({
          key: field.key,
          ...(field.value !== undefined ? { value: field.value } : {}),
          ...(sanitizeFieldVisibility(field.visibility) ? { visibility: sanitizeFieldVisibility(field.visibility) } : {})
        }))
      });
      const saved = await repositoryForTenant().updateRequest(requestId, next);
      res.json({ ok: true, request: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/requests/:id/archive", async (req: Request, res: Response) => {
    try {
      const requestId = req.params.id;
      if (!requestId) {
        throw new RailError("Request id is required.", { provider: "native", op: "archiveRequest", status: 400 });
      }
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      const request = await getRequestOrThrow(tenantId, requestId);
      const saved = await repositoryForTenant().updateRequest(requestId, {
        status: "archived",
        archivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reopenedAt: undefined
      });
      res.json({ ok: true, request: { ...request, ...saved } });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/requests/:id/reopen", async (req: Request, res: Response) => {
    try {
      const requestId = req.params.id;
      if (!requestId) {
        throw new RailError("Request id is required.", { provider: "native", op: "reopenRequest", status: 400 });
      }
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      const saved = await repositoryForTenant().updateRequest(requestId, {
        status: "new",
        reopenedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archivedAt: undefined
      });
      res.json({ ok: true, request: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/requests/:id/convert-to-quote", async (req: Request, res: Response) => {
    try {
      const requestId = req.params.id;
      if (!requestId) {
        throw new RailError("Request id is required.", { provider: "native", op: "convertRequestToQuote", status: 400 });
      }
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      const request = await getRequestOrThrow(tenantId, requestId);
      const converted = await convertRequestToQuote(repositoryForTenant(), request);
      await eventBus.emit({
        tenantId,
        type: "quote.created",
        payload: {
          quoteId: converted.quote.id,
          clientId: converted.quote.clientId,
          ...(converted.quote.requestId ? { requestId: converted.quote.requestId } : {})
        }
      });
      await eventBus.emit({
        tenantId,
        type: "request.converted_to_quote",
        payload: {
          requestId: converted.request.id,
          quoteId: converted.quote.id,
          clientId: converted.quote.clientId
        }
      });
      res.status(201).json({ ok: true, request: converted.request, quote: converted.quote, property: converted.property });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/requests/:id/convert-to-job", async (req: Request, res: Response) => {
    try {
      const requestId = req.params.id;
      if (!requestId) {
        throw new RailError("Request id is required.", { provider: "native", op: "convertRequestToJob", status: 400 });
      }
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      const request = await getRequestOrThrow(tenantId, requestId);
      const converted = await convertRequestToJob(repositoryForTenant(), request);
      await eventBus.emit({
        tenantId,
        type: "job.created",
        payload: {
          jobId: converted.job.id,
          title: converted.job.title,
          createdBy: "request_conversion"
        }
      });
      await eventBus.emit({
        tenantId,
        type: "request.converted_to_job",
        payload: {
          requestId: converted.request.id,
          jobId: converted.job.id,
          clientId: converted.job.clientId
        }
      });
      res.status(201).json({ ok: true, request: converted.request, job: converted.job, property: converted.property });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/requests/backfill-leads", async (req: Request, res: Response) => {
    try {
      if (!deps.sitesRepository) {
        throw new RailError("Lead backfill is unavailable because the sites repository is not connected.", { provider: "native", op: "backfillLeads", status: 501 });
      }
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      const leads = await deps.sitesRepository.listLeads(tenantId);
      const result = await backfillLegacyLeads({
        repository: repositoryForTenant(),
        leads,
        automation: {
          approvalQueue: deps.approvalQueue,
          commsRail: deps.commsRail,
          platformRepository: deps.platformRepository
        }
      });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/clients", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const provider = providerForTenant(tenantId);
      const clients = await provider.getClients(q);
      res.json({ ok: true, clients });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/properties", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const properties = await repositoryForTenant().listProperties(tenantId);
      res.json({ ok: true, properties });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

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

  app.post("/api/crm/jobs/:id/visits", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "scheduleJobVisit", status: 400 });
      }
      const input = scheduleJobVisitBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "scheduleJobVisit");
      const visit = await jobLifecycle().scheduleVisit({
        tenantId,
        jobId,
        ...(input.title ? { title: input.title } : {}),
        start: input.start,
        end: input.end,
        ...(input.assignedTo ? { assignedTo: input.assignedTo } : {}),
        ...(input.details ? { details: input.details } : {})
      });
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, visit, job });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/:id/visits/batch", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "scheduleJobVisitSeries", status: 400 });
      }
      const input = scheduleJobVisitSeriesBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "scheduleJobVisitSeries");
      const visits = await jobLifecycle().scheduleVisitSeries({
        tenantId,
        jobId,
        visits: input.visits.map((visit) => ({
          ...(visit.title ? { title: visit.title } : {}),
          start: visit.start,
          end: visit.end,
          ...(visit.assignedTo ? { assignedTo: visit.assignedTo } : {}),
          ...(visit.details ? { details: visit.details } : {})
        }))
      });
      const job = await jobLifecycle().getJobDetail(tenantId, jobId);
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, visits, job });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/jobs/:id/booking-confirmation-preview", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "prepareBookingConfirmation", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const visitId = typeof req.query.visitId === "string" && req.query.visitId.trim() ? req.query.visitId : undefined;
      const access = await requireQuoteAccess(req, tenantId, "prepareBookingConfirmation");
      const preview = await jobLifecycle().prepareBookingConfirmation(tenantId, jobId, visitId);
      res.json({ ok: true, tenantId, actorRole: access.role, preview });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/:id/booking-confirmation", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "sendBookingConfirmation", status: 400 });
      }
      const input = sendBookingConfirmationBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "sendBookingConfirmation");
      const sent = await jobLifecycle().sendBookingConfirmation({
        tenantId,
        jobId,
        actorId: actorIdForAccess(access),
        ...(input.visitId ? { visitId: input.visitId } : {}),
        mode: input.mode,
        ...(input.target !== undefined ? { target: input.target } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.bodyText !== undefined ? { bodyText: input.bodyText } : {}),
        ...(input.sendCopy !== undefined ? { sendCopy: input.sendCopy } : {}),
        ...(input.copyTarget !== undefined ? { copyTarget: input.copyTarget } : {})
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...sent });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/visits/:id/move", async (req: Request, res: Response) => {
    try {
      const visitId = req.params.id;
      if (!visitId) {
        throw new RailError("Visit id is required.", { provider: "native", op: "moveJobVisit", status: 400 });
      }
      const input = moveJobVisitBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "moveJobVisit");
      const moved = await jobLifecycle().moveVisitSeries({
        tenantId,
        visitId,
        start: input.start,
        end: input.end,
        ...(input.shiftRemaining !== undefined ? { shiftRemaining: input.shiftRemaining } : {})
      });
      const job = await jobLifecycle().getJobDetail(tenantId, moved.visit.jobId);
      res.json({ ok: true, tenantId, actorRole: access.role, visit: moved.visit, shiftedVisits: moved.shiftedVisits, job });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/jobs/visits/:id/complete", async (req: Request, res: Response) => {
    try {
      const visitId = req.params.id;
      if (!visitId) {
        throw new RailError("Visit id is required.", { provider: "native", op: "completeJobVisit", status: 400 });
      }
      const input = completeJobVisitBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: tenantId,
        op: "completeJobVisit"
      });
      const result = await jobLifecycle().completeVisit({
        tenantId,
        visitId,
        actorId: access.tenantUserId
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...result });
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

  app.get("/api/crm/quote-templates", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "listQuoteTemplates");
      const repository = repositoryForTenant();
      const { settings, templates } = await ensureQuoteConfiguration(repository, tenantId);
      res.json({ ok: true, tenantId, actorRole: access.role, settings, templates });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quote-templates", async (req: Request, res: Response) => {
    try {
      const input = quoteTemplateInputSchema.parse(req.body);
      const access = await requireQuoteAccess(req, input.tenantId, "createQuoteTemplate");
      const repository = repositoryForTenant();
      const timestamp = new Date().toISOString();
      const template: QuoteTemplate = {
        id: input.id?.trim() || `quote_template_${randomUUID()}`,
        tenantId: input.tenantId,
        name: input.name.trim(),
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        ...(input.titlePrefix?.trim() ? { titlePrefix: input.titlePrefix.trim() } : {}),
        ...(input.defaultLineItems?.length ? { defaultLineItems: input.defaultLineItems } : {}),
        defaultApprovalRules: input.defaultApprovalRules,
        ...(input.expiryDays !== undefined ? { expiryDays: input.expiryDays } : {}),
        ...(input.terms?.trim() ? { terms: input.terms.trim() } : {}),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const saved = await repository.upsertQuoteTemplate(template);
      res.status(201).json({ ok: true, tenantId: input.tenantId, actorRole: access.role, template: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/quote-templates/:id", async (req: Request, res: Response) => {
    try {
      const templateId = req.params.id;
      if (!templateId) {
        throw new RailError("Quote template id is required.", { provider: "native", op: "updateQuoteTemplate", status: 400 });
      }
      const input = quoteTemplateInputSchema.partial().parse(req.body);
      const tenantId = input.tenantId ?? (typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env));
      const access = await requireQuoteAccess(req, tenantId, "updateQuoteTemplate");
      const repository = repositoryForTenant();
      const existing = await repository.getQuoteTemplate(tenantId, templateId);
      if (!existing) {
        throw new RailError(`Quote template ${templateId} was not found.`, { provider: "native", op: "updateQuoteTemplate", status: 404 });
      }
      const saved = await repository.upsertQuoteTemplate({
        ...existing,
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || undefined } : {}),
        ...(input.titlePrefix !== undefined ? { titlePrefix: input.titlePrefix?.trim() || undefined } : {}),
        ...(input.defaultLineItems !== undefined ? { defaultLineItems: input.defaultLineItems } : {}),
        ...(input.defaultApprovalRules ? { defaultApprovalRules: input.defaultApprovalRules } : {}),
        ...(input.expiryDays !== undefined ? { expiryDays: input.expiryDays } : {}),
        ...(input.terms !== undefined ? { terms: input.terms?.trim() || undefined } : {}),
        updatedAt: new Date().toISOString()
      });
      res.json({ ok: true, tenantId, actorRole: access.role, template: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/quotes", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "listQuotes");
      const repository = repositoryForTenant();
      const numbered = await ensureDocumentNumbers(await repository.listQuotes(tenantId), {
        tenantId,
        kind: "quote",
        reserve: (targetTenantId, kind) => reserveDocumentNumber(repository, targetTenantId, kind),
        update: (id, patch) => repository.updateQuote(id, patch)
      });
      const quotes: Quote[] = [];
      for (const quote of numbered) {
        quotes.push(await syncExpiredQuote(repository, quote));
      }
      res.json({ ok: true, tenantId, actorRole: access.role, quotes });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/quotes/:id", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "getQuote", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "getQuote");
      const { quote, client } = await getQuoteAndClient(tenantId, quoteId);
      res.json({ ok: true, tenantId, actorRole: access.role, quote, client });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/invoices", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "listInvoices");
      const invoices = deps.ledgerService
        ? await ledger().listInvoices(tenantId)
        : await repositoryForTenant().listInvoices(tenantId);
      res.json({ ok: true, tenantId, actorRole: access.role, invoices });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/invoices/:id", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "native", op: "getInvoice", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "getInvoice");
      if (deps.ledgerService) {
        const detail = await ledger().getInvoiceDetail(tenantId, invoiceId);
        res.json({ ok: true, tenantId, actorRole: access.role, ...detail });
        return;
      }
      const { invoice, client } = await getInvoiceAndClient(tenantId, invoiceId);
      res.json({ ok: true, tenantId, actorRole: access.role, invoice, ...(client ? { client } : {}) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/payments", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "listPayments");
      res.json({ ok: true, tenantId, actorRole: access.role, payments: await ledger().listPayments(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/payments/:id", async (req: Request, res: Response) => {
    try {
      const paymentId = req.params.id;
      if (!paymentId) {
        throw new RailError("Payment id is required.", { provider: "native", op: "getPaymentDetail", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "getPaymentDetail");
      const detail = await ledger().getPaymentDetail(tenantId, paymentId);
      res.json({ ok: true, tenantId, actorRole: access.role, ...detail });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/deposits", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "listDeposits");
      res.json({ ok: true, tenantId, actorRole: access.role, deposits: await ledger().listDeposits(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/refunds", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "listRefunds");
      res.json({ ok: true, tenantId, actorRole: access.role, refunds: await ledger().listRefunds(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/credits", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "listCredits");
      res.json({ ok: true, tenantId, actorRole: access.role, credits: await ledger().listCredits(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/receipt-reviews", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "listReceiptReviews");
      res.json({ ok: true, tenantId, actorRole: access.role, receiptReviews: await ledger().listReceiptReviews(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/receipt-reviews/:id", async (req: Request, res: Response) => {
    try {
      const receiptReviewId = req.params.id;
      if (!receiptReviewId) {
        throw new RailError("Receipt review id is required.", { provider: "native", op: "getReceiptReview", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "getReceiptReview");
      const receiptReview = (await ledger().listReceiptReviews(tenantId)).find((record) => record.id === receiptReviewId);
      if (!receiptReview) {
        throw new RailError(`Receipt review ${receiptReviewId} was not found.`, { provider: "native", op: "getReceiptReview", status: 404 });
      }
      const invoice = receiptReview.invoiceId ? await ledger().getInvoice(tenantId, receiptReview.invoiceId) : null;
      res.json({ ok: true, tenantId, actorRole: access.role, receiptReview, ...(invoice ? { invoice } : {}) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/address-suggestions", async (req: Request, res: Response) => {
    try {
      const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
      if (query.length < 3) {
        res.json({ ok: true, suggestions: [] });
        return;
      }
      const apiKey = env.GOOGLE_MAPS_API_KEY?.trim();
      if (!apiKey) {
        res.json({ ok: true, suggestions: [] });
        return;
      }
      const suggestions = await fetchAddressSuggestions(query, apiKey);
      res.json({ ok: true, suggestions });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/clients", async (req: Request, res: Response) => {
    try {
      const input = createClientBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const provider = providerForTenant(tenantId);
      const client = await provider.createClient({
        tenantId,
        name: input.name,
        company: input.company,
        personName: input.personName,
        displayNamePreference: input.displayNamePreference,
        billingAddress: input.billingAddress,
        billingSameAsPrimaryProperty: input.billingSameAsPrimaryProperty,
        contacts: input.contacts,
        communicationSettings: input.communicationSettings,
        emails: input.emails,
        phones: input.phones,
        consent: input.consent,
        customFields: input.customFields
      });
      let property: Property | undefined;
      if (input.primaryProperty) {
        const propertyInput = input.primaryProperty;
        property = await repositoryForTenant().upsertProperty({
          id: `property_${randomUUID()}`,
          tenantId,
          clientId: client.id,
          siteName: propertyInput.siteName,
          label: propertyInput.label,
          address: propertyInput.address,
          geo: propertyInput.geo,
          billingAddressSameAsClient: propertyInput.billingAddressSameAsClient,
          access: propertyInput.access,
          contacts: propertyInput.contacts,
          assets: [],
          customFields: propertyInput.customFields
        });
      }
      res.status(201).json({ ok: true, client, property });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/clients/:id", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "updateClient", status: 400 });
      }
      const input = updateClientBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "updateClient"
      });
      const repository = repositoryForTenant();
      const [clients, properties] = await Promise.all([
        repository.listClients(tenantId),
        repository.listProperties(tenantId)
      ]);
      const existing = clients.find((record) => record.id === clientId);
      if (!existing) {
        throw new RailError(`Client ${clientId} was not found.`, { provider: "native", op: "updateClient", status: 404 });
      }
      const existingProperty = properties.find((record) => record.clientId === clientId);
      const nextName = input.name ?? existing.name;
      const nextCompany = input.company === null ? undefined : (input.company ?? existing.company);
      const nextPersonName = input.personName ?? existing.personName;
      const nextContacts = input.contacts ?? existing.contacts ?? [];
      const nextPhones = input.phones ?? existing.phones;
      const nextBillingAddress = input.billingAddress === null ? undefined : (input.billingAddress ?? existing.billingAddress);
      const nextPropertyAddress = input.primaryProperty?.address ?? existingProperty?.address;
      if (!nextName.trim()) {
        throw new RailError("Name is required before a client can be saved.", { provider: "native", op: "updateClient", status: 400 });
      }
      if (!hasClientCreatePhone({ phones: nextPhones, contacts: nextContacts })) {
        throw new RailError("Telephone is required before a client can be saved.", { provider: "native", op: "updateClient", status: 400 });
      }
      if (!hasClientCreateAddress({ billingAddress: nextBillingAddress, primaryProperty: nextPropertyAddress ? { address: nextPropertyAddress } : undefined })) {
        throw new RailError("Address is required before a client can be saved.", { provider: "native", op: "updateClient", status: 400 });
      }
      const nextClient: Client = {
        ...existing,
        name: nextName,
        ...(nextPersonName ? { personName: nextPersonName } : {}),
        ...(input.displayNamePreference ? { displayNamePreference: input.displayNamePreference } : {}),
        ...(input.billingSameAsPrimaryProperty !== undefined ? { billingSameAsPrimaryProperty: input.billingSameAsPrimaryProperty } : {}),
        ...(input.contacts ? { contacts: input.contacts } : {}),
        ...(input.communicationSettings ? { communicationSettings: input.communicationSettings } : {}),
        ...(input.emails ? { emails: input.emails } : {}),
        ...(input.phones ? { phones: input.phones } : {}),
        customFields: input.customFields ?? existing.customFields,
        consent: input.consent ? {
          email: input.consent.email ?? existing.consent.email,
          sms: input.consent.sms ?? existing.consent.sms,
          marketing: input.consent.marketing ?? existing.consent.marketing ?? false
        } : existing.consent
      };
      if (input.company !== undefined) {
        if (input.company === null) {
          delete nextClient.company;
        } else {
          nextClient.company = input.company;
        }
      }
      if (input.billingAddress !== undefined) {
        if (input.billingAddress === null) {
          delete nextClient.billingAddress;
        } else {
          nextClient.billingAddress = input.billingAddress;
        }
      }
      const updated = await repository.upsertClient(nextClient);
      let property: Property | undefined;
      if (input.primaryProperty) {
        property = await repository.upsertProperty({
          ...(existingProperty ?? {
            id: `property_${randomUUID()}`,
            tenantId,
            clientId,
            assets: []
          }),
          tenantId,
          clientId,
          siteName: input.primaryProperty.siteName ?? existingProperty?.siteName,
          label: input.primaryProperty.label ?? existingProperty?.label ?? input.primaryProperty.address.street1,
          address: input.primaryProperty.address,
          geo: input.primaryProperty.geo ?? existingProperty?.geo,
          billingAddressSameAsClient: input.primaryProperty.billingAddressSameAsClient ?? existingProperty?.billingAddressSameAsClient,
          access: input.primaryProperty.access ?? existingProperty?.access,
          contacts: input.primaryProperty.contacts ?? existingProperty?.contacts,
          assets: existingProperty?.assets ?? [],
          customFields: input.primaryProperty.customFields ?? existingProperty?.customFields
        });
      }
      if (input.consent?.marketing !== undefined) {
        await deps.nexReachService?.handleConsentChange({
          tenantId,
          clientId: updated.id,
          marketingConsent: updated.consent.marketing ?? false
        });
      }
      res.json({ ok: true, client: updated, ...(property ? { property } : {}) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.delete("/api/crm/clients/:id", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "deleteClient", status: 400 });
      }
      const tenantId = String(req.query.tenantId ?? req.body?.tenantId ?? defaultTenantId(env));
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "deleteClient"
      });
      const repository = repositoryForTenant();
      const existing = (await repository.listClients(tenantId)).find((record) => record.id === clientId);
      if (!existing) {
        throw new RailError(`Client ${clientId} was not found.`, { provider: "native", op: "deleteClient", status: 404 });
      }
      const [requests, quotes, jobs, invoices, properties] = await Promise.all([
        repository.listRequests(tenantId),
        repository.listQuotes(tenantId),
        repository.listJobs(tenantId),
        repository.listInvoices(tenantId),
        repository.listProperties(tenantId)
      ]);
      const linkedRequestCount = requests.filter((request) =>
        request.selectedClientId === clientId || request.match?.matchedClientId === clientId
      ).length;
      const linkedQuoteCount = quotes.filter((quote) => quote.clientId === clientId).length;
      const linkedJobCount = jobs.filter((job) => job.clientId === clientId).length;
      const linkedInvoiceCount = invoices.filter((invoice) => invoice.clientId === clientId).length;
      if (linkedRequestCount || linkedQuoteCount || linkedJobCount || linkedInvoiceCount) {
        throw new RailError("Delete is blocked because this client already has linked work or billing history.", {
          provider: "native",
          op: "deleteClient",
          status: 409
        });
      }
      const propertyIds = properties
        .filter((property) => property.clientId === clientId)
        .map((property) => property.id);
      const deletedPropertyIds = await repository.deletePropertiesForClient(tenantId, clientId);
      await repository.deleteClient(tenantId, clientId);
      res.json({
        ok: true,
        clientId,
        deletedPropertyIds,
        blockedLinks: {
          requests: linkedRequestCount,
          quotes: linkedQuoteCount,
          jobs: linkedJobCount,
          invoices: linkedInvoiceCount
        },
        propertyIds
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/clients/:id/quick-payment-request", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "createQuickPaymentRequest", status: 400 });
      }
      const input = quickPaymentRequestBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "createQuickPaymentRequest");
      const client = (await repositoryForTenant().listClients(tenantId)).find((record) => record.id === clientId);
      if (!client) {
        throw new RailError(`Client ${clientId} was not found.`, { provider: "native", op: "createQuickPaymentRequest", status: 404 });
      }
      const result = await createQuickPaymentRequestRecord({
        tenantId,
        clientId: client.id,
        title: input.title.trim(),
        amount: input.amount,
        ...(input.memo?.trim() ? { memo: input.memo.trim() } : {}),
        actorId: actorIdForAccess(access),
        delivery: input.delivery,
        publicBaseUrl: publicOrigin(req)
      });
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes", async (req: Request, res: Response) => {
    try {
      const input = createQuoteRouteBodySchema.parse(req.body);
      const access = await requireQuoteAccess(req, input.tenantId, "createQuote");
      const repository = repositoryForTenant();
      const provider = providerForTenant(input.tenantId);
      const quote = await provider.createQuote(await materializeQuoteRecord(repository, input));
      await eventBus.emit({
        tenantId: quote.tenantId,
        type: "quote.created",
        payload: {
          quoteId: quote.id,
          clientId: quote.clientId,
          ...(quote.requestId ? { requestId: quote.requestId } : {})
        }
      });
      if (input.delivery.mode !== "draft") {
        const settings = await repository.getCrmSettings(input.tenantId);
        const delivered = await sendQuoteDelivery({
          quote,
          client: (await provider.getClients("")).find((candidate) => candidate.id === quote.clientId),
          settings,
          mode: input.delivery.mode,
          target: input.delivery.target,
          note: input.delivery.note,
          actorId: actorIdForAccess(access)
        });
        res.status(201).json({ ok: true, quote: delivered.quote, portalUrl: delivered.portalUrl, delivery: delivered.delivery });
        return;
      }
      res.status(201).json({ ok: true, quote });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/quotes/:id", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "updateQuote", status: 400 });
      }
      const input = updateQuoteRouteBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "updateQuote");
      const repository = repositoryForTenant();
      const existing = await getQuoteAndClient(tenantId, quoteId);
      if (quoteLocked(existing.quote)) {
        throw new RailError("Approved or archived quotes cannot be edited.", { provider: "native", op: "updateQuote", status: 409 });
      }
      if (existing.quote.status === "expired" || quoteApprovalBlockedReason(existing.quote)) {
        throw new RailError("Expired or declined quotes must be renewed instead of edited directly.", { provider: "native", op: "updateQuote", status: 409 });
      }
      const rebuilt = await materializeQuoteRecord(repository, {
        tenantId,
        clientId: input.clientId ?? existing.quote.clientId,
        ...(input.requestId !== undefined ? { requestId: input.requestId } : existing.quote.requestId ? { requestId: existing.quote.requestId } : {}),
        ...(input.jobId !== undefined ? { jobId: input.jobId } : existing.quote.jobId ? { jobId: existing.quote.jobId } : {}),
        ...(input.templateId !== undefined ? { templateId: input.templateId } : existing.quote.templateId ? { templateId: existing.quote.templateId } : {}),
        title: input.title ?? existing.quote.title,
        items: input.items ?? existing.quote.lineItems.map((item) => ({
          kind: item.source === "custom" ? "custom" as const : "catalog" as const,
          ...(item.catalogCode ? { catalogCode: item.catalogCode } : {}),
          code: item.code,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          clientSelectable: item.clientSelectable,
          defaultSelected: item.defaultSelected
        })),
        approvalRules: input.approvalRules ?? existing.quote.approvalRules,
        discount: input.discount ?? existing.quote.discount,
        taxRate: input.taxRate ?? existing.quote.totals.taxRate,
        expiresAt: input.expiresAt ?? existing.quote.expiresAt,
        expiryDays: input.expiryDays,
        terms: input.terms ?? existing.quote.terms,
        intake: existing.quote.intake
      }, {
        existingId: existing.quote.id,
        existingNumber: existing.quote.number,
        status: "draft",
        intake: existing.quote.intake,
        version: (existing.quote.version ?? 1) + 1
      });
      const saved = await repository.updateQuote(existing.quote.id, {
        ...rebuilt,
        approvalId: undefined,
        sentAt: undefined,
        approvedAt: undefined,
        approvedBy: undefined,
        approvedByRole: undefined,
        signature: undefined,
        portal: {},
        versions: archiveQuoteVersion(existing.quote, "edited_before_send"),
        delivery: existing.quote.delivery ?? [],
        changeRequests: existing.quote.changeRequests ?? [],
        pdfRef: `native://quotes/${tenantId}/${existing.quote.id}.pdf`,
        updatedAt: new Date().toISOString()
      });
      res.json({ ok: true, tenantId, actorRole: access.role, quote: saved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes/:id/send", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "sendQuote", status: 400 });
      }
      const input = quoteSendBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "sendQuote");
      const { quote, client } = await getQuoteAndClient(tenantId, quoteId);
      const settings = await repositoryForTenant().getCrmSettings(tenantId);
      if (["approved", "approved_internal", "archived", "declined", "expired"].includes(quote.status)) {
        throw new RailError("That quote cannot be sent in its current state.", { provider: "native", op: "sendQuote", status: 409 });
      }
      const delivered = await sendQuoteDelivery({
        quote,
        client,
        settings,
        mode: input.mode,
        target: input.target,
        note: input.note,
        subject: input.subject,
        bodyText: input.bodyText,
        actorId: actorIdForAccess(access)
      });
      res.json({ ok: true, tenantId, actorRole: access.role, quote: delivered.quote, portalUrl: delivered.portalUrl, delivery: delivered.delivery });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes/:id/manual-approve", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "manualApproveQuote", status: 400 });
      }
      const input = quoteManualApprovalBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "manualApproveQuote");
      const { provider, quote } = await getQuoteAndClient(tenantId, quoteId);
      const blocked = quoteApprovalBlockedReason(quote);
      if (blocked) {
        throw new RailError(blocked, { provider: "native", op: "manualApproveQuote", status: 409 });
      }
      const approvedAt = new Date().toISOString();
      const approved = await provider.updateQuote(quote.id, {
        status: "approved_internal",
        approvedAt,
        approvedBy: access.tenantUserId,
        approvedByRole: access.role === "OWNER" ? "OWNER" : "OFFICE_ADMIN",
        updatedAt: approvedAt
      });
      await eventBus.emit({
        tenantId: approved.tenantId,
        type: "quote.approved",
        payload: { quoteId: approved.id, clientId: approved.clientId, approvedAt, approvedBy: access.tenantUserId, approvedByRole: access.role }
      });
      res.json({ ok: true, tenantId, actorRole: access.role, quote: approved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes/:id/renew", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "renewQuote", status: 400 });
      }
      const input = quoteRenewInputSchema.parse(req.body);
      const access = await requireQuoteAccess(req, input.tenantId, "renewQuote");
      const { provider, quote, client } = await getQuoteAndClient(input.tenantId, quoteId);
      const isExpired = quote.status === "expired"
        || (!!quote.expiresAt && new Date(quote.expiresAt).getTime() < Date.now());
      if (!isExpired) {
        throw new RailError("Only expired quotes can be renewed.", { provider: "native", op: "renewQuote", status: 409 });
      }
      const timestamp = new Date().toISOString();
      const portalToken = createPortalToken();
      const nextExpiresAt = input.expiresAt
        || (input.expiryDays ? new Date(Date.now() + input.expiryDays * 86400000).toISOString() : undefined)
        || quote.expiresAt
        || timestamp;
      const renewed = await provider.updateQuote(quote.id, {
        status: "sent",
        expiresAt: nextExpiresAt,
        updatedAt: timestamp,
        sentAt: timestamp,
        version: (quote.version ?? 1) + 1,
        versions: archiveQuoteVersion(quote, "renewed", timestamp),
        portal: {
          ...(quote.portal ?? {}),
          tokenHash: hashPortalToken(portalToken),
          tokenIssuedAt: timestamp
        }
      });
      await eventBus.emit({
        tenantId: renewed.tenantId,
        type: "quote.renewed",
        payload: { quoteId: renewed.id, clientId: renewed.clientId, renewedAt: timestamp, renewedBy: access.tenantUserId }
      });
      res.json({
        ok: true,
        tenantId: input.tenantId,
        actorRole: access.role,
        quote: renewed,
        client,
        portalUrl: portalUrlForQuote(renewed, portalToken)
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes/:id/convert-to-job", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "convertQuoteToJob", status: 400 });
      }
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "convertQuoteToJob");
      const repository = repositoryForTenant();
      const { provider, quote } = await getQuoteAndClient(tenantId, quoteId);
      if (!["approved", "approved_internal"].includes(quote.status)) {
        throw new RailError("Only approved quotes can convert into jobs.", { provider: "native", op: "convertQuoteToJob", status: 409 });
      }
      if (quote.convertedJobId) {
        const existingJob = await jobLifecycle().getJobDetail(tenantId, quote.convertedJobId);
        res.json({ ok: true, tenantId, actorRole: access.role, quote, job: existingJob, reused: true });
        return;
      }
      const created = await jobLifecycle().createJob({
        tenantId,
        clientId: quote.clientId,
        ...(quote.requestId ? { requestId: quote.requestId } : {}),
        quoteId: quote.id,
        title: quote.title,
        lineItems: quote.lineItems,
        ...(quote.paymentSchedule ? { paymentSchedule: quote.paymentSchedule } : {}),
        intake: quote.intake,
        createdBy: access.tenantUserId
      });
      const bundleAttachment = await fieldDocsService().maybeAttachBundleForJob({
        tenantId,
        job: created
      });
      const job = await jobLifecycle().getJobDetail(tenantId, created.id);
      const updatedQuote = await provider.updateQuote(quote.id, {
        convertedJobId: created.id,
        jobId: created.id,
        updatedAt: new Date().toISOString()
      });
      await eventBus.emit({
        tenantId,
        type: "quote.converted_to_job",
        payload: {
          quoteId: quote.id,
          jobId: created.id,
          clientId: created.clientId
        }
      });
      res.status(201).json({
        ok: true,
        tenantId,
        actorRole: access.role,
        quote: updatedQuote,
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

  app.post("/api/crm/quotes/:id/invoice", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "createInvoiceFromQuote", status: 400 });
      }
      const input = createInvoiceFromQuoteBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "createInvoiceFromQuote");
      const repository = repositoryForTenant();
      const { provider, quote } = await getQuoteAndClient(tenantId, quoteId);
      if (!["approved", "approved_internal"].includes(quote.status)) {
        throw new RailError("Quote must be approved before an invoice is created.", { provider: "native", op: "createInvoiceFromQuote", status: 409 });
      }
      const existing = (await provider.getInvoices()).find((invoice) => invoice.quoteId === quote.id);
      if (existing) {
        res.json({ ok: true, tenantId, actorRole: access.role, invoice: existing, reused: true });
        return;
      }
      const settings = await repository.getCrmSettings(tenantId);
      const invoice = await provider.createInvoice(buildInvoiceDraftFromQuote({
        quote,
        settings,
        number: await reserveDocumentNumber(repository, tenantId, "invoice")
      }));
      const syncedInvoice = deps.ledgerService ? await ledger().syncInvoiceAfterCreate(invoice) : invoice;
      if (quote.jobId) {
        await jobLifecycle().markInvoiceCreated({
          tenantId,
          jobId: quote.jobId,
          invoiceId: syncedInvoice.id,
          actorId: access.tenantUserId
        });
      }
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, invoice: syncedInvoice });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/invoices/compose-from-jobs", async (req: Request, res: Response) => {
    try {
      const input = composeInvoiceFromJobsBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "composeInvoiceFromJobs");
      const result = await ledger().composeInvoiceFromJobs({
        tenantId,
        jobIds: input.jobIds,
        actorId: access.tenantUserId,
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(input.discount ? { discount: input.discount } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.terms !== undefined ? { terms: input.terms } : {}),
        ...(input.paymentSchedule ? { paymentSchedule: input.paymentSchedule } : {})
      });
      for (const job of result.jobs) {
        await jobLifecycle().markInvoiceCreated({
          tenantId,
          jobId: job.id,
          invoiceId: result.invoice.id,
          actorId: access.tenantUserId
        });
      }
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, invoice: result.invoice, jobs: result.jobs });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/quotes/:id/pdf", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "renderQuotePdf", status: 400 });
      }
      const { quote, client } = await getQuoteAndClient(tenantId, quoteId);
      res.setHeader("content-type", "application/pdf");
      res.send(renderQuotePdf(quote, client));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/portal/quotes/:id/pdf", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const token = typeof req.query.token === "string" ? req.query.token : "";
      const quoteId = req.params.id;
      if (!quoteId || !token) {
        throw new RailError("Quote id and token are required.", { provider: "native", op: "renderPortalQuotePdf", status: 400 });
      }
      const { quote, client } = await getQuoteAndClient(tenantId, quoteId);
      if (!quote.portal?.tokenHash || quote.portal.tokenHash !== hashPortalToken(token)) {
        throw new RailError("Quote portal token is invalid.", { provider: "native", op: "renderPortalQuotePdf", status: 403 });
      }
      const filename = `${quote.number ?? quote.id}.pdf`;
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-disposition", `attachment; filename="${filename}"`);
      res.send(renderQuotePdf(quote, client));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/invoices/:id/pdf", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "native", op: "renderInvoicePdf", status: 400 });
      }
      await requireBillingAccess(req, tenantId, "renderInvoicePdf");
      const { invoice, client } = await getInvoiceAndClient(tenantId, invoiceId);
      res.setHeader("content-type", "application/pdf");
      res.send(renderInvoicePdf(invoice, client));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/invoices/:id/checkout", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "native", op: "createCheckoutSession", status: 400 });
      }
      const input = invoiceCheckoutBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "createInvoiceCheckout");
      const { invoice } = await getInvoiceAndClient(tenantId, invoiceId);
      const checkout = await createInvoiceCheckout({
        tenantId,
        invoice,
        req,
        provider: input.provider,
        method: input.method,
        ...(input.tipAmount !== undefined ? { tipAmount: input.tipAmount } : {})
      });
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, invoice: checkout.invoice, checkout: checkout.checkout });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/invoices/:id", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "native", op: "updateInvoiceDraft", status: 400 });
      }
      const input = updateInvoiceDraftBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "updateInvoiceDraft");
      const invoice = await ledger().updateInvoiceDraft({
        tenantId,
        invoiceId,
        actorId: actorIdForAccess(access),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.lineItems !== undefined ? { lineItems: input.lineItems } : {}),
        ...(input.discount !== undefined ? { discount: input.discount } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
        ...(input.terms !== undefined ? { terms: input.terms } : {}),
        ...(input.paymentSchedule !== undefined ? { paymentSchedule: input.paymentSchedule } : {}),
        ...(input.deliveryDefaults !== undefined ? { deliveryDefaults: input.deliveryDefaults } : {})
      });
      res.json({ ok: true, tenantId, actorRole: access.role, invoice });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/invoices/:id/send", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "native", op: "sendInvoice", status: 400 });
      }
      const input = sendInvoiceBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "sendInvoice");
      const sent = await ledger().sendInvoice({
        tenantId,
        invoiceId,
        actorId: actorIdForAccess(access),
        mode: input.mode,
        ...(input.target !== undefined ? { target: input.target } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.bodyText !== undefined ? { bodyText: input.bodyText } : {}),
        ...(input.includePdf !== undefined ? { includePdf: input.includePdf } : {}),
        ...(input.includeSummary !== undefined ? { includeSummary: input.includeSummary } : {}),
        ...(input.includePayLink !== undefined ? { includePayLink: input.includePayLink } : {}),
        ...(input.includeHostedLink !== undefined ? { includeHostedLink: input.includeHostedLink } : {}),
        publicBaseUrl: publicOrigin(req)
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...sent });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/crm/receipt-reviews/:id", async (req: Request, res: Response) => {
    try {
      const receiptReviewId = req.params.id;
      if (!receiptReviewId) {
        throw new RailError("Receipt review id is required.", { provider: "native", op: "updateReceiptReview", status: 400 });
      }
      const input = updateReceiptReviewBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "updateReceiptReview");
      const receiptReview = await ledger().updateReceiptReviewDraft({
        tenantId,
        receiptReviewId,
        actorId: actorIdForAccess(access),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.bodyText !== undefined ? { bodyText: input.bodyText } : {}),
        ...(input.emailRecipients !== undefined ? { emailRecipients: input.emailRecipients } : {}),
        ...(input.smsRecipients !== undefined ? { smsRecipients: input.smsRecipients } : {}),
        ...(input.sendChannels !== undefined ? { sendChannels: input.sendChannels } : {}),
        ...(input.attachmentIds !== undefined ? { attachmentIds: input.attachmentIds } : {})
      });
      res.json({ ok: true, tenantId, actorRole: access.role, receiptReview });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/receipt-reviews/:id/send", async (req: Request, res: Response) => {
    try {
      const receiptReviewId = req.params.id;
      if (!receiptReviewId) {
        throw new RailError("Receipt review id is required.", { provider: "native", op: "sendReceiptReview", status: 400 });
      }
      const input = updateReceiptReviewBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "sendReceiptReview");
      const sent = await ledger().sendReceiptReview({
        tenantId,
        receiptReviewId,
        actorId: actorIdForAccess(access),
        publicBaseUrl: publicOrigin(req),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.bodyText !== undefined ? { bodyText: input.bodyText } : {}),
        ...(input.emailRecipients !== undefined ? { emailRecipients: input.emailRecipients } : {}),
        ...(input.smsRecipients !== undefined ? { smsRecipients: input.smsRecipients } : {}),
        ...(input.sendChannels !== undefined ? { sendChannels: input.sendChannels } : {}),
        ...(input.attachmentIds !== undefined ? { attachmentIds: input.attachmentIds } : {})
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...sent });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    try {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        throw new RailError("Stripe webhook raw body was not captured.", { provider: "stripe", op: "webhook", status: 400 });
      }
      const event = verifyStripeWebhookEvent(env, rawBody, req.header("stripe-signature") ?? "");
      if (event.type !== "checkout.session.completed") {
        res.json({ ok: true, ignored: true, type: event.type });
        return;
      }
      const session = event.data.object;
      const metadata = typeof session.metadata === "object" && session.metadata ? session.metadata as Record<string, unknown> : {};
      const invoiceId = typeof metadata.invoiceId === "string" ? metadata.invoiceId : "";
      const tenantId = typeof metadata.tenantId === "string" ? metadata.tenantId : "";
      const tipAmount = typeof metadata.tipAmount === "string" && metadata.tipAmount.trim().length
        ? Number(metadata.tipAmount)
        : 0;
      const sessionId = typeof session.id === "string" ? session.id : "";
      const paymentStatus = typeof session.payment_status === "string" ? session.payment_status : "";
      if (!invoiceId || !tenantId || paymentStatus !== "paid") {
        throw new RailError("Stripe checkout session is missing paid invoice metadata.", { provider: "stripe", op: "webhook", status: 400 });
      }
      const { invoice } = await getInvoiceAndClient(tenantId, invoiceId);
      const amount = typeof session.amount_total === "number"
        ? Number((session.amount_total / 100).toFixed(2))
        : invoice.ledger?.balanceDue ?? invoice.totals.total;
      if (!deps.ledgerService) {
        throw new RailError("Ledger service is required for Stripe webhook settlement.", { provider: "stripe", op: "webhook", status: 501 });
      }
      const settled = await ledger().markStripeCheckoutPaid({
        tenantId,
        invoiceId,
        checkoutSessionId: sessionId,
        amount,
        ...(tipAmount > 0 ? { tipAmount } : {}),
        actorId: "stripe_webhook"
      });
      res.json({ ok: true, invoice: settled.invoice, payment: settled.payment, receiptReview: settled.receiptReview, ...(settled.credit ? { credit: settled.credit } : {}), eventType: "invoice.paid" });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/clients/:id/portal-link", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "sendPortalLink", status: 400 });
      }
      const input = sendPortalLinkBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "sendPortalLink");
      const result = await portalHub().issueMagicLink({
        tenantId,
        clientId,
        ...(input.propertyId ? { propertyId: input.propertyId } : {}),
        ...(input.target?.trim() ? { target: input.target.trim() } : {}),
        ...(input.preferredChannel ? { preferredChannel: input.preferredChannel } : {}),
        ...(input.sourceObjectType ? { sourceObjectType: input.sourceObjectType } : {}),
        ...(input.sourceObjectId ? { sourceObjectId: input.sourceObjectId } : {})
      });
      res.status(201).json({
        ok: true,
        tenantId,
        actorRole: access.role,
        clientId,
        portalLink: result.url,
        session: result.session,
        delivery: result.delivery,
        target: result.target
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/clients/:id/portal-activity", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "getClientPortalActivity", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "getClientPortalActivity");
      const activity = await portalHub().getPortalActivity({ tenantId, clientId });
      res.json({ ok: true, tenantId, actorRole: access.role, clientId, activity });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/clients/:id/statement", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "generateStatement", status: 400 });
      }
      const input = clientStatementQuerySchema.parse(req.query);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "generateStatement");
      const statement = await portalHub().generateStatementSnapshot({
        tenantId,
        clientId,
        ...(input.from ? { from: input.from } : {}),
        ...(input.to ? { to: input.to } : {})
      });
      res.json({ ok: true, tenantId, actorRole: access.role, clientId, statement });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/clients/:id/statement.pdf", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "renderStatementPdf", status: 400 });
      }
      const input = clientStatementQuerySchema.parse(req.query);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireBillingAccess(req, tenantId, "renderStatementPdf");
      const pdf = await portalHub().renderStatementPdf({
        tenantId,
        clientId,
        ...(input.from ? { from: input.from } : {}),
        ...(input.to ? { to: input.to } : {})
      });
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-disposition", `inline; filename=\"client-statement-${clientId}.pdf\"`);
      res.send(pdf);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/clients/:id/statements/send", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "sendStatement", status: 400 });
      }
      const input = sendStatementBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "sendStatement");
      const sent = await portalHub().sendStatement({
        tenantId,
        clientId,
        actorId: actorIdForAccess(access),
        ...(input.from ? { from: input.from } : {}),
        ...(input.to ? { to: input.to } : {}),
        ...(input.target?.trim() ? { target: input.target.trim() } : {})
      });
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, clientId, ...sent });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/crm/review-sequences", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "listReviewSequences");
      const status = await reviewSequences().listStatus(tenantId, {
        ...(typeof req.query.clientId === "string" && req.query.clientId.trim() ? { clientId: req.query.clientId } : {}),
        ...(typeof req.query.jobId === "string" && req.query.jobId.trim() ? { jobId: req.query.jobId } : {})
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...status });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/review-sequences/start", async (req: Request, res: Response) => {
    try {
      const input = startReviewSequenceBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "startReviewSequence");
      const sequence = await reviewSequences().maybeStartForJob({
        tenantId,
        jobId: input.jobId,
        ...(input.source ? { source: input.source } : {})
      });
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, sequence });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/review-sequences/:id/stop", async (req: Request, res: Response) => {
    try {
      const reviewSequenceId = req.params.id;
      if (!reviewSequenceId) {
        throw new RailError("Review sequence id is required.", { provider: "native", op: "stopReviewSequence", status: 400 });
      }
      const input = reviewSequenceActionBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "stopReviewSequence");
      const sequence = await reviewSequences().stopSequence({
        tenantId,
        reviewSequenceId,
        reason: "manual"
      });
      res.json({ ok: true, tenantId, actorRole: access.role, sequence });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/review-sequences/:id/mark-reviewed", async (req: Request, res: Response) => {
    try {
      const reviewSequenceId = req.params.id;
      if (!reviewSequenceId) {
        throw new RailError("Review sequence id is required.", { provider: "native", op: "markReviewed", status: 400 });
      }
      const input = reviewSequenceActionBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireQuoteAccess(req, tenantId, "markReviewed");
      const sequence = await reviewSequences().markReviewed({
        tenantId,
        reviewSequenceId
      });
      res.json({ ok: true, tenantId, actorRole: access.role, sequence });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/session/:sessionId", async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.sessionId;
      const token = typeof req.query.token === "string" ? req.query.token : "";
      const tenantId = portalTenantId(req);
      if (!sessionId || !token) {
        throw new RailError("Portal session id and token are required.", { provider: "native", op: "portalSessionStart", status: 400 });
      }
      const session = await portalHub().consumeMagicLink({ tenantId, sessionId, token });
      res.setHeader("set-cookie", portalHub().cookieHeader(session, token));
      res.redirect(303, portalPathWithTenant(tenantId, portalSessionDestination(session)));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const assignedTechnicians = await assignedTechniciansByVisitId(built.tenantId, built.snapshot.visits);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalHomeHtml(built.snapshot, {
        assignedTechniciansByVisitId: assignedTechnicians,
        ...(typeof req.query.status === "string" && req.query.status.trim() ? { statusMessage: req.query.status } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/quotes", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalQuotesHtml(built.snapshot));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/invoices", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalInvoicesHtml(built.snapshot));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/appointments", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const assignedTechnicians = await assignedTechniciansByVisitId(built.tenantId, built.snapshot.visits);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalAppointmentsHtml(built.snapshot, {
        assignedTechniciansByVisitId: assignedTechnicians,
        ...(typeof req.query.confirmedVisitId === "string" && req.query.confirmedVisitId.trim() ? { confirmedVisitId: req.query.confirmedVisitId } : {}),
        ...(typeof req.query.status === "string" && req.query.status.trim() ? { statusMessage: req.query.status } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexportal/visits/:id/confirm", async (req: Request, res: Response) => {
    try {
      const visitId = req.params.id;
      if (!visitId) {
        throw new RailError("Visit id is required.", { provider: "native", op: "portalConfirmVisit", status: 400 });
      }
      const portalAccess = await requirePortalSession(req);
      if (portalAccess.needsReverify) {
        const query = new URLSearchParams({
          tenantId: portalAccess.tenantId,
          returnPath: `/nexportal/appointments?tenantId=${encodeURIComponent(portalAccess.tenantId)}`
        });
        res.redirect(303, `/nexportal/reverify?${query.toString()}`);
        return;
      }
      const visit = await portalHub().confirmVisit({
        tenantId: portalAccess.tenantId,
        session: portalAccess.session,
        visitId
      });
      const destination = portalPathWithTenant(portalAccess.tenantId, "/nexportal/appointments", new URLSearchParams({
        confirmedVisitId: visit.id
      }));
      res.redirect(303, destination);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/documents", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const portalLibrary = await nexDocsService().listClientLibrary({
        tenantId: built.tenantId,
        clientId: built.snapshot.client.id,
        viewer: "portal",
        includeClientStatement: built.snapshot.session.scope !== "property",
        ...(built.snapshot.session.scope === "property" && built.snapshot.session.propertyId
          ? { propertyId: built.snapshot.session.propertyId }
          : {}),
        ...(typeof req.query.q === "string" && req.query.q.trim() ? { q: req.query.q.trim() } : {})
      });
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderUnifiedPortalDocumentsHtml({
        snapshot: built.snapshot,
        tenantId: built.tenantId,
        library: portalLibrary,
        ...(typeof req.query.q === "string" && req.query.q.trim() ? { searchQuery: req.query.q.trim() } : {}),
        ...(typeof req.query.status === "string" && req.query.status.trim() ? { uploadStatus: req.query.status.trim() } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexportal/documents/upload", async (req: Request, res: Response) => {
    try {
      const portalAccess = await requirePortalSession(req);
      const input = portalNexDocsUploadBodySchema.parse(req.body ?? {});
      if (input.tenantId !== portalAccess.tenantId) {
        throw new RailError("Portal upload tenant mismatch.", { provider: "native", op: "portalUploadNexDocsDocument", status: 403 });
      }
      const document = await nexDocsService().uploadDocument({
        tenantId: portalAccess.tenantId,
        clientId: portalAccess.session.clientId,
        folderId: input.folderId,
        label: input.label,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileBase64: input.fileBase64,
        source: "client_upload"
      }, env);
      res.status(201).json({ ok: true, document });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/documents/:id/file", async (req: Request, res: Response) => {
    try {
      const documentId = req.params.id;
      if (!documentId) {
        throw new RailError("Document id is required.", { provider: "native", op: "portalFetchNexDocsFile", status: 400 });
      }
      const portalAccess = await requirePortalSession(req);
      const document = await nexDocsService().getUploadedDocument(portalAccess.tenantId, documentId);
      const repository = repositoryForTenant();
      const [properties, jobs] = await Promise.all([
        repository.listProperties(portalAccess.tenantId),
        repository.listJobs(portalAccess.tenantId)
      ]);
      const propertyId = document.propertyId ?? (document.jobId ? jobs.find((job) => job.id === document.jobId)?.propertyId : undefined);
      const property = propertyId ? properties.find((record) => record.id === propertyId) : undefined;
      const propertyAllowed = portalAccess.session.scope !== "property" || property?.id === portalAccess.session.propertyId;
      if (document.clientId !== portalAccess.session.clientId || document.hiddenFromClient === true || !propertyAllowed) {
        throw new RailError("That NexDocs file is not available in this portal session.", { provider: "native", op: "portalFetchNexDocsFile", status: 403 });
      }
      await sendPortalNexDocsFile(res, {
        storageRef: document.storageRef,
        fallbackFileName: document.fileName,
        fallbackMimeType: document.mimeType
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/reverify", async (req: Request, res: Response) => {
    try {
      const portalAccess = await requirePortalSession(req);
      const clients = await providerForTenant(portalAccess.tenantId).getClients("");
      const clientName = clients.find((record) => record.id === portalAccess.session.clientId)?.name ?? "Client";
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalReverifyHtml({
        branding: await tenantBranding(portalAccess.tenantId),
        clientName,
        tenantId: portalAccess.tenantId,
        sessionId: portalAccess.session.id,
        ...(typeof req.query.returnPath === "string" && req.query.returnPath.trim() ? { returnPath: req.query.returnPath } : {}),
        ...(typeof req.query.status === "string" && req.query.status.trim() ? { statusMessage: req.query.status } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexportal/reverify/phone", async (req: Request, res: Response) => {
    try {
      const input = portalPhoneReverifyBodySchema.parse(req.body);
      await portalHub().reverifyByPhoneLast4({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        last4: input.last4
      });
      const returnPath = input.returnPath?.startsWith("/nexportal") ? input.returnPath : "/nexportal";
      const [pathOnly, queryString] = returnPath.split("?", 2);
      const query = new URLSearchParams(queryString ?? "");
      if (!query.get("tenantId")) {
        query.set("tenantId", input.tenantId);
      }
      res.redirect(303, `${pathOnly}?${query.toString()}`);
    } catch (error) {
      if (error instanceof RailError) {
        const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
        const tenantId = typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId : defaultTenantId(env);
        const returnPath = typeof body.returnPath === "string" && body.returnPath.startsWith("/nexportal") ? body.returnPath : "/nexportal";
        const query = new URLSearchParams({
          tenantId,
          returnPath,
          status: error.message
        });
        res.redirect(303, `/nexportal/reverify?${query.toString()}`);
        return;
      }
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/review", async (req: Request, res: Response) => {
    try {
      const tenantId = portalTenantId(req);
      const clientId = typeof req.query.clientId === "string" ? req.query.clientId : "";
      const jobId = typeof req.query.jobId === "string" ? req.query.jobId : "";
      if (!clientId || !jobId) {
        throw new RailError("Client and job ids are required for the review request link.", { provider: "native", op: "portalReviewLanding", status: 400 });
      }
      const [clients, jobs] = await Promise.all([
        providerForTenant(tenantId).getClients(""),
        repositoryForTenant().listJobs(tenantId)
      ]);
      const client = clients.find((record) => record.id === clientId);
      const job = jobs.find((record) => record.id === jobId);
      if (!client || !job) {
        throw new RailError("The linked review request could not be resolved.", { provider: "native", op: "portalReviewLanding", status: 404 });
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalReviewLandingHtml({
        branding: await tenantBranding(tenantId),
        clientName: client.name,
        jobTitle: job.title,
        ...(typeof req.query.message === "string" && req.query.message.trim() ? { message: req.query.message } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/reviews/opt-out", async (req: Request, res: Response) => {
    try {
      const tenantId = portalTenantId(req);
      const reviewSequenceId = typeof req.query.sequenceId === "string" ? req.query.sequenceId : "";
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!reviewSequenceId || !token) {
        throw new RailError("Review sequence and token are required.", { provider: "native", op: "reviewOptOut", status: 400 });
      }
      const stopped = await reviewSequences().optOut({
        tenantId,
        reviewSequenceId,
        token
      });
      const client = (await providerForTenant(tenantId).getClients("")).find((record) => record.id === stopped.clientId);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortalOptOutHtml({
        branding: await tenantBranding(tenantId),
        clientName: client?.name ?? "Client",
        stopped: true
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/quotes/:id", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const quoteId = req.params.id;
      const quote = built.snapshot.quotes.find((record) => record.id === quoteId);
      if (!quote) {
        throw new RailError("That quote is not available in this portal session.", { provider: "native", op: "portalQuoteDetail", status: 404 });
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderQuotePortalHtml(quote, "", built.snapshot.client, {
        approvalBlockedReason: quoteApprovalBlockedReason(quote),
        pdfPath: portalPathWithTenant(built.tenantId, `/nexportal/quotes/${encodeURIComponent(quote.id)}/pdf`),
        receiptReviews: built.snapshot.receiptReviews.filter((record) => record.quoteId === quote.id),
        approvalPath: portalPathWithTenant(built.tenantId, `/api/nexportal/quotes/${encodeURIComponent(quote.id)}/approve`),
        changeRequestPath: portalPathWithTenant(built.tenantId, `/api/nexportal/quotes/${encodeURIComponent(quote.id)}/change-request`),
        chrome: {
          badge: "NexPortal",
          title: quote.title,
          subtitle: "Review scope, approval proof, and receipt history without leaving the client hub.",
          backHref: portalPathWithTenant(built.tenantId, "/nexportal/quotes"),
          backLabel: "Back to quotes",
          navLinks: [
            { href: portalPathWithTenant(built.tenantId, "/nexportal"), label: "Overview" },
            { href: portalPathWithTenant(built.tenantId, "/nexportal/quotes"), label: "Quotes", active: true },
            { href: portalPathWithTenant(built.tenantId, "/nexportal/invoices"), label: "Invoices" },
            { href: portalPathWithTenant(built.tenantId, "/nexportal/appointments"), label: "Appointments" },
            { href: portalPathWithTenant(built.tenantId, "/nexportal/documents"), label: "Documents" }
          ],
          ...(typeof req.query.status === "string" && req.query.status.trim() ? { statusMessage: req.query.status } : {})
        }
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/quotes/:id/pdf", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const quoteId = req.params.id;
      const quote = built.snapshot.quotes.find((record) => record.id === quoteId);
      if (!quote) {
        throw new RailError("That quote PDF is not available in this portal session.", { provider: "native", op: "portalQuotePdf", status: 404 });
      }
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-disposition", `inline; filename=\"quote-${quote.number ?? quote.id}.pdf\"`);
      res.send(renderQuotePdf(quote, built.snapshot.client));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexportal/quotes/:id/approve", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "portalSessionApproveQuote", status: 400 });
      }
      const portalAccess = await requirePortalSession(req);
      if (portalAccess.needsReverify) {
        throw new RailError("Portal access needs re-verification before this approval can continue.", { provider: "native", op: "portalSessionApproveQuote", status: 401 });
      }
      const input = portalSessionQuoteApprovalBodySchema.parse(req.body);
      const [provider, snapshot, settings] = await Promise.all([
        Promise.resolve(providerForTenant(portalAccess.tenantId)),
        portalHub().buildSnapshot({ tenantId: portalAccess.tenantId, session: portalAccess.session }),
        repositoryForTenant().getCrmSettings(portalAccess.tenantId)
      ]);
      const quote = snapshot.quotes.find((record) => record.id === quoteId);
      if (!quote) {
        throw new RailError("That quote is not available in this portal session.", { provider: "native", op: "portalSessionApproveQuote", status: 403 });
      }
      const blocked = quoteApprovalBlockedReason(quote);
      if (blocked) {
        throw new RailError(blocked, { provider: "native", op: "portalSessionApproveQuote", status: 409 });
      }
      if (quote.approvalRules.requireSignature && !((input.signatureMode === "typed" && input.typedName?.trim()) || input.drawnDataUrl?.trim())) {
        throw new RailError("This quote requires a signature before approval.", { provider: "native", op: "portalSessionApproveQuote", status: 400 });
      }
      if (quote.approvalRules.requireDeposit && !input.deposit?.cardholderName?.trim()) {
        throw new RailError("This quote requires deposit details before approval.", { provider: "native", op: "portalSessionApproveQuote", status: 400 });
      }
      if (quote.approvalRules.requireCardOnFile && (!input.deposit?.cardOnFileAuthorized || !input.deposit.cardLast4)) {
        throw new RailError("This quote requires card-on-file authorization before approval.", { provider: "native", op: "portalSessionApproveQuote", status: 400 });
      }
      const approvedAt = new Date().toISOString();
      const signatureMode = input.signatureMode ?? (input.drawnDataUrl ? "drawn" : "typed");
      const approved = await provider.updateQuote(quote.id, {
        status: "approved",
        approvedAt,
        approvedBy: input.customerName.trim(),
        approvedByRole: "client",
        updatedAt: approvedAt,
        signature: {
          mode: signatureMode,
          signedAt: approvedAt,
          ...(input.typedName?.trim() ? { typedName: input.typedName.trim() } : {}),
          ...(input.drawnDataUrl?.trim() ? { drawnDataUrl: input.drawnDataUrl.trim() } : {}),
          ipAddress: req.ip || req.socket.remoteAddress || "unknown"
        },
        deposit: quote.deposit ? {
          ...quote.deposit,
          ...(input.deposit?.cardholderName?.trim() ? { cardholderName: input.deposit.cardholderName.trim() } : {}),
          ...(input.deposit?.cardBrand?.trim() ? { cardBrand: input.deposit.cardBrand.trim() } : {}),
          ...(input.deposit?.cardLast4 ? { cardLast4: input.deposit.cardLast4 } : {}),
          ...(input.deposit?.cardOnFileAuthorized !== undefined ? { cardOnFileAuthorized: input.deposit.cardOnFileAuthorized } : {}),
          ...(input.deposit?.cardOnFileAuthorized ? { autoSavedCardOnFile: true } : {}),
          ...(quote.deposit.required ? { capturedAt: approvedAt } : {})
        } : quote.deposit
      });
      await eventBus.emit({
        tenantId: approved.tenantId,
        type: "quote.signed",
        payload: { quoteId: approved.id, clientId: approved.clientId, signedAt: approvedAt, signerName: input.customerName.trim() }
      });
      await eventBus.emit({
        tenantId: approved.tenantId,
        type: "quote.approved",
        payload: { quoteId: approved.id, clientId: approved.clientId, approvedAt, approvedBy: input.customerName.trim(), approvedByRole: "client" }
      });
      if (deps.ledgerService) {
        await ledger().syncQuoteDepositBridge(approved);
      }
      const quotePortalUrl = `${publicOrigin(req)}${portalPathWithTenant(portalAccess.tenantId, `/nexportal/quotes/${encodeURIComponent(approved.id)}`)}`;
      const quoteVars = quoteTemplateVariables({ quote: approved, client: snapshot.client, portalUrl: quotePortalUrl });
      if (deps.commsRail?.sendAdapter && snapshot.client.emails[0]) {
        const approvalMessage = resolveTemplateMessage({
          settings,
          category: "quote_approval_confirmation",
          channel: "email",
          fallbackSubject: "Quote approved",
          fallbackBodyText: [
            `We recorded approval for quote ${approved.number ?? approved.id} on ${approvedAt}.`,
            "",
            quotePortalUrl
          ].join("\n"),
          variables: quoteVars
        });
        if (approvalMessage.enabled) {
          await deps.commsRail.sendAdapter.sendEmail({
            tenantId: approved.tenantId,
            mailbox: deps.commsRail.sendAdapter.mailbox,
            to: [snapshot.client.emails[0]],
            subject: approvalMessage.subject,
            bodyText: approvalMessage.bodyText
          });
        }
      }
      if (approved.deposit?.capturedAt && deps.commsRail?.sendAdapter && deps.platformRepository) {
        const officeRecipients = [...new Set(
          (await deps.platformRepository.listTenantUsers(portalAccess.tenantId))
            .filter((user) => user.active && (user.role === "OWNER" || user.role === "OFFICE_ADMIN"))
            .flatMap((user) => user.email ? [user.email.trim().toLowerCase()] : [])
        )];
        if (officeRecipients.length) {
          const depositMessage = resolveTemplateMessage({
            settings,
            category: "deposit_paid_confirmation",
            channel: "email",
            fallbackSubject: `Deposit paid for ${approved.number ?? approved.id}`,
            fallbackBodyText: [
              `Deposit received for quote ${approved.number ?? approved.id}.`,
              `Amount: ${approved.deposit.amount.toFixed(2)}`,
              `Client: ${snapshot.client.name}`,
              quotePortalUrl
            ].join("\n"),
            variables: quoteVars
          });
          if (depositMessage.enabled) {
            await deps.commsRail.sendAdapter.sendEmail({
              tenantId: approved.tenantId,
              mailbox: deps.commsRail.sendAdapter.mailbox,
              to: officeRecipients,
              subject: depositMessage.subject,
              bodyText: depositMessage.bodyText
            });
          }
          await eventBus.emit({
            tenantId: approved.tenantId,
            type: "quote.deposit_paid",
            payload: {
              quoteId: approved.id,
              clientId: approved.clientId,
              capturedAt: approved.deposit.capturedAt,
              amount: approved.deposit.amount
            }
          });
        }
      }
      res.json({ ok: true, quote: approved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexportal/quotes/:id/change-request", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "portalSessionQuoteChangeRequest", status: 400 });
      }
      const portalAccess = await requirePortalSession(req);
      if (portalAccess.needsReverify) {
        throw new RailError("Portal access needs re-verification before this change request can continue.", { provider: "native", op: "portalSessionQuoteChangeRequest", status: 401 });
      }
      const input = portalSessionQuoteChangeRequestBodySchema.parse(req.body);
      const provider = providerForTenant(portalAccess.tenantId);
      const snapshot = await portalHub().buildSnapshot({ tenantId: portalAccess.tenantId, session: portalAccess.session });
      const quote = snapshot.quotes.find((record) => record.id === quoteId);
      if (!quote) {
        throw new RailError("That quote is not available in this portal session.", { provider: "native", op: "portalSessionQuoteChangeRequest", status: 403 });
      }
      const blocked = quoteApprovalBlockedReason(quote);
      if (blocked) {
        throw new RailError(blocked, { provider: "native", op: "portalSessionQuoteChangeRequest", status: 409 });
      }
      if (!input.lineComments.length && !input.note?.trim()) {
        throw new RailError("Add a line comment or note before requesting changes.", { provider: "native", op: "portalSessionQuoteChangeRequest", status: 400 });
      }
      const requestedAt = new Date().toISOString();
      const updated = await provider.updateQuote(quote.id, {
        status: "change_requested",
        updatedAt: requestedAt,
        changeRequests: [
          ...(quote.changeRequests ?? []),
          {
            id: `quote_change_${randomUUID()}`,
            requestedAt,
            ...(input.customerName?.trim() ? { requestedBy: input.customerName.trim() } : {}),
            lineComments: input.lineComments,
            ...(input.note?.trim() ? { note: input.note.trim() } : {})
          }
        ]
      });
      await eventBus.emit({
        tenantId: updated.tenantId,
        type: "quote.change_requested",
        payload: { quoteId: updated.id, clientId: updated.clientId, requestedAt }
      });
      res.json({ ok: true, quote: updated });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/invoices/:id", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const invoiceId = req.params.id;
      const invoice = built.snapshot.invoices.find((record) => record.id === invoiceId);
      if (!invoice) {
        throw new RailError("That invoice is not available in this portal session.", { provider: "native", op: "portalInvoiceDetail", status: 404 });
      }
      const settings = await repositoryForTenant().getCrmSettings(built.tenantId);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderInvoicePortalHtml(invoice, "", built.snapshot.client, {
        checkoutBasePath: portalPathWithTenant(built.tenantId, `/api/nexportal/invoices/${encodeURIComponent(invoice.id)}/checkout`),
        tippingEnabled: settings.invoiceDefaults.tippingEnabled,
        paymentRecorded: req.query.paid === "1",
        chrome: {
          badge: "NexPortal",
          title: invoice.title,
          subtitle: "Review the balance rail, payment schedule, and receipt history in one place.",
          backHref: portalPathWithTenant(built.tenantId, "/nexportal/invoices"),
          backLabel: "Back to invoices",
          navLinks: [
            { href: portalPathWithTenant(built.tenantId, "/nexportal"), label: "Overview" },
            { href: portalPathWithTenant(built.tenantId, "/nexportal/quotes"), label: "Quotes" },
            { href: portalPathWithTenant(built.tenantId, "/nexportal/invoices"), label: "Invoices", active: true },
            { href: portalPathWithTenant(built.tenantId, "/nexportal/appointments"), label: "Appointments" },
            { href: portalPathWithTenant(built.tenantId, "/nexportal/documents"), label: "Documents" }
          ],
          ...(typeof req.query.status === "string" && req.query.status.trim() ? { statusMessage: req.query.status } : {})
        }
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/invoices/:id/pdf", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const invoiceId = req.params.id;
      const invoice = built.snapshot.invoices.find((record) => record.id === invoiceId);
      if (!invoice) {
        throw new RailError("That invoice PDF is not available in this portal session.", { provider: "native", op: "portalInvoicePdf", status: 404 });
      }
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-disposition", `inline; filename=\"invoice-${invoice.number ?? invoice.id}.pdf\"`);
      res.send(renderInvoicePdf(invoice, built.snapshot.client));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/statements/:clientId.pdf", async (req: Request, res: Response) => {
    try {
      const built = await buildPortalSnapshotOrRedirect(req, res);
      if (!built) {
        return;
      }
      const clientId = req.params.clientId;
      if (!clientId || built.snapshot.client.id !== clientId || built.session.scope !== "client") {
        throw new RailError("That statement is not available in this portal session.", { provider: "native", op: "portalStatementPdf", status: 403 });
      }
      const pdf = await portalHub().renderStatementPdf({
        tenantId: built.tenantId,
        clientId
      });
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-disposition", `inline; filename=\"statement-${clientId}.pdf\"`);
      res.send(pdf);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexportal/invoices/:id/checkout", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "native", op: "portalSessionInvoiceCheckout", status: 400 });
      }
      const portalAccess = await requirePortalSession(req);
      if (portalAccess.needsReverify) {
        const query = new URLSearchParams({
          tenantId: portalAccess.tenantId,
          returnPath: portalPathWithTenant(portalAccess.tenantId, `/nexportal/invoices/${encodeURIComponent(invoiceId)}`)
        });
        res.redirect(303, `/nexportal/reverify?${query.toString()}`);
        return;
      }
      const snapshot = await portalHub().buildSnapshot({ tenantId: portalAccess.tenantId, session: portalAccess.session });
      const invoice = snapshot.invoices.find((record) => record.id === invoiceId);
      if (!invoice) {
        throw new RailError("That invoice is not available in this portal session.", { provider: "native", op: "portalSessionInvoiceCheckout", status: 403 });
      }
      const rawProvider = typeof req.query.provider === "string" ? req.query.provider : "stripe";
      const rawMethod = typeof req.query.method === "string" ? req.query.method : (rawProvider === "stripe" ? "card" : "paypal");
      const checkoutInput = invoiceCheckoutBodySchema.parse({
        tenantId: portalAccess.tenantId,
        provider: rawProvider,
        method: rawMethod,
        tipAmount: typeof req.query.tipAmount === "string" ? req.query.tipAmount : undefined
      });
      const successPath = portalPathWithTenant(portalAccess.tenantId, `/nexportal/invoices/${encodeURIComponent(invoice.id)}`, new URLSearchParams({
        paid: "1",
        session_id: "{CHECKOUT_SESSION_ID}"
      }));
      const cancelPath = portalPathWithTenant(portalAccess.tenantId, `/nexportal/invoices/${encodeURIComponent(invoice.id)}`);
      const paypalReturnPath = portalPathWithTenant(portalAccess.tenantId, `/nexportal/invoices/${encodeURIComponent(invoice.id)}/paypal-return`, new URLSearchParams({
        method: checkoutInput.method,
        ...(checkoutInput.tipAmount !== undefined ? { tipAmount: checkoutInput.tipAmount.toFixed(2) } : {})
      }));
      const checkout = await createInvoiceCheckout({
        tenantId: portalAccess.tenantId,
        invoice,
        req,
        provider: checkoutInput.provider,
        method: checkoutInput.method,
        ...(checkoutInput.tipAmount !== undefined ? { tipAmount: checkoutInput.tipAmount } : {}),
        successPath,
        cancelPath,
        paypalReturnPath
      });
      if (!checkout.checkout.url) {
        throw new RailError("No hosted checkout URL was returned for that payment method.", { provider: checkoutInput.provider, op: "portalSessionInvoiceCheckout", status: 502 });
      }
      res.redirect(303, checkout.checkout.url);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/invoices/:id/paypal-return", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "paypal", op: "portalSessionInvoicePaypalReturn", status: 400 });
      }
      const portalAccess = await requirePortalSession(req);
      if (portalAccess.needsReverify) {
        const query = new URLSearchParams({
          tenantId: portalAccess.tenantId,
          returnPath: portalPathWithTenant(portalAccess.tenantId, `/nexportal/invoices/${encodeURIComponent(invoiceId)}`)
        });
        res.redirect(303, `/nexportal/reverify?${query.toString()}`);
        return;
      }
      const orderId = typeof req.query.token === "string" ? req.query.token : "";
      const tipAmount = typeof req.query.tipAmount === "string" ? Number(req.query.tipAmount) : 0;
      const method = typeof req.query.method === "string" && req.query.method === "venmo" ? "venmo" : "paypal";
      if (!orderId) {
        throw new RailError("PayPal order token is required.", { provider: "paypal", op: "portalSessionInvoicePaypalReturn", status: 400 });
      }
      const snapshot = await portalHub().buildSnapshot({ tenantId: portalAccess.tenantId, session: portalAccess.session });
      const invoice = snapshot.invoices.find((record) => record.id === invoiceId);
      if (!invoice) {
        throw new RailError("That invoice is not available in this portal session.", { provider: "paypal", op: "portalSessionInvoicePaypalReturn", status: 403 });
      }
      const existing = deps.ledgerService
        ? (await ledger().listPayments(portalAccess.tenantId)).find((payment) => payment.externalIds?.paypalOrderId === orderId && payment.status === "succeeded")
        : undefined;
      if (!existing) {
        const order = await capturePaypalCheckoutOrder({
          env,
          tenantId: portalAccess.tenantId,
          orderId
        });
        const purchaseUnits: Array<Record<string, unknown>> = Array.isArray((order as { purchase_units?: unknown }).purchase_units)
          ? ((order as unknown as { purchase_units: Array<Record<string, unknown>> }).purchase_units)
          : [];
        const paymentsNode = purchaseUnits
          .map((unit) => unit.payments)
          .find((payments): payments is Record<string, unknown> => Boolean(payments));
        const captures = Array.isArray(paymentsNode?.captures) ? paymentsNode.captures as Array<Record<string, unknown>> : [];
        const paypalCaptureId = typeof captures[0]?.id === "string" ? captures[0].id : undefined;
        await ledger().recordInvoicePayment({
          tenantId: portalAccess.tenantId,
          invoiceId,
          amount: Number(((invoice.ledger?.balanceDue ?? invoice.totals.total) + (Number.isFinite(tipAmount) ? tipAmount : 0)).toFixed(2)),
          ...(Number.isFinite(tipAmount) && tipAmount > 0 ? { tipAmount } : {}),
          provider: "paypal",
          method,
          actorId: "portal_paypal_return",
          externalIds: {
            paypalOrderId: order.id,
            ...(paypalCaptureId ? { paypalCaptureId } : {})
          }
        });
      }
      res.redirect(303, portalPathWithTenant(portalAccess.tenantId, `/nexportal/invoices/${encodeURIComponent(invoiceId)}`, new URLSearchParams({
        paid: "1",
        provider: "paypal"
      })));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/portal/quotes/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const token = typeof req.query.token === "string" ? req.query.token : "";
      const quoteId = req.params.id;
      if (!quoteId || !token) {
        throw new RailError("Quote id and token are required.", { provider: "native", op: "quotePortal", status: 400 });
      }
      const { quote, client } = await getQuoteAndClient(tenantId, quoteId);
      if (!quote.portal?.tokenHash || quote.portal.tokenHash !== hashPortalToken(token)) {
        throw new RailError("Quote portal token is invalid.", { provider: "native", op: "quotePortal", status: 403 });
      }
      await eventBus.emit({
        tenantId: quote.tenantId,
        type: "quote.viewed",
        payload: {
          quoteId: quote.id,
          clientId: quote.clientId,
          viewedAt: new Date().toISOString()
        }
      });
      const pdfPath = `/portal/quotes/${encodeURIComponent(quote.id)}/pdf?tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(token)}`;
      const receiptReviews = deps.ledgerService
        ? (await ledger().listReceiptReviews(tenantId)).filter((record) => record.quoteId === quote.id)
        : [];
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderQuotePortalHtml(quote, token, client, {
        approvalBlockedReason: quoteApprovalBlockedReason(quote),
        pdfPath,
        receiptReviews
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/portal/invoices/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const token = typeof req.query.token === "string"
        ? req.query.token
        : typeof req.query.portalToken === "string"
          ? req.query.portalToken
          : "";
      const invoiceId = req.params.id;
      if (!invoiceId || !token) {
        throw new RailError("Invoice id and token are required.", { provider: "native", op: "invoicePortal", status: 400 });
      }
      const { invoice, client } = await getInvoiceAndClient(tenantId, invoiceId);
      if (!invoice.portal?.tokenHash || invoice.portal.tokenHash !== hashPortalToken(token)) {
        throw new RailError("Invoice portal token is invalid.", { provider: "native", op: "invoicePortal", status: 403 });
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderInvoicePortalHtml(invoice, token, client));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/portal/invoices/:id/checkout", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "native", op: "portalInvoiceCheckout", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!token) {
        throw new RailError("Invoice portal token is required.", { provider: "native", op: "portalInvoiceCheckout", status: 400 });
      }
      const rawProvider = typeof req.query.provider === "string" ? req.query.provider : "stripe";
      const rawMethod = typeof req.query.method === "string" ? req.query.method : (rawProvider === "stripe" ? "card" : "paypal");
      const checkoutInput = invoiceCheckoutBodySchema.parse({
        tenantId,
        provider: rawProvider,
        method: rawMethod,
        tipAmount: typeof req.query.tipAmount === "string" ? req.query.tipAmount : undefined
      });
      const { invoice } = await getInvoiceAndClient(tenantId, invoiceId);
      if (!invoice.portal?.tokenHash || invoice.portal.tokenHash !== hashPortalToken(token)) {
        throw new RailError("Invoice portal token is invalid.", { provider: "native", op: "portalInvoiceCheckout", status: 403 });
      }
      const checkout = await createInvoiceCheckout({
        tenantId,
        invoice,
        req,
        provider: checkoutInput.provider,
        method: checkoutInput.method,
        portalToken: token,
        ...(checkoutInput.tipAmount !== undefined ? { tipAmount: checkoutInput.tipAmount } : {})
      });
      if (!checkout.checkout.url) {
        throw new RailError("No hosted checkout URL was returned for that payment method.", { provider: checkoutInput.provider, op: "portalInvoiceCheckout", status: 502 });
      }
      res.redirect(303, checkout.checkout.url);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/portal/invoices/:id/paid", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "stripe", op: "invoicePaidRedirect", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const portalToken = typeof req.query.portalToken === "string" ? req.query.portalToken : "";
      if (!portalToken) {
        throw new RailError("Portal token is required.", { provider: "stripe", op: "invoicePaidRedirect", status: 400 });
      }
      const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : "";
      const destination = `/portal/invoices/${encodeURIComponent(invoiceId)}?tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(portalToken)}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}&paid=1` : "&paid=1"}`;
      res.redirect(303, destination);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/portal/invoices/:id/paypal-return", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "paypal", op: "invoicePaypalReturn", status: 400 });
      }
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const portalToken = typeof req.query.portalToken === "string" ? req.query.portalToken : "";
      const orderId = typeof req.query.token === "string" ? req.query.token : "";
      const tipAmount = typeof req.query.tipAmount === "string" ? Number(req.query.tipAmount) : 0;
      const method = typeof req.query.method === "string" && req.query.method === "venmo" ? "venmo" : "paypal";
      if (!portalToken || !orderId) {
        throw new RailError("Portal token and PayPal order token are required.", { provider: "paypal", op: "invoicePaypalReturn", status: 400 });
      }
      const { invoice } = await getInvoiceAndClient(tenantId, invoiceId);
      if (!invoice.portal?.tokenHash || invoice.portal.tokenHash !== hashPortalToken(portalToken)) {
        throw new RailError("Invoice portal token is invalid.", { provider: "paypal", op: "invoicePaypalReturn", status: 403 });
      }
      const existing = deps.ledgerService
        ? (await ledger().listPayments(tenantId)).find((payment) => payment.externalIds?.paypalOrderId === orderId && payment.status === "succeeded")
        : undefined;
      if (!existing) {
        const order = await capturePaypalCheckoutOrder({
          env,
          tenantId,
          orderId
        });
        const purchaseUnits: Array<Record<string, unknown>> = Array.isArray((order as { purchase_units?: unknown }).purchase_units)
          ? ((order as unknown as { purchase_units: Array<Record<string, unknown>> }).purchase_units)
          : [];
        const paymentsNode = purchaseUnits
          .map((unit) => unit.payments)
          .find((payments): payments is Record<string, unknown> => Boolean(payments));
        const captures = Array.isArray(paymentsNode?.captures) ? paymentsNode.captures as Array<Record<string, unknown>> : [];
        const paypalCaptureId = typeof captures[0]?.id === "string" ? captures[0].id : undefined;
        await ledger().recordInvoicePayment({
          tenantId,
          invoiceId,
          amount: Number(((invoice.ledger?.balanceDue ?? invoice.totals.total) + (Number.isFinite(tipAmount) ? tipAmount : 0)).toFixed(2)),
          ...(Number.isFinite(tipAmount) && tipAmount > 0 ? { tipAmount } : {}),
          provider: "paypal",
          method,
          actorId: "portal_paypal_return",
          externalIds: {
            paypalOrderId: order.id,
            ...(paypalCaptureId ? { paypalCaptureId } : {})
          }
        });
      }
      res.redirect(303, `/portal/invoices/${encodeURIComponent(invoiceId)}?tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(portalToken)}&paid=1&provider=paypal`);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/portal/quotes/:id/approve", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "approveQuote", status: 400 });
      }
      const input = portalQuoteApprovalInputSchema.parse(req.body);
      const { provider, quote, client } = await getQuoteAndClient(input.tenantId, quoteId);
      if (!quote.portal?.tokenHash || quote.portal.tokenHash !== hashPortalToken(input.token)) {
        throw new RailError("Quote portal token is invalid.", { provider: "native", op: "approveQuote", status: 403 });
      }
      const blocked = quoteApprovalBlockedReason(quote);
      if (blocked) {
        throw new RailError(blocked, { provider: "native", op: "approveQuote", status: 409 });
      }
      if (quote.approvalRules.requireSignature && !((input.signatureMode === "typed" && input.typedName?.trim()) || input.drawnDataUrl?.trim())) {
        throw new RailError("This quote requires a signature before approval.", { provider: "native", op: "approveQuote", status: 400 });
      }
      if (quote.approvalRules.requireDeposit && !input.deposit?.cardholderName?.trim()) {
        throw new RailError("This quote requires deposit details before approval.", { provider: "native", op: "approveQuote", status: 400 });
      }
      if (quote.approvalRules.requireCardOnFile && (!input.deposit?.cardOnFileAuthorized || !input.deposit.cardLast4)) {
        throw new RailError("This quote requires card-on-file authorization before approval.", { provider: "native", op: "approveQuote", status: 400 });
      }
      const approvedAt = new Date().toISOString();
      const signatureMode = input.signatureMode ?? (input.drawnDataUrl ? "drawn" : "typed");
      const approved = await provider.updateQuote(quote.id, {
        status: "approved",
        approvedAt,
        approvedBy: input.customerName.trim(),
        approvedByRole: "client",
        updatedAt: approvedAt,
        signature: {
          mode: signatureMode,
          signedAt: approvedAt,
          ...(input.typedName?.trim() ? { typedName: input.typedName.trim() } : {}),
          ...(input.drawnDataUrl?.trim() ? { drawnDataUrl: input.drawnDataUrl.trim() } : {}),
          ipAddress: req.ip || req.socket.remoteAddress || "unknown"
        },
        deposit: quote.deposit ? {
          ...quote.deposit,
          ...(input.deposit?.cardholderName?.trim() ? { cardholderName: input.deposit.cardholderName.trim() } : {}),
          ...(input.deposit?.cardBrand?.trim() ? { cardBrand: input.deposit.cardBrand.trim() } : {}),
          ...(input.deposit?.cardLast4 ? { cardLast4: input.deposit.cardLast4 } : {}),
          ...(input.deposit?.cardOnFileAuthorized !== undefined ? { cardOnFileAuthorized: input.deposit.cardOnFileAuthorized } : {}),
          ...(input.deposit?.cardOnFileAuthorized ? { autoSavedCardOnFile: true } : {}),
          ...(quote.deposit.required ? { capturedAt: approvedAt } : {})
        } : quote.deposit
      });
      await eventBus.emit({
        tenantId: approved.tenantId,
        type: "quote.signed",
        payload: { quoteId: approved.id, clientId: approved.clientId, signedAt: approvedAt, signerName: input.customerName.trim() }
      });
      await eventBus.emit({
        tenantId: approved.tenantId,
        type: "quote.approved",
        payload: { quoteId: approved.id, clientId: approved.clientId, approvedAt, approvedBy: input.customerName.trim(), approvedByRole: "client" }
      });
      if (deps.ledgerService) {
        await ledger().syncQuoteDepositBridge(approved);
      }
      const settings = await repositoryForTenant().getCrmSettings(input.tenantId);
      const quotePortalUrl = portalUrlForQuote(approved, input.token);
      const quoteVars = quoteTemplateVariables({ quote: approved, client, portalUrl: quotePortalUrl });
      if (deps.commsRail?.sendAdapter && client?.emails[0]) {
        const approvalMessage = resolveTemplateMessage({
          settings,
          category: "quote_approval_confirmation",
          channel: "email",
          fallbackSubject: "Quote approved",
          fallbackBodyText: [
            `We recorded approval for quote ${approved.number ?? approved.id} on ${approvedAt}.`,
            "",
            quotePortalUrl
          ].join("\n"),
          variables: quoteVars
        });
        if (approvalMessage.enabled) {
          await deps.commsRail.sendAdapter.sendEmail({
            tenantId: approved.tenantId,
            mailbox: deps.commsRail.sendAdapter.mailbox,
            to: [client.emails[0]],
            subject: approvalMessage.subject,
            bodyText: approvalMessage.bodyText
          });
        }
      }
      if (approved.deposit?.capturedAt && deps.commsRail?.sendAdapter && deps.platformRepository) {
        const officeRecipients = [...new Set(
          (await deps.platformRepository.listTenantUsers(input.tenantId))
            .filter((user) => user.active && (user.role === "OWNER" || user.role === "OFFICE_ADMIN"))
            .flatMap((user) => user.email ? [user.email.trim().toLowerCase()] : [])
        )];
        if (officeRecipients.length) {
          const depositMessage = resolveTemplateMessage({
            settings,
            category: "deposit_paid_confirmation",
            channel: "email",
            fallbackSubject: `Deposit paid for ${approved.number ?? approved.id}`,
            fallbackBodyText: [
              `Deposit received for quote ${approved.number ?? approved.id}.`,
              `Amount: ${approved.deposit.amount.toFixed(2)}`,
              `Client: ${client?.name ?? approved.clientId}`,
              quotePortalUrl
            ].join("\n"),
            variables: quoteVars
          });
          if (depositMessage.enabled) {
            await deps.commsRail.sendAdapter.sendEmail({
              tenantId: approved.tenantId,
              mailbox: deps.commsRail.sendAdapter.mailbox,
              to: officeRecipients,
              subject: depositMessage.subject,
              bodyText: depositMessage.bodyText
            });
          }
          await eventBus.emit({
            tenantId: approved.tenantId,
            type: "quote.deposit_paid",
            payload: {
              quoteId: approved.id,
              clientId: approved.clientId,
              capturedAt: approved.deposit.capturedAt,
              amount: approved.deposit.amount
            }
          });
        }
      }
      res.json({ ok: true, quote: approved });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/portal/quotes/:id/change-request", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "changeQuote", status: 400 });
      }
      const input = portalQuoteChangeRequestInputSchema.parse(req.body);
      const { provider, quote } = await getQuoteAndClient(input.tenantId, quoteId);
      if (!quote.portal?.tokenHash || quote.portal.tokenHash !== hashPortalToken(input.token)) {
        throw new RailError("Quote portal token is invalid.", { provider: "native", op: "changeQuote", status: 403 });
      }
      const blocked = quoteApprovalBlockedReason(quote);
      if (blocked) {
        throw new RailError(blocked, { provider: "native", op: "changeQuote", status: 409 });
      }
      if (!input.lineComments.length && !input.note?.trim()) {
        throw new RailError("Add a line comment or note before requesting changes.", { provider: "native", op: "changeQuote", status: 400 });
      }
      const requestedAt = new Date().toISOString();
      const updated = await provider.updateQuote(quote.id, {
        status: "change_requested",
        updatedAt: requestedAt,
        changeRequests: [
          ...(quote.changeRequests ?? []),
          {
            id: `quote_change_${randomUUID()}`,
            requestedAt,
            ...(input.customerName?.trim() ? { requestedBy: input.customerName.trim() } : {}),
            lineComments: input.lineComments,
            ...(input.note?.trim() ? { note: input.note.trim() } : {})
          }
        ]
      });
      await eventBus.emit({
        tenantId: updated.tenantId,
        type: "quote.change_requested",
        payload: { quoteId: updated.id, clientId: updated.clientId, requestedAt }
      });
      res.json({ ok: true, quote: updated });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/invoices/:id/payments", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "native", op: "recordInvoicePayment", status: 400 });
      }
      const input = recordInvoicePaymentBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "recordInvoicePayment");
      const recorded = await ledger().recordInvoicePayment({
        tenantId,
        invoiceId,
        amount: input.amount,
        ...(input.tipAmount !== undefined ? { tipAmount: input.tipAmount } : {}),
        provider: input.provider,
        method: input.method,
        actorId: actorIdForAccess(access),
        ...(input.note ? { note: input.note } : {}),
        ...(input.savedCardId ? { savedCardId: input.savedCardId } : {}),
        ...(input.methodDetails ? { methodDetails: input.methodDetails } : {}),
        ...(input.externalIds ? { externalIds: input.externalIds } : {}),
        ...(input.status ? { status: input.status } : {})
      });
      res.status(201).json({ ok: true, tenantId, actorRole: access.role, ...recorded });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/payments/:id/refund", async (req: Request, res: Response) => {
    try {
      const paymentId = req.params.id;
      if (!paymentId) {
        throw new RailError("Payment id is required.", { provider: "native", op: "refundPayment", status: 400 });
      }
      const input = refundPaymentBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "refundPayment");
      const result = await ledger().performLedgerAction({
        tenantId,
        action: "refund_payment",
        paymentId,
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
        actorId: actorIdForAccess(access)
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/invoices/:id/void", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "native", op: "voidInvoice", status: 400 });
      }
      const input = invoiceLedgerActionBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "voidInvoice");
      const result = await ledger().performLedgerAction({
        tenantId,
        action: "void_invoice",
        invoiceId,
        ...(input.reason ? { reason: input.reason } : {}),
        actorId: actorIdForAccess(access)
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/invoices/:id/bad-debt", async (req: Request, res: Response) => {
    try {
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "native", op: "markBadDebt", status: 400 });
      }
      const input = invoiceLedgerActionBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireBillingAccess(req, tenantId, "markBadDebt");
      const result = await ledger().performLedgerAction({
        tenantId,
        action: "mark_bad_debt",
        invoiceId,
        ...(input.reason ? { reason: input.reason } : {}),
        actorId: actorIdForAccess(access)
      });
      res.json({ ok: true, tenantId, actorRole: access.role, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
