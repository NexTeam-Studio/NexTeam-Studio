import { randomUUID } from "node:crypto";
import { RailError, type Tenant, type TenantMembershipAudit, type TenantUser } from "@nexteam/core";
import { buildTenantUser, capabilitiesForTenantUser } from "./accessManagement.js";
import { defaultTenant, subscriptionFromStripe, type PlatformRepository } from "./repository.js";
import { ALL_ACCESS_TEST_PACKAGE } from "./subscriptionPackages.js";
import { generatedTenantId, newOwnerInvite, type OwnerInviteSender, type TenantOwnerInvite } from "./tenantOwnerInvite.js";

export interface FirebaseActivationUser {
  uid: string;
  email?: string | undefined;
  customClaims?: Record<string, unknown> | undefined;
}

/** Narrow Firebase seam: activation never needs or accepts a password. */
export interface FirebaseOwnerActivation {
  getUserByEmail(email: string): Promise<FirebaseActivationUser>;
  createUser(input: { email: string; emailVerified: false; disabled: false; displayName?: string }): Promise<FirebaseActivationUser>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  generatePasswordResetLink(email: string, settings: { url: string; handleCodeInApp: false }): Promise<string>;
}

export interface ActivateProspectTenantInput {
  prospectId: string;
  tenantId?: string | undefined;
  ownerEmail: string;
  ownerDisplayName: string;
  now?: string | undefined;
}

export interface ProspectTenantActivationResult {
  tenant: Tenant;
  owner: TenantUser;
  ownerCreated: boolean;
  subscriptionId: string;
  activationAlreadyExisted: boolean;
  invite: TenantOwnerInvite;
}

function timestamp(input?: string): string {
  return input ?? new Date().toISOString();
}

export async function getOrCreateFirebaseOwner(auth: FirebaseOwnerActivation, input: { email: string; displayName?: string | undefined }): Promise<{ user: FirebaseActivationUser; created: boolean }> {
  try {
    return { user: await auth.getUserByEmail(input.email), created: false };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code !== "auth/user-not-found") throw error;
    try {
      return {
        user: await auth.createUser({
          email: input.email,
          emailVerified: false,
          disabled: false,
          ...(input.displayName ? { displayName: input.displayName } : {})
        }),
        created: true
      };
    } catch (createError) {
      const createCode = typeof createError === "object" && createError !== null && "code" in createError ? String(createError.code) : "";
      if (createCode !== "auth/email-already-exists") throw createError;
      return { user: await auth.getUserByEmail(input.email), created: false };
    }
  }
}

async function getOrCreateOwner(auth: FirebaseOwnerActivation, input: ActivateProspectTenantInput): Promise<{ user: FirebaseActivationUser; created: boolean }> {
  return getOrCreateFirebaseOwner(auth, { email: input.ownerEmail, displayName: input.ownerDisplayName });
}

/**
 * Applies tenant context without touching the platform-operator `role` claim
 * or any other existing non-tenant claim.
 */
export function mergeTenantOwnerClaims(existing: Record<string, unknown> | undefined, owner: TenantUser): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    tenantId: owner.tenantId,
    tenantRole: owner.role,
    tenantUserId: owner.id,
    tenantCapabilities: capabilitiesForTenantUser(owner)
  };
}

export async function activateProspectTenant(
  repository: PlatformRepository,
  auth: FirebaseOwnerActivation,
  input: ActivateProspectTenantInput,
  inviteSender: OwnerInviteSender | null
): Promise<ProspectTenantActivationResult> {
  const prospect = await repository.getProspect(input.prospectId);
  if (!prospect) throw new RailError("Prospect was not found.", { provider: "platform", op: "activateTenant", status: 404 });
  const assignment = await repository.getPlatformSubscriptionAssignment(prospect.id);
  if (prospect.status === "CONVERTED" && assignment?.status === "ACTIVE" && assignment.tenantId) {
    const tenant = await repository.getTenant(assignment.tenantId);
    const firebaseOwner = await getOrCreateOwner(auth, input);
    const owner = await repository.getTenantUser(tenant?.id ?? assignment.tenantId, `tenant_owner_${firebaseOwner.user.uid}`);
    if (!tenant || !owner || owner.email?.toLowerCase() !== input.ownerEmail.toLowerCase()) {
      throw new RailError("Activation is already complete for this prospect and cannot be changed by a duplicate request.", { provider: "platform", op: "activateTenant", status: 409 });
    }
    const invite = await repository.getTenantOwnerInvite(tenant.id, owner.id) ?? newOwnerInvite({ tenantId: tenant.id, ownerUserId: owner.id, ownerEmail: owner.email ?? input.ownerEmail, status: "NOT_SENT", attemptCount: 0 });
    const subscription = await repository.getSubscription(tenant.id);
    if (!subscription) throw new RailError("Activation is missing its tenant subscription.", { provider: "platform", op: "activateTenant", status: 409 });
    return { tenant, owner, ownerCreated: false, subscriptionId: subscription.id, activationAlreadyExisted: true, invite };
  }
  if (prospect.status !== "SUBSCRIPTION_REQUIRED") {
    throw new RailError("A valid subscription assignment is required before tenant activation.", { provider: "platform", op: "activateTenant", status: 409 });
  }
  if (!assignment || assignment.status !== "ASSIGNED" || assignment.packageId !== ALL_ACCESS_TEST_PACKAGE.id || assignment.packageVersion !== ALL_ACCESS_TEST_PACKAGE.version) {
    throw new RailError("The required All Access Test subscription assignment is missing or invalid.", { provider: "platform", op: "activateTenant", status: 409 });
  }
  const tenantId = input.tenantId ?? generatedTenantId();
  const existingTenant = await repository.getTenant(tenantId);
  if (existingTenant) throw new RailError("Tenant id is already in use.", { provider: "platform", op: "activateTenant", status: 409 });

  const now = timestamp(input.now);
  const firebaseOwner = await getOrCreateOwner(auth, input);
  const tenant: Tenant = {
    ...defaultTenant(tenantId, "suite"),
    name: prospect.businessName,
    industryPack: prospect.industry === "pressure_washing" ? "pressure_washing" : "pool_leak"
  };
  const owner = buildTenantUser({
    tenantId: tenant.id,
    id: `tenant_owner_${firebaseOwner.user.uid}`,
    authUid: firebaseOwner.user.uid,
    email: input.ownerEmail,
    displayName: input.ownerDisplayName,
    role: "OWNER",
    now
  });
  const subscription = subscriptionFromStripe({ tenantId: tenant.id, plan: "suite", status: "active" });
  const audit: TenantMembershipAudit = {
    id: `membership_audit_${randomUUID()}`,
    tenantId: tenant.id,
    action: "member.claims_applied",
    actorId: "platform_operator",
    targetUserId: owner.id,
    detail: "Initial owner activated with merged tenant claims; no password was stored or set.",
    createdAt: now
  };
  const committed = await repository.commitProspectTenantActivation({
    tenant,
    owner,
    subscription,
    assignment: { ...assignment, tenantId: tenant.id, status: "ACTIVE", updatedAt: now },
    prospect: { ...prospect, status: "CONVERTED", updatedAt: now },
    audit
  });
  await auth.setCustomUserClaims(firebaseOwner.user.uid, mergeTenantOwnerClaims(firebaseOwner.user.customClaims, owner));
  const previousInvite = await repository.getTenantOwnerInvite(tenant.id, owner.id);
  let invite = newOwnerInvite({ tenantId: tenant.id, ownerUserId: owner.id, ownerEmail: owner.email ?? input.ownerEmail, status: "NOT_SENT", attemptCount: previousInvite?.attemptCount ?? 0 });
  try {
    if (!inviteSender) throw new RailError("Owner invite email delivery is not configured.", { provider: "gmail", op: "sendOwnerInvite", status: 503 });
    const receipt = await inviteSender.send({ tenantId: tenant.id, ownerEmail: invite.ownerEmail, ownerName: owner.displayName, tenantName: tenant.name });
    invite = { ...invite, status: "SENT_TO_PROVIDER", attemptCount: invite.attemptCount + 1, provider: receipt.provider, providerMessageId: receipt.messageId, lastError: undefined, updatedAt: new Date().toISOString() };
  } catch (error) {
    invite = { ...invite, status: "FAILED", attemptCount: invite.attemptCount + 1, lastError: error instanceof Error ? error.message : "Owner invite delivery failed.", updatedAt: new Date().toISOString() };
  }
  await repository.saveTenantOwnerInvite(invite);
  return { tenant, owner, ownerCreated: firebaseOwner.created && !committed.alreadyExisted, subscriptionId: subscription.id, activationAlreadyExisted: committed.alreadyExisted, invite };
}
