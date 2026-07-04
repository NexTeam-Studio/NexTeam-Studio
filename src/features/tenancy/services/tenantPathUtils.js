/**
 * Tenant path + identity utilities for NexTeam multi-tenant foundation work.
 *
 * These helpers are deliberately generic and do not know about Aquatrace,
 * case-study tenants, or any allow-list. The only rule is: valid tenant IDs
 * must be safe path segments and deterministic across layers.
 */

export const SAFE_TENANT_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function sanitizeSegment(segment) {
  if (typeof segment !== "string") return "";
  return segment
    .toLowerCase()
    .replace(/[/\\\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
}

export function sanitizeTenantId(tenantId) {
  return sanitizeSegment(tenantId);
}

export function isSafeTenantId(tenantId) {
  return typeof tenantId === "string" && SAFE_TENANT_ID_REGEX.test(tenantId) && tenantId.length <= 64;
}

export function assertSafeTenantId(tenantId) {
  if (!isSafeTenantId(tenantId)) {
    throw new Error(
      `Invalid tenantId "${String(tenantId || "")}". Tenant IDs must match ${SAFE_TENANT_ID_REGEX} and stay within 64 characters.`
    );
  }
}

export function tenantRootDocPath(tenantId) {
  assertSafeTenantId(tenantId);
  return `tenants/${tenantId}`;
}

export function tenantIntakePacketCollectionPath(tenantId) {
  assertSafeTenantId(tenantId);
  return `tenants/${tenantId}/intakePackets`;
}

export function tenantIntakePacketDocPath(tenantId, packetId) {
  assertSafeTenantId(tenantId);
  const safePacketId = sanitizeSegment(packetId);
  if (!safePacketId) throw new Error("Invalid intake packet id.");
  return `tenants/${tenantId}/intakePackets/${safePacketId}`;
}

export function tenantConfigCollectionPath(tenantId) {
  assertSafeTenantId(tenantId);
  return `tenants/${tenantId}/config`;
}

export function tenantConfigDocPath(tenantId, configId = "current") {
  assertSafeTenantId(tenantId);
  const safeConfigId = sanitizeSegment(configId);
  if (!safeConfigId) throw new Error("Invalid tenant config id.");
  return `tenants/${tenantId}/config/${safeConfigId}`;
}

export function tenantRuntimeSummaryCollectionPath(tenantId) {
  assertSafeTenantId(tenantId);
  return `tenants/${tenantId}/runtimeSummary`;
}

export function tenantRuntimeSummaryDocPath(tenantId, summaryId = "current") {
  assertSafeTenantId(tenantId);
  const safeSummaryId = sanitizeSegment(summaryId);
  if (!safeSummaryId) throw new Error("Invalid runtime summary id.");
  return `tenants/${tenantId}/runtimeSummary/${safeSummaryId}`;
}

export function tenantSubagentCollectionPath(tenantId) {
  assertSafeTenantId(tenantId);
  return `tenants/${tenantId}/subagents`;
}

export function tenantSubagentDocPath(tenantId, subagentId) {
  assertSafeTenantId(tenantId);
  const safeSubagentId = sanitizeSegment(subagentId);
  if (!safeSubagentId) throw new Error("Invalid subagent id.");
  return `tenants/${tenantId}/subagents/${safeSubagentId}`;
}

export const tenantPathUtils = {
  SAFE_TENANT_ID_REGEX,
  sanitizeTenantId,
  isSafeTenantId,
  assertSafeTenantId,
  tenantRootDocPath,
  tenantIntakePacketCollectionPath,
  tenantIntakePacketDocPath,
  tenantConfigCollectionPath,
  tenantConfigDocPath,
  tenantRuntimeSummaryCollectionPath,
  tenantRuntimeSummaryDocPath,
  tenantSubagentCollectionPath,
  tenantSubagentDocPath,
};
