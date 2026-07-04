import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../../../firebase.js";
import {
  tenantConfigDocPath,
  tenantRootDocPath,
  tenantRuntimeSummaryDocPath,
  tenantSubagentCollectionPath,
} from "../../tenancy/services/tenantPathUtils.js";
import {
  assertSafeTenantId,
  blueprintCollectionPath,
  onboardingSessionCollectionPath,
} from "./firestorePaths.js";
import { computeOnboardingProgress } from "../schemas/onboardingSchema.js";

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function sortByRecent(records = []) {
  return [...records].sort((left, right) => {
    const leftValue = Date.parse(left.updatedAt || left.createdAt || 0);
    const rightValue = Date.parse(right.updatedAt || right.createdAt || 0);
    return Number.isNaN(rightValue) || Number.isNaN(leftValue) ? 0 : rightValue - leftValue;
  });
}

export async function fetchTenantWorkspaceSnapshot(tenantId) {
  assertSafeTenantId(tenantId);

  const [rootSnap, configSnap, summarySnap, subagentSnap, blueprintSnap, onboardingSnap] = await Promise.all([
    getDoc(doc(db, tenantRootDocPath(tenantId))),
    getDoc(doc(db, tenantConfigDocPath(tenantId, "current"))),
    getDoc(doc(db, tenantRuntimeSummaryDocPath(tenantId, "current"))),
    getDocs(collection(db, tenantSubagentCollectionPath(tenantId))),
    getDocs(collection(db, blueprintCollectionPath(tenantId))),
    getDocs(collection(db, onboardingSessionCollectionPath(tenantId))),
  ]);

  const root = rootSnap.exists()
    ? {
        id: rootSnap.id,
        ...rootSnap.data(),
        updatedAt: normalizeDate(rootSnap.data()?.updatedAt),
      }
    : null;

  const config = configSnap.exists() ? { id: configSnap.id, ...configSnap.data() } : null;
  const runtimeSummary = summarySnap.exists()
    ? {
        id: summarySnap.id,
        ...summarySnap.data(),
        updatedAt: normalizeDate(summarySnap.data()?.updatedAt),
      }
    : null;

  const subagents = subagentSnap.docs.map((subagentDoc) => ({
    id: subagentDoc.id,
    ...subagentDoc.data(),
    updatedAt: normalizeDate(subagentDoc.data()?.updatedAt),
  }));

  const blueprints = sortByRecent(
    blueprintSnap.docs.map((blueprintDoc) => ({
      id: blueprintDoc.id,
      ...blueprintDoc.data(),
      updatedAt: normalizeDate(blueprintDoc.data()?.updatedAt),
      createdAt: normalizeDate(blueprintDoc.data()?.createdAt),
    }))
  );

  const onboardingSessions = sortByRecent(
    onboardingSnap.docs.map((onboardingDoc) => {
      const data = onboardingDoc.data() || {};
      const session = {
        id: onboardingDoc.id,
        ...data,
        updatedAt: normalizeDate(data.updatedAt),
        createdAt: normalizeDate(data.createdAt),
        startedAt: normalizeDate(data.startedAt),
        completedAt: normalizeDate(data.completedAt),
      };

      return {
        ...session,
        progress: computeOnboardingProgress(session),
      };
    })
  );

  const starterBlueprint =
    blueprints.find((blueprint) => blueprint.id === root?.starterBlueprintId) || blueprints[0] || null;
  const activeOnboardingSession =
    onboardingSessions.find((session) => session.id === root?.starterOnboardingSessionId) ||
    onboardingSessions[0] ||
    null;

  return {
    tenantId,
    route: root?.route || `/mission-control/${tenantId}`,
    clientRoute: `/agent-architect?tenantId=${tenantId}`,
    root,
    config,
    runtimeSummary,
    subagents,
    blueprints,
    onboardingSessions,
    starterBlueprint,
    activeOnboardingSession,
  };
}
