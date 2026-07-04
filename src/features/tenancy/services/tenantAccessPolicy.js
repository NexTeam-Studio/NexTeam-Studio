import { assertSafeTenantId } from "./tenantPathUtils.js";

export const PLATFORM_OPERATOR_ROLES = new Set(["nexteam_admin", "platform_operator"]);

export function createTenantActorScope({ tenantId = null, roles = [] } = {}) {
  if (tenantId != null) {
    assertSafeTenantId(tenantId);
  }

  return {
    tenantId,
    roles: Array.isArray(roles) ? [...new Set(roles.filter(Boolean).map(String))] : [],
  };
}

export function isPlatformOperator(actorScope = {}) {
  return Array.isArray(actorScope.roles) && actorScope.roles.some((role) => PLATFORM_OPERATOR_ROLES.has(role));
}

export function canAccessTenant({ actorScope = {}, targetTenantId }) {
  assertSafeTenantId(targetTenantId);

  if (isPlatformOperator(actorScope)) {
    return true;
  }

  return actorScope.tenantId === targetTenantId;
}

export function assertTenantAccess({ actorScope = {}, targetTenantId, action = "access" }) {
  if (!canAccessTenant({ actorScope, targetTenantId })) {
    throw new Error(
      `Tenant access denied. Actor tenant "${actorScope.tenantId || "unknown"}" cannot ${action} tenant "${targetTenantId}".`
    );
  }
}
