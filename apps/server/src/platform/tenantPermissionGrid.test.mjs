import assert from "node:assert/strict";
import test from "node:test";
import { TEAM_PERMISSION_AREAS, hasPermissionLevel, permissionGridFor, resetPermissionGridForRole } from "../../dist/platform/tenantPermissionGrid.js";
import { defaultTenant, defaultTenantUsers, InMemoryPlatformRepository } from "../../dist/platform/repository.js";
import { upsertTenantUser } from "../../dist/platform/accessManagement.js";

test("Team & Permissions role defaults preserve role names while allowing individual per-area overrides", () => {
  const technician = permissionGridFor("TECHNICIAN");
  assert.equal(technician.PRODUCTS_AND_SERVICES, "NONE");
  assert.equal(technician.NEXDOCS, "CREATE");
  const overridden = permissionGridFor("TECHNICIAN", { PRODUCTS_AND_SERVICES: "WRITE" });
  assert.equal(overridden.PRODUCTS_AND_SERVICES, "WRITE");
  assert.equal(overridden.NEXDOCS, "CREATE");
  assert.equal(hasPermissionLevel(overridden, "PRODUCTS_AND_SERVICES", "MANAGE"), false);
  assert.equal(TEAM_PERMISSION_AREAS.includes("VIEW_AS_CLIENT"), true);
  assert.equal(hasPermissionLevel(permissionGridFor("OFFICE_ADMIN"), "PRODUCTS_AND_SERVICES", "MANAGE"), true);
  assert.equal(hasPermissionLevel(permissionGridFor("OFFICE_ADMIN"), "NEXDOCS", "MANAGE"), true);
});

test("changing a tier resets the grid to that tier default", () => {
  const changed = resetPermissionGridForRole("OFFICE_ADMIN");
  assert.equal(changed.PRODUCTS_AND_SERVICES, "MANAGE");
  assert.equal(changed.NEXDOCS, "MANAGE");
  assert.equal(changed.TEAM, "MANAGE");
});

test("confirmed tenant seed is Chris Owner, Catherine Office Admin, and Logan Technician", () => {
  const users = defaultTenantUsers("aquatrace");
  assert.deepEqual(users.map(({ displayName, role }) => [displayName, role]), [
    ["Chris", "OWNER"], ["Catherine", "OFFICE_ADMIN"], ["Logan", "TECHNICIAN"]
  ]);
});

test("Technician defaults deny catalog and NexDocs folder management while keeping own-schedule read", () => {
  const technician = permissionGridFor("TECHNICIAN");
  assert.equal(hasPermissionLevel(technician, "PRODUCTS_AND_SERVICES", "MANAGE"), false);
  assert.equal(hasPermissionLevel(technician, "NEXDOCS", "MANAGE"), false);
  assert.equal(hasPermissionLevel(technician, "SCHEDULING", "MANAGE"), false);
  assert.equal(hasPermissionLevel(technician, "SCHEDULING", "READ"), true);
});

test("per-user override reloads without changing the assigned tier, and a tier change resets it", async () => {
  const repository = new InMemoryPlatformRepository([defaultTenant("aquatrace")]);
  const Logan = defaultTenantUsers("aquatrace").find((user) => user.id === "logan");
  assert.ok(Logan);
  const overridden = await upsertTenantUser(repository, { ...Logan, permissionOverrides: { NEXDOCS: "MANAGE" } });
  assert.equal(overridden.role, "TECHNICIAN");
  assert.equal((await repository.getTenantUser("aquatrace", "logan"))?.permissionOverrides?.NEXDOCS, "MANAGE");
  const reassigned = await upsertTenantUser(repository, { ...overridden, role: "OFFICE_ADMIN", permissionOverrides: {} });
  assert.equal(reassigned.role, "OFFICE_ADMIN");
  assert.deepEqual(reassigned.permissionOverrides, {});
});
