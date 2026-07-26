import test from "node:test";
import assert from "node:assert/strict";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";

const tenantA = "tenant-a";
const tenantB = "tenant-b";

function quote(tenantId, id) {
  return {
    id,
    tenantId,
    clientId: `client-${tenantId}`,
    status: "pending_approval",
    title: "Tenant-bound quote",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 },
    pdfRef: `native://quotes/${tenantId}/${id}.pdf`
  };
}

test("native CRM rejects cross-tenant document updates and tenantId mutation", async () => {
  const repository = new MemoryNativeCrmRepository({ quotes: [quote(tenantA, "quote-a")] });
  const owner = new NativeAdapter(repository, tenantA);
  const outsider = new NativeAdapter(repository, tenantB);

  await assert.rejects(() => outsider.updateQuote("quote-a", { title: "cross-tenant attempt" }), /not found/);
  await assert.rejects(() => owner.updateQuote("quote-a", { tenantId: tenantB }), /tenant mismatch/);
  assert.equal((await owner.getQuotes())[0].tenantId, tenantA);
  assert.equal((await owner.getQuotes())[0].title, "Tenant-bound quote");
});
