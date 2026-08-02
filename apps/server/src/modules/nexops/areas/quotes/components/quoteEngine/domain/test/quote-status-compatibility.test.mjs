import test from "node:test";
import assert from "node:assert/strict";

import { legacyQuoteCompatibilityPatch, normalizeQuoteRecord } from "../quoteStatusCompatibility.ts";

function legacySignedQuote(overrides = {}) {
  return {
    id: "quote_legacy_1",
    tenantId: "tenant_1",
    clientId: "client_1",
    status: "signed",
    title: "Legacy pool repair quote",
    lineItems: [{ id: "line_1", code: "POOL-REPAIR", name: "Pool repair", quantity: 1, unitPrice: 450, total: 450 }],
    totals: { subtotal: 450, tax: 0, total: 450 },
    signedBy: "Deborah Justice",
    signedAt: "2026-07-01T15:00:00.000Z",
    signatureIp: "203.0.113.7",
    portalTokenHash: "legacy-token-hash",
    ...overrides
  };
}

test("legacy signed quote is migrated to current client-approved lifecycle without losing approval evidence", () => {
  const legacy = legacySignedQuote();
  const patch = legacyQuoteCompatibilityPatch(legacy);
  const quote = normalizeQuoteRecord(legacy);

  assert.deepEqual(patch, {
    status: "approved",
    approvalRules: { requireSignature: true, requireDeposit: false, requireCardOnFile: false },
    approvedAt: legacy.signedAt,
    approvedBy: legacy.signedBy,
    approvedByRole: "client",
    signature: { mode: "typed", signedAt: legacy.signedAt, ipAddress: legacy.signatureIp, typedName: legacy.signedBy },
    portal: { tokenHash: legacy.portalTokenHash }
  });
  assert.equal(quote.status, "approved");
  assert.equal(quote.approvedAt, legacy.signedAt);
  assert.equal(quote.approvedBy, legacy.signedBy);
  assert.equal(quote.signature?.signedAt, legacy.signedAt);
});

test("current quote records do not receive a legacy migration patch", () => {
  assert.equal(legacyQuoteCompatibilityPatch(legacySignedQuote({ status: "approved" })), null);
});
