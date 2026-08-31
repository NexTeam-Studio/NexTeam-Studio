import React from "react";
import type { CrmClient, CrmInvoice, CrmJob, CrmQuote } from "../contracts/workspaceContracts";
import { clientDisplayName, clientPrimaryAddress, clientStatusLabel, contactSummary, intakeSurfaceSummary } from "../workspaceSupport";
import { NexOpsNavGlyph } from "../workspaceSupport";
import { ModuleHeroCard } from "../../../shared/ui/NexOpsBusinessTemplates";
import type { NexOpsModule } from "../domain/nexopsNavigation";

export function NexOpsLegacyLifecyclePage(props: {
  module: NexOpsModule;
  clients: CrmClient[];
  quotes: CrmQuote[];
  jobs: CrmJob[];
  invoices: CrmInvoice[];
  tenantId: string;
}): React.ReactElement {
  const { module, clients, quotes, jobs, invoices, tenantId } = props;
  const money = (value?: number) => `$${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const clientName = (clientId: string) => clientDisplayName(clients.find((client) => client.id === clientId) ?? {
    id: clientId,
    tenantId: tenantId,
    name: clientId,
    emails: [],
    phones: [],
    consent: { email: false, sms: false }
  });
  const labels: Record<string, { title: string; subtitle: string; primaryAction: string; items: string[]; records: Array<{ id: string; title: string; detail: string; status: string; amount?: string }> }> = {
    requests: {
      title: "Requests",
      subtitle: "Lead and client request intake",
      primaryAction: "New request",
      items: ["Manual request creation", "Embeddable form target", "Convert request to quote/job"],
      records: clients
        .filter((client) => clientStatusLabel(client).toLowerCase().includes("lead"))
        .map((client) => ({
          id: client.id,
          title: clientDisplayName(client),
          detail: clientPrimaryAddress(client) || contactSummary(client),
          status: "Lead"
        }))
    },
    quotes: {
      title: "Quotes",
      subtitle: "Catalog, templates, approval links, and expiry",
      primaryAction: "Draft quote",
      items: ["Draft quote from catalog", "Send by email/text/both through ApprovalQueue", "Client approval through NexPortal"],
      records: quotes.map((quote) => ({
        id: quote.id,
        title: quote.title,
        detail: [clientName(quote.clientId), intakeSurfaceSummary(quote.intake, "quote")].filter(Boolean).join(" - "),
        status: quote.status,
        amount: money(quote.totals.total)
      }))
    },
    jobs: {
      title: "Jobs",
      subtitle: "Approved work, visits, closeout, and field handoff",
      primaryAction: "New job",
      items: ["Quote-to-job conversion", "Assigned visits", "NexCam report rollup"],
      records: jobs.map((job) => ({
        id: job.id,
        title: job.title,
        detail: [clientName(job.clientId), job.startAt ? new Date(job.startAt).toLocaleString() : "", intakeSurfaceSummary(job.intake, "job")].filter(Boolean).join(" - "),
        status: job.status.replace("_", " "),
        amount: money(job.totals?.total)
      }))
    },
    invoices: {
      title: "Invoices",
      subtitle: "Billing, PDF invoices, checkout, and receipts",
      primaryAction: "Create invoice",
      items: ["Invoice from signed quote", "Stripe test checkout", "Attach NexCam report PDF on receipt"],
      records: invoices.map((invoice) => ({
        id: invoice.id,
        title: invoice.title,
        detail: [clientName(invoice.clientId), intakeSurfaceSummary(invoice.intake, "invoice")].filter(Boolean).join(" - "),
        status: invoice.status,
        amount: money(invoice.totals.total)
      }))
    },
    payments: {
      title: "Payments",
      subtitle: "Payment state, deposits, balances, and methods",
      primaryAction: "Record payment",
      items: ["Stripe test-mode receipts", "Deposit/payment schedule scaffold", "No live charges without approval"],
      records: invoices
        .filter((invoice) => invoice.status === "paid" || invoice.status === "partial_pay")
        .map((invoice) => ({
          id: invoice.id,
          title: invoice.title,
          detail: clientName(invoice.clientId),
          status: invoice.status,
          amount: money(invoice.totals.total)
        }))
    }
  };
  const page = labels[module] ?? {
    title: "NexOps",
    subtitle: "Module scaffold",
    primaryAction: "Create",
    items: [],
    records: []
  };
  return (
    <section className="nexops-module-page">
      <ModuleHeroCard title={page.title} detail={page.subtitle} icon={<NexOpsNavGlyph module={module} />} primaryAction={<button className="nexops-hero-primary-button" type="button">{page.primaryAction}</button>} />
      <div className="nexops-module-grid nexops-module-grid-wide">
        <article className="nexops-module-card">
          <p className="eyebrow">Live native records</p>
          <h2>{page.records.length} visible</h2>
          {page.records.length ? (
            <ul className="nexops-record-list">
              {page.records.slice(0, 12).map((record) => (
                <li key={record.id}>
                  <span>
                    <strong>{record.title}</strong>
                    <small>{record.detail}</small>
                  </span>
                  <mark>{record.status}</mark>
                  {record.amount ? <b>{record.amount}</b> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No native {page.title.toLowerCase()} are loaded yet. Use create/import/sync, then refresh this page.</p>
          )}
        </article>
        <article className="nexops-module-card">
          <p className="eyebrow">Next build receipts</p>
          <h2>What lands here</h2>
          <ul className="nexops-checklist">
            {page.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </div>
    </section>
  );
}

