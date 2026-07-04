import { assertNoSecretsInDocument } from "../services/secretGuard.js";
import { assertSafeTenantId } from "../services/tenantPathUtils.js";
import {
  isIsoDateString,
  isNonEmptyString,
  isPlainObject,
  isStringArray,
  pushIfInvalid,
} from "./schemaUtils.js";
import { assertValidTenantClientConfig, CLIENT_CHANNEL_KEYS, CHANNEL_STATUSES } from "./clientConfigSchema.js";

export const RUNTIME_SUMMARY_DOCUMENT_TYPE = "tenant-runtime-summary";

function summarizeChannels(channels = {}) {
  const statusByChannel = {};
  let connectedCount = 0;
  let pendingCount = 0;
  let blockedCount = 0;

  for (const key of CLIENT_CHANNEL_KEYS) {
    const status = channels[key]?.status || "not-configured";
    statusByChannel[key] = status;
    if (status === "connected") connectedCount += 1;
    if (status === "pending") pendingCount += 1;
    if (status === "blocked") blockedCount += 1;
  }

  return {
    statusByChannel,
    connectedCount,
    pendingCount,
    blockedCount,
  };
}

export function createTenantRuntimeSummary(overrides = {}) {
  const workflow = overrides.workflow || {};
  const connectivity = overrides.connectivity || {};
  const dashboard = overrides.dashboard || {};

  return {
    documentType: RUNTIME_SUMMARY_DOCUMENT_TYPE,
    schemaVersion: 1,
    tenantId: overrides.tenantId || "tenant-required",
    brandName: overrides.brandName || "",
    publicAgentName: overrides.publicAgentName || "Nexi",
    industry: overrides.industry || "field-service",
    tier: overrides.tier || "starter",
    status: overrides.status || "draft",
    workflow: {
      approvalMode: workflow.approvalMode || "draft_only",
      launchSequence: Array.isArray(workflow.launchSequence) ? [...workflow.launchSequence] : [],
      featureFlags: isPlainObject(workflow.featureFlags) ? { ...workflow.featureFlags } : {},
    },
    connectivity: {
      statusByChannel: isPlainObject(connectivity.statusByChannel) ? { ...connectivity.statusByChannel } : {},
      connectedCount: Number.isInteger(connectivity.connectedCount) ? connectivity.connectedCount : 0,
      pendingCount: Number.isInteger(connectivity.pendingCount) ? connectivity.pendingCount : 0,
      blockedCount: Number.isInteger(connectivity.blockedCount) ? connectivity.blockedCount : 0,
    },
    dashboard: {
      visibleKpis: Array.isArray(dashboard.visibleKpis) ? [...dashboard.visibleKpis] : [],
      ownerGoals: Array.isArray(dashboard.ownerGoals) ? [...dashboard.ownerGoals] : [],
      primaryContactName: dashboard.primaryContactName || "",
      serviceCount: Number.isInteger(dashboard.serviceCount) ? dashboard.serviceCount : 0,
      competitorCount: Number.isInteger(dashboard.competitorCount) ? dashboard.competitorCount : 0,
    },
    updatedAt: overrides.updatedAt || new Date().toISOString(),
  };
}

export function buildTenantRuntimeSummaryFromConfig(config, overrides = {}) {
  assertValidTenantClientConfig(config);
  const connectivity = summarizeChannels(config.channels);

  return createTenantRuntimeSummary({
    tenantId: config.tenantId,
    brandName: config.profile.brandName,
    publicAgentName: config.profile.publicAgentName,
    industry: config.profile.industry,
    tier: config.meta.tier,
    status: overrides.status || config.meta.status,
    workflow: {
      approvalMode: config.workflow.approvalMode,
      launchSequence: config.workflow.launchSequence,
      featureFlags: config.workflow.featureFlags,
    },
    connectivity,
    dashboard: {
      visibleKpis: config.dashboard.visibleKpis,
      ownerGoals: config.dashboard.ownerGoals,
      primaryContactName: config.profile.contact.primaryName,
      serviceCount: config.businessRules.services.length,
      competitorCount: config.businessRules.competitors.length,
    },
    updatedAt: overrides.updatedAt || new Date().toISOString(),
  });
}

export function validateTenantRuntimeSummary(summary) {
  const errors = [];

  try {
    assertNoSecretsInDocument(summary, "tenant runtime summary");
  } catch (error) {
    errors.push(error.message);
  }

  pushIfInvalid(errors, isPlainObject(summary), "Runtime summary must be a plain object.");
  if (errors.length) return errors;

  pushIfInvalid(errors, summary.documentType === RUNTIME_SUMMARY_DOCUMENT_TYPE, "Invalid runtime summary documentType.");
  pushIfInvalid(errors, summary.schemaVersion === 1, "Unsupported runtime summary schemaVersion.");
  pushIfInvalid(errors, isNonEmptyString(summary.tenantId, 3), "tenantId is required.");
  if (isNonEmptyString(summary.tenantId, 3)) {
    try {
      assertSafeTenantId(summary.tenantId);
    } catch (error) {
      errors.push(error.message);
    }
  }

  pushIfInvalid(errors, isNonEmptyString(summary.brandName, 2), "brandName is required.");
  pushIfInvalid(errors, isNonEmptyString(summary.publicAgentName, 2), "publicAgentName is required.");
  pushIfInvalid(errors, isNonEmptyString(summary.industry, 2), "industry is required.");
  pushIfInvalid(errors, isNonEmptyString(summary.tier, 2), "tier is required.");
  pushIfInvalid(errors, isNonEmptyString(summary.status, 2), "status is required.");
  pushIfInvalid(errors, isPlainObject(summary.workflow), "workflow must be present.");
  pushIfInvalid(errors, isPlainObject(summary.connectivity), "connectivity must be present.");
  pushIfInvalid(errors, isPlainObject(summary.dashboard), "dashboard must be present.");
  pushIfInvalid(errors, isIsoDateString(summary.updatedAt), "updatedAt must be an ISO-8601 string.");
  if (errors.length) return errors;

  pushIfInvalid(errors, isStringArray(summary.workflow.launchSequence), "workflow.launchSequence must be a string array.");
  pushIfInvalid(errors, isPlainObject(summary.workflow.featureFlags), "workflow.featureFlags must be a plain object.");

  pushIfInvalid(errors, isPlainObject(summary.connectivity.statusByChannel), "connectivity.statusByChannel must be an object.");
  pushIfInvalid(errors, Number.isInteger(summary.connectivity.connectedCount), "connectivity.connectedCount must be an integer.");
  pushIfInvalid(errors, Number.isInteger(summary.connectivity.pendingCount), "connectivity.pendingCount must be an integer.");
  pushIfInvalid(errors, Number.isInteger(summary.connectivity.blockedCount), "connectivity.blockedCount must be an integer.");
  if (isPlainObject(summary.connectivity.statusByChannel)) {
    for (const [channelKey, status] of Object.entries(summary.connectivity.statusByChannel)) {
      pushIfInvalid(
        errors,
        CHANNEL_STATUSES.includes(status),
        `connectivity.statusByChannel.${channelKey} must be one of: ${CHANNEL_STATUSES.join(", ")}.`
      );
    }
  }

  pushIfInvalid(errors, isStringArray(summary.dashboard.visibleKpis), "dashboard.visibleKpis must be a string array.");
  pushIfInvalid(errors, isStringArray(summary.dashboard.ownerGoals), "dashboard.ownerGoals must be a string array.");
  pushIfInvalid(errors, typeof summary.dashboard.primaryContactName === "string", "dashboard.primaryContactName must be a string.");
  pushIfInvalid(errors, Number.isInteger(summary.dashboard.serviceCount), "dashboard.serviceCount must be an integer.");
  pushIfInvalid(errors, Number.isInteger(summary.dashboard.competitorCount), "dashboard.competitorCount must be an integer.");

  return errors;
}

export function assertValidTenantRuntimeSummary(summary) {
  const errors = validateTenantRuntimeSummary(summary);
  if (errors.length) {
    throw new Error(`Invalid tenant runtime summary. ${errors.join(" ")}`);
  }
}

export const runtimeSummaryInternals = {
  summarizeChannels,
};
