import { RailError, type TenantPlan } from "@nexteam/core";
import { PLATFORM_PLANS } from "./plans.js";

interface StripeResponse {
  id: string;
  status?: string | undefined;
  url?: string | null | undefined;
  customer?: string | undefined;
  current_period_end?: number | undefined;
  error?: { message?: string | undefined } | undefined;
}

export interface PlatformSubscriptionResult {
  provider: "stripe";
  customerId: string;
  subscriptionId: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  currentPeriodEnd?: string | undefined;
}

function requireStripeTestKey(env: NodeJS.ProcessEnv): string {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new RailError("STRIPE_SECRET_KEY is not configured in this runtime.", { provider: "stripe", op: "platformBilling", status: 503 });
  }
  if (key.startsWith("sk_live_")) {
    throw new RailError("Live-mode Stripe keys are not allowed for platform billing receipts.", { provider: "stripe", op: "platformBilling", status: 403 });
  }
  if (!key.startsWith("sk_test_")) {
    throw new RailError("Stripe platform billing requires a test-mode secret key.", { provider: "stripe", op: "platformBilling", status: 403 });
  }
  return key;
}

async function stripeFormRequest(env: NodeJS.ProcessEnv, path: string, body: URLSearchParams): Promise<StripeResponse> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireStripeTestKey(env)}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const data = await response.json() as StripeResponse;
  if (!response.ok) {
    throw new RailError(data.error?.message ?? "Stripe platform billing request failed.", { provider: "stripe", op: path, status: response.status });
  }
  return data;
}

function stripeStatus(status: string | undefined): PlatformSubscriptionResult["status"] {
  if (status === "active" || status === "trialing" || status === "past_due" || status === "canceled" || status === "incomplete") {
    return status;
  }
  return "active";
}

export async function createStripeTestSubscription(input: {
  env: NodeJS.ProcessEnv;
  tenantId: string;
  plan: TenantPlan;
  email?: string | undefined;
}): Promise<PlatformSubscriptionResult> {
  if (input.env.PLATFORM_FAKE_STRIPE === "true") {
    return {
      provider: "stripe",
      customerId: `cus_test_${input.tenantId}`,
      subscriptionId: `sub_test_${input.tenantId}_${input.plan}`,
      status: "active"
    };
  }
  const plan = PLATFORM_PLANS[input.plan];
  const customer = await stripeFormRequest(input.env, "/customers", new URLSearchParams({
    email: input.email ?? `billing+${input.tenantId}@nexteam.studio`,
    "metadata[tenantId]": input.tenantId,
    "metadata[plan]": input.plan
  }));
  const paymentMethodId = input.env.STRIPE_TEST_PAYMENT_METHOD?.trim() || "pm_card_visa";
  await stripeFormRequest(input.env, `/payment_methods/${encodeURIComponent(paymentMethodId)}/attach`, new URLSearchParams({
    customer: customer.id
  }));
  await stripeFormRequest(input.env, `/customers/${encodeURIComponent(customer.id)}`, new URLSearchParams({
    "invoice_settings[default_payment_method]": paymentMethodId
  }));
  const product = await stripeFormRequest(input.env, "/products", new URLSearchParams({
    name: `NexTeam ${plan.name}`,
    "metadata[tenantId]": input.tenantId,
    "metadata[plan]": input.plan
  }));
  const price = await stripeFormRequest(input.env, "/prices", new URLSearchParams({
    currency: "usd",
    unit_amount: String(Math.round(plan.monthlyUsd * 100)),
    product: product.id,
    "recurring[interval]": "month",
    "metadata[tenantId]": input.tenantId,
    "metadata[plan]": input.plan
  }));
  const subscription = await stripeFormRequest(input.env, "/subscriptions", new URLSearchParams({
    customer: customer.id,
    "items[0][price]": price.id,
    default_payment_method: paymentMethodId,
    payment_behavior: "error_if_incomplete",
    "metadata[tenantId]": input.tenantId,
    "metadata[plan]": input.plan
  }));
  return {
    provider: "stripe",
    customerId: customer.id,
    subscriptionId: subscription.id,
    status: stripeStatus(subscription.status),
    currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : undefined
  };
}
