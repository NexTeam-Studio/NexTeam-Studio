import type { Request } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { RailError } from "@nexteam/core";
import { getAdminAuth } from "../firebase.js";

export type TenantRole = "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN";
export type AccessKind = "internal" | "job_link";

export interface AccessContext {
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
  accessKind: AccessKind;
  email?: string | undefined;
}

export interface AccessContextOptions {
  requestedTenantId?: string | undefined;
  op?: string | undefined;
}

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return env.TENANT_ID || "aquatrace";
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

function normalizeRole(decoded: DecodedIdToken, env: NodeJS.ProcessEnv): TenantRole {
  const explicit = claimString(decoded, "tenantRole") ?? claimString(decoded, "role");
  const candidates = [explicit, ...roles(decoded)].filter(Boolean).map((value) => String(value).toUpperCase());
  if (candidates.includes("OWNER")) return "OWNER";
  if (candidates.includes("OFFICE_ADMIN") || candidates.includes("OFFICE") || candidates.includes("ADMIN")) return "OFFICE_ADMIN";
  if (candidates.includes("TECHNICIAN") || candidates.includes("TECH")) return "TECHNICIAN";
  if (hasPlatformAccess(decoded, env)) return "OWNER";
  throw new RailError("Your sign-in is missing a tenant role.", { provider: "firebase", op: "accessContext", status: 403 });
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

export function actorIdForAccess(access: AccessContext): string {
  return `${access.accessKind}:${access.tenantUserId}`;
}

export async function requireAccessContext(
  req: Request,
  env: NodeJS.ProcessEnv,
  options: AccessContextOptions = {}
): Promise<AccessContext> {
  const tenantId = requestedTenant(options, env);
  if (env.NEXI_FIREBASE_AUTH_REQUIRED === "false") {
    return { tenantId, tenantUserId: "local-owner", role: "OWNER", accessKind: "internal" };
  }

  const auth = getAdminAuth(env);
  if (!auth) {
    return { tenantId, tenantUserId: "local-owner", role: "OWNER", accessKind: "internal" };
  }

  const token = bearerToken(req);
  if (!token) {
    throw new RailError("Sign in is required.", { provider: "firebase", op: options.op ?? "accessContext", status: 401 });
  }

  const decoded = await auth.verifyIdToken(token);
  const claimedTenantId = claimString(decoded, "tenantId") ?? claimString(decoded, "tenant_id");
  const isPlatformOperator = hasPlatformAccess(decoded, env);
  if (claimedTenantId && claimedTenantId !== tenantId) {
    throw new RailError("Your sign-in is not allowed for this tenant.", { provider: "firebase", op: options.op ?? "accessContext", status: 403 });
  }
  if (!claimedTenantId && !isPlatformOperator) {
    throw new RailError("Your sign-in is missing a tenant assignment.", { provider: "firebase", op: options.op ?? "accessContext", status: 403 });
  }

  return {
    tenantId: claimedTenantId ?? tenantId,
    tenantUserId: claimString(decoded, "tenantUserId") ?? decoded.uid,
    role: normalizeRole(decoded, env),
    accessKind: accessKind(decoded),
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
