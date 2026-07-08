import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createOperatorProofSession,
  fetchJson,
  resolveBaseUrl
} from "./support/liveProofHelpers.mjs";

const baseUrl = (process.env.NEXI_BASE_URL || resolveBaseUrl()).replace(/\/$/, "");
const expectedSha = process.env.EXPECTED_SHA || process.env.NEXTEAM_DEPLOY_SHA || "";
const tenantId = process.env.TENANT_ID || "aquatrace";
const receiptPath = process.env.M6_CAMPAIGNS_RECEIPT || "receipts/m6/campaigns-live-receipt-current.json";
const runId = `m6-live-${Date.now()}-${randomUUID().slice(0, 8)}`;

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

const receipt = {
  ok: false,
  receiptName: "m6-campaigns-live-receipt-current",
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
  proof = await createOperatorProofSession();
  const idToken = proof.idToken;

  const version = await request("/api/version");
  receipt.raw.version = version;
  receipt.checks.versionShaMatched = expectedSha ? version.sha === expectedSha : Boolean(version.sha);
  assert(receipt.checks.versionShaMatched, `version SHA mismatch: expected ${expectedSha}, got ${version.sha}`);

  const health = await request("/api/health");
  receipt.raw.health = health;
  receipt.checks.healthGreen = Boolean(health.ok && health.rails?.jobber?.ok && health.rails?.companycam?.ok && health.rails?.anthropic?.ok);
  assert(receipt.checks.healthGreen, "health was not green");

  const templateId = `${runId}-template`;
  const savedTemplate = await request("/api/campaigns/templates", {
    idToken,
    method: "POST",
    body: {
      id: templateId,
      tenantId,
      name: "M6 Live Receipt Template",
      description: "Receipt-only configurable campaign template.",
      audience: {
        tenantId,
        channel: "email",
        clientIds: ["contact_chris_owner"],
        consentRequired: true,
        excludeSuppressed: true
      },
      variables: [
        {
          key: "arrivalWindow",
          label: "Arrival window",
          required: true,
          defaultValue: "tomorrow"
        }
      ],
      sequence: [
        {
          id: "step_1_receipt",
          channel: "email",
          delayHours: 0,
          subject: "{{businessName}} receipt check for {{companyOrName}}",
          body: "Hi {{name}},\n\nThis is queued for {{arrivalWindow}}.\n\n{{unsubscribeLink}}",
          stopOnReply: true,
          stopOnUnsubscribe: true
        },
        {
          id: "step_2_receipt",
          channel: "email",
          delayHours: 72,
          subject: "Follow-up for {{companyOrName}}",
          body: "Hi {{name}},\n\nThis follow-up should be suppressed after unsubscribe.\n\n{{unsubscribeLink}}",
          stopOnReply: true,
          stopOnUnsubscribe: true
        }
      ],
      complianceNotes: ["Receipt template; outbound execution remains approval-gated."]
    }
  });
  receipt.raw.savedTemplate = redact(savedTemplate);
  receipt.checks.templateSaved = savedTemplate.ok === true && savedTemplate.template?.variables?.[0]?.key === "arrivalWindow";
  assert(receipt.checks.templateSaved, "template save did not return expected variable metadata");

  const templates = await request(`/api/campaigns/templates?tenantId=${encodeURIComponent(tenantId)}`, { idToken });
  receipt.raw.templates = redact(templates);
  receipt.checks.templateListed = templates.templates?.some((template) => template.id === templateId);
  assert(receipt.checks.templateListed, "saved template did not list");

  const audience = await request("/api/campaigns/audience/preview", {
    idToken,
    method: "POST",
    body: {
      tenantId,
      filter: {
        channel: "email",
        clientIds: ["contact_chris_owner", "contact_no_email_consent"],
        consentRequired: true,
        excludeSuppressed: true,
        maxResults: 5
      }
    }
  });
  receipt.raw.audience = redact(audience);
  receipt.checks.audienceConsentHonored = audience.selected?.length === 1
    && audience.excluded?.some((entry) => entry.contactId === "contact_no_email_consent" && entry.reason === "missing_email_consent");
  assert(receipt.checks.audienceConsentHonored, "audience preview did not prove consent exclusion");

  const run = await request("/api/campaigns/test-run", {
    idToken,
    method: "POST",
    body: {
      tenantId,
      templateId,
      variables: { arrivalWindow: "Thursday morning" },
      audience: {
        channel: "email",
        clientIds: ["contact_chris_owner"],
        consentRequired: true,
        excludeSuppressed: true
      }
    }
  });
  receipt.raw.run = redact(run);
  const firstApproval = run.queuedApprovals?.[0];
  receipt.checks.firstStepApprovalQueuedOnly = run.sendsAreApprovalQueuedOnly === true
    && run.boundary?.executionBlocked === true
    && firstApproval?.execute?.service === "campaigns"
    && firstApproval?.execute?.op === "bulkExecutionBlocked";
  receipt.checks.templateVariablesRendered = /Thursday morning/.test(firstApproval?.preview?.body || "");
  receipt.checks.unsubscribeAndAddressInjected = /Unsubscribe:/.test(firstApproval?.preview?.body || "")
    && /Mailing address:/.test(firstApproval?.preview?.body || "");
  assert(receipt.checks.firstStepApprovalQueuedOnly, "first campaign step was not parked as blocked ApprovalQueue work");
  assert(receipt.checks.templateVariablesRendered, "template variables did not render in approval preview");
  assert(receipt.checks.unsubscribeAndAddressInjected, "unsubscribe or mailing-address text missing from approval preview");

  const campaignId = run.campaign.id;
  const open = await request("/api/campaigns/track/open", {
    method: "POST",
    body: { tenantId, campaignId, contactId: "contact_chris_owner", stepId: "step_1_receipt" }
  });
  const click = await request("/api/campaigns/track/click", {
    method: "POST",
    body: {
      tenantId,
      campaignId,
      contactId: "contact_chris_owner",
      stepId: "step_1_receipt",
      url: "https://aquatraceleak.com/"
    }
  });
  const unsubscribe = await request("/api/campaigns/unsubscribe", {
    method: "POST",
    body: { tenantId, campaignId, contactId: "contact_chris_owner", channel: "email" }
  });
  receipt.raw.tracking = redact({ open, click, unsubscribe });
  receipt.checks.trackingRecorded = open.event?.type === "open" && click.event?.type === "click" && unsubscribe.tracking?.type === "unsubscribe";
  assert(receipt.checks.trackingRecorded, "open/click/unsubscribe tracking did not record");

  const second = await request(`/api/campaigns/${encodeURIComponent(campaignId)}/queue-step`, {
    idToken,
    method: "POST",
    body: { tenantId, stepId: "step_2_receipt" }
  });
  receipt.raw.secondStep = redact(second);
  receipt.checks.suppressionHonored = second.queuedApprovals?.length === 0
    && second.suppressed?.some((entry) => entry.contactId === "contact_chris_owner" && entry.reason === "suppressed");
  assert(receipt.checks.suppressionHonored, "second step was not suppressed after unsubscribe");

  const reportDelivery = await request("/api/campaigns/transactional/report-delivery", {
    idToken,
    method: "POST",
    body: {
      tenantId,
      to: "chris1bata@gmail.com",
      reportTitle: "M6 receipt report",
      reportRef: "reports/m6-receipt.pdf"
    }
  });
  const reviewRequest = await request("/api/campaigns/transactional/invoice-paid", {
    idToken,
    method: "POST",
    body: {
      tenantId,
      to: "chris1bata@gmail.com",
      invoiceId: "inv_m6_receipt",
      clientName: "Receipt Client"
    }
  });
  receipt.raw.transactional = redact({ reportDelivery, reviewRequest });
  receipt.checks.transactionalApprovalOnly = reportDelivery.sendsAreApprovalQueuedOnly === true
    && reviewRequest.sendsAreApprovalQueuedOnly === true
    && reviewRequest.delayHours === 48;
  assert(receipt.checks.transactionalApprovalOnly, "transactional messages were not approval-only");

  const stats = await request(`/api/campaigns/stats?tenantId=${encodeURIComponent(tenantId)}`, { idToken });
  receipt.raw.stats = redact(stats);
  receipt.checks.statsIncludeTracking = stats.stats?.totals?.open >= 1
    && stats.stats?.totals?.click >= 1
    && stats.stats?.totals?.unsubscribe >= 1
    && stats.stats?.totals?.suppressed >= 1;
  assert(receipt.checks.statsIncludeTracking, "stats did not include tracking totals");

  receipt.ok = true;
  receipt.finishedAt = new Date().toISOString();
  receipt.operator = {
    mode: proof.mode,
    email: proof.identity.email || null,
    uidPresent: Boolean(proof.identity.uid)
  };
  receipt.boundaries = {
    outboundExecuted: false,
    approvalQueueOnly: true,
    bulkListExecutionBlockedUntilDnsAndPhysicalAddress: true
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
