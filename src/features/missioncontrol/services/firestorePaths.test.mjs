import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeTenantId,
  isSafeTenantId,
  tenantConfigDocPath,
  tenantIntakePacketDocPath,
  tenantRuntimeSummaryDocPath,
} from "./firestorePaths.js";

test("tenant ids are validated by pattern instead of a hard allow-list", () => {
  assert.equal(isSafeTenantId("acme-pools"), true);
  assert.equal(isSafeTenantId("tenant-123"), true);
  assert.equal(isSafeTenantId("acme_pools"), false);
  assert.equal(isSafeTenantId("Bad Tenant"), false);
  assert.doesNotThrow(() => assertSafeTenantId("multi-client-hvac"));
  assert.throws(() => assertSafeTenantId("bad tenant"), /Invalid tenantId/i);
});

test("foundation paths are deterministic and tenant-scoped", () => {
  assert.equal(tenantConfigDocPath("acme-pools"), "tenants/acme-pools/config/current");
  assert.equal(tenantRuntimeSummaryDocPath("acme-pools"), "tenants/acme-pools/runtimeSummary/current");
  assert.equal(
    tenantIntakePacketDocPath("acme-pools", "packet-01"),
    "tenants/acme-pools/intakePackets/packet-01"
  );
});
