import type { Express, Request, Response } from "express";
import { z } from "zod";
import { RailError, type Tenant, type TenantAdapterStatus, type TenantPlan } from "@nexteam/core";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "../firebase.js";
import { runTenantBackup, type StorageWriter } from "./backup.js";
import { createStripeTestSubscription } from "./billing.js";
import { toolEntitlementMatrix } from "./entitlements.js";
import { modulesForPlan, PLATFORM_PLANS } from "./plans.js";
import { defaultTenant, planCatalog, subscriptionFromStripe, type PlatformRepository } from "./repository.js";

const tenantBodySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  industryPack: z.enum(["pool_leak", "hvac", "plumbing"]).optional(),
  branding: z.object({
    assistantName: z.string().min(1),
    logoRef: z.string().optional(),
    colors: z.record(z.string()).optional()
  }).optional(),
  adapters: z.object({
    crm: z.enum(["jobber", "native"]),
    media: z.enum(["companycam", "native"]),
    email: z.enum(["gmail_relay", "sendgrid"]),
    sms: z.enum(["twilio"]).optional()
  }).optional(),
  approval: z.record(z.object({ autoApprove: z.boolean(), cleanStreak: z.number().int().min(0) })).optional(),
  timezone: z.string().min(1).optional(),
  plan: z.enum(["nexi", "marketing", "suite"]).default("nexi")
});

const subscribeBodySchema = z.object({
  plan: z.enum(["nexi", "marketing", "suite"]),
  email: z.string().email().optional()
});

export interface PlatformRouteDeps {
  repository: PlatformRepository;
  storage: StorageWriter | null;
  env?: NodeJS.ProcessEnv | undefined;
}

function envList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

function hasPlatformAccess(decoded: DecodedIdToken, env: NodeJS.ProcessEnv): boolean {
  const allowedUids = envList(env.FIREBASE_PLATFORM_OPERATOR_UIDS);
  const allowedEmails = envList(env.FIREBASE_PLATFORM_OPERATOR_EMAILS);
  const email = decoded.email?.toLowerCase() ?? "";
  const roles = Array.isArray(decoded.roles) ? decoded.roles.map((role) => String(role).toLowerCase()) : [];
  return allowedUids.includes(decoded.uid.toLowerCase())
    || (!!email && allowedEmails.includes(email))
    || decoded.platform_operator === true
    || roles.includes("platform_operator");
}

async function requirePlatformOperator(req: Request, env: NodeJS.ProcessEnv): Promise<void> {
  if (env.NEXI_FIREBASE_AUTH_REQUIRED === "false") {
    return;
  }
  const auth = getAdminAuth(env);
  if (!auth) {
    return;
  }
  const header = req.header("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new RailError("Firebase platform operator sign-in is required.", { provider: "firebase", op: "platformAuth", status: 401 });
  }
  const decoded = await auth.verifyIdToken(match[1]);
  if (!hasPlatformAccess(decoded, env)) {
    throw new RailError("Firebase user is not authorized for the platform console.", { provider: "firebase", op: "platformAuth", status: 403 });
  }
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown platform route error";
  res.status(status).json({ ok: false, error: message });
}

function status(tenant: Tenant, adapter: TenantAdapterStatus["adapter"], provider: string, configured: boolean, detail?: string): TenantAdapterStatus {
  return {
    tenantId: tenant.id,
    adapter,
    provider,
    configured,
    ok: configured,
    checkedAt: new Date().toISOString(),
    detail
  };
}

function runtimeAdapterStatuses(tenant: Tenant, env: NodeJS.ProcessEnv): TenantAdapterStatus[] {
  return [
    status(tenant, "crm", tenant.adapters.crm, tenant.adapters.crm === "native" || Boolean(env.JOBBER_API_BASE_URL && env.JOBBER_ACCESS_TOKEN)),
    status(tenant, "media", tenant.adapters.media, tenant.adapters.media === "native" || Boolean(env.COMPANYCAM_ACCESS_TOKEN)),
    status(tenant, "email", tenant.adapters.email, Boolean(env.GMAIL_READONLY_MAILBOX_1_REFRESH_TOKEN || env.GMAIL_NEXI_REFRESH_TOKEN)),
    status(tenant, "maps", "google_maps", Boolean(env.GOOGLE_MAPS_API_KEY)),
    status(tenant, "llm", "anthropic", Boolean(env.ANTHROPIC_API_KEY)),
    status(tenant, "voice", "elevenlabs", Boolean(env.ELEVENLABS_API_KEY), "Required by M12a voice.")
  ];
}

function defaultPeriod(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function loadTenantFromPlatform(repository: PlatformRepository, tenantId: string, env: NodeJS.ProcessEnv): Promise<Tenant> {
  const existing = await repository.getTenant(tenantId);
  if (existing) {
    return existing;
  }
  const configuredPlan = env.TENANT_PLAN === "nexi" || env.TENANT_PLAN === "marketing" || env.TENANT_PLAN === "suite"
    ? env.TENANT_PLAN
    : tenantId === "aquatrace" ? "suite" : "nexi";
  const tenant = defaultTenant(tenantId, configuredPlan as TenantPlan);
  return repository.upsertTenant(tenant);
}

export function registerPlatformRoutes(app: Express, deps: PlatformRouteDeps): void {
  const env = deps.env ?? process.env;

  app.get("/api/platform/plans", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      res.json({ ok: true, plans: Object.values(planCatalog()) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/tenants", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      const period = defaultPeriod();
      const tenants = await deps.repository.listTenants();
      const rows = await Promise.all(tenants.map(async (tenant) => {
        const runtimeStatuses = runtimeAdapterStatuses(tenant, env);
        await deps.repository.saveAdapterStatuses(runtimeStatuses);
        return {
          tenant,
          plan: PLATFORM_PLANS[tenant.plan],
          modules: [...modulesForPlan(tenant.plan)],
          subscription: await deps.repository.getSubscription(tenant.id),
          adapterStatuses: await deps.repository.listAdapterStatuses(tenant.id),
          cost: await deps.repository.summarizeCost(tenant.id, period)
        };
      }));
      res.json({ ok: true, tenants: rows });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/tenants", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      const input = tenantBodySchema.parse(req.body);
      const baseTenant = defaultTenant(input.id, input.plan);
      const tenant = await deps.repository.upsertTenant({
        ...baseTenant,
        ...input,
        industryPack: input.industryPack ?? baseTenant.industryPack,
        branding: input.branding ?? baseTenant.branding,
        adapters: input.adapters ?? baseTenant.adapters,
        approval: input.approval ?? baseTenant.approval,
        timezone: input.timezone ?? baseTenant.timezone
      });
      res.status(201).json({ ok: true, tenant });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/tenants/:tenantId/subscribe-test", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      const tenantId = req.params.tenantId;
      if (!tenantId) {
        throw new RailError("Tenant id is required.", { provider: "platform", op: "subscribeTestTenant", status: 400 });
      }
      const input = subscribeBodySchema.parse(req.body);
      const tenant = await loadTenantFromPlatform(deps.repository, tenantId, env);
      const stripe = await createStripeTestSubscription({ env, tenantId, plan: input.plan, email: input.email });
      const subscription = await deps.repository.saveSubscription(subscriptionFromStripe({
        tenantId,
        plan: input.plan,
        status: stripe.status,
        stripeCustomerId: stripe.customerId,
        stripeSubscriptionId: stripe.subscriptionId
      }));
      const updatedTenant = await deps.repository.upsertTenant({ ...tenant, plan: input.plan });
      res.status(201).json({ ok: true, tenant: updatedTenant, subscription, stripeMode: "test" });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/tenants/:tenantId/export", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      const tenantId = req.params.tenantId;
      if (!tenantId) {
        throw new RailError("Tenant id is required.", { provider: "platform", op: "tenantExport", status: 400 });
      }
      res.json({ ok: true, export: await deps.repository.exportTenantData(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/tenants/:tenantId/tool-entitlements", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      const tenantId = req.params.tenantId;
      if (!tenantId) {
        throw new RailError("Tenant id is required.", { provider: "platform", op: "toolEntitlements", status: 400 });
      }
      const tenant = await loadTenantFromPlatform(deps.repository, tenantId, env);
      res.json({ ok: true, tenantId, plan: tenant.plan, tools: toolEntitlementMatrix(tenant) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/tenants/:tenantId/backups/run", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      const tenantId = req.params.tenantId;
      if (!tenantId) {
        throw new RailError("Tenant id is required.", { provider: "platform", op: "tenantBackup", status: 400 });
      }
      const result = await runTenantBackup({ tenantId, repository: deps.repository, storage: deps.storage });
      res.status(201).json({ ok: true, backup: result.record });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/tenants/:tenantId/backups", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      const tenantId = req.params.tenantId;
      if (!tenantId) {
        throw new RailError("Tenant id is required.", { provider: "platform", op: "tenantBackups", status: 400 });
      }
      res.json({ ok: true, backups: await deps.repository.listBackups(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
