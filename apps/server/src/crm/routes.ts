import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  InMemoryEventBus,
  RailError,
  type ApprovalQueueService,
  type Client,
  type EventBus,
  type Invoice,
  type Quote
} from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter, type NativeCrmRepository } from "@nexteam/providers";
import { getAdminDb } from "../firebase.js";
import { buildQuoteDraft, draftQuoteInputSchema } from "./quoteBuilder.js";
import { FirestoreNativeCrmRepository } from "./nativeRepository.js";
import { renderInvoicePdf, renderQuotePdf, renderQuotePortalHtml } from "./quotePdf.js";
import { createStripeCheckoutSession, verifyStripeWebhookEvent } from "./stripe.js";

const createClientBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  name: z.string().min(1),
  company: z.string().min(1).optional(),
  emails: z.array(z.string()).default([]),
  phones: z.array(z.string()).default([]),
  consent: z.object({ email: z.boolean(), sms: z.boolean() }).default({ email: false, sms: false })
});

const signQuoteBodySchema = z.object({
  tenantId: z.string().min(1),
  token: z.string().min(16),
  typedName: z.string().min(1)
});

const createInvoiceFromQuoteBodySchema = z.object({
  tenantId: z.string().min(1).optional()
});

export interface CrmRouteDeps {
  approvalQueue: ApprovalQueueService;
  eventBus?: EventBus | undefined;
  memoryRepository?: NativeCrmRepository | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return env.TENANT_ID || "aquatrace";
}

function createPortalToken(): string {
  return randomBytes(24).toString("hex");
}

function quotePreviewBody(quote: Quote): string {
  const lines = quote.lineItems.map((item) => `${item.code} ${item.name} x${item.quantity}: $${item.total.toFixed(2)}`);
  return [...lines, `Total: $${quote.totals.total.toFixed(2)}`].join("\n");
}

function invoiceFromQuote(quote: Quote): Invoice {
  const base = {
    id: `invoice_${randomUUID()}`,
    tenantId: quote.tenantId,
    clientId: quote.clientId,
    status: "sent" as const,
    title: `Invoice - ${quote.title}`,
    lineItems: quote.lineItems,
    totals: quote.totals,
    quoteId: quote.id
  };
  return quote.jobId ? { ...base, jobId: quote.jobId } : base;
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown CRM route error";
  res.status(status).json({ ok: false, error: message });
}

export function registerCrmRoutes(app: Express, deps: CrmRouteDeps): void {
  const env = deps.env ?? process.env;
  const fallbackRepository = deps.memoryRepository ?? new MemoryNativeCrmRepository();
  const eventBus = deps.eventBus ?? new InMemoryEventBus();

  function providerForTenant(tenantId: string): NativeAdapter {
    const db = getAdminDb(env);
    return new NativeAdapter(db ? new FirestoreNativeCrmRepository(db) : fallbackRepository, tenantId);
  }

  async function getQuoteAndClient(tenantId: string, quoteId: string): Promise<{ provider: NativeAdapter; quote: Quote; client?: Client }> {
    const provider = providerForTenant(tenantId);
    const quotes = await provider.getQuotes();
    const quote = quotes.find((candidate) => candidate.id === quoteId);
    if (!quote) {
      throw new RailError(`Native quote ${quoteId} was not found.`, { provider: "native", op: "getQuote", status: 404 });
    }
    const clients = await provider.getClients("");
    const client = clients.find((candidate) => candidate.id === quote.clientId);
    return client ? { provider, quote, client } : { provider, quote };
  }

  async function getInvoiceAndClient(tenantId: string, invoiceId: string): Promise<{ provider: NativeAdapter; invoice: Invoice; client?: Client }> {
    const provider = providerForTenant(tenantId);
    const invoices = await provider.getInvoices();
    const invoice = invoices.find((candidate) => candidate.id === invoiceId);
    if (!invoice) {
      throw new RailError(`Native invoice ${invoiceId} was not found.`, { provider: "native", op: "getInvoice", status: 404 });
    }
    const clients = await provider.getClients("");
    const client = clients.find((candidate) => candidate.id === invoice.clientId);
    return client ? { provider, invoice, client } : { provider, invoice };
  }

  app.post("/api/crm/clients", async (req: Request, res: Response) => {
    try {
      const input = createClientBodySchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const provider = providerForTenant(tenantId);
      const client = await provider.createClient({
        tenantId,
        name: input.name,
        company: input.company,
        emails: input.emails,
        phones: input.phones,
        consent: input.consent
      });
      res.status(201).json({ ok: true, client });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/crm/quotes/draft", async (req: Request, res: Response) => {
    try {
      const input = draftQuoteInputSchema.parse(req.body);
      const provider = providerForTenant(input.tenantId);
      const quote = await provider.draftQuote(buildQuoteDraft(input));
      const approval = await deps.approvalQueue.create({
        tenantId: quote.tenantId,
        kind: "quote",
        preview: { title: quote.title, body: quotePreviewBody(quote) },
        execute: { service: "crm", op: "sendQuote", args: { quoteId: quote.id, tenantId: quote.tenantId } },
        createdBy: "nexi"
      });
      const portalToken = createPortalToken();
      const updatedQuote = await provider.updateQuote(quote.id, {
        approvalId: approval.id,
        portalTokenHash: hashPortalToken(portalToken),
        pdfRef: `native://quotes/${quote.tenantId}/${quote.id}.pdf`
      });
      res.status(201).json({
        ok: true,
        quote: updatedQuote,
        approval,
        portalUrl: `/portal/quotes/${encodeURIComponent(updatedQuote.id)}?tenantId=${encodeURIComponent(updatedQuote.tenantId)}&token=${encodeURIComponent(portalToken)}`
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
      const { provider, quote } = await getQuoteAndClient(tenantId, quoteId);
      if (quote.status !== "signed") {
        throw new RailError("Quote must be signed before an invoice is created.", { provider: "native", op: "createInvoiceFromQuote", status: 409 });
      }
      const existing = (await provider.getInvoices()).find((invoice) => invoice.quoteId === quote.id);
      if (existing) {
        res.json({ ok: true, invoice: existing, reused: true });
        return;
      }
      const invoice = await provider.createInvoice(invoiceFromQuote(quote));
      res.status(201).json({ ok: true, invoice });
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

  app.get("/api/crm/invoices/:id/pdf", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "native", op: "renderInvoicePdf", status: 400 });
      }
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
        throw new RailError("Invoice id is required.", { provider: "stripe", op: "createCheckoutSession", status: 400 });
      }
      const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      const { provider, invoice } = await getInvoiceAndClient(tenantId, invoiceId);
      if (invoice.status === "paid" || invoice.status === "void") {
        throw new RailError("Only open invoices can create Stripe checkout sessions.", { provider: "stripe", op: "createCheckoutSession", status: 409 });
      }
      const session = await createStripeCheckoutSession(env, invoice, req);
      const externalIds = { ...(invoice.externalIds ?? {}), stripe: session.id };
      const updatedInvoice = await provider.updateInvoice(invoice.id, { externalIds });
      res.status(201).json({ ok: true, invoice: updatedInvoice, checkout: { sessionId: session.id, url: session.url } });
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
      const sessionId = typeof session.id === "string" ? session.id : "";
      const paymentStatus = typeof session.payment_status === "string" ? session.payment_status : "";
      if (!invoiceId || !tenantId || paymentStatus !== "paid") {
        throw new RailError("Stripe checkout session is missing paid invoice metadata.", { provider: "stripe", op: "webhook", status: 400 });
      }
      const { provider, invoice } = await getInvoiceAndClient(tenantId, invoiceId);
      const paidAt = new Date().toISOString();
      const paidExternalIds = sessionId ? { ...(invoice.externalIds ?? {}), stripe: sessionId } : invoice.externalIds;
      const paidInvoice = await provider.updateInvoice(invoice.id, {
        status: "paid",
        paidAt,
        ...(paidExternalIds ? { externalIds: paidExternalIds } : {})
      });
      if (paidInvoice.jobId) {
        await provider.updateJobStatus(paidInvoice.jobId, "paid");
      }
      await eventBus.emit({
        tenantId: paidInvoice.tenantId,
        type: "invoice.paid",
        payload: { invoiceId: paidInvoice.id, clientId: paidInvoice.clientId, quoteId: paidInvoice.quoteId, stripeSessionId: sessionId, paidAt }
      });
      res.json({ ok: true, invoice: paidInvoice, eventType: "invoice.paid" });
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
      if (!quote.portalTokenHash || quote.portalTokenHash !== hashPortalToken(token)) {
        throw new RailError("Quote portal token is invalid.", { provider: "native", op: "quotePortal", status: 403 });
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderQuotePortalHtml(quote, token, client));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/portal/quotes/:id/sign", async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      if (!quoteId) {
        throw new RailError("Quote id is required.", { provider: "native", op: "signQuote", status: 400 });
      }
      const input = signQuoteBodySchema.parse(req.body);
      const { provider, quote } = await getQuoteAndClient(input.tenantId, quoteId);
      if (!quote.portalTokenHash || quote.portalTokenHash !== hashPortalToken(input.token)) {
        throw new RailError("Quote portal token is invalid.", { provider: "native", op: "signQuote", status: 403 });
      }
      const signedAt = new Date().toISOString();
      const signed = await provider.updateQuote(quote.id, {
        status: "signed",
        signedBy: input.typedName,
        signedAt,
        signatureIp: req.ip || req.socket.remoteAddress || "unknown"
      });
      await eventBus.emit({
        tenantId: signed.tenantId,
        type: "quote.signed",
        payload: { quoteId: signed.id, clientId: signed.clientId, signedAt, signedBy: input.typedName }
      });
      res.json({ ok: true, quote: signed });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
