import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository,
  mediaSchema
} from "@nexteam/core";
import { MemoryNativeCrmRepository } from "@nexteam/providers";
import { createApprovalNexiTools } from "../dist/approval/nexiTools.js";
import { ContentApprovalExecutor } from "../dist/content/approvalExecutor.js";
import { createContentNexiTools } from "../dist/content/nexiTools.js";
import { registerNexReachRoutes } from "../dist/content/nexreachRoutes.js";
import { NexReachService } from "../dist/content/nexreachService.js";
import { InMemoryContentRepository } from "../dist/content/repository.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { runExplicitLocalToolLoop } from "../dist/nexi/nexiService.js";
import { InMemoryPlatformRepository } from "../dist/platform/repository.js";
import { InMemoryReputationRepository } from "../dist/reputation/repository.js";

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

function lineItems(items) {
  return items.map((item, index) => ({
    id: item.id ?? `line_${index + 1}`,
    source: item.source ?? "custom",
    code: item.code ?? `CODE-${index + 1}`,
    name: item.name,
    description: item.description ?? item.name,
    quantity: item.quantity ?? 1,
    unitPrice: item.unitPrice ?? 0,
    total: item.total ?? Number(((item.quantity ?? 1) * (item.unitPrice ?? 0)).toFixed(2))
  }));
}

function totals(total, tax = 0) {
  return {
    subtotal: Number((total - tax).toFixed(2)),
    tax,
    total
  };
}

function mediaFixture(input) {
  return mediaSchema.parse({
    tenantId: "aquatrace",
    type: "photo",
    aiTags: [],
    storageRef: `native://tenants/aquatrace/media/${input.id}.jpg`,
    ...input
  });
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

async function createHarness() {
  const crmRepository = new MemoryNativeCrmRepository({
    clients: [{
      id: "client_marketing_yes",
      tenantId: "aquatrace",
      name: "Rachel Payne",
      emails: ["rachel@example.test"],
      phones: ["8645551100"],
      billingAddress: {
        street1: "102 Kate Lane",
        city: "Fair Play",
        province: "SC",
        postalCode: "29643",
        country: "US"
      },
      tags: ["marketing-ok"],
      consent: { email: true, sms: true, marketing: true }
    }, {
      id: "client_marketing_no",
      tenantId: "aquatrace",
      name: "Logan Sears",
      emails: ["logan@example.test"],
      phones: ["8645552200"],
      billingAddress: {
        street1: "620 Frest Drive",
        city: "Seneca",
        province: "SC",
        postalCode: "29672",
        country: "US"
      },
      tags: ["marketing-no"],
      consent: { email: true, sms: true, marketing: false }
    }],
    properties: [{
      id: "property_1",
      tenantId: "aquatrace",
      clientId: "client_marketing_yes",
      label: "Fair Play residence",
      address: {
        street1: "102 Kate Lane",
        city: "Fair Play",
        province: "SC",
        postalCode: "29643",
        country: "US"
      },
      assets: []
    }, {
      id: "property_2",
      tenantId: "aquatrace",
      clientId: "client_marketing_no",
      label: "Seneca residence",
      address: {
        street1: "620 Frest Drive",
        city: "Seneca",
        province: "SC",
        postalCode: "29672",
        country: "US"
      },
      assets: []
    }],
    jobs: [{
      id: "job_closed_ok",
      tenantId: "aquatrace",
      clientId: "client_marketing_yes",
      propertyId: "property_1",
      status: "Unscheduled",
      title: "Leak detection - return line",
      lineItems: lineItems([{
        name: "Leak isolation at 102 Kate Lane lat: 34.5000,-82.9000",
        quantity: 1,
        unitPrice: 795,
        code: "LEAK"
      }]),
      totals: totals(795),
      closedAt: "2026-07-19T16:00:00.000Z",
      updatedAt: "2026-07-19T16:00:00.000Z"
    }, {
      id: "job_closed_blocked",
      tenantId: "aquatrace",
      clientId: "client_marketing_no",
      propertyId: "property_2",
      status: "Unscheduled",
      title: "Skimmer leak",
      lineItems: lineItems([{
        name: "Skimmer repair",
        quantity: 1,
        unitPrice: 640,
        code: "SKIM"
      }]),
      totals: totals(640),
      closedAt: "2026-07-18T15:00:00.000Z",
      updatedAt: "2026-07-18T15:00:00.000Z"
    }]
  });
  const mediaRepository = new MemoryMediaRepository([
    mediaFixture({
      id: "media_before_1",
      clientId: "client_marketing_yes",
      jobId: "job_closed_ok",
      propertyId: "property_1",
      aiTags: ["before", "return-line", "pool"]
    }),
    mediaFixture({
      id: "media_after_1",
      clientId: "client_marketing_yes",
      jobId: "job_closed_ok",
      propertyId: "property_1",
      aiTags: ["after", "return-line", "pool"]
    }),
    mediaFixture({
      id: "media_hidden_1",
      clientId: "client_marketing_yes",
      jobId: "job_closed_ok",
      propertyId: "property_1",
      hiddenFromClient: true,
      aiTags: ["before"]
    }),
    mediaFixture({
      id: "media_trashed_1",
      clientId: "client_marketing_yes",
      jobId: "job_closed_ok",
      propertyId: "property_1",
      trashedAt: "2026-07-19T17:00:00.000Z",
      aiTags: ["after"]
    }),
    mediaFixture({
      id: "media_blocked_1",
      clientId: "client_marketing_no",
      jobId: "job_closed_blocked",
      propertyId: "property_2",
      aiTags: ["before"]
    })
  ]);
  const platformRepository = new InMemoryPlatformRepository();
  const reputationRepository = new InMemoryReputationRepository();
  await reputationRepository.upsertReview({
    id: "review_5_star",
    tenantId: "aquatrace",
    locationId: "aquatrace-main",
    provider: "native",
    authorName: "Deborah Justice",
    rating: 5,
    comment: "Chris found the leak quickly and explained the repair clearly.",
    reviewedAt: "2026-07-19T18:00:00.000Z",
    createdAt: "2026-07-19T18:00:00.000Z",
    updatedAt: "2026-07-19T18:00:00.000Z"
  });
  await reputationRepository.upsertReview({
    id: "review_4_star",
    tenantId: "aquatrace",
    locationId: "aquatrace-main",
    provider: "native",
    authorName: "Rachel Payne",
    rating: 4,
    comment: "The visit was detailed and the photos helped us understand the issue.",
    reviewedAt: "2026-07-18T18:00:00.000Z",
    createdAt: "2026-07-18T18:00:00.000Z",
    updatedAt: "2026-07-18T18:00:00.000Z"
  });
  await reputationRepository.upsertReview({
    id: "review_3_star",
    tenantId: "aquatrace",
    locationId: "aquatrace-main",
    provider: "native",
    authorName: "Anonymous",
    rating: 3,
    comment: "Average.",
    reviewedAt: "2026-07-17T18:00:00.000Z",
    createdAt: "2026-07-17T18:00:00.000Z",
    updatedAt: "2026-07-17T18:00:00.000Z"
  });

  const repository = new InMemoryContentRepository();
  let service;
  const approvalQueue = new ApprovalQueueService(
    new InMemoryApprovalQueueRepository(),
    new ContentApprovalExecutor(() => service)
  );
  service = new NexReachService({
    repository,
    crmRepository,
    mediaRepository,
    platformRepository,
    reputationRepository,
    approvalQueue
  });

  return {
    service,
    repository,
    approvalQueue,
    crmRepository,
    mediaRepository,
    platformRepository,
    reputationRepository
  };
}

test("NexReach generates approval-pending article and social drafts from consented closed jobs only", async () => {
  const harness = await createHarness();

  await assert.rejects(
    () => harness.service.generateJobContent({
      tenantId: "aquatrace",
      jobId: "job_closed_blocked",
      actorId: "internal:owner_chris"
    }),
    /has not opted into marketing use/i
  );

  const result = await harness.service.generateJobContent({
    tenantId: "aquatrace",
    jobId: "job_closed_ok",
    actorId: "internal:owner_chris"
  });

  assert.equal(result.cadence, "owner_on_demand");
  assert.equal(result.eligibility.status, "drafted");
  assert.equal(result.selectedMedia.map((item) => item.id).join(","), "media_before_1,media_after_1");
  assert.equal(result.drafts.length, 2);
  assert.deepEqual(result.drafts.map((draft) => draft.kind).sort(), ["article", "social_post"]);
  assert.equal(result.drafts.every((draft) => draft.status === "approval_pending"), true);
  assert.equal(result.drafts.every((draft) => draft.approvalId && draft.clientId === "client_marketing_yes"), true);
  assert.equal(result.drafts.every((draft) => draft.locality === "Fair Play, SC"), true);
  assert.equal(result.drafts.every((draft) => draft.watermarkLabel === "Aquatrace | NexCam"), true);
  assert.equal(result.drafts.every((draft) => draft.body.includes("Fair Play, SC")), true);
  assert.equal(result.drafts.every((draft) => !draft.body.includes("102 Kate Lane")), true);
  assert.equal(result.drafts.every((draft) => !/lat[:=]/i.test(draft.body)), true);
  assert.equal(result.drafts.every((draft) => draft.selectionNotes?.includes("Before/after pair prioritized when available.")), true);

  const social = result.drafts.find((draft) => draft.kind === "social_post");
  assert.ok(social);
  assert.match(social.shortCaption ?? "", /Aquatrace/i);
  assert.match(social.longCaption ?? "", /Field note/i);

  const pending = await harness.service.listPendingDrafts("aquatrace");
  assert.equal(pending.length, 2);
  assert.equal(pending.every((draft) => draft.approval?.status === "pending"), true);
  assert.equal(pending.every((draft) => !draft.approval?.preview.body.includes("102 Kate Lane")), true);
  assert.equal(pending.every((draft) => !/lat[:=]/i.test(draft.approval?.preview.body ?? "")), true);
});

test("NexReach consent revocation flags showcase previews and keeps the audience export consent-only", async () => {
  const harness = await createHarness();
  const generated = await harness.service.generateJobContent({
    tenantId: "aquatrace",
    jobId: "job_closed_ok",
    actorId: "internal:owner_chris"
  });
  const approved = await harness.service.approveDraft({
    tenantId: "aquatrace",
    draftId: generated.drafts[0].id,
    actorId: "internal:owner_chris"
  });
  assert.equal(approved.draft.status, "publish_ready");

  const showcase = await harness.service.createShowcase({
    tenantId: "aquatrace",
    draftId: approved.draft.id,
    reviewIds: ["review_5_star"]
  });
  assert.equal(showcase.status, "preview_ready");
  assert.equal(showcase.featuredReviewIds[0], "review_5_star");

  const audience = await harness.service.listAudience("aquatrace");
  assert.deepEqual(audience.map((entry) => entry.clientId), ["client_marketing_yes"]);
  const filtered = await harness.service.listAudience("aquatrace", {
    serviceType: "Leak isolation at Fair Play, SC",
    locality: "Fair Play, SC",
    closedSince: "2026-07-19T00:00:00.000Z"
  });
  assert.equal(filtered.length, 1);
  const csv = await harness.service.exportAudienceCsv("aquatrace");
  assert.match(csv, /clientId,clientName,locality,serviceType,lastClosedJobAt,email,phone,marketingConsent/);
  assert.match(csv, /Rachel Payne/);
  assert.doesNotMatch(csv, /Logan Sears/);

  await harness.crmRepository.upsertClient({
    id: "client_marketing_yes",
    tenantId: "aquatrace",
    name: "Rachel Payne",
    emails: ["rachel@example.test"],
    phones: ["8645551100"],
    billingAddress: {
      street1: "102 Kate Lane",
      city: "Fair Play",
      province: "SC",
      postalCode: "29643",
      country: "US"
    },
    tags: ["marketing-ok"],
    consent: { email: true, sms: true, marketing: false }
  });
  const flagged = await harness.service.handleConsentChange({
    tenantId: "aquatrace",
    clientId: "client_marketing_yes",
    marketingConsent: false
  });
  assert.equal(flagged.flaggedShowcases.length, 1);
  assert.equal(flagged.flaggedShowcases[0].status, "review_required");
  const eligibility = await harness.repository.getEligibilityByJob("aquatrace", "job_closed_ok");
  assert.equal(eligibility?.status, "blocked_consent");
  assert.equal(eligibility?.blockedReason, "marketing_consent_revoked");
});

test("NexReach routes expose bundle exports and a token-gated unpublished portfolio preview", async () => {
  const harness = await createHarness();
  const generated = await harness.service.generateJobContent({
    tenantId: "aquatrace",
    jobId: "job_closed_ok",
    actorId: "internal:owner_chris"
  });
  const approved = await harness.service.approveDraft({
    tenantId: "aquatrace",
    draftId: generated.drafts[0].id,
    actorId: "internal:owner_chris"
  });
  const showcase = await harness.service.createShowcase({
    tenantId: "aquatrace",
    draftId: approved.draft.id,
    reviewIds: ["review_5_star", "review_4_star"]
  });

  const app = express();
  app.use(express.json());
  registerNexReachRoutes(app, {
    service: harness.service,
    env: {
      TENANT_ID: "aquatrace",
      NEXI_FIREBASE_AUTH_REQUIRED: "false"
    }
  });

  await withServer(app, async (baseUrl) => {
    const bundleText = await fetch(`${baseUrl}/api/nexreach/drafts/${approved.draft.id}/bundle.txt?tenantId=aquatrace`).then((response) => response.text());
    assert.match(bundleText, /Watermark label: Aquatrace \| NexCam/);
    assert.match(bundleText, /Selected media refs:/);

    const bundleHtml = await fetch(`${baseUrl}/api/nexreach/drafts/${approved.draft.id}/bundle.html?tenantId=aquatrace`).then((response) => response.text());
    assert.match(bundleHtml, /Nexreach export bundle/);
    assert.match(bundleHtml, /Aquatrace \| NexCam/);
    assert.doesNotMatch(bundleHtml, /102 Kate Lane/);

    const mediaSvg = await fetch(`${baseUrl}/api/nexreach/drafts/${approved.draft.id}/media/media_before_1.svg?tenantId=aquatrace`).then((response) => response.text());
    assert.match(mediaSvg, /Aquatrace \| NexCam/);
    assert.match(mediaSvg, /api\/media\/media_before_1\?tenantId=aquatrace/);

    const linkResponse = await fetch(`${baseUrl}/api/nexreach/portfolio-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "aquatrace" })
    }).then((response) => response.json());
    assert.equal(linkResponse.ok, true);
    assert.match(linkResponse.url, /nexportal\/portfolio\/aquatrace\?token=/);

    const blocked = await fetch(`${baseUrl}/nexportal/portfolio/aquatrace`);
    assert.equal(blocked.status, 403);

    const portfolioHtml = await fetch(linkResponse.url).then((response) => response.text());
    assert.match(portfolioHtml, /Nexportal preview/);
    assert.match(portfolioHtml, /Owner-approved proof of work/);
    assert.match(portfolioHtml, new RegExp(showcase.title));
    assert.match(portfolioHtml, /Deborah Justice/);
    assert.doesNotMatch(portfolioHtml, /102 Kate Lane/);
  });
});

test("NexReach Nexi tools keep marketing actions role-fenced and approval-gated", async () => {
  const harness = await createHarness();
  const ownerTools = createContentNexiTools({
    service: harness.service,
    actorRole: "OWNER",
    actorId: "internal:owner_chris"
  });
  const techTools = createContentNexiTools({
    service: harness.service,
    actorRole: "TECHNICIAN",
    actorId: "internal:tech_logan"
  });

  const generateJobContent = ownerTools.find((tool) => tool.name === "generateJobContent");
  const listPendingDrafts = ownerTools.find((tool) => tool.name === "listPendingDrafts");
  const listConsentedClients = ownerTools.find((tool) => tool.name === "listConsentedClients");
  const approve = ownerTools.find((tool) => tool.name === "approve");

  const generated = await generateJobContent.handler(tenant(), {
    jobId: "job_closed_ok",
    requestedKinds: ["article", "social_post"]
  });
  assert.equal(generated.result.draftCount, 2);
  assert.equal(generated.result.publishingDeferred, true);
  assert.equal(generated.sources.every((source) => source.rail === "native"), true);

  const queue = await listPendingDrafts.handler(tenant(), {});
  assert.equal(queue.result.drafts.length, 2);

  const audience = await listConsentedClients.handler(tenant(), { locality: "Fair Play, SC" });
  assert.deepEqual(audience.result.audience.map((entry) => entry.clientId), ["client_marketing_yes"]);

  const approved = await approve.handler(tenant(), { draftId: generated.result.drafts[0].id });
  assert.equal(approved.result.draft.status, "publish_ready");
  assert.equal(approved.result.publishingDeferred, true);

  const generateAsTech = techTools.find((tool) => tool.name === "generateJobContent");
  await assert.rejects(
    () => generateAsTech.handler(tenant(), { jobId: "job_closed_ok" }),
    /Only OWNER and OFFICE_ADMIN can use NexReach marketing tools/i
  );
});

test("NexReach local Nexi loop accepts underscore ids through generate, approve, and refusal flow", async () => {
  const harness = await createHarness();
  const tools = [
    ...createContentNexiTools({
      service: harness.service,
      actorRole: "OWNER",
      actorId: "internal:owner_chris"
    }),
    ...createApprovalNexiTools({
      approvalQueue: harness.approvalQueue,
      actorId: "internal:owner_chris",
      actorRole: "OWNER"
    })
  ];

  const generateTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "local test",
    messages: [{ role: "user", content: "generate marketing content for job job_closed_ok" }],
    tools,
    cachedToolRuns: [],
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer"
  });
  assert.match(generateTurn.answer, /I drafted 2 marketing items for owner approval/i);
  const articleDraftId = generateTurn.toolRuns[0].result.drafts.find((draft) => draft.kind === "article")?.id;
  assert.match(articleDraftId, /^content_article_/);

  const approveTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "local test",
    messages: [
      { role: "user", content: "generate marketing content for job job_closed_ok" },
      { role: "assistant", content: generateTurn.answer },
      { role: "user", content: `approve draft ${articleDraftId}` }
    ],
    tools,
    cachedToolRuns: generateTurn.toolRuns,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer"
  });
  assert.match(approveTurn.answer, /Here is your request, Operator\./i);
  assert.match(approveTurn.answer, /Is this correct\?\s*Reply yes \/ no \/ make changes\./i);

  const yesTurn = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "local test",
    messages: [
      { role: "user", content: "generate marketing content for job job_closed_ok" },
      { role: "assistant", content: generateTurn.answer },
      { role: "user", content: `approve draft ${articleDraftId}` },
      { role: "assistant", content: approveTurn.answer },
      { role: "user", content: "yes" }
    ],
    tools,
    cachedToolRuns: [...generateTurn.toolRuns, ...approveTurn.toolRuns],
    pendingApproval: approveTurn.pendingApproval,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer"
  });
  assert.match(yesTurn.answer, /Approved and marked/i);
  assert.match(yesTurn.answer, /publish_ready/i);

  await assert.rejects(
    () => runExplicitLocalToolLoop({
      tenant: tenant(),
      system: "local test",
      messages: [{ role: "user", content: "generate marketing content for job job_closed_blocked" }],
      tools,
      cachedToolRuns: [],
      routeActionName: "/api/nexi/message",
      taskType: "job_desk_answer"
    }),
    /has not opted into marketing use/i
  );
});
