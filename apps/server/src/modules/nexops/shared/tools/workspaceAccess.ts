import { RailError } from "@nexteam/core";
import type { z } from "zod";
import type { AccessContext } from "../../../../auth/accessContext.js";
import { ROLE_CAPABILITIES } from "../../../../platform/accessManagement.js";
import type { PlatformRepository } from "../../../../platform/repository.js";
import type { workspaceRoleSchema } from "./workspaceAccessSchemas.js";

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function defaultWorkspaceRange(): { from: string; to: string } {
  return { from: "1970-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" };
}

export function workspaceRangeForDay(day: string): { from: string; to: string } {
  return { from: `${day}T00:00:00.000Z`, to: `${day}T23:59:59.999Z` };
}

export async function resolveTenantUser(
  tenantId: string,
  platformRepository: Pick<PlatformRepository, "listTenantUsers"> | undefined,
  input: { tenantUserId?: string | undefined; tenantUserQuery?: string | undefined; role?: z.infer<typeof workspaceRoleSchema> | undefined }
): Promise<{ tenantUserId: string; role: z.infer<typeof workspaceRoleSchema> } | null> {
  if (!platformRepository) {
    if (input.tenantUserId?.trim()) {
      return { tenantUserId: input.tenantUserId.trim(), role: input.role ?? "OWNER" };
    }
    return input.role ? { tenantUserId: "nexi", role: input.role } : null;
  }
  const users = await platformRepository.listTenantUsers(tenantId);
  if (input.tenantUserId?.trim()) {
    const user = users.find((entry) => entry.id === input.tenantUserId?.trim());
    if (!user) {
      throw new RailError(`Tenant user ${input.tenantUserId} was not found.`, { provider: "native", op: "resolveTenantUser", status: 404 });
    }
    return { tenantUserId: user.id, role: input.role ?? user.role };
  }
  if (input.tenantUserQuery?.trim()) {
    const needle = normalized(input.tenantUserQuery);
    const matches = users.filter((user) => [user.displayName, user.email, user.role]
      .filter(Boolean)
      .some((value) => normalized(String(value)).includes(needle)));
    if (matches.length !== 1) {
      throw new RailError("I need one exact team member match before I can scope that workspace view.", {
        provider: "native",
        op: "resolveTenantUser",
        status: 400
      });
    }
    return { tenantUserId: matches[0]!.id, role: input.role ?? matches[0]!.role };
  }
  const fallback = users.find((user) => user.role === "OWNER" && user.active) ?? users.find((user) => user.active) ?? users[0];
  return fallback ? { tenantUserId: fallback.id, role: input.role ?? fallback.role } : (input.role ? { tenantUserId: "nexi", role: input.role } : null);
}

export async function resolveWorkspaceAccess(
  tenantId: string,
  platformRepository: Pick<PlatformRepository, "listTenantUsers"> | undefined,
  input: { tenantUserId?: string | undefined; tenantUserQuery?: string | undefined; role?: z.infer<typeof workspaceRoleSchema> | undefined }
): Promise<AccessContext> {
  const resolved = await resolveTenantUser(tenantId, platformRepository, input);
  return {
    tenantId,
    tenantUserId: resolved?.tenantUserId ?? "nexi",
    role: input.role ?? resolved?.role ?? "OWNER",
    capabilities: ROLE_CAPABILITIES[input.role ?? resolved?.role ?? "OWNER"],
    accessKind: "internal"
  };
}
