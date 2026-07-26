import React from "react";

export function QuotesSurface(): React.ReactElement {
  return (
    <section className="quotes-surface">
      <p className="ui-eyebrow">NexOps Quotes</p>
      <h1>Quote drafting is isolated from the rest of the platform shell.</h1>
      <p>
        This route owns the future browser surface for approval-gated quote drafting, PDF review, and portal handoff.
        The underlying CRM quote builder already exists server-side, but quote UI work can now stay inside quote-owned
        files instead of reopening platform overview code.
      </p>
      <p className="quotes-surface__meta">
        Current backend ownership: quote drafting, approval queue artifacts, portal tokens, and quote PDF generation.
      </p>
    </section>
  );
}
