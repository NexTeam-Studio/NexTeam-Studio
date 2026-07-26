import test from "node:test";
import assert from "node:assert/strict";
import {
  createLocalDevSession,
  readLocalDevSession,
  requireAccessContext
} from "../dist/auth/accessContext.js";

const env = {
  TENANT_ID: "aquatrace",
  NEXI_FIREBASE_AUTH_REQUIRED: "false"
};

function requestWithBearer(token) {
  return {
    header(name) {
      if (name.toLowerCase() === "authorization") {
        return `Bearer ${token}`;
      }
      return undefined;
    }
  };
}

test("local credential sessions cover owner, office admin, and technician roles", () => {
  const owner = createLocalDevSession("chris@aquatraceleak.com", "", "aquatrace", env);
  const office = createLocalDevSession("catherine@local.dev", "", "aquatrace", env);
  const technician = createLocalDevSession("logan@aquatraceleak.com", "", "aquatrace", env);

  assert.match(owner.token, /^localdev\./);
  assert.equal(owner.profile.role, "OWNER");
  assert.equal(owner.profile.displayName, "Chris");
  assert.equal(office.profile.role, "OFFICE_ADMIN");
  assert.equal(office.profile.displayName, "Catherine");
  assert.equal(technician.profile.role, "TECHNICIAN");
  assert.equal(technician.profile.displayName, "Logan");

  const ownerSession = readLocalDevSession(owner.token, "aquatrace", env, "testOwner");
  const officeSession = readLocalDevSession(office.token, "aquatrace", env, "testOffice");
  const technicianSession = readLocalDevSession(technician.token, "aquatrace", env, "testTechnician");

  assert.equal(ownerSession?.access.tenantUserId, "tenant_user_chris");
  assert.equal(ownerSession?.access.role, "OWNER");
  assert.equal(officeSession?.access.tenantUserId, "office_catherine");
  assert.equal(officeSession?.access.role, "OFFICE_ADMIN");
  assert.equal(technicianSession?.access.tenantUserId, "tech_logan");
  assert.equal(technicianSession?.access.role, "TECHNICIAN");
});

test("local credential sign-in accepts email-only local sessions and rejects unknown addresses", () => {
  const owner = createLocalDevSession("chris@aquatraceleak.com", "ignored-password", "aquatrace", env);
  assert.equal(owner.profile.role, "OWNER");

  assert.throws(
    () => createLocalDevSession("unknown@aquatraceleak.com", "", "aquatrace", env),
    /That email is not allowed for local sign-in/
  );
});

test("local bearer sessions feed the access-context role gate and refuse cross-tenant reuse", async () => {
  const office = createLocalDevSession("catherine@local.dev", "", "aquatrace", env);
  const access = await requireAccessContext(requestWithBearer(office.token), env, {
    requestedTenantId: "aquatrace",
    op: "localAuthRoleGate"
  });

  assert.equal(access.tenantUserId, "office_catherine");
  assert.equal(access.role, "OFFICE_ADMIN");

  assert.throws(
    () => readLocalDevSession(office.token, "second-test", env, "wrongTenant"),
    /not allowed for this tenant/
  );
});

test("the same local session token keeps the same seat across internal module rails for owner and office admin", async () => {
  const owner = createLocalDevSession("chris@aquatraceleak.com", "", "aquatrace", env);
  const office = createLocalDevSession("catherine@local.dev", "", "aquatrace", env);

  for (const [label, token, expectedTenantUserId, expectedRole] of [
    ["owner", owner.token, "tenant_user_chris", "OWNER"],
    ["office", office.token, "office_catherine", "OFFICE_ADMIN"]
  ]) {
    for (const op of [
      "nexopsClients",
      "nexiConversation",
      "nexcamCapture",
      "nexdocsLibrary",
      "nexreachCampaigns"
    ]) {
      const access = await requireAccessContext(requestWithBearer(token), env, {
        requestedTenantId: "aquatrace",
        op
      });
      assert.equal(access.tenantUserId, expectedTenantUserId, `${label} should keep the same seat in ${op}`);
      assert.equal(access.role, expectedRole, `${label} should keep the same role in ${op}`);
      assert.equal(access.accessKind, "internal", `${label} should stay on the shared internal session rail in ${op}`);
    }
  }
});
