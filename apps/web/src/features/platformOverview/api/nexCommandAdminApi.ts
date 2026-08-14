import type { User } from "firebase/auth";

export type PlatformRole = "Owner" | "Super Admin" | "Administrator" | "Developer" | "Developer Admin" | "Support" | "Sales & Onboarding" | "Marketing" | "Finance" | "Read Only";
export type PlatformCapabilityOverride = { grant: string[]; deny: string[] };
export type PlatformTeamUser = {
  id: string; authUid?: string; firstName: string; lastName: string; email?: string; telephone?: string; profilePhotoRef: string;
  twoFactorState: "NOT_ENROLLED" | "ENROLLED"; role: PlatformRole; accountStatus: "ACTIVE" | "DISABLED"; capabilityOverrides?: PlatformCapabilityOverride; updatedAt: string;
};
export type NexCommandTenantMember = { id: string; authUid?: string | null; email: string | null; displayName: string; role: "OWNER" | "OFFICE_ADMIN" | "TECHNICIAN"; active: boolean; effectiveCapabilities: string[] };
export type NexCommandTenantMembers = { tenantId: string; currentOwner: NexCommandTenantMember | null; users: NexCommandTenantMember[] };

async function request<T>(user: User, path: string, init?: RequestInit): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(path, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers } });
  const body = await response.json() as T & { ok?: boolean; error?: string };
  if (!response.ok || body.ok === false) throw new Error(body.error ?? "NexCommand request failed.");
  return body;
}

export async function getMyPlatformProfile(user: User): Promise<PlatformTeamUser> { return (await request<{ user: PlatformTeamUser }>(user, "/api/platform/admin/team/me")).user; }
export async function saveMyPlatformProfile(user: User, patch: Pick<PlatformTeamUser, "firstName" | "lastName" | "email" | "telephone" | "profilePhotoRef">): Promise<PlatformTeamUser> { return (await request<{ user: PlatformTeamUser }>(user, "/api/platform/admin/team/me", { method: "PATCH", body: JSON.stringify(patch) })).user; }
export async function getPlatformTeam(user: User): Promise<PlatformTeamUser[]> { return (await request<{ users: PlatformTeamUser[] }>(user, "/api/platform/admin/team")).users; }
export async function updatePlatformTeamUser(user: User, id: string, patch: Partial<Pick<PlatformTeamUser, "firstName" | "lastName" | "email" | "role" | "capabilityOverrides">>): Promise<PlatformTeamUser> { return (await request<{ user: PlatformTeamUser }>(user, `/api/platform/admin/team/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) })).user; }
export async function setPlatformTeamUserStatus(user: User, id: string, active: boolean): Promise<PlatformTeamUser> { return (await request<{ user: PlatformTeamUser }>(user, `/api/platform/admin/team/${encodeURIComponent(id)}/${active ? "reactivate" : "disable"}`, { method: "POST", body: "{}" })).user; }
export async function lifecycleCommand(user: User, tenantId: string, command: "first" | "cancel" | "resubscribe", cancellationId?: string): Promise<{ cancellationId?: string }> {
  const body = command === "first" ? { confirmation: "I_UNDERSTAND_CANCEL_ARCHIVE", idempotencyKey: crypto.randomUUID() } : command === "cancel" ? { confirmation: "CANCEL_AND_ARCHIVE", cancellationId, idempotencyKey: crypto.randomUUID() } : { confirmation: "RESUBSCRIBE", idempotencyKey: crypto.randomUUID() };
  const path = command === "first" ? "cancel/confirmations" : command === "cancel" ? "cancel" : "resubscribe";
  return request<{ cancellationId?: string }>(user, `/api/platform/admin/tenants/${encodeURIComponent(tenantId)}/subscription/${path}`, { method: "POST", body: JSON.stringify(body) });
}
export async function getNexCommandTenantMembers(user: User, tenantId: string): Promise<NexCommandTenantMembers> { return request<NexCommandTenantMembers & { ok: true }>(user, `/api/platform/admin/tenants/${encodeURIComponent(tenantId)}/members`); }
export async function assignNexCommandTenantOwner(user: User, tenantId: string, toUserId: string): Promise<{ owner: NexCommandTenantMember; previousOwnerId: string | null }> { return request<{ owner: NexCommandTenantMember; previousOwnerId: string | null }>(user, `/api/platform/admin/tenants/${encodeURIComponent(tenantId)}/owner`, { method: "POST", body: JSON.stringify({ toUserId }) }); }
