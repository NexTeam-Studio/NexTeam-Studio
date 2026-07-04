import { assertValidRawIntakePacket } from "../features/tenancy/schemas/clientIntakePacketSchema.js";
import { assertValidTenantClientConfig } from "../features/tenancy/schemas/clientConfigSchema.js";
import { assertValidTenantRuntimeSummary } from "../features/tenancy/schemas/runtimeSummarySchema.js";
import {
  assertSafeTenantId,
  tenantConfigDocPath,
  tenantIntakePacketDocPath,
  tenantRootDocPath,
  tenantRuntimeSummaryDocPath,
} from "../features/tenancy/services/tenantPathUtils.js";
import { getFirebaseAdminDb } from "./firebaseAdminApp.js";

function clonePlainData(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertDocumentTenantMatch(documentTenantId, tenantId, label) {
  if (documentTenantId !== tenantId) {
    throw new Error(`${label} tenantId "${documentTenantId}" does not match target tenant "${tenantId}".`);
  }
}

export async function adminSetDocument({ path, data, merge = true, env = process.env }) {
  if (!path) {
    throw new Error("Firestore path is required for admin writes.");
  }

  const db = getFirebaseAdminDb(env);
  await db.doc(path).set(clonePlainData(data), { merge });
  return {
    path,
    data,
    merge,
  };
}

export async function adminUpsertTenantRootDocument({
  tenantId,
  brandName,
  avatarName = "Nexi",
  industry = "field-service",
  missionControlEnabled = true,
  registryVisible = true,
  hostAgent = null,
  caseStudyMode = false,
  env = process.env,
} = {}) {
  assertSafeTenantId(tenantId);

  const payload = {
    tenantId,
    brandName: String(brandName || "").trim(),
    avatarName: String(avatarName || "Nexi").trim(),
    industry: String(industry || "field-service").trim(),
    missionControlEnabled: missionControlEnabled === true,
    registryVisible: registryVisible !== false,
    hostAgent: hostAgent == null ? null : String(hostAgent).trim(),
    caseStudyMode: caseStudyMode === true,
    updatedAt: new Date().toISOString(),
  };

  if (!payload.brandName) {
    throw new Error("brandName is required for tenant root documents.");
  }

  return adminSetDocument({
    path: tenantRootDocPath(tenantId),
    data: payload,
    merge: true,
    env,
  });
}

export async function adminWriteValidatedTenantFoundationDocuments({
  tenantId,
  packet = null,
  config = null,
  summary = null,
  env = process.env,
} = {}) {
  assertSafeTenantId(tenantId);
  const writes = [];

  if (packet) {
    assertValidRawIntakePacket(packet);
    assertDocumentTenantMatch(packet.tenantId, tenantId, "Intake packet");
    writes.push(
      adminSetDocument({
        path: tenantIntakePacketDocPath(tenantId, packet.packetId),
        data: packet,
        merge: true,
        env,
      })
    );
  }

  if (config) {
    assertValidTenantClientConfig(config);
    assertDocumentTenantMatch(config.tenantId, tenantId, "Tenant config");
    writes.push(
      adminSetDocument({
        path: tenantConfigDocPath(tenantId, "current"),
        data: config,
        merge: true,
        env,
      })
    );
  }

  if (summary) {
    assertValidTenantRuntimeSummary(summary);
    assertDocumentTenantMatch(summary.tenantId, tenantId, "Runtime summary");
    writes.push(
      adminSetDocument({
        path: tenantRuntimeSummaryDocPath(tenantId, "current"),
        data: summary,
        merge: true,
        env,
      })
    );
  }

  return Promise.all(writes);
}
