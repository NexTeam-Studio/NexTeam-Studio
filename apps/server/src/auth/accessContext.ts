import crypto from "node:crypto";
import type { Request } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { RailError, tenantUserSchema } from "@nexteam/core";
import type { TenantCapability, TenantUser, TenantUserRole } from "@nexteam/core";
import { capabilitiesForTenantUser, ROLE_CAPABILITIES } from "../platform/accessManagement.js";
import { getAdminAuth } from "../firebase.js";
import { getAdminDb } from "../firebase.js";
import { configuredTenantId } from "../core/tenantConfig.js";

export type TenantRole = TenantUserRole;
export type AccessKind = "internal" | "job_link";

export interface AccessContext {
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
  capabilities: TenantCapability[];
  accessKind: AccessKind;
  jobAccessLinkId?: string | undefined;
  jobId?: string | undefined;
  propertyId?: string | undefined;
  scopes?: string[] | undefined;
  email?: string | undefined;
}

export interface AccessContextOptions {
  requestedTenantId?: string | undefined;
  op?: string | undefined;
}

export interface LocalDevAccessProfile {
  tenantUserId: string;
  role: TenantRole;
  email: string;
  displayName: string;
}

export interface LocalDevWebProfileSummary {
  id: string;
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
  email: string;
  displayName: string;
  label: string;
}

interface LocalDevWebCredentialProfile {
  id: keyof typeof LOCAL_DEV_ACCESS_PROFILES;
  label: string;
}

interface LocalDevSessionPayload {
  kind: "local-dev-session";
  tenantId: string;
  profileId: keyof typeof LOCAL_DEV_ACCESS_PROFILES;
  tenantUserId: string;
  role: TenantRole;
  email: string;
  issuedAt: number;
  expiresAt: number;
}

export const LOCAL_DEV_PROFILE_HEADER = "x-nexteam-local-profile";

export const LOCAL_DEV_ACCESS_PROFILES = {
  "local-owner": {
    tenantUserId: "local-owner",
    role: "OWNER" as const,
    email: "owner@local.dev",
    displayName: "Local Owner"
  },
  "local-office": {
    tenantUserId: "local-office",
    role: "OFFICE_ADMIN" as const,
    email: "office@local.dev",
    displayName: "Local Office"
  },
  "local-technician": {
    tenantUserId: "local-technician",
    role: "TECHNICIAN" as const,
    email: "technician@local.dev",
    displayName: "Local Technician"
  },
  "local-technician-2": {
    tenantUserId: "local-technician-2",
    role: "TECHNICIAN" as const,
    email: "technician2@local.dev",
    displayName: "Local Technician 2"
  }
} satisfies Record<string, LocalDevAccessProfile>;

const LOCAL_DEV_WEB_CREDENTIAL_PROFILES = [
  {
    id: "local-owner",
    label: "Local Owner"
  },
  {
    id: "local-office",
    label: "Local Office Admin"
  },
  {
    id: "local-technician",
    label: "Local Technician"
  },
  {
    id: "local-technician-2",
    label: "Local Technician 2"
  }
] satisfies readonly LocalDevWebCredentialProfile[];

const LOCAL_DEV_SESSION_PREFIX = "localdev";
const LOCAL_DEV_SESSION_LIFETIME_SECONDS = 60 * 60 * 12;

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return configuredTenantId(env, "accessContext");
}

function envList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

function claimString(decoded: DecodedIdToken, key: string): string | undefined {
  const value = (decoded as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function claimBoolean(decoded: DecodedIdToken, key: string): boolean {
  return (decoded as unknown as Record<string, unknown>)[key] === true;
}

function roles(decoded: DecodedIdToken): string[] {
  const value = (decoded as unknown as Record<string, unknown>).roles;
  return Array.isArray(value) ? value.map((role) => String(role).toLowerCase()) : [];
}

function hasPlatformAccess(decoded: DecodedIdToken, env: NodeJS.ProcessEnv): boolean {
  const allowedUids = envList(env.FIREBASE_PLATFORM_OPERATOR_UIDS);
  const allowedEmails = envList(env.FIREBASE_PLATFORM_OPERATOR_EMAILS);
  const email = decoded.email?.toLowerCase() ?? "";
  const normalizedRoles = roles(decoded);
  return allowedUids.includes(decoded.uid.toLowerCase())
    || (!!email && allowedEmails.includes(email))
    || claimBoolean(decoded, "platform_operator")
    || normalizedRoles.includes("platform_operator");
}

function normalizeRole(decoded: DecodedIdToken, _env: NodeJS.ProcessEnv): TenantRole {
  const explicit = claimString(decoded, "tenantRole") ?? claimString(decoded, "role");
  const candidates = [explicit, ...roles(decoded)].filter(Boolean).map((value) => String(value).toUpperCase());
  if (candidates.includes("OWNER")) return "OWNER";
  if (candidates.includes("OFFICE_ADMIN") || candidates.includes("OFFICE") || candidates.includes("ADMIN")) return "OFFICE_ADMIN";
  if (candidates.includes("TECHNICIAN") || candidates.includes("TECH")) return "TECHNICIAN";
  throw new RailError("Your sign-in is missing a tenant role.", { provider: "firebase", op: "accessContext", status: 403 });
}

function capabilities(decoded: DecodedIdToken, role: TenantRole): TenantCapability[] {
  const value = (decoded as unknown as Record<string, unknown>).tenantCapabilities;
  const allowed: TenantCapability[] = ["team.view", "team.manage", "team.invite", "tenant.audit.read"];
  return Array.isArray(value) ? value.filter((entry): entry is TenantCapability => allowed.includes(entry as TenantCapability)) : ROLE_CAPABILITIES[role];
}

/**
 * Firebase establishes who presented a credential, but it never establishes
 * what that person may access.  The tenant-membership record is consulted on
 * every protected tenant request so role removal, deactivation, and tenant
 * moves take effect without waiting for a token claim to expire.
 */
export async function resolveAuthoritativeTenantMembership(
  db: { collection(name: string): { where(fieldPath: string, opStr: "==", value: unknown): { get(): Promise<{ docs: Array<{ data(): unknown }> }> } } },
  authUid: string,
  tenantId: string
): Promise<TenantUser> {
  const snapshot = await db.collection("tenantUsers").where("authUid", "==", authUid).get();
  const memberships = snapshot.docs
    .map((document) => tenantUserSchema.safeParse(document.data()))
    .filter((result): result is { success: true; data: TenantUser } => result.success)
    .map((result) => result.data)
    .filter((membership) => membership.tenantId === tenantId && membership.authUid === authUid);
  if (memberships.length !== 1 || !memberships[0]?.active) {
    throw new RailError("Your active NexOps membership does not permit this tenant.", { provider: "platform", op: "tenantMembership", status: 403 });
  }
  return memberships[0];
}

function accessKind(decoded: DecodedIdToken): AccessKind {
  const explicit = claimString(decoded, "accessKind");
  if (explicit === "job_link" || claimString(decoded, "jobAccessLinkId")) {
    return "job_link";
  }
  return "internal";
}

function requestedTenant(options: AccessContextOptions, env: NodeJS.ProcessEnv): string {
  return options.requestedTenantId?.trim() || defaultTenantId(env);
}

function bearerToken(req: Request): string | null {
  const header = req.header("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function localDevAccessContext(req: Request, tenantId: string, op = "accessContext"): AccessContext | null {
  const profileId = req.header(LOCAL_DEV_PROFILE_HEADER)?.trim() ?? "";
  if (!profileId) {
    return null;
  }
  const profile = LOCAL_DEV_ACCESS_PROFILES[profileId as keyof typeof LOCAL_DEV_ACCESS_PROFILES];
  if (!profile) {
    throw new RailError("That local mobile profile is not recognized.", {
      provider: "firebase",
      op,
      status: 400
    });
  }
  return {
    tenantId,
    tenantUserId: profile.tenantUserId,
    role: profile.role,
    capabilities: ROLE_CAPABILITIES[profile.role],
    accessKind: "internal",
    email: profile.email
  };
}

function localDevAuthSecret(env: NodeJS.ProcessEnv): string {
  return env.NEXI_LOCAL_AUTH_SECRET?.trim() || "nexteam-local-auth-dev-secret";
}

/**
 * Local credentials are a test/development convenience, never an alternate
 * authentication rail for a Firebase-protected runtime.  In particular, a
 * syntactically valid local token must not short-circuit Firebase token
 * verification on staging or production.
 */
export function isLocalDevAuthEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.NEXI_FIREBASE_AUTH_REQUIRED === "false";
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseBase64urlJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function signLocalDevPayload(payloadPart: string, env: NodeJS.ProcessEnv): string {
  return crypto
    .createHmac("sha256", localDevAuthSecret(env))
    .update(payloadPart)
    .digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function localDevProfileSummary(
  profile: LocalDevWebCredentialProfile,
  tenantId: string
): LocalDevWebProfileSummary {
  const accessProfile = LOCAL_DEV_ACCESS_PROFILES[profile.id];
  return {
    id: profile.id,
    tenantId,
    tenantUserId: accessProfile.tenantUserId,
    role: accessProfile.role,
    email: accessProfile.email,
    displayName: accessProfile.displayName,
    label: profile.label
  };
}

function encodeLocalDevSession(
  payload: LocalDevSessionPayload,
  env: NodeJS.ProcessEnv
): string {
  const payloadPart = base64urlJson(payload);
  const signature = signLocalDevPayload(payloadPart, env);
  return `${LOCAL_DEV_SESSION_PREFIX}.${payloadPart}.${signature}`;
}

export function listLocalDevWebProfiles(
  tenantId = defaultTenantId(process.env),
  env: NodeJS.ProcessEnv = process.env
): LocalDevWebProfileSummary[] {
  if (!isLocalDevAuthEnabled(env)) {
    return [];
  }
  return LOCAL_DEV_WEB_CREDENTIAL_PROFILES.map((profile) => localDevProfileSummary(profile, tenantId));
}

export function createLocalDevSession(
  email: string,
  password: string | undefined,
  tenantId: string,
  env: NodeJS.ProcessEnv
): { token: string; profile: LocalDevWebProfileSummary } {
  const normalizedEmail = email.trim().toLowerCase();
  const matchedProfile = LOCAL_DEV_WEB_CREDENTIAL_PROFILES.find((profile) => {
    const accessProfile = LOCAL_DEV_ACCESS_PROFILES[profile.id];
    return accessProfile.email.toLowerCase() === normalizedEmail;
  });
  void password;
  void env;
  if (!matchedProfile) {
    throw new RailError("That email is not allowed for local sign-in.", {
      provider: "native",
      op: "localAuthSignIn",
      status: 401
    });
  }
  const summary = localDevProfileSummary(matchedProfile, tenantId);
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: LocalDevSessionPayload = {
    kind: "local-dev-session",
    tenantId,
    profileId: matchedProfile.id,
    tenantUserId: summary.tenantUserId,
    role: summary.role,
    email: summary.email,
    issuedAt,
    expiresAt: issuedAt + LOCAL_DEV_SESSION_LIFETIME_SECONDS
  };
  return {
    token: encodeLocalDevSession(payload, env),
    profile: summary
  };
}

export function readLocalDevSession(
  token: string,
  tenantId: string,
  env: NodeJS.ProcessEnv,
  op = "accessContext"
): { access: AccessContext; profile: LocalDevWebProfileSummary } | null {
  if (!token.startsWith(`${LOCAL_DEV_SESSION_PREFIX}.`)) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new RailError("That local session is malformed. Sign in again.", {
      provider: "native",
      op,
      status: 401
    });
  }
  const payloadPart = parts[1];
  const signature = parts[2];
  if (!payloadPart || !signature) {
    throw new RailError("That local session is malformed. Sign in again.", {
      provider: "native",
      op,
      status: 401
    });
  }
  const expectedSignature = signLocalDevPayload(payloadPart, env);
  if (!constantTimeEqual(signature, expectedSignature)) {
    throw new RailError("That local session is no longer valid. Sign in again.", {
      provider: "native",
      op,
      status: 401
    });
  }
  const payload = parseBase64urlJson<LocalDevSessionPayload>(payloadPart);
  if (!payload || payload.kind !== "local-dev-session") {
    throw new RailError("That local session is malformed. Sign in again.", {
      provider: "native",
      op,
      status: 401
    });
  }
  if (payload.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new RailError("Your local sign-in expired. Sign in again.", {
      provider: "native",
      op,
      status: 401
    });
  }
  if (payload.tenantId !== tenantId) {
    throw new RailError("Your sign-in is not allowed for this tenant.", {
      provider: "native",
      op,
      status: 403
    });
  }
  const accessProfile = LOCAL_DEV_ACCESS_PROFILES[payload.profileId];
  if (!accessProfile) {
    throw new RailError("That local session profile is no longer available.", {
      provider: "native",
      op,
      status: 401
    });
  }
  return {
    access: {
      tenantId,
      tenantUserId: accessProfile.tenantUserId,
      role: accessProfile.role,
      capabilities: ROLE_CAPABILITIES[accessProfile.role],
      accessKind: "internal",
      email: accessProfile.email
    },
    profile: localDevProfileSummary(
      LOCAL_DEV_WEB_CREDENTIAL_PROFILES.find((profile) => profile.id === payload.profileId)
        ?? {
          id: payload.profileId,
          label: accessProfile.displayName
        },
      tenantId
    )
  };
}

export function actorIdForAccess(access: AccessContext): string {
  return `${access.accessKind}:${access.tenantUserId}`;
}

export async function requireAccessContext(
  req: Request,
  env: NodeJS.ProcessEnv,
  options: AccessContextOptions = {}
): Promise<AccessContext> {
  const tenantId = requestedTenant(options, env);
  const token = bearerToken(req);
  if (token && isLocalDevAuthEnabled(env)) {
    const localSession = readLocalDevSession(token, tenantId, env, options.op ?? "accessContext");
    if (localSession) {
      return localSession.access;
    }
  }

  if (isLocalDevAuthEnabled(env)) {
    return localDevAccessContext(req, tenantId, options.op ?? "accessContext")
      ?? { tenantId, tenantUserId: "local-owner", role: "OWNER", capabilities: ROLE_CAPABILITIES.OWNER, accessKind: "internal" };
  }

  const auth = getAdminAuth(env);
  if (!auth) {
    if (!isLocalDevAuthEnabled(env)) {
      throw new RailError("Tenant authentication is temporarily unavailable.", {
        provider: "firebase",
        op: options.op ?? "accessContext",
        status: 503
      });
    }
    return localDevAccessContext(req, tenantId, options.op ?? "accessContext")
      ?? { tenantId, tenantUserId: "local-owner", role: "OWNER", capabilities: ROLE_CAPABILITIES.OWNER, accessKind: "internal" };
  }

  if (!token) {
    throw new RailError("Sign in is required.", { provider: "firebase", op: options.op ?? "accessContext", status: 401 });
  }

  const decoded = await auth.verifyIdToken(token);
  const resolvedTenantId = tenantId;
  // Claims can outlive a cancellation. The authoritative tenant root is checked
  // on every production tenant request so disabled tenants cannot retain normal
  // access merely because an old Firebase token is still valid.
  const db = getAdminDb(env);
  if (!db) {
    throw new RailError("Tenant lifecycle authorization is temporarily unavailable.", { provider: "firebase", op: options.op ?? "accessContext", status: 503 });
  }
  const tenant = await db.collection("tenants").doc(resolvedTenantId).get();
  if (tenant.exists && tenant.data()?.lifecycleState === "DISABLED_ARCHIVED") {
    throw new RailError("This tenant is disabled and archived. Resubscribe to restore access.", { provider: "platform", op: options.op ?? "accessContext", status: 403 });
  }
  const membership = await resolveAuthoritativeTenantMembership(db, decoded.uid, resolvedTenantId);
  return {
    tenantId: resolvedTenantId,
    tenantUserId: membership.id,
    role: membership.role,
    capabilities: capabilitiesForTenantUser(membership),
    accessKind: accessKind(decoded),
    ...(claimString(decoded, "jobAccessLinkId") ? { jobAccessLinkId: claimString(decoded, "jobAccessLinkId") } : {}),
    ...(claimString(decoded, "jobId") ? { jobId: claimString(decoded, "jobId") } : {}),
    ...(claimString(decoded, "propertyId") ? { propertyId: claimString(decoded, "propertyId") } : {}),
    ...(Array.isArray((decoded as unknown as Record<string, unknown>).scopes) ? { scopes: (decoded as unknown as Record<string, unknown>).scopes as string[] } : {}),
    ...(decoded.email ? { email: decoded.email } : {})
  };
}

export async function requireTenantRole(
  req: Request,
  env: NodeJS.ProcessEnv,
  allowedRoles: TenantRole[],
  options: AccessContextOptions = {}
): Promise<AccessContext> {
  const access = await requireAccessContext(req, env, options);
  return assertAccessRole(access, allowedRoles, options.op);
}

export function assertAccessRole(access: AccessContext, allowedRoles: TenantRole[], op = "roleGate"): AccessContext {
  if (access.accessKind !== "internal" || !allowedRoles.includes(access.role)) {
    throw new RailError("Your role cannot perform that action.", { provider: "firebase", op, status: 403 });
  }
  return access;
}

export function assertAccessCapability(access: AccessContext, capability: TenantCapability, op = "capabilityGate"): AccessContext {
  if (access.accessKind !== "internal" || !access.capabilities.includes(capability)) {
    throw new RailError("Your access cannot perform that action.", { provider: "firebase", op, status: 403 });
  }
  return access;
}

export async function requireTenantCapability(req: Request, env: NodeJS.ProcessEnv, capability: TenantCapability, options: AccessContextOptions = {}): Promise<AccessContext> {
  return assertAccessCapability(await requireAccessContext(req, env, options), capability, options.op);
}

