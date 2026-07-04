import test from "node:test";
import assert from "node:assert/strict";
import { mediaSchema } from "@nexteam/core";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { pairBeforeAfter, searchMediaByMetadata, searchMediaWithVisionFallback } from "../dist/fielddocs/photoSearch.js";
import { createFieldDocsReadTools } from "../dist/fielddocs/nexiTools.js";
import { maybeRunVision } from "../dist/fielddocs/visionPipeline.js";
import { createNativeMediaFromUpload } from "../dist/fielddocs/uploadService.js";
import { createLeakDetectionChecklist } from "../dist/fielddocs/checklists.js";
import { renderFieldReportPdf } from "../dist/fielddocs/reportService.js";

const tenant = {
  id: "aquatrace",
  name: "Aquatrace",
  industryPack: "pool_leak",
  branding: { assistantName: "Nexi" },
  adapters: { crm: "jobber", media: "native", email: "gmail_relay" },
  approval: {},
  timezone: "America/New_York",
  plan: "suite"
};

const skimmerPhoto = mediaSchema.parse({
  id: "media_1",
  tenantId: "aquatrace",
  jobId: "job_1",
  type: "photo",
  storageRef: "companycam:333",
  aiTags: ["before", "skimmer", "pool"],
  aiCaption: "Skimmer throat dye test before repair.",
  externalIds: { companycam: "333" }
});

const afterPhoto = mediaSchema.parse({
  id: "media_2",
  tenantId: "aquatrace",
  jobId: "job_1",
  type: "photo",
  storageRef: "native://tenants/aquatrace/media/media_2/after.jpg",
  aiTags: ["after", "skimmer"],
  aiCaption: "After repair skimmer photo.",
  externalIds: { companycam: "334" }
});

const untaggedPhoto = mediaSchema.parse({
  id: "media_3",
  tenantId: "aquatrace",
  jobId: "job_2",
  type: "photo",
  storageRef: "native://tenants/aquatrace/media/media_3/upload.jpg",
  aiTags: []
});

test("natural-language photo search matches imported metadata", () => {
  const hits = searchMediaByMetadata([skimmerPhoto], "show me the skimmer photo", 5);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].media.id, "media_1");
});

test("vision pipeline stub is wired off by default", async () => {
  const result = await maybeRunVision(skimmerPhoto, {});
  assert.equal(result.enabled, false);
  assert.equal(result.media.aiCaption, "Skimmer throat dye test before repair.");
});

test("upload service creates native storage refs, thumbnails, and EXIF metadata", () => {
  const media = createNativeMediaFromUpload({
    tenantId: "aquatrace",
    jobId: "job_2",
    propertyId: "property_1",
    filename: "skimmer before.jpg",
    mime: "image/jpeg",
    tags: ["before", "skimmer"],
    capturedAt: "2026-07-04T19:00:00.000Z",
    gps: { lat: 34.1, lng: -82.1 }
  });
  assert.equal(media.type, "photo");
  assert.equal(media.storageRef.includes("companycam.com"), false);
  assert.equal(media.thumbRef?.startsWith("native://tenants/aquatrace/media/"), true);
  assert.equal(media.exif?.gps?.lat, 34.1);
});

test("before/after pairing and vision fallback are wired", async () => {
  const pairs = pairBeforeAfter([skimmerPhoto, afterPhoto]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].before.id, "media_1");
  const fallbackHits = await searchMediaWithVisionFallback([untaggedPhoto], "vision pending", 5, { FIELD_DOCS_VISION_ENABLED: "true" });
  assert.equal(fallbackHits.length, 1);
});

test("leak checklist and report PDF render", () => {
  const checklist = createLeakDetectionChecklist({ tenantId: "aquatrace", jobId: "job_1" });
  assert.equal(checklist.templateId, "leak_detection_checklist_v1");
  assert.equal(checklist.items.length > 0, true);
  const pdf = renderFieldReportPdf({
    tenantId: "aquatrace",
    jobId: "job_1",
    title: "Leak detection field report",
    findings: ["Skimmer throat leak observed."],
    media: [skimmerPhoto],
    checklist
  });
  assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
});

test("Field Docs read tool searches native media repository", async () => {
  const repository = new MemoryMediaRepository([skimmerPhoto, afterPhoto]);
  const tool = createFieldDocsReadTools(repository).find((candidate) => candidate.name === "photoSearch");
  const pairsTool = createFieldDocsReadTools(repository).find((candidate) => candidate.name === "beforeAfterPairs");
  assert.ok(tool);
  assert.ok(pairsTool);
  const result = await tool.handler(tenant, { query: "skimmer", limit: 3 });
  assert.equal(result.sources[0].rail, "native");
  assert.equal(result.result.hits[0].media.id, "media_1");
  const pairResult = await pairsTool.handler(tenant, { jobId: "job_1" });
  assert.equal(pairResult.result.pairs.length, 1);
  assert.equal(pairResult.sources.length, 2);
});
