import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { RailError, type Tenant } from "@nexteam/core";
import type { PlatformRepository } from "./repository.js";

export interface StripeConnectAccount {
  id: string;
  type: string;
  email?: string | undefined;
  details_submitted?: boolean | undefined;
  charges_enabled?: boolean | undefined;
  payouts_enabled?: boolean | undefined;
}

export interface StripeConnectApi {
  createExpressAccount(env: NodeJS.ProcessEnv, input: { tenantId: string; email: string; country?: string | undefined }): Promise<StripeConnectAccount>;
  createOnboardingLink(env: NodeJS.ProcessEnv, input: { accountId: string; refreshUrl: string; returnUrl: string }): Promise<{ url: string }>;
  retrieveAccount(env: NodeJS.ProcessEnv, input: { accountId: string }): Promise<StripeConnectAccount>;
}

const FLOW_TTL_MS = 30 * 60 * 1000;

function now(): string {
  return new Date().toISOString();
}

function hashFlowToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeTokenMatch(expectedHash: string, token: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashFlowToken(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function requiredTenantId(value: string | undefined): string {
  const tenantId = value?.trim() ?? "";
  if (!tenantId) {
    throw new RailError("Tenant id is required.", { provider: "stripe", op: "connectOnboarding", status: 400 });
  }
  return tenantId;
}

function publicBaseUrl(env: NodeJS.ProcessEnv): string {
  const value = (env.PUBLIC_BASE_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RailError("PUBLIC_BASE_URL must be an absolute URL.", { provider: "stripe", op: "connectOnboarding", status: 500 });
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new RailError("PUBLIC_BASE_URL must use HTTPS outside local development.", { provider: "stripe", op: "connectOnboarding", status: 500 });
  }
  return url.toString().replace(/\/$/, "");
}

function connectionFor(tenant: Tenant) {
  const connection = tenant.payments?.stripeConnect;
  if (!connection) {
    throw new RailError("This tenant does not have a Stripe Connect account yet.", { provider: "stripe", op: "connectOnboarding", status: 404 });
  }
  return connection;
}

function callbackUrl(baseUrl: string, path: "refresh" | "return", tenantId: string, flow: string): string {
  const url = new URL(`/api/stripe/connect/onboarding/${path}`, `${baseUrl}/`);
  url.searchParams.set("tenantId", tenantId);
  url.searchParams.set("flow", flow);
  return url.toString();
}

export function stripeConnectStatus(account: StripeConnectAccount): {
  onboarding: "pending" | "submitted";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
} {
  return {
    onboarding: account.details_submitted === true ? "submitted" : "pending",
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true
  };
}

export async function createOrReuseStripeConnectOnboarding(input: {
  repository: PlatformRepository;
  stripe: StripeConnectApi;
  env: NodeJS.ProcessEnv;
  tenantId: string;
  email: string;
  country?: string | undefined;
}): Promise<{ tenant: Tenant; accountId: string; onboardingUrl: string }> {
  const tenantId = requiredTenantId(input.tenantId);
  const email = input.email.trim();
  if (!email) {
    throw new RailError("A billing email is required for Stripe Connect onboarding.", { provider: "stripe", op: "connectOnboarding", status: 400 });
  }
  const tenant = await input.repository.getTenant(tenantId);
  if (!tenant) {
    throw new RailError("Tenant was not found.", { provider: "platform", op: "connectOnboarding", status: 404 });
  }
  let persisted = tenant;
  if (!tenant.payments?.stripeConnect) {
    const account = await input.stripe.createExpressAccount(input.env, {
      tenantId,
      email,
      ...(input.country?.trim() ? { country: input.country.trim() } : {})
    });
    if (!account.id.startsWith("acct_")) {
      throw new RailError("Stripe did not return a connected account id.", { provider: "stripe", op: "connectOnboarding", status: 502 });
    }
    const timestamp = now();
    persisted = await input.repository.upsertTenant({
      ...tenant,
      payments: {
        ...tenant.payments,
        stripeConnect: {
          accountId: account.id,
          onboardingEmail: email,
          country: (input.country?.trim() || "US").toUpperCase(),
          createdAt: timestamp,
          updatedAt: timestamp
        }
      }
    });
  }
  return issueStripeConnectOnboardingLink({
    repository: input.repository,
    stripe: input.stripe,
    env: input.env,
    tenant: persisted
  });
}

export async function issueStripeConnectOnboardingLink(input: {
  repository: PlatformRepository;
  stripe: StripeConnectApi;
  env: NodeJS.ProcessEnv;
  tenant: Tenant;
}): Promise<{ tenant: Tenant; accountId: string; onboardingUrl: string }> {
  const connection = connectionFor(input.tenant);
  const flow = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + FLOW_TTL_MS).toISOString();
  const tenant = await input.repository.upsertTenant({
    ...input.tenant,
    payments: {
      ...input.tenant.payments,
      stripeConnect: {
        ...connection,
        onboardingFlowTokenHash: hashFlowToken(flow),
        onboardingFlowExpiresAt: expiresAt,
        updatedAt: now()
      }
    }
  });
  const baseUrl = publicBaseUrl(input.env);
  const link = await input.stripe.createOnboardingLink(input.env, {
    accountId: connection.accountId,
    refreshUrl: callbackUrl(baseUrl, "refresh", tenant.id, flow),
    returnUrl: callbackUrl(baseUrl, "return", tenant.id, flow)
  });
  return { tenant, accountId: connection.accountId, onboardingUrl: link.url };
}

export async function authorizeStripeConnectCallback(input: {
  repository: PlatformRepository;
  tenantId: string | undefined;
  flow: string | undefined;
}): Promise<Tenant> {
  const tenantId = requiredTenantId(input.tenantId);
  const flow = input.flow?.trim() ?? "";
  const tenant = await input.repository.getTenant(tenantId);
  const connection = tenant ? connectionFor(tenant) : undefined;
  const expiresAt = connection?.onboardingFlowExpiresAt ? Date.parse(connection.onboardingFlowExpiresAt) : Number.NaN;
  if (!tenant || !flow || !connection?.onboardingFlowTokenHash || !Number.isFinite(expiresAt) || expiresAt < Date.now() || !safeTokenMatch(connection.onboardingFlowTokenHash, flow)) {
    throw new RailError("This Stripe onboarding link is invalid or has expired.", { provider: "stripe", op: "connectOnboarding", status: 403 });
  }
  return tenant;
}

export async function getStripeConnectOnboardingStatus(input: {
  stripe: StripeConnectApi;
  env: NodeJS.ProcessEnv;
  tenant: Tenant;
}): Promise<ReturnType<typeof stripeConnectStatus>> {
  const account = await input.stripe.retrieveAccount(input.env, { accountId: connectionFor(input.tenant).accountId });
  return stripeConnectStatus(account);
}
