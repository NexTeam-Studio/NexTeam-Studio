import test from "node:test";
import assert from "node:assert/strict";

import { quoteComposerInputSchema, materializeQuoteRecord } from "../quoteFoundation.ts";

const tenantId = "tenant_quote_property";

function repository() {
  return {
    async getCrmSettings() {
      return {
        tenantId,
        documentNumbering: {
          quote: { prefix: "Q", separator: "-", padWidth: 4, nextValue: 1 }
        },
        quoteDefaults: {
          expiryDays: 30,
          autoSaveCardOnDeposit: false,
          approvalRules: { requireSignature: false, requireDeposit: false, requireCardOnFile: false },
          terms: ""
        },
        catalogItems: [{ id: "catalog_1", tenantId, code: "LEAK", name: "Leak test", price: 125, category: "service", tag: "Service", taxable: false, visible: true, source: "tenant", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }],
        communicationTemplates: [],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      };
    },
    async saveCrmSettings(value) { return value; },
    async listQuoteTemplates() { return []; },
    async upsertQuoteTemplate(value) { return value; },
    async reserveDocumentNumber() { return "Q-0001"; }
  };
}

test("quote drafts carry an optional authoritative property relationship", async () => {
  const input = quoteComposerInputSchema.parse({
    tenantId,
    clientId: "client_1",
    propertyId: "property_1",
    title: "Leak test quote",
    items: [{ kind: "catalog", catalogItemId: "catalog_1", quantity: 1 }]
  });
  const quote = await materializeQuoteRecord(repository(), input);

  assert.equal(quote.clientId, "client_1");
  assert.equal(quote.propertyId, "property_1");
});
