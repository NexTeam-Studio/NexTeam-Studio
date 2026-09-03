import assert from "node:assert/strict";
import test from "node:test";

import { portalTerms, renderQuotePortalHtml } from "../src/modules/nexops/areas/quotes/components/quoteEngine/server/quoteDocument.ts";

function quote(overrides = {}) {
  return {
    id: "quote_test",
    tenantId: "aquatrace",
    number: "Q-TEST",
    clientId: "client_test",
    status: "sent",
    title: "Mobile quote",
    lineItems: [{ id: "line_1", code: "LEAK-DETECTION", name: "Swimming Pool Leak Detection Service", quantity: 1, unitPrice: 595, total: 595 }],
    totals: { subtotal: 595, tax: 0, total: 595 },
    approvalRules: { requireSignature: true, requireDeposit: false, requireCardOnFile: false },
    // Simulates a pre-edit deposit bridge left on an older Firestore record.
    deposit: { required: true, kind: "percent", amount: 297.5 },
    terms: "Scheduling begins after approval and any required deposit steps are complete.",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    ...overrides
  };
}

test("signature-only portal hides obsolete deposit and card controls", () => {
  const html = renderQuotePortalHtml(quote(), "portal_test_token");

  assert.match(html, /No deposit is required at approval time\./);
  assert.doesNotMatch(html, /name="cardholderName"/);
  assert.doesNotMatch(html, /Card brand/);
  assert.doesNotMatch(html, /50% deposit/);
});

test("portal terms remove default deposit wording when the policy does not require a deposit", () => {
  assert.equal(
    portalTerms("Scheduling begins after approval and any required deposit steps are complete.", false),
    "Scheduling begins after approval."
  );
});

test("portal quote line items provide mobile labels and stacked-row styles", () => {
  const html = renderQuotePortalHtml(quote(), "portal_test_token");

  assert.match(html, /class="quote-line-items"/);
  assert.match(html, /data-label="Qty"/);
  assert.match(html, /\.quote-line-items thead \{ display: none; \}/);
  assert.match(html, /content: attr\(data-label\)/);
});
