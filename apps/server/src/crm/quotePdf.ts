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
  ].filter(Boolean);
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

export function renderInvoicePortalHtml(
  invoice: Invoice,
  token: string,
  client?: Client
): string {
  const rows = invoice.lineItems.map((item) =>
    `<tr>
      <td>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="muted">${escapeHtml(item.code)}</div>
        ${item.description ? `<div class="description">${escapeHtml(item.description)}</div>` : ""}
      </td>
      <td>${item.quantity}</td>
      <td>${money(item.unitPrice)}</td>
      <td>${money(item.total)}</td>
    </tr>`
  ).join("");
  const scheduleRows = (invoice.paymentSchedule?.enabled ? invoice.paymentSchedule.milestones : []).map((milestone) =>
    `<li><strong>${escapeHtml(milestone.label)}</strong> - ${escapeHtml(milestone.amountKind === "percent" ? `${milestone.amount}%` : money(milestone.amount))} - ${
      milestone.trigger === "on_date"
        ? escapeHtml(milestone.dueAt ?? "Custom date")
        : milestone.trigger === "on_approval"
          ? "Due on approval"
          : "Due on job close"
    }</li>`
  ).join("");
  const statusChips = [
    invoice.number ? `<span>Invoice ${escapeHtml(invoice.number)}</span>` : "",
    `<span>${escapeHtml(invoice.status.replace(/_/g, " "))}</span>`,
    invoice.dueAt ? `<span>Due ${escapeHtml(new Date(invoice.dueAt).toLocaleDateString())}</span>` : ""
  ].filter(Boolean).join("");
  const payPath = `/api/portal/invoices/${encodeURIComponent(invoice.id)}/checkout?tenantId=${encodeURIComponent(invoice.tenantId)}&token=${encodeURIComponent(token)}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(invoice.title)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Montserrat, Arial, sans-serif; color: #102027; background: linear-gradient(180deg, #eef9f7 0%, #f8fbf7 100%); }
    main { max-width: 980px; margin: 0 auto; padding: 24px 16px 48px; }
    .shell { background: rgba(255,255,255,.9); border: 1px solid rgba(16,32,39,.1); border-radius: 28px; overflow: hidden; box-shadow: 0 24px 72px rgba(16,32,39,.12); }
    .hero { padding: 28px; background: linear-gradient(135deg, rgba(7,120,118,.98), rgba(27,164,132,.88)); color: white; }
    .hero h1 { margin: 0 0 8px; font-size: clamp(2rem, 4vw, 3rem); }
    .hero p { margin: 0; max-width: 52rem; line-height: 1.5; }
    .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .chips span { background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.25); border-radius: 999px; padding: 8px 14px; font-size: .9rem; }
    .content { display: grid; gap: 20px; padding: 24px; }
    .summary { display: grid; grid-template-columns: 1.7fr 1fr; gap: 20px; }
    .panel { border: 1px solid rgba(16,32,39,.12); border-radius: 24px; background: #fff; padding: 20px; }
    .panel h2, .panel h3 { margin: 0 0 12px; }
    .muted { color: #56747c; font-size: .94rem; }
    .description { color: #39545b; font-size: .92rem; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid rgba(16,32,39,.08); padding: 12px 10px; text-align: left; vertical-align: top; }
    .totals { display: grid; gap: 10px; }
    .totals-row { display: flex; justify-content: space-between; gap: 12px; }
    .totals-row strong { font-size: 1.1rem; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
    a.button { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; border-radius: 999px; padding: 12px 18px; background: #09d9e7; color: #072d34; font-weight: 700; }
    a.button.secondary { background: #eff8f8; color: #0b5860; border: 1px solid rgba(7,120,118,.22); }
    ul { margin: 0; padding-left: 18px; }
    @media (max-width: 760px) {
      .summary { grid-template-columns: 1fr; }
      .hero { padding: 24px 20px; }
      .content { padding: 20px; }
    }
  </style>
</head>
<body>
  <main>
    <div class="shell">
      <section class="hero">
        <p>NexPortal invoice</p>
        <h1>${escapeHtml(invoice.title)}</h1>
        <p>Review the invoice summary and use the payment options below. Email delivery includes the PDF; text delivery points back to this secure page.</p>
        <div class="chips">${statusChips}</div>
      </section>
      <section class="content">
        <div class="summary">
          <section class="panel">
            <h2>Invoice summary</h2>
            <p class="muted">${escapeHtml(client?.name ?? invoice.clientId)}</p>
            <table>
              <thead>
                <tr><th>Line item</th><th>Qty</th><th>Unit</th><th>Total</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </section>
          <section class="panel">
            <h2>Balance due</h2>
            <div class="totals">
              <div class="totals-row"><span>Subtotal</span><span>${money(invoice.totals.subtotal)}</span></div>
              ${invoice.totals.discount ? `<div class="totals-row"><span>Discount</span><span>${money(invoice.totals.discount)}</span></div>` : ""}
              <div class="totals-row"><span>Tax</span><span>${money(invoice.totals.tax)}</span></div>
              <div class="totals-row"><strong>Total</strong><strong>${money(invoice.totals.total)}</strong></div>
              <div class="totals-row"><strong>Balance</strong><strong>${money(invoice.ledger?.balanceDue ?? invoice.totals.total)}</strong></div>
            </div>
            <div class="actions">
              <a class="button" href="${payPath}&provider=stripe&method=card">Pay by card</a>
              <a class="button secondary" href="${payPath}&provider=paypal&method=paypal">Pay with PayPal</a>
              <a class="button secondary" href="${payPath}&provider=paypal&method=venmo">Pay with Venmo</a>
            </div>
          </section>
        </div>
        ${scheduleRows ? `<section class="panel"><h3>Payment schedule</h3><ul>${scheduleRows}</ul></section>` : ""}
        ${invoice.terms ? `<section class="panel"><h3>Terms</h3><p>${escapeHtml(invoice.terms).replace(/\n/g, "<br/>")}</p></section>` : ""}
      </section>
    </div>
  </main>
</body>
</html>`;
}

export function renderQuotePortalHtml(
  quote: Quote,
  token: string,
  client?: Client,
  options: { approvalBlockedReason?: string | null } = {}
): string {
  const rows = quote.lineItems.map((item) =>
    `<tr>
      <td>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="muted">${escapeHtml(item.code)}</div>
        ${item.description ? `<div class="description">${escapeHtml(item.description)}</div>` : ""}
      </td>
      <td>${item.quantity}</td>
      <td>${money(item.unitPrice)}</td>
      <td>${money(item.total)}</td>
    </tr>`
  ).join("");
  const blockedReason = options.approvalBlockedReason ?? null;
  const signatureRequired = quote.approvalRules.requireSignature;
  const depositRequired = quote.approvalRules.requireDeposit;
  const cardRequired = quote.approvalRules.requireCardOnFile;
  const depositLabel = quote.deposit
    ? quote.deposit.kind === "percent"
      ? `${quote.approvalRules.depositValue ?? 0}% deposit`
      : `${money(quote.deposit.amount)} deposit`
    : "Deposit";
  const terms = quote.terms ? `<section class="panel"><h3>Terms</h3><p>${escapeHtml(quote.terms).replace(/\n/g, "<br/>")}</p></section>` : "";
  const statusChips = [
    quote.number ? `<span>Quote ${escapeHtml(quote.number)}</span>` : "",
    `<span>${escapeHtml(quote.status.replace(/_/g, " "))}</span>`,
    quote.expiresAt ? `<span>Expires ${escapeHtml(new Date(quote.expiresAt).toLocaleDateString())}</span>` : ""
  ].filter(Boolean).join("");
  const disabledAttr = blockedReason ? "disabled" : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(quote.title)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Montserrat, Arial, sans-serif; color: #102027; background: linear-gradient(180deg, #eef9f7 0%, #f8fbf7 100%); }
    main { max-width: 980px; margin: 0 auto; padding: 24px 16px 48px; }
    .shell { background: rgba(255,255,255,.9); border: 1px solid rgba(16,32,39,.1); border-radius: 28px; overflow: hidden; box-shadow: 0 24px 72px rgba(16,32,39,.12); }
    .hero { padding: 28px; background: linear-gradient(135deg, rgba(7,120,118,.98), rgba(27,164,132,.88)); color: white; }
    .hero h1 { margin: 0 0 8px; font-size: clamp(2rem, 4vw, 3rem); }
    .hero p { margin: 0; max-width: 52rem; line-height: 1.5; }
    .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .chips span { background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.25); border-radius: 999px; padding: 8px 14px; font-size: .9rem; }
    .content { display: grid; gap: 20px; padding: 24px; }
    .summary { display: grid; grid-template-columns: 1.7fr 1fr; gap: 20px; }
    .panel { border: 1px solid rgba(16,32,39,.12); border-radius: 24px; background: #fff; padding: 20px; }
    .panel h2, .panel h3 { margin: 0 0 12px; }
    .muted { color: #56747c; font-size: .94rem; }
    .description { color: #39545b; font-size: .92rem; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid rgba(16,32,39,.08); padding: 12px 10px; text-align: left; vertical-align: top; }
    .totals { display: grid; gap: 10px; }
    .totals-row { display: flex; justify-content: space-between; gap: 12px; }
    .totals-row strong { font-size: 1.1rem; }
    .rule-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .rule-list li { padding: 12px 14px; border-radius: 16px; background: rgba(20, 198, 144, .1); }
    label { display: grid; gap: 8px; font-weight: 600; }
    input, textarea, button { font: inherit; }
    input, textarea { width: 100%; border: 1px solid rgba(16,32,39,.16); border-radius: 14px; padding: 12px 14px; background: #fff; }
    textarea { min-height: 96px; resize: vertical; }
    button { border: 0; border-radius: 999px; padding: 12px 18px; background: #09d9e7; color: #072d34; font-weight: 700; cursor: pointer; }
    button.secondary { background: #eff8f8; color: #0b5860; border: 1px solid rgba(7,120,118,.22); }
    button.ghost { background: transparent; border: 1px solid rgba(16,32,39,.16); color: #15333a; }
    button[disabled] { opacity: .55; cursor: not-allowed; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
    .signature-shell { display: grid; gap: 12px; }
    .signature-tabs { display: inline-flex; gap: 8px; flex-wrap: wrap; }
    .signature-tab { border: 1px solid rgba(16,32,39,.14); border-radius: 999px; padding: 8px 14px; cursor: pointer; }
    .signature-tab input { display: none; }
    .signature-tab.active { background: rgba(20, 198, 144, .14); border-color: rgba(20, 198, 144, .28); }
    .signature-canvas { width: 100%; height: 180px; border: 1px dashed rgba(16,32,39,.22); border-radius: 18px; background: linear-gradient(180deg, #fefefe, #f4fbfb); touch-action: none; }
    .response { margin-top: 14px; font-size: .94rem; color: #15515b; }
    .blocked { border-color: rgba(173, 54, 54, .2); background: #fff4f1; color: #70231a; }
    @media (max-width: 760px) {
      .summary { grid-template-columns: 1fr; }
      .hero { padding: 24px 20px; }
      .content { padding: 20px; }
    }
  </style>
</head>
<body>
  <main>
    <div class="shell">
      <section class="hero">
        <p>NexPortal quote review</p>
        <h1>${escapeHtml(quote.title)}</h1>
        <p>Review the scope, totals, and approval requirements below. Once you approve, this quote locks and the office can convert it into work.</p>
        <div class="chips">${statusChips}</div>
      </section>
      <section class="content">
        ${blockedReason ? `<div class="panel blocked"><strong>This quote cannot be approved right now.</strong><p>${escapeHtml(blockedReason)}</p></div>` : ""}
        <div class="summary">
          <section class="panel">
            <h2>${escapeHtml(client?.name ?? quote.clientId)}</h2>
            <p class="muted">Quote review for ${escapeHtml(client?.company ?? client?.name ?? "your service request")}.</p>
            <table>
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </section>
          <section class="panel">
            <h2>Summary</h2>
            <div class="totals">
              <div class="totals-row"><span>Subtotal</span><span>${money(quote.totals.subtotal)}</span></div>
              ${quote.totals.discount ? `<div class="totals-row"><span>Discount</span><span>-${money(quote.totals.discount)}</span></div>` : ""}
              <div class="totals-row"><span>Tax</span><span>${money(quote.totals.tax)}</span></div>
              <div class="totals-row"><strong>Total</strong><strong>${money(quote.totals.total)}</strong></div>
            </div>
            <h3 style="margin-top:18px;">Approval rules</h3>
            <ul class="rule-list">
              <li>${signatureRequired ? "Signature is required before this quote can be approved." : "Signature is optional for this quote."}</li>
              <li>${depositRequired ? `${escapeHtml(depositLabel)} is required before approval.` : "No deposit is required at approval time."}</li>
              <li>${cardRequired ? "Card-on-file authorization is required before approval." : "Card-on-file authorization is optional."}</li>
            </ul>
          </section>
        </div>
        ${terms}
        <section class="panel">
          <h2>Approve quote</h2>
          <p class="muted">Approve only if the scope and price look right. If anything needs adjusting, use the change request section instead.</p>
          <form id="approve-form">
            <input type="hidden" name="tenantId" value="${escapeHtml(quote.tenantId)}" />
            <input type="hidden" name="token" value="${escapeHtml(token)}" />
            <label>Customer name
              <input name="customerName" ${disabledAttr} required />
            </label>
            <div class="signature-shell">
              <div class="signature-tabs">
                <label class="signature-tab active" data-signature-tab="drawn"><input type="radio" name="signatureMode" value="drawn" checked />Draw signature</label>
                <label class="signature-tab" data-signature-tab="typed"><input type="radio" name="signatureMode" value="typed" />Type signature</label>
              </div>
              <div id="drawn-signature">
                <canvas id="signature-canvas" class="signature-canvas" width="800" height="180"></canvas>
                <input type="hidden" name="drawnDataUrl" />
                <div class="actions">
                  <button type="button" class="ghost" id="clear-signature" ${disabledAttr}>Clear signature</button>
                </div>
              </div>
              <div id="typed-signature" style="display:none;">
                <label>Typed signature
                  <input name="typedName" ${disabledAttr} placeholder="Type your name" />
                </label>
              </div>
            </div>
            <div class="summary" style="margin-top:18px;">
              <label>${escapeHtml(depositLabel)}
                <input name="cardholderName" ${disabledAttr} placeholder="Cardholder name${depositRequired ? "" : " (optional)"}" />
              </label>
              <div style="display:grid; gap:12px;">
                <label>Card brand
                  <input name="cardBrand" ${disabledAttr} placeholder="Visa, Mastercard, etc." />
                </label>
                <label>Last four digits
                  <input name="cardLast4" ${disabledAttr} inputmode="numeric" maxlength="4" placeholder="1234" />
                </label>
                <label style="grid-template-columns:auto 1fr; align-items:center;">
                  <input type="checkbox" name="cardOnFileAuthorized" ${disabledAttr} style="width:auto;" />
                  <span>Save this card on file for future approved work and billing.</span>
                </label>
              </div>
            </div>
            <div class="actions">
              <button type="submit" ${disabledAttr}>Approve quote</button>
            </div>
            <div id="approve-response" class="response"></div>
          </form>
        </section>
        <section class="panel">
          <h2>Request changes</h2>
          <p class="muted">Comment on specific lines or leave one freeform note for the office.</p>
          <form id="change-form">
            <input type="hidden" name="tenantId" value="${escapeHtml(quote.tenantId)}" />
            <input type="hidden" name="token" value="${escapeHtml(token)}" />
            <label>Your name
              <input name="customerName" ${disabledAttr} />
            </label>
            ${quote.lineItems.map((item) => `
              <label>${escapeHtml(item.name)}
                <textarea name="lineComment_${escapeHtml(item.id)}" ${disabledAttr} placeholder="Comment on this line if it needs to change."></textarea>
              </label>
            `).join("")}
            <label>General note
              <textarea name="note" ${disabledAttr} placeholder="Anything the office should adjust before you approve?"></textarea>
            </label>
            <div class="actions">
              <button type="submit" class="secondary" ${disabledAttr}>Send change request</button>
            </div>
            <div id="change-response" class="response"></div>
          </form>
        </section>
      </section>
    </div>
    <script>
      const approveForm = document.getElementById("approve-form");
      const changeForm = document.getElementById("change-form");
      const signatureTabs = Array.from(document.querySelectorAll("[data-signature-tab]"));
      const typedBlock = document.getElementById("typed-signature");
      const drawnBlock = document.getElementById("drawn-signature");
      const signatureModeInputs = Array.from(document.querySelectorAll('input[name="signatureMode"]'));
      const canvas = document.getElementById("signature-canvas");
      const clearButton = document.getElementById("clear-signature");
      const approveResponse = document.getElementById("approve-response");
      const changeResponse = document.getElementById("change-response");
      const drawnDataInput = approveForm?.querySelector('input[name="drawnDataUrl"]');
      const context = canvas?.getContext?.("2d");
      let drawing = false;
      function selectSignatureMode(mode) {
        signatureTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.signatureTab === mode));
        if (typedBlock) typedBlock.style.display = mode === "typed" ? "block" : "none";
        if (drawnBlock) drawnBlock.style.display = mode === "drawn" ? "block" : "none";
      }
      signatureModeInputs.forEach((input) => input.addEventListener("change", () => selectSignatureMode(input.value)));
      if (context) {
        context.lineWidth = 2;
        context.lineCap = "round";
        context.strokeStyle = "#0b5860";
      }
      function pointFromEvent(event) {
        const rect = canvas.getBoundingClientRect();
        const source = event.touches?.[0] ?? event;
        return {
          x: ((source.clientX - rect.left) / rect.width) * canvas.width,
          y: ((source.clientY - rect.top) / rect.height) * canvas.height
        };
      }
      function startDraw(event) {
        if (!context) return;
        drawing = true;
        const point = pointFromEvent(event);
        context.beginPath();
        context.moveTo(point.x, point.y);
        event.preventDefault();
      }
      function moveDraw(event) {
        if (!drawing || !context) return;
        const point = pointFromEvent(event);
        context.lineTo(point.x, point.y);
        context.stroke();
        if (drawnDataInput) drawnDataInput.value = canvas.toDataURL("image/png");
        event.preventDefault();
      }
      function endDraw() {
        drawing = false;
        if (drawnDataInput) drawnDataInput.value = canvas.toDataURL("image/png");
      }
      canvas?.addEventListener("mousedown", startDraw);
      canvas?.addEventListener("mousemove", moveDraw);
      canvas?.addEventListener("mouseup", endDraw);
      canvas?.addEventListener("mouseleave", endDraw);
      canvas?.addEventListener("touchstart", startDraw, { passive: false });
      canvas?.addEventListener("touchmove", moveDraw, { passive: false });
      canvas?.addEventListener("touchend", endDraw);
      clearButton?.addEventListener("click", () => {
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (drawnDataInput) drawnDataInput.value = "";
      });
      approveForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        approveResponse.textContent = "Submitting approval...";
        const formData = new FormData(approveForm);
        const payload = {
          tenantId: formData.get("tenantId"),
          token: formData.get("token"),
          customerName: formData.get("customerName"),
          signatureMode: formData.get("signatureMode"),
          typedName: formData.get("typedName"),
          drawnDataUrl: formData.get("drawnDataUrl"),
          deposit: {
            cardholderName: formData.get("cardholderName"),
            cardBrand: formData.get("cardBrand"),
            cardLast4: formData.get("cardLast4"),
            cardOnFileAuthorized: formData.get("cardOnFileAuthorized") === "on"
          }
        };
        const response = await fetch("/api/portal/quotes/${encodeURIComponent(quote.id)}/approve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        approveResponse.textContent = body.ok ? "Approved. The office can move this into work now." : (body.error || "Approval failed.");
      });
      changeForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        changeResponse.textContent = "Sending change request...";
        const formData = new FormData(changeForm);
        const lineComments = [];
        const lineItemIds = ${JSON.stringify(quote.lineItems.map((item) => item.id))};
        lineItemIds.forEach((lineItemId) => {
          const comment = String(formData.get("lineComment_" + lineItemId) ?? "").trim();
          if (comment) lineComments.push({ lineItemId, comment });
        });
        const payload = {
          tenantId: formData.get("tenantId"),
          token: formData.get("token"),
          customerName: formData.get("customerName"),
          note: formData.get("note"),
          lineComments
        };
        const response = await fetch("/api/portal/quotes/${encodeURIComponent(quote.id)}/change-request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        changeResponse.textContent = body.ok ? "Change request sent back to the office." : (body.error || "Change request failed.");
      });
      selectSignatureMode("drawn");
    </script>
  </main>
</body>
</html>`;
}
