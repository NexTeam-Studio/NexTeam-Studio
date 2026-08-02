import assert from "node:assert/strict";
import test from "node:test";
import { contactApprovalHandler } from "./approvalHandler.ts";

function deleteApproval(clientId = "client_native") {
  return {
    tenantId: "tenant_test",
    execute: {
      service: "crm",
      op: "deleteClient",
      args: { tenantId: "tenant_test", clientId }
    }
  };
}

function repositoryFor(client, overrides = {}) {
  const deleted = [];
  return {
    deleted,
    async listClients() { return client ? [client] : []; },
    async listRequests() { return overrides.requests ?? []; },
    async listQuotes() { return overrides.quotes ?? []; },
    async listJobs() { return overrides.jobs ?? []; },
    async listInvoices() { return overrides.invoices ?? []; },
    async listProperties() { return overrides.properties ?? [{ id: "property_native", clientId: client.id }]; },
    async deletePropertiesForClient(_tenantId, clientId) { deleted.push(`properties:${clientId}`); return ["property_native"]; },
    async deleteClient(_tenantId, clientId) { deleted.push(`client:${clientId}`); }
  };
}

test("approved client deletion removes a NexTeam-created client only after the safety check", async () => {
  const client = { id: "client_native", tenantId: "tenant_test", name: "Example Client", emails: [], phones: [], consent: { email: false, sms: false } };
  const crmRepository = repositoryFor(client);
  const result = await contactApprovalHandler.execute(deleteApproval(), { provider: {}, crmRepository });
  assert.deepEqual(result.deletedClient, { id: "client_native", name: "Example Client" });
  assert.deepEqual(crmRepository.deleted, ["properties:client_native", "client:client_native"]);
});

test("approved client deletion refuses imported history", async () => {
  const client = { id: "client_imported", tenantId: "tenant_test", name: "Imported Client", emails: [], phones: [], consent: { email: false, sms: false }, externalIds: { jobber: "legacy_1" } };
  await assert.rejects(
    contactApprovalHandler.execute(deleteApproval("client_imported"), { provider: {}, crmRepository: repositoryFor(client) }),
    /Imported client history cannot be deleted/
  );
});

test("approved client deletion refuses a client with linked work", async () => {
  const client = { id: "client_native", tenantId: "tenant_test", name: "Worked Client", emails: [], phones: [], consent: { email: false, sms: false } };
  await assert.rejects(
    contactApprovalHandler.execute(deleteApproval(), { provider: {}, crmRepository: repositoryFor(client, { jobs: [{ clientId: "client_native" }] }) }),
    /linked work or billing history/
  );
});
