import { db } from "../../../firebase.js";
import { collection, getDocs, orderBy, query, limit, where } from "firebase/firestore";

/**
 * Fetches agent sessions from Firestore for the operator view.
 * Returns sessions ordered by most recent update first.
 *
 * Firestore path: agentSessions/{sessionId}
 *
 * @param {number} maxResults - Maximum number of sessions to return
 * @param {string|null} tenantId - If provided, filters to this tenant only
 */
export async function fetchAgentSessions(maxResults = 50, tenantId = null) {
  const constraints = [orderBy("updatedAt", "desc"), limit(maxResults)];
  if (tenantId) {
    constraints.unshift(where("tenantId", "==", tenantId));
  }

  const q = query(collection(db, "agentSessions"), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
    // Convert Firestore Timestamps to ISO strings for display
    createdAt: docSnap.data().createdAt?.toDate?.()?.toISOString() ?? null,
    updatedAt: docSnap.data().updatedAt?.toDate?.()?.toISOString() ?? null,
    completedAt: docSnap.data().completedAt?.toDate?.()?.toISOString() ?? null
  }));
}
