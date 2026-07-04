import { createTenantActorScope } from "./tenantAccessPolicy.js";
import {
  createInMemoryTenantDocumentStore,
  persistTenantFoundationDocuments,
  readTenantCurrentConfig,
  readTenantCurrentRuntimeSummary,
} from "./tenantDocumentRepository.js";
import { tenantIntakePacketDocPath } from "./tenantPathUtils.js";

const DEFAULT_OPERATOR_SCOPE = createTenantActorScope({
  roles: ["platform_operator"],
});

function cloneValue(value) {
  return structuredClone(value);
}

export function createTenantFoundationRegistry({
  actorScope = DEFAULT_OPERATOR_SCOPE,
  store = createInMemoryTenantDocumentStore(),
} = {}) {
  const latestPacketIdsByTenant = new Map();

  return {
    registerTenantDocuments({ tenantId, packet, config, summary }) {
      const writes = persistTenantFoundationDocuments({
        actorScope,
        tenantId,
        packet,
        config,
        summary,
        store,
      });

      latestPacketIdsByTenant.set(tenantId, packet.packetId);
      return writes;
    },

    getTenantConfig(tenantId) {
      return readTenantCurrentConfig({
        actorScope,
        tenantId,
        store,
      });
    },

    getTenantRuntimeSummary(tenantId) {
      return readTenantCurrentRuntimeSummary({
        actorScope,
        tenantId,
        store,
      });
    },

    getTenantDocuments(tenantId) {
      const packetId = latestPacketIdsByTenant.get(tenantId);
      const packet = packetId ? store.readDocument(tenantIntakePacketDocPath(tenantId, packetId)) : null;

      return {
        packet: packet ? cloneValue(packet) : null,
        config: this.getTenantConfig(tenantId),
        summary: this.getTenantRuntimeSummary(tenantId),
      };
    },

    listDocumentPaths(prefix = "") {
      return typeof store.listDocumentPaths === "function" ? store.listDocumentPaths(prefix) : [];
    },

    snapshot() {
      return typeof store.snapshot === "function" ? store.snapshot() : null;
    },

    reset() {
      latestPacketIdsByTenant.clear();
      if (typeof store.clear === "function") {
        store.clear();
      }
    },

    store,
    actorScope,
  };
}

export const tenantFoundationRegistry = createTenantFoundationRegistry();
