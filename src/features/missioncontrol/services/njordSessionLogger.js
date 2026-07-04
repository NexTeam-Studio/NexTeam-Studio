/**
 * Njord Session Logger — Mission Control
 *
 * Writes session events to Firestore under the njordSessions collection.
 * Isolated from the main agentSessions collection used by Nexi/NexTeam.
 *
 * Collection: njordSessions/{sessionId}
 * Sub-collection for events: njordSessions/{sessionId}/events/{eventId}
 */

import { db } from "../../../firebase.js";
import {
  doc,
  setDoc,
  addDoc,
  updateDoc,
  collection,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { NJORD_CONFIG } from "../config/njordConfig.js";

const _initializedSessions = new Set();

/**
 * Initializes a new Njord session doc in Firestore.
 * Safe to call multiple times; only creates on first call per sessionId.
 *
 * @param {string} sessionId
 * @param {Object} [metadata] - Optional initial metadata (e.g. userId, source)
 */
export async function initNjordSession(sessionId, metadata = {}) {
  if (!sessionId) return;
  if (_initializedSessions.has(sessionId)) return;

  try {
    const ref = doc(db, NJORD_CONFIG.sessionCollection, sessionId);
    await setDoc(
      ref,
      {
        sessionId,
        tenantId: NJORD_CONFIG.tenantId,
        agentName: NJORD_CONFIG.agentName,
        caseStudyMode: NJORD_CONFIG.caseStudyMode,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...metadata,
      },
      { merge: true }
    );
    _initializedSessions.add(sessionId);
    console.log(`[njordSessionLogger] ✅ session initialized — ${sessionId}`);
  } catch (err) {
    console.error("[njordSessionLogger] ERROR initNjordSession:", err.message);
  }
}

/**
 * Appends a turn event to the session's events sub-collection.
 *
 * @param {string} sessionId
 * @param {'user'|'agent'|'system'} role
 * @param {string} content
 * @param {Object} [extra] - Optional extra fields (intent, routedTo, etc.)
 */
export async function logNjordTurn(sessionId, role, content, extra = {}) {
  if (!sessionId) return;

  try {
    const eventsRef = collection(
      db,
      NJORD_CONFIG.sessionCollection,
      sessionId,
      "events"
    );
    await addDoc(eventsRef, {
      role,
      content,
      timestamp: serverTimestamp(),
      ...extra,
    });

    // Bump the parent session's updatedAt
    const sessionRef = doc(db, NJORD_CONFIG.sessionCollection, sessionId);
    await updateDoc(sessionRef, { updatedAt: serverTimestamp() });
  } catch (err) {
    console.error("[njordSessionLogger] ERROR logNjordTurn:", err.message);
  }
}

/**
 * Marks a Njord session as completed.
 *
 * @param {string} sessionId
 */
export async function closeNjordSession(sessionId) {
  if (!sessionId) return;

  try {
    const ref = doc(db, NJORD_CONFIG.sessionCollection, sessionId);
    await updateDoc(ref, {
      status: "completed",
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log(`[njordSessionLogger] ✅ session closed — ${sessionId}`);
  } catch (err) {
    console.error("[njordSessionLogger] ERROR closeNjordSession:", err.message);
  }
}

/**
 * Loads a Njord session doc for review.
 *
 * @param {string} sessionId
 * @returns {Object|null}
 */
export async function fetchNjordSession(sessionId) {
  if (!sessionId) return null;

  try {
    const ref = doc(db, NJORD_CONFIG.sessionCollection, sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (err) {
    console.error("[njordSessionLogger] ERROR fetchNjordSession:", err.message);
    return null;
  }
}
