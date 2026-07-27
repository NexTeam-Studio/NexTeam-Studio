import type { Client, Quote } from "@nexteam/core";

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function quotePdfLines(quote: Quote, client?: Client): string[] {
  return [
    "NexTeam Studio Quote",
    quote.number ? `Quote Number: ${quote.number}` : "",
    `Quote: ${quote.title}`,
    `Quote ID: ${quote.id}`,
    `Tenant: ${quote.tenantId}`,
    `Client: ${client?.name ?? quote.clientId}`,
    `Status: ${quote.status}`,
    quote.expiresAt ? `Expires: ${quote.expiresAt}` : "",
    "",
    ...quote.lineItems.map((item) => `${item.code} ${item.name} x${item.quantity}: ${money(item.total)}`),
    "",
    `Subtotal: ${money(quote.totals.subtotal)}`,
    quote.totals.discount ? `Discount: ${money(quote.totals.discount)}` : "",
    `Tax: ${money(quote.totals.tax)}`,
    `Total: ${money(quote.totals.total)}`,
    "",
    `Approval rules: ${[
      quote.approvalRules.requireSignature ? "signature required" : "signature optional",
      quote.approvalRules.requireDeposit ? "deposit required" : "deposit optional",
      quote.approvalRules.requireCardOnFile ? "card on file required" : "card on file optional"
    ].join(", ")}`,
    quote.terms ? `Terms: ${quote.terms}` : "",
    "",
    "This PDF is generated before outbound delivery and remains approval-gated."
  ].filter((line): line is string => Boolean(line));
}
