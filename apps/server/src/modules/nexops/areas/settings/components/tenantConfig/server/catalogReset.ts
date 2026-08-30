import { detachCatalogSnapshot, type Invoice, type Job, type LineItem, type Quote, type QuoteTemplate } from "@nexteam/core";

type CatalogResetRepository = {
  listQuotes(tenantId: string): Promise<Quote[]>;
  listInvoices(tenantId: string): Promise<Invoice[]>;
  updateQuote(id: string, patch: Partial<Quote> & { tenantId: string }): Promise<Quote>;
  updateInvoice(id: string, patch: Partial<Invoice> & { tenantId: string }): Promise<Invoice>;
  listJobs?(tenantId: string): Promise<Job[]>;
  updateJob?(id: string, patch: Partial<Job> & { tenantId: string }): Promise<Job>;
  listQuoteTemplates?(tenantId: string): Promise<QuoteTemplate[]>;
  upsertQuoteTemplate?(template: QuoteTemplate): Promise<QuoteTemplate>;
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
  return detachCatalogSnapshot(line);
}

export interface CatalogSnapshotDetachmentResult extends CatalogSnapshotMigrationResult {
  quotesMigrated: number;
  invoicesMigrated: number;
  jobsMigrated: number;
  templatesMigrated: number;
}

/** One-time safe cleanup for references created before selection-time snapshots. */
export async function detachCatalogSnapshots(repository: CatalogResetRepository, tenantId: string): Promise<CatalogSnapshotDetachmentResult> {
  const [quotes, invoices, jobs, templates] = await Promise.all([
    repository.listQuotes(tenantId), repository.listInvoices(tenantId), repository.listJobs?.(tenantId) ?? [], repository.listQuoteTemplates?.(tenantId) ?? []
  ]);
  const detach = (line: LineItem) => line.catalogItemId ? detachCatalogSnapshot(line) : line;
  let quotesMigrated = 0; let invoicesMigrated = 0; let jobsMigrated = 0; let templatesMigrated = 0;
  const timestamp = new Date().toISOString();
  for (const quote of quotes) {
    const lineItems = quote.lineItems.map(detach);
    const versionHasLinks = quote.versions?.some((version) => version.lineItems.some((line) => Boolean(line.catalogItemId))) ?? false;
    const versions = versionHasLinks ? quote.versions?.map((version) => ({ ...version, lineItems: version.lineItems.map(detach) })) : quote.versions;
    if (lineItems.some((line, index) => line !== quote.lineItems[index]) || versionHasLinks) {
      await repository.updateQuote(quote.id, { tenantId, lineItems, ...(versions ? { versions } : {}), updatedAt: timestamp }); quotesMigrated += 1;
    }
  }
  for (const invoice of invoices) {
    const lineItems = invoice.lineItems.map(detach);
    if (lineItems.some((line, index) => line !== invoice.lineItems[index])) { await repository.updateInvoice(invoice.id, { tenantId, lineItems, updatedAt: timestamp }); invoicesMigrated += 1; }
  }
  if (repository.updateJob) for (const job of jobs) {
    const lineItems = job.lineItems.map(detach);
    if (lineItems.some((line, index) => line !== job.lineItems[index])) { await repository.updateJob(job.id, { tenantId, lineItems, updatedAt: timestamp }); jobsMigrated += 1; }
  }
  if (repository.upsertQuoteTemplate) for (const template of templates) {
    const defaultLineItems = template.defaultLineItems?.map(detach);
    if (defaultLineItems?.some((line, index) => line !== template.defaultLineItems?.[index])) { await repository.upsertQuoteTemplate({ ...template, defaultLineItems, updatedAt: timestamp }); templatesMigrated += 1; }
  }
  return {
    draftQuotesScanned: quotes.filter((quote) => quote.status === "draft").length,
    draftQuotesMigrated: quotes.filter((quote) => quote.status === "draft" && quote.lineItems.some((line) => Boolean(line.catalogItemId))).length,
    draftInvoicesScanned: invoices.filter((invoice) => invoice.status === "draft").length,
    draftInvoicesMigrated: invoices.filter((invoice) => invoice.status === "draft" && invoice.lineItems.some((line) => Boolean(line.catalogItemId))).length,
    quotesMigrated, invoicesMigrated, jobsMigrated, templatesMigrated
  };
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
