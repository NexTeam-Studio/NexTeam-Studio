import test from "node:test";
import assert from "node:assert/strict";
import { mediaSchema, RailError } from "@nexteam/core";
import { MemoryNativeCrmRepository } from "@nexteam/providers";
import { assertAccessRole } from "../dist/auth/accessContext.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { NexDocsService, NEXDOCS_MAX_UPLOAD_BYTES } from "../dist/fielddocs/nexDocsService.js";
import { pairBeforeAfter, searchMediaByMetadata, searchMediaWithVisionFallback } from "../dist/fielddocs/photoSearch.js";
import { createFieldDocsReadTools } from "../dist/fielddocs/nexiTools.js";
import { maybeRunVision } from "../dist/fielddocs/visionPipeline.js";
import { createNativeMediaFromUpload } from "../dist/fielddocs/uploadService.js";
import { createLeakDetectionChecklist } from "../dist/fielddocs/checklists.js";
import { createFieldReportRecord, renderFieldReportPdf } from "../dist/fielddocs/reportService.js";
import { MemoryUsageLogWriter } from "../dist/usageLog.js";

const tenant = {
  id: "aquatrace",
  name: "Aquatrace",
  industryPack: "pool_leak",
  branding: { assistantName: "Nexi" },
  adapters: { crm: "native", media: "native", email: "gmail_relay" },
  approval: {},
  timezone: "America/New_York",
  plan: "suite"
};

const skimmerPhoto = mediaSchema.parse({
  id: "media_1",
  tenantId: "aquatrace",
  jobId: "job_1",
  type: "photo",
  storageRef: "legacy-import:333",
  aiTags: ["before", "skimmer", "pool"],
  aiCaption: "Skimmer throat dye test before repair.",
  externalIds: { legacyMedia: "333" }
});

const afterPhoto = mediaSchema.parse({
  id: "media_2",
  tenantId: "aquatrace",
  jobId: "job_1",
  type: "photo",
  storageRef: "native://tenants/aquatrace/media/media_2/after.jpg",
  aiTags: ["after", "skimmer"],
  aiCaption: "After repair skimmer photo.",
  externalIds: { legacyMedia: "334" }
});

const untaggedPhoto = mediaSchema.parse({
  id: "media_3",
  tenantId: "aquatrace",
  jobId: "job_2",
  type: "photo",
  storageRef: "native://tenants/aquatrace/media/media_3/upload.jpg",
  aiTags: []
});

function lineItems(items) {
  return items.map((item, index) => ({
    id: item.id ?? `line_${index + 1}`,
    source: item.source ?? "custom",
    code: item.code ?? `CODE-${index + 1}`,
    name: item.name,
    description: item.description ?? `${item.name} description`,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: Number((item.quantity * item.unitPrice).toFixed(2))
  }));
}

function totals(total, tax = 0) {
  return {
    subtotal: Number((total - tax).toFixed(2)),
    tax,
    total
  };
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function simplePdfBuffer(text) {
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${escapePdfText(text)}) Tj\nET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream\nendobj`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function createNexDocsHarness(options = {}) {
  const crmRepository = new MemoryNativeCrmRepository({
    clients: [{
      id: "client_1",
      tenantId: tenant.id,
      name: "Deborah Justice",
      company: "Justice Pools",
      emails: ["deborah@example.test"],
      phones: ["8645551212"],
      tags: [],
      consent: { email: true, sms: true }
    }, {
      id: "client_2", tenantId: tenant.id, name: "Other client", tags: [], consent: { email: true, sms: true }
    }],
    properties: [{
      id: "property_1",
      tenantId: tenant.id,
      clientId: "client_1",
      label: "Main residence",
      address: { street1: "181 Isbell Road", city: "Fair Play", province: "SC", postalCode: "29643", country: "US" },
      assets: []
    }, {
      id: "property_2", tenantId: tenant.id, clientId: "client_2", label: "Other residence", address: { street1: "2 Other Road", city: "Fair Play", province: "SC", postalCode: "29643", country: "US" }, assets: []
    }],
    jobs: [{
      id: "job_1",
      tenantId: tenant.id,
      clientId: "client_1",
      propertyId: "property_1",
      status: "Unscheduled",
      title: "Leak detection",
      lineItems: lineItems([{ name: "Leak detection", quantity: 1, unitPrice: 795, code: "LEAK" }]),
      totals: totals(795)
    }, {
      id: "job_2", tenantId: tenant.id, clientId: "client_2", propertyId: "property_2", status: "Unscheduled", title: "Other job", lineItems: lineItems([]), totals: totals(0)
    }],
    quotes: [{
      id: "quote_1",
      tenantId: tenant.id,
      number: "Q-1001",
      clientId: "client_1",
      jobId: "job_1",
      status: "sent",
      title: "Pool permit quote",
      lineItems: lineItems([{ name: "Pool permit", quantity: 1, unitPrice: 240, code: "PERMIT" }]),
      totals: totals(240),
      approvalRules: {
        requireSignature: false,
        requireDeposit: false,
        requireCardOnFile: false
      },
      portal: {
        tokenHash: "hash_quote_1",
        tokenIssuedAt: "2026-07-19T08:00:00.000Z"
      },
      createdAt: "2026-07-19T08:00:00.000Z",
      updatedAt: "2026-07-19T08:00:00.000Z"
    }],
    invoices: [{
      id: "invoice_1",
      tenantId: tenant.id,
      number: "INV-1001",
      clientId: "client_1",
      jobId: "job_1",
      status: "awaiting_payment",
      title: "Pool permit invoice",
      lineItems: lineItems([{ name: "Pool permit", quantity: 1, unitPrice: 240, code: "PERMIT" }]),
      totals: totals(240),
      ledger: {
        depositApplied: 0,
        creditApplied: 0,
        paymentApplied: 0,
        refundedAmount: 0,
        balanceDue: 240,
        overdue: false
      },
      portal: {
        tokenHash: "hash_invoice_1",
        tokenIssuedAt: "2026-07-19T08:05:00.000Z"
      },
      createdAt: "2026-07-19T08:05:00.000Z",
      updatedAt: "2026-07-19T08:05:00.000Z"
    }]
  });
  const mediaRepository = new MemoryMediaRepository([
    skimmerPhoto,
    mediaSchema.parse({
      id: "media_permit_1",
      tenantId: tenant.id,
      clientId: "client_1",
      jobId: "job_1",
      propertyId: "property_1",
      type: "photo",
      storageRef: "native://tenants/aquatrace/media/media_permit_1/permit.jpg",
      aiTags: ["permit", "equipment"],
      aiCaption: "Permit plate photo by the equipment pad.",
      exif: { ts: "2026-07-19T08:10:00.000Z" }
    })
  ]);
  const usageLog = options.usageLog ?? new MemoryUsageLogWriter();
  const nexDocsService = new NexDocsService({
    mediaRepository,
    crmRepository,
    schedulingRepository: {
      async getVisit(tenantId, visitId) {
        return tenantId === tenant.id && visitId === "visit_1" ? { id: "visit_1", tenantId, jobId: "job_1" } : null;
      }
    },
    usageLog,
    ...(options.ocrFetch ? { ocrFetch: options.ocrFetch } : {}),
    storeUpload: async ({ documentId, fileName, fileBase64 }) => {
      const bytes = Buffer.from(fileBase64, "base64");
      return {
        storageRef: `gs://test-bucket/tenants/aquatrace/nexdocs/${documentId}/${fileName}`,
        sizeBytes: bytes.byteLength,
        bytes
      };
    }
  });
  return { crmRepository, mediaRepository, nexDocsService, usageLog };
}

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

test("vision pipeline parses live Anthropic-style JSON responses with usage", async () => {
  const result = await maybeRunVision(
    skimmerPhoto,
    { FIELD_DOCS_VISION_ENABLED: "true", ANTHROPIC_API_KEY: "test-key" },
    { mime: "image/jpeg", base64: "ZmFrZQ==" },
    async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          content: [{ type: "text", text: "{\"aiCaption\":\"Skimmer throat with dye test visible.\",\"aiTags\":[\"skimmer\",\"dye-test\"]}" }],
          usage: { input_tokens: 100, output_tokens: 20 }
        });
      }
    })
  );
  assert.equal(result.enabled, true);
  assert.equal(result.media.aiCaption, "Skimmer throat with dye test visible.");
  assert.deepEqual(result.media.aiTags, ["skimmer", "dye-test"]);
  assert.equal(result.usage.totalTokens, 120);
  assert.equal(result.estimatedCostUsd, 0.0006);
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
  assert.equal(media.storageRef.startsWith("native://"), true);
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
  const checklist = createLeakDetectionChecklist({
    tenantId: "aquatrace",
    jobId: "job_1",
    itemUpdates: [{ id: "item_2", status: "pass", note: "Skimmer throat inspected." }]
  });
  assert.equal(checklist.templateId, "leak_detection_checklist_v1");
  assert.equal(checklist.fields.length > 0, true);
  assert.equal(checklist.fields[1].status, "pass");
  assert.equal(checklist.fields[1].note, "Skimmer throat inspected.");
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

test("native repository persists checklists and posted field report records", async () => {
  const repository = new MemoryMediaRepository([skimmerPhoto, afterPhoto]);
  const checklist = await repository.saveChecklist(createLeakDetectionChecklist({
    tenantId: "aquatrace",
    jobId: "job_1",
    itemUpdates: [{ id: "item_6", status: "pass", note: "Before and after photos attached." }]
  }));
  const report = await repository.saveReport(createFieldReportRecord({
    tenantId: "aquatrace",
    jobId: "job_1",
    title: "Leak detection field report",
    findings: ["Skimmer throat leak observed."],
    mediaIds: [skimmerPhoto.id, afterPhoto.id],
    checklistId: checklist.id,
    status: "posted"
  }));
  const storedChecklist = await repository.getChecklist("aquatrace", checklist.id);
  const storedReport = await repository.getReport("aquatrace", report.id);
  assert.equal(storedChecklist?.fields[5].status, "pass");
  assert.equal(storedReport?.status, "posted");
  assert.equal(storedReport?.postedAt, storedReport?.createdAt);
  assert.equal(storedReport?.pdfRef.endsWith(`${report.id}.pdf`), true);
});

test("NexCam read tool searches native media repository", async () => {
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

test("NexDocs accepts supported uploads, uses a 100 MB cap, and indexes PDF content for search", async () => {
  const { nexDocsService } = createNexDocsHarness();
  assert.equal(NEXDOCS_MAX_UPLOAD_BYTES, 100 * 1024 * 1024);
  const uploaded = await nexDocsService.uploadDocument({
    tenantId: tenant.id,
    clientId: "client_1",
    fileName: "scan-1.pdf",
    mimeType: "application/pdf",
    fileBase64: simplePdfBuffer("Pool permit for Deborah Justice and her access notes.").toString("base64"),
    label: "Client upload one",
    source: "staff_upload"
  });
  const library = await nexDocsService.listClientLibrary({
    tenantId: tenant.id,
    clientId: "client_1",
    viewer: "staff",
    q: "permit"
  });
  assert.ok(library.searchResults.some((hit) => hit.entry.id === uploaded.id));
  await assert.rejects(
    () => nexDocsService.uploadDocument({
      tenantId: tenant.id,
      clientId: "client_1",
      fileName: "malware.exe",
      mimeType: "application/x-msdownload",
      fileBase64: Buffer.from("bad").toString("base64"),
      source: "staff_upload"
    }),
    (error) => {
      assert.ok(error instanceof RailError);
      assert.equal(error.status, 415);
      return true;
    }
  );
});

test("NexDocs validates tenant-owned client, property, job, and visit links before persisting searchable metadata", async () => {
  const { nexDocsService } = createNexDocsHarness();
  const input = {
    tenantId: tenant.id, clientId: "client_1", fileName: "visit-notes.txt", mimeType: "text/plain",
    fileBase64: Buffer.from("Skimmer notes", "utf8").toString("base64"), source: "staff_upload"
  };
  const linked = await nexDocsService.uploadDocument({ ...input, jobId: "job_1", visitId: "visit_1" });
  assert.equal(linked.propertyId, "property_1");
  assert.equal(linked.jobId, "job_1");
  assert.equal(linked.visitId, "visit_1");
  await assert.rejects(() => nexDocsService.uploadDocument({ ...input, propertyId: "property_2" }), /property does not belong/i);
  await assert.rejects(() => nexDocsService.uploadDocument({ ...input, jobId: "job_2" }), /job does not belong/i);
  await assert.rejects(() => nexDocsService.uploadDocument({ ...input, jobId: "job_1", visitId: "missing_visit" }), /visit .* not found/i);
});

test("NexDocs OCR blocks image OCR before estimated spend exceeds the cap", async () => {
  let providerCalled = false;
  const { nexDocsService, usageLog } = createNexDocsHarness({
    ocrFetch: async () => {
      providerCalled = true;
      throw new Error("OCR provider should not run when the budget gate blocks first.");
    }
  });
  const uploaded = await nexDocsService.uploadDocument({
    tenantId: tenant.id,
    clientId: "client_1",
    fileName: "permit-photo.png",
    mimeType: "image/png",
    fileBase64: Buffer.from("fake-image-bytes").toString("base64"),
    label: "Permit snapshot",
    source: "staff_upload"
  }, {
    ANTHROPIC_API_KEY: "test-key",
    NEXDOCS_OCR_ENABLED: "true",
    NEXDOCS_OCR_BUDGET_CAP_USD: "0.01"
  });
  assert.equal(providerCalled, false);
  assert.equal(uploaded.searchText ?? "", "");
  assert.equal(usageLog.records.length, 1);
  assert.equal(usageLog.records[0].taskType, "nexdocs_ocr");
  assert.equal(usageLog.records[0].ok, false);
  assert.equal(usageLog.records[0].estimatedCostUsd, 0.018);
  assert.match(usageLog.records[0].errorSummary, /blocked before provider call/i);
});

test("NexDocs OCR logs usage and searchable text when image OCR runs inside cap", async () => {
  const { nexDocsService, usageLog } = createNexDocsHarness({
    ocrFetch: async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          content: [{ type: "text", text: "Pool permit gate code 4421 and pet note dog on site." }],
          usage: { input_tokens: 100, output_tokens: 20 }
        });
      }
    })
  });
  const uploaded = await nexDocsService.uploadDocument({
    tenantId: tenant.id,
    clientId: "client_1",
    fileName: "permit-photo.png",
    mimeType: "image/png",
    fileBase64: Buffer.from("fake-image-bytes").toString("base64"),
    label: "Permit snapshot",
    source: "staff_upload"
  }, {
    ANTHROPIC_API_KEY: "test-key",
    NEXDOCS_OCR_ENABLED: "true",
    NEXDOCS_OCR_BUDGET_CAP_USD: "5"
  });
  assert.match(uploaded.searchText ?? "", /gate code 4421/i);
  assert.equal(usageLog.records.length, 1);
  assert.equal(usageLog.records[0].taskType, "nexdocs_ocr");
  assert.equal(usageLog.records[0].ok, true);
  assert.equal(usageLog.records[0].usage.totalTokens, 120);
  assert.equal(usageLog.records[0].estimatedCostUsd, 0.0006);
});

test("NexDocs keeps a flat folder model and moves each document into only one folder at a time", async () => {
  const { nexDocsService } = createNexDocsHarness();
  const permits = await nexDocsService.createFolder({
    tenantId: tenant.id,
    clientId: "client_1",
    label: "Permit packet",
    createdBy: "owner_1"
  });
  const blueprints = await nexDocsService.createFolder({
    tenantId: tenant.id,
    clientId: "client_1",
    label: "Blueprint packet",
    createdBy: "owner_1"
  });
  const uploaded = await nexDocsService.uploadDocument({
    tenantId: tenant.id,
    clientId: "client_1",
    folderId: permits.id,
    fileName: "pool-plan.txt",
    mimeType: "text/plain",
    fileBase64: Buffer.from("Pool permit staging document.", "utf8").toString("base64"),
    source: "staff_upload"
  });
  await nexDocsService.updateUploadedDocument({
    tenantId: tenant.id,
    clientId: "client_1",
    documentId: uploaded.id,
    folderId: blueprints.id
  });
  const library = await nexDocsService.listClientLibrary({
    tenantId: tenant.id,
    clientId: "client_1",
    viewer: "staff"
  });
  assert.equal(library.folders.find((entry) => entry.folder.id === permits.id)?.documents.length, 0);
  assert.equal(library.folders.find((entry) => entry.folder.id === blueprints.id)?.documents.map((entry) => entry.id).includes(uploaded.id), true);
});

test("NexDocs unified search returns uploaded docs, office records, and NexCam hits together", async () => {
  const { nexDocsService } = createNexDocsHarness();
  await nexDocsService.uploadDocument({
    tenantId: tenant.id,
    clientId: "client_1",
    fileName: "scan-2.pdf",
    mimeType: "application/pdf",
    fileBase64: simplePdfBuffer("Pool permit approval packet for Deborah Justice.").toString("base64"),
    label: "Uploaded permit packet",
    source: "staff_upload"
  });
  const library = await nexDocsService.listClientLibrary({
    tenantId: tenant.id,
    clientId: "client_1",
    viewer: "staff",
    q: "permit"
  });
  const sections = new Set(library.searchResults.map((hit) => hit.entry.section));
  assert.equal(sections.has("folder"), true);
  assert.equal(sections.has("office_records"), true);
  assert.equal(sections.has("nexcam"), true);
});

test("NexDocs technician fence stays upload-only for destructive management actions", () => {
  const technician = {
    tenantId: tenant.id,
    tenantUserId: "tech_1",
    role: "TECHNICIAN",
    accessKind: "internal"
  };
  assert.doesNotThrow(() => assertAccessRole(technician, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], "listNexDocsLibrary"));
  assert.throws(() => assertAccessRole(technician, ["OWNER", "OFFICE_ADMIN"], "deleteNexDocsFolder"), /cannot perform that action/i);
  assert.deepEqual({
    canUpload: true,
    canManageFolders: technician.role !== "TECHNICIAN",
    canDeleteDocuments: technician.role !== "TECHNICIAN",
    canToggleVisibility: technician.role !== "TECHNICIAN"
  }, {
    canUpload: true,
    canManageFolders: false,
    canDeleteDocuments: false,
    canToggleVisibility: false
  });
});
