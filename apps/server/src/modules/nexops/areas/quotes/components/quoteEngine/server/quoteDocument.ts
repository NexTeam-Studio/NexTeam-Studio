import type { Client, DocumentDesignSettings, Quote, ReceiptReview } from "@nexteam/core";
import { quotePdfLines } from "./quotePdfTemplate.js";
import { escapeDocumentHtml as escapeHtml } from "../../../../../../../shared/documentRendering/htmlEngine.js";
import { renderTextPdf } from "../../../../../../../shared/documentRendering/pdfEngine.js";
import { NEXPORTAL_LOGO_SRC, portalChromeStyles, renderPortalChrome, type PortalChromeOptions } from "../../../../../../../shared/documentRendering/portalChrome.js";


function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export interface QuotePortalRenderOptions {
  approvalBlockedReason?: string | null;
  pdfPath?: string | null;
  receiptReviews?: ReceiptReview[] | undefined;
  approvalPath?: string | undefined;
  changeRequestPath?: string | undefined;
  chrome?: PortalChromeOptions | undefined;
}

export function renderQuotePdf(quote: Quote, client?: Client, settings?: Partial<DocumentDesignSettings>): Buffer {
  return renderTextPdf(quotePdfLines(quote, client, settings));
}

function portalStatusLabel(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function portalDateLabel(value?: string | undefined): string | null {
  if (!value) {
    return null;
  }
  return new Date(value).toLocaleString();
}

function quoteSentAtValue(quote: Quote): string | undefined {
  return quote.sentAt ?? quote.delivery?.[0]?.sentAt;
}

export function renderQuotePortalHtml(
  quote: Quote,
  token: string,
  client?: Client,
  options: QuotePortalRenderOptions = {}
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
  const isProofState = quote.status === "approved" || quote.status === "approved_internal";
  const sentAtLabel = portalDateLabel(quoteSentAtValue(quote));
  const approvedAtLabel = portalDateLabel(quote.approvedAt);
  const depositLabel = quote.deposit
    ? quote.deposit.kind === "percent"
      ? `${quote.approvalRules.depositValue ?? 0}% deposit`
      : `${money(quote.deposit.amount)} deposit`
    : "Deposit";
  const terms = quote.terms ? `<section class="panel"><h3>Terms</h3><p>${escapeHtml(quote.terms).replace(/\n/g, "<br/>")}</p></section>` : "";
  const statusChips = [
    quote.number ? `<span>Quote ${escapeHtml(quote.number)}</span>` : "",
    `<span>${escapeHtml(portalStatusLabel(quote.status))}</span>`,
    sentAtLabel ? `<span>Sent ${escapeHtml(sentAtLabel)}</span>` : "",
    approvedAtLabel ? `<span>Approved ${escapeHtml(approvedAtLabel)}</span>` : "",
    !isProofState && quote.expiresAt ? `<span>Expires ${escapeHtml(new Date(quote.expiresAt).toLocaleDateString())}</span>` : ""
  ].filter(Boolean).join("");
  const disabledAttr = blockedReason || isProofState ? "disabled" : "";
  const pdfPath = options.pdfPath ?? null;
  const approvalPath = options.approvalPath ?? `/api/portal/quotes/${encodeURIComponent(quote.id)}/approve`;
  const changeRequestPath = options.changeRequestPath ?? `/api/portal/quotes/${encodeURIComponent(quote.id)}/change-request`;
  const chrome = renderPortalChrome(options.chrome);
  const receiptReviews = [...(options.receiptReviews ?? [])]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const proofItems = [
    sentAtLabel ? `<li><strong>Sent:</strong> ${escapeHtml(sentAtLabel)}</li>` : "",
    approvedAtLabel ? `<li><strong>Approved:</strong> ${escapeHtml(approvedAtLabel)}</li>` : "",
    quote.approvedBy ? `<li><strong>Approved by:</strong> ${escapeHtml(quote.approvedBy)}${quote.approvedByRole ? ` (${escapeHtml(portalStatusLabel(quote.approvedByRole))})` : ""}</li>` : "",
    quote.signature?.signedAt ? `<li><strong>Signature captured:</strong> ${escapeHtml(portalDateLabel(quote.signature.signedAt) ?? quote.signature.signedAt)}</li>` : "",
    quote.signature?.typedName ? `<li><strong>Typed signature:</strong> ${escapeHtml(quote.signature.typedName)}</li>` : "",
    quote.deposit?.required && quote.deposit.capturedAt
      ? `<li><strong>${escapeHtml(depositLabel)} received:</strong> ${escapeHtml(portalDateLabel(quote.deposit.capturedAt) ?? quote.deposit.capturedAt)}</li>`
      : "",
    quote.deposit?.cardLast4
      ? `<li><strong>Card used:</strong> ${escapeHtml(quote.deposit.cardBrand ?? "Card")} ending in ${escapeHtml(quote.deposit.cardLast4)}</li>`
      : "",
    quote.deposit?.cardOnFileAuthorized
      ? `<li><strong>Saved card:</strong> Authorized for future billing on approved work.</li>`
      : ""
  ].filter(Boolean).join("");
  const signaturePreview = quote.signature?.mode === "drawn" && quote.signature.drawnDataUrl
    ? `<div class="signature-proof"><p class="muted">Drawn signature on file</p><img class="signature-preview" src="${quote.signature.drawnDataUrl}" alt="Customer signature" /></div>`
    : "";
  const receiptHistoryItems = receiptReviews.length
    ? receiptReviews.map((review) => {
      const sentHistory = (review.sendHistory ?? [])
        .map((entry) => `${portalStatusLabel(entry.channel)} to ${entry.target} on ${portalDateLabel(entry.sentAt) ?? entry.sentAt}`)
        .join(" | ");
      const channels = review.sendChannels.length
        ? review.sendChannels.map((channel) => portalStatusLabel(channel)).join(", ")
        : "Email";
      const attachments = review.attachments.length
        ? review.attachments.map((attachment) => escapeHtml(attachment.label)).join(", ")
        : "No attachments";
      return `<article class="history-item" id="receipt-${escapeHtml(review.id)}">
        <div class="history-head">
          <strong>${escapeHtml(review.subject)}</strong>
          <span>${escapeHtml(portalStatusLabel(review.status))}</span>
        </div>
        <p class="muted">${escapeHtml(review.bodyText)}</p>
        <ul class="history-meta">
          <li><strong>Channels:</strong> ${escapeHtml(channels)}</li>
          <li><strong>Attachments:</strong> ${attachments}</li>
          <li><strong>Updated:</strong> ${escapeHtml(portalDateLabel(review.updatedAt) ?? review.updatedAt)}</li>
          ${sentHistory ? `<li><strong>Send history:</strong> ${escapeHtml(sentHistory)}</li>` : ""}
        </ul>
      </article>`;
    }).join("")
    : `<p class="muted">No receipt records have been written for this approval yet.</p>`;
  const proofPanel = isProofState
    ? `<section class="panel">
        <h2>Approved summary</h2>
        <p class="muted">${quote.approvedByRole === "client" ? "Customer approval is locked in and the office can move this into work." : "Office approval is locked in for execution."}</p>
        <div class="totals">
          <div class="totals-row"><span>Subtotal</span><span>${money(quote.totals.subtotal)}</span></div>
          ${quote.totals.discount ? `<div class="totals-row"><span>Discount</span><span>-${money(quote.totals.discount)}</span></div>` : ""}
          <div class="totals-row"><span>Tax</span><span>${money(quote.totals.tax)}</span></div>
          <div class="totals-row"><strong>Total</strong><strong>${money(quote.totals.total)}</strong></div>
        </div>
        <ul class="detail-list">${proofItems || "<li><strong>Status:</strong> Approval proof is on file.</li>"}</ul>
        ${signaturePreview}
        <div class="actions">
          ${pdfPath ? `<a class="button secondary" href="${escapeHtml(pdfPath)}">Download PDF</a>` : ""}
        </div>
      </section>`
    : `<section class="panel">
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
      </section>`;
  const proofHistory = isProofState
    ? `<details class="details" ${receiptReviews.length ? "" : ""}>
        <summary>Receipt history</summary>
        <div class="details-body">${receiptHistoryItems}</div>
      </details>`
    : "";
  const reviewPanels = isProofState ? "" : `<section class="panel">
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
        </section>`;
  const interactionScript = isProofState ? "" : `
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
        const response = await fetch(${JSON.stringify(approvalPath)}, {
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
        const response = await fetch(${JSON.stringify(changeRequestPath)}, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        changeResponse.textContent = body.ok ? "Change request sent back to the office." : (body.error || "Change request failed.");
      });
      selectSignatureMode("drawn");
    </script>`;
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
    .hero-brand { display: block; width: 148px; max-height: 42px; margin-bottom: 14px; object-fit: contain; }
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
    a.button { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; border-radius: 999px; padding: 12px 18px; background: #09d9e7; color: #072d34; font-weight: 700; }
    a.button.secondary { background: #eff8f8; color: #0b5860; border: 1px solid rgba(7,120,118,.22); }
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
    .detail-list, .history-meta { margin: 0; padding-left: 18px; display: grid; gap: 8px; }
    .signature-proof { margin-top: 16px; }
    .signature-preview { width: 100%; max-width: 360px; border-radius: 18px; border: 1px solid rgba(16,32,39,.12); background: #f8fbf7; }
    .details { border: 1px solid rgba(16,32,39,.1); border-radius: 20px; background: rgba(255,255,255,.92); padding: 18px 20px; }
    .details summary { cursor: pointer; font-weight: 700; }
    .details-body { display: grid; gap: 14px; margin-top: 14px; }
    .history-item { border: 1px solid rgba(16,32,39,.08); border-radius: 18px; padding: 14px 16px; background: #f8fbf7; }
    .history-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
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
        <p>${isProofState ? "NexPortal quote proof" : "NexPortal quote review"}</p>
        <h1>${escapeHtml(quote.title)}</h1>
        <p>${isProofState
    ? "This quote is approved and locked. Review the signed proof, payment evidence, and PDF below."
    : "Review the scope, totals, and approval requirements below. Once you approve, this quote locks and the office can convert it into work."}</p>
        <div class="chips">${statusChips}</div>
      </section>
      <section class="content">
        ${!isProofState && blockedReason ? `<div class="panel blocked"><strong>This quote cannot be approved right now.</strong><p>${escapeHtml(blockedReason)}</p></div>` : ""}
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
          ${proofPanel}
        </div>
        ${terms}
        ${proofHistory}
        ${reviewPanels}
      </section>
    </div>
    ${interactionScript}
  </main>
</body>
</html>`;
}
