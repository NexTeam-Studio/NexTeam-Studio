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
const expectedSha = process.env.EXPECTED_GIT_SHA || process.env.EXPECTED_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const tenantId = process.env.TENANT_ID || "aquatrace";
const receiptPath = process.env.PHASE0_REALITY_RECEIPT || "receipts/phase0/phase0-reality-live-receipt-current.json";
const runId = `phase0-${Date.now()}-${randomUUID().slice(0, 8)}`;

function hash(value = "") {
  return createHash("sha256").update(String(value).toLowerCase()).digest("hex").slice(0, 16);
}

function redact(value) {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  }
  if (typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    return `[email:${hash(value)}]`;
  }
  return value;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
  const response = await request("/api/nexi/message", {
    idToken,
    method: "POST",
    body: { tenantId, conversationId, message }
  });
  return response;
}

const receipt = {
  ok: false,
  receiptName: "phase0-reality-live-receipt-current",
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
  receipt.raw.health = health;
  receipt.checks.healthGreen = Boolean(health.ok && health.rails?.jobber?.ok && health.rails?.companycam?.ok && health.rails?.anthropic?.ok);
  assert(receipt.checks.healthGreen, "health was not green");

  const conversationId = `${runId}-owner-path`;
  const clientName = `Phase 0 Receipt Client ${runId}`;
  const clientAddress = "123 Receipt Lane, Fair Play, SC";
  const createClientTurn = await nexi(
    idToken,
    `add a new client ${clientName} at ${clientAddress}`,
    conversationId
  );
  receipt.raw.createClientTurn = redact({
    answer: createClientTurn.answer,
    toolRuns: createClientTurn.toolRuns,
    sources: createClientTurn.sources
  });
  const createRun = createClientTurn.toolRuns?.find((run) => run.name === "createClient");
  const createApprovalId = createRun?.result?.approval?.id;
  receipt.checks.createClientChatRouted = Boolean(createRun && createApprovalId && createRun.result?.writesAreApprovalQueuedOnly === true);
  assert(receipt.checks.createClientChatRouted, "Nexi did not route create-client prompt to approval-gated createClient");

  const pendingApprovals = await request(`/api/approval-queue?tenantId=${encodeURIComponent(tenantId)}`);
  receipt.raw.pendingApprovalsAfterCreateClient = redact({
    count: pendingApprovals.items?.length ?? 0,
    matching: pendingApprovals.items?.filter((item) => item.id === createApprovalId)
  });
  receipt.checks.createClientApprovalVisible = pendingApprovals.items?.some((item) =>
    item.id === createApprovalId
    && item.kind === "client"
    && item.execute?.service === "crm"
    && item.execute?.op === "createClient"
  );
  assert(receipt.checks.createClientApprovalVisible, "createClient ApprovalQueue item was not visible");

  const approvedClient = await request(`/api/approval-queue/${encodeURIComponent(createApprovalId)}/approve`, { method: "POST" });
  const executedClient = await request(`/api/approval-queue/${encodeURIComponent(createApprovalId)}/execute`, { method: "POST" });
  receipt.raw.createClientApprovalFlow = redact({ approvedClient, executedClient });
  receipt.checks.createClientExecuted = executedClient.item?.status === "executed"
    && executedClient.result?.client?.name === clientName
    && executedClient.result?.client?.tenantId === tenantId;
  assert(receipt.checks.createClientExecuted, "approved createClient item did not execute to a native client");

  const draftSeed = await request(`/api/content/jobs/${encodeURIComponent(`${runId}-job`)}/draft`, {
    method: "POST",
    body: {
      tenantId,
      job: {
        id: `${runId}-job`,
        tenantId,
        title: "Receipt leak detection closeout",
        clientName,
        city: "Fair Play",
        state: "SC",
        outcome: "Main drain cover documentation completed.",
        completedAt: new Date().toISOString(),
        lineItems: [{ name: "Leak detection", total: 595 }]
      },
      media: [
        {
          id: `${runId}-media`,
          type: "photo",
          caption: "Receipt-only pool equipment photo.",
          storageRef: `native://receipts/${runId}/photo.jpg`
        }
      ],
      requestedKinds: ["gbp_post", "article"],
      brandVoice: {
        businessName: "Aquatrace Swimming Pool Leak Detection",
        serviceArea: ["Fair Play", "Lake Hartwell"],
        tone: "plain and useful"
      }
    }
  });
  receipt.raw.draftSeed = redact(draftSeed);
  const pendingDrafts = draftSeed.drafts?.filter((draft) => draft.status === "approval_pending") ?? [];
  const approveDraft = pendingDrafts[0];
  const rejectDraft = pendingDrafts[1];
  receipt.checks.contentDraftsQueued = pendingDrafts.length >= 2 && pendingDrafts.every((draft) => draft.approvalId);
  assert(receipt.checks.contentDraftsQueued, "content seed did not create two approval-pending drafts");

  const queueTurn = await nexi(idToken, "show me the content queue", conversationId);
  receipt.raw.contentQueueTurn = redact({
    answer: queueTurn.answer,
    toolRuns: queueTurn.toolRuns,
    sources: queueTurn.sources
  });
  receipt.checks.contentQueueChatVisible = queueTurn.toolRuns?.some((run) =>
    run.name === "contentQueue"
    && Array.isArray(run.result?.drafts)
    && run.result.drafts.some((draft) => draft.id === approveDraft.id)
  );
  assert(receipt.checks.contentQueueChatVisible, "Nexi did not show the pending content queue");

  const approveTurn = await nexi(idToken, `approve content draft ${approveDraft.id}`, conversationId);
  receipt.raw.contentApproveTurn = redact({
    answer: approveTurn.answer,
    toolRuns: approveTurn.toolRuns,
    sources: approveTurn.sources
  });
  receipt.checks.contentApproveChatWorks = approveTurn.toolRuns?.some((run) =>
    run.name === "approve"
    && run.result?.draft?.id === approveDraft.id
    && run.result?.draft?.status === "publish_ready"
    && run.result?.publishingDeferred === true
  );
  assert(receipt.checks.contentApproveChatWorks, "Nexi did not approve the content draft through chat");

  const rejectRoute = await request(`/api/content/drafts/${encodeURIComponent(rejectDraft.id)}/reject`, {
    method: "POST",
    body: { tenantId }
  });
  receipt.raw.contentRejectRoute = redact(rejectRoute);
  receipt.checks.contentRejectRouteWorks = rejectRoute.draft?.id === rejectDraft.id
    && rejectRoute.draft?.status === "rejected"
    && rejectRoute.publishingDeferred === true;
  assert(receipt.checks.contentRejectRouteWorks, "content reject route did not mark the draft rejected");

  const finalQueue = await request(`/api/content/queue?tenantId=${encodeURIComponent(tenantId)}`);
  receipt.raw.finalContentQueue = redact(finalQueue);
  receipt.checks.contentQueueFinalStates = finalQueue.drafts?.some((draft) => draft.id === approveDraft.id && draft.status === "publish_ready")
    && finalQueue.drafts?.some((draft) => draft.id === rejectDraft.id && draft.status === "rejected");
  assert(receipt.checks.contentQueueFinalStates, "final content queue did not preserve approve/reject states");

  receipt.ok = true;
  receipt.finishedAt = new Date().toISOString();
  receipt.operator = {
    mode: proof.mode,
    email: proof.identity.email || null,
    uidPresent: Boolean(proof.identity.uid)
  };
  receipt.boundaries = {
    outboundExecuted: false,
    contentPublishingDeferred: true,
    clientWriteApprovalQueueExecutedOnlyAfterApproval: true
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
