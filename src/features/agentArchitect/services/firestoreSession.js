import { auth, db } from "../../../firebase.js";
import { doc, setDoc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { DEFAULT_TENANT_ID } from "../config/tenantconfig.js";
import { normalizePatch } from "../utils/normalizePatch.js";

// Track sessions that have already had their initial doc created this browser session
// so we only set createdAt once per sessionId
const _initializedSessions = new Set();
const CONVERSATION_PROVISION_ENDPOINT = "/api/internal/tenants/provision-from-session";

function normalizeAgentSessionDoc(data = {}) {
  if (!data || typeof data !== "object") return {};

  return {
    ...data,
    existingTools: Array.isArray(data.existingTools)
      ? data.existingTools
      : Array.isArray(data.existing_tools)
        ? data.existing_tools
        : [],
    recommendedAgents: Array.isArray(data.recommendedAgents)
      ? data.recommendedAgents
      : Array.isArray(data.agent_recommendation)
        ? data.agent_recommendation
        : [],
    priorityAgent: data.priorityAgent || data.priority_agent || "",
    agentMission: data.agentMission || data.agent_mission || "",
    businessName: data.businessName || data.business_name || "",
    serviceArea: data.serviceArea || data.service_area || "",
    agentName: data.agentName || data.agent_name || "",
    crewSize: data.crewSize ?? data.crew_size ?? null,
    jobVolume: data.jobVolume || data.job_volume || "",
    biggestPain: data.biggestPain || data.biggest_pain || "",
    missingFields: Array.isArray(data.missingFields)
      ? data.missingFields
      : Array.isArray(data.missing_fields)
        ? data.missing_fields
        : [],
    ownerUid: data.ownerUid || "",
    provisioning: data.provisioning && typeof data.provisioning === "object" ? data.provisioning : null,
  };
}

async function postConversationProvisionRequest(sessionId) {
  if (!auth.currentUser) {
    return {
      ok: false,
      skipped: true,
      reason: "missing-firebase-user",
    };
  }

  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(CONVERSATION_PROVISION_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId }),
  });

  if (response.status === 404) {
    return {
      ok: false,
      skipped: true,
      reason: "backend-route-unavailable",
    };
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      skipped: false,
      status: response.status,
      error: String(payload?.error || "Conversation tenant provisioning failed."),
    };
  }

  return {
    ok: true,
    skipped: false,
    payload,
  };
}

/**
 * Called after each interviewer turn to incrementally persist the extracted spec patch.
 * Creates the agentSessions doc on first call, merges on subsequent calls.
 *
 * Firestore path: agentSessions/{sessionId}
 */
export async function applyAgentPatch(agentId, sessionId, patch, stage, missingFields) {
  if (!agentId || !sessionId) return null;

  try {
    const ref = doc(db, "agentSessions", sessionId);
    const isNew = !_initializedSessions.has(sessionId);
    const normalizedPatch = normalizePatch(patch);
    const normalizedMissingFields = Array.isArray(missingFields)
      ? normalizePatch({ missingFields }).missingFields || []
      : [];

    const data = {
      tenantId: DEFAULT_TENANT_ID,
      agentId,
      sessionId,
      ownerUid: auth.currentUser?.uid || "",
      stage: stage || "unknown",
      missingFields: normalizedMissingFields,
      ...normalizedPatch,
      status: "in_progress",
      updatedAt: serverTimestamp()
    };

    if (isNew) {
      data.createdAt = serverTimestamp();
      _initializedSessions.add(sessionId);
    }

    await setDoc(ref, data, { merge: true });
    console.log(
      `[firestoreSession] ✅ patch written — path: agentSessions/${sessionId} stage: ${stage || "unknown"} isNew: ${isNew} fields: ${Object.keys(normalizedPatch).join(",") || "none"}`
    );
  } catch (err) {
    console.error("[firestoreSession] ERROR applyAgentPatch:", err.message, "sessionId:", sessionId);
  }

  return null;
}

/**
 * Load a saved agent session/blueprint from Firestore for review rendering.
 */
export async function fetchAgentSession(sessionId) {
  if (!sessionId) return null;

  try {
    const ref = doc(db, "agentSessions", sessionId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) return null;

    return normalizeAgentSessionDoc({ id: snapshot.id, ...snapshot.data() });
  } catch (err) {
    console.error("[firestoreSession] ERROR fetchAgentSession:", err.message, "sessionId:", sessionId);
    return null;
  }
}

/**
 * Called when the conversation is complete and the spec is confirmed.
 * Marks the session as completed and records the completion timestamp.
 *
 * Firestore path: agentSessions/{sessionId}
 */
export async function completeAgent(agentId, sessionId) {
  if (!agentId || !sessionId) return null;

  try {
    const ref = doc(db, "agentSessions", sessionId);
    await updateDoc(ref, {
      status: "completed",
      ownerUid: auth.currentUser?.uid || "",
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    console.log(`[firestoreSession] ✅ session completed — path: agentSessions/${sessionId}`);

    const provisioningResult = await postConversationProvisionRequest(sessionId);
    if (!provisioningResult?.ok && !provisioningResult?.skipped) {
      console.warn(
        "[firestoreSession] conversation tenant provisioning did not complete:",
        provisioningResult?.error || "unknown error",
        "sessionId:",
        sessionId
      );
    }

    return {
      sessionCompleted: true,
      provisioning: provisioningResult,
    };
  } catch (err) {
    console.error("[firestoreSession] ERROR completeAgent:", err.message, "sessionId:", sessionId);
  }

  return null;
}
