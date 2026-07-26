import React from "react";

export function InvoicesSurface(): React.ReactElement {
  return (
    <section className="invoices-surface">
      <p className="ui-eyebrow">NexOps Invoices</p>
      <h1>Invoice UI can evolve without sharing quote or job files.</h1>
      <p>
        This route is the browser seam for invoice PDFs, checkout launch, paid-state receipts, and customer portal
        follow-through. Invoice work now has its own home instead of competing with broader platform overview changes.
      </p>
      <p className="invoices-surface__meta">
        Current backend ownership: invoice creation from signed quotes, invoice PDFs, Stripe checkout, and webhook-paid updates.
      </p>
    </section>
  );
}
