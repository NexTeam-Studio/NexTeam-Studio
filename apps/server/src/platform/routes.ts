import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { RailError, addressSchema, type JobAccessScope, type Tenant, type TenantAdapterStatus, type TenantPlan } from "@nexteam/core";
import type { DecodedIdToken } from "firebase-admin/auth";
import { actorIdForAccess, requireTenantCapability, requireTenantRole } from "../auth/accessContext.js";
import { getAdminAuth, getAdminStorageBucket } from "../firebase.js";
import { configuredTenantId } from "../core/tenantConfig.js";
import { createJobAccessLink, customClaimsForTenantUser, upsertTenantUser, verifyJobAccessToken } from "./accessManagement.js";
import { runTenantBackup, type StorageWriter } from "./backup.js";
import { createStripeTestSubscription } from "./billing.js";
import { toolEntitlementMatrix } from "./entitlements.js";
import { modulesForPlan, PLATFORM_PLANS } from "./plans.js";
import { defaultTenant, defaultTenantBranding, planCatalog, subscriptionFromStripe, type PlatformRepository } from "./repository.js";
import { activeSubscriptionPackages } from "./subscriptionPackages.js";
import {
  authorizeStripeConnectCallback,
  createOrReuseStripeConnectOnboarding,
  getStripeConnectOnboardingStatus,
  issueStripeConnectOnboardingLink,
  requiredTenantId,
  type StripeConnectApi
} from "./stripeConnect.js";

const tenantBodySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  industryPack: z.enum(["pool_leak", "hvac", "plumbing", "pressure_washing"]).optional(),
  branding: z.object({
    assistantName: z.string().min(1),
    logoRef: z.string().optional(),
    colors: z.record(z.string()).optional()
  }).optional(),
  adapters: z.object({
    crm: z.literal("native"),
    media: z.literal("native"),
    email: z.enum(["gmail_relay", "sendgrid"]),
    sms: z.enum(["twilio"]).optional()
  }).optional(),
  approval: z.record(z.object({ autoApprove: z.boolean(), cleanStreak: z.number().int().min(0) })).optional(),
  timezone: z.string().min(1).optional(),
  plan: z.enum(["nexi", "marketing", "suite"]).default("nexi"),
  billingEmail: z.string().email().optional(),
  billingCountry: z.string().length(2).optional()
});

const subscribeBodySchema = z.object({
  plan: z.enum(["nexi", "marketing", "suite"]),
  email: z.string().email().optional()
});

const prospectBodySchema = z.object({
  businessName: z.string().trim().min(1),
  website: z.string().url().optional(),
  industry: z.string().trim().min(1),
  primaryLocation: addressSchema.optional(),
  additionalLocations: z.array(addressSchema).default([]),
  serviceArea: z.array(z.string().trim().min(1)).default([]),
  yearsInBusiness: z.number().int().min(0).max(250).optional(),
  primaryContactName: z.string().trim().min(1).optional(),
  primaryContactRole: z.string().trim().min(1).optional(),
  notes: z.string().max(4000).optional()
}).strict();

const prospectIntakeBodySchema = z.object({
  services: z.array(z.string().trim().min(1)).default([]),
  customerTypes: z.array(z.string().trim().min(1)).default([]),
  serviceAreaNotes: z.string().max(2000).optional(),
  teamSize: z.number().int().min(0).max(100000).optional(),
  operatingHoursNotes: z.string().max(2000).optional(),
  brandVoice: z.string().max(2000).optional(),
  currentSystems: z.array(z.object({
    id: z.string().min(1).optional(),
    category: z.string().trim().min(1),
    provider: z.string().trim().min(1),
    purpose: z.string().max(1000).optional(),
    replacementTiming: z.enum(["REPLACE_NOW", "REPLACE_LATER", "COEXIST", "UNKNOWN"]),
    notes: z.string().max(2000).optional()
  }).strict()).default([]),
  migrationRecommendation: z.string().max(4000).optional(),
  source: z.enum(["MANUAL", "NEXI"]).default("MANUAL")
}).strict();

const blueprintBodySchema = z.object({
  recommendedLayout: z.array(z.string().trim().min(1)).default([]),
  nexiResponsibilities: z.array(z.string().trim().min(1)).default([]),
  opportunities: z.object({
    nexcam: z.array(z.string().trim().min(1)).optional(),
    nexdocs: z.array(z.string().trim().min(1)).optional(),
    nexreach: z.array(z.string().trim().min(1)).optional(),
    nexportal: z.array(z.string().trim().min(1)).optional()
  }).strict().default({}),
  recommendedForms: z.array(z.string().trim().min(1)).default([]),
  recommendedWorkflows: z.array(z.string().trim().min(1)).default([]),
  recommendedAutomations: z.array(z.string().trim().min(1)).default([]),
  recommendedModules: z.array(z.enum(["nexi", "crm", "fielddocs", "scheduling", "content", "campaigns", "reputation", "comms", "voice", "platform", "evaporation", "seo", "sites"])).default([]),
  migrationRecommendation: z.string().max(4000).optional(),
  futureOpportunities: z.array(z.string().trim().min(1)).default([]),
  reason: z.string().max(2000).optional()
}).strict();

const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

const tenantBrandingBodySchema = z.object({
  displayName: z.string().min(1).optional(),
  logo: z.object({
    storageRef: z.string().min(1).optional(),
    mediaId: z.string().min(1).optional(),
    url: z.string().url().optional(),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(),
    alt: z.string().min(1).optional()
  }).optional(),
  colors: z.object({
    primary: hexColorSchema.optional(),
    secondary: hexColorSchema.optional(),
    accent: hexColorSchema.optional(),
    accentText: hexColorSchema.optional(),
    background: hexColorSchema.optional(),
    surface: hexColorSchema.optional(),
    text: hexColorSchema.optional(),
    mutedText: hexColorSchema.optional(),
    userBubble: hexColorSchema.optional(),
    assistantBubble: hexColorSchema.optional()
  }).optional(),
  fontFamily: z.string().min(1).optional(),
  source: z.enum(["manual", "extracted"]).default("manual")
});

const tenantUserBodySchema = z.object({
  id: z.string().min(1).optional(),
  authUid: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phones: z.array(z.string().min(1)).optional(),
  address: addressSchema.optional(),
  displayName: z.string().min(1),
  role: z.enum(["OWNER", "OFFICE_ADMIN", "TECHNICIAN"]),
  customRoleName: z.string().trim().min(1).max(80).optional(),
  capabilities: z.array(z.enum(["team.view", "team.manage", "team.invite", "tenant.audit.read"])).optional(),
  active: z.boolean().optional()
});

const jobAccessLinkBodySchema = z.object({
  jobId: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  externalName: z.string().min(1),
  externalEmail: z.string().email().optional(),
  scopes: z.array(z.enum(["job.read", "checklist.write", "media.upload", "notes.write"])).optional(),
  expiresAt: z.string().min(1),
  returnToken: z.boolean().default(false)
});

const verifyJobAccessLinkSchema = z.object({
  tenantId: z.string().min(1),
  linkId: z.string().min(1),
  token: z.string().min(16)
});

export interface PlatformRouteDeps {
  repository: PlatformRepository;
  storage: StorageWriter | null;
  stripeConnect?: StripeConnectApi | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

function requireStripeConnect(deps: PlatformRouteDeps): StripeConnectApi {
  if (!deps.stripeConnect) {
    throw new RailError("Stripe Connect is not available in this server composition.", { provider: "stripe", op: "connectOnboarding", status: 503 });
  }
  return deps.stripeConnect;
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
    status(tenant, "crm", tenant.adapters.crm, tenant.adapters.crm === "native"),
    status(tenant, "media", tenant.adapters.media, tenant.adapters.media === "native"),
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
    : "nexi";
  const tenant = defaultTenant(tenantId, configuredPlan as TenantPlan);
  return repository.upsertTenant(tenant);
}

export function registerPlatformRoutes(app: Express, deps: PlatformRouteDeps): void {
  const env = deps.env ?? process.env;

  // This is deliberately platform-operator guarded rather than tenant-role guarded.
  // Tenant ownership is never enough to enter the NexTeam Admin surface.
  app.get("/api/platform/admin/summary", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      const [prospects, tenants] = await Promise.all([deps.repository.listProspects(), deps.repository.listTenants()]);
      res.json({
        ok: true,
        summary: {
          prospects: prospects.length,
          blueprintsAwaitingAction: prospects.filter((prospect) => ["INTAKE_COMPLETE", "BLUEPRINT_READY", "SUBSCRIPTION_REQUIRED"].includes(prospect.status)).length,
          subscriptions: tenants.length,
          tenants: tenants.length,
          activationPending: prospects.filter((prospect) => prospect.status === "SUBSCRIPTION_REQUIRED").length
        }
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/admin/prospects", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      res.json({ ok: true, prospects: await deps.repository.listProspects() });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/prospects", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      const input = prospectBodySchema.parse(req.body ?? {});
      const timestamp = new Date().toISOString();
      const prospect = await deps.repository.saveProspect({
        id: `prospect_${randomUUID()}`,
        status: "DRAFT",
        ...input,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: "platform_operator"
      });
      res.status(201).json({ ok: true, prospect });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/prospects/:prospectId/intake", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      const prospectId = requiredTenantId(req.params.prospectId);
      const input = prospectIntakeBodySchema.parse(req.body ?? {});
      const prospect = await deps.repository.getProspect(prospectId);
      if (!prospect) throw new RailError("Prospect was not found.", { provider: "platform", op: "prospectIntake", status: 404 });
      const timestamp = new Date().toISOString();
      const intake = await deps.repository.saveProspectIntake({
        id: `prospect_intake_${prospect.id}`,
        prospectId: prospect.id,
        ...input,
        currentSystems: input.currentSystems.map((system) => ({ ...system, id: system.id ?? `software_${randomUUID()}` })),
        createdAt: (await deps.repository.getProspectIntake(prospect.id))?.createdAt ?? timestamp,
        updatedAt: timestamp,
        createdBy: "platform_operator"
      });
      const nextProspect = await deps.repository.saveProspect({ ...prospect, status: "INTAKE_COMPLETE", updatedAt: timestamp });
      res.json({ ok: true, prospect: nextProspect, intake });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/prospects/:prospectId/blueprints", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      const prospectId = requiredTenantId(req.params.prospectId);
      const input = blueprintBodySchema.parse(req.body ?? {});
      const { reason, ...blueprintInput } = input;
      const prospect = await deps.repository.getProspect(prospectId);
      if (!prospect) throw new RailError("Prospect was not found.", { provider: "platform", op: "prospectBlueprint", status: 404 });
      if (!await deps.repository.getProspectIntake(prospect.id)) {
        throw new RailError("Complete the non-sensitive intake before creating an onboarding plan.", { provider: "platform", op: "prospectBlueprint", status: 409 });
      }
      const timestamp = new Date().toISOString();
      const onboardingPlan = await deps.repository.createTenantOnboardingBlueprint({
        id: `onboarding_blueprint_${randomUUID()}`,
        prospectId: prospect.id,
        ...blueprintInput,
        createdAt: timestamp,
        createdBy: "platform_operator"
      });
      const revision = await deps.repository.appendTenantOnboardingBlueprintRevision({
        id: `onboarding_blueprint_revision_${randomUUID()}`,
        prospectId: prospect.id,
        blueprintId: onboardingPlan.id,
        revisionNumber: 1,
        snapshot: onboardingPlan,
        actorId: "platform_operator",
        actorType: "NEXTEAM_STAFF",
        source: "NEXTEAM_STAFF",
        fieldsChanged: ["initial"],
        reason,
        approvalState: "DRAFT",
        createdAt: timestamp
      });
      const nextProspect = await deps.repository.saveProspect({ ...prospect, status: "BLUEPRINT_READY", updatedAt: timestamp });
      res.status(201).json({ ok: true, prospect: nextProspect, onboardingPlan, revision });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/admin/subscription-packages", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      res.json({ ok: true, packages: activeSubscriptionPackages() });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/prospects/:prospectId/subscription", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env);
      const prospectId = requiredTenantId(req.params.prospectId);
      const input = z.object({ packageId: z.string().min(1) }).strict().parse(req.body ?? {});
      const prospect = await deps.repository.getProspect(prospectId);
      if (!prospect) throw new RailError("Prospect was not found.", { provider: "platform", op: "prospectSubscription", status: 404 });
      if (prospect.status !== "BLUEPRINT_READY" && prospect.status !== "SUBSCRIPTION_REQUIRED") {
        throw new RailError("An onboarding plan must be ready before selecting the required subscription.", { provider: "platform", op: "prospectSubscription", status: 409 });
      }
      const subscriptionPackage = activeSubscriptionPackages().find((entry) => entry.id === input.packageId && entry.active);
      if (!subscriptionPackage) throw new RailError("The selected subscription package is not available.", { provider: "platform", op: "prospectSubscription", status: 400 });
      const timestamp = new Date().toISOString();
      const existing = await deps.repository.getPlatformSubscriptionAssignment(prospect.id);
      const assignment = await deps.repository.savePlatformSubscriptionAssignment({
        id: existing?.id ?? `platform_subscription_${randomUUID()}`,
        prospectId: prospect.id,
        tenantId: existing?.tenantId,
        packageId: subscriptionPackage.id,
        packageVersion: subscriptionPackage.version,
        status: "ASSIGNED",
        effectiveAt: timestamp,
        assignedBy: "platform_operator",
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp
      });
      const nextProspect = await deps.repository.saveProspect({ ...prospect, status: "SUBSCRIPTION_REQUIRED", updatedAt: timestamp });
      res.status(201).json({ ok: true, prospect: nextProspect, assignment, package: subscriptionPackage });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

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
      if (!input.billingEmail) {
        res.status(201).json({ ok: true, tenant });
        return;
      }
      const connected = await createOrReuseStripeConnectOnboarding({
        repository: deps.repository,
        stripe: requireStripeConnect(deps),
        env,
        tenantId: tenant.id,
        email: input.billingEmail,
        ...(input.billingCountry ? { country: input.billingCountry } : {})
      });
      res.status(201).json({ ok: true, tenant: connected.tenant, stripeConnect: { accountId: connected.accountId, onboardingUrl: connected.onboardingUrl } });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/tenants/:tenantId/stripe-connect/onboarding", async (req: Request, res: Response) => {
    try {
      const tenantId = requiredTenantId(req.params.tenantId);
      await requireTenantRole(req, env, ["OWNER"], { requestedTenantId: tenantId, op: "stripeConnectOnboarding" });
      const input = z.object({ email: z.string().email(), country: z.string().length(2).optional() }).parse(req.body ?? {});
      const tenant = await loadTenantFromPlatform(deps.repository, tenantId, env);
      const connected = await createOrReuseStripeConnectOnboarding({ repository: deps.repository, stripe: requireStripeConnect(deps), env, tenantId: tenant.id, email: input.email, ...(input.country ? { country: input.country } : {}) });
      res.status(201).json({ ok: true, tenantId, accountId: connected.accountId, onboardingUrl: connected.onboardingUrl });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/tenants/:tenantId/stripe-connect", async (req: Request, res: Response) => {
    try {
      const tenantId = requiredTenantId(req.params.tenantId);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "stripeConnectStatus" });
      const tenant = await loadTenantFromPlatform(deps.repository, tenantId, env);
      const status = await getStripeConnectOnboardingStatus({ stripe: requireStripeConnect(deps), env, tenant });
      res.json({ ok: true, tenantId, status });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/stripe/connect/onboarding/refresh", async (req: Request, res: Response) => {
    try {
      const tenant = await authorizeStripeConnectCallback({
        repository: deps.repository,
        tenantId: typeof req.query.tenantId === "string" ? req.query.tenantId : undefined,
        flow: typeof req.query.flow === "string" ? req.query.flow : undefined
      });
      const refreshed = await issueStripeConnectOnboardingLink({ repository: deps.repository, stripe: requireStripeConnect(deps), env, tenant });
      res.redirect(303, refreshed.onboardingUrl);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/stripe/connect/onboarding/return", async (req: Request, res: Response) => {
    try {
      const tenant = await authorizeStripeConnectCallback({
        repository: deps.repository,
        tenantId: typeof req.query.tenantId === "string" ? req.query.tenantId : undefined,
        flow: typeof req.query.flow === "string" ? req.query.flow : undefined
      });
      const status = await getStripeConnectOnboardingStatus({ stripe: requireStripeConnect(deps), env, tenant });
      res.json({ ok: true, tenantId: tenant.id, status });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/public/tenant-branding", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId.trim()
        : configuredTenantId(env, "publicTenantBranding");
      const tenant = await loadTenantFromPlatform(deps.repository, tenantId, env);
      const branding = await deps.repository.getTenantBranding(tenantId) ?? defaultTenantBranding(tenant);
      res.json({ ok: true, tenantId, branding });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/public/tenant-branding/logo", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId.trim()
        : configuredTenantId(env, "publicTenantBrandingLogo");
      const tenant = await loadTenantFromPlatform(deps.repository, tenantId, env);
      const branding = await deps.repository.getTenantBranding(tenantId) ?? defaultTenantBranding(tenant);
      const storageRef = branding.logo?.storageRef;
      const match = storageRef?.match(/^gs:\/\/([^/]+)\/(.+)$/);
      if (!match?.[1] || !match[2]) {
        throw new RailError("Tenant logo is not stored in Firebase Storage.", { provider: "firebase", op: "publicTenantBrandingLogo", status: 404 });
      }
      const bucket = getAdminStorageBucket(env);
      if (!bucket || bucket.name !== match[1]) {
        throw new RailError("Tenant logo storage is unavailable.", { provider: "firebase", op: "publicTenantBrandingLogo", status: 503 });
      }
      const file = bucket.file(match[2]);
      const [exists] = await file.exists();
      if (!exists) {
        throw new RailError("Tenant logo was not found.", { provider: "firebase", op: "publicTenantBrandingLogo", status: 404 });
      }
      res.setHeader("cache-control", "public, max-age=3600");
      res.setHeader("content-type", branding.logo?.mimeType ?? "image/png");
      file.createReadStream().pipe(res);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/tenants/:tenantId/branding", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      if (!tenantId) {
        throw new RailError("Tenant id is required.", { provider: "platform", op: "tenantBranding", status: 400 });
      }
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "tenantBranding" });
      const tenant = await loadTenantFromPlatform(deps.repository, tenantId, env);
      const branding = await deps.repository.getTenantBranding(tenantId) ?? defaultTenantBranding(tenant);
      res.json({ ok: true, tenantId, branding });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/tenants/:tenantId/branding", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      if (!tenantId) {
        throw new RailError("Tenant id is required.", { provider: "platform", op: "tenantBrandingUpdate", status: 400 });
      }
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "tenantBrandingUpdate" });
      const input = tenantBrandingBodySchema.parse(req.body ?? {});
      const tenant = await loadTenantFromPlatform(deps.repository, tenantId, env);
      const current = await deps.repository.getTenantBranding(tenantId) ?? defaultTenantBranding(tenant);
      const branding = await deps.repository.saveTenantBranding({
        ...current,
        displayName: input.displayName ?? current.displayName,
        logo: input.logo ? { ...input.logo, updatedAt: new Date().toISOString() } : current.logo,
        colors: { ...current.colors, ...(input.colors ?? {}) },
        fontFamily: input.fontFamily ?? current.fontFamily,
        source: input.source,
        updatedBy: actorIdForAccess(access),
        updatedAt: new Date().toISOString()
      });
      res.json({ ok: true, tenantId, branding });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/tenants/:tenantId/users", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      if (!tenantId) {
        throw new RailError("Tenant id is required.", { provider: "platform", op: "tenantUsers", status: 400 });
      }
      await requireTenantCapability(req, env, "team.view", { requestedTenantId: tenantId, op: "tenantUsers" });
      res.json({ ok: true, tenantId, users: await deps.repository.listTenantUsers(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/tenants/:tenantId/users", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      if (!tenantId) {
        throw new RailError("Tenant id is required.", { provider: "platform", op: "tenantUserUpsert", status: 400 });
      }
      const access = await requireTenantCapability(req, env, "team.manage", { requestedTenantId: tenantId, op: "tenantUserUpsert" });
      const input = tenantUserBodySchema.parse(req.body ?? {});
      if (input.role === "OWNER" && access.role !== "OWNER") {
        throw new RailError("Only an owner can assign the owner role.", { provider: "platform", op: "tenantUserUpsert", status: 403 });
      }
      if ((input.capabilities ?? []).some((capability) => !access.capabilities.includes(capability))) {
        throw new RailError("You cannot grant a capability you do not hold.", { provider: "platform", op: "tenantUserUpsert", status: 403 });
      }
      const user = await upsertTenantUser(deps.repository, { ...input, tenantId });
      await deps.repository.saveTenantMembershipAudit({
        id: `membership_audit_${randomUUID()}`,
        tenantId,
        action: "member.upserted",
        actorId: actorIdForAccess(access),
        targetUserId: user.id,
        detail: `role=${user.role}; customRole=${user.customRoleName ?? "none"}; active=${user.active}`,
        createdAt: new Date().toISOString()
      });
      res.status(201).json({ ok: true, user, claimsPreview: customClaimsForTenantUser(user) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/tenants/:tenantId/users/:userId/custom-claims", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      const userId = req.params.userId;
      if (!tenantId || !userId) {
        throw new RailError("Tenant id and user id are required.", { provider: "platform", op: "tenantUserClaims", status: 400 });
      }
      const access = await requireTenantCapability(req, env, "team.manage", { requestedTenantId: tenantId, op: "tenantUserClaims" });
      const user = await deps.repository.getTenantUser(tenantId, userId);
      if (!user) {
        throw new RailError("Tenant user was not found.", { provider: "platform", op: "tenantUserClaims", status: 404 });
      }
      const claims = customClaimsForTenantUser(user);
      const auth = getAdminAuth(env);
      const canApply = Boolean(auth && user.authUid && env.NEXI_FIREBASE_AUTH_REQUIRED !== "false");
      if (canApply && auth && user.authUid) {
        await auth.setCustomUserClaims(user.authUid, claims);
      }
      await deps.repository.saveTenantMembershipAudit({
        id: `membership_audit_${randomUUID()}`,
        tenantId,
        action: "member.claims_applied",
        actorId: actorIdForAccess(access),
        targetUserId: user.id,
        detail: canApply ? "Firebase claims applied." : "Firebase claims previewed; no auth adapter available.",
        createdAt: new Date().toISOString()
      });
      res.json({ ok: true, userId: user.id, applied: canApply, claimsPreview: claims });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/tenants/:tenantId/users/audit", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      if (!tenantId) throw new RailError("Tenant id is required.", { provider: "platform", op: "tenantMembershipAudit", status: 400 });
      await requireTenantCapability(req, env, "tenant.audit.read", { requestedTenantId: tenantId, op: "tenantMembershipAudit" });
      res.json({ ok: true, tenantId, audits: await deps.repository.listTenantMembershipAudits(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/tenants/:tenantId/job-access-links", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      if (!tenantId) {
        throw new RailError("Tenant id is required.", { provider: "platform", op: "jobAccessLinks", status: 400 });
      }
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "jobAccessLinks" });
      const jobId = typeof req.query.jobId === "string" ? req.query.jobId : undefined;
      const links = await deps.repository.listJobAccessLinks(tenantId, jobId);
      res.json({ ok: true, tenantId, links: links.map((link) => ({ ...link, tokenHash: "[stored hash]" })) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/tenants/:tenantId/job-access-links", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      if (!tenantId) {
        throw new RailError("Tenant id is required.", { provider: "platform", op: "jobAccessLinkCreate", status: 400 });
      }
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "jobAccessLinkCreate"
      });
      const input = jobAccessLinkBodySchema.parse(req.body ?? {});
      const created = await createJobAccessLink(deps.repository, {
        tenantId,
        jobId: input.jobId,
        propertyId: input.propertyId,
        externalName: input.externalName,
        externalEmail: input.externalEmail,
        scopes: input.scopes as JobAccessScope[] | undefined,
        expiresAt: input.expiresAt,
        createdBy: actorIdForAccess(access)
      });
      res.status(201).json({
        ok: true,
        link: { ...created.link, tokenHash: "[stored hash]" },
        tokenFingerprint: created.tokenFingerprint,
        oneTimeToken: input.returnToken ? created.oneTimeToken : undefined,
        warning: input.returnToken
          ? "The one-time token is shown only because returnToken=true; do not put it in receipts or logs."
          : "One-time token withheld from response to avoid credential leakage."
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/tenants/:tenantId/job-access-links/:linkId/revoke", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      const linkId = req.params.linkId;
      if (!tenantId || !linkId) {
        throw new RailError("Tenant id and link id are required.", { provider: "platform", op: "jobAccessLinkRevoke", status: 400 });
      }
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "jobAccessLinkRevoke" });
      const link = await deps.repository.revokeJobAccessLink(tenantId, linkId, new Date().toISOString());
      if (!link) {
        throw new RailError("That job link was not found.", { provider: "platform", op: "jobAccessLinkRevoke", status: 404 });
      }
      res.json({ ok: true, link: { ...link, tokenHash: "[stored hash]" } });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/job-access-links/verify", async (req: Request, res: Response) => {
    try {
      const input = verifyJobAccessLinkSchema.parse(req.body ?? {});
      const access = await verifyJobAccessToken(deps.repository, input);
      res.json({
        ok: true,
        access: {
          tenantId: access.tenantId,
          accessKind: access.accessKind,
          tenantUserId: access.tenantUserId,
          jobAccessLinkId: access.jobAccessLinkId,
          jobId: access.jobId,
          propertyId: access.propertyId,
          scopes: access.scopes
        }
      });
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
