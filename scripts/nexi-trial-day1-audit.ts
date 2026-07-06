import { mkdir, writeFile } from "node:fs/promises";
import { getAdminDb } from "../apps/server/src/firebase.js";
import { CompanyCamAdapter, JobberAdapter } from "@nexteam/providers";

const tenantId = process.env.TENANT_ID || "aquatrace";
const start = process.env.TRIAL_AUDIT_START || "2026-07-05T01:50:00.000Z";
const end = process.env.TRIAL_AUDIT_END || "2026-07-05T02:15:00.000Z";
const receiptPath = process.env.TRIAL_AUDIT_RECEIPT || "receipts/m1/trial-day1-firestore-audit.json";

interface ConversationLike {
  id: string;
  conversationId?: string | undefined;
  tenantId: string;
  userText: string;
  assistantText: string;
  sources?: unknown[] | undefined;
  createdAt: string;
}

interface FailureLike {
  id: string;
  tenantId: string;
  op?: string | undefined;
  question?: string | undefined;
  reason?: string | undefined;
  sources?: unknown[] | undefined;
  createdAt: string;
}

function inWindow(createdAt: string): boolean {
  return createdAt >= start && createdAt <= end;
}

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function classifyPrompt(text: string): string[] {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  if (/gallon/.test(lower)) tags.push("gallons");
  if (/issue|problem|result|finding|leak/.test(lower)) tags.push("issue_or_report");
  if (/schedule|monday|today|tomorrow|technician|tech/.test(lower)) tags.push("schedule_or_technician");
  if (/revenue|owe|owes|money|invoice/.test(lower)) tags.push("finance");
  if (/source|tool|use|incorrect|wrong|bug|companycam|jobber/.test(lower)) tags.push("meta_or_feedback");
  return tags;
}

function requestedName(text: string): string {
  const patterns = [
    /deborah\s+justice/i,
    /camp\s+mikell/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) {
      return match[0];
    }
  }
  return text.replace(/[?!.]+$/g, "").trim();
}

function grade(conversation: ConversationLike): "needs_manual_review" | "honest-fail" | "wrong" | "correct" {
  const answer = conversation.assistantText.toLowerCase();
  const prompt = conversation.userText.toLowerCase();
  if (/verified source|do not have|don't have|not have/.test(answer)) {
    return "honest-fail";
  }
  if (/deborah\s+justice/.test(prompt) && /101,?000|camp\s+mikell|camp-mikell/.test(answer)) {
    return "wrong";
  }
  return "needs_manual_review";
}

async function maybeReplayTools(conversation: ConversationLike): Promise<Record<string, unknown>> {
  const tags = classifyPrompt(conversation.userText);
  const replay: Record<string, unknown> = { tags };
  const name = requestedName(conversation.userText);
  const jobber = JobberAdapter.fromEnv(process.env, tenantId);
  const companycam = CompanyCamAdapter.fromEnv(process.env, tenantId);

  if (tags.includes("schedule_or_technician")) {
    replay.jobberScheduleToday = await jobber.getJobs({ from: start, to: end }).catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error)
    }));
  }
  if (tags.includes("gallons") || tags.includes("issue_or_report") || tags.includes("schedule_or_technician")) {
    replay.jobberJobDetail = await jobber.getJobDetail({ nameQuery: name }).catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error)
    }));
  }
  if (tags.includes("issue_or_report") || tags.includes("schedule_or_technician") || conversation.userText.toLowerCase().includes("companycam")) {
    const projects = await companycam.findProjects(name).catch((error: unknown) => [{
      error: error instanceof Error ? error.message : String(error)
    }]);
    replay.companyCamProjects = projects;
    const first = Array.isArray(projects) && projects[0] && !("error" in (projects[0] as Record<string, unknown>))
      ? projects[0] as { id: string; name: string }
      : null;
    if (first) {
      replay.companyCamDocuments = await companycam.getDocuments(first).catch((error: unknown) => ({
        error: error instanceof Error ? error.message : String(error)
      }));
      replay.companyCamMediaSample = await companycam.getMedia(first).then((media) => media.slice(0, 5)).catch((error: unknown) => ({
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }
  return replay;
}

const db = getAdminDb();
if (!db) {
  throw new Error("Firebase Admin is required for trial audit.");
}

const conversationSnapshot = await db.collection("conversations").where("tenantId", "==", tenantId).get();
const conversations = conversationSnapshot.docs
  .map((doc) => ({ id: doc.id, ...doc.data() }) as ConversationLike)
  .filter((doc) => inWindow(doc.createdAt))
  .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

const failureSnapshot = await db.collection("failureLog").where("tenantId", "==", tenantId).get();
const failures = failureSnapshot.docs
  .map((doc) => ({ id: doc.id, ...doc.data() }) as FailureLike)
  .filter((doc) => inWindow(doc.createdAt))
  .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

const siteJobBlueprintSnapshot = await db.collection("siteJobBlueprints").where("tenantId", "==", tenantId).get();
const siteJobBlueprints = siteJobBlueprintSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

const answers = [];
for (const conversation of conversations) {
  answers.push({
    id: conversation.id,
    createdAt: conversation.createdAt,
    conversationId: conversation.conversationId ?? null,
    prompt: conversation.userText,
    assistantText: conversation.assistantText,
    storedSources: conversation.sources ?? [],
    grade: grade(conversation),
    replayedRawToolData: await maybeReplayTools(conversation)
  });
}

const honestFailureMatches = failures.filter((failure) => {
  const text = `${safeText(failure.question)} ${safeText(failure.reason)}`.toLowerCase();
  return /revenue|owe|owes|money|invoice/.test(text);
});

const receipt = {
  ok: true,
  tenantId,
  window: {
    local: "2026-07-04 21:50-22:15 America/New_York",
    start,
    end
  },
  note: "Firestore conversations do not persist raw toolRuns in current M1; replayedRawToolData reruns read-only rails for audit evidence.",
  counts: {
    conversations: conversations.length,
    failureLog: failures.length,
    honestFailureMatches: honestFailureMatches.length,
    siteJobBlueprints: siteJobBlueprints.length
  },
  answers,
  rawFailureLogEntries: failures,
  honestFailureMatches,
  siteJobBlueprints
};

await mkdir("receipts/m1", { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  receiptPath,
  conversations: conversations.length,
  failureLog: failures.length,
  honestFailureMatches: honestFailureMatches.length
}, null, 2));
