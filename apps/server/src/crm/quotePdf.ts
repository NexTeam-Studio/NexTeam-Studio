import type { Client, Invoice, Quote } from "@nexteam/core";

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function renderQuotePdf(quote: Quote, client?: Client): Buffer {
  const textLines = [
    "NexTeam Studio Quote",
    `Quote: ${quote.title}`,
    `Quote ID: ${quote.id}`,
    `Tenant: ${quote.tenantId}`,
    `Client: ${client?.name ?? quote.clientId}`,
    "",
    ...quote.lineItems.map((item) => `${item.code} ${item.name} x${item.quantity}: ${money(item.total)}`),
    "",
    `Subtotal: ${money(quote.totals.subtotal)}`,
    `Tax: ${money(quote.totals.tax)}`,
    `Total: ${money(quote.totals.total)}`,
    "",
    "This PDF is generated before outbound delivery and remains approval-gated."
  ];
  const content = textLines
    .map((line, index) => {
      const y = 750 - index * 18;
      return `BT /F1 11 Tf 50 ${y} Td (${escapePdfText(line)}) Tj ET`;
    })
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

export function renderInvoicePdf(invoice: Invoice, client?: Client): Buffer {
  const textLines = [
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
  const content = textLines
    .map((line, index) => {
      const y = 750 - index * 18;
      return `BT /F1 11 Tf 50 ${y} Td (${escapePdfText(line)}) Tj ET`;
    })
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

export function renderQuotePortalHtml(quote: Quote, token: string, client?: Client): string {
  const rows = quote.lineItems.map((item) =>
    `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${money(item.total)}</td></tr>`
  ).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(quote.title)}</title>
  <style>
    body { font-family: Georgia, serif; margin: 2rem; color: #17362f; background: #f5f0e6; }
    main { max-width: 760px; margin: 0 auto; background: #fffaf1; border: 1px solid #d8cbb0; padding: 2rem; }
    table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
    th, td { border-bottom: 1px solid #d8cbb0; padding: .75rem; text-align: left; }
    input, button { font: inherit; padding: .75rem; }
    button { background: #17362f; color: white; border: 0; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(quote.title)}</h1>
    <p>Client: ${escapeHtml(client?.name ?? quote.clientId)}</p>
    <table><thead><tr><th>Code</th><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
    <p><strong>Total:</strong> ${money(quote.totals.total)}</p>
    <form method="post" action="/api/portal/quotes/${encodeURIComponent(quote.id)}/sign">
      <input type="hidden" name="tenantId" value="${escapeHtml(quote.tenantId)}">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <label>Typed signature <input name="typedName" required></label>
      <button type="submit">Sign Quote</button>
    </form>
  </main>
</body>
</html>`;
}
