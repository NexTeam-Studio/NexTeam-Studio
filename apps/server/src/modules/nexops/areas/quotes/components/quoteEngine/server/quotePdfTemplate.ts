import type { Client, DocumentDesignSettings, Quote } from "@nexteam/core";
import { renderDocumentMergeText, resolveDocumentDesign } from "../../../../../../../shared/documentRendering/documentDesign.js";

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function quotePdfLines(quote: Quote, client?: Client, settings?: Partial<DocumentDesignSettings>): string[] {
  const design = resolveDocumentDesign(settings);
  const label = design.quote.referToAsEstimate ? "Estimate" : "Quote";
  const depositAmount = quote.deposit?.amount ?? (quote.approvalRules.depositKind === "percent" ? quote.totals.total * ((quote.approvalRules.depositValue ?? 0) / 100) : (quote.approvalRules.depositValue ?? 0));
  return [
    `NexTeam Studio ${label}`,
    `Style: ${design.style.headerLayout} / ${design.style.headerStyle} / ${design.style.themeColor} / logo ${design.style.logoSize}`,
    quote.number ? `${label} Number: ${quote.number}` : "",
    `${label}: ${quote.title}`,
    `Quote ID: ${quote.id}`,
    `Tenant: ${quote.tenantId}`,
    `Client: ${client?.name ?? quote.clientId}`,
    `Status: ${quote.status}`,
    quote.expiresAt ? `Expires: ${quote.expiresAt}` : "",
    "",
    ...quote.lineItems.map((item) => [item.code, item.name, design.quote.showQuantity ? `x${item.quantity}` : "", design.quote.showUnitPrice ? `@ ${money(item.unitPrice)}` : "", design.quote.showLineTotal ? `: ${money(item.total)}` : ""].filter(Boolean).join(" ")),
    "",
    ...(design.quote.showTotalsAndTax ? [`Subtotal: ${money(quote.totals.subtotal)}`, quote.totals.discount ? `Discount: ${money(quote.totals.discount)}` : "", `Tax: ${money(quote.totals.tax)}`, `Total: ${money(quote.totals.total)}`] : []),
    "",
    `Approval rules: ${[
      quote.approvalRules.requireSignature ? "signature required" : "signature optional",
      quote.approvalRules.requireDeposit ? "deposit required" : "deposit optional",
      quote.approvalRules.requireCardOnFile ? "card on file required" : "card on file optional"
    ].join(", ")}`,
    design.quote.disclaimer ? `Disclaimer: ${design.quote.disclaimer}` : "",
    quote.approvalRules.requireDeposit ? `Deposit: ${renderDocumentMergeText(design.quote.depositLanguage, { DEPOSIT_AMOUNT: money(depositAmount) })}` : "",
    design.quote.showSignatureLine ? "Client signature: ______________________________" : "",
    `Footer font size: ${design.style.footerFontSize}`,
    "",
    "This PDF is generated before outbound delivery and remains approval-gated."
  ].filter((line): line is string => Boolean(line));
}
