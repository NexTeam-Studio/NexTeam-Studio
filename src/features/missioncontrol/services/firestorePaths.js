/**
 * firestorePaths.js — Centralized Firestore path construction for mission
 * control + tenant foundation collections.
 *
 * WHY THIS FILE EXISTS:
 *   - Shared code should never hand-roll Firestore paths from raw input.
 *   - Tenant IDs must be safe path segments, but must NOT be tied to a static
 *     allow-list. That blocks scale and is not real isolation.
 *   - Foundation collections (intakePackets, config, runtimeSummary, subagents)
 *     live alongside the older mission-control collections and should share the
 *     same tenant/path guardrails.
 */

import {
  sanitizeTenantId as sanitizeSegment,
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
} from "../../tenancy/services/tenantPathUtils.js";

export {
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

/**
 * Tenant-scoped SOP collection path.
 * @param {string} tenantId
 * @returns {string}
 */
export function sopCollectionPath(tenantId) {
  assertSafeTenantId(tenantId);
  return `tenants/${tenantId}/sops`;
}

/**
 * Tenant-scoped Blueprint collection path.
 * @param {string} tenantId
 * @returns {string}
 */
export function blueprintCollectionPath(tenantId) {
  assertSafeTenantId(tenantId);
  return `tenants/${tenantId}/blueprints`;
}

/**
 * Tenant-scoped OnboardingSessions collection path.
 * @param {string} tenantId
 * @returns {string}
 */
export function onboardingSessionCollectionPath(tenantId) {
  assertSafeTenantId(tenantId);
  return `tenants/${tenantId}/onboardingSessions`;
}

/**
 * Individual onboarding session document path.
 * @param {string} tenantId
 * @param {string} sessionId
 * @returns {string}
 */
export function onboardingSessionDocPath(tenantId, sessionId) {
  assertSafeTenantId(tenantId);
  const safeSessionId = sanitizeSegment(sessionId);
  if (!safeSessionId) throw new Error("[firestorePaths] Invalid sessionId");
  return `tenants/${tenantId}/onboardingSessions/${safeSessionId}`;
}

/**
 * Individual SOP document path.
 * @param {string} tenantId
 * @param {string} sopId
 * @returns {string}
 */
export function sopDocPath(tenantId, sopId) {
  assertSafeTenantId(tenantId);
  const safeSopId = sanitizeSegment(sopId);
  if (!safeSopId) throw new Error("[firestorePaths] Invalid sopId");
  return `tenants/${tenantId}/sops/${safeSopId}`;
}

/**
 * Individual Blueprint document path.
 * @param {string} tenantId
 * @param {string} blueprintId
 * @returns {string}
 */
export function blueprintDocPath(tenantId, blueprintId) {
  assertSafeTenantId(tenantId);
  const safeBlueprintId = sanitizeSegment(blueprintId);
  if (!safeBlueprintId) throw new Error("[firestorePaths] Invalid blueprintId");
  return `tenants/${tenantId}/blueprints/${safeBlueprintId}`;
}

/**
 * AgentSessions document path with sanitized sessionId.
 * @param {string} sessionId
 * @returns {string}
 */
export function agentSessionDocPath(sessionId) {
  const safeId = sanitizeSegment(sessionId);
  if (!safeId) throw new Error("[firestorePaths] Invalid agentSession sessionId");
  return `agentSessions/${safeId}`;
}

/**
 * ClientOrganizations document path.
 * @param {string} clientId
 * @returns {string}
 */
export function clientOrgDocPath(clientId) {
  const safeId = sanitizeSegment(clientId);
  if (!safeId) throw new Error("[firestorePaths] Invalid clientId");
  return `clientOrganizations/${safeId}`;
}

/**
 * Portal member document path (subcollection).
 * @param {string} clientId
 * @param {string} userId
 * @returns {string}
 */
export function portalMemberDocPath(clientId, userId) {
  const safeClientId = sanitizeSegment(clientId);
  const safeUserId = sanitizeSegment(userId);
  if (!safeClientId || !safeUserId) throw new Error("[firestorePaths] Invalid clientId or userId");
  return `clientOrganizations/${safeClientId}/members/${safeUserId}`;
}

/**
 * ClientOrganizations invite document path.
 * @param {string} clientId
 * @param {string} inviteId
 * @returns {string}
 */
export function clientOrgInviteDocPath(clientId, inviteId) {
  const safeClientId = sanitizeSegment(clientId);
  const safeInviteId = sanitizeSegment(inviteId);
  if (!safeClientId || !safeInviteId) throw new Error("[firestorePaths] Invalid clientId or inviteId");
  return `clientOrganizations/${safeClientId}/invites/${safeInviteId}`;
}

/**
 * ClientOrganizations delivery-state document path.
 * @param {string} clientId
 * @param {string} stateId
 * @returns {string}
 */
export function clientOrgDeliveryStateDocPath(clientId, stateId = "current") {
  const safeClientId = sanitizeSegment(clientId);
  const safeStateId = sanitizeSegment(stateId);
  if (!safeClientId || !safeStateId) throw new Error("[firestorePaths] Invalid clientId or stateId");
  return `clientOrganizations/${safeClientId}/deliveryState/${safeStateId}`;
}

/**
 * BlueprintRequests collection path.
 * @returns {string}
 */
export function blueprintRequestCollectionPath() {
  return "blueprintRequests";
}

/**
 * BlueprintRequests document path.
 * @param {string} requestId
 * @returns {string}
 */
export function blueprintRequestDocPath(requestId) {
  const safeRequestId = sanitizeSegment(requestId);
  if (!safeRequestId) throw new Error("[firestorePaths] Invalid blueprintRequest requestId");
  return `blueprintRequests/${safeRequestId}`;
}

/**
 * BlueprintRequests events subcollection path.
 * @param {string} requestId
 * @returns {string}
 */
export function blueprintRequestEventCollectionPath(requestId) {
  const safeRequestId = sanitizeSegment(requestId);
  if (!safeRequestId) throw new Error("[firestorePaths] Invalid blueprintRequest requestId");
  return `blueprintRequests/${safeRequestId}/events`;
}

/**
 * BlueprintRequests event document path.
 * @param {string} requestId
 * @param {string} eventId
 * @returns {string}
 */
export function blueprintRequestEventDocPath(requestId, eventId) {
  const safeRequestId = sanitizeSegment(requestId);
  const safeEventId = sanitizeSegment(eventId);
  if (!safeRequestId || !safeEventId) throw new Error("[firestorePaths] Invalid blueprintRequest requestId or eventId");
  return `blueprintRequests/${safeRequestId}/events/${safeEventId}`;
}

/**
 * Tenant-scoped Nexi v1 conversation log collection path.
 * @param {string} tenantId
 * @returns {string}
 */
export function nexiConversationLogCollectionPath(tenantId) {
  assertSafeTenantId(tenantId);
  return `tenants/${tenantId}/nexiConversationLog`;
}

/**
 * Tenant-scoped Nexi v1 conversation log document path.
 * @param {string} tenantId
 * @param {string} logId
 * @returns {string}
 */
export function nexiConversationLogDocPath(tenantId, logId) {
  assertSafeTenantId(tenantId);
  const safeLogId = sanitizeSegment(logId);
  if (!safeLogId) throw new Error("[firestorePaths] Invalid nexi conversation log id");
  return `tenants/${tenantId}/nexiConversationLog/${safeLogId}`;
}

/**
 * Tenant-scoped Nexi v1 failure log collection path.
 * @param {string} tenantId
 * @returns {string}
 */
export function nexiFailureLogCollectionPath(tenantId) {
  assertSafeTenantId(tenantId);
  return `tenants/${tenantId}/nexiFailureLog`;
}

/**
 * Tenant-scoped Nexi v1 failure log document path.
 * @param {string} tenantId
 * @param {string} failureId
 * @returns {string}
 */
export function nexiFailureLogDocPath(tenantId, failureId) {
  assertSafeTenantId(tenantId);
  const safeFailureId = sanitizeSegment(failureId);
  if (!safeFailureId) throw new Error("[firestorePaths] Invalid nexi failure log id");
  return `tenants/${tenantId}/nexiFailureLog/${safeFailureId}`;
}
