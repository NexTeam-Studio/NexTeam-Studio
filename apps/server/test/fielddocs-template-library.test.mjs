import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mediaSchema } from "@nexteam/core";
import { MemoryNativeCrmRepository } from "@nexteam/providers";
import { LEAK_DETECTION_TEMPLATE_ID } from "../dist/fielddocs/checklists.js";
import { createDraftTemplate, FieldDocsService } from "../dist/fielddocs/fieldDocsService.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { createFieldReportRecord } from "../dist/fielddocs/reportService.js";
import { registerFieldDocsRoutes } from "../dist/fielddocs/routes.js";

const tenantId = "aquatrace";

function seedRepository() {
  return new MemoryNativeCrmRepository({
    properties: [
      {
        id: "property_1",
        tenantId,
        clientId: "client_1",
        address: { street1: "101 Main St", city: "Seneca", province: "SC", postalCode: "29678", country: "US" },
        assets: []
      },
      {
        id: "property_2",
        tenantId,
        clientId: "client_1",
        address: { street1: "202 Lake St", city: "Seneca", province: "SC", postalCode: "29678", country: "US" },
        assets: []
      }
    ],
    jobs: [
      {
        id: "job_1",
        tenantId,
        clientId: "client_1",
        propertyId: "property_1",
        status: "Unscheduled",
        title: "Leak detection - primary property",
        lineItems: [],
        totals: { subtotal: 0, tax: 0, total: 0 }
      },
      {
        id: "job_2",
        tenantId,
        clientId: "client_1",
        propertyId: "property_2",
        status: "Unscheduled",
        title: "Leak detection - second property",
        lineItems: [],
        totals: { subtotal: 0, tax: 0, total: 0 }
      }
    ]
  });
}

test("fielddocs template library exposes seeded leak template and accepts custom templates", async () => {
  const crmRepository = seedRepository();
  const mediaRepository = new MemoryMediaRepository();
  const service = new FieldDocsService({ mediaRepository, crmRepository });

  const seeded = await service.listTemplates(tenantId);
  assert.equal(seeded.some((template) => template.id === LEAK_DETECTION_TEMPLATE_ID), true);

  const customTemplate = createDraftTemplate({
    tenantId,
    title: "Pressure Test Follow-Up",
    slug: "pressure-test-follow-up",
    appliesTo: "visit",
    fields: [
      {
        id: "pressure_drop",
        label: "Pressure drop after 15 minutes",
        section: "Verification",
        type: "measurement",
        memory: "visit",
        required: true,
        unit: "psi"
      },
      {
        id: "equipment_notes",
        label: "Equipment notes that persist",
        section: "Equipment",
        type: "free_text",
        memory: "property",
        required: true
      }
    ]
  });
  await service.upsertTemplate(customTemplate);

  const library = await service.listTemplates(tenantId);
  const saved = library.find((template) => template.id === customTemplate.id);
  assert.ok(saved);
  assert.equal(saved?.fields[0].type, "measurement");
  assert.equal(saved?.fields[1].memory, "property");
});

test("fielddocs persists property-memory fields on the property and keeps visit fields blank on the next visit", async () => {
  const crmRepository = seedRepository();
  const mediaRepository = new MemoryMediaRepository();
  const service = new FieldDocsService({ mediaRepository, crmRepository });
  const customTemplate = createDraftTemplate({
    tenantId,
    title: "Property persistence proof",
    slug: "property-persistence-proof",
    appliesTo: "visit",
    fields: [
      {
        id: "item_7",
        label: "Persistent access notes",
        section: "Equipment",
        type: "free_text",
        memory: "property",
        required: true
      },
      {
        id: "item_12",
        label: "Pool type",
        section: "Equipment",
        type: "multi_select",
        memory: "property",
        required: true,
        options: ["Residential", "Commercial", "Inground", "Above-ground"]
      },
      {
        id: "item_17",
        label: "Pool gallons",
        section: "Equipment",
        type: "measurement",
        memory: "property",
        required: true,
        unit: "gallons"
      },
      {
        id: "item_1",
        label: "Visit-only summary",
        section: "Visit",
        type: "free_text",
        memory: "visit",
        required: true
      },
      {
        id: "item_24",
        label: "Visit-only result",
        section: "Visit",
        type: "pass_fail",
        memory: "visit",
        required: true
      }
    ]
  });
  await service.upsertTemplate(customTemplate);

  const firstChecklist = await service.createChecklist({
    tenantId,
    templateId: customTemplate.id,
    jobId: "job_1",
    visitId: "visit_1"
  });

  const completed = await service.updateChecklist({
    tenantId,
    checklistId: firstChecklist.id,
    complete: true,
    updates: [
      { fieldId: "item_7", note: "Cedar gate and pump room keypad stay the same every visit." },
      { fieldId: "item_12", multiValue: ["Residential", "Inground"] },
      { fieldId: "item_17", numberValue: 18500 },
      { fieldId: "item_1", note: "Visit one summary should not carry forward." },
      { fieldId: "item_24", status: "fail", note: "Skimmer throat crack confirmed." }
    ]
  });

  assert.equal(completed.status, "completed");

  const updatedProperty = (await crmRepository.listProperties(tenantId)).find((property) => property.id === "property_1");
  assert.ok(updatedProperty?.fieldDocs?.persistentChecklistValues);
  assert.equal(updatedProperty?.fieldDocs?.persistentChecklistValues?.[`${customTemplate.id}:item_7`]?.note, "Cedar gate and pump room keypad stay the same every visit.");
  assert.deepEqual(updatedProperty?.fieldDocs?.persistentChecklistValues?.[`${customTemplate.id}:item_12`]?.multiValue, ["Residential", "Inground"]);
  assert.equal(updatedProperty?.fieldDocs?.persistentChecklistValues?.[`${customTemplate.id}:item_17`]?.numberValue, 18500);
  assert.equal(updatedProperty?.fieldDocs?.persistentChecklistValues?.[`${customTemplate.id}:item_24`], undefined);

  const nextVisitSameProperty = await service.createChecklist({
    tenantId,
    templateId: customTemplate.id,
    jobId: "job_1",
    visitId: "visit_2"
  });
  assert.equal(nextVisitSameProperty.propertyId, "property_1");
  assert.equal(nextVisitSameProperty.fields.find((field) => field.fieldId === "item_7")?.note, "Cedar gate and pump room keypad stay the same every visit.");
  assert.deepEqual(nextVisitSameProperty.fields.find((field) => field.fieldId === "item_12")?.multiValue, ["Residential", "Inground"]);
  assert.equal(nextVisitSameProperty.fields.find((field) => field.fieldId === "item_17")?.numberValue, 18500);
  assert.equal(nextVisitSameProperty.fields.find((field) => field.fieldId === "item_1")?.note, undefined);
  assert.equal(nextVisitSameProperty.fields.find((field) => field.fieldId === "item_24")?.status, "pending");

  const otherPropertyVisit = await service.createChecklist({
    tenantId,
    templateId: customTemplate.id,
    jobId: "job_2",
    visitId: "visit_3"
  });
  assert.equal(otherPropertyVisit.propertyId, "property_2");
  assert.equal(otherPropertyVisit.fields.find((field) => field.fieldId === "item_7")?.note, undefined);
  assert.equal(otherPropertyVisit.fields.find((field) => field.fieldId === "item_17")?.numberValue, undefined);

  const history = await service.getPropertyHistory({
    tenantId,
    propertyId: "property_1",
    fieldId: "item_17"
  });
  assert.equal(history.length, 1);
  assert.equal(history[0]?.id, completed.id);
});

test("fielddocs media and report routes filter by client, visit, and date range", async () => {
  const crmRepository = seedRepository();
  const mediaRepository = new MemoryMediaRepository(
    [
      mediaSchema.parse({
        id: "media_property_1_visit_1",
        tenantId,
        jobId: "job_1",
        visitId: "visit_1",
        propertyId: "property_1",
        type: "photo",
        storageRef: "native://tenants/aquatrace/media/media_property_1_visit_1/skimmer-before.jpg",
        aiTags: ["before", "skimmer"],
        aiCaption: "Skimmer throat before repair.",
        exif: { ts: "2026-07-18T14:00:00.000Z" }
      }),
      mediaSchema.parse({
        id: "media_property_1_visit_2",
        tenantId,
        jobId: "job_1",
        visitId: "visit_2",
        propertyId: "property_1",
        type: "photo",
        storageRef: "native://tenants/aquatrace/media/media_property_1_visit_2/skimmer-after.jpg",
        aiTags: ["after", "skimmer"],
        aiCaption: "Skimmer throat after repair.",
        exif: { ts: "2026-07-19T14:00:00.000Z" }
      }),
      mediaSchema.parse({
        id: "media_property_2_visit_3",
        tenantId,
        jobId: "job_2",
        visitId: "visit_3",
        propertyId: "property_2",
        type: "photo",
        storageRef: "native://tenants/aquatrace/media/media_property_2_visit_3/pad.jpg",
        aiTags: ["equipment"],
        aiCaption: "Equipment pad photo.",
        exif: { ts: "2026-07-20T14:00:00.000Z" }
      })
    ],
    [],
    [
      {
        ...createFieldReportRecord({
          tenantId,
          jobId: "job_1",
          propertyId: "property_1",
          visitId: "visit_1",
          title: "Visit one field report",
          findings: ["Initial leak evidence recorded."],
          mediaIds: ["media_property_1_visit_1"],
          status: "posted"
        }),
        createdAt: "2026-07-18T15:00:00.000Z",
        postedAt: "2026-07-18T15:00:00.000Z"
      },
      {
        ...createFieldReportRecord({
          tenantId,
          jobId: "job_1",
          propertyId: "property_1",
          visitId: "visit_2",
          title: "Visit two field report",
          findings: ["Repair verified."],
          mediaIds: ["media_property_1_visit_2"],
          status: "posted"
        }),
        createdAt: "2026-07-19T15:00:00.000Z",
        postedAt: "2026-07-19T15:00:00.000Z"
      },
      {
        ...createFieldReportRecord({
          tenantId,
          jobId: "job_2",
          propertyId: "property_2",
          visitId: "visit_3",
          title: "Other property field report",
          findings: ["Second property inspection."],
          mediaIds: ["media_property_2_visit_3"],
          status: "posted"
        }),
        createdAt: "2026-07-20T15:00:00.000Z",
        postedAt: "2026-07-20T15:00:00.000Z"
      }
    ]
  );

  const app = express();
  app.use(express.json());
  registerFieldDocsRoutes(app, {
    repository: mediaRepository,
    crmRepository,
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "false", TENANT_ID: tenantId }
  });
  const server = app.listen(0);
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = address && typeof address === "object" ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    const clientMedia = await fetch(`${base}/api/fielddocs/media?tenantId=${tenantId}&clientId=client_1&limit=10`).then((response) => response.json());
    assert.equal(clientMedia.ok, true);
    assert.equal(clientMedia.media.length, 3);
    assert.equal(clientMedia.media[0].id, "media_property_2_visit_3");

    const visitMedia = await fetch(`${base}/api/fielddocs/media?tenantId=${tenantId}&jobId=job_1&visitId=visit_1`).then((response) => response.json());
    assert.equal(visitMedia.ok, true);
    assert.deepEqual(visitMedia.media.map((record) => record.id), ["media_property_1_visit_1"]);

    const dateWindowMedia = await fetch(`${base}/api/fielddocs/media?tenantId=${tenantId}&dateFrom=2026-07-19T00:00:00.000Z&dateTo=2026-07-19T23:59:59.999Z`).then((response) => response.json());
    assert.equal(dateWindowMedia.ok, true);
    assert.deepEqual(dateWindowMedia.media.map((record) => record.id), ["media_property_1_visit_2"]);

    const searchMedia = await fetch(`${base}/api/fielddocs/search?tenantId=${tenantId}&q=${encodeURIComponent("skimmer before")}&limit=5`).then((response) => response.json());
    assert.equal(searchMedia.ok, true);
    assert.equal(searchMedia.hits[0].id, "media_property_1_visit_1");
    assert.deepEqual(searchMedia.hits[0].matched, ["skimmer", "before"]);

    const clientReports = await fetch(`${base}/api/fielddocs/reports?tenantId=${tenantId}&clientId=client_1&limit=10`).then((response) => response.json());
    assert.equal(clientReports.ok, true);
    assert.equal(clientReports.reports.length, 3);

    const visitReports = await fetch(`${base}/api/fielddocs/reports?tenantId=${tenantId}&jobId=job_1&visitId=visit_2`).then((response) => response.json());
    assert.equal(visitReports.ok, true);
    assert.deepEqual(visitReports.reports.map((record) => record.title), ["Visit two field report"]);

    const dateWindowReports = await fetch(`${base}/api/fielddocs/reports?tenantId=${tenantId}&dateFrom=2026-07-19T00:00:00.000Z&dateTo=2026-07-19T23:59:59.999Z`).then((response) => response.json());
    assert.equal(dateWindowReports.ok, true);
    assert.deepEqual(dateWindowReports.reports.map((record) => record.title), ["Visit two field report"]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("fielddocs media review saves per-photo comments and markup paths", async () => {
  const crmRepository = seedRepository();
  const mediaRepository = new MemoryMediaRepository([
    mediaSchema.parse({
      id: "media_markup_1",
      tenantId,
      jobId: "job_1",
      visitId: "visit_1",
      propertyId: "property_1",
      type: "photo",
      storageRef: "native://tenants/aquatrace/media/media_markup_1/skimmer.jpg",
      aiTags: ["skimmer", "before"],
      aiCaption: "Skimmer throat before repair.",
      exif: { ts: "2026-07-18T16:00:00.000Z" }
    })
  ]);

  const app = express();
  app.use(express.json());
  registerFieldDocsRoutes(app, {
    repository: mediaRepository,
    crmRepository,
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "false", TENANT_ID: tenantId }
  });
  const server = app.listen(0);
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = address && typeof address === "object" ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    const updated = await fetch(`${base}/api/fielddocs/media/media_markup_1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        comment: "Skimmer crack marked at the throat seam.",
        annotations: [
          {
            kind: "path",
            color: "#106060",
            points: [
              { x: 0.12, y: 0.28 },
              { x: 0.34, y: 0.44 },
              { x: 0.52, y: 0.63 }
            ]
          }
        ]
      })
    }).then((response) => response.json());

    assert.equal(updated.ok, true);
    assert.equal(updated.media.comments.length, 1);
    assert.equal(updated.media.comments[0].text, "Skimmer crack marked at the throat seam.");
    assert.equal(updated.media.annotations.length, 1);
    assert.equal(updated.media.annotations[0].points.length, 3);

    const fetched = await fetch(`${base}/api/fielddocs/media/media_markup_1?tenantId=${tenantId}`).then((response) => response.json());
    assert.equal(fetched.ok, true);
    assert.equal(fetched.media.comments.length, 1);
    assert.equal(fetched.media.annotations.length, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("fielddocs checklist instances honor photo-required defaults, per-instance override, and section-level N/A", async () => {
  const crmRepository = seedRepository();
  const mediaRepository = new MemoryMediaRepository();
  const service = new FieldDocsService({ mediaRepository, crmRepository });

  const template = createDraftTemplate({
    tenantId,
    title: "Photo proof checklist",
    slug: "photo-proof-checklist",
    appliesTo: "visit",
    sections: [
      { id: "inspection", title: "Inspection", allowNa: true },
      { id: "closeout", title: "Closeout", allowNa: false }
    ],
    fields: [
      {
        id: "inspection_photo",
        label: "Proof photo",
        section: "Inspection",
        type: "photo_attachment",
        memory: "visit",
        required: true,
        photoRequiredDefault: true
      },
      {
        id: "closeout_note",
        label: "Closeout note",
        section: "Closeout",
        type: "free_text",
        memory: "visit",
        required: true
      }
    ]
  });
  await service.upsertTemplate(template);

  const checklist = await service.createChecklist({
    tenantId,
    templateId: template.id,
    jobId: "job_1",
    visitId: "visit_1"
  });
  assert.equal(checklist.fields.find((field) => field.fieldId === "inspection_photo")?.photoRequired, true);

  await assert.rejects(
    () => service.updateChecklist({
      tenantId,
      checklistId: checklist.id,
      complete: true,
      updates: [{ fieldId: "closeout_note", note: "Tried to finish without the photo." }]
    }),
    /photo/i
  );

  const overridden = await service.updateChecklist({
    tenantId,
    checklistId: checklist.id,
    complete: true,
    updates: [
      { fieldId: "inspection_photo", photoRequired: false },
      { fieldId: "closeout_note", note: "Photo requirement waived on this one checklist." }
    ]
  });
  assert.equal(overridden.status, "completed");
  assert.equal(overridden.fields.find((field) => field.fieldId === "inspection_photo")?.photoRequired, false);

  const secondChecklist = await service.createChecklist({
    tenantId,
    templateId: template.id,
    jobId: "job_1",
    visitId: "visit_2"
  });
  const notApplicable = await service.updateChecklist({
    tenantId,
    checklistId: secondChecklist.id,
    complete: true,
    updates: [{ fieldId: "closeout_note", note: "Inspection did not apply on this visit." }],
    sectionStateUpdates: [{ section: "Inspection", status: "not_applicable" }]
  });
  assert.equal(notApplicable.status, "completed");
  assert.equal(notApplicable.sectionStates.find((section) => section.section === "Inspection")?.status, "not_applicable");
});

test("fielddocs media review merges manual tags into search and supports tenant trash with restore", async () => {
  const crmRepository = seedRepository();
  const mediaRepository = new MemoryMediaRepository([
    mediaSchema.parse({
      id: "media_manual_tag_1",
      tenantId,
      jobId: "job_1",
      visitId: "visit_1",
      propertyId: "property_1",
      type: "photo",
      storageRef: "native://tenants/aquatrace/media/media_manual_tag_1/skimmer.jpg",
      aiTags: ["skimmer"],
      aiCaption: "Skimmer throat photo.",
      exif: { ts: "2026-07-18T17:00:00.000Z" }
    })
  ]);

  const app = express();
  app.use(express.json());
  registerFieldDocsRoutes(app, {
    repository: mediaRepository,
    crmRepository,
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "false", TENANT_ID: tenantId }
  });
  const server = app.listen(0);
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = address && typeof address === "object" ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    const updated = await fetch(`${base}/api/fielddocs/media/media_manual_tag_1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        manualTags: ["Urgent", "Deck leak"],
        hiddenFromClient: true
      })
    }).then((response) => response.json());

    assert.equal(updated.ok, true);
    assert.deepEqual(updated.media.manualTags, ["urgent", "deck leak"]);
    assert.equal(updated.media.hiddenFromClient, true);

    const search = await fetch(`${base}/api/fielddocs/search?tenantId=${tenantId}&q=${encodeURIComponent("deck leak")}&limit=5`)
      .then((response) => response.json());
    assert.equal(search.ok, true);
    assert.equal(search.hits[0].id, "media_manual_tag_1");
    assert.equal(search.hits[0].matched.includes("deck"), true);
    assert.equal(search.hits[0].matched.includes("leak"), true);

    const trashed = await fetch(`${base}/api/fielddocs/media/media_manual_tag_1/trash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId })
    }).then((response) => response.json());
    assert.equal(trashed.ok, true);
    assert.equal(Boolean(trashed.media.trashedAt), true);
    assert.equal(Boolean(trashed.media.purgeAfter), true);

    const defaultList = await fetch(`${base}/api/fielddocs/media?tenantId=${tenantId}`).then((response) => response.json());
    assert.equal(defaultList.ok, true);
    assert.equal(defaultList.media.length, 0);

    const trashedList = await fetch(`${base}/api/fielddocs/media?tenantId=${tenantId}&includeTrashed=true`).then((response) => response.json());
    assert.equal(trashedList.ok, true);
    assert.equal(trashedList.media.length, 1);
    assert.equal(Boolean(trashedList.media[0].trashedAt), true);

    const restored = await fetch(`${base}/api/fielddocs/media/media_manual_tag_1/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId })
    }).then((response) => response.json());
    assert.equal(restored.ok, true);
    assert.equal(restored.media.trashedAt, undefined);
    assert.equal(restored.media.purgeAfter, undefined);

    const restoredList = await fetch(`${base}/api/fielddocs/media?tenantId=${tenantId}`).then((response) => response.json());
    assert.equal(restoredList.ok, true);
    assert.equal(restoredList.media.length, 1);
    assert.equal(restoredList.media[0].id, "media_manual_tag_1");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("fielddocs bundles auto-attach checklist/report rails and report routes honor snippets, watermarking, and AI recap output", async () => {
  const crmRepository = seedRepository();
  const mediaRepository = new MemoryMediaRepository([
    mediaSchema.parse({
      id: "media_bundle_1",
      tenantId,
      jobId: "job_1",
      visitId: "visit_1",
      propertyId: "property_1",
      type: "photo",
      storageRef: "native://tenants/aquatrace/media/media_bundle_1/skimmer.jpg",
      aiTags: ["skimmer", "repair"],
      aiCaption: "Skimmer crack photo after dye test.",
      exif: { ts: "2026-07-18T18:00:00.000Z" }
    })
  ]);
  const service = new FieldDocsService({ mediaRepository, crmRepository });

  const checklistTemplate = createDraftTemplate({
    tenantId,
    title: "Bundle checklist",
    slug: "bundle-checklist",
    appliesTo: "job",
    fields: [{
      id: "bundle_note",
      label: "Bundle note",
      section: "Summary",
      type: "free_text",
      memory: "visit",
      required: true
    }]
  });
  await service.upsertTemplate(checklistTemplate);

  const reportTemplate = await service.upsertReportTemplate({
    id: "field_report_template_bundle_v1",
    tenantId,
    title: "Bundle report template",
    defaultReportTitle: "Bundle report",
    sections: [{ id: "summary", label: "Summary", defaultText: "Template default summary." }],
    watermarkByDefault: true,
    createdAt: "2026-07-18T18:05:00.000Z",
    updatedAt: "2026-07-18T18:05:00.000Z"
  });

  const snippet = await service.upsertTextSnippet({
    id: "fielddocs_snippet_bundle_1",
    tenantId,
    label: "Repair recommendation",
    bodyText: "Saved snippet: repair the skimmer throat and pressure test after cure.",
    createdAt: "2026-07-18T18:06:00.000Z",
    updatedAt: "2026-07-18T18:06:00.000Z"
  });

  await service.upsertBundle({
    id: "fielddocs_bundle_bundle_service",
    tenantId,
    label: "Bundle service",
    jobTypeKey: "bundle-service",
    checklistTemplateId: checklistTemplate.id,
    reportTemplateId: reportTemplate.id,
    active: true,
    createdAt: "2026-07-18T18:07:00.000Z",
    updatedAt: "2026-07-18T18:07:00.000Z"
  });

  const attached = await service.maybeAttachBundleForJob({
    tenantId,
    job: {
      id: "job_bundle_attach",
      tenantId,
      clientId: "client_1",
      propertyId: "property_1",
      status: "Unscheduled",
      title: "Bundle service",
      lineItems: [],
      totals: { subtotal: 0, tax: 0, total: 0 }
    }
  });

  assert.ok(attached);
  assert.equal(attached?.checklist.templateId, checklistTemplate.id);
  assert.equal(attached?.report.templateId, reportTemplate.id);
  assert.equal(attached?.report.watermarkEnabled, true);

  const app = express();
  app.use(express.json());
  registerFieldDocsRoutes(app, {
    repository: mediaRepository,
    crmRepository,
    platformRepository: {
      async getTenantBranding() {
        return {
          displayName: "Aquatrace",
          logo: { url: "https://cdn.example.test/aquatrace-logo.png" }
        };
      }
    },
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "false", TENANT_ID: tenantId }
  });
  const server = app.listen(0);
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = address && typeof address === "object" ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    const createdReport = await fetch(`${base}/api/fielddocs/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        jobId: "job_bundle_attach",
        propertyId: "property_1",
        visitId: "visit_1",
        title: "Bundle closeout report",
        findings: ["Field note captured on site."],
        mediaIds: ["media_bundle_1"],
        checklistId: attached.checklist.id,
        templateId: reportTemplate.id,
        snippetIds: [snippet.id],
        watermarkEnabled: true,
        status: "posted"
      })
    }).then((response) => response.json());

    assert.equal(createdReport.ok, true);
    assert.equal(createdReport.report.watermarkEnabled, true);
    assert.equal(createdReport.report.templateId, reportTemplate.id);
    assert.deepEqual(createdReport.report.snippetIds, [snippet.id]);
    assert.equal(createdReport.report.findings.includes("Template default summary."), true);
    assert.equal(createdReport.report.findings.includes("Saved snippet: repair the skimmer throat and pressure test after cure."), true);

    const reportPdf = Buffer.from(await fetch(`${base}/api/fielddocs/reports/${createdReport.report.id}/pdf?tenantId=${tenantId}`)
      .then((response) => response.arrayBuffer()));
    const reportPdfText = reportPdf.toString("utf8");
    assert.match(reportPdfText, /Watermark: Aquatrace/i);
    assert.match(reportPdfText, /Watermark asset: https:\/\/cdn\.example\.test\/aquatrace-logo\.png/i);
    assert.match(reportPdfText, /Saved snippet: repair the skimmer throat and pressure test after cure\./i);

    const recapReport = await fetch(`${base}/api/fielddocs/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        jobId: "job_bundle_attach",
        propertyId: "property_1",
        visitId: "visit_1",
        kind: "ai_recap",
        title: "AI recap output",
        findings: [],
        mediaIds: ["media_bundle_1"],
        checklistId: attached.checklist.id,
        status: "posted"
      })
    }).then((response) => response.json());

    assert.equal(recapReport.ok, true);
    assert.equal(recapReport.report.kind, "ai_recap");
    assert.match(recapReport.report.findings[0], /recap prepared from 1 media item/i);
    assert.equal(recapReport.report.findings.some((line) => /Top tags: skimmer, repair\./i.test(line)), true);
    assert.equal(recapReport.report.findings.some((line) => /Skimmer crack photo after dye test\./i.test(line)), true);

    const recapPdf = Buffer.from(await fetch(`${base}/api/fielddocs/reports/${recapReport.report.id}/pdf?tenantId=${tenantId}`)
      .then((response) => response.arrayBuffer()));
    assert.match(recapPdf.toString("utf8"), /NexCam AI Recap/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("fielddocs signed document routes create, capture signature, reject re-sign, and render PDF", async () => {
  const crmRepository = seedRepository();
  const mediaRepository = new MemoryMediaRepository();

  const app = express();
  app.use(express.json());
  registerFieldDocsRoutes(app, {
    repository: mediaRepository,
    crmRepository,
    env: { NEXI_FIREBASE_AUTH_REQUIRED: "false", TENANT_ID: tenantId }
  });
  const server = app.listen(0);
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = address && typeof address === "object" ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    const created = await fetch(`${base}/api/fielddocs/signed-documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        clientId: "client_1",
        jobId: "job_1",
        propertyId: "property_1",
        visitId: "visit_1",
        kind: "completion_signoff",
        title: "Leak detection completion signoff",
        bodyText: "Customer confirms the leak detection visit was completed and reviewed on site."
      })
    }).then((response) => response.json());

    assert.equal(created.ok, true);
    assert.equal(created.record.status, "pending_signature");
    assert.equal(created.record.kind, "completion_signoff");

    const listedBeforeSign = await fetch(`${base}/api/fielddocs/signed-documents?tenantId=${tenantId}&jobId=job_1`).then((response) => response.json());
    assert.equal(listedBeforeSign.ok, true);
    assert.equal(listedBeforeSign.records.length, 1);

    const signedResponse = await fetch(`${base}/api/fielddocs/signed-documents/${created.record.id}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        signatureMode: "typed",
        typedName: "Deborah Justice"
      })
    });
    const signed = await signedResponse.json();
    assert.equal(signedResponse.status, 200);
    assert.equal(signed.ok, true);
    assert.equal(signed.record.status, "signed");
    assert.equal(signed.record.signature.mode, "typed");
    assert.equal(signed.record.signature.typedName, "Deborah Justice");
    assert.equal(typeof signed.record.signature.ipAddress, "string");
    assert.equal(Boolean(signed.record.signature.ipAddress.trim()), true);

    const secondSignResponse = await fetch(`${base}/api/fielddocs/signed-documents/${created.record.id}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        signatureMode: "typed",
        typedName: "Deborah Justice"
      })
    });
    const secondSignBody = await secondSignResponse.json();
    assert.equal(secondSignResponse.status, 409);
    assert.equal(secondSignBody.ok, false);
    assert.match(secondSignBody.error, /already signed/i);

    const pdfResponse = await fetch(`${base}/api/fielddocs/signed-documents/${created.record.id}/pdf?tenantId=${tenantId}`);
    assert.equal(pdfResponse.status, 200);
    assert.equal(pdfResponse.headers.get("content-type"), "application/pdf");
    const pdf = Buffer.from(await pdfResponse.arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
