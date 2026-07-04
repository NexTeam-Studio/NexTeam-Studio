import { getFirebaseAdminDb } from "./firebaseAdminApp.js";
import {
  adminSetDocument,
  adminWriteValidatedTenantFoundationDocuments,
} from "./firebaseTenantAdminRepository.js";
import { buildTenantSubagentBootstrapPlan } from "../features/agentArchitect/services/tenantSubagentBootstrap.js";
import { assertNoSecretsInDocument } from "../features/tenancy/services/secretGuard.js";
import {
  tenantConfigDocPath,
  tenantRootDocPath,
  tenantSubagentDocPath,
} from "../features/tenancy/services/tenantPathUtils.js";
import {
  agentSessionDocPath,
  blueprintDocPath,
  onboardingSessionDocPath,
} from "../features/missioncontrol/services/firestorePaths.js";
import { createConversationTenantProvisioner } from "../features/tenancy/services/conversationTenantProvisioner.js";
import { canAccessTenant, isPlatformOperator } from "../features/tenancy/services/tenantAccessPolicy.js";

function clonePlainData(value) {
  return JSON.parse(JSON.stringify(value));
}

export function assertActorCanProvisionAgentSession({ actorScope = {}, decodedToken = {}, session = {} } = {}) {
  if (!session || typeof session !== "object") {
    throw new Error("Provisioning requires a real agent session document.");
  }

  const targetTenantId = String(session.tenantId || "").trim();
  if (!targetTenantId) {
    throw new Error(`Agent session "${session.id || session.sessionId || "unknown"}" is missing tenantId.`);
  }

  if (!canAccessTenant({ actorScope, targetTenantId })) {
    throw new Error(
      `Tenant access denied. Actor tenant "${actorScope.tenantId || "unknown"}" cannot provision session for tenant "${targetTenantId}".`
    );
  }

  if (isPlatformOperator(actorScope)) {
    return true;
  }

  const sessionOwnerUid = String(session.ownerUid || "").trim();
  if (!sessionOwnerUid) {
    throw new Error(
      `Agent session "${session.id || session.sessionId || "unknown"}" cannot be self-provisioned because ownerUid is missing.`
    );
  }

  if (String(decodedToken.uid || "").trim() !== sessionOwnerUid) {
    throw new Error(
      `Agent session "${session.id || session.sessionId || "unknown"}" is owned by a different Firebase user.`
    );
  }

  return true;
}

export function createFirebaseConversationTenantProvisioningDependencies({ env = process.env } = {}) {
  const db = getFirebaseAdminDb(env);

  return {
    async readAgentSession(sessionId) {
      const snapshot = await db.doc(agentSessionDocPath(sessionId)).get();
      return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
    },

    async listExistingTenantIds() {
      const snapshot = await db.collection("tenants").get();
      return snapshot.docs.map((doc) => String(doc.id || "").trim()).filter(Boolean);
    },

    async tenantConfigExists(tenantId) {
      const snapshot = await db.doc(tenantConfigDocPath(tenantId, "current")).get();
      return snapshot.exists;
    },

    async persistFoundationDocuments({ tenantId, packet, config, summary }) {
      return adminWriteValidatedTenantFoundationDocuments({
        tenantId,
        packet,
        config,
        summary,
        env,
      });
    },

    async initializeTenantSubagents({ tenantId, tenantMeta = {}, subagentIds = null }) {
      const bootstrapPlan = buildTenantSubagentBootstrapPlan({
        tenantId,
        tenantMeta,
        subagentIds,
      });

      await adminSetDocument({
        path: tenantRootDocPath(tenantId),
        data: {
          ...bootstrapPlan.tenantRootPatch,
          updatedAt: new Date().toISOString(),
        },
        merge: true,
        env,
      });

      await Promise.all(
        bootstrapPlan.subagentDocuments.map((subagentDocument) =>
          adminSetDocument({
            path: tenantSubagentDocPath(tenantId, subagentDocument.id),
            data: {
              ...subagentDocument,
              updatedAt: new Date().toISOString(),
            },
            merge: true,
            env,
          })
        )
      );

      return bootstrapPlan;
    },

    async writeBlueprint({ tenantId, blueprint }) {
      assertNoSecretsInDocument(blueprint, "tenant starter blueprint");
      return adminSetDocument({
        path: blueprintDocPath(tenantId, blueprint.id),
        data: clonePlainData(blueprint),
        merge: true,
        env,
      });
    },

    async writeOnboardingSession({ tenantId, onboardingSession }) {
      assertNoSecretsInDocument(onboardingSession, "tenant onboarding session");
      return adminSetDocument({
        path: onboardingSessionDocPath(tenantId, onboardingSession.id),
        data: clonePlainData(onboardingSession),
        merge: true,
        env,
      });
    },

    async writeTenantRoot(rootDocument) {
      assertNoSecretsInDocument(rootDocument, "tenant root document");
      return adminSetDocument({
        path: tenantRootDocPath(rootDocument.tenantId),
        data: clonePlainData(rootDocument),
        merge: true,
        env,
      });
    },

    async markAgentSessionProvisioned({ sessionId, provisioning }) {
      return adminSetDocument({
        path: agentSessionDocPath(sessionId),
        data: {
          provisioning: clonePlainData(provisioning),
          updatedAt: new Date().toISOString(),
        },
        merge: true,
        env,
      });
    },
  };
}

export function createFirebaseConversationTenantProvisioner({ env = process.env, now } = {}) {
  return createConversationTenantProvisioner({
    dependencies: createFirebaseConversationTenantProvisioningDependencies({ env }),
    now,
  });
}
