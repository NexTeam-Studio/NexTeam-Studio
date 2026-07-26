import { RailError } from "@nexteam/core";

export function configuredTenantId(env: NodeJS.ProcessEnv, operation: string): string {
  const tenantId = env.TENANT_ID?.trim();
  if (!tenantId) {
    throw new RailError("tenantId is required; configure TENANT_ID for this unauthenticated route.", {
      provider: "firebase",
      op: operation,
      status: 400
    });
  }
  return tenantId;
}

export function requireTenantMatch(expectedTenantId: string, actualTenantId: string, operation: string): void {
  if (expectedTenantId !== actualTenantId) {
    throw new RailError("Cross-tenant persistence access was rejected.", { provider: "firebase", op: operation, status: 403 });
  }
}
