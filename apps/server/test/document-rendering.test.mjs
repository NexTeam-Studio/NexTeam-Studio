import test from "node:test";
import assert from "node:assert/strict";
import { escapeDocumentHtml } from "../dist/shared/documentRendering/htmlEngine.js";
import { escapePdfText, renderTextPdf } from "../dist/shared/documentRendering/pdfEngine.js";
import { quotePdfLines } from "../dist/modules/nexops/areas/quotes/components/quoteEngine/server/quotePdfTemplate.js";
import { invoicePdfLines } from "../dist/modules/nexops/areas/invoices/components/invoiceStructure/server/invoicePdfTemplate.js";
import { renderJobPdf } from "../dist/modules/nexops/areas/jobs/components/jobCore/server/jobDocument.js";
import { defaultDocumentDesign, resolveDocumentDesign } from "../dist/shared/documentRendering/documentDesign.js";

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

test("Document Design applies line visibility, terminology, deposit merge text, and invoice controls", () => {
  const lineItem = { id: "line_1", code: "LEAK", name: "Leak test", quantity: 2, unitPrice: 125, total: 250, taxable: false };
  const totals = { subtotal: 250, discount: 0, tax: 0, total: 250 };
  const quoteLines = quotePdfLines({ id: "quote_design", tenantId: "tenant_a", clientId: "client_1", title: "Leak quote", status: "draft", lineItems: [lineItem], totals, approvalRules: { requireSignature: false, requireDeposit: true, requireCardOnFile: false, depositKind: "percent", depositValue: 50 }, createdAt: "2026-07-26T00:00:00.000Z", updatedAt: "2026-07-26T00:00:00.000Z" }, undefined, { quote: { referToAsEstimate: true, showQuantity: false, showUnitPrice: false, showLineTotal: false, showTotalsAndTax: false, showSignatureLine: true, disclaimer: "Custom terms", depositLanguage: "Deposit is {{DEPOSIT_AMOUNT}}" } });
  const invoiceLines = invoicePdfLines({ id: "invoice_design", tenantId: "tenant_a", clientId: "client_1", title: "Leak invoice", status: "awaiting_payment", lineItems: [lineItem], totals, ledger: { depositApplied: 0, creditApplied: 0, paymentApplied: 0, refundedAmount: 0, balanceDue: 250, overdue: true }, createdAt: "2026-07-26T00:00:00.000Z", updatedAt: "2026-07-26T00:00:00.000Z" }, undefined, { invoice: { showQuantity: false, showUnitPrice: false, showLineTotal: false, showReturnPaymentStub: true, showLateStamp: true, showAccountBalance: true, showPaidDate: true, disclaimer: "Invoice terms" } });
  assert.equal(quoteLines[0], "NexTeam Studio Estimate");
  assert.equal(quoteLines.some((line) => line.includes("Deposit is $125.00")), true);
  assert.equal(quoteLines.some((line) => line.startsWith("Subtotal:")), false);
  assert.equal(invoiceLines.some((line) => line === "RETURN PAYMENT STUB — detach for #8 envelope"), true);
  assert.equal(invoiceLines.some((line) => line.startsWith("Account balance:")), true);
});

test("Document Design reset defaults restore the specified seeded wording", () => {
  assert.equal(resolveDocumentDesign({ quote: { disclaimer: "Changed" } }).quote.disclaimer, "Changed");
  assert.equal(defaultDocumentDesign.quote.disclaimer, "This quote is valid for the next 30 days, after which values may be subject to change.");
  assert.equal(defaultDocumentDesign.quote.depositLanguage, "A deposit of {{DEPOSIT_AMOUNT}} will be required to begin.");
  assert.equal(defaultDocumentDesign.job.disclaimer, "We can be called for touch-ups and small changes for the next 3 days. After that all work is final.");
  assert.equal(defaultDocumentDesign.invoice.disclaimer, "Thank you for your business. Please contact us with any questions regarding this invoice.");
});

test("shared Style settings render through Quote, Invoice, and Job PDFs", () => {
  const style = { headerLayout: "compact", headerStyle: "clean", logoSize: 1.4, themeColor: "purple", footerFontSize: 10, showCompanyName: true, showCompanyPhone: true, showCompanyEmail: true, showCompanyWebsite: true, showClientPhone: false };
  const lineItem = { id: "line_1", code: "LEAK", name: "Leak test", quantity: 1, unitPrice: 250, total: 250, taxable: false };
  const totals = { subtotal: 250, discount: 0, tax: 0, total: 250 };
  const quote = quotePdfLines({ id: "quote_style", tenantId: "tenant_a", clientId: "client_1", title: "Quote", status: "draft", lineItems: [lineItem], totals, approvalRules: { requireSignature: false, requireDeposit: false, requireCardOnFile: false }, createdAt: "2026-07-26T00:00:00.000Z", updatedAt: "2026-07-26T00:00:00.000Z" }, undefined, { style }).join("\\n");
  const invoice = invoicePdfLines({ id: "invoice_style", tenantId: "tenant_a", clientId: "client_1", title: "Invoice", status: "draft", lineItems: [lineItem], totals, createdAt: "2026-07-26T00:00:00.000Z", updatedAt: "2026-07-26T00:00:00.000Z" }, undefined, { style }).join("\\n");
  const job = renderJobPdf({ id: "job_style", tenantId: "tenant_a", clientId: "client_1", title: "Job", status: "draft", lineItems: [lineItem], totals }, { style }).toString("utf8");
  for (const output of [quote, invoice, job]) assert.match(output, /compact .* clean .* purple/);
});

test("preview payload reflects an unsaved invoice setting change before persistence", () => {
  const lineItem = { id: "line_preview", code: "LEAK", name: "Leak test", quantity: 1, unitPrice: 250, total: 250, taxable: false };
  const invoice = { id: "preview_invoice", tenantId: "tenant_a", clientId: "client_1", title: "Preview", status: "awaiting_payment", lineItems: [lineItem], totals: { subtotal: 250, discount: 0, tax: 0, total: 250 }, ledger: { depositApplied: 0, creditApplied: 0, paymentApplied: 0, refundedAmount: 0, balanceDue: 250, overdue: true }, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" };
  const saved = invoicePdfLines(invoice, undefined, { invoice: { showQuantity: true, showUnitPrice: true, showLineTotal: true, showReturnPaymentStub: false, showLateStamp: true, showAccountBalance: true, showPaidDate: true, disclaimer: "Saved" } });
  const unsavedPreview = invoicePdfLines(invoice, undefined, { invoice: { showQuantity: true, showUnitPrice: true, showLineTotal: true, showReturnPaymentStub: false, showLateStamp: true, showAccountBalance: false, showPaidDate: true, disclaimer: "Unsaved preview" } });
  assert.equal(saved.some((line) => line.startsWith("Account balance:")), true);
  assert.equal(unsavedPreview.some((line) => line.startsWith("Account balance:")), false);
  assert.equal(unsavedPreview.includes("Disclaimer: Unsaved preview"), true);
});
