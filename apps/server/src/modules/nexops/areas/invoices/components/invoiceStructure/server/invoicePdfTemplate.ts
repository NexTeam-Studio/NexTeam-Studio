import type { Client, DocumentDesignSettings, Invoice } from "@nexteam/core";
import { resolveDocumentDesign } from "../../../../../../../shared/documentRendering/documentDesign.js";

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function invoicePdfLines(invoice: Invoice, client?: Client, settings?: Partial<DocumentDesignSettings>): string[] {
  const design = resolveDocumentDesign(settings);
  return [
    "NexTeam Studio Invoice",
    `Style: ${design.style.headerLayout} / ${design.style.headerStyle} / ${design.style.themeColor} / logo ${design.style.logoSize}`,
    `Invoice: ${invoice.title}`,
    `Invoice ID: ${invoice.id}`,
    `Tenant: ${invoice.tenantId}`,
    `Client: ${client?.name ?? invoice.clientId}`,
    `Status: ${invoice.status}`,
    "",
    ...invoice.lineItems.map((item) => [item.code, item.name, design.invoice.showQuantity ? `x${item.quantity}` : "", design.invoice.showUnitPrice ? `@ ${money(item.unitPrice)}` : "", design.invoice.showLineTotal ? `: ${money(item.total)}` : ""].filter(Boolean).join(" ")),
    "",
    `Subtotal: ${money(invoice.totals.subtotal)}`,
    `Tax: ${money(invoice.totals.tax)}`,
    `Total: ${money(invoice.totals.total)}`,
    design.invoice.showAccountBalance ? `Account balance: ${money(invoice.ledger?.balanceDue ?? invoice.totals.total)}` : "",
    design.invoice.showLateStamp && invoice.status === "awaiting_payment" ? "LATE PAYMENT" : "",
    design.invoice.showPaidDate && invoice.status === "paid" ? `Paid date: ${invoice.updatedAt}` : "",
    design.invoice.disclaimer ? `Disclaimer: ${design.invoice.disclaimer}` : "",
    design.invoice.showReturnPaymentStub ? "RETURN PAYMENT STUB — detach for #8 envelope" : "",
    `Footer font size: ${design.style.footerFontSize}`,
    "",
    "Card processing is handled by Stripe. NexTeam does not store card data."
  ];
}
