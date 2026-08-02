import test from "node:test";
import assert from "node:assert/strict";
import { mediaSchema } from "@nexteam/core";
import { FieldDocsService, createDraftTemplate } from "./fieldDocsService.ts";
import { MemoryMediaRepository } from "./mediaRepository.ts";

const tenantId = "tenant_closeout";

function createCloseoutTemplate() {
  return createDraftTemplate({
    tenantId,
    title: "Closeout readiness",
    slug: "closeout-readiness",
    appliesTo: "visit",
    fields: [
      {
        id: "summary",
        label: "Completion summary",
        section: "Closeout",
        type: "free_text",
        memory: "visit",
        required: false
      },
      {
        id: "evidence",
        label: "Completion photo",
        section: "Closeout",
        type: "photo_attachment",
        memory: "visit",
        required: false
      }
    ]
  });
}

function photo(id, jobId, visitId) {
  return mediaSchema.parse({
    id,
    tenantId,
    jobId,
    visitId,
    type: "photo",
    storageRef: `native://tenants/${tenantId}/media/${id}/closeout.jpg`,
    aiTags: []
  });
}

test("fielddocs completion requires a real job or visit and matching captured evidence", async () => {
  const repository = new MemoryMediaRepository([
    photo("media_other_visit", "job_other", "visit_other"),
    photo("media_matching_visit", "job_1", "visit_1")
  ]);
  const service = new FieldDocsService({ mediaRepository: repository });
  const template = createCloseoutTemplate();
  await service.upsertTemplate(template);

  const unassigned = await service.createChecklist({ tenantId, templateId: template.id });
  await assert.rejects(
    () => service.updateChecklist({
      tenantId,
      checklistId: unassigned.id,
      complete: true,
      updates: [{ fieldId: "summary", note: "Technician completed the work." }]
    }),
    /Attach this checklist to a job or visit/i
  );

  const associated = await service.createChecklist({
    tenantId,
    templateId: template.id,
    jobId: "job_1",
    visitId: "visit_1"
  });
  await assert.rejects(
    () => service.updateChecklist({
      tenantId,
      checklistId: associated.id,
      complete: true,
      updates: [{ fieldId: "evidence", mediaIds: ["media_other_visit"] }]
    }),
    /same job or visit/i
  );

  const completed = await service.updateChecklist({
    tenantId,
    checklistId: associated.id,
    complete: true,
    updates: [
      { fieldId: "summary", note: "Technician completed the work." },
      { fieldId: "evidence", mediaIds: ["media_matching_visit"] }
    ]
  });
  assert.equal(completed.status, "completed");
});
