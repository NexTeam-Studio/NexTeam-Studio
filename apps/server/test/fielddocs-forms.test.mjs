import test from "node:test";
import assert from "node:assert/strict";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { FieldDocsService } from "../dist/fielddocs/fieldDocsService.js";
import express from "express";
import { registerFieldDocsRoutes } from "../dist/fielddocs/routes.js";

test("tenant forms version templates, validate conditional responses, link records, and preserve audit history", async () => {
  const service = new FieldDocsService({ mediaRepository: new MemoryMediaRepository() });
  const form = await service.createForm({ tenantId: "tenant_a", slug: "closeout", title: "Closeout", active: true, fields: [
    { id: "needs_repair", label: "Needs repair", type: "boolean", required: true },
    { id: "repair_note", label: "Repair note", type: "text", required: true, visibleWhen: { fieldId: "needs_repair", equals: true } }
  ] });
  const draft = await service.saveFormResponse({ tenantId: "tenant_a", formId: form.id, values: { needs_repair: false }, links: { clientId: "client_1", jobId: "job_1", documentId: "doc_1" }, submit: true, actorId: "tech_1" });
  assert.equal(draft.status, "submitted"); assert.equal(draft.links.documentId, "doc_1");
  await assert.rejects(() => service.saveFormResponse({ tenantId: "tenant_a", formId: form.id, values: { needs_repair: true }, links: {}, submit: true, actorId: "tech_1" }), /Repair note is required/);
  await assert.rejects(() => service.saveFormResponse({ tenantId: "tenant_a", formId: form.id, responseId: draft.id, values: { needs_repair: false }, links: {}, submit: false, actorId: "tech_1" }), /immutable/);
  const revised = await service.reviseForm({ ...form, title: "Revised" }); assert.equal(revised.version, 2);
  const audit = await service["deps"].mediaRepository.listFormAudit("tenant_a", draft.id); assert.deepEqual(audit.map((x) => x.action), ["submitted"]);
  assert.equal((await service.listFormResponses("tenant_b")).length, 0);
});

test("form configuration denies technicians and accepts authorized owner writes", async () => {
  const app = express(); app.use(express.json());
  registerFieldDocsRoutes(app, { repository: new MemoryMediaRepository(), env: { NEXI_FIREBASE_AUTH_REQUIRED: "false", TENANT_ID: "tenant_a" } });
  const server = app.listen(0); const address = server.address(); const base = `http://127.0.0.1:${address.port}`;
  const body = { tenantId: "tenant_a", slug: "inspection", title: "Inspection", active: true, fields: [{ id: "ok", label: "OK", type: "boolean", required: true }] };
  try {
    const denied = await fetch(`${base}/api/fielddocs/forms`, { method: "POST", headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-technician" }, body: JSON.stringify(body) });
    assert.equal(denied.status, 403);
    const allowed = await fetch(`${base}/api/fielddocs/forms`, { method: "POST", headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-owner" }, body: JSON.stringify(body) });
    assert.equal(allowed.status, 201);
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
