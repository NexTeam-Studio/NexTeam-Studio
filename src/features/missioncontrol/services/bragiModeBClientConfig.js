import { buildAquatraceTenantFoundationDocuments } from "../../clients/aquatrace/aquatraceTenantFoundation.js";
import { aquatraceBragiModeBExtension } from "../../clients/aquatrace/bragiModeBClientProfile.js";
import { createTenantFoundationRegistry } from "../../tenancy/services/tenantFoundationRegistry.js";
import { buildBragiModeBClientConfigFromTenant } from "./bragiModeBTenantConfigAdapter.js";

function assertClientId(clientId, action) {
  if (!clientId || typeof clientId !== "string") {
    throw new Error(`clientId is required to ${action}.`);
  }
}

function cloneValue(value) {
  return structuredClone(value);
}

export function createBragiModeBClientConfigRegistry({
  foundationRegistry = createTenantFoundationRegistry(),
  bootstrapDefaults = true,
} = {}) {
  const clientSources = new Map();

  function registerBragiModeBClientConfig(clientId, config) {
    assertClientId(clientId, "register a Bragi Mode B client config");
    if (!config || typeof config !== "object") {
      throw new Error(`Invalid Bragi Mode B client config for "${clientId}".`);
    }
    clientSources.set(clientId, {
      type: "static-config",
      config: cloneValue(config),
    });
  }

  function registerBragiModeBTenantSource(clientId, { tenantId, packet, config, summary, modeBExtension = {} } = {}) {
    assertClientId(clientId, "register a Bragi Mode B tenant-backed client");
    if (!tenantId || typeof tenantId !== "string") {
      throw new Error(`tenantId is required to register tenant-backed Bragi Mode B client "${clientId}".`);
    }

    foundationRegistry.registerTenantDocuments({
      tenantId,
      packet,
      config,
      summary,
    });

    clientSources.set(clientId, {
      type: "tenant-foundation",
      tenantId,
      modeBExtension: cloneValue(modeBExtension),
    });
  }

  function getBragiModeBClientConfig(clientId) {
    assertClientId(clientId, "load a Bragi Mode B client config");
    const source = clientSources.get(clientId);
    if (!source) {
      throw new Error(`Unsupported Bragi Mode B client config: ${clientId}`);
    }

    if (source.type === "static-config") {
      return cloneValue(source.config);
    }

    if (source.type === "tenant-foundation") {
      const foundationConfig = foundationRegistry.getTenantConfig(source.tenantId);
      if (!foundationConfig) {
        throw new Error(`No tenant foundation config is registered for "${clientId}" (${source.tenantId}).`);
      }

      return buildBragiModeBClientConfigFromTenant({
        clientId,
        foundationConfig,
        modeBExtension: source.modeBExtension,
      });
    }

    throw new Error(`Unsupported Bragi Mode B client config source for "${clientId}".`);
  }

  function reset() {
    clientSources.clear();
    if (typeof foundationRegistry.reset === "function") {
      foundationRegistry.reset();
    }
  }

  if (bootstrapDefaults) {
    const aquatrace = buildAquatraceTenantFoundationDocuments();
    registerBragiModeBTenantSource("aquatrace", {
      tenantId: aquatrace.tenantId,
      packet: aquatrace.packet,
      config: aquatrace.config,
      summary: aquatrace.summary,
      modeBExtension: aquatraceBragiModeBExtension,
    });
  }

  return {
    registerBragiModeBClientConfig,
    registerBragiModeBTenantSource,
    getBragiModeBClientConfig,
    reset,
    foundationRegistry,
  };
}

const defaultBragiModeBClientConfigRegistry = createBragiModeBClientConfigRegistry();

export function registerBragiModeBClientConfig(clientId, config) {
  return defaultBragiModeBClientConfigRegistry.registerBragiModeBClientConfig(clientId, config);
}

export function registerBragiModeBTenantSource(clientId, tenantSource) {
  return defaultBragiModeBClientConfigRegistry.registerBragiModeBTenantSource(clientId, tenantSource);
}

export function getBragiModeBClientConfig(clientId) {
  return defaultBragiModeBClientConfigRegistry.getBragiModeBClientConfig(clientId);
}

export function normalizeBragiModeBLocation(locationInput, config) {
  if (!config) {
    throw new Error("A Bragi Mode B client config is required to normalize locations.");
  }

  const raw = String(locationInput || "").trim();
  if (!raw) {
    throw new Error("Location is required.");
  }

  if (config.locations[raw]) {
    return config.locations[raw];
  }

  const normalized = raw.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");
  const hit = Object.values(config.locations).find((location) => {
    const label = location.label.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");
    const display = location.display.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");
    return normalized === label || normalized === display;
  });

  if (!hit) {
    throw new Error(`Unsupported Bragi Mode B location: ${raw}`);
  }

  return hit;
}

export function getBragiModeBTopicProfile(topic, config) {
  if (!config) {
    throw new Error("A Bragi Mode B client config is required to resolve topic profiles.");
  }

  const value = String(topic || "");
  return config.topicProfiles.find((profile) => profile.matchers.some((pattern) => pattern.test(value))) || config.topicProfiles.at(-1);
}

export function buildBragiModeBLinkPlan({ topic, location, config }) {
  if (!config) {
    throw new Error("A Bragi Mode B client config is required to build a link plan.");
  }

  const selected = [];

  for (const link of config.internalLinks) {
    if (link.stateFilter && !link.stateFilter.includes(location.state)) {
      continue;
    }
    if (link.topicMatchers && !link.topicMatchers.some((pattern) => pattern.test(topic))) {
      continue;
    }
    selected.push(link);
  }

  const requiredUrls = new Set(config.requiredInternalLinkUrls || []);

  for (const link of config.internalLinks) {
    if (requiredUrls.has(link.url) && !selected.find((entry) => entry.url === link.url)) {
      selected.push(link);
    }
  }

  const external = config.externalLinks.filter((link) =>
    !link.topicMatchers || link.topicMatchers.some((pattern) => pattern.test(topic))
  );

  return {
    internalLinks: selected.slice(0, 5),
    externalLinks: external.slice(0, 1),
  };
}

export const bragiModeBClientConfigRegistry = {
  registerBragiModeBClientConfig,
  registerBragiModeBTenantSource,
  getBragiModeBClientConfig,
};

export const bragiModeBClientConfigTestExports = {
  createBragiModeBClientConfigRegistry,
};
