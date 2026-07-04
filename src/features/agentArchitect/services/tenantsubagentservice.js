/**
 * Tenant Subagent Service
 *
 * Manages per-client subagent configuration in Firestore.
 *
 * Firestore paths:
 *   tenants/{tenantId}                - tenant config document
 *   tenants/{tenantId}/subagents/{id} - per-subagent config for this tenant
 *
 * This is the groundwork for per-client Nexi instances backed by their
 * configured subagent set. Right now it writes the initial config;
 * runtime activation (actually routing work to subagents) is a future step.
 */

import { db } from "../../../firebase.js";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import {
  assertSafeTenantId,
  tenantRootDocPath,
  tenantSubagentCollectionPath,
  tenantSubagentDocPath,
} from "../../tenancy/services/tenantPathUtils.js";
import { buildTenantSubagentBootstrapPlan } from "./tenantSubagentBootstrap.js";

/**
 * Initialize a new tenant with their default subagent set.
 * Creates the tenant doc and a subagent config doc for each enabled subagent.
 *
 * Safe to call on existing tenants - uses merge so it won't overwrite
 * manually customized subagent configs.
 *
 * @param {string} tenantId
 * @param {Object} tenantMeta - { brandName, avatarName, industry, accentColor }
 * @param {string[]} [subagentIds] - subagent ids to enable (defaults to recommended 5)
 */
export async function initializeTenantSubagents(tenantId, tenantMeta = {}, subagentIds = null) {
  if (!tenantId) throw new Error("tenantId is required");
  assertSafeTenantId(tenantId);

  const bootstrapPlan = buildTenantSubagentBootstrapPlan({
    tenantId,
    tenantMeta,
    subagentIds,
  });

  const tenantRef = doc(db, tenantRootDocPath(tenantId));
  await setDoc(
    tenantRef,
    {
      ...bootstrapPlan.tenantRootPatch,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  for (const subagent of bootstrapPlan.subagentDocuments) {
    const subRef = doc(db, tenantSubagentDocPath(tenantId, subagent.id));
    await setDoc(
      subRef,
      {
        ...subagent,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  console.log(
    `[tenantSubagentService] initialized tenant: ${tenantId} with ${bootstrapPlan.tenantRootPatch.activeSubagentIds.length} subagents`
  );

  return bootstrapPlan;
}

/**
 * Fetch the active subagent configs for a tenant.
 *
 * @param {string} tenantId
 * @returns {Promise<Array>}
 */
export async function getTenantSubagents(tenantId) {
  if (!tenantId) return [];
  assertSafeTenantId(tenantId);

  const subRef = collection(db, tenantSubagentCollectionPath(tenantId));
  const snapshot = await getDocs(subRef);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
