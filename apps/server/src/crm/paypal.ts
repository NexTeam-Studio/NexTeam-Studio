import { Buffer } from "node:buffer";
import { RailError, type Invoice } from "@nexteam/core";

type PaypalFundingMethod = "paypal" | "venmo";

interface CheckoutRequestLike {
  protocol: string;
  get(name: string): string | undefined;
  headers: { [key: string]: string | string[] | undefined };
}

export interface PaypalOrderLink {
  href: string;
  rel: string;
  method?: string | undefined;
}

export interface PaypalOrderResponse {
  id: string;
  status: string;
  links?: PaypalOrderLink[] | undefined;
}

function paypalEnvironment(env: NodeJS.ProcessEnv): "sandbox" | "live" {
  const configured = env.PAYPAL_ENV?.trim().toLowerCase();
  if (configured === "live") {
    throw new RailError("Live PayPal credentials are not allowed in this build lane.", { provider: "paypal", op: "requireSandbox", status: 403 });
  }
  return "sandbox";
}

function normalizedTenantKey(tenantId: string): string {
  return tenantId.replace(/[^a-z0-9]/gi, "_").toUpperCase();
}

function tenantAwareCredential(env: NodeJS.ProcessEnv, tenantId: string, key: "PAYPAL_CLIENT_ID" | "PAYPAL_CLIENT_SECRET"): string {
  const tenantKey = `${key}_${normalizedTenantKey(tenantId)}`;
  const exact = env[tenantKey]?.trim();
  const fallback = env[key]?.trim();
  const value = exact || fallback;
  if (!value) {
    throw new RailError(`${key} is not configured for ${tenantId}.`, { provider: "paypal", op: "requireCredentials", status: 503 });
  }
  return value;
}

function paypalApiBase(env: NodeJS.ProcessEnv): string {
  return paypalEnvironment(env) === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

function originFromRequest(req: CheckoutRequestLike, env: NodeJS.ProcessEnv): string {
  const configured = env.PUBLIC_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader) ? forwardedProtoHeader[0] : forwardedProtoHeader;
  const proto = forwardedProto?.split(",")[0]?.trim() || req.protocol;
  return `${proto}://${req.get("host") ?? "localhost:3000"}`;
}

async function paypalAccessToken(env: NodeJS.ProcessEnv, tenantId: string): Promise<string> {
  const clientId = tenantAwareCredential(env, tenantId, "PAYPAL_CLIENT_ID");
  const clientSecret = tenantAwareCredential(env, tenantId, "PAYPAL_CLIENT_SECRET");
  const response = await fetch(`${paypalApiBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const data = await response.json() as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !data.access_token) {
    throw new RailError(data.error_description ?? data.error ?? "Could not obtain PayPal access token.", { provider: "paypal", op: "oauth", status: response.status || 502 });
  }
  return data.access_token;
}

function payerActionHref(order: PaypalOrderResponse): string | null {
  return order.links?.find((link) => link.rel === "payer-action")?.href ?? null;
}

export async function createPaypalCheckoutOrder(input: {
  env: NodeJS.ProcessEnv;
  invoice: Invoice;
  req: CheckoutRequestLike;
  method: PaypalFundingMethod;
  portalToken?: string | undefined;
  tipAmount?: number | undefined;
  amountOverride?: number | undefined;
  returnPath?: string | undefined;
  cancelPath?: string | undefined;
}): Promise<{ order: PaypalOrderResponse; approveUrl: string | null }> {
  const accessToken = await paypalAccessToken(input.env, input.invoice.tenantId);
  const origin = originFromRequest(input.req, input.env);
  const tipAmount = Math.max(input.tipAmount ?? 0, 0);
  const amount = (input.amountOverride ?? ((input.invoice.ledger?.balanceDue ?? input.invoice.totals.total) + tipAmount)).toFixed(2);
  const portalTokenQuery = input.portalToken ? `&portalToken=${encodeURIComponent(input.portalToken)}` : "";
  const tipQuery = tipAmount > 0 ? `&tipAmount=${encodeURIComponent(tipAmount.toFixed(2))}` : "";
  const returnUrl = input.returnPath
    ? `${origin}${input.returnPath.startsWith("/") ? input.returnPath : `/${input.returnPath}`}`
    : `${origin}/portal/invoices/${encodeURIComponent(input.invoice.id)}/paypal-return?tenantId=${encodeURIComponent(input.invoice.tenantId)}&method=${encodeURIComponent(input.method)}${portalTokenQuery}${tipQuery}`;
  const cancelUrl = input.cancelPath
    ? `${origin}${input.cancelPath.startsWith("/") ? input.cancelPath : `/${input.cancelPath}`}`
    : `${origin}/portal/invoices/${encodeURIComponent(input.invoice.id)}?tenantId=${encodeURIComponent(input.invoice.tenantId)}${input.portalToken ? `&token=${encodeURIComponent(input.portalToken)}` : ""}`;
  const experienceContext = {
    return_url: returnUrl,
    cancel_url: cancelUrl,
    shipping_preference: "NO_SHIPPING",
    user_action: "PAY_NOW"
  };
  const paymentSource = input.method === "venmo"
    ? { venmo: { experience_context: experienceContext } }
    : { paypal: { experience_context: experienceContext } };
  const response = await fetch(`${paypalApiBase(input.env)}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      prefer: "return=representation"
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      payment_source: paymentSource,
      purchase_units: [{
        reference_id: input.invoice.id,
        invoice_id: input.invoice.number ?? input.invoice.id,
        custom_id: input.invoice.id,
        description: input.invoice.title,
        amount: {
          currency_code: "USD",
          value: amount
        },
        ...(tipAmount > 0
          ? {
              soft_descriptor: `TIP ${tipAmount.toFixed(2)}`
            }
          : {})
      }]
    })
  });
  const order = await response.json() as PaypalOrderResponse & { message?: string; details?: Array<{ description?: string }> };
  if (!response.ok) {
    throw new RailError(order.message ?? order.details?.[0]?.description ?? "PayPal order creation failed.", {
      provider: "paypal",
      op: "createOrder",
      status: response.status || 502
    });
  }
  return { order, approveUrl: payerActionHref(order) };
}

export async function capturePaypalCheckoutOrder(input: {
  env: NodeJS.ProcessEnv;
  tenantId: string;
  orderId: string;
}): Promise<PaypalOrderResponse> {
  const accessToken = await paypalAccessToken(input.env, input.tenantId);
  const response = await fetch(`${paypalApiBase(input.env)}/v2/checkout/orders/${encodeURIComponent(input.orderId)}/capture`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      prefer: "return=representation"
    },
    body: "{}"
  });
  const order = await response.json() as PaypalOrderResponse & { message?: string; details?: Array<{ description?: string }> };
  if (!response.ok) {
    throw new RailError(order.message ?? order.details?.[0]?.description ?? "PayPal order capture failed.", {
      provider: "paypal",
      op: "captureOrder",
      status: response.status || 502
    });
  }
  return order;
}
