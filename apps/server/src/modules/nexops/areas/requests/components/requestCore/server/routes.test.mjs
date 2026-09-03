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

test("request conversion opens a builder and only marks the request converted after a line-item quote is saved", async () => {
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
    const builder = await fetch(`${base}/api/crm/requests/${request.id}/convert-to-quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant_demo" })
    });
    assert.equal(builder.status, 200);
    const builderBody = await builder.json();
    assert.equal(builderBody.quoteBuilder.requestId, request.id);
    const quotesResponse = await fetch(`${base}/api/crm/quotes?tenantId=tenant_demo`);
    const quotesBody = await quotesResponse.json();
    assert.equal(quotesResponse.status, 200);
    assert.equal(quotesBody.quotes.length, 0);

    const savedQuote = await fetch(`${base}/api/crm/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "tenant_demo",
        clientId: request.selectedClientId,
        propertyId: request.selectedPropertyId,
        requestId: request.id,
        title: request.subject,
        items: [{ kind: "custom", name: "Leak Detection", quantity: 1, unitPrice: 595, taxable: false }],
        delivery: { mode: "draft" }
      })
    });
    assert.equal(savedQuote.status, 201);
    const savedBody = await savedQuote.json();
    const quotesAfterSave = await fetch(`${base}/api/crm/quotes?tenantId=tenant_demo`);
    const quotesAfterSaveBody = await quotesAfterSave.json();
    const convertedQuote = quotesAfterSaveBody.quotes.find((quote) => quote.id === savedBody.quote.id);
    assert.equal(convertedQuote?.status, "draft");
    assert.equal(convertedQuote?.requestId, request.id);
    assert.equal(convertedQuote?.clientId, request.selectedClientId);
    assert.equal(convertedQuote?.lineItems.length, 1);

    const retry = await fetch(`${base}/api/crm/requests/${request.id}/convert-to-quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant_demo" })
    });
    assert.equal(retry.status, 409);

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
