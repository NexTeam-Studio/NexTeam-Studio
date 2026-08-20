import assert from "node:assert/strict";
import test from "node:test";
import { parseStoredChecklist } from "../dist/fielddocs/checklists.js";
import { FirestoreMediaRepository } from "../dist/fielddocs/mediaRepository.js";

test("legacy checklist items remain readable through the canonical field-response contract", () => {
  const parsed = parseStoredChecklist({
    id: "checklist_legacy_visit",
    tenantId: "tenant_a",
    templateId: "leak_detection_checklist_v1",
    jobId: "job_a",
    visitId: "visit_a",
    title: "Legacy field checklist",
    items: [{ id: "item_1", label: "Inspect return", required: true, status: "pass", note: "Clear" }],
    createdAt: "2026-08-20T00:00:00.000Z"
  });

  assert.equal(parsed.status, "draft");
  assert.equal(parsed.updatedAt, "2026-08-20T00:00:00.000Z");
  assert.deepEqual(parsed.fields[0], {
    fieldId: "item_1",
    label: "Inspect return",
    section: "Legacy checklist",
    type: "free_text",
    memory: "visit",
    required: true,
    photoRequired: false,
    status: "pass",
    note: "Clear"
  });
});

test("Firestore checklist listing does not let one legacy record block scoped field work", async () => {
  const legacy = {
    id: "checklist_legacy_visit",
    tenantId: "tenant_a",
    templateId: "leak_detection_checklist_v1",
    jobId: "job_a",
    visitId: "visit_a",
    title: "Legacy field checklist",
    items: [{ id: "item_1", label: "Inspect return", required: true, status: "pass" }],
    createdAt: "2026-08-20T00:00:00.000Z"
  };
  const db = {
    collection(name) {
      assert.equal(name, "checklists");
      return {
        where(field, operator, value) {
          assert.equal(field, "tenantId");
          assert.equal(operator, "==");
          assert.equal(value, "tenant_a");
          return { get: async () => ({ docs: [{ data: () => legacy }] }) };
        }
      };
    }
  };
  const repository = new FirestoreMediaRepository(db);

  const records = await repository.listChecklists("tenant_a");

  assert.equal(records.length, 1);
  assert.equal(records[0].visitId, "visit_a");
  assert.equal(records[0].fields[0].fieldId, "item_1");
});
