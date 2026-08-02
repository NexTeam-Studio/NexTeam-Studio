import type { Request } from "express";
import { RailError, type Invoice } from "@nexteam/core";
import type { NativeAdapter, NativeCrmRepository } from "@nexteam/providers";
import type { z } from "zod";
import { reserveDocumentNumber } from "../../../../../../../shared/numbering/numberingService.js";
import { buildQuickPaymentRequestInvoice } from "../../invoiceStructure/domain/invoiceFoundation.js";
import type { CrmRouteDeps } from "../../../../../shared/runtime/routeComposition.js";
import { createPaypalCheckoutOrder } from "./paypal.js";
import { createStripeCheckoutSession } from "./stripe.js";
import type { quickPaymentRequestBodySchema } from "./routeSchemas.js";

export function createPaymentRouteSupport(input: {
  env: NodeJS.ProcessEnv;
  providerForTenant: (tenantId: string) => NativeAdapter;
  repositoryForTenant: () => NativeCrmRepository;
  ledger: () => NonNullable<CrmRouteDeps["ledgerService"]>;
  hasLedgerService: boolean;
  stripeConnectedAccountForTenant: (tenantId: string) => Promise<string | undefined>;
}) {
  async function createQuickPaymentRequestRecord(request: {
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
  }) {
    const repository = input.repositoryForTenant();
    const provider = input.providerForTenant(request.tenantId);
    const settings = await repository.getCrmSettings(request.tenantId);
    const created = await provider.createInvoice(buildQuickPaymentRequestInvoice({
      tenantId: request.tenantId,
      clientId: request.clientId,
      settings,
      number: await reserveDocumentNumber(repository, request.tenantId, "invoice"),
      title: request.title,
      amount: request.amount,
      ...(request.memo?.trim() ? { memo: request.memo.trim() } : {}),
      ...(request.jobId ? { jobId: request.jobId } : {}),
      ...(request.requestId ? { requestId: request.requestId } : {})
    }));
    const synced = await input.ledger().syncInvoiceAfterCreate(created);
    if (!request.delivery || request.delivery.mode === "draft") return { invoice: synced };
    const sent = await input.ledger().sendInvoice({
      tenantId: request.tenantId,
      invoiceId: synced.id,
      mode: request.delivery.mode,
      actorId: request.actorId,
      publicBaseUrl: request.publicBaseUrl,
      ...(request.delivery.target?.trim() ? { target: request.delivery.target.trim() } : {}),
      ...(request.delivery.subject?.trim() ? { subject: request.delivery.subject.trim() } : {}),
      ...(request.delivery.bodyText?.trim() ? { bodyText: request.delivery.bodyText.trim() } : {})
    });
    return {
      invoice: sent.invoice,
      portalUrl: sent.portalUrl,
      delivery: { mode: sent.delivery.mode, ...(sent.delivery.target ? { target: sent.delivery.target } : {}) },
      preview: { title: sent.delivery.subject ?? sent.invoice.title, body: request.delivery.bodyText?.trim() ?? "" }
    };
  }

  async function createInvoiceCheckout(request: {
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
  }) {
    const provider = input.providerForTenant(request.tenantId);
    if (["paid", "void", "bad_debt"].includes(request.invoice.status)) {
      throw new RailError("Only open invoices can create checkout sessions.", { provider: request.provider, op: "createInvoiceCheckout", status: 409 });
    }
    const tipAmount = Number((request.tipAmount ?? 0).toFixed(2));
    if (tipAmount < 0) throw new RailError("Tip amount must be zero or greater.", { provider: request.provider, op: "createInvoiceCheckout", status: 400 });
    const totalCheckoutAmount = Number(((request.invoice.ledger?.balanceDue ?? request.invoice.totals.total) + tipAmount).toFixed(2));
    if (request.provider === "stripe") {
      const connectedAccountId = await input.stripeConnectedAccountForTenant(request.tenantId);
      if (!connectedAccountId) {
        throw new RailError("This tenant has not completed payment-account onboarding.", {
          provider: "stripe",
          op: "createInvoiceCheckout",
          status: 409
        });
      }
      const session = await createStripeCheckoutSession(input.env, request.invoice, request.req, {
        connectedAccountId,
        ...(request.portalToken ? { portalToken: request.portalToken } : {}),
        ...(request.successPath ? { successPath: request.successPath } : {}),
        ...(request.cancelPath ? { cancelPath: request.cancelPath } : {}),
        ...(tipAmount > 0 ? { tipAmount, amountOverride: totalCheckoutAmount } : {})
      });
      const updatedInvoice = await provider.updateInvoice(request.invoice.id, { externalIds: { ...(request.invoice.externalIds ?? {}), stripe: session.id } });
      if (input.hasLedgerService) {
        await input.ledger().createPendingStripeCheckout({
          tenantId: request.tenantId,
          invoiceId: updatedInvoice.id,
          checkoutSessionId: session.id,
          amount: totalCheckoutAmount,
          ...(tipAmount > 0 ? { tipAmount } : {})
        });
      }
      return { invoice: updatedInvoice, checkout: { provider: "stripe" as const, method: "card" as const, sessionId: session.id, url: session.url } };
    }
    const paypalMethod = request.method === "venmo" ? "venmo" : "paypal";
    const { order, approveUrl } = await createPaypalCheckoutOrder({
      env: input.env,
      invoice: request.invoice,
      req: request.req,
      method: paypalMethod,
      ...(request.portalToken ? { portalToken: request.portalToken } : {}),
      ...(request.paypalReturnPath ? { returnPath: request.paypalReturnPath } : {}),
      ...(request.cancelPath ? { cancelPath: request.cancelPath } : {}),
      ...(tipAmount > 0 ? { tipAmount, amountOverride: totalCheckoutAmount } : {})
    });
    return { invoice: request.invoice, checkout: { provider: "paypal" as const, method: paypalMethod, orderId: order.id, url: approveUrl } };
  }

  return { createInvoiceCheckout, createQuickPaymentRequestRecord };
}
