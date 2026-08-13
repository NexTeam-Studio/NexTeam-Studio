import type { DecodedIdToken } from "firebase-admin/auth";
import { RailError, type TenantUser } from "@nexteam/core";
import type { PlatformRepository } from "../platform/repository.js";

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * Resolves a Firebase identity to an already-authoritative tenant membership.
 * This is deliberately a one-to-one claim: a verified email may link only when
 * it identifies exactly one active membership and that membership is not bound
 * to another Firebase UID.
 */
export async function linkExistingWorkspaceMembership(
  repository: PlatformRepository,
  decoded: DecodedIdToken
): Promise<{ user: TenantUser; linked: boolean }> {
  const email = normalized(decoded.email);
  if (!email || decoded.email_verified !== true) {
    throw new RailError("A verified email is required to open this workspace.", { provider: "firebase", op: "workspaceLink", status: 403 });
  }

  const tenants = await repository.listTenants();
  const memberships = (await Promise.all(tenants.map((tenant) => repository.listTenantUsers(tenant.id))))
    .flat();
  const uidMatches = memberships.filter((member) => member.authUid === decoded.uid);
  const candidates = memberships.filter((member) => member.active && normalized(member.email) === email);

  if (uidMatches.some((member) => member.tenantId !== candidates[0]?.tenantId || member.id !== candidates[0]?.id)) {
    throw new RailError("This sign-in is already linked to a different workspace membership.", { provider: "firebase", op: "workspaceLink", status: 403 });
  }
  if (candidates.length !== 1) {
    throw new RailError(
      candidates.length === 0 ? "No active workspace membership matches this sign-in." : "This sign-in matches multiple workspaces and cannot be linked automatically.",
      { provider: "firebase", op: "workspaceLink", status: 403 }
    );
  }

  const user = candidates[0]!;
  if (user.authUid && user.authUid !== decoded.uid) {
    throw new RailError("This workspace membership is linked to a different sign-in.", { provider: "firebase", op: "workspaceLink", status: 403 });
  }
  if (user.authUid === decoded.uid) return { user, linked: false };
  return { user: await repository.upsertTenantUser({ ...user, authUid: decoded.uid, updatedAt: new Date().toISOString() }), linked: true };
}
