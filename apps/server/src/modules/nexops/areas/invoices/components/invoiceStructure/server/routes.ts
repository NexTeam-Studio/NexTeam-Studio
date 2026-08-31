import type { Request, Response } from "express";
import type { CrmRouteContext } from "../../../../../runtime/routeRuntime.js";
import { clientStatementQuerySchema, composeInvoiceFromJobsBodySchema, invoiceLedgerActionBodySchema, sendInvoiceBodySchema, sendStatementBodySchema, updateInvoiceDraftBodySchema, updateReceiptReviewBodySchema } from "./routeSchemas.js";

export function registerInvoiceStructureRoutes(context: CrmRouteContext): void {
  const {
    RailError,
    actorIdForAccess,
    app,
    buildPortalSnapshotOrRedirect,
    defaultTenantId,
    deps,
    env,
    getInvoiceAndClient,
    hashPortalToken,
    jobLifecycle,
    ledger,
    portalHub,
    portalPathWithTenant,
    publicOrigin,
    renderInvoicePdf,
    renderInvoicePortalHtml,
    renderPortalInvoicesHtml,
    repositoryForTenant,
    requireBillingAccess,
    sendRouteError,
  } = context;

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

  app.get("/api/crm/invoices/:id/pdf", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const invoiceId = req.params.id;
      if (!invoiceId) {
        throw new RailError("Invoice id is required.", { provider: "native", op: "renderInvoicePdf", status: 400 });
      }
      await requireBillingAccess(req, tenantId, "renderInvoicePdf");
      const { invoice, client } = await getInvoiceAndClient(tenantId, invoiceId);
      const settings = await repositoryForTenant().getCrmSettings(tenantId);
      res.setHeader("content-type", "application/pdf");
      res.send(renderInvoicePdf(invoice, client, settings.documentDesign));
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
      // Catalog selections are detached document snapshots. No invoice edit
      // should consult the mutable Products & Services catalog.
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
        ...(input.deliveryDefaults !== undefined ? { deliveryDefaults: input.deliveryDefaults } : {}),
        ...(input.customFields !== undefined ? { customFields: input.customFields } : {})
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
        paymentCancelled: req.query.payment === "cancelled",
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
