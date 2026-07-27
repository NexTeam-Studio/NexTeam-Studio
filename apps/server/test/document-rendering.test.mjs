import test from "node:test";
import assert from "node:assert/strict";
import { escapeDocumentHtml } from "../dist/shared/documentRendering/htmlEngine.js";
import { escapePdfText, renderTextPdf } from "../dist/shared/documentRendering/pdfEngine.js";
import { quotePdfLines } from "../dist/modules/nexops/areas/quotes/components/quoteEngine/server/quotePdfTemplate.js";
import { invoicePdfLines } from "../dist/modules/nexops/areas/invoices/components/invoiceStructure/server/invoicePdfTemplate.js";

test("shared Document Rendering escapes HTML and PDF payload text", () => {
  assert.equal(escapeDocumentHtml(`<script data-x="1">O'Reilly & team</script>`), "&lt;script data-x=&quot;1&quot;&gt;O&#39;Reilly &amp; team&lt;/script&gt;");
  assert.equal(escapePdfText("Service (rear) \\ line"), "Service \\(rear\\) \\\\ line");
});

test("shared Document Rendering writes a valid text PDF without owning document wording", () => {
  const pdf = renderTextPdf(["Shared engine", "Document-specific lines stay outside"]);
  assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
  assert.match(pdf.toString("utf8"), /Shared engine/);
});

test("Quote Engine and Invoice Structure own distinct PDF templates", () => {
  const lineItem = { id: "line_1", code: "LEAK", name: "Leak test", quantity: 1, unitPrice: 250, total: 250, taxable: false };
  const totals = { subtotal: 250, discount: 0, tax: 0, total: 250 };
  const quoteLines = quotePdfLines({
    id: "quote_1", tenantId: "tenant_a", clientId: "client_1", title: "Leak quote", status: "draft",
    lineItems: [lineItem], totals, approvalRules: { requireSignature: true, requireDeposit: false, requireCardOnFile: false },
    createdAt: "2026-07-26T00:00:00.000Z", updatedAt: "2026-07-26T00:00:00.000Z"
  });
  const invoiceLines = invoicePdfLines({
    id: "invoice_1", tenantId: "tenant_a", clientId: "client_1", title: "Leak invoice", status: "draft",
    lineItems: [lineItem], totals, createdAt: "2026-07-26T00:00:00.000Z", updatedAt: "2026-07-26T00:00:00.000Z"
  });
  assert.equal(quoteLines[0], "NexTeam Studio Quote");
  assert.equal(invoiceLines[0], "NexTeam Studio Invoice");
  assert.equal(quoteLines.some((line) => line.startsWith("Approval rules:")), true);
  assert.equal(invoiceLines.some((line) => line.startsWith("Approval rules:")), false);
});
