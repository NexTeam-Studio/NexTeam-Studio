import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { catalogSelectionSnapshot } from "@nexteam/core";
import { materializeQuoteRecord } from "../dist/modules/nexops/areas/quotes/components/quoteEngine/domain/quoteFoundation.js";
import { buildInvoiceDraftFromJobs } from "../dist/modules/nexops/areas/invoices/components/invoiceStructure/domain/invoiceFoundation.js";
import { detachCatalogSnapshots } from "../dist/modules/nexops/areas/settings/components/tenantConfig/server/catalogReset.js";

const tenantId = "tenant_snapshot";
const catalog = { id: "catalog_1", tenantId, code: "LEAK", name: "Leak detection", description: "Saved scope", price: 125, category: "service", tag: "Service", taxable: true, visible: true, source: "tenant", createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" };
const snapshot = (id = "line_1") => catalogSelectionSnapshot({ id, code: catalog.code, name: catalog.name, description: catalog.description, price: catalog.price, quantity: 2 });
const settings = (catalogItems = [catalog]) => ({ tenantId, catalogItems, quoteDefaults: { expiryDays: 30, approvalRules: { requireSignature: false, requireDeposit: false, requireCardOnFile: false } }, invoiceDefaults: { dueDays: 30, terms: "Due on receipt" } });

function quoteRepository(catalogItems, templates = []) {
  return {
    async getCrmSettings() { return settings(catalogItems); }, async saveCrmSettings(value) { return value; },
    async listQuoteTemplates() { return templates; }, async upsertQuoteTemplate(value) { return value; },
    async reserveDocumentNumber() { return "Q-100"; }
  };
}

test("catalog selection on a draft quote survives catalog deletion and draft re-save", async () => {
  const first = await materializeQuoteRecord(quoteRepository([catalog]), { tenantId, clientId: "client_1", title: "Quote", items: [{ kind: "catalog", catalogItemId: catalog.id, quantity: 2 }] });
  assert.equal(first.lineItems[0].catalogItemId, undefined);
  assert.equal(first.lineItems[0].source, "custom");
  const savedAgain = await materializeQuoteRecord(quoteRepository([]), { tenantId, clientId: "client_1", title: "Quote", items: first.lineItems.map((line) => ({ kind: "custom", code: line.code, name: line.name, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice })) });
  assert.deepEqual({ code: savedAgain.lineItems[0].code, name: savedAgain.lineItems[0].name, quantity: savedAgain.lineItems[0].quantity, unitPrice: savedAgain.lineItems[0].unitPrice, total: savedAgain.lineItems[0].total, source: savedAgain.lineItems[0].source, catalogItemId: savedAgain.lineItems[0].catalogItemId }, { code: "LEAK", name: "Leak detection", quantity: 2, unitPrice: 125, total: 250, source: "custom", catalogItemId: undefined });
});

test("draft invoice snapshots have no catalog reference after catalog deletion", () => {
  const invoice = buildInvoiceDraftFromJobs({ tenantId, jobs: [{ id: "job_1", tenantId, clientId: "client_1", status: "Requires Invoicing", title: "Job", lineItems: [snapshot()], totals: { subtotal: 250, tax: 0, total: 250 } }], settings: settings([]), number: "INV-100" });
  assert.equal(invoice.lineItems[0].catalogItemId, undefined);
  assert.equal(invoice.lineItems[0].source, "custom");
  assert.equal(invoice.lineItems[0].total, 250);
});

test("manual invoice catalog picker creates a detached custom snapshot", async () => {
  const source = await readFile(new URL("../../web/src/features/invoices/components/invoiceStructure/NexOpsInvoicesPage.tsx", import.meta.url), "utf8");
  assert.match(source, /catalogSelectionSnapshot\(\{/);
  assert.doesNotMatch(source, /catalogItemId:\s*item\.id/);
  assert.deepEqual(snapshot("invoice_line_manual"), { id: "invoice_line_manual", code: "LEAK", name: "Leak detection", description: "Saved scope", quantity: 2, unitPrice: 125, total: 250, source: "custom" });
});

test("manual job catalog selection creates a detached custom snapshot before approval", async () => {
  const source = await readFile(new URL("../src/modules/nexops/areas/jobs/components/jobCore/server/toolSupport.ts", import.meta.url), "utf8");
  assert.match(source, /if \(catalogItem\) return catalogSelectionSnapshot\(\{/);
  assert.match(source, /code: catalogItem\.code, name: catalogItem\.name/);
  assert.doesNotMatch(source, /catalogItemId:\s*catalogItem\.id/);
  assert.match(source, /lineItems,\s*createdBy: "nexi"/);
});

test("quote template catalog line materializes after its catalog item is deleted", async () => {
  const template = { id: "template_1", tenantId, name: "Template", defaultLineItems: [{ ...snapshot(), source: "catalog", catalogItemId: catalog.id, catalogCode: catalog.code }], defaultApprovalRules: { requireSignature: false, requireDeposit: false, requireCardOnFile: false }, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" };
  const quote = await materializeQuoteRecord(quoteRepository([], [template]), { tenantId, clientId: "client_1", title: "Quote", templateId: template.id, items: [] });
  assert.equal(quote.lineItems[0].catalogItemId, undefined);
  assert.equal(quote.lineItems[0].source, "custom");
  assert.equal(quote.lineItems[0].name, catalog.name);
});

test("quote to job to closed-job invoice lifecycle preserves detached values at every stage", () => {
  const quoteLine = snapshot("quote_line_1");
  const job = { id: "job_from_quote", tenantId, clientId: "client_1", status: "Requires Invoicing", title: "Job", lineItems: [{ ...quoteLine }], totals: { subtotal: 250, tax: 0, total: 250 } };
  const invoice = buildInvoiceDraftFromJobs({ tenantId, jobs: [job], settings: settings([]), number: "INV-101" });
  assert.deepEqual({ quote: quoteLine, job: job.lineItems[0], invoice: invoice.lineItems[0] }, { quote: snapshot("quote_line_1"), job: snapshot("quote_line_1"), invoice: snapshot("quote_line_1") });
});

test("retroactive catalog snapshot migration detaches existing quote, invoice, job, template, and quote-version links with counts", async () => {
  const quote = { id: "quote_old", tenantId, status: "draft", lineItems: [{ ...snapshot(), source: "catalog", catalogItemId: catalog.id, catalogCode: catalog.code }], versions: [{ version: 1, archivedAt: "2026-08-30T00:00:00.000Z", reason: "edited_before_send", title: "Old", lineItems: [{ ...snapshot("version_line"), source: "catalog", catalogItemId: catalog.id, catalogCode: catalog.code }], totals: { subtotal: 250, tax: 0, total: 250 }, status: "draft" }] };
  const invoice = { id: "invoice_old", tenantId, status: "draft", lineItems: [{ ...snapshot(), source: "catalog", catalogItemId: catalog.id, catalogCode: catalog.code }] };
  const job = { id: "job_old", tenantId, clientId: "client_1", status: "Requires Invoicing", title: "Old", lineItems: [{ ...snapshot(), source: "catalog", catalogItemId: catalog.id, catalogCode: catalog.code }], totals: { subtotal: 250, tax: 0, total: 250 } };
  const template = { id: "template_old", tenantId, name: "Old", defaultLineItems: [{ ...snapshot(), source: "catalog", catalogItemId: catalog.id, catalogCode: catalog.code }], defaultApprovalRules: { requireSignature: false, requireDeposit: false, requireCardOnFile: false }, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" };
  const saved = { quotes: [], invoices: [], jobs: [], templates: [] };
  const result = await detachCatalogSnapshots({ async listQuotes() { return [quote]; }, async listInvoices() { return [invoice]; }, async listJobs() { return [job]; }, async listQuoteTemplates() { return [template]; }, async updateQuote(_id, patch) { saved.quotes.push(patch); return { ...quote, ...patch }; }, async updateInvoice(_id, patch) { saved.invoices.push(patch); return { ...invoice, ...patch }; }, async updateJob(_id, patch) { saved.jobs.push(patch); return { ...job, ...patch }; }, async upsertQuoteTemplate(value) { saved.templates.push(value); return value; } }, tenantId);
  assert.deepEqual(result, { draftQuotesScanned: 1, draftQuotesMigrated: 1, draftInvoicesScanned: 1, draftInvoicesMigrated: 1, quotesMigrated: 1, invoicesMigrated: 1, jobsMigrated: 1, templatesMigrated: 1 });
  for (const line of [saved.quotes[0].lineItems[0], saved.quotes[0].versions[0].lineItems[0], saved.invoices[0].lineItems[0], saved.jobs[0].lineItems[0], saved.templates[0].defaultLineItems[0]]) assert.equal(line.catalogItemId, undefined);
});
