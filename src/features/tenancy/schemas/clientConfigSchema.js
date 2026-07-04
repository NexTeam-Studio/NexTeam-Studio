import { assertNoSecretsInDocument } from "../services/secretGuard.js";
import { assertSafeTenantId } from "../services/tenantPathUtils.js";
import {
  isBoolean,
  isHexColor,
  isIsoDateString,
  isNonEmptyString,
  isOptionalNonEmptyString,
  isOptionalString,
  isPlainObject,
  isStringArray,
  isValidEmail,
  isValidPhone,
  isValidUrl,
  pushIfInvalid,
  uniqueStringList,
} from "./schemaUtils.js";

export const CLIENT_CONFIG_DOCUMENT_TYPE = "tenant-client-config";
export const CLIENT_TIERS = ["starter", "pro", "business", "enterprise", "custom"];
export const CLIENT_STATUSES = ["draft", "intake-complete", "config-ready", "onboarding", "active", "paused", "archived"];
export const CHANNEL_STATUSES = ["not-needed", "not-configured", "pending", "connected", "blocked"];
export const APPROVAL_MODES = ["draft_only", "email_approval", "manual_publish"];
export const CLIENT_CHANNEL_KEYS = ["wordpress", "gbp", "companycam", "jobber", "email"];

function createChannelDefaults(overrides = {}) {
  return {
    enabled: overrides.enabled === true,
    status: overrides.status || "not-configured",
    authRef: overrides.authRef ?? null,
    accountRef: overrides.accountRef ?? null,
    siteUrl: overrides.siteUrl || "",
    projectId: overrides.projectId || "",
    accountLabel: overrides.accountLabel || "",
    provider: overrides.provider || "",
  };
}

/**
 * @typedef {Object} TenantClientConfig
 * @property {string} documentType
 * @property {number} schemaVersion
 * @property {string} tenantId
 * @property {Object} profile
 * @property {Object} branding
 * @property {Object} businessRules
 * @property {Object} channels
 * @property {Object} workflow
 * @property {Object} dashboard
 * @property {Object} meta
 */

export function createTenantClientConfig(overrides = {}) {
  const profile = overrides.profile || {};
  const contact = profile.contact || {};
  const website = profile.website || {};
  const serviceArea = profile.serviceArea || {};
  const branding = overrides.branding || {};
  const businessRules = overrides.businessRules || {};
  const channels = overrides.channels || {};
  const workflow = overrides.workflow || {};
  const dashboard = overrides.dashboard || {};
  const meta = overrides.meta || {};

  return {
    documentType: CLIENT_CONFIG_DOCUMENT_TYPE,
    schemaVersion: 1,
    tenantId: overrides.tenantId || "tenant-required",
    profile: {
      brandName: profile.brandName || "",
      publicAgentName: profile.publicAgentName || "Nexi",
      industry: profile.industry || "field-service",
      website: {
        currentUrl: website.currentUrl || "",
        desiredUrl: website.desiredUrl || "",
      },
      contact: {
        primaryName: contact.primaryName || "",
        primaryRole: contact.primaryRole || "",
        email: contact.email || "",
        phone: contact.phone || "",
      },
      serviceArea: {
        hqCity: serviceArea.hqCity || "",
        hqState: serviceArea.hqState || "",
        territories: uniqueStringList(serviceArea.territories || []),
      },
    },
    branding: {
      primaryColor: branding.primaryColor || "",
      secondaryColor: branding.secondaryColor || "",
      logoUrl: branding.logoUrl || "",
      headingFont: branding.headingFont || "",
      bodyFont: branding.bodyFont || "",
    },
    businessRules: {
      services: uniqueStringList(businessRules.services || []),
      targetCustomers: uniqueStringList(businessRules.targetCustomers || []),
      competitors: uniqueStringList(businessRules.competitors || []),
      dos: uniqueStringList(businessRules.dos || []),
      donts: uniqueStringList(businessRules.donts || []),
      claimsBoundariesRef: businessRules.claimsBoundariesRef ?? null,
    },
    channels: {
      wordpress: createChannelDefaults(channels.wordpress || {}),
      gbp: createChannelDefaults(channels.gbp || {}),
      companycam: createChannelDefaults(channels.companycam || {}),
      jobber: createChannelDefaults(channels.jobber || {}),
      email: createChannelDefaults(channels.email || {}),
    },
    workflow: {
      approvalMode: workflow.approvalMode || "draft_only",
      launchSequence: uniqueStringList(workflow.launchSequence || []),
      featureFlags: {
        modeA: workflow.featureFlags?.modeA === true,
        modeB: workflow.featureFlags?.modeB === true,
        modeC: workflow.featureFlags?.modeC === true,
      },
    },
    dashboard: {
      visibleKpis: uniqueStringList(dashboard.visibleKpis || []),
      ownerGoals: uniqueStringList(dashboard.ownerGoals || []),
    },
    meta: {
      tier: meta.tier || "starter",
      status: meta.status || "draft",
      createdAt: meta.createdAt || new Date().toISOString(),
      updatedAt: meta.updatedAt || new Date().toISOString(),
    },
  };
}

export function normalizeClientConfigFromIntakePacket(intakePacket, overrides = {}) {
  const intake = intakePacket?.intake || {};
  const accountSet = new Set((intake.accountsToConnect || []).map((entry) => String(entry).trim().toLowerCase()));
  const buildChannel = (key, channelOverrides = {}) =>
    createChannelDefaults({
      enabled: accountSet.has(key),
      status: accountSet.has(key) ? "pending" : "not-needed",
      ...channelOverrides,
    });

  return createTenantClientConfig({
    tenantId: overrides.tenantId || intakePacket.tenantId,
    profile: {
      brandName: intake.businessName || "",
      publicAgentName: overrides.publicAgentName || "Nexi",
      industry: overrides.industry || "field-service",
      website: {
        currentUrl: intake.currentUrl || "",
        desiredUrl: intake.desiredUrl || "",
      },
      contact: {
        primaryName: intake.primaryContact?.name || "",
        primaryRole: intake.primaryContact?.role || "",
        email: intake.primaryContact?.email || "",
        phone: intake.primaryContact?.phone || "",
      },
      serviceArea: {
        hqCity: overrides.hqCity || "",
        hqState: overrides.hqState || "",
        territories: uniqueStringList(overrides.territories || []),
      },
    },
    branding: {
      primaryColor: intake.branding?.primaryColor || "",
      secondaryColor: intake.branding?.secondaryColor || "",
      logoUrl: intake.branding?.logoUrl || "",
      headingFont: intake.branding?.headingFont || "",
      bodyFont: intake.branding?.bodyFont || "",
    },
    businessRules: {
      services: intake.services || [],
      targetCustomers: intake.targetCustomers || [],
      competitors: intake.competitors || [],
      dos: intake.doRules || [],
      donts: intake.dontRules || [],
      claimsBoundariesRef: overrides.claimsBoundariesRef ?? null,
    },
    channels: {
      wordpress: buildChannel("wordpress", overrides.channels?.wordpress),
      gbp: buildChannel("gbp", overrides.channels?.gbp),
      companycam: buildChannel("companycam", overrides.channels?.companycam),
      jobber: buildChannel("jobber", overrides.channels?.jobber),
      email: buildChannel("email", {
        provider: intake.emailProvider || "",
        ...(overrides.channels?.email || {}),
      }),
    },
    workflow: {
      approvalMode: overrides.workflow?.approvalMode || "draft_only",
      launchSequence: overrides.workflow?.launchSequence || [],
      featureFlags: overrides.workflow?.featureFlags || {},
    },
    dashboard: {
      visibleKpis: overrides.dashboard?.visibleKpis || [],
      ownerGoals: overrides.dashboard?.ownerGoals || [],
    },
    meta: {
      tier: overrides.meta?.tier || "starter",
      status: overrides.meta?.status || "intake-complete",
      createdAt: overrides.meta?.createdAt,
      updatedAt: overrides.meta?.updatedAt,
    },
  });
}

export function validateTenantClientConfig(config) {
  const errors = [];

  try {
    assertNoSecretsInDocument(config, "tenant client config");
  } catch (error) {
    errors.push(error.message);
  }

  pushIfInvalid(errors, isPlainObject(config), "Config must be a plain object.");
  if (errors.length) return errors;

  pushIfInvalid(errors, config.documentType === CLIENT_CONFIG_DOCUMENT_TYPE, "Invalid client config documentType.");
  pushIfInvalid(errors, config.schemaVersion === 1, "Unsupported client config schemaVersion.");
  pushIfInvalid(errors, isNonEmptyString(config.tenantId, 3), "tenantId is required.");
  if (isNonEmptyString(config.tenantId, 3)) {
    try {
      assertSafeTenantId(config.tenantId);
    } catch (error) {
      errors.push(error.message);
    }
  }

  const hasProfile = isPlainObject(config.profile);
  const hasBranding = isPlainObject(config.branding);
  const hasBusinessRules = isPlainObject(config.businessRules);
  const hasChannels = isPlainObject(config.channels);
  const hasWorkflow = isPlainObject(config.workflow);
  const hasDashboard = isPlainObject(config.dashboard);
  const hasMeta = isPlainObject(config.meta);

  pushIfInvalid(errors, hasProfile, "profile must be present.");
  pushIfInvalid(errors, hasBranding, "branding must be present.");
  pushIfInvalid(errors, hasBusinessRules, "businessRules must be present.");
  pushIfInvalid(errors, hasChannels, "channels must be present.");
  pushIfInvalid(errors, hasWorkflow, "workflow must be present.");
  pushIfInvalid(errors, hasDashboard, "dashboard must be present.");
  pushIfInvalid(errors, hasMeta, "meta must be present.");
  if (!(hasProfile && hasBranding && hasBusinessRules && hasChannels && hasWorkflow && hasDashboard && hasMeta)) {
    return errors;
  }

  const { profile } = config;
  pushIfInvalid(errors, isNonEmptyString(profile.brandName, 2), "profile.brandName is required.");
  pushIfInvalid(errors, isNonEmptyString(profile.publicAgentName, 2), "profile.publicAgentName is required.");
  pushIfInvalid(errors, isNonEmptyString(profile.industry, 2), "profile.industry is required.");
  pushIfInvalid(errors, isPlainObject(profile.website), "profile.website must be present.");
  pushIfInvalid(errors, isPlainObject(profile.contact), "profile.contact must be present.");
  pushIfInvalid(errors, isPlainObject(profile.serviceArea), "profile.serviceArea must be present.");
  if (isPlainObject(profile.website)) {
    pushIfInvalid(errors, isValidUrl(profile.website.currentUrl, { allowEmpty: true }), "profile.website.currentUrl must be a valid URL.");
    pushIfInvalid(errors, isValidUrl(profile.website.desiredUrl, { allowEmpty: true }), "profile.website.desiredUrl must be a valid URL.");
  }
  if (isPlainObject(profile.contact)) {
    pushIfInvalid(errors, isNonEmptyString(profile.contact.primaryName, 2), "profile.contact.primaryName is required.");
    pushIfInvalid(errors, isNonEmptyString(profile.contact.primaryRole, 2), "profile.contact.primaryRole is required.");
    pushIfInvalid(errors, isValidEmail(profile.contact.email), "profile.contact.email must be valid.");
    pushIfInvalid(errors, isValidPhone(profile.contact.phone, { allowEmpty: true }), "profile.contact.phone must be phone-like.");
  }
  if (isPlainObject(profile.serviceArea)) {
    pushIfInvalid(errors, isOptionalString(profile.serviceArea.hqCity), "profile.serviceArea.hqCity must be a string.");
    pushIfInvalid(errors, isOptionalString(profile.serviceArea.hqState), "profile.serviceArea.hqState must be a string.");
    pushIfInvalid(errors, isStringArray(profile.serviceArea.territories), "profile.serviceArea.territories must be a string array.");
  }

  pushIfInvalid(errors, isHexColor(config.branding.primaryColor, { allowEmpty: true }), "branding.primaryColor must be #RRGGBB.");
  pushIfInvalid(errors, isHexColor(config.branding.secondaryColor, { allowEmpty: true }), "branding.secondaryColor must be #RRGGBB.");
  pushIfInvalid(errors, isValidUrl(config.branding.logoUrl, { allowEmpty: true }), "branding.logoUrl must be a valid URL.");
  pushIfInvalid(errors, isOptionalString(config.branding.headingFont), "branding.headingFont must be a string.");
  pushIfInvalid(errors, isOptionalString(config.branding.bodyFont), "branding.bodyFont must be a string.");

  pushIfInvalid(errors, isStringArray(config.businessRules.services, { minItems: 1 }), "businessRules.services must include at least one service.");
  pushIfInvalid(errors, isStringArray(config.businessRules.targetCustomers, { minItems: 1 }), "businessRules.targetCustomers must include at least one target customer.");
  pushIfInvalid(errors, isStringArray(config.businessRules.competitors), "businessRules.competitors must be a string array.");
  pushIfInvalid(errors, isStringArray(config.businessRules.dos), "businessRules.dos must be a string array.");
  pushIfInvalid(errors, isStringArray(config.businessRules.donts), "businessRules.donts must be a string array.");
  pushIfInvalid(
    errors,
    config.businessRules.claimsBoundariesRef == null || isNonEmptyString(config.businessRules.claimsBoundariesRef, 4),
    "businessRules.claimsBoundariesRef must be null or a non-empty reference string."
  );

  for (const channelKey of CLIENT_CHANNEL_KEYS) {
    const channel = config.channels[channelKey];
    pushIfInvalid(errors, isPlainObject(channel), `channels.${channelKey} must be present.`);
    if (!isPlainObject(channel)) continue;
    pushIfInvalid(errors, isBoolean(channel.enabled), `channels.${channelKey}.enabled must be boolean.`);
    pushIfInvalid(
      errors,
      CHANNEL_STATUSES.includes(channel.status),
      `channels.${channelKey}.status must be one of: ${CHANNEL_STATUSES.join(", ")}.`
    );
    pushIfInvalid(errors, channel.authRef == null || isNonEmptyString(channel.authRef, 4), `channels.${channelKey}.authRef must be null or a non-empty reference.`);
    pushIfInvalid(errors, channel.accountRef == null || isNonEmptyString(channel.accountRef, 4), `channels.${channelKey}.accountRef must be null or a non-empty reference.`);
    pushIfInvalid(errors, isOptionalString(channel.siteUrl), `channels.${channelKey}.siteUrl must be a string.`);
    pushIfInvalid(errors, isOptionalString(channel.projectId), `channels.${channelKey}.projectId must be a string.`);
    pushIfInvalid(errors, isOptionalString(channel.accountLabel), `channels.${channelKey}.accountLabel must be a string.`);
    pushIfInvalid(errors, isOptionalString(channel.provider), `channels.${channelKey}.provider must be a string.`);

    if (channel.siteUrl) {
      pushIfInvalid(errors, isValidUrl(channel.siteUrl, { allowEmpty: true }), `channels.${channelKey}.siteUrl must be a valid URL.`);
    }
  }

  pushIfInvalid(errors, APPROVAL_MODES.includes(config.workflow.approvalMode), `workflow.approvalMode must be one of: ${APPROVAL_MODES.join(", ")}.`);
  pushIfInvalid(errors, isStringArray(config.workflow.launchSequence), "workflow.launchSequence must be a string array.");
  pushIfInvalid(errors, isPlainObject(config.workflow.featureFlags), "workflow.featureFlags must be present.");
  if (isPlainObject(config.workflow.featureFlags)) {
    for (const [flag, value] of Object.entries(config.workflow.featureFlags)) {
      pushIfInvalid(errors, typeof value === "boolean", `workflow.featureFlags.${flag} must be boolean.`);
    }
  }

  pushIfInvalid(errors, isStringArray(config.dashboard.visibleKpis), "dashboard.visibleKpis must be a string array.");
  pushIfInvalid(errors, isStringArray(config.dashboard.ownerGoals), "dashboard.ownerGoals must be a string array.");

  pushIfInvalid(errors, CLIENT_TIERS.includes(config.meta.tier), `meta.tier must be one of: ${CLIENT_TIERS.join(", ")}.`);
  pushIfInvalid(errors, CLIENT_STATUSES.includes(config.meta.status), `meta.status must be one of: ${CLIENT_STATUSES.join(", ")}.`);
  pushIfInvalid(errors, isIsoDateString(config.meta.createdAt), "meta.createdAt must be an ISO-8601 string.");
  pushIfInvalid(errors, isIsoDateString(config.meta.updatedAt), "meta.updatedAt must be an ISO-8601 string.");

  return errors;
}

export function assertValidTenantClientConfig(config) {
  const errors = validateTenantClientConfig(config);
  if (errors.length) {
    throw new Error(`Invalid tenant client config. ${errors.join(" ")}`);
  }
}
