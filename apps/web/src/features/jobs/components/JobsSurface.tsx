import React from "react";

export function JobsSurface(): React.ReactElement {
  return (
    <section className="jobs-surface">
      <p className="ui-eyebrow">NexOps Jobs</p>
      <h1>Job pipeline work has its own route seam now.</h1>
      <p>
        This route is reserved for browser-side job pipeline, payment-state, and closeout views that are distinct from
        the scheduling board. Job changes can now land without sharing a file with client lookup, quote drafting, or
        the platform tenant overview.
      </p>
      <p className="jobs-surface__meta">
        Current backend ownership: native CRM jobs, payment state transitions, and event hooks like `invoice.paid`.
      </p>
    </section>
  );
}
