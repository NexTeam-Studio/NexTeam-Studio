import { createHmac, timingSafeEqual } from "node:crypto";
import { RailError, type Invoice } from "@nexteam/core";

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  payment_status?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

interface CheckoutRequestLike {
  protocol: string;
  get(name: string): string | undefined;
  headers: { [key: string]: string | string[] | undefined };
}

function requireStripeTestKey(env: NodeJS.ProcessEnv): string {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new RailError("STRIPE_SECRET_KEY is not configured in this runtime.", { provider: "stripe", op: "requireTestKey", status: 503 });
  }
  if (key.startsWith("sk_live_")) {
    throw new RailError("Live-mode Stripe keys are not allowed in this build lane.", { provider: "stripe", op: "requireTestKey", status: 403 });
  }
  if (!key.startsWith("sk_test_")) {
    throw new RailError("Stripe key must be a test-mode secret key.", { provider: "stripe", op: "requireTestKey", status: 403 });
  }
  return key;
}

async function stripeFormRequest<T>(env: NodeJS.ProcessEnv, path: string, body: URLSearchParams): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireStripeTestKey(env)}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const data = await response.json() as { error?: { message?: string } };
  if (!response.ok) {
    throw new RailError(data.error?.message ?? "Stripe API request failed.", { provider: "stripe", op: path, status: response.status });
  }
  return data as T;
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

export async function createStripeCheckoutSession(
  env: NodeJS.ProcessEnv,
  invoice: Invoice,
  req: CheckoutRequestLike
): Promise<StripeCheckoutSession> {
  const amountCents = Math.round(invoice.totals.total * 100);
  if (amountCents <= 0) {
    throw new RailError("Invoice total must be greater than zero for Stripe checkout.", { provider: "stripe", op: "createCheckoutSession", status: 400 });
  }
  const origin = originFromRequest(req, env);
  const body = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    success_url: `${origin}/portal/invoices/${encodeURIComponent(invoice.id)}/paid?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/portal/invoices/${encodeURIComponent(invoice.id)}?tenantId=${encodeURIComponent(invoice.tenantId)}`,
    client_reference_id: invoice.id,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": invoice.title,
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][quantity]": "1",
    "metadata[invoiceId]": invoice.id,
    "metadata[tenantId]": invoice.tenantId
  });
  if (invoice.quoteId) {
    body.set("metadata[quoteId]", invoice.quoteId);
  }
  return stripeFormRequest<StripeCheckoutSession>(env, "/checkout/sessions", body);
}

function parseSignatureHeader(signatureHeader: string): { timestamp: string; signatures: string[] } {
  const parts = signatureHeader.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) ?? "";
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  return { timestamp, signatures };
}

export function verifyStripeWebhookEvent(env: NodeJS.ProcessEnv, rawBody: Buffer, signatureHeader: string): StripeWebhookEvent {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new RailError("STRIPE_WEBHOOK_SECRET is not configured in this runtime.", { provider: "stripe", op: "verifyWebhook", status: 503 });
  }
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) {
    throw new RailError("Stripe webhook signature header is malformed.", { provider: "stripe", op: "verifyWebhook", status: 400 });
  }
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new RailError("Stripe webhook signature timestamp is outside tolerance.", { provider: "stripe", op: "verifyWebhook", status: 400 });
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  const matched = signatures.some((signature) => {
    const actual = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  });
  if (!matched) {
    throw new RailError("Stripe webhook signature verification failed.", { provider: "stripe", op: "verifyWebhook", status: 400 });
  }
  return JSON.parse(rawBody.toString("utf8")) as StripeWebhookEvent;
}
