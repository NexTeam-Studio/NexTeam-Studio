import type { Client, Invoice } from "@nexteam/core";

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function invoicePdfLines(invoice: Invoice, client?: Client): string[] {
  return [
    "NexTeam Studio Invoice",
    `Invoice: ${invoice.title}`,
    `Invoice ID: ${invoice.id}`,
    `Tenant: ${invoice.tenantId}`,
    `Client: ${client?.name ?? invoice.clientId}`,
    `Status: ${invoice.status}`,
    "",
    ...invoice.lineItems.map((item) => `${item.code} ${item.name} x${item.quantity}: ${money(item.total)}`),
    "",
    `Subtotal: ${money(invoice.totals.subtotal)}`,
    `Tax: ${money(invoice.totals.tax)}`,
    `Total: ${money(invoice.totals.total)}`,
    "",
    "Card processing is handled by Stripe. NexTeam does not store card data."
  ];
}
