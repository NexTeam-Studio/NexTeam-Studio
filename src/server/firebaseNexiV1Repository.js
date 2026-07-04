import crypto from "crypto";
import {
  nexiConversationLogCollectionPath,
  nexiFailureLogCollectionPath,
  tenantConfigDocPath,
  tenantRootDocPath,
  tenantRuntimeSummaryDocPath,
} from "../features/missioncontrol/services/firestorePaths.js";
import { getFirebaseAdminDb } from "./firebaseAdminApp.js";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function clonePlainData(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildConversationHistoryMessages(entries = []) {
  const messages = [];
  for (const entry of entries) {
    const question = normalizeText(entry?.question);
    const answer = normalizeText(entry?.answer);
    if (question) {
      messages.push({ role: "user", content: question });
    }
    if (answer) {
      messages.push({ role: "assistant", content: answer });
    }
  }
  return messages;
}

export function buildNexiActorSummary(actor = {}) {
  return {
    uid: normalizeText(actor?.uid),
    email: normalizeText(actor?.email).toLowerCase(),
    tenantId: normalizeText(actor?.tenantId),
    roles: Array.isArray(actor?.roles) ? actor.roles.map((role) => normalizeText(role)).filter(Boolean) : [],
  };
}

export function createFirebaseNexiV1Repository({ env = process.env } = {}) {
  const db = getFirebaseAdminDb(env);

  return {
    async getTenantContext(tenantId) {
      const [rootSnap, configSnap, summarySnap] = await Promise.all([
        db.doc(tenantRootDocPath(tenantId)).get(),
        db.doc(tenantConfigDocPath(tenantId, "current")).get(),
        db.doc(tenantRuntimeSummaryDocPath(tenantId, "current")).get(),
      ]);

      return {
        tenantId,
        root: rootSnap.exists ? clonePlainData(rootSnap.data()) : null,
        config: configSnap.exists ? clonePlainData(configSnap.data()) : null,
        summary: summarySnap.exists ? clonePlainData(summarySnap.data()) : null,
      };
    },

    async appendConversationLog({
      tenantId,
      actor,
      conversationId,
      question,
      answer,
      route,
      source,
      success = true,
      attachmentCount = 0,
    }) {
      const collection = db.collection(nexiConversationLogCollectionPath(tenantId));
      const ref = collection.doc();
      const createdAt = nowIso();
      const safeConversationId = normalizeText(conversationId) || `conv-${crypto.randomUUID()}`;
      const payload = {
        conversationId: safeConversationId,
        tenantId,
        actor: buildNexiActorSummary(actor),
        question: normalizeText(question),
        answer: normalizeText(answer),
        route: route || null,
        source: source || null,
        success: success === true,
        attachmentCount: Number(attachmentCount || 0),
        createdAt,
        updatedAt: createdAt,
      };
      await ref.set(payload);
      return {
        id: ref.id,
        path: ref.path,
        conversationId: safeConversationId,
      };
    },

    async listConversationHistory({
      tenantId,
      conversationId,
      limit = 10,
    }) {
      const normalizedConversationId = normalizeText(conversationId);
      if (!normalizedConversationId) {
        return [];
      }

      const snapshot = await db
        .collection(nexiConversationLogCollectionPath(tenantId))
        .orderBy("createdAt", "desc")
        .limit(Math.max(Number(limit || 10) * 3, 20))
        .get();

      const entries = snapshot.docs
        .map((doc) => clonePlainData(doc.data()))
        .filter((entry) => normalizeText(entry?.conversationId) === normalizedConversationId)
        .sort((left, right) => normalizeText(left?.createdAt).localeCompare(normalizeText(right?.createdAt)))
        .slice(-Math.max(Number(limit || 10), 1));

      return buildConversationHistoryMessages(entries);
    },

    async appendFailureLog({
      tenantId,
      actor,
      conversationId,
      question,
      failureCode,
      failureReason,
      classifier,
    }) {
      const collection = db.collection(nexiFailureLogCollectionPath(tenantId));
      const ref = collection.doc();
      const createdAt = nowIso();
      const payload = {
        conversationId: normalizeText(conversationId) || null,
        tenantId,
        actor: buildNexiActorSummary(actor),
        question: normalizeText(question),
        failureCode: normalizeText(failureCode) || "NEXI_V1_UNHANDLED",
        failureReason: normalizeText(failureReason),
        classifier: classifier || null,
        createdAt,
      };
      await ref.set(payload);
      return {
        id: ref.id,
        path: ref.path,
      };
    },
  };
}

export const firebaseNexiV1RepositoryInternals = {
  buildConversationHistoryMessages,
  buildNexiActorSummary,
};
