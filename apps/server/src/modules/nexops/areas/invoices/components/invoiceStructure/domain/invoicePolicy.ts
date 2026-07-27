import type { Invoice, InvoiceStatus, LedgerStatusEntry, LineItem } from "@nexteam/core";

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function invoiceTotal(invoice: Invoice): number {
  return roundMoney(invoice.totals.total);
}

export function invoiceOpenForCollections(invoice: Invoice): boolean {
  return invoice.status !== "void" && invoice.status !== "bad_debt" && invoice.status !== "paid";
}

export function normalizeInvoiceLineItems(lineItems: LineItem[]): LineItem[] {
  return lineItems.map((item) => ({
    ...item,
    total: roundMoney(item.quantity * item.unitPrice)
  }));
}

export function nextInvoiceStatusHistory(
  invoice: Invoice,
  status: InvoiceStatus,
  actorId?: string,
  note?: string
): Array<LedgerStatusEntry<InvoiceStatus>> {
  const entries = invoice.statusHistory ? [...invoice.statusHistory] : [];
  const last = entries.at(-1);
  if (last?.status === status && last.note === note && last.changedBy === actorId) return entries;
  entries.push({
    status,
    changedAt: new Date().toISOString(),
    ...(actorId ? { changedBy: actorId } : {}),
    ...(note ? { note } : {})
  });
  return entries;
}
