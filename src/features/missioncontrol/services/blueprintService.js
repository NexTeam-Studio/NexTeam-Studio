/**
 * Blueprint Service — reads/writes blueprints for a tenant.
 * Falls back to SEED_BLUEPRINTS when Firestore returns empty or errors.
 */

import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  setDoc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../../../firebase";
import { NJORD_CONFIG } from "../config/njordConfig";
import { SEED_BLUEPRINTS } from "../data/aquatraceSeedData";
import { validateBlueprint, blueprintToPreviewText } from "../schemas/blueprintSchema";
import { instantiateOnboardingFromBlueprint } from "../schemas/onboardingSchema";
import {
  blueprintCollectionPath,
  blueprintDocPath,
  onboardingSessionCollectionPath,
  onboardingSessionDocPath,
  assertSafeTenantId
} from "./firestorePaths";

assertSafeTenantId(NJORD_CONFIG.tenantId); // fail fast if misconfigured
const COLLECTION = blueprintCollectionPath(NJORD_CONFIG.tenantId);
const ONBOARDING_COLLECTION = onboardingSessionCollectionPath(NJORD_CONFIG.tenantId);

// ── helpers ────────────────────────────────────────

function seedFallback() {
  return SEED_BLUEPRINTS.map((bp) => ({
    ...bp,
    _seeded: true,
    humanReadablePreview: blueprintToPreviewText(bp)
  }));
}

// ── reads ──────────────────────────────────────────

export async function fetchBlueprints({ state = null } = {}) {
  try {
    const q = query(collection(db, COLLECTION), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);

    let blueprints = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (blueprints.length === 0) {
      blueprints = seedFallback();
    } else {
      blueprints = blueprints.map((bp) => ({ ...bp, humanReadablePreview: blueprintToPreviewText(bp) }));
    }

    if (state) blueprints = blueprints.filter((bp) => bp.state === state);
    return blueprints;
  } catch (error) {
    console.warn("[blueprintService] fetchBlueprints fallback:", error.message);
    let blueprints = seedFallback();
    if (state) blueprints = blueprints.filter((bp) => bp.state === state);
    return blueprints;
  }
}

export async function fetchBlueprintById(blueprintId) {
  try {
    const path = blueprintDocPath(NJORD_CONFIG.tenantId, blueprintId);
    const snap = await getDoc(doc(db, path));
    if (snap.exists()) {
      const bp = { id: snap.id, ...snap.data() };
      return { ...bp, humanReadablePreview: blueprintToPreviewText(bp) };
    }
  } catch (error) {
    console.warn("[blueprintService] fetchBlueprintById error:", error.message);
  }
  const seed = SEED_BLUEPRINTS.find((bp) => bp.id === blueprintId);
  return seed ? { ...seed, _seeded: true, humanReadablePreview: blueprintToPreviewText(seed) } : null;
}

// ── writes ─────────────────────────────────────────

export async function createBlueprint(bpData) {
  const errors = validateBlueprint(bpData);
  if (errors.length > 0) return { ok: false, errors };

  const now = serverTimestamp();
  const payload = {
    ...bpData,
    humanReadablePreview: blueprintToPreviewText(bpData),
    createdAt: now,
    updatedAt: now
  };

  try {
    if (bpData.id) {
      const path = blueprintDocPath(NJORD_CONFIG.tenantId, bpData.id);
      await setDoc(doc(db, path), payload, { merge: true });
      return { ok: true, id: bpData.id };
    }
    const ref = await addDoc(collection(db, COLLECTION), payload);
    return { ok: true, id: ref.id };
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
}

export async function updateBlueprint(blueprintId, patch) {
  try {
    const bpPath = blueprintDocPath(NJORD_CONFIG.tenantId, blueprintId);
    await updateDoc(doc(db, bpPath), {
      ...patch,
      humanReadablePreview: null,
      updatedAt: serverTimestamp()
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
}

/**
 * Instantiate a client from a blueprint — creates an onboarding session.
 * @param {string} blueprintId
 * @param {{ clientId: string, clientName: string, assignedTo?: string }} clientInfo
 */
export async function instantiateClientFromBlueprint(blueprintId, clientInfo) {
  const blueprint = await fetchBlueprintById(blueprintId);
  if (!blueprint) return { ok: false, errors: ["Blueprint not found."] };

  const session = instantiateOnboardingFromBlueprint(blueprint, clientInfo);

  try {
    const now = serverTimestamp();
    const payload = {
      ...session,
      createdAt: now,
      updatedAt: now
    };

    if (session.id) {
      const path = onboardingSessionDocPath(NJORD_CONFIG.tenantId, session.id);
      await setDoc(doc(db, path), payload, { merge: true });
    } else {
      const ref = await addDoc(collection(db, ONBOARDING_COLLECTION), payload);
      session.id = ref.id;
    }

    return { ok: true, session };
  } catch (error) {
    console.warn("[blueprintService] instantiate fallback (no Firestore write):", error.message);
    // Return the in-memory session anyway so UI can display it
    return { ok: true, session, _localOnly: true };
  }
}
