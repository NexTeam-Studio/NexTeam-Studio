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
const recipient = process.env.REPORT_EMAIL_RECIPIENT || "chris1bata@gmail.com";
const shouldExecute = process.env.REPORT_EMAIL_EXECUTE === "1";
const receiptPath = process.env.REPORT_EMAIL_ATTACHMENT_RECEIPT || "receipts/m6/report-email-attachment-live-receipt-current.json";
const runId = `report-email-attachment-${Date.now()}-${randomUUID().slice(0, 8)}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hash(value = "") {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function redactAttachment(attachment) {
  const contentBase64 = String(attachment?.contentBase64 ?? "");
  const bytes = contentBase64 ? Buffer.from(contentBase64, "base64") : Buffer.alloc(0);
  return {
    filename: attachment?.filename ?? null,
    mime: attachment?.mime ?? null,
    byteSize: bytes.byteLength,
    startsWithPdfMagic: bytes.subarray(0, 5).toString("utf8") === "%PDF-",
    contentBase64Sha256_16: hash(contentBase64),
    contentBase64Redacted: true
  };
}

function redactApproval(item) {
  const outbound = item?.execute?.args?.outbound ?? {};
  const attachments = Array.isArray(outbound.attachments) ? outbound.attachments.map(redactAttachment) : [];
  return {
    id: item?.id ?? null,
    tenantId: item?.tenantId ?? null,
    kind: item?.kind ?? null,
    status: item?.status ?? null,
    createdBy: item?.createdBy ?? null,
    preview: item?.preview ?? null,
    execute: {
      service: item?.execute?.service ?? null,
      op: item?.execute?.op ?? null,
      mailbox: item?.execute?.args?.mailbox ?? null,
      outbound: {
        tenantId: outbound.tenantId ?? null,
        mailbox: outbound.mailbox ?? null,
        to: outbound.to ?? [],
        subject: outbound.subject ?? null,
        bodyTextSha256_16: hash(outbound.bodyText ?? ""),
        bodyTextCharCount: String(outbound.bodyText ?? "").length,
        bodyHtmlSha256_16: hash(outbound.bodyHtml ?? ""),
        bodyHtmlCharCount: String(outbound.bodyHtml ?? "").length,
        attachments
      }
    }
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
  receiptName: "report-email-attachment-live-receipt-current",
  startedAt: new Date().toISOString(),
  stagingBaseUrl: baseUrl,
  expectedSha,
  tenantId,
  recipient,
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

  const conversationId = `${runId}-owner-report-email`;
  const prompt = `email the Deborah Justice report PDF to ${recipient}`;
  const turn = await nexi(idToken, prompt, conversationId);
  const reportRun = turn.toolRuns?.find((run) => run.name === "draftReportEmail");
  const approvalId = reportRun?.result?.approval?.id;
  receipt.raw.turn = {
    prompt,
    answer: turn.answer,
    toolRuns: (turn.toolRuns ?? []).map((run) => ({
      name: run.name,
      sources: run.sources ?? [],
      result: run.name === "draftReportEmail"
        ? {
            approval: run.result?.approval ?? null,
            attachment: run.result?.attachment ?? null,
            sendsAreApprovalQueuedOnly: run.result?.sendsAreApprovalQueuedOnly ?? null
          }
        : run.result
    })),
    sources: turn.sources ?? []
  };
  receipt.checks.routedToDraftReportEmail = Boolean(reportRun && approvalId);
  assert(receipt.checks.routedToDraftReportEmail, "Nexi did not route the report email prompt to draftReportEmail");
  receipt.checks.answerSaysNotSent = /not been sent/i.test(turn.answer ?? "");
  assert(receipt.checks.answerSaysNotSent, "Nexi did not clearly state the draft was not sent yet");

  const pending = await request(`/api/approval-queue?tenantId=${encodeURIComponent(tenantId)}`);
  const approval = pending.items?.find((item) => item.id === approvalId);
  receipt.raw.pendingApproval = redactApproval(approval);
  const attachment = approval?.execute?.args?.outbound?.attachments?.[0];
  const redactedAttachment = redactAttachment(attachment);
  receipt.checks.approvalQueued = approval?.id === approvalId && approval?.status === "pending";
  receipt.checks.attachmentPresent = redactedAttachment.filename === "deborah-justice-aquatrace-report.pdf";
  receipt.checks.attachmentIsPdf = redactedAttachment.mime === "application/pdf" && redactedAttachment.startsWithPdfMagic;
  receipt.checks.attachmentContentRedacted = redactedAttachment.contentBase64Redacted === true && !JSON.stringify(receipt.raw.pendingApproval).includes(String(attachment?.contentBase64 ?? "___never___"));
  assert(receipt.checks.approvalQueued, "ApprovalQueue item was not pending");
  assert(receipt.checks.attachmentPresent, "Deborah Justice PDF attachment was not present");
  assert(receipt.checks.attachmentIsPdf, "Attached file was not a decodable PDF");
  assert(receipt.checks.attachmentContentRedacted, "Receipt did not redact attachment content");

  if (shouldExecute) {
    const approved = await request(`/api/approval-queue/${encodeURIComponent(approvalId)}/approve`, { method: "POST" });
    const executed = await request(`/api/approval-queue/${encodeURIComponent(approvalId)}/execute`, { method: "POST" });
    receipt.raw.approvalExecution = {
      approved: {
        ok: approved.ok,
        item: redactApproval(approved.item)
      },
      executed: {
        ok: executed.ok,
        item: redactApproval(executed.item),
        result: executed.result ?? null
      }
    };
    receipt.checks.executedThroughApprovalQueue = executed.ok === true && executed.item?.status === "executed";
    receipt.checks.providerAcceptedMessage = typeof executed.result?.id === "string" && executed.result.id.length > 0;
    assert(receipt.checks.executedThroughApprovalQueue, "ApprovalQueue execution did not complete");
    assert(receipt.checks.providerAcceptedMessage, "Gmail did not return a sent message id");
  } else {
    receipt.raw.approvalExecution = {
      skipped: true,
      reason: "REPORT_EMAIL_EXECUTE was not set to 1; outbound remains parked in ApprovalQueue."
    };
    receipt.checks.executedThroughApprovalQueue = false;
    receipt.checks.providerAcceptedMessage = false;
  }

  receipt.ok = true;
  receipt.finishedAt = new Date().toISOString();
  receipt.operator = {
    mode: proof.mode,
    emailPresent: Boolean(proof.identity.email),
    uidPresent: Boolean(proof.identity.uid)
  };
  receipt.boundaries = {
    directSendBypassed: false,
    approvalQueueOnly: true,
    outboundExecuted: shouldExecute
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
    approvalId: receipt.raw.pendingApproval?.id,
    outboundExecuted: receipt.boundaries?.outboundExecuted ?? false,
    error: receipt.error
  }, null, 2));
}
