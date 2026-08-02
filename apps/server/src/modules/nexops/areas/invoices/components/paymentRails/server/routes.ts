import type { Request, Response } from "express";
import type { CrmRouteContext } from "../../../../../runtime/routeRuntime.js";
import { invoiceCheckoutBodySchema, recordInvoicePaymentBodySchema, refundPaymentBodySchema } from "./routeSchemas.js";

export function registerPaymentRailRoutes(context: CrmRouteContext): void {
  const {
    RailError,
    actorIdForAccess,
    app,
    capturePaypalCheckoutOrder,
    createInvoiceCheckout,
    defaultTenantId,
    deps,
    env,
    getInvoiceAndClient,
    hashPortalToken,
    ledger,
    portalHub,
    portalPathWithTenant,
    requireBillingAccess,
    requirePortalSession,
    sendRouteError,
    verifyStripeWebhookEvent
  } = context;

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
      const cancelPath = portalPathWithTenant(portalAccess.tenantId, `/nexportal/invoices/${encodeURIComponent(invoice.id)}`, new URLSearchParams({
        payment: "cancelled"
      }));
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
}
