import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

export const NEXCOMMAND_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const platformSessionSchema = z.object({
  id: z.string().min(1), actorUid: z.string().min(1), capabilities: z.array(z.string().min(1)), tokenHash: z.string().length(64), createdAt: z.string().datetime(), lastActivityAt: z.string().datetime(), invalidatedAt: z.string().datetime().optional(), invalidationReason: z.enum(["explicit_sign_out", "idle_expired"]).optional()
}).strict();
export type PlatformSession = z.infer<typeof platformSessionSchema>;

export const platformSecurityAuditSchema = z.object({
  id: z.string().min(1), action: z.enum(["platform_session.created", "platform_session.failed_sign_in", "platform_session.signed_out", "platform_session.idle_expired", "platform_user.profile_or_permission_changed"]), actorUid: z.string().min(1), subjectUid: z.string().min(1).optional(), createdAt: z.string().datetime(), detail: z.string().max(500)
}).strict();
export type PlatformSecurityAudit = z.infer<typeof platformSecurityAuditSchema>;

export function newNexCommandSession(actorUid: string, capabilities: string[], now = new Date().toISOString()): { session: PlatformSession; token: string } {
  const token = `ncs_${randomUUID()}${randomUUID().replaceAll("-", "")}`;
  return { token, session: platformSessionSchema.parse({ id: `platform_session_${randomUUID()}`, actorUid, capabilities, tokenHash: hashSessionToken(token), createdAt: now, lastActivityAt: now }) };
}
export function hashSessionToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function newPlatformSecurityAudit(action: PlatformSecurityAudit["action"], actorUid: string, detail: string, subjectUid?: string, now = new Date().toISOString()): PlatformSecurityAudit {
  return platformSecurityAuditSchema.parse({ id: `platform_security_audit_${randomUUID()}`, action, actorUid, ...(subjectUid ? { subjectUid } : {}), createdAt: now, detail });
}
