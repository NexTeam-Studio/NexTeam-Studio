import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { CrmApprovalExecutor } from "../../../../../../../../dist/crm/approvalExecutor.js";
import { registerCrmRoutes } from "../../../../../../../../dist/crm/routes.js";

async function startApp() {
  const repository = new MemoryNativeCrmRepository();
  const adapter = new NativeAdapter(repository, "tenant_demo");
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter));
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: repository,
    platformRepository: {
      listTenantUsers: async () => [{ id: "owner_1", tenantId: "tenant_demo", displayName: "Owner", role: "OWNER", active: true, email: "owner@example.test" }]
    },
    env: { TENANT_ID: "tenant_demo", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

async function createRequest(base, form) {
  const response = await fetch(`${base}/api/crm/requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenantId: "tenant_demo",
      source: "office_new_client",
      formId: form.id,
      formSlug: form.slug,
      fieldValues: [
        { key: "client_name", value: "Sample Customer" },
        { key: "email", value: "customer@example.test" },
        { key: "phone", value: "5550101010" },
        { key: "property_street1", value: "100 Main Street" },
        { key: "property_city", value: "Exampletown" },
        { key: "property_province", value: "EX" },
        { key: "property_postal_code", value: "01010" },
        { key: "pool_configuration", value: "pool_only" },
        { key: "issue_summary", value: "Inspection requested." }
      ]
    })
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  return body.request;
}

async function reviewRequest(base, requestId) {
  const response = await fetch(`${base}/api/crm/requests/${requestId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenantId: "tenant_demo", reviewedAt: "2026-08-01T12:00:00.000Z" })
  });
  assert.equal(response.status, 200);
}

test("request conversion is review-gated, retry-safe, and preserves the intake snapshot", async () => {
  const { server, base } = await startApp();
  try {
    const formsResponse = await fetch(`${base}/api/crm/request-forms?tenantId=tenant_demo`);
    const forms = await formsResponse.json();
    const request = await createRequest(base, forms.forms[0]);

    const beforeReview = await fetch(`${base}/api/crm/requests/${request.id}/convert-to-quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant_demo" })
    });
    assert.equal(beforeReview.status, 409);

    await reviewRequest(base, request.id);
    const firstConversion = await fetch(`${base}/api/crm/requests/${request.id}/convert-to-quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant_demo" })
    });
    assert.equal(firstConversion.status, 201);
    const firstBody = await firstConversion.json();

    const retry = await fetch(`${base}/api/crm/requests/${request.id}/convert-to-quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant_demo" })
    });
    const retryBody = await retry.json();
    assert.equal(retry.status, 200);
    assert.equal(retryBody.alreadyConverted, true);
    assert.equal(retryBody.quote.id, firstBody.quote.id);

    const changedAfterConversion = await fetch(`${base}/api/crm/requests/${request.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant_demo", subject: "Should not save" })
    });
    assert.equal(changedAfterConversion.status, 409);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
