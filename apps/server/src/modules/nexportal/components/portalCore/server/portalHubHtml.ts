import type { TenantBranding } from "@nexteam/core";
import { portalDocumentHref, type NexDocsClientLibrary, type NexDocsLibraryEntry } from "../../../../../fielddocs/nexDocsService.js";
import type { ScheduledVisit } from "../../../../../scheduling/schedulingEngine.js";
import type { PortalDocumentRecord, PortalHubSnapshot } from "./portalHubService.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value?: string | undefined): string {
  if (!value) {
    return "Not scheduled";
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

type PortalTab = "home" | "quotes" | "invoices" | "appointments" | "documents";
const NEXPORTAL_LOGO_SRC = "/assets/brand/nexportal-logo.png";

function portalColors(branding: TenantBranding): {
  accent: string;
  accentText: string;
  text: string;
  muted: string;
  surface: string;
  background: string;
} {
  return {
    accent: branding.colors.accent ?? "#09d9e7",
    accentText: branding.colors.accentText ?? "#072d34",
    text: branding.colors.text ?? "#102027",
    muted: branding.colors.mutedText ?? "#56747c",
    surface: branding.colors.surface ?? "#ffffff",
    background: branding.colors.background ?? "#eef9f7"
  };
}

function brandMark(branding: TenantBranding): string {
  if (branding.logo?.url?.trim()) {
    return `<img class="portal-brand-mark" src="${escapeHtml(branding.logo.url)}" alt="${escapeHtml(branding.logo.alt ?? branding.displayName)}" />`;
  }
  return `<span class="portal-brand-fallback">${escapeHtml(branding.displayName.slice(0, 1).toUpperCase())}</span>`;
}

function navLink(href: string, label: string, active: boolean, count?: number): string {
  return `<a class="${active ? "active" : ""}" href="${escapeHtml(href)}">
    <span>${escapeHtml(label)}</span>
    ${typeof count === "number" ? `<strong>${count}</strong>` : ""}
  </a>`;
}

function pageFrame(input: {
  branding: TenantBranding;
  clientName: string;
  active: PortalTab;
  title: string;
  intro: string;
  body: string;
  counts: { quotes: number; invoices: number; appointments: number; documents: number };
  statusMessage?: string | undefined;
}): string {
  const colors = portalColors(input.branding);
  const tabs = [
    navLink("/nexportal", "Overview", input.active === "home"),
    navLink("/nexportal/quotes", "Quotes", input.active === "quotes", input.counts.quotes),
    navLink("/nexportal/invoices", "Invoices", input.active === "invoices", input.counts.invoices),
    navLink("/nexportal/appointments", "Appointments", input.active === "appointments", input.counts.appointments),
    navLink("/nexportal/documents", "Documents", input.active === "documents", input.counts.documents)
  ].join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Montserrat, Arial, sans-serif; color: ${colors.text}; background: linear-gradient(180deg, ${colors.background} 0%, #f8fbf7 100%); }
    main { max-width: 1080px; margin: 0 auto; padding: 20px 16px 48px; display: grid; gap: 18px; }
    .portal-shell { border: 1px solid rgba(16,32,39,.1); border-radius: 28px; background: rgba(255,255,255,.94); box-shadow: 0 24px 72px rgba(16,32,39,.12); overflow: hidden; }
    .portal-hero { padding: 28px; background: linear-gradient(135deg, rgba(7,120,118,.98), rgba(27,164,132,.88)); color: white; display: grid; gap: 16px; }
    .portal-brand { display: flex; align-items: center; gap: 14px; }
    .portal-brand-lockup { display: inline-flex; align-items: center; gap: 12px; }
    .portal-brand-mark { width: 48px; height: 48px; border-radius: 14px; object-fit: cover; background: rgba(255,255,255,.16); padding: 4px; }
    .portal-product-mark { width: 136px; max-height: 38px; object-fit: contain; filter: drop-shadow(0 10px 18px rgba(7, 120, 118, .12)); }
    .portal-brand-fallback { width: 48px; height: 48px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.2rem; color: ${colors.accentText}; background: rgba(255,255,255,.88); }
    .portal-brand-copy p { margin: 0; text-transform: uppercase; letter-spacing: .18em; font-size: .78rem; opacity: .85; }
    .portal-brand-copy h1 { margin: 4px 0 0; font-size: clamp(1.8rem, 5vw, 2.7rem); }
    .portal-brand-copy span { display: block; margin-top: 6px; opacity: .92; }
    .portal-nav { display: flex; flex-wrap: wrap; gap: 10px; }
    .portal-nav a { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; border-radius: 999px; padding: 11px 14px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.22); color: white; font-weight: 700; }
    .portal-nav a.active { background: ${colors.accent}; color: ${colors.accentText}; border-color: transparent; }
    .portal-nav strong { display: inline-flex; align-items: center; justify-content: center; min-width: 1.6rem; padding: 0 6px; border-radius: 999px; background: rgba(255,255,255,.18); font-size: .85rem; }
    .portal-status { margin: 0; padding: 12px 14px; border-radius: 16px; background: rgba(255,255,255,.16); }
    .portal-body { padding: 24px; display: grid; gap: 18px; }
    .portal-heading h2 { margin: 0; font-size: 1.55rem; }
    .portal-heading p { margin: 8px 0 0; color: ${colors.muted}; line-height: 1.55; }
    .portal-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .portal-card { border: 1px solid rgba(16,32,39,.1); border-radius: 22px; background: ${colors.surface}; padding: 18px; display: grid; gap: 10px; }
    .portal-card h3 { margin: 0; font-size: 1.05rem; }
    .portal-card p, .portal-card li, .portal-card small { margin: 0; color: ${colors.muted}; line-height: 1.5; }
    .portal-card ul { margin: 0; padding-left: 18px; display: grid; gap: 8px; }
    .portal-card strong { color: ${colors.text}; }
    .portal-list { display: grid; gap: 14px; }
    .portal-list-item { border: 1px solid rgba(16,32,39,.1); border-radius: 20px; padding: 16px 18px; background: rgba(255,255,255,.96); display: grid; gap: 8px; }
    .portal-list-row { display: flex; justify-content: space-between; gap: 14px; align-items: start; flex-wrap: wrap; }
    .portal-pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .portal-pills span { border-radius: 999px; padding: 8px 12px; background: rgba(9,217,231,.12); color: #0b5860; font-size: .88rem; font-weight: 700; }
    .portal-button { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; border: 0; border-radius: 999px; padding: 12px 16px; background: ${colors.accent}; color: ${colors.accentText}; font-weight: 800; cursor: pointer; }
    .portal-button.secondary { background: #eff8f8; color: #0b5860; border: 1px solid rgba(7,120,118,.18); }
    .portal-button-row { display: flex; flex-wrap: wrap; gap: 10px; }
    form { margin: 0; }
    .portal-empty { border: 1px dashed rgba(16,32,39,.16); border-radius: 22px; background: rgba(255,255,255,.78); padding: 20px; color: ${colors.muted}; }
    @media (max-width: 760px) {
      main { padding: 14px 10px 28px; }
      .portal-hero { padding: 22px 18px; }
      .portal-body { padding: 18px; }
      .portal-nav { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .portal-nav a { justify-content: space-between; }
    }
  </style>
</head>
<body>
  <main>
    <section class="portal-shell">
      <header class="portal-hero">
        <div class="portal-brand">
          <div class="portal-brand-lockup">
            ${brandMark(input.branding)}
            <img class="portal-product-mark" src="${NEXPORTAL_LOGO_SRC}" alt="NexPortal" />
          </div>
          <div class="portal-brand-copy">
            <p>NexPortal</p>
            <h1>${escapeHtml(input.title)}</h1>
            <span>${escapeHtml(input.clientName)}</span>
          </div>
        </div>
        <nav class="portal-nav" aria-label="Portal navigation">${tabs}</nav>
        ${input.statusMessage ? `<p class="portal-status">${escapeHtml(input.statusMessage)}</p>` : ""}
      </header>
      <section class="portal-body">
        <div class="portal-heading">
          <h2>${escapeHtml(input.title)}</h2>
          <p>${escapeHtml(input.intro)}</p>
        </div>
        ${input.body}
      </section>
    </section>
  </main>
</body>
</html>`;
}



function assignedFirstNames(input: string[]): string {
  if (!input.length) {
    return "Assigned technician";
  }
  return input.join(", ");
}

function findDocumentForObject(documents: PortalDocumentRecord[], kind: PortalDocumentRecord["kind"], id: string): PortalDocumentRecord | undefined {
  return documents.find((document) => document.kind === kind && document.id.endsWith(id));
}

function documentsForVisit(documents: PortalDocumentRecord[], visitId: string): PortalDocumentRecord[] {
  return documents.filter((document) => document.visitId === visitId && (document.kind === "field_report" || document.kind === "photo"));
}

function propertyLabelForVisit(snapshot: PortalHubSnapshot, visit: ScheduledVisit): string {
  const quote = snapshot.quotes.find((record) => record.jobId === visit.jobId);
  if (quote) {
    return findDocumentForObject(snapshot.documents, "quote_pdf", quote.id)?.propertyLabel ?? "Client";
  }
  const invoice = snapshot.invoices.find((record) => record.jobId === visit.jobId);
  if (invoice) {
    return findDocumentForObject(snapshot.documents, "invoice_pdf", invoice.id)?.propertyLabel ?? "Client";
  }
  return "Client";
}

function propertyCardLabel(property: PortalHubSnapshot["properties"][number]): string {
  return property.label || property.siteName || property.address.street1;
}

function quoteBadge(quoteStatus: string): string {
  return quoteStatus.replace(/_/g, " ");
}

function invoiceBalanceLine(snapshot: PortalHubSnapshot["invoices"][number]): string {
  return snapshot.ledger?.balanceDue !== undefined
    ? `${money(snapshot.ledger.balanceDue)} due`
    : `${money(snapshot.totals.total)} total`;
}

export function renderPortalHomeHtml(
  snapshot: PortalHubSnapshot,
  options: {
    assignedTechniciansByVisitId?: Record<string, string[]> | undefined;
    statusMessage?: string | undefined;
  } = {}
): string {
  const nextVisit = snapshot.visits.find((visit) => visit.status !== "complete" && visit.status !== "cancelled");
  const unpaidInvoice = snapshot.invoices.find((invoice) => invoice.status !== "paid" && invoice.status !== "void" && invoice.status !== "bad_debt");
  const pendingQuote = snapshot.quotes.find((quote) => quote.status !== "approved" && quote.status !== "approved_internal" && quote.status !== "archived");
  const body = `
    <div class="portal-grid">
      <article class="portal-card">
        <small>Quotes</small>
        <h3>${snapshot.quotes.length} in your rail</h3>
        <p>${pendingQuote ? `${pendingQuote.title} is waiting on the next client step.` : "No open quote actions are waiting right now."}</p>
      </article>
      <article class="portal-card">
        <small>Invoices</small>
        <h3>${snapshot.invoices.length} in your rail</h3>
        <p>${unpaidInvoice ? `${unpaidInvoice.title} still has ${money(unpaidInvoice.ledger?.balanceDue ?? unpaidInvoice.totals.total)} due.` : "No open balances are sitting due right now."}</p>
      </article>
      <article class="portal-card">
        <small>Appointments</small>
        <h3>${snapshot.visits.length} on the board</h3>
        <p>${nextVisit ? `${formatDateTime(nextVisit.start)} is your next scheduled visit.` : "No upcoming appointments are on the board yet."}</p>
      </article>
      <article class="portal-card">
        <small>Documents</small>
        <h3>${snapshot.documents.length} available</h3>
        <p>Quotes, invoices, receipts, and statements stay gathered in one spot.</p>
      </article>
    </div>
    <section class="portal-list">
      ${snapshot.properties.map((property) => {
        const label = propertyCardLabel(property);
        const propertyQuotes = snapshot.quotes.filter((quote) => findDocumentForObject(snapshot.documents, "quote_pdf", quote.id)?.propertyLabel === label);
        const propertyInvoices = snapshot.invoices.filter((invoice) => findDocumentForObject(snapshot.documents, "invoice_pdf", invoice.id)?.propertyLabel === label);
        const propertyVisits = snapshot.visits.filter((visit) => propertyLabelForVisit(snapshot, visit) === label);
        return `<article class="portal-list-item">
          <div class="portal-list-row">
            <div>
              <strong>${escapeHtml(label)}</strong>
              <p>${escapeHtml([property.address.street1, property.address.city, property.address.province].filter(Boolean).join(", "))}</p>
            </div>
            <div class="portal-pills">
              <span>${propertyQuotes.length} quotes</span>
              <span>${propertyInvoices.length} invoices</span>
            </div>
          </div>
          ${property.access?.gateCode || property.access?.accessNotes ? `<p><strong>Access note:</strong> ${escapeHtml([property.access?.gateCode ? `Gate ${property.access.gateCode}` : "", property.access?.accessNotes ?? ""].filter(Boolean).join(" - "))}</p>` : ""}
          ${propertyVisits.length
            ? `<ul>${propertyVisits.slice(0, 2).map((visit) => `<li>${escapeHtml(formatDateTime(visit.start))}</li>`).join("")}</ul>`
            : `<p>No scheduled appointments are attached to this property yet.</p>`}
        </article>`;
      }).join("") || `<div class="portal-empty">This portal link does not have any properties attached yet.</div>`}
    </section>
    ${snapshot.clientFacingRequestNotes.length ? `<section class="portal-list"><article class="portal-list-item"><h3>Notes from the office</h3>${snapshot.clientFacingRequestNotes.map((note) => `<p>${escapeHtml(note.body)}</p><small>${escapeHtml(formatDateTime(note.createdAt))}</small>`).join("")}</article></section>` : ""}
    <div class="portal-button-row">
      <a class="portal-button" href="/nexportal/quotes">Review quotes</a>
      <a class="portal-button secondary" href="/nexportal/invoices">Open invoices</a>
      <a class="portal-button secondary" href="/nexportal/appointments">See appointments</a>
    </div>
  `;
  return pageFrame({
    branding: snapshot.branding,
    clientName: snapshot.client.name,
    active: "home",
    title: "Client hub",
    intro: "One secure place to review quotes, invoices, appointments, and shared documents for your work with this tenant.",
    body,
    counts: {
      quotes: snapshot.quotes.length,
      invoices: snapshot.invoices.length,
      appointments: snapshot.visits.length,
      documents: snapshot.documents.length
    },
    ...(options.statusMessage ? { statusMessage: options.statusMessage } : {})
  });
}

export function renderPortalAppointmentsHtml(
  snapshot: PortalHubSnapshot,
  options: {
    assignedTechniciansByVisitId?: Record<string, string[]> | undefined;
    confirmedVisitId?: string | undefined;
    statusMessage?: string | undefined;
  } = {}
): string {
  const body = snapshot.visits.length
    ? `<section class="portal-list">
        ${snapshot.visits.map((visit) => {
          const property = propertyLabelForVisit(snapshot, visit);
          const assigned = assignedFirstNames(options.assignedTechniciansByVisitId?.[visit.id] ?? []);
          const isConfirmed = Boolean(visit.confirmedAt);
          const visitDocuments = documentsForVisit(snapshot.documents, visit.id);
          return `<article class="portal-list-item">
            <div class="portal-list-row">
              <div>
                <strong>${escapeHtml(visit.title)}</strong>
                <p>${escapeHtml(formatDateTime(visit.start))} to ${escapeHtml(formatDateTime(visit.end))}</p>
              </div>
              <div class="portal-pills">
                <span>${escapeHtml(visit.status.replace(/_/g, " "))}</span>
                <span>${escapeHtml(property)}</span>
              </div>
            </div>
            <p>Assigned technician: <strong>${escapeHtml(assigned)}</strong></p>
            ${visit.confirmedAt ? `<p>Confirmed ${escapeHtml(formatDateTime(visit.confirmedAt))}.</p>` : `<p>Confirm this appointment if the arrival window still works for you.</p>`}
            ${visitDocuments.length ? `<p>${visitDocuments.length} shared field item${visitDocuments.length === 1 ? "" : "s"} are already attached to this visit.</p>` : ""}
            <div class="portal-button-row">
              ${!isConfirmed && visit.status !== "complete" && visit.status !== "cancelled" ? `
                <form method="post" action="/api/nexportal/visits/${encodeURIComponent(visit.id)}/confirm">
                  <button class="portal-button" type="submit">Confirm appointment</button>
                </form>` : ""}
              ${visitDocuments.slice(0, 3).map((document) => `<a class="portal-button secondary" href="${escapeHtml(document.href)}">${escapeHtml(document.kind === "photo" ? "Open photo" : "Open report")}</a>`).join("")}
            </div>
          </article>`;
        }).join("")}
      </section>`
    : `<div class="portal-empty">No scheduled appointments are visible in this portal session yet.</div>`;
  return pageFrame({
    branding: snapshot.branding,
    clientName: snapshot.client.name,
    active: "appointments",
    title: "Appointments",
    intro: "Confirm the upcoming visit window and review the on-site access notes tied to your property.",
    body,
    counts: {
      quotes: snapshot.quotes.length,
      invoices: snapshot.invoices.length,
      appointments: snapshot.visits.length,
      documents: snapshot.documents.length
    },
    statusMessage: options.confirmedVisitId
      ? "Appointment confirmed. The office and feed rail have been updated."
      : options.statusMessage
  });
}

export function renderPortalQuotesHtml(snapshot: PortalHubSnapshot): string {
  const body = snapshot.quotes.length
    ? `<section class="portal-list">
        ${snapshot.quotes.map((quote) => {
          const document = findDocumentForObject(snapshot.documents, "quote_pdf", quote.id);
          const dominantHref = `/nexportal/quotes/${encodeURIComponent(quote.id)}`;
          const dominantLabel = ["approved", "approved_internal"].includes(quote.status) ? "View approval" : "Review quote";
          return `<article class="portal-list-item">
            <div class="portal-list-row">
              <div>
                <strong>${escapeHtml(quote.title)}</strong>
                <p>${escapeHtml(quote.number ?? quote.id)} - ${escapeHtml(document?.propertyLabel ?? "Client")}</p>
              </div>
              <div class="portal-pills">
                <span>${escapeHtml(quoteBadge(quote.status))}</span>
                <span>${escapeHtml(money(quote.totals.total))}</span>
              </div>
            </div>
            <p>${quote.expiresAt ? `Expires ${escapeHtml(formatDateTime(quote.expiresAt))}.` : "Open the quote to review approval rules, deposit, and client comments."}</p>
            <div class="portal-button-row">
              <a class="portal-button" href="${escapeHtml(dominantHref)}">${escapeHtml(dominantLabel)}</a>
              ${document ? `<a class="portal-button secondary" href="${escapeHtml(document.href)}">Download PDF</a>` : ""}
            </div>
          </article>`;
        }).join("")}
      </section>`
    : `<div class="portal-empty">No quotes are visible in this portal session yet.</div>`;
  return pageFrame({
    branding: snapshot.branding,
    clientName: snapshot.client.name,
    active: "quotes",
    title: "Quotes",
    intro: "Review outstanding quotes, open approved proof, and download the exact PDF copy sent by the office.",
    body,
    counts: {
      quotes: snapshot.quotes.length,
      invoices: snapshot.invoices.length,
      appointments: snapshot.visits.length,
      documents: snapshot.documents.length
    }
  });
}

export function renderPortalInvoicesHtml(
  snapshot: PortalHubSnapshot,
  options: {
    paymentRecordedId?: string | undefined;
  } = {}
): string {
  const body = snapshot.invoices.length
    ? `<section class="portal-list">
        ${snapshot.invoices.map((invoice) => {
          const document = findDocumentForObject(snapshot.documents, "invoice_pdf", invoice.id);
          const dominantHref = `/nexportal/invoices/${encodeURIComponent(invoice.id)}`;
          const dominantLabel = invoice.status === "paid" ? "View receipt" : "Open invoice";
          const paymentRecorded = options.paymentRecordedId === invoice.id;
          return `<article class="portal-list-item">
            <div class="portal-list-row">
              <div>
                <strong>${escapeHtml(invoice.title)}</strong>
                <p>${escapeHtml(invoice.number ?? invoice.id)} - ${escapeHtml(document?.propertyLabel ?? "Client")}</p>
              </div>
              <div class="portal-pills">
                <span>${escapeHtml(invoice.status.replace(/_/g, " "))}</span>
                <span>${escapeHtml(invoiceBalanceLine(invoice))}</span>
              </div>
            </div>
            <p>${paymentRecorded ? "Payment was recorded on the prior step. The latest receipt and balance live inside this invoice detail." : "Open the invoice to pay online, review partial payments, and download the PDF or receipt history."}</p>
            <div class="portal-button-row">
              <a class="portal-button" href="${escapeHtml(dominantHref)}">${escapeHtml(dominantLabel)}</a>
              ${document ? `<a class="portal-button secondary" href="${escapeHtml(document.href)}">Download PDF</a>` : ""}
            </div>
          </article>`;
        }).join("")}
      </section>`
    : `<div class="portal-empty">No invoices are visible in this portal session yet.</div>`;
  return pageFrame({
    branding: snapshot.branding,
    clientName: snapshot.client.name,
    active: "invoices",
    title: "Invoices",
    intro: "Pay open balances, review paid receipts, and keep statement-ready billing history in one place.",
    body,
    counts: {
      quotes: snapshot.quotes.length,
      invoices: snapshot.invoices.length,
      appointments: snapshot.visits.length,
      documents: snapshot.documents.length
    }
  });
}

export function renderPortalDocumentsHtml(snapshot: PortalHubSnapshot): string {
  const body = snapshot.documents.length
    ? `<section class="portal-list">
        ${snapshot.documents.map((document) => `<article class="portal-list-item">
          <div class="portal-list-row">
            <div>
              <strong>${escapeHtml(document.label)}</strong>
              <p>${escapeHtml(document.propertyLabel)}</p>
            </div>
            <a class="portal-button secondary" href="${escapeHtml(document.href)}">Open document</a>
          </div>
          <small>${escapeHtml(formatDateTime(document.occurredAt))}</small>
        </article>`).join("")}
      </section>`
    : `<div class="portal-empty">No quotes, invoices, field reports, receipts, or shared photos are available in this session yet.</div>`;
  return pageFrame({
    branding: snapshot.branding,
    clientName: snapshot.client.name,
    active: "documents",
    title: "Documents",
    intro: "Download quotes, invoices, field reports, receipts, statements, and shared visit photos without calling the office for another copy.",
    body,
    counts: {
      quotes: snapshot.quotes.length,
      invoices: snapshot.invoices.length,
      appointments: snapshot.visits.length,
      documents: snapshot.documents.length
    }
  });
}

function renderPortalLibraryEntries(entries: NexDocsLibraryEntry[], tenantId: string, clientId: string): string {
  if (!entries.length) {
    return `<div class="portal-empty">Nothing is in this section yet.</div>`;
  }
  return `<section class="portal-list">
    ${entries.map((entry) => `<article class="portal-list-item">
      <div class="portal-list-row">
        <div>
          <strong>${escapeHtml(entry.label)}</strong>
          <p>${escapeHtml(entry.propertyLabel)}${entry.folderLabel ? ` | ${escapeHtml(entry.folderLabel)}` : ""}</p>
        </div>
        <a class="portal-button secondary" href="${escapeHtml(portalDocumentHref(tenantId, clientId, entry))}">Open</a>
      </div>
      <small>${escapeHtml(formatDateTime(entry.occurredAt))}</small>
    </article>`).join("")}
  </section>`;
}

export function renderUnifiedPortalDocumentsHtml(input: {
  snapshot: PortalHubSnapshot;
  tenantId: string;
  library: NexDocsClientLibrary;
  searchQuery?: string | undefined;
  uploadStatus?: string | undefined;
}): string {
  const searchQuery = input.searchQuery?.trim() ?? "";
  const folderCards = input.library.folders.map(({ folder, documents }) => `<article class="portal-card">
      <h3>${escapeHtml(folder.label)}</h3>
      <p>${documents.length} document${documents.length === 1 ? "" : "s"}</p>
      ${renderPortalLibraryEntries(documents, input.tenantId, input.snapshot.client.id)}
    </article>`).join("");
  const uploadStatus = input.uploadStatus?.trim()
    ? `<p class="portal-status">${escapeHtml(input.uploadStatus)}</p>`
    : "";
  const body = `
    <section class="portal-card">
      <div class="portal-list-row">
        <div>
          <h3>Search everything</h3>
          <p>Search across office records, your uploads, and the existing NexCam field rail from one place.</p>
        </div>
      </div>
      <form class="portal-list" method="get" action="/nexportal/documents">
        <input type="hidden" name="tenantId" value="${escapeHtml(input.tenantId)}" />
        <label>
          Search documents
          <input name="q" value="${escapeHtml(searchQuery)}" placeholder="Pool permit, invoice, leak report..." />
        </label>
        <button class="portal-button" type="submit">Search</button>
      </form>
      ${searchQuery
        ? input.library.searchResults.length
          ? `<div class="portal-card"><h3>Search results</h3>${renderPortalLibraryEntries(input.library.searchResults.map((hit) => hit.entry), input.tenantId, input.snapshot.client.id)}</div>`
          : `<div class="portal-empty">No unified document matches were found for "${escapeHtml(searchQuery)}".</div>`
        : ""}
    </section>
    <section class="portal-card">
      <h3>Upload a document</h3>
      <p>Share permits, certificates, plans, or any other client file directly into NexDocs.</p>
      ${uploadStatus}
      <form id="nexportal-upload-form" class="portal-list">
        <input type="hidden" name="tenantId" value="${escapeHtml(input.tenantId)}" />
        <label>
          Folder
          <select name="folderId">
            <option value="">Unfiled</option>
            ${input.library.folders.map(({ folder }) => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.label)}</option>`).join("")}
          </select>
        </label>
        <label>
          Label
          <input name="label" placeholder="Optional document label" />
        </label>
        <label>
          File
          <input name="file" type="file" required />
        </label>
        <button class="portal-button" type="submit">Upload document</button>
      </form>
      <script>
        (() => {
          const form = document.getElementById("nexportal-upload-form");
          if (!form) return;
          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const fileInput = form.querySelector('input[name="file"]');
            const tenantInput = form.querySelector('input[name="tenantId"]');
            const folderInput = form.querySelector('select[name="folderId"]');
            const labelInput = form.querySelector('input[name="label"]');
            const file = fileInput && fileInput.files ? fileInput.files[0] : null;
            if (!file || !tenantInput) return;
            const fileBase64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = typeof reader.result === "string" ? reader.result : "";
                resolve(result.split(",")[1] || "");
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            const response = await fetch("/api/nexportal/documents/upload", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                tenantId: tenantInput.value,
                folderId: folderInput && folderInput.value ? folderInput.value : undefined,
                label: labelInput && labelInput.value ? labelInput.value : undefined,
                fileName: file.name,
                mimeType: file.type || "application/octet-stream",
                fileBase64
              })
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
              const message = body && typeof body.error === "string" ? body.error : "Upload failed.";
              window.location.href = "/nexportal/documents?tenantId=" + encodeURIComponent(tenantInput.value) + "&status=" + encodeURIComponent(message);
              return;
            }
            window.location.href = "/nexportal/documents?tenantId=" + encodeURIComponent(tenantInput.value) + "&status=" + encodeURIComponent("Document uploaded.");
          });
        })();
      </script>
    </section>
    <section class="portal-card">
      <h3>Your folders</h3>
      <p>These are the freeform NexDocs folders the office uses for permits, certifications, plans, and other client files.</p>
      ${folderCards || `<div class="portal-empty">No custom folders are set up for this client yet.</div>`}
      ${input.library.unfiled.length ? `<article class="portal-card"><h3>Unfiled</h3>${renderPortalLibraryEntries(input.library.unfiled, input.tenantId, input.snapshot.client.id)}</article>` : ""}
    </section>
    <section class="portal-card">
      <h3>Office records</h3>
      <p>Quotes, invoices, receipts, and statements now live inside the same NexDocs library instead of a separate document rail.</p>
      ${renderPortalLibraryEntries(input.library.officeRecords, input.tenantId, input.snapshot.client.id)}
    </section>
    <section class="portal-card">
      <h3>NexCam field rail</h3>
      <p>The field team's existing auto-organized photos, reports, and signoffs stay intact and browse alongside your folders.</p>
      <div class="portal-grid">
        <article class="portal-card">
          <h3>Reports</h3>
          ${renderPortalLibraryEntries(input.library.nexcam.reports, input.tenantId, input.snapshot.client.id)}
        </article>
        <article class="portal-card">
          <h3>Signed documents</h3>
          ${renderPortalLibraryEntries(input.library.nexcam.signedDocuments, input.tenantId, input.snapshot.client.id)}
        </article>
        <article class="portal-card">
          <h3>Photos and media</h3>
          ${renderPortalLibraryEntries(input.library.nexcam.media, input.tenantId, input.snapshot.client.id)}
        </article>
      </div>
    </section>
  `;
  return pageFrame({
    branding: input.snapshot.branding,
    clientName: input.snapshot.client.name,
    active: "documents",
    title: "Documents",
    intro: "Search, download, and upload everything in one NexDocs library without splitting office records away from field documentation.",
    body,
    counts: {
      quotes: input.snapshot.quotes.length,
      invoices: input.snapshot.invoices.length,
      appointments: input.snapshot.visits.length,
      documents: input.library.counts.total
    },
    ...(input.uploadStatus?.trim() ? { statusMessage: input.uploadStatus.trim() } : {})
  });
}

export function renderPortalReverifyHtml(input: {
  branding: TenantBranding;
  clientName: string;
  tenantId: string;
  sessionId: string;
  returnPath?: string | undefined;
  statusMessage?: string | undefined;
}): string {
  const body = `
    <article class="portal-card">
      <h3>Re-verify this device</h3>
      <p>For security, this portal needs one fresh check after 14 days without a new magic link.</p>
      <form class="portal-list" method="post" action="/api/nexportal/reverify/phone">
        <input type="hidden" name="tenantId" value="${escapeHtml(input.tenantId)}" />
        <input type="hidden" name="sessionId" value="${escapeHtml(input.sessionId)}" />
        <input type="hidden" name="returnPath" value="${escapeHtml(input.returnPath ?? "/nexportal")}" />
        <label>
          Last 4 digits of the phone on file
          <input name="last4" inputmode="numeric" maxlength="4" />
        </label>
        <button class="portal-button" type="submit">Verify phone</button>
      </form>
    </article>
  `;
  return pageFrame({
    branding: input.branding,
    clientName: input.clientName,
    active: "home",
    title: "Re-verify portal access",
    intro: "You can always use a fresh magic link, or verify this device with the last four digits of the phone on file.",
    body,
    counts: { quotes: 0, invoices: 0, appointments: 0, documents: 0 },
    ...(input.statusMessage ? { statusMessage: input.statusMessage } : {})
  });
}

export function renderPortalReviewLandingHtml(input: {
  branding: TenantBranding;
  clientName: string;
  jobTitle: string;
  message?: string | undefined;
}): string {
  const body = `
    <article class="portal-card">
      <h3>Thanks for taking a minute</h3>
      <p>This request is tied to <strong>${escapeHtml(input.jobTitle)}</strong>. Review completion is still tracked manually until the Google Business Profile connection is wired in, so the office may still follow up if they do not see a review land.</p>
      <p>If you already left the review, you do not need to do anything else here.</p>
    </article>
  `;
  return pageFrame({
    branding: input.branding,
    clientName: input.clientName,
    active: "home",
    title: "Review request",
    intro: "Your feedback helps the crew and the office know what is working in the field.",
    body,
    counts: { quotes: 0, invoices: 0, appointments: 0, documents: 0 },
    ...(input.message ? { statusMessage: input.message } : {})
  });
}

export function renderPortalOptOutHtml(input: {
  branding: TenantBranding;
  clientName: string;
  stopped: boolean;
}): string {
  const body = `
    <article class="portal-card">
      <h3>${input.stopped ? "You are opted out" : "Review requests are still active"}</h3>
      <p>${input.stopped
        ? "Future review-request nudges for this job have been stopped. Transactional emails and texts still follow their own settings."
        : "This review-request link is no longer active."}</p>
    </article>
  `;
  return pageFrame({
    branding: input.branding,
    clientName: input.clientName,
    active: "home",
    title: "Review-request preference",
    intro: "This page only controls review follow-up messages for the linked job.",
    body,
    counts: { quotes: 0, invoices: 0, appointments: 0, documents: 0 }
  });
}
