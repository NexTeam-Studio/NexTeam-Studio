import type { User } from "firebase/auth";
import { CONFIGURED_TENANT_ID } from "../../shared/auth/authBootstrap";
import type { TenantRole } from "./types";

export interface ResolvedOperatorContext {
  tenantId: string;
  tenantUserId: string;
  role: TenantRole;
}

export function fallbackOperatorContext(user: User): ResolvedOperatorContext {
  return { tenantId: CONFIGURED_TENANT_ID, tenantUserId: user.uid, role: "OWNER" };
}

export async function loadOperatorContext(user: User): Promise<ResolvedOperatorContext> {
  const token = await user.getIdToken();
  const response = await fetch("/api/auth/access-context", {
    headers: { authorization: `Bearer ${token}` }
  });
  const body = await response.json() as {
    ok?: boolean;
    error?: string;
    tenantId?: string;
    tenantUserId?: string;
    role?: string;
  };
  if (!response.ok || !body.ok) {
    throw new Error(body.error || "Your active NexOps membership could not be verified.");
  }
  if (!body.tenantId || !body.tenantUserId || !isTenantRole(body.role)) {
    throw new Error("The server returned an invalid NexOps access context.");
  }
  return { tenantId: body.tenantId, tenantUserId: body.tenantUserId, role: body.role };
}

function isTenantRole(role: unknown): role is TenantRole {
  return role === "OWNER" || role === "OFFICE_ADMIN" || role === "TECHNICIAN";
}
