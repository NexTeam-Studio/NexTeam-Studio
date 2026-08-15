import React, { Suspense } from "react";
import { NexOpsCreateClientPanel } from "./NexOpsCreateClientPanel";

type CreateClientPanelProps = React.ComponentProps<typeof NexOpsCreateClientPanel>;

interface ContactEditorSurfaceProps extends Omit<CreateClientPanelProps, "layout" | "surface"> {
  mobile: boolean;
}

export function ContactEditorSurface(props: ContactEditorSurfaceProps): React.ReactElement {
  const editing = props.mode === "edit";
  const panel = (
    <NexOpsCreateClientPanel
      tenantId={props.tenantId}
      newClient={props.newClient}
      setNewClient={props.setNewClient}
      createStatus={props.createStatus}
      createClientCanSave={props.createClientCanSave}
      createClientMissingFields={props.createClientMissingFields}
      leadSourceOptions={props.leadSourceOptions}
      mode={props.mode}
      surface="client"
      layout="page"
      onClose={props.onClose}
      onSubmit={props.onSubmit}
    />
  );

  if (props.mobile) {
    return (
      <Suspense fallback={<section className="nexops-mobile-client-screen"><p className="eyebrow">Loading</p><h2>{editing ? "Opening client editor" : "Opening new client"}</h2><p>Pulling the mobile intake form into place now.</p></section>}>
        {panel}
      </Suspense>
    );
  }

  return (
    <section className="nexops-client-profile">
      <div className="nexops-client-profile-header-card nexops-client-profile-brand-header nexops-client-form-workspace-header">
        <div className="nexops-client-profile-header-actions">
          <button className="nexops-link-button nexops-client-profile-back-bubble" type="button" onClick={props.onClose}>← {editing ? "Back to Client Overview" : "Back to Client Roster"}</button>
          <span className="nexops-status-pill">{editing ? "Edit client" : "New client"}</span>
        </div>
        <div className="nexops-client-profile-heading">
          <div>
            <p className="eyebrow">Client workspace</p>
            <h1>{editing ? "Edit client" : "New client"}</h1>
            <p>{editing ? "Update the current client record in the same intake workspace used for new records." : "Start with the primary contact and service address, then save into the full client rail before adding anything else."}</p>
          </div>
          <div className="nexops-inline-actions wrap">
            <span className="nexops-client-create-summary">
              {props.createClientCanSave
                ? (editing ? "Ready to save changes. Name, address, and telephone are present." : "Ready to save. Name, address, and telephone are present.")
                : `Still needed: ${props.createClientMissingFields.join(", ")}.`}
            </span>
          </div>
        </div>
        <div className="nexops-client-profile-meta">
          <article><span>Required</span><strong>Name, address, telephone</strong></article>
          <article><span>Email</span><strong>Optional but recommended</strong></article>
          <article><span>Save result</span><strong>{editing ? "Returns to the full client workspace" : "Opens the full client workspace"}</strong></article>
          <article><span>Billing</span><strong>Lives on the parent client</strong></article>
        </div>
      </div>

      <Suspense fallback={<section className="nexops-client-profile-panel"><p className="eyebrow">Loading</p><h2>{editing ? "Opening client editor" : "Opening new client workspace"}</h2><p>Pulling the client details form into place now.</p></section>}>
        {panel}
      </Suspense>
    </section>
  );
}
