import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalQueueService, InMemoryApprovalQueueRepository, mediaSchema } from "@nexteam/core";
import { MemoryNativeCrmRepository } from "@nexteam/providers";
import { createApprovalNexiTools } from "../dist/approval/nexiTools.js";
import { FieldDocsService, createDraftTemplate } from "../dist/fielddocs/fieldDocsService.js";
import { FieldDocsApprovalExecutor } from "../dist/fielddocs/approvalExecutor.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { NexDocsService } from "../dist/fielddocs/nexDocsService.js";
import { createFieldDocsTools } from "../dist/fielddocs/nexiTools.js";
import { runExplicitLocalToolLoop } from "../dist/nexi/nexiService.js";

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

function seedCrm() {
  return new MemoryNativeCrmRepository({
    clients: [{
      id: "client_1",
      tenantId: tenant.id,
      name: "Deborah Justice",
      company: "Justice Pools",
      emails: ["deborah@example.test"],
      phones: ["8645551212"],
      tags: [],
      consent: { email: true, sms: true }
    }],
    properties: [{
      id: "property_1",
      tenantId: tenant.id,
      clientId: "client_1",
      address: { street1: "101 Main St", city: "Seneca", province: "SC", postalCode: "29678", country: "US" },
      assets: []
    }],
    jobs: [{
      id: "job_1",
      tenantId: tenant.id,
      clientId: "client_1",
      propertyId: "property_1",
      status: "Unscheduled",
      title: "Leak detection",
      lineItems: [],
      totals: { subtotal: 0, tax: 0, total: 0 }
    }]
  });
}

function seedMedia() {
  return [
    mediaSchema.parse({
      id: "media_1",
      tenantId: tenant.id,
      jobId: "job_1",
      visitId: "visit_1",
      propertyId: "property_1",
      type: "photo",
      storageRef: "native://tenants/aquatrace/media/media_1/before.jpg",
      aiTags: ["before", "skimmer"],
      aiCaption: "Before repair skimmer photo.",
      exif: { ts: "2026-07-18T13:00:00.000Z" }
    }),
    mediaSchema.parse({
      id: "media_2",
      tenantId: tenant.id,
      jobId: "job_1",
      visitId: "visit_1",
      propertyId: "property_1",
      type: "photo",
      storageRef: "native://tenants/aquatrace/media/media_2/after.jpg",
      aiTags: ["after", "skimmer"],
      aiCaption: "After repair skimmer photo.",
      exif: { ts: "2026-07-18T14:00:00.000Z" }
    })
  ];
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

function createNexDocsService(mediaRepository, crmRepository) {
  return new NexDocsService({
    mediaRepository,
    crmRepository,
    storeUpload: async ({ documentId, fileName, fileBase64 }) => {
      const bytes = Buffer.from(fileBase64, "base64");
      return {
        storageRef: `gs://test-bucket/tenants/aquatrace/nexdocs/${documentId}/${fileName}`,
        sizeBytes: bytes.byteLength,
        bytes
      };
    }
  });
}

function createToolingTemplate() {
  return createDraftTemplate({
    tenantId: tenant.id,
    title: "NexCam tooling proof",
    slug: "nexcam-tooling-proof",
    appliesTo: "visit",
    fields: [
      {
        id: "item_17",
        label: "Pool total gallons",
        section: "Property",
        type: "measurement",
        memory: "property",
        required: true,
        unit: "gallons"
      },
      {
        id: "item_24",
        label: "Leak result",
        section: "Visit",
        type: "pass_fail",
        memory: "visit",
        required: true
      },
      {
        id: "item_31",
        label: "Report review complete",
        section: "Visit",
        type: "pass_fail",
        memory: "visit",
        required: false
      }
    ]
  });
}

test("fielddocs Nexi tools expose property history and recent photos", async () => {
  const crmRepository = seedCrm();
  const mediaRepository = new MemoryMediaRepository(seedMedia());
  const fieldDocsService = new FieldDocsService({ mediaRepository, crmRepository });
  const template = createToolingTemplate();
  await fieldDocsService.upsertTemplate(template);
  const checklist = await fieldDocsService.createChecklist({
    tenantId: tenant.id,
    templateId: template.id,
    jobId: "job_1",
    visitId: "visit_1"
  });
  await fieldDocsService.updateChecklist({
    tenantId: tenant.id,
    checklistId: checklist.id,
    complete: true,
    updates: [
      { fieldId: "item_17", numberValue: 18500 },
      { fieldId: "item_24", status: "pass", note: "Visit completed and pool loss confirmed." }
    ]
  });

  const tools = createFieldDocsTools({ mediaRepository, crmRepository, fieldDocsService });
  const historyTool = tools.find((tool) => tool.name === "getPropertyHistory");
  const recentTool = tools.find((tool) => tool.name === "listRecentPhotos");
  assert.ok(historyTool);
  assert.ok(recentTool);

  const history = await historyTool.handler(tenant, { propertyId: "property_1", fieldId: "item_17" });
  assert.equal(history.result.history.length, 1);
  assert.equal(history.result.history[0].fields.find((field) => field.fieldId === "item_17")?.numberValue, 18500);

  const recent = await recentTool.handler(tenant, { jobId: "job_1", visitId: "visit_1", limit: 5 });
  assert.equal(recent.result.media.length, 2);
  assert.equal(recent.result.media[0].id, "media_2");
});

test("fielddocs Nexi tools generate and fetch visit reports", async () => {
  const crmRepository = seedCrm();
  const mediaRepository = new MemoryMediaRepository(seedMedia());
  const fieldDocsService = new FieldDocsService({ mediaRepository, crmRepository });
  const template = createToolingTemplate();
  await fieldDocsService.upsertTemplate(template);
  const checklist = await fieldDocsService.createChecklist({
    tenantId: tenant.id,
    templateId: template.id,
    jobId: "job_1",
    visitId: "visit_1"
  });
  await fieldDocsService.updateChecklist({
    tenantId: tenant.id,
    checklistId: checklist.id,
    complete: true,
    updates: [
      { fieldId: "item_17", numberValue: 18500 },
      { fieldId: "item_24", status: "fail", note: "Skimmer throat crack confirmed." },
      { fieldId: "item_31", status: "pass", note: "Report review complete." }
    ]
  });

  const tools = createFieldDocsTools({ mediaRepository, crmRepository, fieldDocsService });
  const generateTool = tools.find((tool) => tool.name === "generateVisitReport");
  const getTool = tools.find((tool) => tool.name === "getVisitReport");
  assert.ok(generateTool);
  assert.ok(getTool);

  const generated = await generateTool.handler(tenant, {
    jobId: "job_1",
    propertyId: "property_1",
    visitId: "visit_1",
    checklistId: checklist.id,
    title: "Leak detection visit report"
  });
  assert.equal(generated.result.report.visitId, "visit_1");
  assert.equal(generated.result.report.propertyId, "property_1");
  assert.equal(generated.result.report.mediaIds.length, 2);

  const fetched = await getTool.handler(tenant, { visitId: "visit_1", jobId: "job_1" });
  assert.equal(fetched.result.report?.id, generated.result.report.id);
});

test("local Nexi chat routes NexCam photo search, property history, and report generation", async () => {
  const crmRepository = seedCrm();
  const mediaRepository = new MemoryMediaRepository(seedMedia());
  const fieldDocsService = new FieldDocsService({ mediaRepository, crmRepository });
  const template = createToolingTemplate();
  await fieldDocsService.upsertTemplate(template);
  const checklist = await fieldDocsService.createChecklist({
    tenantId: tenant.id,
    templateId: template.id,
    jobId: "job_1",
    visitId: "visit_1"
  });
  await fieldDocsService.updateChecklist({
    tenantId: tenant.id,
    checklistId: checklist.id,
    complete: true,
    updates: [
      { fieldId: "item_17", numberValue: 18500 },
      { fieldId: "item_24", status: "fail", note: "Skimmer throat crack confirmed." }
    ]
  });

  const tools = createFieldDocsTools({ mediaRepository, crmRepository, fieldDocsService });

  const photoTurn = await runExplicitLocalToolLoop({
    tenant,
    system: "Use tools.",
    messages: [{ role: "user", content: "search photos for skimmer" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(photoTurn.toolRuns[0].name, "photoSearch");
  assert.match(photoTurn.answer, /NexCam photo hit/i);

  const historyTurn = await runExplicitLocalToolLoop({
    tenant,
    system: "Use tools.",
    messages: [{ role: "user", content: "what was the pool total gallons last time at property_1" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(historyTurn.toolRuns[0].name, "getPropertyHistory");
  assert.match(historyTurn.answer, /18500/);

  const reportTurn = await runExplicitLocalToolLoop({
    tenant,
    system: "Use tools.",
    messages: [{ role: "user", content: "generate a visit report for job_1 visit_1" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(reportTurn.toolRuns[0].name, "generateVisitReport");
  assert.match(reportTurn.answer, /NexCam visit report/i);
  assert.match(reportTurn.answer, /\/api\/fielddocs\/reports\//i);
});

test("NexDocs tools search unified content and list client folders", async () => {
  const crmRepository = seedCrm();
  const mediaRepository = new MemoryMediaRepository([
    ...seedMedia(),
    mediaSchema.parse({
      id: "media_permit_1",
      tenantId: tenant.id,
      clientId: "client_1",
      jobId: "job_1",
      propertyId: "property_1",
      type: "photo",
      storageRef: "native://tenants/aquatrace/media/media_permit_1/permit.jpg",
      aiTags: ["permit"],
      aiCaption: "Permit plate photo by the equipment pad.",
      exif: { ts: "2026-07-18T15:10:00.000Z" }
    })
  ]);
  const nexDocsService = createNexDocsService(mediaRepository, crmRepository);
  const folder = await nexDocsService.createFolder({
    tenantId: tenant.id,
    clientId: "client_1",
    label: "Permit packet",
    createdBy: "owner_1"
  });
  await nexDocsService.uploadDocument({
    tenantId: tenant.id,
    clientId: "client_1",
    folderId: folder.id,
    label: "Client permit upload",
    fileName: "scan-1.pdf",
    mimeType: "application/pdf",
    fileBase64: simplePdfBuffer("Pool permit for Deborah Justice.").toString("base64"),
    source: "staff_upload",
    uploadedBy: "owner_1"
  });

  const tools = createFieldDocsTools({ mediaRepository, crmRepository, nexDocsService });
  const searchTool = tools.find((tool) => tool.name === "searchDocuments");
  const foldersTool = tools.find((tool) => tool.name === "listClientFolders");
  assert.ok(searchTool);
  assert.ok(foldersTool);

  const search = await searchTool.handler(tenant, { clientQuery: "Deborah Justice", query: "permit", limit: 6 });
  assert.ok(search.result.hits.some((hit) => hit.entry.section === "folder"));
  assert.ok(search.result.hits.some((hit) => hit.entry.section === "nexcam"));

  const folders = await foldersTool.handler(tenant, { clientQuery: "Deborah Justice" });
  assert.equal(folders.result.folders.length, 1);
  assert.equal(folders.result.folders[0].label, "Permit packet");
});

test("local Nexi chat can search documents, queue a folder, approve it, queue an upload, and approve it", async () => {
  const crmRepository = seedCrm();
  const mediaRepository = new MemoryMediaRepository([
    ...seedMedia(),
    mediaSchema.parse({
      id: "media_permit_2",
      tenantId: tenant.id,
      clientId: "client_1",
      jobId: "job_1",
      propertyId: "property_1",
      type: "photo",
      storageRef: "native://tenants/aquatrace/media/media_permit_2/permit.jpg",
      aiTags: ["permit"],
      aiCaption: "Pool permit photo already stored on site.",
      exif: { ts: "2026-07-18T15:12:00.000Z" }
    })
  ]);
  const nexDocsService = createNexDocsService(mediaRepository, crmRepository);
  await nexDocsService.uploadDocument({
    tenantId: tenant.id,
    clientId: "client_1",
    fileName: "existing-permit.pdf",
    mimeType: "application/pdf",
    fileBase64: simplePdfBuffer("Pool permit for Deborah Justice already lives in the client rail.").toString("base64"),
    label: "Existing permit",
    source: "staff_upload",
    uploadedBy: "owner_1"
  });
  const approvalQueueRepository = new InMemoryApprovalQueueRepository();
  const approvalQueue = new ApprovalQueueService(
    approvalQueueRepository,
    new FieldDocsApprovalExecutor(nexDocsService)
  );
  const tools = [
    ...createFieldDocsTools({
      mediaRepository,
      crmRepository,
      nexDocsService,
      approvalQueue,
      viewerRole: "OWNER",
      viewerUserId: "owner_1"
    }),
    ...createApprovalNexiTools({
      approvalQueue,
      actorId: "owner_1",
      actorRole: "OWNER"
    })
  ];

  const searchTurn = await runExplicitLocalToolLoop({
    tenant,
    system: "Use tools.",
    messages: [{ role: "user", content: "find the pool permit for Deborah Justice" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(searchTurn.toolRuns[0].name, "searchDocuments");
  assert.match(searchTurn.answer, /document hit/i);

  const createFolderTurn = await runExplicitLocalToolLoop({
    tenant,
    system: "Use tools.",
    messages: [{ role: "user", content: "create a folder called Permit packet for Deborah Justice" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(createFolderTurn.toolRuns[0].name, "createFolder");
  assert.match(createFolderTurn.answer, /Approve this\? yes \/ no\./i);
  assert.doesNotMatch(createFolderTurn.answer, /make changes/i);

  const approveFolderTurn = await runExplicitLocalToolLoop({
    tenant,
    system: "Use tools.",
    messages: [
      { role: "user", content: "create a folder called Permit packet for Deborah Justice" },
      { role: "assistant", content: createFolderTurn.answer },
      { role: "user", content: "yes" }
    ],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(approveFolderTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approveFolderTurn.answer, /Approved and created the Permit packet folder\./i);

  const uploadTurn = await runExplicitLocalToolLoop({
    tenant,
    system: "Use tools.",
    messages: [{
      role: "user",
      content: "upload permit.pdf into Permit packet folder for Deborah Justice label permit packet text Pool permit for Deborah Justice with service address"
    }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(uploadTurn.toolRuns[0].name, "uploadDocumentToFolder");
  assert.match(uploadTurn.answer, /Approve this\? yes \/ no\./i);
  assert.doesNotMatch(uploadTurn.answer, /make changes/i);
  const [pendingUpload] = await approvalQueueRepository.listPending(tenant.id);
  assert.equal(pendingUpload.execute.op, "uploadNexDocsDocument");
  assert.equal(pendingUpload.execute.args.label, "permit packet");

  const approveUploadTurn = await runExplicitLocalToolLoop({
    tenant,
    system: "Use tools.",
    messages: [
      {
        role: "user",
        content: "upload permit.pdf into Permit packet folder for Deborah Justice label permit packet text Pool permit for Deborah Justice with service address"
      },
      { role: "assistant", content: uploadTurn.answer },
      { role: "user", content: "yes" }
    ],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(approveUploadTurn.toolRuns[0].name, "approvePendingApproval");
  assert.match(approveUploadTurn.answer, /Approved and uploaded .* into NexDocs/i);

  const library = await nexDocsService.listClientLibrary({
    tenantId: tenant.id,
    clientId: "client_1",
    viewer: "staff",
    q: "permit"
  });
  assert.ok(library.folders.find((entry) => entry.folder.label === "Permit packet")?.documents.some((entry) => entry.label === "permit packet"));
});
