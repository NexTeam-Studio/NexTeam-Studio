import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthoritativeTenantMembership } from "../src/auth/accessContext.ts";

const timestamp = "2026-08-10T00:00:00.000Z";
const membership = (overrides = {}) => ({
  id: "member_candela_chris", tenantId: "tenant-candela", authUid: "uid_chris", email: "chris@candelafcs.com",
  displayName: "Chris", role: "OWNER", active: true, createdAt: timestamp, updatedAt: timestamp, ...overrides
});
function db(records) {
  return { collection: () => ({ where: () => ({ get: async () => ({ docs: records.map((record) => ({ data: () => record })) }) }) }) };
}

test("tenant authorization resolves role and active membership from storage, not Firebase claims", async () => {
  const resolved = await resolveAuthoritativeTenantMembership(db([membership({ role: "TECHNICIAN" })]), "uid_chris", "tenant-candela");
  assert.equal(resolved.role, "TECHNICIAN");
});

test("tenant authorization denies inactive, foreign, and duplicate memberships", async () => {
  await assert.rejects(() => resolveAuthoritativeTenantMembership(db([membership({ active: false })]), "uid_chris", "tenant-candela"), { status: 403 });
  await assert.rejects(() => resolveAuthoritativeTenantMembership(db([membership({ tenantId: "tenant-aquatrace" })]), "uid_chris", "tenant-candela"), { status: 403 });
  await assert.rejects(() => resolveAuthoritativeTenantMembership(db([membership(), membership({ id: "second" })]), "uid_chris", "tenant-candela"), { status: 403 });
});

test("tenant authorization denies an identity that has no active membership despite a claim-like owner role", async () => {
  await assert.rejects(
    () => resolveAuthoritativeTenantMembership(db([]), "uid_claims_owner", "tenant-aquatrace"),
    { status: 403 }
  );
});
