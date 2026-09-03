import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository } from "@nexteam/providers";
import { registerCrmRoutes } from "../dist/crm/routes.js";

function client(index) {
  return {
    id: `client_${String(index).padStart(3, "0")}`,
    tenantId: "aquatrace",
    name: `Roster client ${index}`,
    emails: [`client-${index}@example.test`],
    phones: [],
    tags: [],
    consent: { email: false, sms: false }
  };
}

test("Clients roster cursor API reaches a client beyond the first 250 records", async () => {
  const repository = new MemoryNativeCrmRepository({ clients: Array.from({ length: 251 }, (_, index) => client(index + 1)) });
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue: new ApprovalQueueService(new InMemoryApprovalQueueRepository()),
    memoryRepository: repository,
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;
    const first = await fetch(`${base}/api/crm/clients?tenantId=aquatrace`).then((response) => response.json());
    assert.equal(first.ok, true);
    assert.equal(first.clients.length, 250);
    assert.equal(first.nextCursor, "client_250");

    const second = await fetch(`${base}/api/crm/clients?tenantId=aquatrace&cursor=${encodeURIComponent(first.nextCursor)}`).then((response) => response.json());
    assert.equal(second.ok, true);
    assert.deepEqual(second.clients.map((record) => record.id), ["client_251"]);
    assert.equal(second.nextCursor, undefined);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
