import { randomUUID } from "node:crypto";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { FirestorePlatformRepository } from "../apps/server/dist/platform/repository.js";
import { createCommsRailFromEnv } from "../apps/server/dist/comms/gmailRegistry.js";
import { createOwnerInviteSender, newOwnerInvite } from "../apps/server/dist/platform/tenantOwnerInvite.js";
import { newPlatformSecurityAudit } from "../apps/server/dist/platform/sessionSecurity.js";

const tenantName = argument("--tenant-name");
const ownerEmail = argument("--owner-email").toLowerCase();
const verifyOnly = process.argv.includes("--verify-only");
const actorUid = String(process.env.NEXTEAM_OPERATOR_UID || process.env.FIREBASE_PLATFORM_OPERATOR_UIDS || "").split(",")[0]?.trim();
if (!tenantName || !ownerEmail || !actorUid) throw new Error("Staging owner-invite service acceptance requires tenant name, owner email, and approved operator UID.");

function argument(name) {
  const position = process.argv.indexOf(name);
  return position >= 0 ? String(process.argv[position + 1] || "").trim() : "";
}

function credentials() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (raw) return JSON.parse(raw);
  const projectId = String(process.env.FIREBASE_ADMIN_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim();
  const privateKey = String(process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").trim().replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Staging Firebase Admin credentials are unavailable.");
  return { projectId, clientEmail, privateKey };
}

function sanitizedFailureCode(error) {
  const raw = typeof error === "object" && error && "code" in error ? String(error.code) : "UNKNOWN";
  return raw.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120) || "UNKNOWN";
}

function sanitizedFailureReason(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown provider failure.");
  return message
    .replace(/https?:\/\/[^\s)]+/gi, "<url>")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "<email>")
    .replace(/(refresh[_ -]?token|client[_ -]?secret|password|private[_ -]?key)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .slice(0, 300);
}

const app = initializeApp({ credential: cert(credentials()) }, `staging-owner-invite-service-${randomUUID()}`);
const auth = getAuth(app);
const repository = new FirestorePlatformRepository(getFirestore(app));

try {
  const tenants = (await repository.listTenants()).filter((tenant) => tenant.name === tenantName);
  if (tenants.length !== 1) throw new Error(`Expected exactly one staging tenant for owner-invite acceptance; found ${tenants.length}.`);
  const tenant = tenants[0];
  const ownersBefore = (await repository.listTenantUsers(tenant.id)).filter((user) => user.role === "OWNER" && user.active !== false && user.email?.toLowerCase() === ownerEmail);
  if (ownersBefore.length !== 1 || !ownersBefore[0].authUid) throw new Error("The expected active staging owner identity was not uniquely linked to the tenant.");
  const owner = ownersBefore[0];
  const ownerAuth = await auth.getUser(owner.authUid);
  const tenantClaimMatches = ownerAuth.customClaims?.tenantId === tenant.id && ownerAuth.customClaims?.tenantRole === "OWNER";
  if (!tenantClaimMatches) throw new Error("The staging owner Firebase claims do not match the requested tenant.");
  const subscriptionsBefore = await repository.listSubscriptions(tenant.id);
  const existing = await repository.getTenantOwnerInvite(tenant.id, owner.id);
  if (verifyOnly) {
    console.log(JSON.stringify({
      stagingOnly: true,
      tenantMatch: true,
      ownerMatch: true,
      tenantId: tenant.id,
      existingInviteStatus: existing?.status || "NONE",
      existingProviderAcceptance: existing?.providerMessageId ? "RECORDED" : "NOT_RECORDED",
      existingAuditVerification: "NOT_QUERIED_IN_VERIFY_ONLY_MODE",
      duplicateProtection: "NO_MUTATION_PERFORMED"
    }));
    process.exitCode = existing?.providerMessageId ? 0 : 2;
  } else {
  const rail = createCommsRailFromEnv(process.env);
  const continueUrl = `${String(process.env.PUBLIC_BASE_URL || "https://nexstage.nexteam.studio").replace(/\/$/, "")}/nexops/sign-in`;
  const sender = createOwnerInviteSender({ auth, email: rail.sendAdapter, continueUrl });
  const timestamp = new Date().toISOString();
  let providerFailureCode = null;
  let providerFailureReason = null;
  let invite = newOwnerInvite({ tenantId: tenant.id, ownerUserId: owner.id, ownerEmail: owner.email, status: "NOT_SENT", attemptCount: existing?.attemptCount ?? 0, now: timestamp });
  try {
    const receipt = await sender.send({ tenantId: tenant.id, ownerEmail: owner.email, ownerName: owner.displayName, tenantName: tenant.name });
    invite = { ...invite, status: "SENT_TO_PROVIDER", attemptCount: invite.attemptCount + 1, provider: receipt.provider, providerMessageId: receipt.messageId, updatedAt: timestamp };
    await repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("tenant_owner_invite.sent", actorUid, `Owner invitation accepted by ${receipt.provider} for tenant ${tenant.id}.`, owner.authUid, timestamp));
  } catch (error) {
    const failureCode = sanitizedFailureCode(error);
    providerFailureCode = failureCode;
    providerFailureReason = sanitizedFailureReason(error);
    invite = { ...invite, status: "FAILED", attemptCount: invite.attemptCount + 1, lastError: `OWNER_INVITE_SEND_${failureCode}`, updatedAt: timestamp };
    await repository.appendPlatformSecurityAudit(newPlatformSecurityAudit("tenant_owner_invite.failed", actorUid, `Owner invitation was not accepted for tenant ${tenant.id}.`, owner.authUid, timestamp));
  } finally {
    await repository.saveTenantOwnerInvite(invite);
  }
  const ownersAfter = (await repository.listTenantUsers(tenant.id)).filter((user) => user.role === "OWNER" && user.active !== false && user.email?.toLowerCase() === ownerEmail);
  const subscriptionsAfter = await repository.listSubscriptions(tenant.id);
  const persistedInvite = await repository.getTenantOwnerInvite(tenant.id, owner.id);
  const audits = await repository.listPlatformSecurityAudits();
  const auditRecorded = audits.some((audit) => audit.action === "tenant_owner_invite.sent" && audit.subjectUid === owner.authUid && audit.createdAt >= timestamp);
  const accepted = persistedInvite?.status === "SENT_TO_PROVIDER" && Boolean(persistedInvite.providerMessageId);
  console.log(JSON.stringify({
    stagingOnly: true,
    tenantMatch: true,
    ownerMatch: true,
    tenantId: tenant.id,
    providerAcceptance: accepted ? "ACCEPTED" : "NOT_ACCEPTED",
    provider: accepted ? persistedInvite.provider : "UNAVAILABLE",
    messageId: accepted ? persistedInvite.providerMessageId : null,
    providerFailureCode,
    providerFailureReason,
    invitationRecord: persistedInvite?.tenantId === tenant.id && persistedInvite.ownerUserId === owner.id ? "UPDATED" : "NOT_UPDATED",
    auditEvent: auditRecorded ? "RECORDED" : "MISSING",
    duplicateProtection: ownersAfter.length === ownersBefore.length && subscriptionsAfter.length === subscriptionsBefore.length ? "PASSED" : "FAILED",
    firebaseResetLink: "FIREBASE_GENERATED_FOR_LINKED_OWNER_NOT_PERSISTED",
    inboxDelivery: "REQUIRES_RECIPIENT_CONFIRMATION"
  }));
  if (!accepted || !auditRecorded || ownersAfter.length !== ownersBefore.length || subscriptionsAfter.length !== subscriptionsBefore.length) process.exitCode = 1;
  }
} finally {
  await deleteApp(app).catch(() => undefined);
}
