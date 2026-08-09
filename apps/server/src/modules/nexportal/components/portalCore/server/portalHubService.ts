import { createHash, randomBytes, randomUUID } from "node:crypto";
import { RailError, type BusEvent, type Client, type EventBus, type Invoice, type Job, type Property, type Quote, type ReceiptReview, type TenantBranding } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { CommsRail } from "../../../../../comms/gmailRegistry.js";
import type { MediaRepository } from "../../../../../fielddocs/mediaRepository.js";
import { defaultTenantBranding, type PlatformRepository } from "../../../../../platform/repository.js";
import type { SchedulingRepository } from "../../../../../scheduling/repository.js";
import type { ScheduledVisit } from "../../../../../scheduling/schedulingEngine.js";
import { resolveTemplateMessage, statementTemplateVariables } from "../../../../nexops/areas/settings/components/tenantConfig/server/communicationTemplates.js";
import type { LedgerRepository } from "../../../../nexops/areas/invoices/components/paymentRails/server/ledgerRepository.js";
import { type PortalSessionRecord, type PortalHubRepository, type PortalSessionScope, type PortalVerificationMethod } from "./portalHubRepository.js";

import { renderClientStatementPdf, type ClientStatementLine, type ClientStatementSnapshot } from "../../../../nexops/areas/invoices/components/invoiceStructure/server/statementPdf.js";

export const CLIENT_PORTAL_COOKIE = "nexportal_session";

export interface PortalMagicLinkResult {
  session: PortalSessionRecord;
  token: string;
  url: string;
  delivery: "email" | "sms" | "direct";
  target: string;
}

export interface PortalDocumentRecord {
  id: string;
  kind: "uploaded_file" | "quote_pdf" | "invoice_pdf" | "receipt" | "statement" | "field_report" | "photo" | "signed_document";
  label: string;
  href: string;
  propertyLabel: string;
  occurredAt: string;
  jobId?: string | undefined;
  visitId?: string | undefined;
  propertyId?: string | undefined;
}

export interface PortalActivityEntry {
  id: string;
  occurredAt: string;
  title: string;
  detail: string;
  objectType: "quote" | "invoice" | "visit" | "statement" | "payment" | "portal";
  objectId?: string | undefined;
}

export interface PortalHubSnapshot {
  session: PortalSessionRecord;
  branding: TenantBranding;
  client: Client;
  properties: Property[];
  quotes: Quote[];
  invoices: Invoice[];
  visits: ScheduledVisit[];
  receiptReviews: ReceiptReview[];
  documents: PortalDocumentRecord[];
  portalActivity: PortalActivityEntry[];
}

interface PortalHubServiceDeps {
  crmRepository: NativeCrmRepository;
  ledgerRepository: LedgerRepository;
  schedulingRepository: SchedulingRepository;
  repository: PortalHubRepository;
  fieldDocsRepository?: Pick<MediaRepository, "listMedia" | "listReports" | "listSignedDocuments" | "listNexDocsDocuments"> | undefined;
  eventBus?: EventBus | undefined;
  platformRepository?: Pick<PlatformRepository, "getTenantBranding"> | undefined;
  commsRail?: CommsRail | undefined;
  publicBaseUrl: string;
}

function now(): string {
  return new Date().toISOString();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizedPhone(value: string | undefined): string {
  return (value ?? "").replace(/\D+/g, "");
}

function absoluteUrl(baseUrl: string, relativePath: string): string {
  return `${baseUrl.replace(/\/$/, "")}${relativePath.startsWith("/") ? relativePath : `/${relativePath}`}`;
}

function cookieValue(sessionId: string, token: string): string {
  return `${sessionId}.${token}`;
}

function parseCookie(header: string | undefined): Record<string, string> {
  return Object.fromEntries(
    (header ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const pivot = part.indexOf("=");
        if (pivot === -1) {
          return [part, ""] as const;
        }
        return [part.slice(0, pivot), decodeURIComponent(part.slice(pivot + 1))] as const;
      })
  );
}

function parseSessionCookie(value: string | undefined): { sessionId: string; token: string } | null {
  if (!value) {
    return null;
  }
  const pivot = value.indexOf(".");
  if (pivot <= 0 || pivot >= value.length - 1) {
    return null;
  }
  return {
    sessionId: value.slice(0, pivot),
    token: value.slice(pivot + 1)
  };
}

function portalEntryTitle(event: BusEvent): string {
  switch (event.type) {
    case "quote.viewed":
      return "Quote viewed";
    case "quote.approved":
      return "Quote approved";
    case "payment.created":
      return "Payment recorded";
    case "portal.link_sent":
      return "Portal link sent";
    case "portal.session_started":
      return "Portal session started";
    case "visit.confirmed":
      return "Appointment confirmed";
    case "statement.sent":
      return "Statement sent";
    case "review.sequence_started":
      return "Review follow-up started";
    case "review.sequence_step_sent":
      return "Review request sent";
    case "review.sequence_stopped":
      return "Review follow-up stopped";
    case "review.marked":
      return "Review marked complete";
    default:
      return event.type.replace(/\./g, " ");
  }
}

function portalEntryDetail(event: BusEvent): string {
  const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
  if (event.type === "payment.created") {
    const amount = typeof payload.amount === "number" ? payload.amount : 0;
    return `Payment of $${amount.toFixed(2)} was recorded.`;
  }
  if (event.type === "visit.confirmed") {
    return "The appointment was confirmed from the portal.";
  }
  if (event.type === "portal.link_sent") {
    return "A fresh magic link went out to the client.";
  }
  if (event.type === "statement.sent") {
    return "A client statement was delivered.";
  }
  if (event.type === "review.sequence_started") {
    return "The job entered the review follow-up rail.";
  }
  if (event.type === "review.sequence_step_sent") {
    return "A review request step was sent to the client.";
  }
  if (event.type === "review.sequence_stopped") {
    return "The review follow-up rail was stopped.";
  }
  if (event.type === "review.marked") {
    return "The office marked the review request complete.";
  }
  return "Portal activity recorded.";
}

function eventObjectType(event: BusEvent): PortalActivityEntry["objectType"] {
  if (event.type.startsWith("quote.")) {
    return "quote";
  }
  if (event.type.startsWith("payment.")) {
    return "payment";
  }
  if (event.type.startsWith("visit.")) {
    return "visit";
  }
  if (event.type.startsWith("statement.")) {
    return "statement";
  }
  if (event.type.startsWith("invoice.")) {
    return "invoice";
  }
  return "portal";
}

function eventObjectId(event: BusEvent): string | undefined {
  const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
  const keys = ["quoteId", "invoiceId", "visitId", "paymentId", "reviewSequenceId", "portalSessionId"];
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function stableTimestamp(...values: Array<string | undefined>): string {
  return values.find((value): value is string => Boolean(value?.trim())) ?? now();
}

function propertyLabelForJob(
  properties: Property[],
  jobsById: Map<string, Job>,
  jobId: string | undefined
): string {
  if (!jobId) {
    return "Client";
  }
  const propertyId = jobsById.get(jobId)?.propertyId;
  if (!propertyId) {
    return "Client";
  }
  return properties.find((record) => record.id === propertyId)?.label ?? "Property";
}

function propertyLabelForPropertyId(properties: Property[], propertyId: string | undefined): string {
  if (!propertyId) {
    return "Client";
  }
  return properties.find((record) => record.id === propertyId)?.label ?? "Property";
}

function jobAllowsPortalFieldDocs(job: Job | undefined): boolean {
  return job?.clientVisibility?.hideFieldDocsFromPortal !== true;
}

// A portal session is not an internal-record viewer. These are the only
// lifecycle states that have crossed the customer-delivery boundary.
function quoteIsVisibleInPortal(quote: Quote): boolean {
  return Boolean(quote.portal?.tokenHash)
    && (quote.status === "sent" || quote.status === "change_requested" || quote.status === "approved");
}

function invoiceIsVisibleInPortal(invoice: Invoice): boolean {
  return Boolean(invoice.portal?.tokenHash)
    && (invoice.status === "sent" || invoice.status === "awaiting_payment" || invoice.status === "partial_pay" || invoice.status === "paid");
}

export class PortalHubService {
  constructor(private readonly deps: PortalHubServiceDeps) {}

  cookieName(): string {
    return CLIENT_PORTAL_COOKIE;
  }

  cookieHeader(session: PortalSessionRecord, token: string): string {
    return `${CLIENT_PORTAL_COOKIE}=${encodeURIComponent(cookieValue(session.id, token))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
  }

  clearCookieHeader(): string {
    return `${CLIENT_PORTAL_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  private async resolveBranding(tenantId: string): Promise<TenantBranding> {
    return await this.deps.platformRepository?.getTenantBranding(tenantId) ?? defaultTenantBranding(tenantId);
  }

  private async resolveObjectLink(input: { tenantId: string; objectType: "quote" | "invoice"; objectId: string; token: string }): Promise<{ clientId: string }> {
    if (input.objectType === "quote") {
      const quote = await this.deps.crmRepository.getQuote(input.tenantId, input.objectId);
      if (!quote?.portal?.tokenHash || quote.portal.tokenHash !== hashToken(input.token)) {
        throw new RailError("Quote portal token is invalid.", { provider: "native", op: "portalObjectLink", status: 403 });
      }
      return { clientId: quote.clientId };
    }
    const invoice = (await this.deps.crmRepository.listInvoices(input.tenantId)).find((record) => record.id === input.objectId);
    if (!invoice?.portal?.tokenHash || invoice.portal.tokenHash !== hashToken(input.token)) {
      throw new RailError("Invoice portal token is invalid.", { provider: "native", op: "portalObjectLink", status: 403 });
    }
    return { clientId: invoice.clientId };
  }

  private async saveSession(input: {
    tenantId: string;
    clientId: string;
    scope: PortalSessionScope;
    propertyId?: string | undefined;
    token: string;
    verificationMethod: PortalVerificationMethod;
    sourceObjectType?: "quote" | "invoice" | undefined;
    sourceObjectId?: string | undefined;
    target?: string | undefined;
  }): Promise<PortalSessionRecord> {
    const timestamp = now();
    const record: PortalSessionRecord = {
      id: `portal_session_${randomUUID()}`,
      tenantId: input.tenantId,
      clientId: input.clientId,
      scope: input.scope,
      ...(input.propertyId ? { propertyId: input.propertyId } : {}),
      tokenHash: hashToken(input.token),
      createdAt: timestamp,
      updatedAt: timestamp,
      issuedAt: timestamp,
      lastSentAt: timestamp,
      lastVerifiedAt: timestamp,
      lastActivityAt: timestamp,
      verificationMethod: input.verificationMethod,
      ...(input.sourceObjectType ? { sourceObjectType: input.sourceObjectType } : {}),
      ...(input.sourceObjectId ? { sourceObjectId: input.sourceObjectId } : {}),
      ...(input.target ? { target: input.target } : {})
    };
    return this.deps.repository.upsertPortalSession(record);
  }

  async issueMagicLink(input: {
    tenantId: string;
    clientId: string;
    propertyId?: string | undefined;
    target?: string | undefined;
    preferredChannel?: "email" | "sms" | undefined;
    sourceObjectType?: "quote" | "invoice" | undefined;
    sourceObjectId?: string | undefined;
  }): Promise<PortalMagicLinkResult> {
    const clients = await this.deps.crmRepository.listClients(input.tenantId);
    const client = clients.find((record) => record.id === input.clientId);
    if (!client) {
      throw new RailError(`Client ${input.clientId} was not found.`, { provider: "native", op: "sendPortalLink", status: 404 });
    }
    const target = input.target?.trim()
      || (input.preferredChannel === "sms" ? client.phones[0] : client.emails[0])
      || client.emails[0]
      || client.phones[0];
    if (!target) {
      throw new RailError("A client email or phone number is required before a portal link can be sent.", { provider: "native", op: "sendPortalLink", status: 400 });
    }
    const token = randomBytes(18).toString("hex");
    const session = await this.saveSession({
      tenantId: input.tenantId,
      clientId: input.clientId,
      scope: input.propertyId ? "property" : "client",
      ...(input.propertyId ? { propertyId: input.propertyId } : {}),
      token,
      verificationMethod: "magic_link",
      ...(input.sourceObjectType ? { sourceObjectType: input.sourceObjectType } : {}),
      ...(input.sourceObjectId ? { sourceObjectId: input.sourceObjectId } : {}),
      target
    });
    const url = absoluteUrl(this.deps.publicBaseUrl, `/nexportal/session/${encodeURIComponent(session.id)}?tenantId=${encodeURIComponent(input.tenantId)}&token=${encodeURIComponent(token)}`);
    const delivery = target.includes("@") ? "email" : "sms";
    if (delivery === "email" && this.deps.commsRail?.sendAdapter) {
      await this.deps.commsRail.sendAdapter.sendEmail({
        tenantId: input.tenantId,
        mailbox: this.deps.commsRail.sendAdapter.mailbox,
        to: [target],
        subject: "Open your NexPortal",
        bodyText: `Use this secure link to open your client portal:\n\n${url}`
      });
    } else if (delivery === "sms" && this.deps.commsRail?.sendSms) {
      await this.deps.commsRail.sendSms({
        tenantId: input.tenantId,
        to: target,
        body: `Open your secure client portal here: ${url}`
      });
    }
    await this.deps.eventBus?.emit({
      tenantId: input.tenantId,
      type: "portal.link_sent",
      payload: {
        clientId: input.clientId,
        portalSessionId: session.id,
        target,
        delivery
      }
    });
    return { session, token, url, delivery: (this.deps.commsRail ? delivery : "direct"), target };
  }

  async beginSessionFromObjectLink(input: { tenantId: string; objectType: "quote" | "invoice"; objectId: string; token: string }): Promise<PortalMagicLinkResult> {
    const resolved = await this.resolveObjectLink(input);
    return this.issueMagicLink({
      tenantId: input.tenantId,
      clientId: resolved.clientId,
      sourceObjectType: input.objectType,
      sourceObjectId: input.objectId
    });
  }

  async consumeMagicLink(input: { tenantId: string; sessionId: string; token: string }): Promise<PortalSessionRecord> {
    const session = await this.deps.repository.getPortalSession(input.tenantId, input.sessionId);
    if (!session || session.revokedAt) {
      throw new RailError("Portal session was not found.", { provider: "native", op: "portalConsumeMagicLink", status: 404 });
    }
    if (session.tokenHash !== hashToken(input.token)) {
      throw new RailError("Portal session token is invalid.", { provider: "native", op: "portalConsumeMagicLink", status: 403 });
    }
    const timestamp = now();
    const saved = await this.deps.repository.upsertPortalSession({
      ...session,
      lastVerifiedAt: timestamp,
      lastActivityAt: timestamp,
      updatedAt: timestamp,
      verificationMethod: "magic_link"
    });
    await this.deps.eventBus?.emit({
      tenantId: saved.tenantId,
      type: "portal.session_started",
      payload: {
        clientId: saved.clientId,
        portalSessionId: saved.id,
        scope: saved.scope
      }
    });
    return saved;
  }

  async authenticateCookie(input: { tenantId: string; cookieHeader?: string | undefined }): Promise<{ session: PortalSessionRecord; needsReverify: boolean } | null> {
    const cookie = parseSessionCookie(parseCookie(input.cookieHeader)[CLIENT_PORTAL_COOKIE]);
    if (!cookie) {
      return null;
    }
    const session = await this.deps.repository.getPortalSession(input.tenantId, cookie.sessionId);
    if (!session || session.revokedAt || session.tokenHash !== hashToken(cookie.token)) {
      return null;
    }
    const settings = await this.deps.crmRepository.getCrmSettings(input.tenantId);
    const maxAgeDays = settings.portalDefaults.hubSessionReverifyDays;
    const ageMs = Date.now() - new Date(session.lastVerifiedAt).getTime();
    return {
      session,
      needsReverify: Number.isFinite(ageMs) && ageMs > maxAgeDays * 24 * 60 * 60 * 1000
    };
  }

  async reverifyByPhoneLast4(input: { tenantId: string; sessionId: string; last4: string }): Promise<PortalSessionRecord> {
    const session = await this.deps.repository.getPortalSession(input.tenantId, input.sessionId);
    if (!session) {
      throw new RailError("Portal session was not found.", { provider: "native", op: "portalReverifyPhone", status: 404 });
    }
    const client = (await this.deps.crmRepository.listClients(input.tenantId)).find((record) => record.id === session.clientId);
    if (!client) {
      throw new RailError(`Client ${session.clientId} was not found.`, { provider: "native", op: "portalReverifyPhone", status: 404 });
    }
    const normalized = normalizedPhone(input.last4);
    const matched = client.phones.some((phone) => normalizedPhone(phone).endsWith(normalized));
    if (!normalized || normalized.length !== 4 || !matched) {
      throw new RailError("Those last four digits do not match the client phone on file.", { provider: "native", op: "portalReverifyPhone", status: 403 });
    }
    const timestamp = now();
    return this.deps.repository.upsertPortalSession({
      ...session,
      verificationMethod: "phone_last4",
      lastVerifiedAt: timestamp,
      lastActivityAt: timestamp,
      updatedAt: timestamp
    });
  }

  private propertyFilter(session: PortalSessionRecord, jobPropertyId?: string | undefined): boolean {
    if (session.scope !== "property") {
      return true;
    }
    return Boolean(session.propertyId && jobPropertyId === session.propertyId);
  }

  private eventMatchesSessionScope(
    session: PortalSessionRecord,
    event: BusEvent,
    jobsById: Map<string, Job>,
    quotesById: Map<string, Quote>,
    invoicesById: Map<string, Invoice>
  ): boolean {
    if (session.scope !== "property") {
      return true;
    }
    const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
    const jobId = typeof payload.jobId === "string" ? payload.jobId : undefined;
    const quoteId = typeof payload.quoteId === "string" ? payload.quoteId : undefined;
    const invoiceId = typeof payload.invoiceId === "string" ? payload.invoiceId : undefined;
    const jobPropertyId = jobId
      ? jobsById.get(jobId)?.propertyId
      : quoteId
        ? jobsById.get(quotesById.get(quoteId)?.jobId ?? "")?.propertyId
        : invoiceId
          ? jobsById.get(invoicesById.get(invoiceId)?.jobId ?? "")?.propertyId
          : undefined;
    return this.propertyFilter(session, jobPropertyId);
  }

  async buildSnapshot(input: { tenantId: string; session: PortalSessionRecord }): Promise<PortalHubSnapshot> {
    const [branding, clients, properties, quotes, invoices, jobs, visits, receiptReviews, events, fieldDocsMedia, fieldDocsReports, signedDocuments, nexDocsDocuments] = await Promise.all([
      this.resolveBranding(input.tenantId),
      this.deps.crmRepository.listClients(input.tenantId),
      this.deps.crmRepository.listProperties(input.tenantId),
      this.deps.crmRepository.listQuotes(input.tenantId),
      this.deps.crmRepository.listInvoices(input.tenantId),
      this.deps.crmRepository.listJobs(input.tenantId),
      this.deps.schedulingRepository.listVisits(input.tenantId, {}),
      this.deps.ledgerRepository.listReceiptReviews(input.tenantId),
      this.deps.eventBus?.listEvents({ tenantId: input.tenantId, limit: 250 }) ?? Promise.resolve([]),
      this.deps.fieldDocsRepository?.listMedia(input.tenantId) ?? Promise.resolve([]),
      this.deps.fieldDocsRepository?.listReports(input.tenantId) ?? Promise.resolve([]),
      this.deps.fieldDocsRepository?.listSignedDocuments(input.tenantId) ?? Promise.resolve([]),
      this.deps.fieldDocsRepository?.listNexDocsDocuments(input.tenantId) ?? Promise.resolve([])
    ]);
    const client = clients.find((record) => record.id === input.session.clientId);
    if (!client) {
      throw new RailError(`Client ${input.session.clientId} was not found.`, { provider: "native", op: "buildPortalSnapshot", status: 404 });
    }
    const clientProperties = properties.filter((record) => record.clientId === client.id)
      .filter((record) => input.session.scope !== "property" || record.id === input.session.propertyId);
    const jobById = new Map(jobs.map((job) => [job.id, job]));
    const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const clientJobs = jobs.filter((record) => record.clientId === client.id)
      .filter((record) => this.propertyFilter(input.session, record.propertyId));
    const propertyIds = new Set(clientJobs.map((job) => job.propertyId).filter(Boolean));
    const clientQuotes = quotes.filter((record) => {
      const propertyId = record.jobId ? jobById.get(record.jobId)?.propertyId : undefined;
      return record.clientId === client.id
        && quoteIsVisibleInPortal(record)
        && this.propertyFilter(input.session, propertyId);
    });
    const clientInvoices = invoices.filter((record) => {
      const propertyId = record.jobId ? jobById.get(record.jobId)?.propertyId : undefined;
      return record.clientId === client.id
        && invoiceIsVisibleInPortal(record)
        && this.propertyFilter(input.session, propertyId);
    });
    const clientVisits = visits.filter((record) => {
      const job = jobById.get(record.jobId);
      return job?.clientId === client.id && this.propertyFilter(input.session, job.propertyId);
    });
    const clientReceipts = receiptReviews
      .filter((record) => record.clientId === client.id)
      .filter((record) => record.status === "sent")
      .filter((record) => this.propertyFilter(input.session, record.jobId ? jobById.get(record.jobId)?.propertyId : undefined));
    const clientFieldReports = fieldDocsReports
      .filter((record) => {
        const job = jobById.get(record.jobId);
        const propertyId = record.propertyId ?? job?.propertyId;
        return (job?.clientId === client.id || propertyIds.has(propertyId ?? ""))
          && this.propertyFilter(input.session, propertyId);
      })
      .filter((record) => jobAllowsPortalFieldDocs(jobById.get(record.jobId)));
    const clientSignedDocuments = signedDocuments
      .filter((record) => record.clientId === client.id)
      .filter((record) => record.status === "signed")
      .filter((record) => {
        const job = record.jobId ? jobById.get(record.jobId) : undefined;
        const propertyId = record.propertyId ?? job?.propertyId;
        return this.propertyFilter(input.session, propertyId);
      })
      .filter((record) => jobAllowsPortalFieldDocs(record.jobId ? jobById.get(record.jobId) : undefined));
    const clientUploadedDocuments = nexDocsDocuments
      .filter((record) => record.clientId === client.id)
      .filter((record) => record.hiddenFromClient !== true)
      .filter((record) => {
        const propertyId = record.propertyId ?? jobById.get(record.jobId ?? "")?.propertyId;
        return this.propertyFilter(input.session, propertyId);
      });
    const clientMedia = fieldDocsMedia
      .filter((record) => record.type === "photo")
      .filter((record) => !record.trashedAt)
      .filter((record) => record.hiddenFromClient !== true)
      .filter((record) => {
        const job = record.jobId ? jobById.get(record.jobId) : undefined;
        const propertyId = record.propertyId ?? job?.propertyId;
        return (job?.clientId === client.id || propertyIds.has(propertyId ?? ""))
          && this.propertyFilter(input.session, propertyId);
      })
      .filter((record) => jobAllowsPortalFieldDocs(record.jobId ? jobById.get(record.jobId) : undefined));
    const portalActivity = events
      .filter((event) => {
        const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
        return payload.clientId === client.id && this.eventMatchesSessionScope(input.session, event, jobById, quoteById, invoiceById);
      })
      .slice(0, 25)
      .map((event) => {
        const objectId = eventObjectId(event);
        return {
        id: event.id,
        occurredAt: event.ts,
        title: portalEntryTitle(event),
        detail: portalEntryDetail(event),
        objectType: eventObjectType(event),
        ...(objectId ? { objectId } : {})
      };
      });
    const documents: PortalDocumentRecord[] = [
      ...clientQuotes.map((quote) => ({
        id: `quote_pdf_${quote.id}`,
        kind: "quote_pdf" as const,
        label: `${quote.number ?? quote.id} PDF`,
        href: `/nexportal/quotes/${encodeURIComponent(quote.id)}/pdf?tenantId=${encodeURIComponent(input.tenantId)}`,
        propertyLabel: propertyLabelForJob(properties, jobById, quote.jobId),
        occurredAt: stableTimestamp(quote.updatedAt, quote.createdAt)
      })),
      ...clientInvoices.map((invoice) => ({
        id: `invoice_pdf_${invoice.id}`,
        kind: "invoice_pdf" as const,
        label: `${invoice.number ?? invoice.id} PDF`,
        href: `/nexportal/invoices/${encodeURIComponent(invoice.id)}/pdf?tenantId=${encodeURIComponent(input.tenantId)}`,
        propertyLabel: propertyLabelForJob(properties, jobById, invoice.jobId),
        occurredAt: stableTimestamp(invoice.updatedAt, invoice.createdAt, invoice.sentAt, invoice.paidAt)
      })),
      ...clientReceipts.map((review) => ({
        id: `receipt_${review.id}`,
        kind: "receipt" as const,
        label: review.subject,
        href: review.hostedLink,
        propertyLabel: propertyLabelForJob(properties, jobById, review.jobId),
        occurredAt: stableTimestamp(review.updatedAt, review.createdAt),
        ...(review.jobId ? { jobId: review.jobId } : {})
      })),
      ...clientUploadedDocuments.map((document) => ({
        id: document.id,
        kind: "uploaded_file" as const,
        label: document.label,
        href: `/nexportal/documents/${encodeURIComponent(document.id)}/file?tenantId=${encodeURIComponent(input.tenantId)}`,
        propertyLabel: propertyLabelForPropertyId(properties, document.propertyId ?? jobById.get(document.jobId ?? "")?.propertyId),
        occurredAt: stableTimestamp(document.updatedAt, document.createdAt),
        ...(document.jobId ? { jobId: document.jobId } : {}),
        ...(document.visitId ? { visitId: document.visitId } : {}),
        ...(document.propertyId ? { propertyId: document.propertyId } : {})
      })),
      ...clientFieldReports.map((report) => ({
        id: `field_report_${report.id}`,
        kind: "field_report" as const,
        label: report.title,
        href: `/api/fielddocs/reports/${encodeURIComponent(report.id)}/pdf?tenantId=${encodeURIComponent(input.tenantId)}`,
        propertyLabel: propertyLabelForPropertyId(properties, report.propertyId ?? jobById.get(report.jobId)?.propertyId),
        occurredAt: stableTimestamp(report.postedAt, report.createdAt),
        jobId: report.jobId,
        ...(report.visitId ? { visitId: report.visitId } : {}),
        ...(report.propertyId ? { propertyId: report.propertyId } : {})
      })),
      ...clientSignedDocuments.map((record) => ({
        id: `signed_document_${record.id}`,
        kind: "signed_document" as const,
        label: record.title,
        href: `/api/fielddocs/signed-documents/${encodeURIComponent(record.id)}/pdf?tenantId=${encodeURIComponent(input.tenantId)}`,
        propertyLabel: propertyLabelForPropertyId(properties, record.propertyId ?? jobById.get(record.jobId ?? "")?.propertyId),
        occurredAt: stableTimestamp(record.signedAt, record.updatedAt, record.createdAt),
        ...(record.jobId ? { jobId: record.jobId } : {}),
        ...(record.visitId ? { visitId: record.visitId } : {}),
        ...(record.propertyId ? { propertyId: record.propertyId } : {})
      })),
      ...clientMedia.map((media) => ({
        id: `photo_${media.id}`,
        kind: "photo" as const,
        label: media.aiCaption ?? `Visit photo ${media.id}`,
        href: `/api/media/${encodeURIComponent(media.id)}?tenantId=${encodeURIComponent(input.tenantId)}`,
        propertyLabel: propertyLabelForPropertyId(properties, media.propertyId ?? jobById.get(media.jobId ?? "")?.propertyId),
        occurredAt: stableTimestamp(media.exif?.ts),
        ...(media.jobId ? { jobId: media.jobId } : {}),
        ...(media.visitId ? { visitId: media.visitId } : {}),
        ...(media.propertyId ? { propertyId: media.propertyId } : {})
      })),
      ...(input.session.scope === "client" ? [{
        id: `statement_${client.id}`,
        kind: "statement" as const,
        label: "Client statement",
        href: `/nexportal/statements/${encodeURIComponent(client.id)}.pdf?tenantId=${encodeURIComponent(input.tenantId)}`,
        propertyLabel: "Client",
        occurredAt: now()
      }] : [])
    ]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    return {
      session: input.session,
      branding,
      client,
      properties: clientProperties,
      quotes: clientQuotes.sort((left, right) => stableTimestamp(right.updatedAt, right.createdAt).localeCompare(stableTimestamp(left.updatedAt, left.createdAt))),
      invoices: clientInvoices.sort((left, right) => stableTimestamp(right.updatedAt, right.createdAt, right.sentAt, right.paidAt).localeCompare(stableTimestamp(left.updatedAt, left.createdAt, left.sentAt, left.paidAt))),
      visits: clientVisits.sort((left, right) => left.start.localeCompare(right.start)),
      receiptReviews: clientReceipts.sort((left, right) => stableTimestamp(right.updatedAt, right.createdAt).localeCompare(stableTimestamp(left.updatedAt, left.createdAt))),
      documents,
      portalActivity
    };
  }

  async listPortalActivity(input: { tenantId: string; clientId: string; propertyId?: string | undefined }): Promise<PortalActivityEntry[]> {
    const syntheticSession: PortalSessionRecord = {
      id: `portal_lookup_${input.propertyId ?? input.clientId}`,
      tenantId: input.tenantId,
      clientId: input.clientId,
      scope: input.propertyId ? "property" : "client",
      ...(input.propertyId ? { propertyId: input.propertyId } : {}),
      tokenHash: "lookup_only",
      createdAt: now(),
      updatedAt: now(),
      issuedAt: now(),
      lastVerifiedAt: now(),
      lastActivityAt: now(),
      verificationMethod: "magic_link"
    };
    const snapshot = await this.buildSnapshot({
      tenantId: input.tenantId,
      session: syntheticSession
    });
    return snapshot.portalActivity;
  }

  async confirmVisit(input: { tenantId: string; session: PortalSessionRecord; visitId: string }): Promise<ScheduledVisit> {
    const visit = await this.deps.schedulingRepository.getVisit(input.tenantId, input.visitId);
    if (!visit) {
      throw new RailError(`Visit ${input.visitId} was not found.`, { provider: "native", op: "portalConfirmVisit", status: 404 });
    }
    const jobs = await this.deps.crmRepository.listJobs(input.tenantId);
    const job = jobs.find((record) => record.id === visit.jobId);
    if (!job || job.clientId !== input.session.clientId || !this.propertyFilter(input.session, job.propertyId)) {
      throw new RailError("That appointment is not available for this portal session.", { provider: "native", op: "portalConfirmVisit", status: 403 });
    }
    const timestamp = now();
    const saved = await this.deps.schedulingRepository.saveVisit({
      ...visit,
      confirmedAt: timestamp,
      confirmedBy: input.session.clientId,
      confirmedVia: "portal"
    });
    await this.deps.eventBus?.emit({
      tenantId: input.tenantId,
      type: "visit.confirmed",
      payload: {
        visitId: saved.id,
        jobId: saved.jobId,
        clientId: input.session.clientId,
        confirmedAt: timestamp
      }
    });
    return saved;
  }

  async generateStatementSnapshot(input: { tenantId: string; clientId: string; from?: string | undefined; to?: string | undefined }): Promise<ClientStatementSnapshot> {
    const [clients, invoices, payments, credits, refunds] = await Promise.all([
      this.deps.crmRepository.listClients(input.tenantId),
      this.deps.crmRepository.listInvoices(input.tenantId),
      this.deps.ledgerRepository.listPayments(input.tenantId),
      this.deps.ledgerRepository.listCredits(input.tenantId),
      this.deps.ledgerRepository.listRefunds(input.tenantId)
    ]);
    const client = clients.find((record) => record.id === input.clientId);
    if (!client) {
      throw new RailError(`Client ${input.clientId} was not found.`, { provider: "native", op: "generateStatement", status: 404 });
    }
    const from = input.from ? new Date(input.from) : null;
    const to = input.to ? new Date(input.to) : null;
    const inRange = (value: string | undefined) => {
      if (!value) {
        return false;
      }
      const date = new Date(value);
      return (!from || date >= from) && (!to || date <= to);
    };
    const rows: Array<Omit<ClientStatementLine, "runningBalance">> = [
      ...invoices.filter((record) => record.clientId === input.clientId && inRange(record.createdAt)).map((invoice) => ({
        id: invoice.id,
        occurredAt: stableTimestamp(invoice.createdAt, invoice.sentAt, invoice.updatedAt),
        kind: "invoice" as const,
        label: invoice.number ?? invoice.title,
        detail: invoice.title,
        debit: invoice.totals.total,
        credit: 0
      })),
      ...payments.filter((record) => record.clientId === input.clientId && inRange(record.createdAt)).map((payment) => ({
        id: payment.id,
        occurredAt: payment.createdAt,
        kind: "payment" as const,
        label: `Payment ${payment.id}`,
        detail: payment.tipAmount ? `Tip ${payment.tipAmount.toFixed(2)} kept separate` : undefined,
        debit: 0,
        credit: payment.appliedAmount
      })),
      ...credits.filter((record) => record.clientId === input.clientId && inRange(record.createdAt)).map((credit) => ({
        id: credit.id,
        occurredAt: credit.createdAt,
        kind: "credit" as const,
        label: `Credit ${credit.id}`,
        detail: credit.source.replace(/_/g, " "),
        debit: 0,
        credit: credit.amount
      })),
      ...refunds.filter((record) => record.clientId === input.clientId && inRange(record.createdAt)).map((refund) => ({
        id: refund.id,
        occurredAt: refund.createdAt,
        kind: "refund" as const,
        label: `Refund ${refund.id}`,
        detail: refund.reason,
        debit: refund.amount,
        credit: 0
      }))
    ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
    let runningBalance = 0;
    const lines = rows.map((row) => {
      runningBalance = Number((runningBalance + row.debit - row.credit).toFixed(2));
      return {
        ...row,
        runningBalance
      };
    });
    const branding = await this.resolveBranding(input.tenantId);
    return {
      tenantName: branding.displayName,
      clientName: client.name,
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
      lines,
      runningBalance
    };
  }

  async renderStatementPdf(input: { tenantId: string; clientId: string; from?: string | undefined; to?: string | undefined }): Promise<Buffer> {
    return renderClientStatementPdf(await this.generateStatementSnapshot(input));
  }

  async sendStatement(input: { tenantId: string; clientId: string; from?: string | undefined; to?: string | undefined; target?: string | undefined; actorId: string }): Promise<{ url: string; target: string }> {
    const [snapshot, settings, clients] = await Promise.all([
      this.generateStatementSnapshot(input),
      this.deps.crmRepository.getCrmSettings(input.tenantId),
      this.deps.crmRepository.listClients(input.tenantId)
    ]);
    const client = clients.find((record) => record.id === input.clientId);
    if (!client) {
      throw new RailError(`Client ${input.clientId} was not found.`, { provider: "native", op: "sendStatement", status: 404 });
    }
    const target = input.target?.trim() || client.emails[0] || client.phones[0];
    if (!target) {
      throw new RailError("A client email or phone number is required before a statement can be sent.", { provider: "native", op: "sendStatement", status: 400 });
    }
    const statementUrl = absoluteUrl(this.deps.publicBaseUrl, `/nexportal/statements/${encodeURIComponent(client.id)}.pdf?tenantId=${encodeURIComponent(input.tenantId)}${input.from ? `&from=${encodeURIComponent(input.from)}` : ""}${input.to ? `&to=${encodeURIComponent(input.to)}` : ""}`);
    const variables = statementTemplateVariables({
      tenantId: input.tenantId,
      client,
      statementLink: statementUrl,
      from: input.from,
      to: input.to,
      runningBalance: snapshot.runningBalance
    });
    if (target.includes("@") && this.deps.commsRail?.sendAdapter) {
      const template = resolveTemplateMessage({
        settings,
        category: "statement_send",
        channel: "email",
        fallbackSubject: "Your account statement",
        fallbackBodyText: `Open your client statement here:\n\n${statementUrl}`,
        variables
      });
      if (template.enabled) {
        await this.deps.commsRail.sendAdapter.sendEmail({
          tenantId: input.tenantId,
          mailbox: this.deps.commsRail.sendAdapter.mailbox,
          to: [target],
          subject: template.subject,
          bodyText: template.bodyText,
          attachments: [{
            filename: `statement-${client.id}.pdf`,
            mime: "application/pdf",
            contentBase64: (await this.renderStatementPdf(input)).toString("base64")
          }]
        });
      }
    } else if (!target.includes("@") && this.deps.commsRail?.sendSms) {
      const template = resolveTemplateMessage({
        settings,
        category: "statement_send",
        channel: "sms",
        fallbackSubject: "Statement ready",
        fallbackBodyText: `Your statement is ready: ${statementUrl}`,
        variables
      });
      if (template.enabled) {
        await this.deps.commsRail.sendSms({
          tenantId: input.tenantId,
          to: target,
          body: template.bodyText
        });
      }
    }
    await this.deps.eventBus?.emit({
      tenantId: input.tenantId,
      type: "statement.sent",
      payload: {
        clientId: input.clientId,
        actorId: input.actorId,
        target,
        from: input.from ?? null,
        to: input.to ?? null
      }
    });
    return { url: statementUrl, target };
  }

  async getPortalActivity(input: { tenantId: string; clientId: string }): Promise<PortalActivityEntry[]> {
    const events = await this.deps.eventBus?.listEvents({ tenantId: input.tenantId, limit: 250 }) ?? [];
    return events
      .filter((event) => {
        const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
        return payload.clientId === input.clientId;
      })
      .map((event) => ({
        id: event.id,
        occurredAt: event.ts,
        title: portalEntryTitle(event),
        detail: portalEntryDetail(event),
        objectType: eventObjectType(event),
        ...(eventObjectId(event) ? { objectId: eventObjectId(event) } : {})
      }))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }
}
