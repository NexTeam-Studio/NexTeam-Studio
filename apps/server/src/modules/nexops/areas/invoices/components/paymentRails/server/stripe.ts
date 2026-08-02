import { createHmac, timingSafeEqual } from "node:crypto";
import { RailError, type Invoice } from "@nexteam/core";

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  payment_status?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

/**
 * Public Payments contract for Platform/Tenants.  The platform creates and
 * persists the tenant-to-Stripe account mapping; Payment Rails owns only the
 * Stripe Connect API calls.
 */
export interface StripeConnectExpressAccount {
  id: string;
  type: "express" | string;
  email?: string | undefined;
  charges_enabled?: boolean | undefined;
  payouts_enabled?: boolean | undefined;
  details_submitted?: boolean | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface StripeConnectOnboardingLink {
  url: string;
  expires_at?: number | undefined;
  object?: string | undefined;
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

interface StripeRequestOptions {
  stripeAccount?: string | undefined;
}

export interface StripeTerminalConnectionToken {
  secret: string;
}

export interface StripeTerminalPaymentIntent {
  id: string;
  amount: number;
  currency: string;
  client_secret?: string | undefined;
  status?: string | undefined;
  amount_received?: number | undefined;
  metadata?: Record<string, string> | undefined;
  latest_charge?: {
    id: string;
    payment_method_details?: {
      type?: string | undefined;
      card_present?: {
        brand?: string | undefined;
        last4?: string | undefined;
        cardholder_name?: string | undefined;
      } | undefined;
    } | undefined;
  } | undefined;
}

function tenantScopedEnvValue(env: NodeJS.ProcessEnv, prefix: string, tenantId: string): string | undefined {
  const normalized = tenantId.replace(/[^a-z0-9]/gi, "_").toUpperCase();
  const exact = env[`${prefix}_${normalized}`]?.trim();
  const fallback = env[prefix]?.trim();
  return exact || fallback || undefined;
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

function stripeConnectedAccountForTenant(env: NodeJS.ProcessEnv, tenantId: string): string | undefined {
  return tenantScopedEnvValue(env, "STRIPE_CONNECTED_ACCOUNT", tenantId);
}

function requiredHttpsOrLocalUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RailError(`${name} must be an absolute URL.`, { provider: "stripe", op: "connectOnboarding", status: 400 });
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new RailError(`${name} must use HTTPS outside local development.`, { provider: "stripe", op: "connectOnboarding", status: 400 });
  }
  return url.toString();
}

async function stripeFormRequest<T>(env: NodeJS.ProcessEnv, path: string, body: URLSearchParams, options: StripeRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${requireStripeTestKey(env)}`,
    "content-type": "application/x-www-form-urlencoded"
  };
  if (options.stripeAccount?.trim()) {
    headers["Stripe-Account"] = options.stripeAccount.trim();
  }
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers,
    body
  });
  const data = await response.json() as { error?: { message?: string } };
  if (!response.ok) {
    throw new RailError(data.error?.message ?? "Stripe API request failed.", { provider: "stripe", op: path, status: response.status });
  }
  return data as T;
}

async function stripeJsonRequest<T>(
  env: NodeJS.ProcessEnv,
  path: string,
  options: StripeRequestOptions & {
    method?: "GET" | "POST";
    body?: URLSearchParams | undefined;
    query?: URLSearchParams | undefined;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${requireStripeTestKey(env)}`
  };
  if (options.body) {
    headers["content-type"] = "application/x-www-form-urlencoded";
  }
  if (options.stripeAccount?.trim()) {
    headers["Stripe-Account"] = options.stripeAccount.trim();
  }
  const query = options.query?.toString();
  const response = await fetch(`https://api.stripe.com/v1${path}${query ? `?${query}` : ""}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
    ...(options.body ? { body: options.body } : {})
  });
  const data = await response.json() as { error?: { message?: string } };
  if (!response.ok) {
    throw new RailError(data.error?.message ?? "Stripe API request failed.", { provider: "stripe", op: path, status: response.status });
  }
  return data as T;
}

export async function createStripeConnectExpressAccount(
  env: NodeJS.ProcessEnv,
  input: { tenantId: string; email: string; country?: string | undefined }
): Promise<StripeConnectExpressAccount> {
  const tenantId = input.tenantId.trim();
  const email = input.email.trim();
  if (!tenantId || !email) {
    throw new RailError("A tenant id and tenant email are required to create a Stripe Connect account.", {
      provider: "stripe",
      op: "createConnectExpressAccount",
      status: 400
    });
  }
  return stripeFormRequest<StripeConnectExpressAccount>(env, "/accounts", new URLSearchParams({
    type: "express",
    country: (input.country?.trim() || "US").toUpperCase(),
    email,
    "capabilities[card_payments][requested]": "true",
    "capabilities[transfers][requested]": "true",
    "metadata[tenantId]": tenantId,
    "metadata[platformFeePolicy]": "zero_application_fee_tenant_pays_stripe_processing"
  }));
}

export async function createStripeConnectOnboardingLink(
  env: NodeJS.ProcessEnv,
  input: { accountId: string; refreshUrl: string; returnUrl: string }
): Promise<StripeConnectOnboardingLink> {
  const accountId = input.accountId.trim();
  if (!accountId) {
    throw new RailError("A Stripe Connect account id is required to create an onboarding link.", {
      provider: "stripe",
      op: "createConnectOnboardingLink",
      status: 400
    });
  }
  return stripeFormRequest<StripeConnectOnboardingLink>(env, "/account_links", new URLSearchParams({
    account: accountId,
    type: "account_onboarding",
    refresh_url: requiredHttpsOrLocalUrl(input.refreshUrl, "Stripe Connect refresh URL"),
    return_url: requiredHttpsOrLocalUrl(input.returnUrl, "Stripe Connect return URL")
  }));
}

/**
 * Read-only Connect account lookup for Platform/Tenants.  A return from
 * Stripe-hosted onboarding is not proof that the account can take charges or
 * receive payouts, so the platform must read the account's actual state.
 */
export async function retrieveStripeConnectAccount(
  env: NodeJS.ProcessEnv,
  input: { accountId: string }
): Promise<StripeConnectExpressAccount> {
  const accountId = input.accountId.trim();
  if (!accountId) {
    throw new RailError("A Stripe Connect account id is required to retrieve account status.", {
      provider: "stripe",
      op: "retrieveConnectAccount",
      status: 400
    });
  }
  return stripeJsonRequest<StripeConnectExpressAccount>(env, `/accounts/${encodeURIComponent(accountId)}`);
}

export function stripeTerminalLocationForTenant(env: NodeJS.ProcessEnv, tenantId: string): string | undefined {
  return tenantScopedEnvValue(env, "STRIPE_TERMINAL_LOCATION", tenantId);
}

export function stripeTerminalMerchantDisplayNameForTenant(
  env: NodeJS.ProcessEnv,
  tenantId: string,
  fallbackName: string
): string {
  return tenantScopedEnvValue(env, "STRIPE_TERMINAL_MERCHANT_NAME", tenantId) || fallbackName;
}

export function stripeTerminalSimulatedForTenant(env: NodeJS.ProcessEnv, tenantId: string): boolean {
  const raw = tenantScopedEnvValue(env, "STRIPE_TERMINAL_SIMULATED", tenantId);
  return raw === "1" || raw?.toLowerCase() === "true";
}

export async function createStripeTerminalConnectionToken(
  env: NodeJS.ProcessEnv,
  tenantId: string
): Promise<StripeTerminalConnectionToken> {
  return stripeFormRequest<StripeTerminalConnectionToken>(env, "/terminal/connection_tokens", new URLSearchParams(), {
    stripeAccount: stripeConnectedAccountForTenant(env, tenantId)
  });
}

export async function createStripeTerminalPaymentIntent(
  env: NodeJS.ProcessEnv,
  input: {
    tenantId: string;
    invoiceId: string;
    quoteId?: string | undefined;
    title: string;
    amount: number;
    tipAmount?: number | undefined;
  }
): Promise<StripeTerminalPaymentIntent> {
  const amountCents = Math.round(input.amount * 100);
  if (amountCents <= 0) {
    throw new RailError("Invoice balance must be greater than zero for Tap to Pay.", {
      provider: "stripe",
      op: "createTerminalPaymentIntent",
      status: 400
    });
  }
  const tipAmount = Math.max(input.tipAmount ?? 0, 0);
  const body = new URLSearchParams({
    amount: String(amountCents),
    currency: "usd",
    capture_method: "automatic",
    "payment_method_types[0]": "card_present",
    description: `Tap to Pay - ${input.title}`,
    "metadata[source]": "tap_to_pay",
    "metadata[tenantId]": input.tenantId,
    "metadata[invoiceId]": input.invoiceId,
    "metadata[tipAmount]": tipAmount.toFixed(2)
  });
  if (input.quoteId) {
    body.set("metadata[quoteId]", input.quoteId);
  }
  return stripeJsonRequest<StripeTerminalPaymentIntent>(env, "/payment_intents", {
    method: "POST",
    body,
    stripeAccount: stripeConnectedAccountForTenant(env, input.tenantId)
  });
}

export async function retrieveStripeTerminalPaymentIntent(
  env: NodeJS.ProcessEnv,
  tenantId: string,
  paymentIntentId: string
): Promise<StripeTerminalPaymentIntent> {
  return stripeJsonRequest<StripeTerminalPaymentIntent>(env, `/payment_intents/${encodeURIComponent(paymentIntentId)}`, {
    method: "GET",
    query: new URLSearchParams({ "expand[]": "latest_charge" }),
    stripeAccount: stripeConnectedAccountForTenant(env, tenantId)
  });
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
  req: CheckoutRequestLike,
  options: {
    portalToken?: string | undefined;
    tipAmount?: number | undefined;
    amountOverride?: number | undefined;
    successPath?: string | undefined;
    cancelPath?: string | undefined;
  } = {}
): Promise<StripeCheckoutSession> {
  const tipAmount = Math.max(options.tipAmount ?? 0, 0);
  const checkoutAmount = options.amountOverride ?? ((invoice.ledger?.balanceDue ?? invoice.totals.total) + tipAmount);
  const amountCents = Math.round(checkoutAmount * 100);
  if (amountCents <= 0) {
    throw new RailError("Invoice total must be greater than zero for Stripe checkout.", { provider: "stripe", op: "createCheckoutSession", status: 400 });
  }
  const origin = originFromRequest(req, env);
  const portalTokenQuery = options.portalToken
    ? `&portalToken=${encodeURIComponent(options.portalToken)}`
    : "";
  const successUrl = options.successPath
    ? `${origin}${options.successPath.startsWith("/") ? options.successPath : `/${options.successPath}`}`
    : `${origin}/portal/invoices/${encodeURIComponent(invoice.id)}/paid?tenantId=${encodeURIComponent(invoice.tenantId)}&session_id={CHECKOUT_SESSION_ID}${portalTokenQuery}`;
  const cancelUrl = options.cancelPath
    ? `${origin}${options.cancelPath.startsWith("/") ? options.cancelPath : `/${options.cancelPath}`}`
    : `${origin}/portal/invoices/${encodeURIComponent(invoice.id)}?tenantId=${encodeURIComponent(invoice.tenantId)}${options.portalToken ? `&token=${encodeURIComponent(options.portalToken)}` : ""}`;
  const body = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: invoice.id,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": invoice.title,
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][quantity]": "1",
    "metadata[invoiceId]": invoice.id,
    "metadata[tenantId]": invoice.tenantId,
    "metadata[tipAmount]": tipAmount.toFixed(2)
  });
  if (invoice.quoteId) {
    body.set("metadata[quoteId]", invoice.quoteId);
  }
  return stripeFormRequest<StripeCheckoutSession>(env, "/checkout/sessions", body, {
    stripeAccount: stripeConnectedAccountForTenant(env, invoice.tenantId)
  });
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
