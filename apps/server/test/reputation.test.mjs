import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository,
  InMemoryEventBus
} from "@nexteam/core";
import { createReputationNexiTools } from "../dist/reputation/nexiTools.js";
import { InMemoryReputationRepository } from "../dist/reputation/repository.js";
import { registerReputationRoutes } from "../dist/reputation/routes.js";
import { ReputationService } from "../dist/reputation/service.js";

function tenant() {
  return {
    id: "aquatrace",
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "companycam", email: "gmail_relay" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

function reviewProvider() {
  return {
    async pollReviews() {
      return {
        configured: true,
        provider: "gbp-fixture",
        reviews: [{
          id: "gbp_live_1",
          locationId: "aquatrace-primary",
          authorName: "Rachel Payne",
          rating: 5,
          comment: "Chris found the pool leak and explained the repair clearly.",
          reviewedAt: "2026-07-08T14:00:00.000Z",
          externalIds: { gbp: "accounts/123/locations/456/reviews/gbp_live_1" }
        }]
      };
    }
  };
}

function blockerProvider() {
  return {
    async pollReviews() {
      return {
        configured: false,
        provider: "not-configured",
        blocker: "GBP OAuth credentials and location identifiers are not configured in staging.",
        reviews: []
      };
    }
  };
}

async function withServer(app, run) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.notEqual(typeof address, "string");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("M7 imports GBP reviews, emits review.received, and drafts approval-only replies", async () => {
  const repository = new InMemoryReputationRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const eventBus = new InMemoryEventBus();
  const service = new ReputationService({
    repository,
    approvalQueue,
    eventBus,
    gbpProvider: reviewProvider()
  });

  const polled = await service.pollGbpReviews(tenant());
  assert.equal(polled.configured, true);
  assert.equal(polled.imported.length, 1);
  assert.equal(polled.imported[0].provider, "gbp");
  assert.equal(eventBus.listEvents()[0].type, "review.received");

  const reply = await service.draftReviewReply(tenant(), polled.imported[0].id, "internal:owner_chris");
  assert.equal(reply.review.replyStatus, "drafted");
  assert.equal(reply.publishingDeferred, true);
  assert.equal(reply.approval.kind, "review_reply");
  assert.equal(reply.approval.createdBy, "user");
  assert.equal(reply.approval.execute.service, "reputation");
  assert.equal(reply.approval.execute.op, "publishGbpReviewReply");
  assert.equal(reply.approval.execute.args.actorId, "internal:owner_chris");
  assert.equal(reply.approval.execute.args.publishingDeferredUntilGbpCredentials, true);

  const pending = await approvalQueue.listPending("aquatrace");
  assert.deepEqual(pending.map((item) => item.kind), ["review_reply"]);
});

test("M7 review requests and GBP profile updates park in ApprovalQueue only", async () => {
  const repository = new InMemoryReputationRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const service = new ReputationService({
    repository,
    approvalQueue,
    gbpProvider: blockerProvider()
  });

  const request = await service.queueReviewRequest(tenant(), {
    to: "client@example.test",
    invoiceId: "inv_paid_123",
    clientName: "Rachel Payne"
  }, "internal:owner_chris");
  assert.equal(request.kind, "email");
  assert.equal(request.execute.service, "campaigns");
  assert.equal(request.execute.op, "transactionalApprovalRequiredAfterDelay");
  assert.equal(request.execute.args.delayHours, 48);

  const profile = await service.draftProfileSync(tenant(), {
    locationId: "aquatrace-primary",
    hours: { monday: "8:00 AM-5:00 PM" },
    services: ["Pool leak detection"],
    qas: [{ question: "Do you service commercial pools?", answer: "Yes, Aquatrace services residential and commercial pools." }]
  }, "internal:owner_chris");
  assert.equal(profile.profile.status, "approval_pending");
  assert.equal(profile.approval.kind, "gbp_profile_update");
  assert.equal(profile.approval.execute.service, "reputation");
  assert.equal(profile.approval.execute.args.publishingDeferredUntilGbpCredentials, true);

  const pending = await approvalQueue.listPending("aquatrace");
  assert.deepEqual(pending.map((item) => item.kind), ["email", "gbp_profile_update"]);
});

test("M7 routes expose review queue, draft reply, profile sync, and public widget", async () => {
  const app = express();
  app.use(express.json());
  const repository = new InMemoryReputationRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const eventBus = new InMemoryEventBus();
  registerReputationRoutes(app, {
    repository,
    approvalQueue,
    eventBus,
    gbpProvider: reviewProvider(),
    env: {
      TENANT_ID: "aquatrace",
      NEXI_FIREBASE_AUTH_REQUIRED: "false"
    }
  });

  await withServer(app, async (baseUrl) => {
    const poll = await fetch(`${baseUrl}/api/reputation/gbp/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    }).then((response) => response.json());
    assert.equal(poll.ok, true);
    assert.equal(poll.imported.length, 1);

    const queue = await fetch(`${baseUrl}/api/reputation/queue?tenantId=aquatrace`).then((response) => response.json());
    assert.equal(queue.ok, true);
    assert.equal(queue.reviews.length, 1);

    const reply = await fetch(`${baseUrl}/api/reputation/reviews/${queue.reviews[0].id}/reply/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    }).then((response) => response.json());
    assert.equal(reply.ok, true);
    assert.equal(reply.approval.kind, "review_reply");

    const profile = await fetch(`${baseUrl}/api/reputation/profile-sync/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace", locationId: "aquatrace-primary" })
    }).then((response) => response.json());
    assert.equal(profile.ok, true);
    assert.equal(profile.approval.kind, "gbp_profile_update");

    const widget = await fetch(`${baseUrl}/api/reputation/widget?tenantId=aquatrace`).then((response) => response.json());
    assert.equal(widget.ok, true);
    assert.equal(widget.embedReady, true);
    assert.equal(widget.reviews[0].rating, 5);
  });
});

test("M7 Nexi tools surface blockers honestly and park all outbound reputation work", async () => {
  const repository = new InMemoryReputationRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const tools = createReputationNexiTools({
    repository,
    approvalQueue,
    gbpProvider: blockerProvider(),
    actorId: "internal:owner_chris"
  });
  const pollGbpReviews = tools.find((tool) => tool.name === "pollGbpReviews");
  const reputationQueue = tools.find((tool) => tool.name === "reputationQueue");
  const draftReviewRequest = tools.find((tool) => tool.name === "draftReviewRequest");
  const draftGbpProfileSync = tools.find((tool) => tool.name === "draftGbpProfileSync");

  const poll = await pollGbpReviews.handler(tenant(), {});
  assert.match(poll.result.blocker, /GBP OAuth credentials/);
  assert.equal(poll.sources[0].ref, "gbp-review-connection");

  const queue = await reputationQueue.handler(tenant(), {});
  assert.equal(queue.result.reviews.length, 0);
  assert.equal(queue.result.publishingDeferredUntilGbpCredentials, true);

  const request = await draftReviewRequest.handler(tenant(), {
    to: "client@example.test",
    invoiceId: "inv_paid_123",
    clientName: "Rachel Payne"
  });
  assert.equal(request.result.sendsAreApprovalQueuedOnly, true);
  assert.equal(request.result.usesCampaignRail, true);
  assert.equal(request.sources[0].rail, "native");

  const profile = await draftGbpProfileSync.handler(tenant(), { locationId: "aquatrace-primary" });
  assert.equal(profile.result.publishingDeferred, true);
  assert.equal(profile.sources[0].rail, "native");

  const pending = await approvalQueue.listPending("aquatrace");
  assert.deepEqual(pending.map((item) => item.kind), ["email", "gbp_profile_update"]);
});
