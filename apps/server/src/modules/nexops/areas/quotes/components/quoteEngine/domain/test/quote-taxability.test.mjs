import assert from "node:assert/strict";
import test from "node:test";

import { calculateQuoteTotals, materializeQuoteRecord } from "../quoteFoundation.ts";

test("quote tax applies only to line items marked taxable", () => {
  const totals = calculateQuoteTotals([
    { id: "line_service", code: "SERVICE", name: "Service", quantity: 1, unitPrice: 100, total: 100, taxable: false, source: "custom" },
    { id: "line_material", code: "MATERIAL", name: "Material", quantity: 1, unitPrice: 100, total: 100, taxable: true, source: "custom" }
  ], undefined, 10);

  assert.deepEqual(totals, { subtotal: 200, tax: 10, total: 210, taxRate: 10 });
});

test("a quote can override a catalog item's taxable default", async () => {
  const tenantId = "tenant_quote_taxability";
  const repository = {
    async getCrmSettings() {
      return {
        tenantId,
        documentNumbering: { quote: { prefix: "Q", separator: "-", padWidth: 4, nextValue: 1 } },
        quoteDefaults: { expiryDays: 30, autoSaveCardOnDeposit: false, approvalRules: { requireSignature: false, requireDeposit: false, requireCardOnFile: false }, terms: "" },
        catalogItems: [{ id: "catalog_service", tenantId, code: "SERVICE", name: "Service", price: 100, category: "service", tag: "Service", taxable: false, visible: true, source: "tenant", createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z" }],
        communicationTemplates: [], createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z"
      };
    },
    async saveCrmSettings(value) { return value; },
    async listQuoteTemplates() { return []; },
    async upsertQuoteTemplate(value) { return value; },
    async reserveDocumentNumber() { return "Q-0001"; }
  };

  const quote = await materializeQuoteRecord(repository, {
    tenantId, clientId: "client_1", title: "Tax override", taxRate: 10,
    items: [{ kind: "catalog", catalogItemId: "catalog_service", quantity: 1, taxable: true }]
  });

  assert.equal(quote.lineItems[0].taxable, true);
  assert.equal(quote.totals.tax, 10);
});
