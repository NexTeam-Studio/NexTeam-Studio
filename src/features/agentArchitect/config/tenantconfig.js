/**
 * Tenant configuration for NexTeam-Studio.
 *
 * This is the foundation for client isolation.
 * Each NexTeam customer (a plumber, HVAC company, etc.) will eventually
 * get their own tenantId and a config entry here — or a Firestore-based
 * tenant config that gets fetched at runtime.
 *
 * For now: a single default tenant ("nexteam-studio") is defined.
 * All sessions are tagged with this tenantId in Firestore so the schema
 * is tenant-ready when multi-client support is needed.
 *
 * Expansion path:
 *   1. Read tenantId from URL param, subdomain, or env var
 *   2. Fetch tenant config from Firestore `tenants/{tenantId}` at startup
 *   3. Pass tenantConfig into hooks/components via context or props
 */

import { assertSafeTenantId } from "../../tenancy/services/tenantPathUtils.js";
import { getRuntimeConfigValue } from "../../../runtimeConfig.js";

// The active tenant for this deployment.
// In production this will come from the URL (subdomain or path param).
// For now it defaults to the NexTeam-Studio demo/default tenant.
export const DEFAULT_TENANT_ID = getRuntimeConfigValue("VITE_TENANT_ID", "nexteam-studio");
assertSafeTenantId(DEFAULT_TENANT_ID);

/**
 * Tenant config shape. Extend this as multi-client needs grow.
 *
 * @typedef {Object} TenantConfig
 * @property {string} tenantId       - Unique slug for this tenant
 * @property {string} brandName      - Business name shown to their customers
 * @property {string} avatarName     - Name of the AI avatar (default: "Nexi")
 * @property {string} industry       - Primary industry focus
 * @property {string} accentColor    - Brand color for UI theming
 */

/** @type {TenantConfig} */
export const DEFAULT_TENANT_CONFIG = {
  tenantId: DEFAULT_TENANT_ID,
  brandName: "NexTeam-Studio",
  avatarName: "Nexi",
  industry: "field-service",
  accentColor: "#4F46E5"
};

/**
 * Returns the active tenant config.
 * Right now always returns the default. Will be replaced with a
 * runtime fetch or URL-derived lookup when multi-client ships.
 *
 * @returns {TenantConfig}
 */
export function getActiveTenantConfig() {
  return DEFAULT_TENANT_CONFIG;
}
