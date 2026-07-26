import type { Request } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { RailError } from "@nexteam/core";
import { getAdminAuth } from "../firebase.js";

export interface TenantAccess {
  tenantId: string;
  platformOperator: boolean;
}

function claimString(claims: Record<string, unknown>, key: string): string | undefined {
  const value = claims[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function requestedTenantId(req: Request): string | undefined {
  const value = req.body?.tenantId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function requireNexiTenantAccess(req: Request, env: NodeJS.ProcessEnv): Promise<TenantAccess> {
  const requested = requestedTenantId(req);
  if (env.NEXI_FIREBASE_AUTH_REQUIRED === "false") {
    const tenantId = requested ?? env.TENANT_ID?.trim();
    if (!tenantId) {
      throw new RailError("tenantId is required when Firebase auth is disabled.", { provider: "firebase", op: "nexiTenantAccess", status: 400 });
    }
    return { tenantId, platformOperator: false };
  }

  const auth = getAdminAuth(env);
  if (!auth) {
    throw new RailError("Firebase Admin authentication is not configured.", { provider: "firebase", op: "nexiTenantAccess", status: 503 });
  }
  const header = req.header("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new RailError("Firebase operator sign-in is required.", { provider: "firebase", op: "nexiAuth", status: 401 });
  }
  const decoded = await auth.verifyIdToken(match[1]);
  const platformOperator = hasPlatformAccess(decoded, env);
  const tenantId = claimString(decoded as Record<string, unknown>, "tenantId")
    ?? claimString(decoded as Record<string, unknown>, "tenant_id");
  if (!platformOperator && !tenantId) {
    throw new RailError("Firebase user has no tenant access claim.", { provider: "firebase", op: "nexiTenantAccess", status: 403 });
  }
  if (!requested && !tenantId) {
    throw new RailError("tenantId is required for a platform operator request.", { provider: "firebase", op: "nexiTenantAccess", status: 400 });
  }
  if (!platformOperator && requested && requested !== tenantId) {
    throw new RailError("Cross-tenant Nexi access was rejected.", { provider: "firebase", op: "nexiTenantAccess", status: 403 });
  }
  return { tenantId: requested ?? tenantId!, platformOperator };
}
