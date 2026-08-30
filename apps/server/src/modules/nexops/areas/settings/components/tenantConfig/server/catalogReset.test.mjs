import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { detachDraftCatalogSnapshots } from "../../../../../../../../dist/modules/nexops/areas/settings/components/tenantConfig/server/catalogReset.js";
import { defaultTenantUsers } from "../../../../../../../../dist/platform/repository.js";

test("Aquatrace-only defaults do not seed team members or catalog items for a new tenant", async () => {
  assert.deepEqual(defaultTenantUsers("candela"), []);
  assert.deepEqual(defaultTenantUsers("aquatrace").map((user) => user.displayName), ["Chris", "Catherine", "Logan"]);
  const adapter = await readFile("packages/providers/src/native/NativeAdapter.ts", "utf8");
  assert.match(adapter, /if \(tenantId !== "aquatrace"\) return \[\];/);
});

test("catalog reset detaches only draft catalog snapshots and preserves their displayed values", async () => {
  const quote = { id: "quote_draft", tenantId: "aquatrace", status: "draft", lineItems: [{ id: "q1", code: "AQ-LEAK-DETECT", name: "Leak detection", description: "Saved scope", quantity: 2, unitPrice: 500, total: 1000, source: "catalog", catalogItemId: "seed_1", catalogCode: "AQ-LEAK-DETECT" }] };
  const sentQuote = { ...quote, id: "quote_sent", status: "sent" };
  const invoice = { id: "invoice_draft", tenantId: "aquatrace", status: "draft", lineItems: [{ id: "i1", code: "AQ-LEAK-DETECT", name: "Leak detection", description: "Saved scope", quantity: 1, unitPrice: 500, total: 500, source: "catalog", catalogItemId: "seed_1", catalogCode: "AQ-LEAK-DETECT" }] };
  const sentInvoice = { ...invoice, id: "invoice_sent", status: "sent" };
  const updatedQuotes = []; const updatedInvoices = [];
  const repository = {
    async listQuotes() { return [quote, sentQuote]; },
    async listInvoices() { return [invoice, sentInvoice]; },
    async updateQuote(id, patch) { updatedQuotes.push({ id, patch }); return { ...quote, ...patch }; },
    async updateInvoice(id, patch) { updatedInvoices.push({ id, patch }); return { ...invoice, ...patch }; }
  };
  const report = await detachDraftCatalogSnapshots(repository, "aquatrace", ["seed_1"]);
  assert.deepEqual(report, { draftQuotesScanned: 1, draftQuotesMigrated: 1, draftInvoicesScanned: 1, draftInvoicesMigrated: 1 });
  assert.deepEqual(updatedQuotes[0].patch.lineItems[0], { id: "q1", code: "AQ-LEAK-DETECT", name: "Leak detection", description: "Saved scope", quantity: 2, unitPrice: 500, total: 1000, source: "custom" });
  assert.deepEqual(updatedInvoices[0].patch.lineItems[0], { id: "i1", code: "AQ-LEAK-DETECT", name: "Leak detection", description: "Saved scope", quantity: 1, unitPrice: 500, total: 500, source: "custom" });
});
