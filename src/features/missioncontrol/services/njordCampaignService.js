/**
 * Njord Campaign Service — Buncombe-Style Workflow Scaffold
 *
 * Manages campaign workflow state for Aquatrace case-study outreach.
 * Inspired by the Buncombe County hotel contact list project structure:
 * a targeted list-based outreach campaign with test-email-first gating.
 *
 * HARD RULES (enforced in code, not just docs):
 *   1. In case-study mode, full-list sends are ALWAYS sandbox/log-only.
 *   2. A test email MUST be confirmed by the operator before any campaign
 *      can advance past the "test-sent" stage.
 *   3. Every action that could send to real recipients requires TWO explicit
 *      operator confirmations before proceeding.
 *
 * Firestore path: njordCampaignLogs/{campaignId}
 */

import { db } from "../../../firebase.js";
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc,
  getDoc,
} from "firebase/firestore";
import { NJORD_CONFIG, isCaseStudyMode } from "../config/njordConfig.js";

/**
 * Campaign lifecycle stages:
 *   draft → test-pending → test-sent → test-confirmed → approved → sending → complete
 *
 * In case-study mode, the stage never advances past "test-confirmed" for
 * real sends — everything is sandboxed/logged.
 */
export const CAMPAIGN_STAGES = {
  DRAFT: "draft",
  TEST_PENDING: "test-pending",
  TEST_SENT: "test-sent",
  TEST_CONFIRMED: "test-confirmed",
  APPROVED: "approved",       // requires 2 confirmations
  SENDING: "sending",         // sandbox only in case-study mode
  COMPLETE: "complete",
};

/**
 * Creates a new campaign record in Firestore.
 *
 * @param {Object} params
 * @param {string} params.campaignId    - Unique campaign slug
 * @param {string} params.name          - Campaign display name
 * @param {string} params.subject       - Email subject line
 * @param {string} params.bodyPreview   - First 200 chars of email body
 * @param {string[]} params.recipientList - Array of email addresses (full list)
 * @param {string} params.createdBy     - Operator user id or label
 * @returns {Promise<void>}
 */
export async function createCampaign({ campaignId, name, subject, bodyPreview, recipientList, createdBy }) {
  const ref = doc(db, NJORD_CONFIG.campaignLogCollection, campaignId);
  await setDoc(ref, {
    campaignId,
    tenantId: NJORD_CONFIG.tenantId,
    name,
    subject,
    bodyPreview: bodyPreview?.slice(0, 200) || "",
    recipientCount: Array.isArray(recipientList) ? recipientList.length : 0,
    // Never store full list in plaintext — store count + hash stub only
    recipientListHash: `sha256-stub-${campaignId}`,
    stage: CAMPAIGN_STAGES.DRAFT,
    caseStudyMode: isCaseStudyMode(),
    testEmailAddress: NJORD_CONFIG.testEmailAddress,
    testEmailSent: false,
    testEmailConfirmed: false,
    approvalCount: 0,
    createdBy: createdBy || "system",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  console.log(`[njordCampaign] ✅ campaign created — ${campaignId}`);
}

/**
 * Sends a real test/review email via the server-side Resend proxy.
 * Only delivers to the configured VITE_NJORD_TEST_EMAIL address.
 * The server endpoint enforces this restriction independently.
 *
 * @param {string} campaignId
 * @param {string} operatorId
 * @param {Object} [emailContent] - Optional override for subject/html
 * @param {string} [emailContent.subject]
 * @param {string} [emailContent.html]
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function sendTestEmail(campaignId, operatorId, emailContent = {}) {
  const ref = doc(db, NJORD_CONFIG.campaignLogCollection, campaignId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { ok: false, message: "Campaign not found." };
  }

  const data = snap.data();
  const toAddress = NJORD_CONFIG.testEmailAddress;

  if (!toAddress) {
    return {
      ok: false,
      message: "No test email address configured. Set VITE_NJORD_TEST_EMAIL in Railway env vars.",
    };
  }

  const subject = emailContent.subject || data.subject || `Campaign Review: ${data.name || campaignId}`;
  const html = emailContent.html || buildDefaultTestEmailHtml(data);

  let resendId = null;
  let deliveryNote = "";

  try {
    const resp = await fetch("/api/njord/send-test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, subject, html, toAddress }),
    });
    const result = await resp.json();

    if (!resp.ok || !result.ok) {
      const errMsg = result.error || `HTTP ${resp.status}`;
      console.error(`[njordCampaign] ❌ test email delivery failed — ${errMsg}`);
      return { ok: false, message: `Test email failed: ${errMsg}` };
    }

    resendId = result.resendId;
    deliveryNote = `Delivered via Resend. ID: ${resendId}`;
    console.log(`[njordCampaign] 📧 test email sent — ${campaignId} → ${toAddress} resendId: ${resendId}`);
  } catch (err) {
    console.error(`[njordCampaign] ❌ test email fetch error — ${err.message}`);
    return { ok: false, message: `Test email request error: ${err.message}` };
  }

  // Log the send event to Firestore
  await addDoc(collection(db, NJORD_CONFIG.campaignLogCollection, campaignId, "events"), {
    type: "test-send",
    operatorId,
    toAddress,
    resendId,
    sandbox: false,
    timestamp: serverTimestamp(),
    note: deliveryNote,
  });

  await updateDoc(ref, {
    stage: CAMPAIGN_STAGES.TEST_SENT,
    testEmailSent: true,
    updatedAt: serverTimestamp(),
  });

  return {
    ok: true,
    message: `Test email sent to ${toAddress}. ${deliveryNote} — review it, then call confirmTestEmail() to advance the campaign.`,
  };
}

/**
 * Builds a default HTML body for the test review email.
 * @param {Object} campaignData - Firestore campaign doc data
 * @returns {string}
 */
function buildDefaultTestEmailHtml(campaignData) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: system-ui, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
  .wrap { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px;
          border: 1px solid #e2e8f0; overflow: hidden; }
  .header { background: #0EA5E9; color: #fff; padding: 24px 28px; }
  .header h1 { margin: 0; font-size: 20px; }
  .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
  .body { padding: 28px; color: #1e293b; line-height: 1.6; }
  .meta { background: #f1f5f9; border-radius: 8px; padding: 14px 18px;
          font-size: 13px; color: #475569; margin-bottom: 20px; }
  .meta strong { color: #0f172a; }
  .footer { padding: 16px 28px; font-size: 11px; color: #94a3b8;
            border-top: 1px solid #e2e8f0; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>📧 Njord Test Review</h1>
    <p>Aquatrace Case Study · NexTeam-Studio Mission Control</p>
  </div>
  <div class="body">
    <div class="meta">
      <strong>Campaign:</strong> ${campaignData.name || campaignData.campaignId}<br>
      <strong>Subject:</strong> ${campaignData.subject || "(none set)"}<br>
      <strong>Recipients (full list):</strong> ${campaignData.recipientCount ?? 0} contacts<br>
      <strong>Mode:</strong> ${campaignData.caseStudyMode ? "Case-study sandbox" : "Live"}
    </div>
    <p>This is the <strong>test review copy</strong> of the campaign above.
    Review the subject line, sender identity, and content before confirming.</p>
    <p><em>Preview body:</em></p>
    <blockquote style="border-left:3px solid #0EA5E9;margin:0;padding:10px 16px;color:#334155;background:#f0f9ff;border-radius:4px">
      ${campaignData.bodyPreview || "(no preview available — add bodyPreview when creating the campaign)"}
    </blockquote>
    <p style="margin-top:20px;font-size:13px;color:#64748b">
      To confirm this test and advance the campaign, call
      <code>confirmTestEmail()</code> in Mission Control.
      Full-list send remains sandbox-only until explicitly enabled.
    </p>
  </div>
  <div class="footer">
    Sent by Njord · NexTeam-Studio case-study environment ·
    Full-list sending is ${campaignData.caseStudyMode ? "DISABLED (sandbox mode)" : "enabled"}
  </div>
</div>
</body></html>
`.trim();
}

/**
 * Operator confirms the test email looked correct.
 * Required before the campaign can request approval.
 *
 * @param {string} campaignId
 * @param {string} operatorId
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function confirmTestEmail(campaignId, operatorId) {
  const ref = doc(db, NJORD_CONFIG.campaignLogCollection, campaignId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, message: "Campaign not found." };

  const data = snap.data();
  if (!data.testEmailSent) {
    return { ok: false, message: "Test email has not been sent yet. Call sendTestEmail first." };
  }

  await addDoc(collection(db, NJORD_CONFIG.campaignLogCollection, campaignId, "events"), {
    type: "test-confirm",
    operatorId,
    timestamp: serverTimestamp(),
  });

  await updateDoc(ref, {
    stage: CAMPAIGN_STAGES.TEST_CONFIRMED,
    testEmailConfirmed: true,
    updatedAt: serverTimestamp(),
  });

  console.log(`[njordCampaign] ✅ test email confirmed — ${campaignId}`);
  return {
    ok: true,
    message: "Test email confirmed. Campaign can now request the two-step approval to send.",
  };
}

/**
 * Two-confirmation approval flow.
 * Call this twice (with different operatorIds) to fully approve a campaign.
 * In case-study mode, the "send" is always a sandbox log — never a real delivery.
 *
 * @param {string} campaignId
 * @param {string} operatorId   - The operator providing this confirmation
 * @param {number} confirmationNumber - 1 or 2
 * @returns {Promise<{ok: boolean, message: string, stage: string}>}
 */
export async function approveCampaign(campaignId, operatorId, confirmationNumber) {
  const ref = doc(db, NJORD_CONFIG.campaignLogCollection, campaignId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, message: "Campaign not found.", stage: null };

  const data = snap.data();

  if (!data.testEmailConfirmed) {
    return {
      ok: false,
      message: "Test email must be confirmed before approving a campaign send.",
      stage: data.stage,
    };
  }

  const currentApprovals = data.approvalCount || 0;
  const expectedNext = currentApprovals + 1;

  if (confirmationNumber !== expectedNext) {
    return {
      ok: false,
      message: `Expected confirmation #${expectedNext}, received #${confirmationNumber}.`,
      stage: data.stage,
    };
  }

  await addDoc(collection(db, NJORD_CONFIG.campaignLogCollection, campaignId, "events"), {
    type: "approval",
    confirmationNumber,
    operatorId,
    timestamp: serverTimestamp(),
  });

  const newApprovalCount = currentApprovals + 1;
  let newStage = data.stage;
  let message = "";

  if (newApprovalCount === 1) {
    newStage = CAMPAIGN_STAGES.TEST_CONFIRMED; // still waiting for second
    message = "First confirmation received. One more confirmation required before send.";
  } else if (newApprovalCount >= 2) {
    newStage = CAMPAIGN_STAGES.APPROVED;
    message = isCaseStudyMode()
      ? "Two confirmations received. Campaign APPROVED. NOTE: In case-study mode, full-list send is sandbox/log-only — no real emails will be delivered."
      : "Two confirmations received. Campaign approved for full send.";
  }

  await updateDoc(ref, {
    stage: newStage,
    approvalCount: newApprovalCount,
    updatedAt: serverTimestamp(),
  });

  return { ok: true, message, stage: newStage };
}

/**
 * Executes the campaign send — ALWAYS sandbox/log-only in case-study mode.
 * In case-study mode, this writes a log entry and returns a sandbox receipt.
 * It does NOT deliver email to the full list.
 *
 * @param {string} campaignId
 * @param {string} operatorId
 * @returns {Promise<{ok: boolean, message: string, sandboxed: boolean}>}
 */
export async function executeCampaignSend(campaignId, operatorId) {
  const ref = doc(db, NJORD_CONFIG.campaignLogCollection, campaignId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, message: "Campaign not found.", sandboxed: true };

  const data = snap.data();
  if (data.stage !== CAMPAIGN_STAGES.APPROVED) {
    return {
      ok: false,
      message: `Campaign is not approved. Current stage: ${data.stage}`,
      sandboxed: true,
    };
  }

  if (isCaseStudyMode() || !NJORD_CONFIG.fullListSendEnabled) {
    // SANDBOX — log only, never deliver
    await addDoc(collection(db, NJORD_CONFIG.campaignLogCollection, campaignId, "events"), {
      type: "send-sandboxed",
      operatorId,
      recipientCount: data.recipientCount,
      sandbox: true,
      timestamp: serverTimestamp(),
      note: "Case-study mode: full-list send is ALWAYS sandbox. No emails delivered.",
    });

    await updateDoc(ref, {
      stage: CAMPAIGN_STAGES.COMPLETE,
      sandboxed: true,
      updatedAt: serverTimestamp(),
    });

    console.log(`[njordCampaign] 🔒 SANDBOX send logged — ${campaignId} (${data.recipientCount} recipients, NOT delivered)`);
    return {
      ok: true,
      message: `Campaign send logged in sandbox mode. ${data.recipientCount} recipients would have received email. No actual delivery occurred (case-study mode).`,
      sandboxed: true,
    };
  }

  // Real send path — not reached in case-study mode
  // Wire your email delivery service here (SendGrid, Resend, Postmark, etc.)
  return {
    ok: false,
    message: "Real send path not implemented. Wire a delivery service and disable case-study mode.",
    sandboxed: false,
  };
}
