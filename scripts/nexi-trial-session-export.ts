import { mkdir, writeFile } from "node:fs/promises";
import { getAdminDb } from "../apps/server/src/firebase.js";

const tenantId = process.env.TENANT_ID || "aquatrace";
const start = process.env.TRIAL_AUDIT_START || "2026-07-04T00:00:00.000Z";
const end = process.env.TRIAL_AUDIT_END || new Date().toISOString();
const receiptPath = process.env.TRIAL_AUDIT_RECEIPT || "receipts/m1/nexi-trial-full-session-export-redacted.json";

type JsonRecord = Record<string, unknown>;

interface ConversationDoc extends JsonRecord {
  id: string;
  tenantId: string;
  conversationId?: string;
  userText?: string;
  assistantText?: string;
  createdAt?: string;
  toolRuns?: Array<{ name?: string; result?: unknown; sources?: unknown[] }>;
}

interface FailureLogDoc extends JsonRecord {
  id: string;
  tenantId: string;
  question?: string;
  reason?: string;
  createdAt?: string;
}

function inWindow(createdAt: unknown): boolean {
  return typeof createdAt === "string" && createdAt >= start && createdAt <= end;
}

function redactEmailContent(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactEmailContent);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value as JsonRecord).map(([key, entry]) => {
    if (/^(?:body|bodyText|bodyHtml|snippet|text|html|subject|from|to|cc|bcc|data|content|raw)$/i.test(key)) {
      return [key, "[redacted-email-content]"];
    }
    return [key, redactEmailContent(entry)];
  }));
}

function redactConversation(doc: ConversationDoc): ConversationDoc {
  const toolRuns = Array.isArray(doc.toolRuns)
    ? doc.toolRuns.map((run) => ({
      ...run,
      result: Array.isArray(run.sources) && run.sources.some((source) =>
        source && typeof source === "object" && (source as JsonRecord).rail === "email"
      )
        ? redactEmailContent(run.result)
        : run.result
    }))
    : [];
  return { ...doc, toolRuns };
}

function groupByConversationId(conversations: ConversationDoc[]): Record<string, ConversationDoc[]> {
  const grouped: Record<string, ConversationDoc[]> = {};
  for (const conversation of conversations) {
    const key = conversation.conversationId || conversation.id;
    grouped[key] ??= [];
    grouped[key].push(conversation);
  }
  return Object.fromEntries(Object.entries(grouped).map(([key, items]) => [
    key,
    items.sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")))
  ]));
}

const db = getAdminDb();
if (!db) {
  throw new Error("Firebase Admin credentials are required for Nexi trial session export.");
}

const [conversationSnapshot, failureSnapshot, usageSnapshot] = await Promise.all([
  db.collection("conversations").where("tenantId", "==", tenantId).get(),
  db.collection("failureLog").where("tenantId", "==", tenantId).get(),
  db.collection("usageLog").where("tenantId", "==", tenantId).get()
]);

const conversations = conversationSnapshot.docs
  .map((doc) => redactConversation({ id: doc.id, ...doc.data() } as ConversationDoc))
  .filter((doc) => inWindow(doc.createdAt))
  .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));

const failures = failureSnapshot.docs
  .map((doc) => ({ id: doc.id, ...doc.data() } as FailureLogDoc))
  .filter((doc) => inWindow(doc.createdAt))
  .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));

const usage = usageSnapshot.docs
  .map((doc) => ({ id: doc.id, ...doc.data() } as JsonRecord))
  .filter((doc) => inWindow(doc.createdAt))
  .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")))
  .map((record) => ({
    id: record.id,
    createdAt: record.createdAt,
    routeActionName: record.routeActionName,
    taskType: record.taskType,
    ok: record.ok,
    model: record.model,
    usage: record.usage,
    estimatedCostUsd: record.estimatedCostUsd,
    errorSummary: record.errorSummary
  }));

const receipt = {
  ok: true,
  tenantId,
  window: { start, end },
  redaction: "Email tool result bodies/snippets/subjects/address fields are redacted. User-visible conversation turns are preserved for trial audit.",
  counts: {
    conversations: conversations.length,
    groupedSessions: Object.keys(groupByConversationId(conversations)).length,
    failureLog: failures.length,
    usageLog: usage.length
  },
  conversations,
  sessions: groupByConversationId(conversations),
  failureLog: failures,
  usageLog: usage
};

await mkdir(receiptPath.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  receiptPath,
  window: { start, end },
  counts: receipt.counts
}, null, 2));
