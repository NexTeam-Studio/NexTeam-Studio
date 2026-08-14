import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryPlatformRepository } from "../src/platform/repository.ts";
import { registerPlatformRoutes } from "../src/platform/routes.ts";
import { PLATFORM_ROLE_TEMPLATES, resolvePlatformCapabilities } from "../src/platform/team.ts";

test("approved platform role templates resolve explicit capabilities and deny production by default", () => {
  assert.deepEqual(Object.keys(PLATFORM_ROLE_TEMPLATES), ["Owner", "Super Admin", "Administrator", "Developer", "Developer Admin", "Support", "Sales & Onboarding", "Marketing", "Finance", "Read Only"]);
  assert.equal(resolvePlatformCapabilities("Developer", { grant: [], deny: [] }).includes("platform.production.manage"), false);
  assert.equal(resolvePlatformCapabilities("Developer", { grant: ["platform.production.manage"], deny: [] }).includes("platform.production.manage"), true);
  assert.equal(resolvePlatformCapabilities("Administrator", { grant: [], deny: ["platform.tenants.manage"] }).includes("platform.tenants.manage"), false);
});

test("persisted role overrides, disabled profiles, ownership protections, and platform route capability denials are server enforced", async () => {
  const repository = new InMemoryPlatformRepository();
  const app = express(); app.use(express.json());
  const tokens = { owner: { uid: "owner", platform_operator: true }, admin: { uid: "admin", platform_operator: true }, tenant: { uid: "tenant", roles: ["OWNER"] } };
  registerPlatformRoutes(app, { repository, storage: null, env: { NEXI_FIREBASE_AUTH_REQUIRED: "true" }, platformOperatorAuth: { async verifyIdToken(token) { return tokens[token] ?? { uid: "unknown" }; } } });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = (token) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
    const create = async (authUid, role, overrides = { grant: [], deny: [] }) => fetch(`${base}/api/platform/admin/team`, { method: "POST", headers: headers("owner"), body: JSON.stringify({ authUid, firstName: authUid, lastName: "User", email: `${authUid}@example.test`, profilePhotoRef: `media/platform/${authUid}`, twoFactorState: "ENROLLED", role, capabilityOverrides: overrides }) });
    const owner = (await (await create("owner", "Owner")).json()).user;
    const admin = (await (await create("admin", "Support", { grant: [], deny: ["platform.team.manage"] })).json()).user;
    assert.equal((await fetch(`${base}/api/platform/admin/team`, { headers: headers("tenant") })).status, 403);
    assert.equal((await fetch(`${base}/api/platform/admin/team`, { method: "POST", headers: headers("admin"), body: JSON.stringify({ authUid: "x", firstName: "X", lastName: "X", email: "x@example.test", profilePhotoRef: "media/platform/x", twoFactorState: "NOT_ENROLLED", role: "Read Only" }) })).status, 403);
    assert.equal((await fetch(`${base}/api/platform/admin/team/${owner.id}/disable`, { method: "POST", headers: headers("admin") })).status, 403);
    assert.equal((await fetch(`${base}/api/platform/admin/summary`, { headers: headers("admin") })).status, 200);
    assert.equal((await fetch(`${base}/api/platform/admin/prospects`, { method: "POST", headers: headers("admin"), body: JSON.stringify({ businessName: "Not persisted", industry: "test" }) })).status, 403);
    assert.equal((await fetch(`${base}/api/platform/admin/team/${owner.id}/transfer-ownership`, { method: "POST", headers: headers("owner"), body: JSON.stringify({ toUserId: admin.id }) })).status, 200);
    assert.equal((await repository.getPlatformUser(owner.id)).role, "Super Admin");
    assert.equal((await repository.getPlatformUser(admin.id)).role, "Owner");
    assert.equal((await fetch(`${base}/api/platform/admin/team/${admin.id}/disable`, { method: "POST", headers: headers("owner") })).status, 403);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
