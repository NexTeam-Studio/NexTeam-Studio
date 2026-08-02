import test from "node:test";
import assert from "node:assert/strict";
import { approveQuoteAfterDepositPreflight } from "../atomicDepositApproval.ts";

function sentQuote() {
  return {
    id: "quote_deposit_1",
    tenantId: "tenant_test",
    clientId: "client_test",
    status: "sent",
    title: "Deposit-required quote",
    lineItems: [],
    totals: { subtotal: 100, tax: 0, total: 100 },
    approvalRules: {
      requireSignature: false,
      requireDeposit: true,
      requireCardOnFile: false,
      depositKind: "amount",
      depositValue: 25
    },
    deposit: { required: true, kind: "amount", amount: 25 }
  };
}

test("a failed deposit leaves the quote sent and a retry must approve again", async () => {
  const original = sentQuote();
  const candidate = {
    ...original,
    status: "approved",
    approvedAt: "2026-08-01T00:00:00.000Z",
    approvedBy: "Customer",
    approvedByRole: "client",
    signature: { mode: "typed", signedAt: "2026-08-01T00:00:00.000Z", typedName: "Customer" },
    deposit: { ...original.deposit, capturedAt: "2026-08-01T00:00:00.000Z" }
  };
  let persistedApprovals = 0;

  await assert.rejects(
    approveQuoteAfterDepositPreflight({
      originalQuote: original,
      approvedQuote: candidate,
      syncDeposit: async () => { throw new Error("Deposit declined"); },
      persistApproval: async () => {
        persistedApprovals += 1;
        return candidate;
      }
    }),
    /Deposit declined/
  );

  assert.equal(persistedApprovals, 0, "no approval record is persisted after a failed deposit");
  assert.equal(original.status, "sent", "the original quote stays available for a fresh approval");

  const retried = await approveQuoteAfterDepositPreflight({
    originalQuote: original,
    approvedQuote: candidate,
    syncDeposit: async () => undefined,
    persistApproval: async () => {
      persistedApprovals += 1;
      return candidate;
    }
  });

  assert.equal(retried.status, "approved");
  assert.equal(persistedApprovals, 1, "only the fresh successful attempt persists approval");
});
