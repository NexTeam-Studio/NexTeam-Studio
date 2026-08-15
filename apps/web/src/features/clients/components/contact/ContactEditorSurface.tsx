import React, { Suspense } from "react";
import { NexOpsCreateClientPanel } from "./NexOpsCreateClientPanel";

type CreateClientPanelProps = React.ComponentProps<typeof NexOpsCreateClientPanel>;

interface ContactEditorSurfaceProps extends Omit<CreateClientPanelProps, "layout" | "surface"> {
  mobile: boolean;
}

export function ContactEditorSurface(props: ContactEditorSurfaceProps): React.ReactElement {
  const editing = props.mode === "edit";
  const returnLabel = editing ? "Back to Client Overview" : "Back to Client Roster";
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
      mobile={props.mobile}
      onClose={props.onClose}
      onSubmit={props.onSubmit}
    />
  );

  if (props.mobile) {
    return (
      <Suspense fallback={<section className="nexops-mobile-client-screen"><p className="eyebrow">Loading</p><h2>{editing ? "Opening Client Editor" : "Opening New Client"}</h2><p>Pulling the mobile intake form into place now.</p></section>}>
        {panel}
      </Suspense>
    );
  }

  return (
    <section className="nexops-client-profile nexops-client-form-workspace">
      <div className="nexops-client-profile-header-card nexops-client-profile-brand-header nexops-client-form-workspace-header">
        <div className="nexops-client-profile-header-actions">
          <button className="nexops-link-button nexops-client-profile-back-bubble" type="button" onClick={props.onClose}>
            <span aria-hidden="true">←</span> {returnLabel}
          </button>
          <span className="nexops-status-pill">{editing ? "Edit Client" : "New Client"}</span>
        </div>
        <div className="nexops-client-profile-heading">
          <div>
            <p className="eyebrow">Client Workspace</p>
            <h1>{editing ? "Edit Client" : "New Client"}</h1>
            <p>{editing ? "Update the current Client record in the same organized workspace used for new records." : "Start with the primary contact and service address, then save into the full Client rail before adding anything else."}</p>
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
          <article><span>Save result</span><strong>{editing ? "Returns to the full Client workspace" : "Opens the full Client workspace"}</strong></article>
          <article><span>Billing</span><strong>Lives on the parent Client</strong></article>
        </div>
      </div>

      <Suspense fallback={<section className="nexops-client-profile-panel"><p className="eyebrow">Loading</p><h2>{editing ? "Opening Client Editor" : "Opening New Client Workspace"}</h2><p>Pulling the Client details form into place now.</p></section>}>
        {panel}
      </Suspense>
    </section>
  );
}
