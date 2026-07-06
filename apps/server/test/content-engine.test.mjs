import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository,
  InMemoryEventBus
} from "@nexteam/core";
import { generateDraftsForJob } from "../dist/content/contentEngine.js";
import { createContentNexiTools } from "../dist/content/nexiTools.js";
import { InMemoryContentRepository } from "../dist/content/repository.js";
import { registerContentRoutes } from "../dist/content/routes.js";
import { draftContentForJob } from "../dist/content/workflow.js";

function tenant() {
  return {
    id: "aquatrace",
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "native", email: "gmail_relay" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

function completedJob() {
  return {
    id: "job_complete_1",
    tenantId: "aquatrace",
    title: "Swimming Pool Leak Detection Service",
    clientName: "Sample Owner",
    city: "Bryson City",
    state: "NC",
    outcome: "Pressure testing found a return-line leak and documented the repair path.",
    completedAt: "2026-07-07T19:10:00.000Z",
    lineItems: [{ name: "Pool leak detection", total: 595 }]
  };
}

const media = [
  {
    id: "media_photo_1",
    type: "photo",
    thumbRef: "native://thumbs/media_photo_1.jpg",
    storageRef: "native://media/media_photo_1.jpg",
    caption: "Technician marking the return fitting."
  }
];

test("content generators create GBP, social, and article drafts from job facts", () => {
  const drafts = generateDraftsForJob({
    tenantId: "aquatrace",
    job: completedJob(),
    media,
    now: "2026-07-07T20:00:00.000Z"
  });

  assert.deepEqual(drafts.map((draft) => draft.kind), ["gbp_post", "social_post", "article"]);
  assert.equal(drafts[0].mediaRefs[0], "media_photo_1");
  assert.match(drafts[0].body, /Bryson City, NC/);
  assert.match(drafts[2].body, /# How pool leak detection works/);
  assert.equal(drafts.every((draft) => draft.sources.some((source) => source.ref === "job_complete_1")), true);
});

test("draftContentForJob parks generated artifacts in ApprovalQueue only", async () => {
  const repository = new InMemoryContentRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const drafts = await draftContentForJob({
    tenantId: "aquatrace",
    job: completedJob(),
    media,
    requestedKinds: ["gbp_post", "social_post"],
    repository,
    approvalQueue,
    now: "2026-07-07T20:00:00.000Z"
  });

  assert.equal(drafts.length, 2);
  assert.equal(drafts.every((draft) => draft.status === "approval_pending"), true);
  assert.equal(drafts.every((draft) => draft.approvalId?.startsWith("appr_")), true);

  const pending = await approvalQueue.listPending("aquatrace");
  assert.deepEqual(pending.map((item) => item.kind), ["gbp_post", "social_post"]);
  assert.equal(pending.every((item) => item.execute.service === "content"), true);
  assert.equal(pending.every((item) => item.execute.args.publishingDeferredUntilCredentials === true), true);

  const calendar = await repository.listCalendar("aquatrace");
  assert.equal(calendar.length, 3);
  assert.match(calendar[0].cadenceReason, /GBP cadence/);
});

test("job.completed event drafts a GBP post and does not publish", async () => {
  const app = express();
  app.use(express.json());
  const repository = new InMemoryContentRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const eventBus = new InMemoryEventBus();
  registerContentRoutes(app, { repository, approvalQueue, eventBus });

  await eventBus.emit({
    tenantId: "aquatrace",
    type: "job.completed",
    payload: { job: completedJob(), media }
  });

  const drafts = await repository.listDrafts("aquatrace");
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].kind, "gbp_post");
  assert.equal(drafts[0].status, "approval_pending");
  const pending = await approvalQueue.listPending("aquatrace");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].execute.op, "publishGbpPost");
});

test("Nexi content tools draft, list, approve, and summarize without executing publish", async () => {
  const repository = new InMemoryContentRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const tools = createContentNexiTools({ repository, approvalQueue });
  const draftPostFromJob = tools.find((tool) => tool.name === "draftPostFromJob");
  const contentQueue = tools.find((tool) => tool.name === "contentQueue");
  const approve = tools.find((tool) => tool.name === "approve");
  const contentStats = tools.find((tool) => tool.name === "contentStats");

  const draftOutput = await draftPostFromJob.handler(tenant(), {
    job: completedJob(),
    media,
    requestedKinds: ["article"]
  });
  const draftId = draftOutput.result.drafts[0].id;
  assert.equal(draftOutput.result.publishingDeferred, true);

  const queueOutput = await contentQueue.handler(tenant(), {});
  assert.equal(queueOutput.result.drafts.length, 1);
  assert.equal(queueOutput.sources[0].rail, "native");

  const approveOutput = await approve.handler(tenant(), { draftId });
  assert.equal(approveOutput.result.draft.status, "publish_ready");
  assert.equal(approveOutput.result.approval.status, "approved");
  assert.equal(approveOutput.result.publishingDeferred, true);

  const statsOutput = await contentStats.handler(tenant(), {});
  assert.equal(statsOutput.result.stats.publishReady, 1);
  assert.equal(statsOutput.result.publishingDeferred, true);
});
