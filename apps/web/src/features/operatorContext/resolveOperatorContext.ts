import type { User } from "firebase/auth";
import { CONFIGURED_TENANT_ID } from "../../shared/auth/authBootstrap";
import type { TenantRole } from "./types";

export interface ResolvedOperatorContext {
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
}

function claimString(claims: Record<string, unknown>, key: string): string | undefined {
  const value = claims[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function claimRole(claims: Record<string, unknown>): TenantRole {
  const explicit = claimString(claims, "tenantRole") ?? claimString(claims, "role");
  const roles = Array.isArray(claims.roles) ? claims.roles.map((role) => String(role).toUpperCase()) : [];
  const candidates = [explicit, ...roles].filter(Boolean).map((role) => String(role).toUpperCase());
  if (candidates.includes("OFFICE_ADMIN") || candidates.includes("OFFICE") || candidates.includes("ADMIN")) return "OFFICE_ADMIN";
  if (candidates.includes("TECHNICIAN") || candidates.includes("TECH")) return "TECHNICIAN";
  return "OWNER";
}

export function fallbackOperatorContext(user: User): ResolvedOperatorContext {
  return { tenantId: CONFIGURED_TENANT_ID, tenantUserId: user.uid, role: "OWNER" };
}

export async function loadOperatorContext(user: User): Promise<ResolvedOperatorContext> {
  const token = await user.getIdTokenResult();
  const claims = token.claims as Record<string, unknown>;
  const tenantId = claimString(claims, "tenantId") ?? claimString(claims, "tenant_id") ?? CONFIGURED_TENANT_ID;
  if (!tenantId) throw new Error("This sign-in is missing a tenant assignment.");
  return {
    tenantId,
    tenantUserId: claimString(claims, "tenantUserId") ?? user.uid,
    role: claimRole(claims)
  };
}
