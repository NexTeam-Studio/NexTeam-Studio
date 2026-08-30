import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { RailError, addressSchema, type JobAccessScope, type Tenant, type TenantAdapterStatus, type TenantPlan } from "@nexteam/core";
import type { DecodedIdToken } from "firebase-admin/auth";
import { actorIdForAccess, requireTenantCapability, requireTenantRole } from "../auth/accessContext.js";
import { getAdminAuth, getAdminStorageBucket } from "../firebase.js";
import { fetchAddressSuggestions } from "../shared/addressLocation/geocodingService.js";
import { configuredTenantId } from "../core/tenantConfig.js";
import { createJobAccessLink, customClaimsForTenantUser, upsertTenantUser, verifyJobAccessToken } from "./accessManagement.js";
import { runTenantBackup, type StorageWriter } from "./backup.js";
import { createStripeTestSubscription } from "./billing.js";
import { toolEntitlementMatrix } from "./entitlements.js";
import { modulesForPlan, PLATFORM_PLANS } from "./plans.js";
import { defaultTenant, defaultTenantBranding, defaultTenantUsers, planCatalog, subscriptionFromStripe, type PlatformRepository, type TenantProfile } from "./repository.js";
import { activeSubscriptionPackages } from "./subscriptionPackages.js";
import { activateProspectTenant, getOrCreateFirebaseOwner, mergeTenantOwnerClaims, type FirebaseOwnerActivation } from "./tenantActivation.js";
import { confirmSubscriptionCancellation, requestSubscriptionCancellation, resubscribeTenant } from "./tenantSubscriptionLifecycle.js";
import { newOwnerInvite, type OwnerInviteSender } from "./tenantOwnerInvite.js";
import { stagingOwnerInvitationGmailProviderStatus, transactionalProviderStatus } from "../comms/gmailRegistry.js";
import { buildOnboardingPlanInsights } from "./onboardingInsights.js";
import { readLiveBuildStatus } from "./liveBuildStatus.js";
import { newPlatformUserAudit, PLATFORM_CAPABILITIES, platformCapabilitySchema, platformUserSchema, platformUserSummary, resolvePlatformCapabilities, type PlatformCapability, type PlatformUser } from "./team.js";
import { NEXCOMMAND_IDLE_TIMEOUT_MS, hashSessionToken, newNexCommandSession, newPlatformSecurityAudit, type PlatformSession } from "./sessionSecurity.js";
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
    email: z.enum(["gmail_relay", "resend", "sendgrid"]),
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

const cancellationFirstConfirmationSchema = z.object({
  confirmation: z.literal("I_UNDERSTAND_CANCEL_ARCHIVE"),
  idempotencyKey: z.string().min(12).max(160)
}).strict();
const cancellationSecondConfirmationSchema = z.object({
  confirmation: z.literal("CANCEL_AND_ARCHIVE"),
  cancellationId: z.string().min(1).max(200),
  idempotencyKey: z.string().min(12).max(160)
}).strict();
const resubscribeBodySchema = z.object({
  confirmation: z.literal("RESUBSCRIBE"),
  idempotencyKey: z.string().min(12).max(160)
}).strict();

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

const revisionAcceptanceBodySchema = z.object({
  reason: z.string().trim().min(1).max(2000)
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
  permissionOverrides: z.record(z.enum(["CLIENTS", "PROPERTIES", "REQUESTS", "QUOTES", "JOBS", "VISITS", "SCHEDULING", "PRODUCTS_AND_SERVICES", "INVOICES", "PAYMENTS", "REPORTS", "NEXDOCS", "NEXCAM", "TEAM", "SETTINGS", "COMMUNICATIONS", "AUTOMATIONS", "APPROVALS", "IMPORTS", "VIEW_AS_CLIENT"]), z.enum(["NONE", "READ", "CREATE", "WRITE", "MANAGE", "DELETE", "FULL"])).optional(),
  active: z.boolean().optional()
});
const tenantInviteBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "OFFICE_ADMIN", "TECHNICIAN"])
}).strict();

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

const platformUserInputSchema = platformUserSchema.pick({ authUid: true, firstName: true, lastName: true, email: true, telephone: true, address: true, role: true, capabilityOverrides: true }).strict();
const platformUserPatchSchema = platformUserInputSchema.omit({ authUid: true }).partial().refine((value) => Object.keys(value).length > 0, "At least one profile field is required.");
const platformSelfProfilePatchSchema = platformUserSchema.pick({ firstName: true, lastName: true, email: true, telephone: true, address: true }).partial().refine((value) => Object.keys(value).length > 0, "At least one profile field is required.");
const ownershipTransferSchema = z.object({ toUserId: z.string().min(1) }).strict();
const tenantOwnerAssignmentSchema = z.object({ toUserId: z.string().min(1) }).strict();
const tenantProfileSchema = z.object({
  legalName: z.string().trim().min(1).max(180).optional(),
  dbaName: z.string().trim().min(1).max(180).optional(),
  website: z.string().url().optional(),
  status: z.enum(["ACTIVE", "PENDING", "INACTIVE", "CANCELLED"]).optional(),
  subscriptionPlan: z.enum(["none", "staging-tier-1", "staging-tier-2", "staging-tier-3"]).optional(),
  primaryContact: z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), email: z.string().email().optional(), phone: z.string().trim().max(40).optional(), address: addressSchema.optional() }).optional(),
  tenant: z.object({ name: z.string().trim().min(1).max(180), timezone: z.string().trim().min(1).max(80), lifecycleState: z.enum(["ACTIVE", "DISABLED_ARCHIVED"]), logoUrl: z.string().url().optional() }).strict()
}).strict();
const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const profilePhotoContentTypes = ["image/png", "image/jpeg", "image/webp"] as const;
type ProfilePhotoContentType = typeof profilePhotoContentTypes[number];

export interface PlatformRouteDeps {
  repository: PlatformRepository;
  storage: StorageWriter | null;
  stripeConnect?: StripeConnectApi | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  firebaseOwnerActivation?: FirebaseOwnerActivation | undefined;
  ownerInviteSender?: OwnerInviteSender | undefined;
  /** Testable auth seam; production falls back to Firebase Admin. */
  platformOperatorAuth?: { verifyIdToken(token: string): Promise<DecodedIdToken> } | undefined;
  /** Enables production-equivalent session-only behavior in isolated route tests. */
  strictNexCommandSession?: boolean | undefined;
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

function capabilityForNexCommandRoute(req: Request): PlatformCapability {
  const path = req.path;
  if (path.includes("/prospects")) return req.method === "GET" ? "platform.prospects.view" : "platform.prospects.manage";
  if (path.includes("/migrations")) return req.method === "GET" ? "platform.migrations.view" : "platform.migrations.manage";
  if (path.includes("/blockers") || path.includes("/support-escalations")) return req.method === "GET" ? "platform.support.view" : "platform.support.manage";
  if (path.includes("subscription") || path.includes("stripe")) return req.method === "GET" ? "platform.billing.view" : "platform.billing.manage";
  if (path.includes("/prospects/") || path.includes("onboarding") || path.includes("/activate")) return req.method === "GET" ? "platform.onboarding.view" : "platform.onboarding.manage";
  if (path.includes("/backups") || path.includes("/export") || path.includes("/tool-entitlements")) return "platform.security.manage";
  if (path.includes("/live-build-status")) return "platform.code.view";
  if (path.includes("/providers")) return "platform.integrations.view";
  if (path.includes("/summary")) return "platform.dashboard.view";
  return req.method === "GET" ? "platform.tenants.view" : "platform.tenants.manage";
}
async function requirePlatformOperator(req: Request, env: NodeJS.ProcessEnv, repository: PlatformRepository, authOverride?: { verifyIdToken(token: string): Promise<DecodedIdToken> }): Promise<{ uid: string; capabilities: PlatformCapability[] }> {
  if (env.NEXI_FIREBASE_AUTH_REQUIRED === "false") return { uid: "local-platform-operator", capabilities: PLATFORM_CAPABILITIES };
  const sessionActor = await requireNexCommandSessionOrTestIdentity(req, env, repository, authOverride, env.NEXCOMMAND_STRICT_SESSION === "true");
  if (!sessionActor.capabilities.includes(capabilityForNexCommandRoute(req))) throw new RailError("Platform operator lacks the required NexCommand capability.", { provider: "platform", op: "platformAuth", status: 403 });
  return sessionActor;
}

async function requirePlatformSupportOperator(req: Request, env: NodeJS.ProcessEnv, repository: PlatformRepository, authOverride?: { verifyIdToken(token: string): Promise<DecodedIdToken> }): Promise<void> {
  if (env.NEXI_FIREBASE_AUTH_REQUIRED === "false") return;
  const sessionActor = await requireNexCommandSessionOrTestIdentity(req, env, repository, authOverride, env.NEXCOMMAND_STRICT_SESSION === "true");
  if (!sessionActor.capabilities.includes(capabilityForNexCommandRoute(req))) throw new RailError("Platform operator lacks the required NexCommand capability.", { provider: "platform", op: "platformAuth", status: 403 });
}

function claimedPlatformCapabilities(decoded: DecodedIdToken): PlatformCapability[] {
  const claimed = (decoded as unknown as Record<string, unknown>).platformCapabilities;
  return Array.isArray(claimed)
    ? claimed.filter((value): value is PlatformCapability => platformCapabilitySchema.safeParse(value).success)
    : PLATFORM_CAPABILITIES;
}

function bearerToken(req: Request): string | null { return (req.header("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1] ?? null; }
async function requireNexCommandSession(req: Request, repository: PlatformRepository): Promise<{ uid: string; capabilities: PlatformCapability[] }> {
  const token = bearerToken(req);
  if (!token?.startsWith("ncs_")) throw new RailError("A fresh NexCommand session is required.", { provider: "platform", op: "platformSession", status: 401 });
  const session = await repository.getPlatformSessionByTokenHash(hashSessionToken(token));
  if (!session || session.invalidatedAt) throw new RailError("NexCommand session is no longer valid.", { provider: "platform", op: "platformSession", status: 401 });
  const now = new Date();
  if (now.getTime() - new Date(session.lastActivityAt).getTime() >= NEXCOMMAND_IDLE_TIMEOUT_MS) {
    const expired: PlatformSession = { ...session, invalidatedAt: now.toISOString(), invalidationReason: "idle_expired" };
    await repository.savePlatformSession(expired);
    await repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_session.idle_expired", session.actorUid, "NexCommand session expired after 15 minutes of inactivity.", undefined, now.toISOString()));
    throw new RailError("NexCommand session expired after 15 minutes of inactivity.", { provider: "platform", op: "platformSession", status: 401 });
  }
  await repository.savePlatformSession({ ...session, lastActivityAt: now.toISOString() });
  const profile = await repository.getPlatformUserByAuthUid(session.actorUid);
  if (!profile || profile.accountStatus !== "ACTIVE") throw new RailError("An active NexTeam internal user profile is required for NexCommand.", { provider: "platform", op: "platformSession", status: 403 });
  return { uid: session.actorUid, capabilities: profile.profilePhotoRef ? resolvePlatformCapabilities(profile.role, profile.capabilityOverrides) : ["platform.profile.self"] };
}
async function requireNexCommandSessionOrTestIdentity(req: Request, env: NodeJS.ProcessEnv, repository: PlatformRepository, authOverride?: { verifyIdToken(token: string): Promise<DecodedIdToken> }, strictSession = false): Promise<{ uid: string; capabilities: PlatformCapability[] }> {
  // The injected verifier is an isolated-test seam. Production has no override,
  // so deployed NexCommand routes accept only short-lived NexCommand sessions.
  if (!strictSession && !bearerToken(req)?.startsWith("ncs_") && authOverride) return requireFirebasePlatformIdentity(req, env, repository, authOverride);
  if (!bearerToken(req)?.startsWith("ncs_") && !authOverride && !getAdminAuth(env)) throw new RailError("Platform authentication is temporarily unavailable.", { provider: "firebase", op: "platformAuth", status: 503 });
  return requireNexCommandSession(req, repository);
}
async function requireFirebasePlatformIdentity(req: Request, env: NodeJS.ProcessEnv, repository: PlatformRepository, authOverride?: { verifyIdToken(token: string): Promise<DecodedIdToken> }): Promise<{ uid: string; capabilities: PlatformCapability[] }> {
  const token = bearerToken(req);
  if (!token) throw new RailError("Firebase platform operator sign-in is required.", { provider: "firebase", op: "platformAuth", status: 401 });
  const auth = authOverride ?? getAdminAuth(env);
  if (!auth) throw new RailError("Platform authentication is temporarily unavailable.", { provider: "firebase", op: "platformAuth", status: 503 });
  const decoded = await auth.verifyIdToken(token);
  const profile = await repository.getPlatformUserByAuthUid(decoded.uid);
  // Tenant claims (including tenant owner) are never NexCommand credentials.
  // Deployed NexCommand requires a separate, durable active internal profile.
  if (!profile && (!authOverride || env.NEXCOMMAND_REQUIRE_INTERNAL_PROFILE === "true")) throw new RailError("An active NexTeam internal user profile is required for NexCommand.", { provider: "platform", op: "platformAuth", status: 403 });
  if (!profile) {
    if (!hasPlatformAccess(decoded, env)) throw new RailError("Firebase user is not authorized for the platform console.", { provider: "firebase", op: "platformAuth", status: 403 });
    return { uid: decoded.uid, capabilities: claimedPlatformCapabilities(decoded) };
  }
  if (profile.accountStatus !== "ACTIVE") throw new RailError("Platform profile is disabled.", { provider: "platform", op: "platformAuth", status: 403 });
  return { uid: decoded.uid, capabilities: profile.profilePhotoRef ? resolvePlatformCapabilities(profile.role, profile.capabilityOverrides) : ["platform.profile.self"] };
}

async function requirePlatformTeamCapability(req: Request, env: NodeJS.ProcessEnv, capability: PlatformCapability, repository: PlatformRepository, authOverride?: { verifyIdToken(token: string): Promise<DecodedIdToken> }): Promise<{ uid: string; capabilities: PlatformCapability[]; role?: string }> {
  if (env.NEXI_FIREBASE_AUTH_REQUIRED === "false") return { uid: "local-platform-operator", capabilities: PLATFORM_CAPABILITIES, role: "Owner" };
  const actor = await requireNexCommandSessionOrTestIdentity(req, env, repository, authOverride, env.NEXCOMMAND_STRICT_SESSION === "true");
  const profile = await repository.getPlatformUserByAuthUid(actor.uid);
  const capabilities = actor.capabilities;
  if (!capabilities.includes(capability)) throw new RailError("Platform operator lacks the required NexCommand capability.", { provider: "firebase", op: "platformTeam", status: 403 });
  return profile ? { uid: actor.uid, capabilities, role: profile.role } : { uid: actor.uid, capabilities };
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown platform route error";
  res.status(status).json({ ok: false, error: message });
}

function primaryContactEmail(profile: Pick<TenantProfile, "primaryContact">): string {
  const email = profile.primaryContact?.email?.trim().toLowerCase();
  if (!email) {
    throw new RailError("A Primary Contact email is required because it is the tenant's sole NexOps owner identity.", { provider: "platform", op: "tenantOwnerProvisioning", status: 400 });
  }
  return email;
}

async function assertTenantEmailExclusive(repository: PlatformRepository, tenantId: string, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const platformUsers = await repository.listPlatformUsers();
  if (platformUsers.some((user) => user.email.trim().toLowerCase() === normalized)) {
    throw new RailError("A NexCommand internal email cannot also be used as a tenant email. Use a distinct tenant Primary Contact email.", { provider: "platform", op: "tenantOwnerProvisioning", status: 409 });
  }
  const tenants = await repository.listTenants();
  const memberships = await Promise.all(tenants.map(async (tenant) => ({ tenantId: tenant.id, users: await repository.listTenantUsers(tenant.id) })));
  if (memberships.some((entry) => entry.tenantId !== tenantId && entry.users.some((user) => user.email?.trim().toLowerCase() === normalized))) {
    throw new RailError("A tenant email can belong to only one tenant workspace. Use a distinct Primary Contact email.", { provider: "platform", op: "tenantOwnerProvisioning", status: 409 });
  }
}

async function systemTenantNumber(repository: PlatformRepository, tenantId: string, current?: TenantProfile | null): Promise<number> {
  if (Number.isInteger(current?.tenantNumber) && (current?.tenantNumber ?? 0) > 0) return current!.tenantNumber!;
  const tenants = await repository.listTenants();
  const profiles = await Promise.all(tenants.map((tenant) => repository.getTenantProfile(tenant.id)));
  const assigned = profiles.flatMap((profile) => Number.isInteger(profile?.tenantNumber) && (profile?.tenantNumber ?? 0) > 0 ? [profile!.tenantNumber!] : []);
  const firstUnassigned = tenants.filter((tenant) => !profiles.find((profile) => profile?.tenantId === tenant.id && Number.isInteger(profile.tenantNumber) && (profile.tenantNumber ?? 0) > 0)).sort((left, right) => left.id.localeCompare(right.id));
  return Math.max(0, ...assigned) + firstUnassigned.findIndex((tenant) => tenant.id === tenantId) + 1;
}

async function provisionPrimaryContactOwner(input: { repository: PlatformRepository; tenantId: string; profile: TenantProfile; actorId: string; now: string }): Promise<void> {
  const email = primaryContactEmail(input.profile);
  const contact = input.profile.primaryContact!;
  const members = await input.repository.listTenantUsers(input.tenantId);
  const existing = members.find((member) => member.email?.trim().toLowerCase() === email);
  const wasSoleOwner = existing?.role === "OWNER" && existing.active && members.filter((member) => member.role === "OWNER" && member.active).length === 1;
  const owner = await upsertTenantUser(input.repository, {
    tenantId: input.tenantId,
    id: existing?.id,
    authUid: existing?.authUid,
    email,
    phones: contact.phone ? [contact.phone] : existing?.phones,
    displayName: `${contact.firstName} ${contact.lastName}`.trim(),
    // Do not introduce a second active owner before the repository transaction
    // has atomically demoted the previous one.
    role: wasSoleOwner ? "OWNER" : existing?.role === "OWNER" ? "OFFICE_ADMIN" : existing?.role ?? "OFFICE_ADMIN",
    active: true,
    now: input.now
  });
  if (wasSoleOwner) return;
  await input.repository.assignTenantOwner({
    tenantId: input.tenantId,
    toUserId: owner.id,
    actorId: input.actorId,
    now: input.now,
    audit: {
      id: `membership_audit_${randomUUID()}`,
      tenantId: input.tenantId,
      action: "member.owner_assigned",
      actorId: input.actorId,
      targetUserId: owner.id,
      detail: "NexCommand synchronized the verified Primary Contact as the tenant's sole active NexOps owner; any previous active owner was atomically demoted to OFFICE_ADMIN.",
      createdAt: input.now
    }
  });
}

function profilePhotoType(contentType: string | undefined, body: unknown): { contentType: ProfilePhotoContentType; extension: "png" | "jpg" | "webp" } {
  const normalized = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (!profilePhotoContentTypes.includes(normalized as ProfilePhotoContentType) || !Buffer.isBuffer(body) || body.length === 0 || body.length > PROFILE_PHOTO_MAX_BYTES) {
    throw new RailError("Profile photo must be a PNG, JPEG, or WebP image no larger than 5 MB.", { provider: "platform", op: "profilePhotoUpload", status: 400 });
  }
  const signatures: Record<ProfilePhotoContentType, (data: Buffer) => boolean> = {
    "image/png": (data) => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/jpeg": (data) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
    "image/webp": (data) => data.length >= 12 && data.subarray(0, 4).equals(Buffer.from("RIFF")) && data.subarray(8, 12).equals(Buffer.from("WEBP"))
  };
  if (!signatures[normalized as ProfilePhotoContentType](body)) {
    throw new RailError("Profile photo content does not match its declared image type.", { provider: "platform", op: "profilePhotoUpload", status: 400 });
  }
  return {
    contentType: normalized as ProfilePhotoContentType,
    extension: normalized === "image/png" ? "png" : normalized === "image/jpeg" ? "jpg" : "webp"
  };
}

function assertOwnerIdentityIsImmutable(existing: PlatformUser, patch: Record<string, unknown>): void {
  if (existing.role !== "Owner") return;
  if ((typeof patch.email === "string" && patch.email !== existing.email) || typeof patch.firstName === "string" && patch.firstName !== existing.firstName || typeof patch.lastName === "string" && patch.lastName !== existing.lastName) {
    throw new RailError("The protected Owner email and legal name can only change through a controlled identity-recovery process.", { provider: "platform", op: "platformOwnerIdentity", status: 403 });
  }
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
  const transactional = transactionalProviderStatus(env, tenant.id);
  return [
    status(tenant, "crm", tenant.adapters.crm, tenant.adapters.crm === "native"),
    status(tenant, "media", tenant.adapters.media, tenant.adapters.media === "native"),
    status(
      tenant,
      "email",
      transactional.provider ?? tenant.adapters.email,
      transactional.configured
    ),
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

  app.post("/api/platform/admin/session", async (req: Request, res: Response) => {
    try {
      const actor = await requireFirebasePlatformIdentity(req, env, deps.repository, deps.platformOperatorAuth);
      if (!actor.capabilities.includes("platform.profile.self")) throw new RailError("Platform operator lacks the required NexCommand capability.", { provider: "platform", op: "platformSessionCreate", status: 403 });
      const created = newNexCommandSession(actor.uid, actor.capabilities);
      await deps.repository.savePlatformSession(created.session);
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_session.created", actor.uid, "Fresh NexCommand session created."));
      res.status(201).json({ ok: true, token: created.token, idleTimeoutMs: NEXCOMMAND_IDLE_TIMEOUT_MS });
    } catch (error) {
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_session.failed_sign_in", "anonymous", "NexCommand session creation was denied.")).catch(() => undefined);
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/session/sign-out", async (req: Request, res: Response) => {
    try {
      const token = bearerToken(req);
      const session = token?.startsWith("ncs_") ? await deps.repository.getPlatformSessionByTokenHash(hashSessionToken(token)) : null;
      if (!session || session.invalidatedAt) throw new RailError("NexCommand session is no longer valid.", { provider: "platform", op: "platformSessionSignOut", status: 401 });
      const now = new Date().toISOString();
      await deps.repository.savePlatformSession({ ...session, invalidatedAt: now, invalidationReason: "explicit_sign_out", lastActivityAt: now });
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_session.signed_out", session.actorUid, "NexCommand session explicitly signed out.", undefined, now));
      res.json({ ok: true });
    } catch (error) { sendRouteError(res, error); }
  });

  app.get("/api/platform/admin/audit", async (req: Request, res: Response) => {
    try { await requirePlatformTeamCapability(req, env, "platform.security.view", deps.repository, deps.platformOperatorAuth); res.json({ ok: true, audits: await deps.repository.listPlatformSecurityAudits() }); } catch (error) { sendRouteError(res, error); }
  });
  app.all("/api/platform/admin/audit", (_req: Request, res: Response) => res.status(405).json({ ok: false, error: "Platform audit history is immutable." }));

  // NexCommand Team is platform-owned personnel metadata. It deliberately does
  // not use tenantUsers, tenant roles, or tenant capabilities.
  app.get("/api/platform/admin/team", async (req: Request, res: Response) => {
    try {
      await requirePlatformTeamCapability(req, env, "platform.team.view", deps.repository, deps.platformOperatorAuth);
      const users = await deps.repository.listPlatformUsers();
      res.json({ ok: true, users: users.map(platformUserSummary) });
    } catch (error) { sendRouteError(res, error); }
  });

  app.get("/api/platform/admin/team/me", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.profile.self", deps.repository, deps.platformOperatorAuth);
      const user = await deps.repository.getPlatformUserByAuthUid(actor.uid);
      res.json({ ok: true, user });
    } catch (error) { sendRouteError(res, error); }
  });

  // A platform operator may maintain their own contact profile, but never their
  // role or capability overrides. Those remain a separate managed-team action.
  app.patch("/api/platform/admin/team/me", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.profile.self", deps.repository, deps.platformOperatorAuth);
      const existing = await deps.repository.getPlatformUserByAuthUid(actor.uid);
      if (!existing) throw new RailError("An internal platform profile is required.", { provider: "platform", op: "platformSelfProfileUpdate", status: 404 });
      if (Object.hasOwn(req.body ?? {}, "profilePhotoRef")) throw new RailError("Profile photos must be uploaded as image files.", { provider: "platform", op: "platformSelfProfileUpdate", status: 400 });
      const patch = platformSelfProfilePatchSchema.parse(req.body ?? {});
      assertOwnerIdentityIsImmutable(existing, patch);
      const timestamp = new Date().toISOString();
      const user = await deps.repository.savePlatformUser({ ...existing, ...patch, updatedAt: timestamp, updatedBy: actor.uid } as PlatformUser);
      await deps.repository.appendPlatformUserAudit(newPlatformUserAudit(user.id, "platform_user.updated", actor.uid, "Self-service profile metadata updated.", timestamp));
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_user.profile_or_permission_changed", actor.uid, "Platform self-service profile updated.", user.authUid, timestamp));
      res.json({ ok: true, user });
    } catch (error) { sendRouteError(res, error); }
  });

  // Profile images are server-written, UID-scoped storage objects. The client
  // never supplies the durable storage reference that completes this gate.
  app.post("/api/platform/admin/team/me/profile-photo", express.raw({ type: [...profilePhotoContentTypes], limit: PROFILE_PHOTO_MAX_BYTES }), async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.profile.self", deps.repository, deps.platformOperatorAuth);
      const existing = await deps.repository.getPlatformUserByAuthUid(actor.uid);
      if (!existing) throw new RailError("An internal platform profile is required.", { provider: "platform", op: "profilePhotoUpload", status: 404 });
      if (!deps.storage) throw new RailError("Firebase Storage is not configured for platform profile photos.", { provider: "firebase", op: "profilePhotoUpload", status: 503 });
      const image = profilePhotoType(req.header("content-type"), req.body);
      const uidPath = encodeURIComponent(actor.uid);
      const storageRef = await deps.storage.writeImage(`platform-profiles/${uidPath}/profile.${image.extension}`, req.body as Buffer, image.contentType);
      const timestamp = new Date().toISOString();
      const user = await deps.repository.savePlatformUser({ ...existing, profilePhotoRef: storageRef, updatedAt: timestamp, updatedBy: actor.uid });
      await deps.repository.appendPlatformUserAudit(newPlatformUserAudit(user.id, "platform_user.updated", actor.uid, "Self-service profile photo uploaded to UID-scoped platform storage.", timestamp));
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_user.profile_or_permission_changed", actor.uid, "Platform self-service profile photo uploaded.", user.authUid, timestamp));
      res.status(201).json({ ok: true, user: platformUserSummary(user) });
    } catch (error) { sendRouteError(res, error); }
  });

  // This narrowly scoped maintenance action is intentionally separate from
  // authentication reads. It never accepts identity fields from the client.
  app.post("/api/platform/admin/team/me/recover-protected-owner-identity", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.profile.self", deps.repository, deps.platformOperatorAuth);
      const existing = await deps.repository.getPlatformUserByAuthUid(actor.uid);
      if (!existing) throw new RailError("An internal platform profile is required.", { provider: "platform", op: "protectedOwnerRecovery", status: 404 });
      const timestamp = new Date().toISOString();
      const user = await deps.repository.recoverProtectedOwnerIdentity({
        userId: existing.id,
        actorUid: actor.uid,
        now: timestamp,
        audit: newPlatformUserAudit(existing.id, "platform_user.protected_owner_identity_recovered", actor.uid, "Controlled maintenance restored the protected Owner legal name.", timestamp)
      });
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_user.profile_or_permission_changed", actor.uid, "Controlled protected Owner identity maintenance completed.", user.authUid, timestamp));
      res.json({ ok: true, user });
    } catch (error) { sendRouteError(res, error); }
  });

  app.get("/api/platform/admin/team/:userId", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.team.view", deps.repository, deps.platformOperatorAuth);
      const userId = req.params.userId; if (!userId) throw new RailError("Platform user id is required.", { provider: "platform", op: "platformTeamRead", status: 400 });
      const user = await deps.repository.getPlatformUser(userId);
      if (!user) throw new RailError("Platform user was not found.", { provider: "platform", op: "platformTeamRead", status: 404 });
      // Contact and address data are only returned to the subject or a manager.
      if (user.authUid !== actor.uid && !actor.capabilities.includes("platform.team.manage")) return res.json({ ok: true, user: platformUserSummary(user) });
      res.json({ ok: true, user });
    } catch (error) { sendRouteError(res, error); }
  });

  app.post("/api/platform/admin/team", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.team.manage", deps.repository, deps.platformOperatorAuth);
      const input = platformUserInputSchema.parse(req.body ?? {});
      if (input.role === "Owner" && !actor.capabilities.includes("platform.ownership.manage")) throw new RailError("Only an Owner can assign platform ownership.", { provider: "platform", op: "platformTeamCreate", status: 403 });
      const existing = await deps.repository.getPlatformUserByAuthUid(input.authUid);
      if (existing) throw new RailError("A platform profile already exists for that signed-in identity.", { provider: "platform", op: "platformTeamCreate", status: 409 });
      const timestamp = new Date().toISOString();
      const user = await deps.repository.savePlatformUser({ ...input, id: `platform_user_${randomUUID()}`, accountStatus: "ACTIVE", createdAt: timestamp, updatedAt: timestamp, createdBy: actor.uid, updatedBy: actor.uid } as PlatformUser);
      await deps.repository.appendPlatformUserAudit(newPlatformUserAudit(user.id, "platform_user.added", actor.uid, "Profile record added; no Firebase identity, invitation, or email was created.", timestamp));
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_user.profile_or_permission_changed", actor.uid, "Platform profile or permission record added.", user.authUid, timestamp));
      res.status(201).json({ ok: true, user });
    } catch (error) { sendRouteError(res, error); }
  });

  app.patch("/api/platform/admin/team/:userId", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.team.manage", deps.repository, deps.platformOperatorAuth);
      const userId = req.params.userId; if (!userId) throw new RailError("Platform user id is required.", { provider: "platform", op: "platformTeamUpdate", status: 400 });
      const existing = await deps.repository.getPlatformUser(userId);
      if (!existing) throw new RailError("Platform user was not found.", { provider: "platform", op: "platformTeamUpdate", status: 404 });
      const patch = platformUserPatchSchema.parse(req.body ?? {});
      assertOwnerIdentityIsImmutable(existing, patch);
      if (existing.role === "Owner" || patch.role === "Owner") throw new RailError("Platform ownership can only change through the controlled ownership-transfer action.", { provider: "platform", op: "platformTeamUpdate", status: 403 });
      const timestamp = new Date().toISOString();
      const user = await deps.repository.savePlatformUser({ ...existing, ...patch, updatedAt: timestamp, updatedBy: actor.uid } as PlatformUser);
      await deps.repository.appendPlatformUserAudit(newPlatformUserAudit(user.id, "platform_user.updated", actor.uid, "Profile metadata updated.", timestamp));
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_user.profile_or_permission_changed", actor.uid, "Platform profile or permission record updated.", user.authUid, timestamp));
      res.json({ ok: true, user });
    } catch (error) { sendRouteError(res, error); }
  });

  for (const [verb, accountStatus, action] of [["disable", "DISABLED", "platform_user.disabled"], ["reactivate", "ACTIVE", "platform_user.reactivated"]] as const) {
    app.post(`/api/platform/admin/team/:userId/${verb}`, async (req: Request, res: Response) => {
      try {
        const actor = await requirePlatformTeamCapability(req, env, "platform.team.manage", deps.repository, deps.platformOperatorAuth);
        const userId = req.params.userId; if (!userId) throw new RailError("Platform user id is required.", { provider: "platform", op: "platformTeamStatus", status: 400 });
        const existing = await deps.repository.getPlatformUser(userId);
        if (!existing) throw new RailError("Platform user was not found.", { provider: "platform", op: "platformTeamStatus", status: 404 });
        if (existing.role === "Owner" && !actor.capabilities.includes("platform.ownership.manage")) throw new RailError("Only an Owner can change an Owner account.", { provider: "platform", op: "platformTeamStatus", status: 403 });
        const timestamp = new Date().toISOString();
        const user = await deps.repository.savePlatformUser({ ...existing, accountStatus, updatedAt: timestamp, updatedBy: actor.uid });
        await deps.repository.appendPlatformUserAudit(newPlatformUserAudit(user.id, action, actor.uid, `Account marked ${accountStatus}.`, timestamp));
        await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_user.profile_or_permission_changed", actor.uid, `Platform account marked ${accountStatus}.`, user.authUid, timestamp));
        res.json({ ok: true, user });
      } catch (error) { sendRouteError(res, error); }
    });
  }

  app.get("/api/platform/admin/team/:userId/audit", async (req: Request, res: Response) => {
    try {
      await requirePlatformTeamCapability(req, env, "platform.team.manage", deps.repository, deps.platformOperatorAuth);
      const userId = req.params.userId; if (!userId) throw new RailError("Platform user id is required.", { provider: "platform", op: "platformTeamAudit", status: 400 });
      res.json({ ok: true, audits: await deps.repository.listPlatformUserAudits(userId) });
    } catch (error) { sendRouteError(res, error); }
  });

  app.post("/api/platform/admin/team/:userId/transfer-ownership", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.ownership.manage", deps.repository, deps.platformOperatorAuth);
      const fromUserId = req.params.userId;
      if (!fromUserId) throw new RailError("Platform user id is required.", { provider: "platform", op: "platformOwnershipTransfer", status: 400 });
      const from = await deps.repository.getPlatformUser(fromUserId);
      const input = ownershipTransferSchema.parse(req.body ?? {});
      const to = await deps.repository.getPlatformUser(input.toUserId);
      if (!from || !to) throw new RailError("Platform user was not found.", { provider: "platform", op: "platformOwnershipTransfer", status: 404 });
      if (from.role !== "Owner" || to.accountStatus !== "ACTIVE") throw new RailError("Ownership can only be transferred from an Owner to an active platform user.", { provider: "platform", op: "platformOwnershipTransfer", status: 409 });
      const timestamp = new Date().toISOString();
      await deps.repository.savePlatformUser({ ...from, role: "Super Admin", updatedAt: timestamp, updatedBy: actor.uid });
      const owner = await deps.repository.savePlatformUser({ ...to, role: "Owner", updatedAt: timestamp, updatedBy: actor.uid });
      await deps.repository.appendPlatformUserAudit(newPlatformUserAudit(from.id, "platform_user.ownership_transferred", actor.uid, `Ownership transferred to ${to.id}.`, timestamp));
      await deps.repository.appendPlatformUserAudit(newPlatformUserAudit(to.id, "platform_user.ownership_transferred", actor.uid, `Ownership transferred from ${from.id}.`, timestamp));
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_user.profile_or_permission_changed", actor.uid, "Platform ownership permissions changed.", to.authUid, timestamp));
      res.json({ ok: true, user: owner });
    } catch (error) { sendRouteError(res, error); }
  });

  // This is deliberately platform-operator guarded rather than tenant-role guarded.
  // Tenant ownership is never enough to enter the NexTeam Admin surface.
  app.get("/api/platform/admin/summary", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
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

  // NexCommand is the only ownership authority. Tenant claims and tenant-local
  // roles are deliberately not consulted by these routes.
  app.get("/api/platform/admin/tenants/:tenantId/members", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.tenants.view", deps.repository, deps.platformOperatorAuth);
      const tenantId = requiredTenantId(req.params.tenantId);
      const tenant = await deps.repository.getTenant(tenantId);
      if (!tenant) throw new RailError("Tenant was not found.", { provider: "platform", op: "nexCommandTenantMembers", status: 404 });
      const users = await deps.repository.listTenantUsers(tenantId);
      const owners = users.filter((member) => member.role === "OWNER" && member.active);
      if (owners.length > 1) throw new RailError("Tenant ownership is inconsistent and cannot be managed until repaired.", { provider: "platform", op: "nexCommandTenantMembers", status: 409 });
      // Firebase UIDs are not needed by the management UI. Reading membership
      // identity is platform-authorized activity and is retained in the audit log.
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_user.profile_or_permission_changed", actor.uid, `NexCommand viewed tenant ${tenantId} membership authority.`, undefined, new Date().toISOString()));
      res.json({ ok: true, tenantId, currentOwner: owners[0] ?? null, users: users.map((member) => ({ id: member.id, email: member.email ?? null, displayName: member.displayName, role: member.role, active: member.active, effectiveCapabilities: customClaimsForTenantUser(member).tenantCapabilities })) });
    } catch (error) { sendRouteError(res, error); }
  });

  app.get("/api/platform/admin/tenants/:tenantId/profile", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.tenants.view", deps.repository, deps.platformOperatorAuth);
      const tenantId = requiredTenantId(req.params.tenantId);
      const tenant = await deps.repository.getTenant(tenantId);
      if (!tenant) throw new RailError("Tenant was not found.", { provider: "platform", op: "nexCommandTenantProfile", status: 404 });
      const [profile, branding, subscription, users] = await Promise.all([deps.repository.getTenantProfile(tenantId), deps.repository.getTenantBranding(tenantId), deps.repository.getSubscription(tenantId), deps.repository.listTenantUsers(tenantId)]);
      const tenantNumber = await systemTenantNumber(deps.repository, tenantId, profile);
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_user.profile_or_permission_changed", actor.uid, `NexCommand viewed tenant ${tenantId} profile.`, undefined, new Date().toISOString()));
      res.json({ ok: true, tenant, profile: { ...(profile ?? { tenantId }), tenantNumber }, branding, subscription, access: users.map((user) => ({ displayName: user.displayName, email: user.email ?? null, role: user.role, active: user.active, firebaseUidBound: Boolean(user.authUid) })) });
    } catch (error) { sendRouteError(res, error); }
  });

  app.get("/api/platform/admin/address-suggestions", async (req: Request, res: Response) => {
    try {
      await requirePlatformTeamCapability(req, env, "platform.tenants.view", deps.repository, deps.platformOperatorAuth);
      const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
      if (query.length < 3) return res.json({ ok: true, suggestions: [] });
      const apiKey = env.GOOGLE_MAPS_API_KEY?.trim();
      if (!apiKey) throw new RailError("Google address suggestions are not configured.", { provider: "platform", op: "platformAddressSuggestions", status: 503 });
      res.json({ ok: true, suggestions: await fetchAddressSuggestions(query, apiKey) });
    } catch (error) { sendRouteError(res, error); }
  });

  app.post("/api/platform/admin/tenants/:tenantId/logo", express.raw({ type: [...profilePhotoContentTypes], limit: PROFILE_PHOTO_MAX_BYTES }), async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.tenants.manage", deps.repository, deps.platformOperatorAuth);
      const tenantId = requiredTenantId(req.params.tenantId);
      if (!await deps.repository.getTenant(tenantId)) throw new RailError("Tenant was not found.", { provider: "platform", op: "tenantLogoUpload", status: 404 });
      if (!deps.storage) throw new RailError("Firebase Storage is not configured for tenant logos.", { provider: "firebase", op: "tenantLogoUpload", status: 503 });
      const image = profilePhotoType(req.header("content-type"), req.body);
      const storageRef = await deps.storage.writeImage(`tenant-branding/${encodeURIComponent(tenantId)}/logo.${image.extension}`, req.body as Buffer, image.contentType);
      const now = new Date().toISOString();
      const tenant = await deps.repository.getTenant(tenantId);
      if (!tenant) throw new RailError("Tenant was not found.", { provider: "platform", op: "tenantLogoUpload", status: 404 });
      await deps.repository.saveTenantBranding({ ...(await deps.repository.getTenantBranding(tenantId) ?? defaultTenantBranding(tenant)), tenantId, displayName: tenant.name, logo: { storageRef, mimeType: image.contentType, alt: tenant.name, updatedAt: now }, source: "manual", updatedAt: now, updatedBy: actor.uid });
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_user.profile_or_permission_changed", actor.uid, `NexCommand uploaded a logo for tenant ${tenantId}.`, undefined, now));
      res.status(201).json({ ok: true, logoUrl: `/api/public/tenant-branding/logo?tenantId=${encodeURIComponent(tenantId)}` });
    } catch (error) { sendRouteError(res, error); }
  });

  app.patch("/api/platform/admin/tenants/:tenantId/profile", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.tenants.manage", deps.repository, deps.platformOperatorAuth);
      const tenantId = requiredTenantId(req.params.tenantId);
      const current = await deps.repository.getTenant(tenantId);
      if (!current) throw new RailError("Tenant was not found.", { provider: "platform", op: "nexCommandTenantProfile", status: 404 });
      const input = tenantProfileSchema.parse(req.body ?? {});
      const now = new Date().toISOString();
      const existingProfile = await deps.repository.getTenantProfile(tenantId);
      const tenantNumber = await systemTenantNumber(deps.repository, tenantId, existingProfile);
      const profile: TenantProfile = { tenantId, tenantNumber, legalName: input.legalName, dbaName: input.dbaName, website: input.website, status: input.subscriptionPlan === "none" ? "INACTIVE" : input.status, subscriptionPlan: input.subscriptionPlan, primaryContact: input.primaryContact, updatedAt: now, updatedBy: actor.uid };
      await assertTenantEmailExclusive(deps.repository, tenantId, primaryContactEmail(profile));
      const tenant = await deps.repository.upsertTenant({ ...current, name: input.tenant.name, timezone: input.tenant.timezone, lifecycleState: input.tenant.lifecycleState, lifecycleUpdatedAt: now });
      const [savedProfile, branding] = await Promise.all([
        deps.repository.saveTenantProfile(profile),
        (async () => { const existingBranding = await deps.repository.getTenantBranding(tenantId); return deps.repository.saveTenantBranding({ ...(existingBranding ?? defaultTenantBranding(tenant)), tenantId, displayName: tenant.name, logo: existingBranding?.logo, source: "manual", updatedAt: now, updatedBy: actor.uid }); })()
      ]);
      await provisionPrimaryContactOwner({ repository: deps.repository, tenantId, profile: savedProfile, actorId: actor.uid, now });
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_user.profile_or_permission_changed", actor.uid, `NexCommand updated tenant ${tenantId} profile fields and synchronized its sole Primary Contact owner.`, undefined, now));
      res.json({ ok: true, tenant, profile: savedProfile, branding });
    } catch (error) { sendRouteError(res, error); }
  });

  app.post("/api/platform/admin/tenants/:tenantId/onboarding-email", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.tenants.manage", deps.repository, deps.platformOperatorAuth);
      const tenantId = requiredTenantId(req.params.tenantId);
      const tenant = await deps.repository.getTenant(tenantId);
      const profile = await deps.repository.getTenantProfile(tenantId);
      if (!tenant || !profile) throw new RailError("Save the tenant profile with a Primary Contact before sending onboarding.", { provider: "platform", op: "sendTenantOnboarding", status: 409 });
      const email = primaryContactEmail(profile);
      await assertTenantEmailExclusive(deps.repository, tenantId, email);
      const now = new Date().toISOString();
      await provisionPrimaryContactOwner({ repository: deps.repository, tenantId, profile, actorId: actor.uid, now });
      const owner = (await deps.repository.listTenantUsers(tenantId)).find((member) => member.role === "OWNER" && member.active && member.email?.trim().toLowerCase() === email);
      if (!owner) throw new RailError("The Primary Contact could not be established as the active tenant owner.", { provider: "platform", op: "sendTenantOnboarding", status: 409 });
      const auth = deps.firebaseOwnerActivation ?? getAdminAuth(env);
      if (!auth || !deps.ownerInviteSender) throw new RailError("Tenant onboarding email delivery is not configured.", { provider: "gmail", op: "sendTenantOnboarding", status: 503 });
      const firebaseOwner = await getOrCreateFirebaseOwner(auth, { email, displayName: owner.displayName });
      const boundOwner = await upsertTenantUser(deps.repository, { tenantId, id: owner.id, authUid: firebaseOwner.user.uid, email, phones: owner.phones, displayName: owner.displayName, role: "OWNER", active: true, now });
      await auth.setCustomUserClaims(firebaseOwner.user.uid, mergeTenantOwnerClaims(firebaseOwner.user.customClaims, boundOwner));
      const existing = await deps.repository.getTenantOwnerInvite(tenantId, boundOwner.id);
      let invite = newOwnerInvite({ tenantId, ownerUserId: boundOwner.id, ownerEmail: email, status: "NOT_SENT", attemptCount: existing?.attemptCount ?? 0, now });
      try {
        const receipt = await deps.ownerInviteSender.send({ tenantId, ownerEmail: email, ownerName: boundOwner.displayName, tenantName: tenant.name });
        invite = { ...invite, status: "SENT_TO_PROVIDER", attemptCount: invite.attemptCount + 1, provider: receipt.provider, providerMessageId: receipt.messageId, updatedAt: now };
        await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("tenant_owner_invite.sent", actor.uid, `Tenant onboarding email accepted by ${receipt.provider} for ${tenantId}.`, firebaseOwner.user.uid, now));
      } catch (error) {
        invite = { ...invite, status: "FAILED", attemptCount: invite.attemptCount + 1, lastError: error instanceof Error ? error.message : "Tenant onboarding email failed.", updatedAt: now };
        await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("tenant_owner_invite.failed", actor.uid, `Tenant onboarding email was not accepted for ${tenantId}.`, firebaseOwner.user.uid, now));
      }
      await deps.repository.saveTenantOwnerInvite(invite);
      if (invite.status !== "SENT_TO_PROVIDER") throw new RailError("The onboarding email provider did not accept this request.", { provider: "gmail", op: "sendTenantOnboarding", status: 502 });
      res.status(201).json({ ok: true, tenant: { id: tenant.id, name: tenant.name }, owner: { id: boundOwner.id, email }, invite: { status: invite.status, provider: invite.provider, messageId: invite.providerMessageId, attemptCount: invite.attemptCount } });
    } catch (error) { sendRouteError(res, error); }
  });

  app.post("/api/platform/admin/tenants/:tenantId/owner", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformTeamCapability(req, env, "platform.tenants.manage", deps.repository, deps.platformOperatorAuth);
      const tenantId = requiredTenantId(req.params.tenantId);
      if (!await deps.repository.getTenant(tenantId)) throw new RailError("Tenant was not found.", { provider: "platform", op: "nexCommandTenantOwner", status: 404 });
      const input = tenantOwnerAssignmentSchema.parse(req.body ?? {});
      const selected = await deps.repository.getTenantUser(tenantId, input.toUserId);
      if (!selected) throw new RailError("Selected owner must already be a tenant member.", { provider: "platform", op: "nexCommandTenantOwner", status: 404 });
      if (!selected.active) throw new RailError("Selected owner must be active.", { provider: "platform", op: "nexCommandTenantOwner", status: 409 });
      const now = new Date().toISOString();
      const result = await deps.repository.assignTenantOwner({
        tenantId,
        toUserId: selected.id,
        actorId: actor.uid,
        now,
        audit: { id: `membership_audit_${randomUUID()}`, tenantId, action: "member.owner_assigned", actorId: actor.uid, targetUserId: selected.id, detail: "NexCommand owner assignment; existing active owner was atomically demoted to OFFICE_ADMIN when present.", createdAt: now }
      });
      await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("platform_user.profile_or_permission_changed", actor.uid, `NexCommand assigned tenant ${tenantId} owner to existing member ${selected.id}.`, selected.authUid, now));
      res.json({ ok: true, tenantId, owner: { id: result.owner.id, email: result.owner.email ?? null, displayName: result.owner.displayName, role: result.owner.role, active: result.owner.active, effectiveCapabilities: customClaimsForTenantUser(result.owner).tenantCapabilities }, previousOwnerId: result.previousOwner?.id ?? null });
    } catch (error) { sendRouteError(res, error); }
  });

  app.get("/api/platform/admin/live-build-status", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      res.json({ ok: true, ...(await readLiveBuildStatus(env)) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/admin/providers/stripe", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const key = env.STRIPE_SECRET_KEY?.trim() ?? "";
      const staging = (env.RAILWAY_ENVIRONMENT ?? "").toLowerCase() === "staging" || (env.NODE_ENV ?? "").toLowerCase() !== "production";
      const testMode = key.startsWith("sk_test_");
      res.json({ ok: true, provider: "Stripe", environment: staging ? "Test Mode" : "Live Mode", credentialStatus: key ? (staging && !testMode ? "INVALID_FOR_STAGING" : "CONFIGURED") : "NOT_CONFIGURED", billingRailStatus: key && (!staging || testMode) ? "READY" : "NOT_READY", lastVerification: new Date().toISOString(), liveChargesAllowed: !staging && key.startsWith("sk_live_") });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/admin/providers/gmail/staging-owner-invitation", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      res.json({ ok: true, ...stagingOwnerInvitationGmailProviderStatus(env) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/admin/prospects", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      res.json({ ok: true, prospects: await deps.repository.listProspects() });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  /** Read model for NexCommand lifecycle pages.  These are projections of the
   * existing authoritative records; they never create another intake or tenant. */
  app.get("/api/platform/admin/lifecycle", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const [prospects, tenantOnboardingBlueprints, tenants, migrations, blockers] = await Promise.all([
        deps.repository.listProspects(),
        deps.repository.listTenantOnboardingBlueprints(),
        deps.repository.listTenants(),
        deps.repository.listTenantMigrationRecords(),
        deps.repository.listTenantBlockers()
      ]);
      const prospectById = new Map(prospects.map((prospect) => [prospect.id, prospect]));
      const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
      const assignments = await Promise.all(prospects.map(async (prospect) => [prospect.id, await deps.repository.getPlatformSubscriptionAssignment(prospect.id)] as const));
      const assignmentByProspectId = new Map(assignments);
      const records = await Promise.all(tenantOnboardingBlueprints.map(async (tenantOnboardingBlueprint) => {
        const prospect = prospectById.get(tenantOnboardingBlueprint.prospectId) ?? null;
        const assignment = assignmentByProspectId.get(tenantOnboardingBlueprint.prospectId) ?? null;
        const tenant = assignment?.tenantId ? tenantById.get(assignment.tenantId) ?? null : null;
        const owners = tenant ? await deps.repository.listTenantUsers(tenant.id) : [];
        const owner = owners.find((member) => member.role === "OWNER") ?? null;
        const storedInvite = tenant && owner ? await deps.repository.getTenantOwnerInvite(tenant.id, owner.id) : null;
        // Lifecycle visibility is an operator read model, never an email/error
        // diagnostic surface.  In particular, do not project reset links or
        // provider failure detail into NexCommand.
        const invite = storedInvite ? {
          status: storedInvite.status,
          attemptCount: storedInvite.attemptCount,
          ...(storedInvite.provider ? { provider: storedInvite.provider } : {})
        } : null;
        const revisions = await deps.repository.listTenantOnboardingBlueprintRevisions(tenantOnboardingBlueprint.id);
        const tenantMigrations = tenant ? migrations.filter((migration) => migration.tenantId === tenant.id) : [];
        const tenantBlockers = tenant ? blockers.filter((blocker) => blocker.tenantId === tenant.id && blocker.status !== "RESOLVED") : [];
        return { tenantOnboardingBlueprint, prospect, assignment, tenant, owner, invite, revisions, migrations: tenantMigrations, blockers: tenantBlockers };
      }));
      const subscriptionAssignments = records.filter((record) => record.assignment).map((record) => ({
        tenant: record.tenant,
        tenantId: record.tenant?.id ?? record.assignment?.tenantId ?? null,
        owner: record.owner,
        assignment: record.assignment,
        tenantOnboardingBlueprint: record.tenantOnboardingBlueprint,
        invite: record.invite,
        modules: record.assignment?.packageId === "all-access-test" ? activeSubscriptionPackages()[0]?.includedModules ?? [] : []
      }));
      res.json({ ok: true, tenantOnboardingBlueprints: records, subscriptions: subscriptionAssignments, onboarding: records });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/admin/tenant-blockers", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim() ? requiredTenantId(req.query.tenantId) : undefined;
      const [blockers, escalations] = await Promise.all([
        deps.repository.listTenantBlockers(tenantId),
        deps.repository.listPlatformSupportEscalations(tenantId)
      ]);
      res.json({ ok: true, blockers, escalations });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/admin/migrations", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim() ? requiredTenantId(req.query.tenantId) : undefined;
      const migrations = await deps.repository.listTenantMigrationRecords(tenantId);
      const tenants = await deps.repository.listTenants();
      const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
      res.json({ ok: true, migrations: migrations.map((migration) => ({ ...migration, tenant: tenantById.get(migration.tenantId) ?? null })) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/tenants/:tenantId/migrations", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const tenantId = requiredTenantId(req.params.tenantId);
      const input = z.object({
        sourceSystem: z.string().trim().min(1).max(120),
        scope: z.string().trim().min(1).max(4000),
        classification: z.enum(["INCLUDED_BASIC", "PAID_COMPLEX", "NEEDS_REVIEW"]).default("NEEDS_REVIEW"),
        status: z.enum(["PENDING", "DEFERRED"]).default("PENDING"),
        expectedRecords: z.number().int().min(0).optional(),
        importedRecords: z.number().int().min(0).optional(),
        rejectedRecords: z.number().int().min(0).optional(),
        conflictOrDuplicateRecords: z.number().int().min(0).optional(),
        launchImpact: z.enum(["NONE", "WATCH", "BLOCKING"]).default("WATCH"),
        deferredReason: z.string().trim().min(1).max(2000).optional(),
        deferredUntil: z.string().min(1).optional()
      }).strict().parse(req.body ?? {});
      if (input.status === "DEFERRED" && !input.deferredReason) throw new RailError("Deferred migrations require a safe deferral reason.", { provider: "platform", op: "tenantMigration", status: 400 });
      if (input.status !== "DEFERRED" && (input.deferredReason || input.deferredUntil)) throw new RailError("Deferral details are allowed only while a migration is deferred.", { provider: "platform", op: "tenantMigration", status: 400 });
      const timestamp = new Date().toISOString();
      const migration = await deps.repository.saveTenantMigrationRecord({
        id: `tenant_migration_${randomUUID()}`,
        tenantId,
        ...input,
        createdAt: timestamp,
        createdBy: "platform_operator",
        updatedAt: timestamp,
        updatedBy: "platform_operator"
      });
      res.status(201).json({ ok: true, migration });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/platform/admin/migrations/:migrationId", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const migrationId = requiredTenantId(req.params.migrationId);
      const input = z.object({
        status: z.enum(["PENDING", "IN_PROGRESS", "VALIDATION", "DEFERRED", "COMPLETED"]),
        classification: z.enum(["INCLUDED_BASIC", "PAID_COMPLEX", "NEEDS_REVIEW"]).optional(),
        expectedRecords: z.number().int().min(0).optional(),
        importedRecords: z.number().int().min(0).optional(),
        rejectedRecords: z.number().int().min(0).optional(),
        conflictOrDuplicateRecords: z.number().int().min(0).optional(),
        launchImpact: z.enum(["NONE", "WATCH", "BLOCKING"]).optional(),
        deferredReason: z.string().trim().min(1).max(2000).optional(),
        deferredUntil: z.string().min(1).optional()
      }).strict().parse(req.body ?? {});
      const migration = await deps.repository.getTenantMigrationRecord(migrationId);
      if (!migration) throw new RailError("Tenant migration record was not found.", { provider: "platform", op: "tenantMigration", status: 404 });
      if (input.status === "DEFERRED" && !input.deferredReason) throw new RailError("Deferred migrations require a safe deferral reason.", { provider: "platform", op: "tenantMigration", status: 400 });
      if (input.status !== "DEFERRED" && (input.deferredReason || input.deferredUntil)) throw new RailError("Deferral details are allowed only while a migration is deferred.", { provider: "platform", op: "tenantMigration", status: 400 });
      const timestamp = new Date().toISOString();
      const updated = await deps.repository.saveTenantMigrationRecord({
        ...migration,
        status: input.status,
        classification: input.classification ?? migration.classification,
        expectedRecords: input.expectedRecords ?? migration.expectedRecords,
        importedRecords: input.importedRecords ?? migration.importedRecords,
        rejectedRecords: input.rejectedRecords ?? migration.rejectedRecords,
        conflictOrDuplicateRecords: input.conflictOrDuplicateRecords ?? migration.conflictOrDuplicateRecords,
        launchImpact: input.launchImpact ?? migration.launchImpact,
        deferredReason: input.status === "DEFERRED" ? input.deferredReason : undefined,
        deferredUntil: input.status === "DEFERRED" ? input.deferredUntil : undefined,
        completedAt: input.status === "COMPLETED" ? timestamp : undefined,
        updatedAt: timestamp,
        updatedBy: "platform_operator"
      });
      res.json({ ok: true, migration: updated });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/tenants/:tenantId/blockers", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const tenantId = requiredTenantId(req.params.tenantId);
      const input = z.object({
        title: z.string().trim().min(1).max(180),
        detail: z.string().trim().min(1).max(4000),
        category: z.enum(["CONFIGURATION", "DATA_MIGRATION", "INTEGRATION", "TRAINING", "BILLING", "OTHER"]),
        severity: z.enum(["BLOCKING", "HIGH", "NORMAL"])
      }).strict().parse(req.body ?? {});
      const timestamp = new Date().toISOString();
      const blocker = await deps.repository.saveTenantBlocker({
        id: `tenant_blocker_${randomUUID()}`,
        tenantId,
        ...input,
        status: "OPEN",
        createdAt: timestamp,
        createdBy: "platform_operator",
        updatedAt: timestamp
      });
      res.status(201).json({ ok: true, blocker });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/platform/admin/tenant-blockers/:blockerId", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const blockerId = requiredTenantId(req.params.blockerId);
      const input = z.object({ status: z.enum(["OPEN", "ESCALATED", "RESOLVED"]) }).strict().parse(req.body ?? {});
      const blocker = await deps.repository.getTenantBlocker(blockerId);
      if (!blocker) throw new RailError("Tenant blocker was not found.", { provider: "platform", op: "tenantBlocker", status: 404 });
      const timestamp = new Date().toISOString();
      const updated = await deps.repository.saveTenantBlocker({
        ...blocker,
        status: input.status,
        updatedAt: timestamp,
        ...(input.status === "RESOLVED" ? { resolvedAt: timestamp, resolvedBy: "platform_operator" } : { resolvedAt: undefined, resolvedBy: undefined })
      });
      res.json({ ok: true, blocker: updated });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/tenant-blockers/:blockerId/escalations", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const blockerId = requiredTenantId(req.params.blockerId);
      const input = z.object({ summary: z.string().trim().min(1).max(4000), priority: z.enum(["P1", "P2", "P3"]) }).strict().parse(req.body ?? {});
      const blocker = await deps.repository.getTenantBlocker(blockerId);
      if (!blocker) throw new RailError("Tenant blocker was not found.", { provider: "platform", op: "supportEscalation", status: 404 });
      if (blocker.status === "RESOLVED") throw new RailError("Resolved blockers cannot be escalated.", { provider: "platform", op: "supportEscalation", status: 409 });
      const timestamp = new Date().toISOString();
      const escalation = await deps.repository.savePlatformSupportEscalation({
        id: `support_escalation_${randomUUID()}`,
        tenantId: blocker.tenantId,
        blockerId: blocker.id,
        ...input,
        status: "OPEN",
        createdAt: timestamp,
        createdBy: "platform_operator",
        updatedAt: timestamp
      });
      const updatedBlocker = await deps.repository.saveTenantBlocker({ ...blocker, status: "ESCALATED", updatedAt: timestamp });
      res.status(201).json({ ok: true, blocker: updatedBlocker, escalation });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/platform/admin/support-escalations/:escalationId", async (req: Request, res: Response) => {
    try {
      await requirePlatformSupportOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const escalationId = requiredTenantId(req.params.escalationId);
      const input = z.object({ status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]) }).strict().parse(req.body ?? {});
      const escalation = await deps.repository.getPlatformSupportEscalation(escalationId);
      if (!escalation) throw new RailError("Support escalation was not found.", { provider: "platform", op: "supportEscalation", status: 404 });
      const timestamp = new Date().toISOString();
      const updated = await deps.repository.savePlatformSupportEscalation({
        ...escalation,
        status: input.status,
        updatedAt: timestamp,
        ...(input.status === "RESOLVED" ? { resolvedAt: timestamp, resolvedBy: "platform_operator" } : { resolvedAt: undefined, resolvedBy: undefined })
      });
      res.json({ ok: true, escalation: updated });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/prospects", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const input = prospectBodySchema.parse(req.body ?? {});
      const timestamp = new Date().toISOString();
      const prospect = await deps.repository.saveProspect({
        id: `prospect_${randomUUID()}`,
        status: "DRAFT",
        ...input,
        onboardingCurrentStep: "Prospect Intake",
        onboardingProgressPercent: 10,
        onboardingLastSavedAt: timestamp,
        onboardingLastUpdatedBy: "platform_operator",
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
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
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
        createdBy: "platform_operator",
        lastSavedAt: timestamp,
        lastUpdatedBy: "platform_operator"
      });
      const nextProspect = await deps.repository.saveProspect({ ...prospect, status: "INTAKE_COMPLETE", onboardingCurrentStep: "Onboarding plan", onboardingProgressPercent: 30, onboardingLastSavedAt: timestamp, onboardingLastUpdatedBy: "platform_operator", updatedAt: timestamp });
      res.json({ ok: true, prospect: nextProspect, intake });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/prospects/:prospectId/blueprints", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
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
      const nextProspect = await deps.repository.saveProspect({ ...prospect, status: "BLUEPRINT_READY", onboardingCurrentStep: "Subscription", onboardingProgressPercent: 50, onboardingLastSavedAt: timestamp, onboardingLastUpdatedBy: "platform_operator", updatedAt: timestamp });
      res.status(201).json({ ok: true, prospect: nextProspect, onboardingPlan, revision });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/admin/prospects/:prospectId/blueprints/:blueprintId/revisions", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const prospectId = requiredTenantId(req.params.prospectId);
      const blueprintId = requiredTenantId(req.params.blueprintId);
      const onboardingPlan = await deps.repository.getTenantOnboardingBlueprint(blueprintId);
      if (!onboardingPlan || onboardingPlan.prospectId !== prospectId) throw new RailError("Onboarding plan was not found.", { provider: "platform", op: "onboardingPlanRevisionList", status: 404 });
      res.json({ ok: true, revisions: await deps.repository.listTenantOnboardingBlueprintRevisions(blueprintId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/admin/prospects/:prospectId/blueprints/:blueprintId/insights", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const prospectId = requiredTenantId(req.params.prospectId);
      const blueprintId = requiredTenantId(req.params.blueprintId);
      const onboardingPlan = await deps.repository.getTenantOnboardingBlueprint(blueprintId);
      if (!onboardingPlan || onboardingPlan.prospectId !== prospectId) throw new RailError("Onboarding plan was not found.", { provider: "platform", op: "onboardingPlanInsights", status: 404 });
      const revisions = await deps.repository.listTenantOnboardingBlueprintRevisions(blueprintId);
      const latest = revisions.at(-1);
      if (!latest) throw new RailError("Onboarding plan has no immutable revision.", { provider: "platform", op: "onboardingPlanInsights", status: 409 });
      const intake = await deps.repository.getProspectIntake(prospectId);
      res.json({ ok: true, insight: buildOnboardingPlanInsights(onboardingPlan, latest, intake) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/prospects/:prospectId/blueprints/:blueprintId/revisions/:revisionId/accept", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const prospectId = requiredTenantId(req.params.prospectId);
      const blueprintId = requiredTenantId(req.params.blueprintId);
      const revisionId = requiredTenantId(req.params.revisionId);
      const input = revisionAcceptanceBodySchema.parse(req.body ?? {});
      const onboardingPlan = await deps.repository.getTenantOnboardingBlueprint(blueprintId);
      if (!onboardingPlan || onboardingPlan.prospectId !== prospectId) throw new RailError("Onboarding plan was not found.", { provider: "platform", op: "onboardingPlanRevisionAccept", status: 404 });
      const revisions = await deps.repository.listTenantOnboardingBlueprintRevisions(blueprintId);
      const candidate = revisions.find((revision) => revision.id === revisionId);
      const latest = revisions.at(-1);
      if (!candidate) throw new RailError("Onboarding plan revision was not found.", { provider: "platform", op: "onboardingPlanRevisionAccept", status: 404 });
      if (candidate.approvalState !== "DRAFT" || latest?.id !== candidate.id) {
        throw new RailError("Only the latest draft onboarding-plan revision can be accepted.", { provider: "platform", op: "onboardingPlanRevisionAccept", status: 409 });
      }
      const timestamp = new Date().toISOString();
      const acceptance = await deps.repository.appendTenantOnboardingBlueprintRevision({
        id: `onboarding_blueprint_revision_${randomUUID()}`,
        prospectId,
        blueprintId,
        previousRevisionId: candidate.id,
        revisionNumber: candidate.revisionNumber + 1,
        snapshot: candidate.snapshot,
        actorId: "platform_operator",
        actorType: "NEXTEAM_STAFF",
        source: "NEXTEAM_STAFF",
        fieldsChanged: ["approvalState"],
        reason: input.reason,
        approvalState: "APPROVED",
        createdAt: timestamp
      });
      res.status(201).json({ ok: true, acceptance });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/admin/subscription-packages", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
      res.json({ ok: true, packages: activeSubscriptionPackages() });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/prospects/:prospectId/subscription", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
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

  app.post("/api/platform/admin/prospects/:prospectId/activate", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const prospectId = requiredTenantId(req.params.prospectId);
      const input = z.object({
        tenantId: z.string().trim().min(3).max(100).regex(/^[a-z0-9-]+$/, "Tenant id must use lowercase letters, numbers, and hyphens.").optional(),
        ownerEmail: z.string().email(),
        ownerDisplayName: z.string().trim().min(1).max(120)
      }).strict().parse(req.body ?? {});
      const auth = deps.firebaseOwnerActivation ?? getAdminAuth(env);
      if (!auth) throw new RailError("Firebase owner activation is not configured.", { provider: "firebase", op: "activateTenant", status: 503 });
      const activated = await activateProspectTenant(deps.repository, auth, { prospectId, ...input }, deps.ownerInviteSender ?? null);
      res.status(201).json({
        ok: true,
        tenant: { id: activated.tenant.id, name: activated.tenant.name },
        owner: { id: activated.owner.id, uid: activated.owner.authUid, email: activated.owner.email, role: activated.owner.role },
        ownerCreated: activated.ownerCreated,
        subscriptionId: activated.subscriptionId,
        passwordSet: false,
        passwordSetupLinkDelivered: activated.invite.status === "SENT_TO_PROVIDER",
        activationAlreadyExisted: activated.activationAlreadyExisted,
        invite: { status: activated.invite.status, provider: activated.invite.provider, messageId: activated.invite.providerMessageId, attemptCount: activated.invite.attemptCount }
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/admin/tenants/:tenantId/owner-invite/resend", async (req: Request, res: Response) => {
    try {
      const actor = await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const tenantId = requiredTenantId(req.params.tenantId);
      const body = z.object({ ownerEmail: z.string().email().optional() }).strict().parse(req.body ?? {});
      const tenant = await deps.repository.getTenant(tenantId);
      if (!tenant) throw new RailError("Tenant was not found.", { provider: "platform", op: "resendOwnerInvite", status: 404 });
      const owners = (await deps.repository.listTenantUsers(tenantId)).filter((member) => member.role === "OWNER" && member.active !== false);
      const owner = body.ownerEmail ? owners.find((member) => member.email?.toLowerCase() === body.ownerEmail?.toLowerCase()) : owners[0];
      if (!owner?.email || !owner.authUid) throw new RailError("An active tenant owner with an email is required before an invite can be resent.", { provider: "platform", op: "resendOwnerInvite", status: 409 });
      const auth = deps.firebaseOwnerActivation ?? getAdminAuth(env);
      if (!auth || !deps.ownerInviteSender) throw new RailError("Owner invite email delivery is not configured.", { provider: "gmail", op: "resendOwnerInvite", status: 503 });
      const existing = await deps.repository.getTenantOwnerInvite(tenant.id, owner.id);
      let invite = newOwnerInvite({ tenantId: tenant.id, ownerUserId: owner.id, ownerEmail: owner.email, status: "NOT_SENT", attemptCount: existing?.attemptCount ?? 0 });
      const timestamp = new Date().toISOString();
      try {
        const receipt = await deps.ownerInviteSender.send({ tenantId: tenant.id, ownerEmail: owner.email, ownerName: owner.displayName, tenantName: tenant.name });
        invite = { ...invite, status: "SENT_TO_PROVIDER", attemptCount: invite.attemptCount + 1, provider: receipt.provider, providerMessageId: receipt.messageId, updatedAt: timestamp };
        await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("tenant_owner_invite.sent", actor.uid, `Owner invitation accepted by ${receipt.provider} for tenant ${tenant.id}.`, owner.authUid, timestamp));
      } catch (error) {
        invite = { ...invite, status: "FAILED", attemptCount: invite.attemptCount + 1, lastError: error instanceof Error ? error.message : "Owner invite delivery failed.", updatedAt: timestamp };
        await deps.repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("tenant_owner_invite.failed", actor.uid, `Owner invitation was not accepted for tenant ${tenant.id}.`, owner.authUid, timestamp));
      }
      await deps.repository.saveTenantOwnerInvite(invite);
      res.status(invite.status === "SENT_TO_PROVIDER" ? 201 : 502).json({ ok: invite.status === "SENT_TO_PROVIDER", tenant: { id: tenant.id, name: tenant.name }, owner: { id: owner.id, email: owner.email }, invite: { status: invite.status, provider: invite.provider, messageId: invite.providerMessageId, attemptCount: invite.attemptCount } });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/plans", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
      res.json({ ok: true, plans: Object.values(planCatalog()) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/platform/tenants", async (req: Request, res: Response) => {
    try {
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const period = defaultPeriod();
      const tenants = await deps.repository.listTenants();
      const rows = await Promise.all(tenants.map(async (tenant) => {
        const runtimeStatuses = runtimeAdapterStatuses(tenant, env);
        await deps.repository.saveAdapterStatuses(runtimeStatuses);
        const [profile, ledgerSubscription, branding] = await Promise.all([deps.repository.getTenantProfile(tenant.id), deps.repository.getSubscription(tenant.id), deps.repository.getTenantBranding(tenant.id)]);
        const packageId = profile?.subscriptionPlan;
        const stagingPackage = packageId && packageId !== "none" ? activeSubscriptionPackages().find((entry) => entry.id === packageId) : undefined;
        const subscriptionDisplay = stagingPackage
          ? { name: stagingPackage.name, status: profile?.status ?? "ACTIVE", monthlyUsd: stagingPackage.priceCents / 100, annualUsd: 0 }
          : { name: PLATFORM_PLANS[tenant.plan].name, status: ledgerSubscription?.status ?? "no subscription", monthlyUsd: PLATFORM_PLANS[tenant.plan].monthlyUsd, annualUsd: PLATFORM_PLANS[tenant.plan].monthlyUsd * 12 };
        return {
          tenant,
          plan: PLATFORM_PLANS[tenant.plan],
          modules: [...modulesForPlan(tenant.plan)],
          subscription: ledgerSubscription,
          subscriptionDisplay,
          logoVersion: branding?.logo?.updatedAt,
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
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
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
      let users = await deps.repository.listTenantUsers(tenantId);
      // Persist the confirmed first-team seed only when the tenant has never
      // stored a membership record; later reads never overwrite team changes.
      if (!users.length) {
        const seed = defaultTenantUsers(tenantId);
        if (seed.length) {
          users = await Promise.all(seed.map((member) => deps.repository.upsertTenantUser(member)));
        }
      }
      res.json({ ok: true, tenantId, users });
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
      const existing = input.id ? await deps.repository.getTenantUser(tenantId, input.id) : null;
      if (input.role === "OWNER" || existing?.role === "OWNER") throw new RailError("Tenant ownership can only be assigned or changed through NexCommand.", { provider: "platform", op: "tenantUserUpsert", status: 403 });
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

  // Invites are durable pending membership records only. Delivery is deliberately
  // handled by a separate outbound service and is never triggered by this route.
  app.post("/api/platform/tenants/:tenantId/invites", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      if (!tenantId) throw new RailError("Tenant id is required.", { provider: "platform", op: "tenantInviteCreate", status: 400 });
      const access = await requireTenantCapability(req, env, "team.invite", { requestedTenantId: tenantId, op: "tenantInviteCreate" });
      const input = tenantInviteBodySchema.parse(req.body ?? {});
      if (input.role === "OWNER") throw new RailError("Owner access is assigned through NexCommand, not an invite.", { provider: "platform", op: "tenantInviteCreate", status: 403 });
      const user = await upsertTenantUser(deps.repository, {
        tenantId,
        email: input.email,
        displayName: input.email,
        role: input.role,
        active: false
      });
      await deps.repository.saveTenantMembershipAudit({
        id: `membership_audit_${randomUUID()}`,
        tenantId,
        action: "member.upserted",
        actorId: actorIdForAccess(access),
        targetUserId: user.id,
        detail: `pending_invite=true; role=${user.role}; delivery=not_sent`,
        createdAt: new Date().toISOString()
      });
      res.status(201).json({ ok: true, invite: { ...user, status: "PENDING" }, delivery: "not_sent" });
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
      if (user.role === "OWNER") throw new RailError("Tenant ownership can only be managed through NexCommand.", { provider: "platform", op: "tenantUserClaims", status: 403 });
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
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
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
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
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
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
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
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
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
      await requirePlatformOperator(req, env, deps.repository, deps.platformOperatorAuth);
      const tenantId = req.params.tenantId;
      if (!tenantId) {
        throw new RailError("Tenant id is required.", { provider: "platform", op: "tenantBackups", status: 400 });
      }
      res.json({ ok: true, backups: await deps.repository.listBackups(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  // NexCommand lifecycle controls are platform-authorized. They preserve the
  // immutable tenant record and audit actor; they do not use tenant authority.
  app.post("/api/platform/admin/tenants/:tenantId/subscription/cancel/confirmations", async (req: Request, res: Response) => {
    try { const actor = await requirePlatformTeamCapability(req, env, "platform.tenants.manage", deps.repository, deps.platformOperatorAuth); const tenantId = req.params.tenantId!; const input = cancellationFirstConfirmationSchema.parse(req.body ?? {}); const result = await requestSubscriptionCancellation({ repository: deps.repository, tenantId, tenantUserId: actor.uid, platformActor: true, idempotencyKey: input.idempotencyKey }); res.status(result.alreadyExisted ? 200 : 201).json({ ok: true, ...result }); } catch (error) { sendRouteError(res, error); }
  });
  app.post("/api/platform/admin/tenants/:tenantId/subscription/cancel", async (req: Request, res: Response) => {
    try { const actor = await requirePlatformTeamCapability(req, env, "platform.tenants.manage", deps.repository, deps.platformOperatorAuth); const tenantId = req.params.tenantId!; const input = cancellationSecondConfirmationSchema.parse(req.body ?? {}); const result = await confirmSubscriptionCancellation({ repository: deps.repository, tenantId, tenantUserId: actor.uid, platformActor: true, cancellationId: input.cancellationId, idempotencyKey: input.idempotencyKey }); res.json({ ok: true, ...result }); } catch (error) { sendRouteError(res, error); }
  });
  app.post("/api/platform/admin/tenants/:tenantId/subscription/resubscribe", async (req: Request, res: Response) => {
    try { const actor = await requirePlatformTeamCapability(req, env, "platform.tenants.manage", deps.repository, deps.platformOperatorAuth); const tenantId = req.params.tenantId!; const input = resubscribeBodySchema.parse(req.body ?? {}); const result = await resubscribeTenant({ repository: deps.repository, tenantId, tenantUserId: actor.uid, platformActor: true, idempotencyKey: input.idempotencyKey }); res.status(result.alreadyExisted ? 200 : 201).json({ ok: true, ...result }); } catch (error) { sendRouteError(res, error); }
  });

  app.post("/api/platform/tenants/:tenantId/subscription/cancel/confirmations", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      if (!tenantId) throw new RailError("Tenant id is required.", { provider: "platform", op: "subscriptionCancellationConfirmationOne", status: 400 });
      const access = await requireTenantRole(req, env, ["OWNER"], { requestedTenantId: tenantId, op: "subscriptionCancellationConfirmationOne" });
      const input = cancellationFirstConfirmationSchema.parse(req.body ?? {});
      const result = await requestSubscriptionCancellation({ repository: deps.repository, tenantId, tenantUserId: access.tenantUserId, idempotencyKey: input.idempotencyKey });
      res.status(result.alreadyExisted ? 200 : 201).json({ ok: true, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/tenants/:tenantId/subscription/cancel", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      if (!tenantId) throw new RailError("Tenant id is required.", { provider: "platform", op: "subscriptionCancellation", status: 400 });
      const access = await requireTenantRole(req, env, ["OWNER"], { requestedTenantId: tenantId, op: "subscriptionCancellation" });
      const input = cancellationSecondConfirmationSchema.parse(req.body ?? {});
      const result = await confirmSubscriptionCancellation({ repository: deps.repository, tenantId, tenantUserId: access.tenantUserId, cancellationId: input.cancellationId, idempotencyKey: input.idempotencyKey });
      res.json({ ok: true, tenant: result.tenant, alreadyExisted: result.alreadyExisted });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/platform/tenants/:tenantId/subscription/resubscribe", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      if (!tenantId) throw new RailError("Tenant id is required.", { provider: "platform", op: "tenantResubscribe", status: 400 });
      const access = await requireTenantRole(req, env, ["OWNER"], { requestedTenantId: tenantId, op: "tenantResubscribe" });
      const input = resubscribeBodySchema.parse(req.body ?? {});
      const result = await resubscribeTenant({ repository: deps.repository, tenantId, tenantUserId: access.tenantUserId, idempotencyKey: input.idempotencyKey });
      res.status(result.alreadyExisted ? 200 : 201).json({ ok: true, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
