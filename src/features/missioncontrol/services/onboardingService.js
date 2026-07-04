/**
 * Onboarding Service — reads/writes live onboarding sessions.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../../../firebase";
import { NJORD_CONFIG } from "../config/njordConfig";
import { SEED_ONBOARDING_SESSIONS } from "../data/aquatraceSeedData";
import {
  onboardingSessionCollectionPath,
  onboardingSessionDocPath,
  assertSafeTenantId
} from "./firestorePaths";
import {
  ONBOARDING_TASK_STATES,
  ONBOARDING_SESSION_STATES,
  computeOnboardingProgress,
  onboardingSessionToPreviewText
} from "../schemas/onboardingSchema";

assertSafeTenantId(NJORD_CONFIG.tenantId); // fail fast if misconfigured
const COLLECTION = onboardingSessionCollectionPath(NJORD_CONFIG.tenantId);

// ── reads ──────────────────────────────────────────

function sessionSeedFallback(state) {
  let sessions = (SEED_ONBOARDING_SESSIONS || []).map((s) => ({
    ...s,
    _seeded: true,
    progress: computeOnboardingProgress(s),
    humanReadablePreview: onboardingSessionToPreviewText(s)
  }));
  if (state) sessions = sessions.filter((s) => s.state === state);
  return sessions;
}

export async function fetchOnboardingSessions({ state = null } = {}) {
  try {
    const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    let sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (sessions.length === 0) {
      return sessionSeedFallback(state);
    }
    if (state) sessions = sessions.filter((s) => s.state === state);
    return sessions.map((s) => ({
      ...s,
      progress: computeOnboardingProgress(s),
      humanReadablePreview: onboardingSessionToPreviewText(s)
    }));
  } catch (error) {
    console.warn("[onboardingService] fetchOnboardingSessions fallback:", error.message);
    return sessionSeedFallback(state);
  }
}
export async function fetchOnboardingSessionById(sessionId) {
  try {
    const path = onboardingSessionDocPath(NJORD_CONFIG.tenantId, sessionId);
    const snap = await getDoc(doc(db, path));
    if (!snap.exists()) return null;
    const session = { id: snap.id, ...snap.data() };
    return {
      ...session,
      progress: computeOnboardingProgress(session),
      humanReadablePreview: onboardingSessionToPreviewText(session)
    };
  } catch (error) {
    console.warn("[onboardingService] fetchOnboardingSessionById error:", error.message);
    return null;
  }
}

// ── task mutations ─────────────────────────────────

export async function updateOnboardingTask(sessionId, taskId, patch) {
  const session = await fetchOnboardingSessionById(sessionId);
  if (!session) return { ok: false, errors: ["Session not found."] };

  const tasks = (session.tasks || []).map((task) =>
    task.taskId === taskId ? { ...task, ...patch } : task
  );

  const allDone = tasks.every(
    (task) =>
      task.state === ONBOARDING_TASK_STATES.COMPLETE || task.state === ONBOARDING_TASK_STATES.SKIPPED
  );

  const newSessionState = allDone
    ? ONBOARDING_SESSION_STATES.COMPLETE
    : session.state === ONBOARDING_SESSION_STATES.PENDING
    ? ONBOARDING_SESSION_STATES.ACTIVE
    : session.state;

  try {
    const docPath = onboardingSessionDocPath(NJORD_CONFIG.tenantId, sessionId);
    await updateDoc(doc(db, docPath), {
      tasks,
      state: newSessionState,
      startedAt: session.startedAt || (newSessionState === ONBOARDING_SESSION_STATES.ACTIVE ? serverTimestamp() : null),
      completedAt: allDone ? serverTimestamp() : null,
      updatedAt: serverTimestamp()
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
}

export async function completeOnboardingTask(sessionId, taskId, operatorId = "operator") {
  return updateOnboardingTask(sessionId, taskId, {
    state: ONBOARDING_TASK_STATES.COMPLETE,
    completedAt: new Date().toISOString(),
    completedBy: operatorId
  });
}

export async function skipOnboardingTask(sessionId, taskId, reason = "") {
  return updateOnboardingTask(sessionId, taskId, {
    state: ONBOARDING_TASK_STATES.SKIPPED,
    notes: reason
  });
}

export async function blockOnboardingTask(sessionId, taskId, reason = "") {
  return updateOnboardingTask(sessionId, taskId, {
    state: ONBOARDING_TASK_STATES.BLOCKED,
    blockedReason: reason
  });
}

export async function startOnboardingTask(sessionId, taskId) {
  return updateOnboardingTask(sessionId, taskId, {
    state: ONBOARDING_TASK_STATES.IN_PROGRESS
  });
}
