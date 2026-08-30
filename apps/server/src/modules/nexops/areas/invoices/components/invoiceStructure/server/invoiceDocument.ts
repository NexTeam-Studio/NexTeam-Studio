import type { Client, DocumentDesignSettings, Invoice } from "@nexteam/core";
import { escapeDocumentHtml as escapeHtml } from "../../../../../../../shared/documentRendering/htmlEngine.js";
import { renderTextPdf } from "../../../../../../../shared/documentRendering/pdfEngine.js";
import { NEXPORTAL_LOGO_SRC, portalChromeStyles, renderPortalChrome, type PortalChromeOptions } from "../../../../../../../shared/documentRendering/portalChrome.js";
import { invoicePdfLines } from "./invoicePdfTemplate.js";

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export interface InvoicePortalRenderOptions {
  chrome?: PortalChromeOptions | undefined;
  checkoutBasePath?: string | undefined;
  tippingEnabled?: boolean | undefined;
  paymentRecorded?: boolean | undefined;
  paymentCancelled?: boolean | undefined;
  tipPresets?: number[] | undefined;
}

export function renderInvoicePdf(invoice: Invoice, client?: Client, settings?: Partial<DocumentDesignSettings>): Buffer {
  return renderTextPdf(invoicePdfLines(invoice, client, settings));
}

export function renderInvoicePortalHtml(
  invoice: Invoice,
  token: string,
  client?: Client,
  options: InvoicePortalRenderOptions = {}
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
  const checkoutBasePath = options.checkoutBasePath
    ?? `/api/portal/invoices/${encodeURIComponent(invoice.id)}/checkout?tenantId=${encodeURIComponent(invoice.tenantId)}&token=${encodeURIComponent(token)}`;
  const payPath = checkoutBasePath.includes("?")
    ? checkoutBasePath
    : `${checkoutBasePath}?tenantId=${encodeURIComponent(invoice.tenantId)}`;
  const tippingEnabled = options.tippingEnabled ?? false;
  const tipPresets = [...new Set((options.tipPresets?.length ? options.tipPresets : [15, 20, 25]).filter((value) => value >= 0))];
  const chrome = renderPortalChrome(options.chrome);
  const paidBanner = options.paymentRecorded
    ? `<div class="success-banner"><strong>Payment recorded.</strong> The balance rail updated and the receipt path can continue from here.</div>`
    : "";
  const cancelledBanner = options.paymentCancelled
    ? `<div class="notice-banner"><strong>Payment was not completed.</strong> No charge was made. You can safely try again when ready.</div>`
    : "";
  const payLabel = invoice.status === "paid" ? "Payment recorded" : "Balance due";
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
    .hero-brand { display: block; width: 148px; max-height: 42px; margin-bottom: 14px; object-fit: contain; }
    .hero h1 { margin: 0 0 8px; font-size: clamp(2rem, 4vw, 3rem); }
    .hero p { margin: 0; max-width: 52rem; line-height: 1.5; }
    .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .chips span { background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.25); border-radius: 999px; padding: 8px 14px; font-size: .9rem; }
    .content { display: grid; gap: 20px; padding: 24px; }
    .summary { display: grid; grid-template-columns: 1.7fr 1fr; gap: 20px; }
    .panel { border: 1px solid rgba(16,32,39,.12); border-radius: 24px; background: #fff; padding: 20px; }
    .success-banner, .notice-banner { border-radius: 16px; padding: 14px 16px; line-height: 1.45; }
    .success-banner { background: #dcfce7; color: #14532d; border: 1px solid #86efac; }
    .notice-banner { background: #fff7ed; color: #9a3412; border: 1px solid #fdba74; }
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
    ${portalChromeStyles()}
    @media (max-width: 760px) {
      .summary { grid-template-columns: 1fr; }
      .hero { padding: 24px 20px; }
      .content { padding: 20px; }
    }
  </style>
</head>
<body>
  <main>
    ${chrome}
    <div class="shell">
      <section class="hero">
        <img class="hero-brand" src="${NEXPORTAL_LOGO_SRC}" alt="NexPortal" />
        <p>NexPortal invoice</p>
        <h1>${escapeHtml(invoice.title)}</h1>
        <p>Review the invoice summary and use the payment options below. Email delivery includes the PDF; text delivery points back to this secure page.</p>
        <div class="chips">${statusChips}</div>
      </section>
      <section class="content">
        ${paidBanner}
        ${cancelledBanner}
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
            <h2>${payLabel}</h2>
            <div class="totals">
              <div class="totals-row"><span>Subtotal</span><span>${money(invoice.totals.subtotal)}</span></div>
              ${invoice.totals.discount ? `<div class="totals-row"><span>Discount</span><span>${money(invoice.totals.discount)}</span></div>` : ""}
              <div class="totals-row"><span>Tax</span><span>${money(invoice.totals.tax)}</span></div>
              <div class="totals-row"><strong>Total</strong><strong>${money(invoice.totals.total)}</strong></div>
              <div class="totals-row"><strong>Balance</strong><strong>${money(invoice.ledger?.balanceDue ?? invoice.totals.total)}</strong></div>
            </div>
            ${invoice.status === "paid" ? `<p class="fine-print">This invoice is already settled. Statements and receipt documents remain available in the portal.</p>` : `
            <form class="pay-form">
              ${tippingEnabled ? `
              <div>
                <h3>Tip the crew</h3>
                <p class="fine-print">Tips stay separate from the invoice balance and show distinctly on the receipt.</p>
                <div class="tip-presets">
                  <button type="button" class="tip-preset active" data-tip-value="0">No tip</button>
                  ${tipPresets.map((value) => `<button type="button" class="tip-preset" data-tip-value="${value}">${value}% tip</button>`).join("")}
                  <button type="button" class="tip-preset" data-tip-value="custom">Custom tip</button>
                </div>
                <label style="margin-top:12px;">Custom tip amount
                  <input id="tip-amount" type="number" min="0" step="0.01" value="0" inputmode="decimal" />
                </label>
              </div>` : ""}
              <div class="actions">
                <a class="button" id="pay-card" href="${payPath}&provider=stripe&method=card">Pay by card</a>
                <a class="button secondary" id="pay-paypal" href="${payPath}&provider=paypal&method=paypal">Pay with PayPal</a>
                <a class="button secondary" id="pay-venmo" href="${payPath}&provider=paypal&method=venmo">Pay with Venmo</a>
              </div>
            </form>`}
          </section>
        </div>
        ${scheduleRows ? `<section class="panel"><h3>Payment schedule</h3><ul>${scheduleRows}</ul></section>` : ""}
        ${invoice.terms ? `<section class="panel"><h3>Terms</h3><p>${escapeHtml(invoice.terms).replace(/\n/g, "<br/>")}</p></section>` : ""}
      </section>
    </div>
    ${tippingEnabled && invoice.status !== "paid" ? `<script>
      const tipInput = document.getElementById("tip-amount");
      const presetButtons = Array.from(document.querySelectorAll(".tip-preset"));
      const payLinks = ["pay-card", "pay-paypal", "pay-venmo"].map((id) => document.getElementById(id)).filter(Boolean);
      function currentTip() {
        const value = Number(tipInput?.value ?? "0");
        return Number.isFinite(value) && value > 0 ? value.toFixed(2) : "";
      }
      function updateLinks() {
        const tip = currentTip();
        payLinks.forEach((link) => {
          const href = new URL(link.getAttribute("href"), window.location.origin);
          if (tip) {
            href.searchParams.set("tipAmount", tip);
          } else {
            href.searchParams.delete("tipAmount");
          }
          link.setAttribute("href", href.pathname + href.search);
        });
      }
      presetButtons.forEach((button) => button.addEventListener("click", () => {
        presetButtons.forEach((entry) => entry.classList.remove("active"));
        button.classList.add("active");
        const raw = button.dataset.tipValue || "0";
        if (tipInput) {
          const balance = ${JSON.stringify(Number((invoice.ledger?.balanceDue ?? invoice.totals.total).toFixed(2)))};
          if (raw === "custom") {
            tipInput.focus();
          } else if (raw === "0") {
            tipInput.value = "0";
          } else {
            tipInput.value = (balance * Number(raw) / 100).toFixed(2);
          }
        }
        updateLinks();
      }));
      tipInput?.addEventListener("input", () => {
        presetButtons.forEach((entry) => entry.classList.remove("active"));
        document.querySelector('.tip-preset[data-tip-value="custom"]')?.classList.add("active");
        updateLinks();
      });
      updateLinks();
    </script>` : ""}
  </main>
</body>
</html>`;
}
