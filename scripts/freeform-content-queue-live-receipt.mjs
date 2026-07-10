import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";
import {
  createOperatorProofSession,
  fetchJson,
  resolveBaseUrl,
  resolveOperatorProofIdentity
} from "./support/liveProofHelpers.mjs";

const baseUrl = (process.env.NEXI_BASE_URL || resolveBaseUrl()).replace(/\/$/, "");
const localHeadSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const expectedSha = process.env.RECEIPT_EXPECTED_GIT_SHA || localHeadSha;
const tenantId = process.env.TENANT_ID || "aquatrace";
const receiptPath = process.env.FREEFORM_CONTENT_RECEIPT || "receipts/m5/freeform-content-queue-live-receipt-current.json";
const runId = `freeform-content-${Date.now()}-${randomUUID().slice(0, 8)}`;

function hash(value = "") {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function summarizeDraft(draft) {
  return {
    id: draft?.id ?? null,
    kind: draft?.kind ?? null,
    title: draft?.title ?? null,
    status: draft?.status ?? null,
    approvalId: draft?.approvalId ?? null,
    bodySha256_16: hash(draft?.body ?? ""),
    bodyCharCount: String(draft?.body ?? "").length,
    publishingDeferred: true
  };
}

async function request(path, { idToken, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  const response = await fetchJson(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok || response.json?.ok === false) {
    throw new Error(`${method} ${path} failed (${response.status}): ${response.json?.error || response.text}`);
  }
  return response.json;
}

async function nexi(idToken, message, conversationId) {
  return request("/api/nexi/message", {
    idToken,
    method: "POST",
    body: { tenantId, conversationId, message }
  });
}

const receipt = {
  ok: false,
  receiptName: "freeform-content-queue-live-receipt-current",
  startedAt: new Date().toISOString(),
  stagingBaseUrl: baseUrl,
  expectedSha,
  tenantId,
  runId,
  checks: {},
  raw: {}
};

let proof = null;
try {
  proof = await createOperatorProofSession({
    identity: { ...resolveOperatorProofIdentity(), tenantId }
  });
  const idToken = proof.idToken;

  const version = await request("/api/version");
  receipt.raw.version = version;
  receipt.checks.versionShaMatched = version.sha === expectedSha;
  assert(receipt.checks.versionShaMatched, `version SHA mismatch: expected ${expectedSha}, got ${version.sha}`);

  const health = await request("/api/health");
  receipt.raw.health = {
    ok: health.ok,
    rails: Object.fromEntries(Object.entries(health.rails ?? {}).map(([name, rail]) => [name, { ok: Boolean(rail?.ok), message: rail?.message ?? "" }]))
  };
  receipt.checks.healthGreen = Boolean(health.ok && health.rails?.jobber?.ok && health.rails?.companycam?.ok && health.rails?.anthropic?.ok);
  assert(receipt.checks.healthGreen, "health was not green");

  const conversationId = `${runId}-owner-content`;
  const writePrompt = "write me an article for pool owners based on this real Aquatrace job scenario: a homeowner had unexplained daily water loss, Aquatrace checked the pool, pressure testing pointed to a leaking return line, and the article should explain why pressure testing matters without naming the customer";
  const writeTurn = await nexi(idToken, writePrompt, conversationId);
  receipt.raw.writeTurn = {
    prompt: writePrompt,
    answer: writeTurn.answer,
    toolRuns: writeTurn.toolRuns ?? [],
    sources: writeTurn.sources ?? []
  };
  receipt.checks.articleWrittenInChat = typeof writeTurn.answer === "string"
    && writeTurn.answer.length > 300
    && !/I don't have|I can't write|came back empty|no project|no documents|no reports|written down anywhere|verified source|matching email/i.test(writeTurn.answer);
  assert(receipt.checks.articleWrittenInChat, "Nexi did not produce usable article text in chat");

  const savePrompt = "save this to the content queue";
  const saveTurn = await nexi(idToken, savePrompt, conversationId);
  const saveRun = saveTurn.toolRuns?.find((run) => run.name === "queueFreeformContent");
  const savedDraft = saveRun?.result?.draft;
  receipt.raw.saveTurn = {
    prompt: savePrompt,
    answer: saveTurn.answer,
    toolRuns: saveTurn.toolRuns ?? [],
    sources: saveTurn.sources ?? []
  };
  receipt.checks.saveRoutedToFreeformTool = Boolean(saveRun);
  assert(receipt.checks.saveRoutedToFreeformTool, "save prompt did not route to queueFreeformContent");
  receipt.checks.savedDraftApprovalPending = savedDraft?.status === "approval_pending"
    && Boolean(savedDraft?.approvalId)
    && saveRun?.result?.savedToContentQueue === true
    && saveRun?.result?.publishingDeferred === true;
  assert(receipt.checks.savedDraftApprovalPending, "freeform content draft was not approval-pending with publishing deferred");
  receipt.checks.saveAnswerIsPlainConfirmation = /saved .*content queue/i.test(saveTurn.answer ?? "")
    && /not been published/i.test(saveTurn.answer ?? "");
  assert(receipt.checks.saveAnswerIsPlainConfirmation, "save answer did not plainly confirm queue/save boundary");

  const queue = await request(`/api/content/queue?tenantId=${encodeURIComponent(tenantId)}`);
  const queuedDraft = queue.drafts?.find((draft) => draft.id === savedDraft.id);
  receipt.raw.queueProof = {
    count: queue.drafts?.length ?? 0,
    savedDraft: summarizeDraft(queuedDraft)
  };
  receipt.checks.queueVisible = queuedDraft?.id === savedDraft.id
    && queuedDraft?.status === "approval_pending"
    && queuedDraft?.approvalId === savedDraft.approvalId;
  assert(receipt.checks.queueVisible, "saved freeform draft was not visible through the content queue API");

  receipt.ok = true;
  receipt.finishedAt = new Date().toISOString();
  receipt.operator = {
    mode: proof.mode,
    emailPresent: Boolean(proof.identity.email),
    uidPresent: Boolean(proof.identity.uid)
  };
  receipt.boundaries = {
    outboundExecuted: false,
    wordpressPublishExecuted: false,
    contentPublishingDeferred: true
  };
} catch (error) {
  receipt.ok = false;
  receipt.error = error instanceof Error ? error.message : String(error);
  receipt.finishedAt = new Date().toISOString();
  throw error;
} finally {
  await proof?.dispose?.().catch(() => {});
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: receipt.ok,
    receiptPath,
    checks: receipt.checks,
    sha: receipt.raw.version?.sha,
    error: receipt.error
  }, null, 2));
}
