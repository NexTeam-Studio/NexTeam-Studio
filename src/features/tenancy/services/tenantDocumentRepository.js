import { assertValidRawIntakePacket } from "../schemas/clientIntakePacketSchema.js";
import { assertValidTenantClientConfig } from "../schemas/clientConfigSchema.js";
import { assertValidTenantRuntimeSummary } from "../schemas/runtimeSummarySchema.js";
import { assertTenantAccess } from "./tenantAccessPolicy.js";
import {
  tenantConfigDocPath,
  tenantIntakePacketDocPath,
  tenantRuntimeSummaryDocPath,
} from "./tenantPathUtils.js";

function assertTenantMatch(documentTenantId, expectedTenantId, label) {
  if (documentTenantId !== expectedTenantId) {
    throw new Error(`${label} tenantId "${documentTenantId}" does not match target tenant "${expectedTenantId}".`);
  }
}

function cloneDocument(document) {
  return structuredClone(document);
}

function assertStoreCapabilities(store, requiredMethods = []) {
  if (!store || typeof store !== "object") {
    throw new Error("A tenant document store is required.");
  }

  for (const method of requiredMethods) {
    if (typeof store[method] !== "function") {
      throw new Error(`Tenant document store must implement ${method}().`);
    }
  }
}

export function createInMemoryTenantDocumentStore(seedDocuments = {}) {
  const documents = new Map(
    Object.entries(seedDocuments).map(([path, document]) => [path, cloneDocument(document)])
  );

  return {
    writeDocument(path, document) {
      documents.set(path, cloneDocument(document));
      return cloneDocument(document);
    },
    readDocument(path) {
      return documents.has(path) ? cloneDocument(documents.get(path)) : null;
    },
    listDocumentPaths(prefix = "") {
      return [...documents.keys()].filter((path) => String(path).startsWith(prefix)).sort();
    },
    snapshot() {
      return Object.fromEntries(
        [...documents.entries()].map(([path, document]) => [path, cloneDocument(document)])
      );
    },
    clear() {
      documents.clear();
    },
  };
}

export function prepareRawIntakePacketWrite({ actorScope, tenantId, packet }) {
  assertTenantAccess({ actorScope, targetTenantId: tenantId, action: "write intake packet for" });
  assertValidRawIntakePacket(packet);
  assertTenantMatch(packet.tenantId, tenantId, "Intake packet");

  return {
    path: tenantIntakePacketDocPath(tenantId, packet.packetId),
    data: packet,
  };
}

export function prepareTenantClientConfigWrite({ actorScope, tenantId, config }) {
  assertTenantAccess({ actorScope, targetTenantId: tenantId, action: "write config for" });
  assertValidTenantClientConfig(config);
  assertTenantMatch(config.tenantId, tenantId, "Tenant config");

  return {
    path: tenantConfigDocPath(tenantId, "current"),
    data: config,
  };
}

export function prepareTenantRuntimeSummaryWrite({ actorScope, tenantId, summary }) {
  assertTenantAccess({ actorScope, targetTenantId: tenantId, action: "write runtime summary for" });
  assertValidTenantRuntimeSummary(summary);
  assertTenantMatch(summary.tenantId, tenantId, "Runtime summary");

  return {
    path: tenantRuntimeSummaryDocPath(tenantId, "current"),
    data: summary,
  };
}

export function persistTenantFoundationDocuments({
  actorScope,
  tenantId,
  packet,
  config,
  summary,
  store,
}) {
  assertStoreCapabilities(store, ["writeDocument"]);

  const intakeWrite = prepareRawIntakePacketWrite({ actorScope, tenantId, packet });
  const configWrite = prepareTenantClientConfigWrite({ actorScope, tenantId, config });
  const summaryWrite = prepareTenantRuntimeSummaryWrite({ actorScope, tenantId, summary });

  store.writeDocument(intakeWrite.path, intakeWrite.data);
  store.writeDocument(configWrite.path, configWrite.data);
  store.writeDocument(summaryWrite.path, summaryWrite.data);

  return {
    intakeWrite,
    configWrite,
    summaryWrite,
  };
}

export function readTenantCurrentConfig({ actorScope, tenantId, store }) {
  assertTenantAccess({ actorScope, targetTenantId: tenantId, action: "read config for" });
  assertStoreCapabilities(store, ["readDocument"]);

  const path = tenantConfigDocPath(tenantId, "current");
  const config = store.readDocument(path);
  if (!config) {
    return null;
  }

  assertValidTenantClientConfig(config);
  assertTenantMatch(config.tenantId, tenantId, "Tenant config");
  return config;
}

export function readTenantCurrentRuntimeSummary({ actorScope, tenantId, store }) {
  assertTenantAccess({ actorScope, targetTenantId: tenantId, action: "read runtime summary for" });
  assertStoreCapabilities(store, ["readDocument"]);

  const path = tenantRuntimeSummaryDocPath(tenantId, "current");
  const summary = store.readDocument(path);
  if (!summary) {
    return null;
  }

  assertValidTenantRuntimeSummary(summary);
  assertTenantMatch(summary.tenantId, tenantId, "Runtime summary");
  return summary;
}
