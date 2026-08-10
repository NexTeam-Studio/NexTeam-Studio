import { randomUUID } from "node:crypto";
import { z } from "zod";

/**
 * Platform personnel are NexTeam operators, not tenant users.  This contract
 * deliberately contains no tenantId and never grants tenant capabilities.
 */
export const platformTeamCapabilitySchema = z.enum(["platform.team.view", "platform.team.manage", "platform.profile.self"]);
export type PlatformTeamCapability = z.infer<typeof platformTeamCapabilitySchema>;
export const PLATFORM_TEAM_CAPABILITIES: PlatformTeamCapability[] = ["platform.team.view", "platform.team.manage", "platform.profile.self"];

export const platformUserSchema = z.object({
  id: z.string().min(1),
  authUid: z.string().min(1),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().email(),
  telephone: z.string().trim().min(1).max(50).optional(),
  address: z.object({ line1: z.string().trim().min(1).max(200), line2: z.string().trim().max(200).optional(), city: z.string().trim().min(1).max(100), region: z.string().trim().min(1).max(100), postalCode: z.string().trim().min(1).max(30), country: z.string().trim().min(2).max(2) }).optional(),
  profilePhotoRef: z.string().trim().min(1).max(500).optional(),
  role: z.string().trim().min(1).max(100),
  accountStatus: z.enum(["ACTIVE", "DISABLED"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1)
}).strict();
export type PlatformUser = z.infer<typeof platformUserSchema>;

export const platformUserAuditSchema = z.object({
  id: z.string().min(1), userId: z.string().min(1), action: z.enum(["platform_user.added", "platform_user.updated", "platform_user.disabled", "platform_user.reactivated"]), actorUid: z.string().min(1), createdAt: z.string().datetime(), detail: z.string().max(500)
}).strict();
export type PlatformUserAudit = z.infer<typeof platformUserAuditSchema>;

export function platformUserSummary(user: PlatformUser): Pick<PlatformUser, "id" | "firstName" | "lastName" | "role" | "accountStatus" | "profilePhotoRef" | "updatedAt"> {
  return { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role, accountStatus: user.accountStatus, profilePhotoRef: user.profilePhotoRef, updatedAt: user.updatedAt };
}

export function newPlatformUserAudit(userId: string, action: PlatformUserAudit["action"], actorUid: string, detail: string, now = new Date().toISOString()): PlatformUserAudit {
  return platformUserAuditSchema.parse({ id: `platform_user_audit_${randomUUID()}`, userId, action, actorUid, createdAt: now, detail });
}
