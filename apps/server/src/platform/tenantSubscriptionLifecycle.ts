import { randomUUID } from "node:crypto";
import { RailError, type Tenant, type TenantSubscription, type TenantUser } from "@nexteam/core";
import type { PlatformRepository } from "./repository.js";

export const TENANT_LIFECYCLE = { active: "ACTIVE", archived: "DISABLED_ARCHIVED" } as const;

function active(tenant: Tenant): boolean {
  return tenant.lifecycleState !== TENANT_LIFECYCLE.archived;
}

function auditId(action: string, tenantId: string, correlationId: string): string {
  return `tenant_lifecycle_${action}_${tenantId}_${correlationId}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

async function owner(repository: PlatformRepository, tenantId: string, tenantUserId: string): Promise<TenantUser> {
  const user = await repository.getTenantUser(tenantId, tenantUserId);
  if (!user || user.role !== "OWNER" || !user.active) {
    throw new RailError("Only the active tenant owner can change this subscription.", { provider: "platform", op: "tenantSubscriptionLifecycle", status: 403 });
  }
  return user;
}

async function auditByCorrelation(repository: PlatformRepository, tenantId: string, action: string, correlationId: string) {
  return (await repository.listTenantMembershipAudits(tenantId)).find((event) => event.action === action && event.correlationId === correlationId) ?? null;
}

export async function assertActiveTenantLifecycle(repository: PlatformRepository, tenantId: string, op = "tenantAccess"): Promise<void> {
  const tenant = await repository.getTenant(tenantId);
  if (tenant?.lifecycleState === TENANT_LIFECYCLE.archived) {
    throw new RailError("This tenant is disabled and archived. Resubscribe to restore access.", { provider: "platform", op, status: 403 });
  }
}

export async function requestSubscriptionCancellation(input: { repository: PlatformRepository; tenantId: string; tenantUserId: string; idempotencyKey: string; now?: string }) {
  const now = input.now ?? new Date().toISOString();
  const tenant = await input.repository.getTenant(input.tenantId);
  if (!tenant) throw new RailError("Tenant was not found.", { provider: "platform", op: "requestSubscriptionCancellation", status: 404 });
  await owner(input.repository, input.tenantId, input.tenantUserId);
  const correlationId = `cancel_${input.idempotencyKey}`;
  const existing = await auditByCorrelation(input.repository, input.tenantId, "tenant.cancellation_confirmation_one", correlationId);
  if (existing) return { cancellationId: correlationId, confirmationRecorded: true, alreadyExisted: true };
  if (!active(tenant)) throw new RailError("This tenant is already disabled and archived.", { provider: "platform", op: "requestSubscriptionCancellation", status: 409 });
  await input.repository.saveTenantMembershipAudit({
    id: auditId("confirmation_one", input.tenantId, correlationId), tenantId: input.tenantId,
    action: "tenant.cancellation_confirmation_one", actorId: input.tenantUserId, targetUserId: input.tenantUserId,
    correlationId, detail: "First deliberate subscription-cancellation confirmation recorded; no access changed.", createdAt: now
  });
  return { cancellationId: correlationId, confirmationRecorded: true, alreadyExisted: false };
}

export async function confirmSubscriptionCancellation(input: { repository: PlatformRepository; tenantId: string; tenantUserId: string; cancellationId: string; idempotencyKey: string; now?: string }) {
  const now = input.now ?? new Date().toISOString();
  const tenant = await input.repository.getTenant(input.tenantId);
  if (!tenant) throw new RailError("Tenant was not found.", { provider: "platform", op: "confirmSubscriptionCancellation", status: 404 });
  await owner(input.repository, input.tenantId, input.tenantUserId);
  const first = await auditByCorrelation(input.repository, input.tenantId, "tenant.cancellation_confirmation_one", input.cancellationId);
  if (!first || first.actorId !== input.tenantUserId) throw new RailError("A separate first cancellation confirmation from this owner is required.", { provider: "platform", op: "confirmSubscriptionCancellation", status: 409 });
  const existing = await auditByCorrelation(input.repository, input.tenantId, "tenant.subscription_canceled", input.cancellationId);
  if (existing) return { tenant: await input.repository.getTenant(input.tenantId), alreadyExisted: true };
  if (!active(tenant)) throw new RailError("This tenant is already disabled and archived.", { provider: "platform", op: "confirmSubscriptionCancellation", status: 409 });
  const updated = await input.repository.upsertTenant({ ...tenant, lifecycleState: TENANT_LIFECYCLE.archived, lifecycleUpdatedAt: now });
  await input.repository.saveTenantMembershipAudit({
    id: auditId("canceled", input.tenantId, input.cancellationId), tenantId: input.tenantId,
    action: "tenant.subscription_canceled", actorId: input.tenantUserId, targetUserId: input.tenantUserId,
    correlationId: input.cancellationId, detail: "Second deliberate confirmation disabled and archived the tenant; no tenant data was deleted.", createdAt: now
  });
  return { tenant: updated, alreadyExisted: false };
}

export async function resubscribeTenant(input: { repository: PlatformRepository; tenantId: string; tenantUserId: string; idempotencyKey: string; now?: string }) {
  const now = input.now ?? new Date().toISOString();
  const tenant = await input.repository.getTenant(input.tenantId);
  if (!tenant) throw new RailError("Tenant was not found.", { provider: "platform", op: "resubscribeTenant", status: 404 });
  await owner(input.repository, input.tenantId, input.tenantUserId);
  const correlationId = `resubscribe_${input.idempotencyKey}`;
  const existing = await auditByCorrelation(input.repository, input.tenantId, "tenant.resubscribed", correlationId);
  if (existing?.subscriptionId) return { tenant: await input.repository.getTenant(input.tenantId), subscription: (await input.repository.listSubscriptions(input.tenantId)).find((subscription) => subscription.id === existing.subscriptionId)!, alreadyExisted: true };
  if (active(tenant)) throw new RailError("This tenant already has normal access.", { provider: "platform", op: "resubscribeTenant", status: 409 });
  const subscription: TenantSubscription = { id: `sub_${randomUUID()}`, tenantId: tenant.id, plan: tenant.plan, status: "active", updatedAt: now };
  await input.repository.saveSubscription(subscription);
  const updated = await input.repository.upsertTenant({ ...tenant, lifecycleState: TENANT_LIFECYCLE.active, lifecycleUpdatedAt: now });
  await input.repository.saveTenantMembershipAudit({
    id: auditId("resubscribed", input.tenantId, correlationId), tenantId: input.tenantId,
    action: "tenant.resubscribed", actorId: input.tenantUserId, targetUserId: input.tenantUserId,
    correlationId, subscriptionId: subscription.id, detail: "New immutable subscription restored access to the existing tenant, owner, and preserved data.", createdAt: now
  });
  return { tenant: updated, subscription, alreadyExisted: false };
}
