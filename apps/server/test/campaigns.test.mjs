import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository
} from "@nexteam/core";
import { assertAccessRole } from "../dist/auth/accessContext.js";
import { selectAudience } from "../dist/campaigns/audience.js";
import { complianceConfigFromEnv, outboundBoundary } from "../dist/campaigns/compliance.js";
import { createCampaignNexiTools } from "../dist/campaigns/nexiTools.js";
import { InMemoryCampaignRepository } from "../dist/campaigns/repository.js";
import { registerCampaignRoutes } from "../dist/campaigns/routes.js";
import { CampaignService } from "../dist/campaigns/service.js";
import { planSequenceSends, sequenceStateAfter } from "../dist/campaigns/sequenceEngine.js";

function tenant() {
  return {
    id: "aquatrace",
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "companycam", email: "gmail_relay", sms: "twilio" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

function campaignService(env = {}) {
  const repository = new InMemoryCampaignRepository("aquatrace");
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  return { repository, approvalQueue, service: new CampaignService({ repository, approvalQueue, env }) };
}

test("audience builder honors consent and suppression", async () => {
  const { repository } = campaignService();
  await repository.saveSuppression({
    id: "supp_chris",
    tenantId: "aquatrace",
    contactId: "contact_chris_owner",
    channel: "email",
    reason: "manual",
    createdAt: "2026-07-07T12:00:00.000Z",
    source: "test"
  });

  const audience = await selectAudience({
    repository,
    tenantId: "aquatrace",
    filter: {
      tenantId: "aquatrace",
      channel: "email",
      tagsAny: ["vgb"],
      consentRequired: true,
      excludeSuppressed: true,
      maxResults: 100
    }
  });

  assert.deepEqual(audience.contacts.map((contact) => contact.id), ["contact_nexi_sender"]);
  assert.equal(audience.excluded.some((entry) => entry.contactId === "contact_chris_owner" && entry.reason === "suppressed"), true);
  assert.equal(audience.excluded.some((entry) => entry.contactId === "contact_no_email_consent" && entry.reason === "missing_email_consent"), true);
});

test("XState sequence plans delayed sends and reaches approvalQueued", () => {
  const contacts = [{ id: "contact_1" }, { id: "contact_2" }];
  const planned = planSequenceSends({
    campaignId: "camp_1",
    now: "2026-07-07T12:00:00.000Z",
    contacts,
    sequence: [
      { id: "step_1_intro", channel: "email", delayHours: 0, body: "One" },
      { id: "step_2_followup", channel: "email", delayHours: 72, body: "Two" }
    ]
  });

  assert.equal(planned.length, 4);
  assert.equal(planned.find((row) => row.stepId === "step_2_followup").sendAt, "2026-07-10T12:00:00.000Z");
  assert.equal(sequenceStateAfter(["PLAN", "QUEUE"]), "approvalQueued");
});

test("campaign queueing parks approvals only and marks DNS boundary blocked", async () => {
  const { repository, approvalQueue, service } = campaignService({
    M6_SPF_CONFIRMED: "false",
    M6_DKIM_CONFIRMED: "false",
    M6_DMARC_CONFIRMED: "false"
  });
  const result = await service.queueTemplateCampaign(tenant(), {
    templateId: "vgb-hotel-gm-outreach",
    audience: {
      channel: "email",
      tagsAny: ["test"],
      consentRequired: true,
      excludeSuppressed: true,
      maxResults: 2
    }
  });

  assert.equal(result.boundary.executionBlocked, true);
  assert.equal(result.machineState, "approvalQueued");
  assert.equal(result.queuedApprovals.length, 2);
  assert.match(result.queuedApprovals[0].preview.body, /unsubscribe/i);
  assert.equal(result.queuedApprovals.every((item) => item.createdBy === "user"), true);
  assert.equal(result.queuedApprovals.every((item) => item.execute.args.actorId === "unknown-actor"), true);
  assert.equal(result.queuedApprovals.every((item) => item.execute.service === "campaigns"), true);
  assert.equal(result.queuedApprovals.every((item) => item.execute.op === "bulkExecutionBlocked"), true);

  const pending = await approvalQueue.listPending("aquatrace");
  assert.equal(pending.length, 2);
  const tracking = await repository.listTracking("aquatrace", result.campaign.id);
  assert.equal(tracking.filter((event) => event.type === "queued").length, 2);
});

test("open, click, unsubscribe, and second-step suppression are recorded", async () => {
  const { repository, service } = campaignService();
  const first = await service.queueTemplateCampaign(tenant(), {
    audience: {
      channel: "email",
      clientIds: ["contact_chris_owner"],
      consentRequired: true,
      excludeSuppressed: true
    }
  });

  await service.recordOpenOrClick(tenant(), {
    campaignId: first.campaign.id,
    contactId: "contact_chris_owner",
    channel: "email",
    type: "open",
    stepId: "step_1_intro"
  });
  await service.recordOpenOrClick(tenant(), {
    campaignId: first.campaign.id,
    contactId: "contact_chris_owner",
    channel: "email",
    type: "click",
    stepId: "step_1_intro",
    url: "https://aquatraceleak.com/vgb"
  });
  await service.unsubscribe(tenant(), {
    campaignId: first.campaign.id,
    contactId: "contact_chris_owner",
    channel: "email",
    reason: "unsubscribed"
  });
  const second = await service.queueStep(tenant(), first.campaign.id, "step_2_followup");

  assert.equal(second.queuedApprovals.length, 0);
  assert.deepEqual(second.suppressed, [{ contactId: "contact_chris_owner", stepId: "step_2_followup", reason: "suppressed" }]);
  const stats = await service.stats(tenant());
  assert.equal(stats.totals.open, 1);
  assert.equal(stats.totals.click, 1);
  assert.equal(stats.totals.unsubscribe, 1);
  assert.equal(stats.totals.suppressed, 1);
  assert.equal((await repository.listSuppressions("aquatrace")).length, 1);
});

test("transactional report and review emails are approval queued, including 48-hour review delay", async () => {
  const { approvalQueue, service } = campaignService();
  const report = await service.queueTransactionalReportDelivery(tenant(), {
    to: "chris1bata@gmail.com",
    reportTitle: "Leak report",
    reportRef: "reports/report_1.pdf"
  });
  const review = await service.queueInvoicePaidReviewRequest(tenant(), {
    to: "chris1bata@gmail.com",
    invoiceId: "inv_123",
    clientName: "Sample Client"
  });

  assert.equal(report.execute.service, "campaigns");
  assert.equal(report.execute.op, "transactionalApprovalRequired");
  assert.equal(report.createdBy, "user");
  assert.equal(report.execute.args.actorId, "unknown-actor");
  assert.equal(review.execute.op, "transactionalApprovalRequiredAfterDelay");
  assert.equal(review.createdBy, "user");
  assert.equal(review.execute.args.actorId, "unknown-actor");
  assert.equal(review.execute.args.delayHours, 48);

  const pending = await approvalQueue.listPending("aquatrace");
  assert.deepEqual(pending.map((item) => item.id), [report.id, review.id]);
});

test("campaign Nexi tools expose approval-gated campaign operations", async () => {
  const { repository, approvalQueue } = campaignService();
  const tools = createCampaignNexiTools({ repository, approvalQueue, actorId: "internal:owner-1" });
  const audiencePreview = tools.find((tool) => tool.name === "audiencePreview");
  const draftCampaign = tools.find((tool) => tool.name === "draftCampaign");
  const campaignQueue = tools.find((tool) => tool.name === "campaignQueue");
  const suppressCampaignContact = tools.find((tool) => tool.name === "suppressCampaignContact");

  const preview = await audiencePreview.handler(tenant(), { channel: "email", tagsAny: ["test"] });
  assert.equal(preview.result.selected.length, 2);
  assert.equal(preview.result.sendsBlockedUntilDnsConfirmed, true);

  const draft = await draftCampaign.handler(tenant(), {
    audience: { channel: "email", clientIds: ["contact_chris_owner"] }
  });
  assert.equal(draft.result.queuedApprovals.length, 1);
  assert.equal(draft.result.queuedApprovals[0].createdBy, "user");
  assert.equal(draft.result.queuedApprovals[0].execute.args.actorId, "internal:owner-1");
  assert.equal(draft.result.sendsAreApprovalQueuedOnly, true);
  assert.equal(draft.sources.every((source) => source.rail === "native"), true);

  const suppression = await suppressCampaignContact.handler(tenant(), {
    campaignId: draft.result.campaign.id,
    contactId: "contact_chris_owner",
    channel: "email"
  });
  assert.equal(suppression.result.tracking.type, "unsubscribe");

  const queue = await campaignQueue.handler(tenant(), {});
  assert.equal(queue.result.campaigns.length, 1);
  assert.equal(queue.result.totals.unsubscribe, 1);
});

test("campaign routes expose template, test-run, tracking, unsubscribe, and stats", async () => {
  const { repository, approvalQueue } = campaignService();
  const app = express();
  app.use(express.json());
  registerCampaignRoutes(app, { repository, approvalQueue, env: { TENANT_ID: "aquatrace" } });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const templates = await fetch(`${base}/api/campaigns/templates`).then((response) => response.json());
    assert.equal(templates.ok, true);
    assert.equal(templates.templates[0].id, "vgb-hotel-gm-outreach");

    const run = await fetch(`${base}/api/campaigns/test-run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        audience: {
          channel: "email",
          clientIds: ["contact_chris_owner"],
          consentRequired: true,
          excludeSuppressed: true
        }
      })
    }).then((response) => response.json());
    assert.equal(run.ok, true);
    assert.equal(run.sendsAreApprovalQueuedOnly, true);
    assert.equal(run.queuedApprovals.length, 1);
    assert.equal(run.queuedApprovals[0].createdBy, "user");
    assert.equal(run.queuedApprovals[0].execute.args.actorId, "internal:local-owner");

    const campaignId = run.campaign.id;
    const opened = await fetch(`${base}/api/campaigns/track/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId, contactId: "contact_chris_owner", stepId: "step_1_intro" })
    }).then((response) => response.json());
    assert.equal(opened.ok, true);
    assert.equal(opened.event.type, "open");

    const unsubscribed = await fetch(`${base}/api/campaigns/unsubscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId, contactId: "contact_chris_owner", channel: "email" })
    }).then((response) => response.json());
    assert.equal(unsubscribed.ok, true);

    const second = await fetch(`${base}/api/campaigns/${campaignId}/queue-step`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepId: "step_2_followup" })
    }).then((response) => response.json());
    assert.equal(second.ok, true);
    assert.equal(second.suppressed.length, 1);
    assert.equal(second.queuedApprovals.length, 0);

    const stats = await fetch(`${base}/api/campaigns/stats`).then((response) => response.json());
    assert.equal(stats.ok, true);
    assert.equal(stats.stats.totals.open, 1);
    assert.equal(stats.stats.totals.unsubscribe, 1);
    assert.equal(stats.stats.totals.suppressed, 1);
  } finally {
    server.close();
  }
});

test("campaign AccessContext gate blocks technician and job-link contexts", () => {
  assert.equal(assertAccessRole({
    tenantId: "aquatrace",
    tenantUserId: "owner_1",
    role: "OWNER",
    accessKind: "internal"
  }, ["OWNER", "OFFICE_ADMIN"]).tenantUserId, "owner_1");

  assert.throws(() => assertAccessRole({
    tenantId: "aquatrace",
    tenantUserId: "tech_1",
    role: "TECHNICIAN",
    accessKind: "internal"
  }, ["OWNER", "OFFICE_ADMIN"]), /role cannot perform/);

  assert.throws(() => assertAccessRole({
    tenantId: "aquatrace",
    tenantUserId: "subcontractor-link",
    role: "TECHNICIAN",
    accessKind: "job_link"
  }, ["OWNER", "OFFICE_ADMIN"]), /role cannot perform/);
});

test("DNS boundary stays blocked until SPF, DKIM, and DMARC are confirmed", () => {
  assert.equal(outboundBoundary(complianceConfigFromEnv({}), "email").executionBlocked, true);
  assert.equal(outboundBoundary(complianceConfigFromEnv({
    M6_SPF_CONFIRMED: "true",
    M6_DKIM_CONFIRMED: "true",
    M6_DMARC_CONFIRMED: "true"
  }), "email").executionBlocked, false);
});
