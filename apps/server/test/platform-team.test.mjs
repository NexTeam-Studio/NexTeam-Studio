import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryPlatformRepository } from "../src/platform/repository.ts";
import { registerPlatformRoutes } from "../src/platform/routes.ts";

test("NexCommand Team persists platform-only profiles, redacts sensitive data, and records immutable audit events", async () => {
  const repository = new InMemoryPlatformRepository();
  const app = express(); app.use(express.json());
  registerPlatformRoutes(app, { repository, storage: null, env: { NEXI_FIREBASE_AUTH_REQUIRED: "true" }, platformOperatorAuth: { async verifyIdToken(token) {
    if (token === "manager") return { uid: "manager", platform_operator: true };
    if (token === "viewer") return { uid: "viewer", platform_operator: true, platformCapabilities: ["platform.team.view", "platform.profile.self"] };
    return { uid: "tenant-user" };
  } } });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { authorization: "Bearer manager", "content-type": "application/json" };
    const denied = await fetch(`${base}/api/platform/admin/team`, { headers: { authorization: "Bearer tenant-user" } });
    assert.equal(denied.status, 403);
    const created = await fetch(`${base}/api/platform/admin/team`, { method: "POST", headers, body: JSON.stringify({ authUid: "operator-two", firstName: "Avery", lastName: "Stone", email: "avery@example.test", telephone: "555-0100", address: { line1: "1 Main", city: "Town", region: "NY", postalCode: "10001", country: "US" }, profilePhotoRef: "media/platform/avery", role: "Administrator" }) });
    assert.equal(created.status, 201); const member = (await created.json()).user;
    assert.equal((await repository.listTenantUsers("default")).length, 0);
    const list = await fetch(`${base}/api/platform/admin/team`, { headers: { authorization: "Bearer viewer" } }).then((response) => response.json());
    assert.equal(list.users[0].email, undefined);
    const redacted = await fetch(`${base}/api/platform/admin/team/${member.id}`, { headers: { authorization: "Bearer viewer" } }).then((response) => response.json());
    assert.equal(redacted.user.telephone, undefined);
    assert.equal((await fetch(`${base}/api/platform/admin/team/${member.id}/disable`, { method: "POST", headers: { authorization: "Bearer viewer" } })).status, 403);
    assert.equal((await fetch(`${base}/api/platform/admin/team/${member.id}/disable`, { method: "POST", headers })).status, 200);
    assert.equal((await repository.getPlatformUser(member.id)).accountStatus, "DISABLED");
    assert.equal((await fetch(`${base}/api/platform/admin/team/${member.id}/reactivate`, { method: "POST", headers })).status, 200);
    const audits = await repository.listPlatformUserAudits(member.id);
    assert.deepEqual(audits.map((audit) => audit.action), ["platform_user.added", "platform_user.disabled", "platform_user.reactivated"]);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
