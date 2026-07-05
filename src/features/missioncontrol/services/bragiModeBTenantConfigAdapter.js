import { assertValidTenantClientConfig } from "../../tenancy/schemas/clientConfigSchema.js";

function cloneValue(value) {
  return structuredClone(value);
}

function deriveDisplayName(foundationConfig, clientId) {
  return String(foundationConfig?.profile?.brandName || clientId || "Client").trim();
}

function deriveRequiredInternalLinkUrls(internalLinks = []) {
  return internalLinks.filter((link) => link?.required === true).map((link) => link.url);
}

function buildDefaultBrandVoice({ brandName, primaryService }) {
  return [
    `Warm, plain-spoken expert voice for ${brandName}.`,
    `Stay focused on ${primaryService || "the core service"} instead of drifting into generic marketing filler.`,
    "Lead with field evidence, practical diagnostics, and the clearest next step.",
    "Keep the tone reassuring, specific, and low-pressure.",
  ];
}

export function buildBragiModeBClientConfigFromTenant({
  clientId,
  foundationConfig,
  modeBExtension = {},
} = {}) {
  if (!clientId || typeof clientId !== "string") {
    throw new Error("clientId is required to build a Bragi Mode B client config from tenant data.");
  }

  assertValidTenantClientConfig(foundationConfig);

  const brandName = deriveDisplayName(foundationConfig, clientId);
  const primaryService = foundationConfig.businessRules.services[0] || foundationConfig.profile.industry || "field service";
  const approval = {
    reviewRecipient: foundationConfig.profile.contact.email,
    subjectPrefix: "[Bragi Mode B Draft Review]",
    ...(modeBExtension.approval || {}),
  };
  const internalLinks = cloneValue(modeBExtension.internalLinks || []);
  const externalLinks = cloneValue(modeBExtension.externalLinks || []);
  const requiredInternalLinkUrls = modeBExtension.requiredInternalLinkUrls?.length
    ? [...new Set(modeBExtension.requiredInternalLinkUrls)]
    : deriveRequiredInternalLinkUrls(internalLinks);

  return {
    id: clientId,
    tenantId: foundationConfig.tenantId,
    displayName: brandName,
    brandName,
    primaryService,
    approval,
    profile: cloneValue(foundationConfig.profile),
    branding: cloneValue(foundationConfig.branding),
    businessRules: cloneValue(foundationConfig.businessRules),
    channels: cloneValue(foundationConfig.channels),
    workflow: cloneValue(foundationConfig.workflow),
    dashboard: cloneValue(foundationConfig.dashboard),
    meta: cloneValue(foundationConfig.meta),
    locations: cloneValue(modeBExtension.locations || {}),
    brandVoice: cloneValue(modeBExtension.brandVoice || buildDefaultBrandVoice({ brandName, primaryService })),
    guardrails: {
      blockedScopePatterns: [...(modeBExtension.guardrails?.blockedScopePatterns || [])],
    },
    topicProfiles: cloneValue(modeBExtension.topicProfiles || []),
    internalLinks,
    externalLinks,
    requiredInternalLinkUrls,
  };
}
