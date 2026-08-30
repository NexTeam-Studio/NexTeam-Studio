import type { Invoice, LineItem, Quote } from "@nexteam/core";

type CatalogResetRepository = {
  listQuotes(tenantId: string): Promise<Quote[]>;
  listInvoices(tenantId: string): Promise<Invoice[]>;
  updateQuote(id: string, patch: Partial<Quote> & { tenantId: string }): Promise<Quote>;
  updateInvoice(id: string, patch: Partial<Invoice> & { tenantId: string }): Promise<Invoice>;
};

export interface CatalogSnapshotMigrationResult {
  draftQuotesScanned: number;
  draftQuotesMigrated: number;
  draftInvoicesScanned: number;
  draftInvoicesMigrated: number;
}

function detachedLine(line: LineItem, catalogIds: ReadonlySet<string>): LineItem {
  if (line.source !== "catalog" || !line.catalogItemId || !catalogIds.has(line.catalogItemId)) return line;
  // code/name/description/quantity/unitPrice/total are already stored on the
  // line. Dropping only the live catalog linkage makes this a true snapshot.
  const { catalogItemId: _catalogItemId, catalogCode: _catalogCode, ...snapshot } = line;
  return { ...snapshot, source: "custom" };
}

export async function detachDraftCatalogSnapshots(
  repository: CatalogResetRepository,
  tenantId: string,
  catalogItemIds: readonly string[]
): Promise<CatalogSnapshotMigrationResult> {
  const catalogIds = new Set(catalogItemIds);
  const [quotes, invoices] = await Promise.all([repository.listQuotes(tenantId), repository.listInvoices(tenantId)]);
  const draftQuotes = quotes.filter((quote) => quote.status === "draft");
  const draftInvoices = invoices.filter((invoice) => invoice.status === "draft");
  let draftQuotesMigrated = 0;
  let draftInvoicesMigrated = 0;
  const updatedAt = new Date().toISOString();

  for (const quote of draftQuotes) {
    const lineItems = quote.lineItems.map((line) => detachedLine(line, catalogIds));
    if (lineItems.some((line, index) => line !== quote.lineItems[index])) {
      await repository.updateQuote(quote.id, { tenantId, lineItems, updatedAt });
      draftQuotesMigrated += 1;
    }
  }
  for (const invoice of draftInvoices) {
    const lineItems = invoice.lineItems.map((line) => detachedLine(line, catalogIds));
    if (lineItems.some((line, index) => line !== invoice.lineItems[index])) {
      await repository.updateInvoice(invoice.id, { tenantId, lineItems, updatedAt });
      draftInvoicesMigrated += 1;
    }
  }
  return { draftQuotesScanned: draftQuotes.length, draftQuotesMigrated, draftInvoicesScanned: draftInvoices.length, draftInvoicesMigrated };
}
