import { getDefaultSubagents, getSubagentById } from "../config/subagentroster.js";
import { assertSafeTenantId } from "../../tenancy/services/tenantPathUtils.js";

function uniqueIds(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean))];
}

export function resolveTenantSubagentIds(requestedSubagentIds = null) {
  const defaultIds = getDefaultSubagents().map((subagent) => subagent.id);
  const candidateIds = uniqueIds(requestedSubagentIds == null ? defaultIds : requestedSubagentIds);

  if (!candidateIds.length) {
    return defaultIds;
  }

  return candidateIds.filter((id) => getSubagentById(id));
}

export function buildTenantSubagentBootstrapPlan({
  tenantId,
  tenantMeta = {},
  subagentIds = null,
} = {}) {
  assertSafeTenantId(tenantId);

  const activeSubagentIds = resolveTenantSubagentIds(subagentIds);
  const subagentDocuments = activeSubagentIds
    .map((subagentId) => getSubagentById(subagentId))
    .filter(Boolean)
    .map((subagent) => ({
      id: subagent.id,
      name: subagent.name,
      role: subagent.role,
      enabled: true,
      customInstructions: null,
    }));

  return {
    tenantRootPatch: {
      tenantId,
      brandName: String(tenantMeta.brandName || "NexTeam-Studio").trim(),
      avatarName: String(tenantMeta.avatarName || "Nexi").trim(),
      industry: String(tenantMeta.industry || "field-service").trim(),
      accentColor: String(tenantMeta.accentColor || "#4F46E5").trim(),
      activeSubagentIds,
    },
    subagentDocuments,
  };
}
