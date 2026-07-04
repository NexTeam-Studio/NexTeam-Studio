/**
 * SOP Service — reads/writes SOPs for a tenant.
 * Falls back to SEED_SOPS when Firestore returns empty or errors.
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
import { SEED_SOPS } from "../data/aquatraceSeedData";
import { validateSOP, transitionSOPState, sopToPreviewText } from "../schemas/sopSchema";
import { sopCollectionPath, sopDocPath, assertSafeTenantId } from "./firestorePaths";

assertSafeTenantId(NJORD_CONFIG.tenantId); // fail fast if misconfigured
const COLLECTION = sopCollectionPath(NJORD_CONFIG.tenantId);

// ── helpers ────────────────────────────────────────

function seedFallback() {
  return SEED_SOPS.map((sop) => ({
    ...sop,
    _seeded: true,
    humanReadablePreview: sopToPreviewText(sop)
  }));
}

// ── reads ──────────────────────────────────────────

export async function fetchSOPs({ state = null, category = null } = {}) {
  try {
    const q = query(collection(db, COLLECTION), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q); // COLLECTION already validated via sopCollectionPath

    let sops = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (sops.length === 0) {
      sops = seedFallback();
    } else {
      sops = sops.map((sop) => ({ ...sop, humanReadablePreview: sopToPreviewText(sop) }));
    }

    if (state) sops = sops.filter((s) => s.state === state);
    if (category) sops = sops.filter((s) => s.category === category);

    return sops;
  } catch (error) {
    console.warn("[sopService] fetchSOPs fallback:", error.message);
    let sops = seedFallback();
    if (state) sops = sops.filter((s) => s.state === state);
    if (category) sops = sops.filter((s) => s.category === category);
    return sops;
  }
}

export async function fetchSOPById(sopId) {
  try {
    const path = sopDocPath(NJORD_CONFIG.tenantId, sopId);
    const snap = await getDoc(doc(db, path));
    if (snap.exists()) {
      const sop = { id: snap.id, ...snap.data() };
      return { ...sop, humanReadablePreview: sopToPreviewText(sop) };
    }
    // fall through to seed
  } catch (error) {
    console.warn("[sopService] fetchSOPById error:", error.message);
  }
  const seed = SEED_SOPS.find((s) => s.id === sopId);
  return seed ? { ...seed, _seeded: true, humanReadablePreview: sopToPreviewText(seed) } : null;
}

// ── writes ─────────────────────────────────────────

export async function createSOP(sopData) {
  const errors = validateSOP(sopData);
  if (errors.length > 0) return { ok: false, errors };

  const now = serverTimestamp();
  const payload = {
    ...sopData,
    humanReadablePreview: sopToPreviewText(sopData),
    createdAt: now,
    updatedAt: now
  };

  try {
    if (sopData.id) {
      const path = sopDocPath(NJORD_CONFIG.tenantId, sopData.id);
      await setDoc(doc(db, path), payload, { merge: true });
      return { ok: true, id: sopData.id };
    }
    const ref = await addDoc(collection(db, COLLECTION), payload);
    return { ok: true, id: ref.id };
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
}

export async function updateSOP(sopId, patch) {
  try {
    const path = sopDocPath(NJORD_CONFIG.tenantId, sopId);
    await updateDoc(doc(db, path), {
      ...patch,
      humanReadablePreview: null, // will be recomputed on next fetch
      updatedAt: serverTimestamp()
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
}

export async function transitionSOP(sopId, action, operatorId = "operator") {
  const sop = await fetchSOPById(sopId);
  if (!sop) return { ok: false, errors: ["SOP not found."] };

  const newState = transitionSOPState(sop.state, action);
  if (!newState) return { ok: false, errors: [`Invalid transition: ${action} from ${sop.state}.`] };

  const patch = {
    state: newState,
    updatedAt: serverTimestamp()
  };

  if (action === "approve") {
    patch.approvedBy = operatorId;
    patch.publishedAt = serverTimestamp();
  }

  // Record revision on version bump
  if (action === "approve") {
    patch.version = (sop.version || 1) + 1;
    patch.revisionHistory = [
      ...(sop.revisionHistory || []),
      {
        version: sop.version,
        updatedAt: new Date().toISOString(),
        updatedBy: operatorId,
        note: `Approved to v${(sop.version || 1) + 1}`
      }
    ];
  }

  try {
    if (sop._seeded) {
      // Cannot write to seed — return optimistic state
      return { ok: true, newState, seeded: true };
    }
    const path = sopDocPath(NJORD_CONFIG.tenantId, sopId);
    await updateDoc(doc(db, path), patch);
    return { ok: true, newState };
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
}

export async function duplicateSOP(sopId, operatorId = "operator") {
  const original = await fetchSOPById(sopId);
  if (!original) return { ok: false, errors: ["SOP not found."] };

  const duplicate = {
    ...original,
    id: undefined,
    title: `${original.title} (Copy)`,
    state: "draft",
    version: 1,
    revisionHistory: [],
    publishedAt: null,
    approvedBy: null,
    createdBy: operatorId,
    _seeded: undefined
  };

  return createSOP(duplicate);
}
