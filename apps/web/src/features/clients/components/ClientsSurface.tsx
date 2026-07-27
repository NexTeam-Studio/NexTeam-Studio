import React from "react";

export function ClientsSurface(): React.ReactElement {
  return (
    <section className="clients-surface">
      <p className="ui-eyebrow">NexOps Clients</p>
      <h1>Client records own their own surface now.</h1>
      <p>
        This route is the landing seam for browser-side client lookup, creation, and profile work.
        The current server capability already lives in the CRM module and Nexi tools, but future client UI work no
        longer has to edit the shared platform overview to land here.
      </p>
      <p className="clients-surface__meta">
        Current backend ownership: native CRM clients, legacy CRM imports, and tenant-scoped client lookup.
      </p>
    </section>
  );
}
