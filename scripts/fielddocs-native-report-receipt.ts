import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLeakDetectionChecklist } from "../apps/server/src/fielddocs/checklists.js";
import { MemoryMediaRepository } from "../apps/server/src/fielddocs/mediaRepository.js";
import { pairBeforeAfter, searchMediaWithVisionFallback } from "../apps/server/src/fielddocs/photoSearch.js";
import { createFieldReportRecord, renderFieldReportPdf } from "../apps/server/src/fielddocs/reportService.js";
import { createNativeMediaFromUpload } from "../apps/server/src/fielddocs/uploadService.js";
import { maybeRunVision } from "../apps/server/src/fielddocs/visionPipeline.js";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = join(repoRoot, "..", "receipts", "m4");
const tenantId = "aquatrace";
const jobId = "aquatrace-real-job-fielddocs-receipt";

async function main(): Promise<void> {
  const repository = new MemoryMediaRepository();
  const beforeUpload = createNativeMediaFromUpload({
    tenantId,
    jobId,
    propertyId: "property_aquatrace_receipt",
    filename: "skimmer-before.jpg",
    mime: "image/jpeg",
    tags: ["before", "skimmer", "dye-test"],
    capturedAt: "2026-07-04T19:00:00.000Z",
    gps: { lat: 33.997, lng: -81.036 }
  });
  const afterUpload = createNativeMediaFromUpload({
    tenantId,
    jobId,
    propertyId: "property_aquatrace_receipt",
    filename: "skimmer-after.jpg",
    mime: "image/jpeg",
    tags: ["after", "skimmer", "repair"],
    capturedAt: "2026-07-04T20:15:00.000Z",
    gps: { lat: 33.997, lng: -81.036 }
  });
  const beforeVision = await maybeRunVision(beforeUpload, {});
  const afterVision = await maybeRunVision(afterUpload, {});
  const beforeMedia = await repository.saveMedia(beforeVision.media);
  const afterMedia = await repository.saveMedia(afterVision.media);
  const checklist = await repository.saveChecklist(createLeakDetectionChecklist({
    tenantId,
    jobId,
    itemUpdates: [
      { id: "item_2", status: "pass", note: "Skimmer throat inspected and dye-tested." },
      { id: "item_4", status: "pass", note: "Suspect penetration documented in photos." },
      { id: "item_6", status: "pass", note: "Before and after photos attached to report." },
      { id: "item_7", status: "pass", note: "Repair recommendation recorded for operator review." }
    ]
  }));
  const report = await repository.saveReport(createFieldReportRecord({
    tenantId,
    jobId,
    title: "Aquatrace leak detection field report",
    findings: [
      "Skimmer throat dye test documented before repair.",
      "After photo attached for operator review.",
      "Report is native FieldDocs documentation only; no outbound delivery was performed."
    ],
    mediaIds: [beforeMedia.id, afterMedia.id],
    checklistId: checklist.id,
    status: "posted"
  }));
  const pdf = renderFieldReportPdf({
    tenantId,
    jobId,
    title: report.title,
    findings: report.findings,
    media: [beforeMedia, afterMedia],
    checklist
  });
  const searchHits = await searchMediaWithVisionFallback(await repository.listMedia(tenantId), "show me skimmer photo from Aquatrace job", 5, {});
  const pairs = pairBeforeAfter(await repository.listMedia(tenantId));
  const storedReport = await repository.getReport(tenantId, report.id);

  await mkdir(outputDir, { recursive: true });
  const pdfPath = join(outputDir, "native-field-report.pdf");
  await writeFile(pdfPath, pdf);
  const receipt = {
    ok: true,
    generatedAt: new Date().toISOString(),
    hardLimits: {
      companyCamWrite: false,
      outboundDelivery: false,
      paidVisionCall: false
    },
    upload: {
      mediaIds: [beforeMedia.id, afterMedia.id],
      storageRefsAreNative: [beforeMedia.storageRef, afterMedia.storageRef].every((ref) => ref.startsWith("native://")),
      thumbnailsCreated: [beforeMedia.thumbRef, afterMedia.thumbRef].every(Boolean),
      exifGpsCaptured: Boolean(beforeMedia.exif?.gps && afterMedia.exif?.gps)
    },
    vision: {
      beforeEnabled: beforeVision.enabled,
      beforeReason: beforeVision.reason ?? null,
      afterEnabled: afterVision.enabled,
      afterReason: afterVision.reason ?? null,
      actualSpendUsd: 0
    },
    checklist: {
      id: checklist.id,
      templateId: checklist.templateId,
      completedItems: checklist.items.filter((item) => item.status !== "pending").length
    },
    report: {
      id: report.id,
      status: storedReport?.status,
      pdfRef: storedReport?.pdfRef,
      postedAt: storedReport?.postedAt ?? null,
      pdfPath: "receipts/m4/native-field-report.pdf",
      pdfMagic: pdf.subarray(0, 5).toString("utf8")
    },
    search: {
      query: "show me skimmer photo from Aquatrace job",
      topHitId: searchHits[0]?.media.id ?? null,
      hitCount: searchHits.length
    },
    beforeAfter: {
      pairCount: pairs.length,
      firstPair: pairs[0] ? { before: pairs[0].before.id, after: pairs[0].after.id } : null
    }
  };
  await writeFile(join(outputDir, "native-report-post-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
