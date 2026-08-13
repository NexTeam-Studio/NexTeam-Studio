import assert from "node:assert/strict";
import test from "node:test";
import { linkExistingWorkspaceMembership } from "../../dist/auth/workspaceLink.js";
import { defaultTenant, InMemoryPlatformRepository } from "../../dist/platform/repository.js";

test("the Railway composition mounts the workspace-link endpoint", async () => {
  process.env.RUNTIME_MODE = "isolated";
  process.env.TENANT_ID = "test-workspace-link";
  const { app } = await import("../../dist/composeServerApp.js");
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/workspace-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "Firebase sign-in is required." });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("workspace linking preserves a unique active membership and rejects a UID already bound elsewhere", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("aquatrace"), defaultTenant("candela")]);
  await repository.upsertTenantUser({
    id: "aquatrace-owner",
    tenantId: "aquatrace",
    displayName: "Aquatrace Owner",
    email: "owner@aquatrace.test",
    role: "OWNER",
    active: true,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z"
  });
  await repository.upsertTenantUser({
    id: "candela-owner",
    tenantId: "candela",
    displayName: "Candela Owner",
    email: "owner@candela.test",
    role: "OWNER",
    active: true,
    authUid: "candela-uid",
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z"
  });

  const linked = await linkExistingWorkspaceMembership(repository, {
    uid: "aquatrace-uid",
    email: "owner@aquatrace.test",
    email_verified: true
  });
  assert.equal(linked.user.tenantId, "aquatrace");
  assert.equal(linked.user.role, "OWNER");
  assert.equal(linked.user.authUid, "aquatrace-uid");

  await assert.rejects(
    () => linkExistingWorkspaceMembership(repository, {
      uid: "candela-uid",
      email: "owner@aquatrace.test",
      email_verified: true
    }),
    /already linked to a different workspace membership/
  );
});
