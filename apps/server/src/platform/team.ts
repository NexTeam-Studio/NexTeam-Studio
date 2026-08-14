import { randomUUID } from "node:crypto";
import { z } from "zod";

/** Platform personnel are NexTeam operators only; this is not a tenant role model. */
export const platformRoleSchema = z.enum(["Owner", "Super Admin", "Administrator", "Developer", "Developer Admin", "Support", "Sales & Onboarding", "Marketing", "Finance", "Read Only"]);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

export const platformCapabilitySchema = z.enum([
  "platform.profile.self", "platform.team.view", "platform.team.manage", "platform.ownership.manage",
  "platform.dashboard.view", "platform.tenants.view", "platform.tenants.manage", "platform.prospects.view", "platform.prospects.manage",
  "platform.onboarding.view", "platform.onboarding.manage", "platform.migrations.view", "platform.migrations.manage",
  "platform.support.view", "platform.support.manage", "platform.modules.view", "platform.modules.manage",
  "platform.integrations.view", "platform.integrations.manage", "platform.code.view", "platform.releases.view", "platform.releases.manage",
  "platform.usage.view", "platform.billing.view", "platform.billing.manage", "platform.security.view", "platform.security.manage",
  "platform.settings.view", "platform.settings.manage", "platform.production.manage"
]);
export type PlatformCapability = z.infer<typeof platformCapabilitySchema>;
export const PLATFORM_CAPABILITIES = platformCapabilitySchema.options;
export type PlatformCapabilityOverride = { grant: PlatformCapability[]; deny: PlatformCapability[] };
export const platformCapabilityOverrideSchema = z.object({ grant: z.array(platformCapabilitySchema).default([]), deny: z.array(platformCapabilitySchema).default([]) }).strict()
  .refine((value) => !value.grant.some((capability) => value.deny.includes(capability)), "A capability cannot be both granted and denied.");

const allExceptProduction = PLATFORM_CAPABILITIES.filter((capability) => capability !== "platform.production.manage" && capability !== "platform.ownership.manage");
const template = (capabilities: PlatformCapability[]): readonly PlatformCapability[] => Object.freeze([...capabilities]);
export const PLATFORM_ROLE_TEMPLATES: Readonly<Record<PlatformRole, readonly PlatformCapability[]>> = Object.freeze({
  Owner: template(PLATFORM_CAPABILITIES),
  "Super Admin": template(allExceptProduction),
  Administrator: template(["platform.profile.self", "platform.team.view", "platform.dashboard.view", "platform.tenants.view", "platform.tenants.manage", "platform.prospects.view", "platform.prospects.manage", "platform.onboarding.view", "platform.onboarding.manage", "platform.migrations.view", "platform.migrations.manage", "platform.support.view", "platform.support.manage", "platform.modules.view", "platform.integrations.view", "platform.usage.view", "platform.billing.view", "platform.settings.view"]),
  Developer: template(["platform.profile.self", "platform.dashboard.view", "platform.modules.view", "platform.integrations.view", "platform.code.view", "platform.releases.view"]),
  "Developer Admin": template(["platform.profile.self", "platform.dashboard.view", "platform.modules.view", "platform.modules.manage", "platform.integrations.view", "platform.integrations.manage", "platform.code.view", "platform.releases.view", "platform.releases.manage"]),
  Support: template(["platform.profile.self", "platform.dashboard.view", "platform.tenants.view", "platform.onboarding.view", "platform.migrations.view", "platform.support.view", "platform.support.manage"]),
  "Sales & Onboarding": template(["platform.profile.self", "platform.dashboard.view", "platform.prospects.view", "platform.prospects.manage", "platform.onboarding.view", "platform.onboarding.manage", "platform.tenants.view"]),
  Marketing: template(["platform.profile.self", "platform.dashboard.view", "platform.prospects.view", "platform.usage.view"]),
  Finance: template(["platform.profile.self", "platform.dashboard.view", "platform.tenants.view", "platform.billing.view", "platform.billing.manage", "platform.usage.view"]),
  "Read Only": template(["platform.profile.self", "platform.dashboard.view"])
});

export function resolvePlatformCapabilities(role: PlatformRole, overrides: PlatformCapabilityOverride = { grant: [], deny: [] }): PlatformCapability[] {
  const granted = new Set([...PLATFORM_ROLE_TEMPLATES[role], ...overrides.grant]);
  for (const capability of overrides.deny) granted.delete(capability);
  return PLATFORM_CAPABILITIES.filter((capability) => granted.has(capability));
}

export const platformUserSchema = z.object({
  id: z.string().min(1), authUid: z.string().min(1), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), email: z.string().trim().toLowerCase().email(),
  telephone: z.string().trim().min(1).max(50).optional(), address: z.object({ line1: z.string().trim().min(1).max(200), line2: z.string().trim().max(200).optional(), city: z.string().trim().min(1).max(100), region: z.string().trim().min(1).max(100), postalCode: z.string().trim().min(1).max(30), country: z.string().trim().min(2).max(2) }).optional(), profilePhotoRef: z.string().trim().min(1).max(500).optional(),
  role: platformRoleSchema, accountClass: z.literal("internal").default("internal"), capabilityOverrides: platformCapabilityOverrideSchema.default({ grant: [], deny: [] }), accountStatus: z.enum(["ACTIVE", "DISABLED"]), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), createdBy: z.string().min(1), updatedBy: z.string().min(1)
});
export type PlatformUser = z.infer<typeof platformUserSchema>;
export const platformUserAuditSchema = z.object({ id: z.string().min(1), userId: z.string().min(1), action: z.enum(["platform_user.added", "platform_user.updated", "platform_user.disabled", "platform_user.reactivated", "platform_user.ownership_transferred", "platform_user.protected_owner_identity_recovered"]), actorUid: z.string().min(1), createdAt: z.string().datetime(), detail: z.string().max(500) }).strict();
export type PlatformUserAudit = z.infer<typeof platformUserAuditSchema>;
export function platformUserSummary(user: PlatformUser): Pick<PlatformUser, "id" | "firstName" | "lastName" | "role" | "accountStatus" | "profilePhotoRef" | "updatedAt"> { return { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role, accountStatus: user.accountStatus, profilePhotoRef: user.profilePhotoRef, updatedAt: user.updatedAt }; }
export function newPlatformUserAudit(userId: string, action: PlatformUserAudit["action"], actorUid: string, detail: string, now = new Date().toISOString()): PlatformUserAudit { return platformUserAuditSchema.parse({ id: `platform_user_audit_${randomUUID()}`, userId, action, actorUid, createdAt: now, detail }); }
