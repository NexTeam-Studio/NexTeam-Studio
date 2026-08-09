import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter, defaultCrmSettings } from "@nexteam/providers";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { registerCrmRoutes } from "../dist/crm/routes.js";

function fixtureRepository() {
  const settings = defaultCrmSettings("tenant_a");
  settings.propertyAssetDefinitions = [{
    kind: "pump",
    label: "Pump",
    fields: [
      { key: "model", label: "Model", type: "text", required: true },
      { key: "horsepower", label: "Horsepower", type: "number" },
      { key: "variableSpeed", label: "Variable speed", type: "boolean" }
    ]
  }];
  return new MemoryNativeCrmRepository({
    crmSettings: [settings],
    clients: [{ id: "client_a", tenantId: "tenant_a", name: "Client A", emails: [], phones: ["5555555555"], tags: [], consent: { email: false, sms: false } }],
    properties: [{ id: "property_a", tenantId: "tenant_a", clientId: "client_a", label: "Main site", address: { street1: "1 Main", city: "Town", province: "SC", postalCode: "29601", country: "US" }, assets: [] }]
  });
}

async function withApp(run) {
  const repository = fixtureRepository();
  const adapter = new NativeAdapter(repository, "tenant_a");
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, { approvalQueue: new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter)), memoryRepository: repository, platformRepository: { listTenantUsers: async () => [{ id: "owner_a", tenantId: "tenant_a", displayName: "Owner", role: "OWNER", active: true }] }, env: { TENANT_ID: "tenant_a", NEXI_FIREBASE_AUTH_REQUIRED: "false" } });
  const server = await new Promise((resolve) => { const started = app.listen(0, () => resolve(started)); });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`, repository);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("property assets persist against the tenant-configured type", async () => {
  await withApp(async (base, repository) => {
    const response = await fetch(`${base}/api/crm/properties/property_a/assets`, { method: "PUT", headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-owner" }, body: JSON.stringify({ tenantId: "tenant_a", assets: [{ kind: "pump", label: "Primary circulation pump", fields: { model: "VSF 3HP", horsepower: 3, variableSpeed: true } }] }) });
    const body = await response.json();
    assert.equal(response.status, 200, body.error);
    assert.equal(body.ok, true);
    assert.equal(body.property.assets[0].kind, "pump");
    const persisted = await repository.listProperties("tenant_a");
    assert.equal(persisted[0].assets[0].fields.variableSpeed, true);
  });
});

test("property assets reject undefined asset types and invalid configured fields", async () => {
  await withApp(async (base) => {
    const unknown = await fetch(`${base}/api/crm/properties/property_a/assets`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId: "tenant_a", assets: [{ kind: "heater", label: "Heater", fields: {} }] }) });
    assert.equal(unknown.status, 400);
    const invalidField = await fetch(`${base}/api/crm/properties/property_a/assets`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId: "tenant_a", assets: [{ kind: "pump", label: "Pump", fields: { model: 3 } }] }) });
    assert.equal(invalidField.status, 400);
  });
});

test("property assets deny a technician write", async () => {
  await withApp(async (base) => {
    const response = await fetch(`${base}/api/crm/properties/property_a/assets`, { method: "PUT", headers: { "content-type": "application/json", "x-nexteam-local-profile": "local-technician" }, body: JSON.stringify({ tenantId: "tenant_a", assets: [] }) });
    assert.equal(response.status, 403);
  });
});
