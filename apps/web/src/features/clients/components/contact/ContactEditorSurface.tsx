import React, { Suspense } from "react";
import { NexOpsCreateClientPanel } from "./NexOpsCreateClientPanel";
import { NexOpsCreationTemplate } from "../../../../shared/ui/NexOpsBusinessTemplates";
import { NexOpsNavGlyph } from "../../../nexopsShell/workspaceSupport";

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

  return (
    <NexOpsCreationTemplate
      title={editing ? "Edit Client" : "Create Client"}
      detail={editing ? "Update the client record without losing its relationship, property, or communication context." : "Add the client relationship, service address, and communication details before saving."}
      icon={<NexOpsNavGlyph module="clients" />}
      heroClassName="module-hero-card--quote"
      backAction={<button className="nexops-quote-primary-button nexops-quote-back-to-roster" type="button" onClick={props.onClose}>← {returnLabel.replace("Back to ", "")}</button>}
    >
      <Suspense fallback={<section className="nexops-client-profile-panel"><p className="eyebrow">Loading</p><h2>{editing ? "Opening Client Editor" : "Opening New Client Workspace"}</h2><p>Pulling the Client details form into place now.</p></section>}>
        {panel}
      </Suspense>
    </NexOpsCreationTemplate>
  );
}
