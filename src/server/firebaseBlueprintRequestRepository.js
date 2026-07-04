import crypto from "crypto";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebaseAdminApp.js";
import { adminSetDocument } from "./firebaseTenantAdminRepository.js";
import { assertNoSecretsInDocument } from "../features/tenancy/services/secretGuard.js";
import {
  blueprintRequestDocPath,
  clientOrgDeliveryStateDocPath,
  clientOrgDocPath,
  clientOrgInviteDocPath,
  portalMemberDocPath,
} from "../features/missioncontrol/services/firestorePaths.js";
import { sanitizeTenantId } from "../features/tenancy/services/tenantPathUtils.js";

function clonePlainData(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return normalizeText(value).toLowerCase();
}

function normalizeSlug(value = "") {
  return sanitizeTenantId(value);
}

function nowIso() {
  return new Date().toISOString();
}

function buildBlueprintRequestDocId(requestId) {
  const safe = normalizeSlug(requestId);
  if (!safe) {
    throw new Error(`Invalid blueprint request id "${requestId}".`);
  }
  return safe;
}

export function createClientOrganizationMemberDocument({
  clientId,
  tenantId,
  email,
  uid,
  contactName = "",
  source = "blueprint_paid_confirmation",
  role = "client_admin",
  createdAt = nowIso(),
} = {}) {
  const safeClientId = normalizeSlug(clientId);
  const safeTenantId = normalizeSlug(tenantId);
  const safeEmail = normalizeEmail(email);
  const safeUid = normalizeText(uid);
  if (!safeClientId || !safeTenantId || !safeEmail || !safeUid) {
    throw new Error("clientId, tenantId, email, and uid are required to create a portal member document.");
  }

  return {
    userId: safeUid,
    clientId: safeClientId,
    tenantId: safeTenantId,
    email: safeEmail,
    contactName: normalizeText(contactName),
    role,
    status: "active",
    source,
    invitedAt: createdAt,
    acceptedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  };
}

export function createClientOrganizationInviteDocument({
  clientId,
  tenantId,
  email,
  contactName = "",
  source = "operator_paid_confirmation",
  createdAt = nowIso(),
} = {}) {
  const safeClientId = normalizeSlug(clientId);
  const safeTenantId = normalizeSlug(tenantId);
  const safeEmail = normalizeEmail(email);
  if (!safeClientId || !safeTenantId || !safeEmail) {
    throw new Error("clientId, tenantId, and email are required to create a client invite.");
  }

  return {
    token: `${safeClientId}-${crypto.randomUUID()}`,
    email: safeEmail,
    contactName: normalizeText(contactName),
    status: "pending",
    source,
    clientId: safeClientId,
    tenantId: safeTenantId,
    createdAt,
    updatedAt: createdAt,
  };
}

export function createClientOrganizationDocument({
  clientId,
  tenantId,
  request,
  provisioning,
  memberAttached = false,
  createdAt = nowIso(),
} = {}) {
  const safeClientId = normalizeSlug(clientId);
  const safeTenantId = normalizeSlug(tenantId);
  if (!safeClientId || !safeTenantId) {
    throw new Error("clientId and tenantId are required to create a client organization document.");
  }

  const companyName = normalizeText(request?.businessName || provisioning?.brandName || safeClientId);
  const contactEmail = normalizeEmail(request?.contactEmail);
  const contactName = normalizeText(request?.contactName);
  const contactPhone = normalizeText(request?.contactPhone);
  const trade = normalizeText(request?.trade || provisioning?.industry || "field-service");
  const serviceArea = normalizeText(request?.serviceArea);
  const website = normalizeText(request?.website);
  const legalName = normalizeText(request?.legalName || companyName);

  const document = {
    clientId: safeClientId,
    tenantId: safeTenantId,
    slug: safeClientId,
    companyName,
    legalName,
    status: "active",
    purchaseStatus: "paid",
    implementationStage: "portal_v1",
    blueprintSessionId: normalizeText(request?.sessionId || provisioning?.sessionId || ""),
    missionControlStatus: "mounted",
    portalStatus: memberAttached ? "active" : "invite_pending",
    onboardingStatus: {
      inviteAccepted: memberAttached,
      profileCompleted: false,
      missionControlReady: true,
      setupCompletedAt: createdAt,
    },
    companyProfile: {
      industry: trade,
      serviceArea,
      teamSize: normalizeText(request?.teamSize),
      website,
      primaryContactName: contactName,
      primaryContactEmail: contactEmail,
      primaryContactPhone: contactPhone,
      businessSummary: normalizeText(request?.bottleneck),
      onboardingNotes: `Provisioned from blueprint request ${normalizeText(request?.requestId || "")}.`,
    },
    branding: {
      logoUrl: "",
      logoAlt: companyName ? `${companyName} logo` : "",
      primaryColor: normalizeText(provisioning?.accentColor || "#4F46E5"),
      secondaryColor: "",
      accentColor: normalizeText(provisioning?.accentColor || "#4F46E5"),
      fontFamily: "",
    },
    createdAt,
    updatedAt: createdAt,
  };

  assertNoSecretsInDocument(document, "client organization document");
  return document;
}

export function createClientOrganizationDeliveryState({
  clientId,
  tenantId,
  currentStage,
  requestId,
  createdAt = nowIso(),
} = {}) {
  const safeClientId = normalizeSlug(clientId);
  const safeTenantId = normalizeSlug(tenantId);
  if (!safeClientId || !safeTenantId || !normalizeText(currentStage)) {
    throw new Error("clientId, tenantId, and currentStage are required to create a delivery-state record.");
  }

  return {
    clientId: safeClientId,
    tenantId: safeTenantId,
    currentStage: normalizeText(currentStage),
    requestId: buildBlueprintRequestDocId(requestId),
    createdAt,
    updatedAt: createdAt,
  };
}

export function createFirebaseBlueprintRequestRepository({ env = process.env } = {}) {
  const db = getFirebaseAdminDb(env);
  const auth = getFirebaseAdminAuth(env);

  return {
    async createRequest(request) {
      assertNoSecretsInDocument(request, "blueprint request document");
      return adminSetDocument({
        path: blueprintRequestDocPath(request.requestId),
        data: clonePlainData(request),
        merge: false,
        env,
      });
    },

    async getRequest(requestId) {
      const snapshot = await db.doc(blueprintRequestDocPath(requestId)).get();
      return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
    },

    async updateRequest(requestId, patch) {
      assertNoSecretsInDocument(patch, "blueprint request patch");
      return adminSetDocument({
        path: blueprintRequestDocPath(requestId),
        data: clonePlainData(patch),
        merge: true,
        env,
      });
    },

    async appendEvent(requestId, event) {
      assertNoSecretsInDocument(event, "blueprint request event");
      const ref = db.doc(blueprintRequestDocPath(requestId)).collection("events").doc();
      await ref.set(clonePlainData(event));
      return { id: ref.id, path: ref.path };
    },

    async lookupAuthUserByEmail(email) {
      const safeEmail = normalizeEmail(email);
      if (!safeEmail) {
        return null;
      }

      try {
        const user = await auth.getUserByEmail(safeEmail);
        return {
          uid: user.uid,
          email: user.email || safeEmail,
          disabled: user.disabled === true,
          customClaims: user.customClaims || {},
          providerIds: Array.isArray(user.providerData) ? user.providerData.map((provider) => provider.providerId) : [],
        };
      } catch (error) {
        if (error?.code === "auth/user-not-found") {
          return null;
        }
        throw error;
      }
    },

    async upsertClientOrganization(clientDocument) {
      assertNoSecretsInDocument(clientDocument, "client organization document");
      return adminSetDocument({
        path: clientOrgDocPath(clientDocument.clientId),
        data: clonePlainData(clientDocument),
        merge: true,
        env,
      });
    },

    async upsertClientOrganizationMember({ clientId, uid, memberDocument }) {
      assertNoSecretsInDocument(memberDocument, "client organization member document");
      return adminSetDocument({
        path: portalMemberDocPath(clientId, uid),
        data: clonePlainData(memberDocument),
        merge: true,
        env,
      });
    },

    async upsertClientOrganizationInvite({ clientId, inviteId, inviteDocument }) {
      assertNoSecretsInDocument(inviteDocument, "client organization invite document");
      return adminSetDocument({
        path: clientOrgInviteDocPath(clientId, inviteId),
        data: clonePlainData(inviteDocument),
        merge: true,
        env,
      });
    },

    async upsertClientOrganizationDeliveryState({ clientId, stateId = "current", deliveryState }) {
      assertNoSecretsInDocument(deliveryState, "client organization delivery-state document");
      return adminSetDocument({
        path: clientOrgDeliveryStateDocPath(clientId, stateId),
        data: clonePlainData(deliveryState),
        merge: true,
        env,
      });
    },
  };
}

export const firebaseBlueprintRequestRepositoryInternals = {
  buildBlueprintRequestDocId,
  createClientOrganizationDocument,
  createClientOrganizationInviteDocument,
  createClientOrganizationMemberDocument,
  createClientOrganizationDeliveryState,
};
