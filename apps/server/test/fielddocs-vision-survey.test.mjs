import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mediaSchema } from "@nexteam/core";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { registerFieldDocsRoutes } from "../dist/fielddocs/routes.js";
import {
  AQUATRACE_VISION_TAG_TAXONOMY,
  applyVisionSurveyCorrection,
  estimateVisionSurveyCost,
  reviewMediaMetadata,
  runVisionSurveyBatch
} from "../dist/fielddocs/visionSurvey.js";

const skimmerPhoto = mediaSchema.parse({
  id: "media_skimmer",
  tenantId: "aquatrace",
  jobId: "justice-2026-07-02",
  type: "photo",
  storageRef: "companycam://recent-residential/deborah-justice/skimmer-dye.jpg",
  aiTags: ["skimmer", "dye test", "pool"],
  aiCaption: "Skimmer throat dye test shows water movement.",
  externalIds: { companycam: "cc_justice_skimmer" }
});

const unknownPhoto = mediaSchema.parse({
  id: "media_unknown",
  tenantId: "aquatrace",
  jobId: "justice-2026-07-02",
  type: "photo",
  storageRef: "companycam://recent-residential/deborah-justice/IMG_4892.jpg",
  aiTags: [],
  externalIds: { companycam: "cc_justice_unknown" }
});

const otherTenantPhoto = mediaSchema.parse({
  id: "media_other",
  tenantId: "other-tenant",
  jobId: "justice-2026-07-02",
  type: "photo",
  storageRef: "companycam://recent-residential/deborah-justice/leak.jpg",
  aiTags: ["skimmer"],
  aiCaption: "Should never be visible to aquatrace."
});

test("vision survey reviews known and insufficient photos without guessing", async () => {
  const repository = new MemoryMediaRepository([skimmerPhoto, unknownPhoto, otherTenantPhoto]);
  const result = await runVisionSurveyBatch(repository, "aquatrace", {
    folderRef: "recent-residential/deborah-justice",
    budgetCapUsd: 5
  });

  assert.equal(result.status, "reviewed");
  assert.equal(result.photoCount, 2);
  assert.equal(result.updatedMediaIds.length, 2);
  assert.equal(result.reviews.find((review) => review.mediaId === "media_skimmer")?.component, "skimmer");
  assert.equal(result.reviews.find((review) => review.mediaId === "media_skimmer")?.evidenceTier, "VISIBLE");
  assert.equal(result.reviews.find((review) => review.mediaId === "media_unknown")?.evidenceTier, "INSUFFICIENT");
  assert.equal(result.lowConfidencePrompts.length, 1);
  assert.match(result.lowConfidencePrompts[0], /What was this photo\? media_unknown/);
  assert.deepEqual(result.taxonomy.components, AQUATRACE_VISION_TAG_TAXONOMY.components);

  const updated = await repository.getMedia("aquatrace", "media_unknown");
  assert.equal(updated?.aiTags.includes("vision:needs_human_label"), true);
  assert.equal(await repository.getMedia("aquatrace", "media_other"), null);
});

test("vision survey blocks batches before estimated spend exceeds the cap", async () => {
  const repository = new MemoryMediaRepository([skimmerPhoto, unknownPhoto]);
  const result = await runVisionSurveyBatch(repository, "aquatrace", {
    folderRef: "recent-residential/deborah-justice",
    budgetCapUsd: 0.01
  });

  assert.equal(result.status, "blocked_budget");
  assert.equal(result.costEstimate.exceedsCap, true);
  assert.equal(result.updatedMediaIds.length, 0);
  assert.equal((await repository.getMedia("aquatrace", "media_skimmer"))?.aiTags.includes("vision:component:skimmer"), false);
});

test("vision survey correction adds human-confirmed tags", async () => {
  const repository = new MemoryMediaRepository([unknownPhoto]);
  const corrected = await applyVisionSurveyCorrection(repository, "aquatrace", {
    mediaId: "media_unknown",
    component: "drain",
    evidenceTier: "VISIBLE",
    condition: "normal",
    note: "This is the spa main drain set.",
    tags: ["spa-main-drain"]
  });

  assert.equal(corrected.aiTags.includes("vision:human_confirmed"), true);
  assert.equal(corrected.aiTags.includes("human:component:drain"), true);
  assert.equal(corrected.aiTags.includes("human:spa-main-drain"), true);
  assert.match(corrected.aiCaption ?? "", /spa main drain/);
});

test("vision survey helpers expose conservative cost and metadata classification", () => {
  const cost = estimateVisionSurveyCost(10, 5);
  assert.equal(cost.estimatedCostUsd, 0.18);
  assert.equal(cost.exceedsCap, false);
  const review = reviewMediaMetadata(skimmerPhoto);
  assert.equal(review.reportUsefulness, "report_ready");
  assert.equal(review.leakRelevance, "high");
});

test("vision survey routes are AccessContext-gated and tenant-scoped", async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const repository = new MemoryMediaRepository([skimmerPhoto, unknownPhoto, otherTenantPhoto]);
  registerFieldDocsRoutes(app, {
    repository,
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "false", TENANT_ID: "aquatrace" }
  });
  const server = app.listen(0);
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = address && typeof address === "object" ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    const taxonomy = await fetch(`${base}/api/fielddocs/vision-survey/taxonomy`).then((response) => response.json());
    assert.equal(taxonomy.ok, true);
    assert.equal(taxonomy.tenantId, "aquatrace");
    assert.equal(Array.isArray(taxonomy.taxonomy.evidence), true);

    const batchResponse = await fetch(`${base}/api/fielddocs/vision-survey/batches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderRef: "recent-residential/deborah-justice", dryRun: true })
    });
    assert.equal(batchResponse.status, 201);
    const batch = await batchResponse.json();
    assert.equal(batch.ok, true);
    assert.equal(batch.photoCount, 2);

    const correction = await fetch(`${base}/api/fielddocs/vision-survey/corrections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaId: "media_unknown", component: "drain", evidenceTier: "VISIBLE" })
    }).then((response) => response.json());
    assert.equal(correction.ok, true);
    assert.equal(correction.media.aiTags.includes("human:component:drain"), true);
  } finally {
    server.close();
  }
});
