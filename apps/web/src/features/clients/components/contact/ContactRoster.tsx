import React from "react";
import { NexOpsNavGlyph } from "../../../nexopsShell/workspaceSupport";
import { isImportedHistoryRecord } from "./domain/clientProfile";

export interface ContactRosterClient {
  id: string;
  company?: string;
  phones: string[];
  emails: string[];
  tags?: string[];
  customFields?: Record<string, string | number | boolean>;
}

interface ContactRosterProps<Client extends ContactRosterClient> {
  status: string;
  activeCount: number;
  leadCount: number;
  textReadyCount: number;
  propertyCount: number;
  query: string;
  clients: Client[];
  selectedClientId: string;
  clientDisplayName: (client: Client) => string;
  contactSummary: (client: Client) => string;
  clientPrimaryAddress: (client: Client) => string;
  clientStatusLabel: (client: Client) => string;
  onQueryChange: (value: string) => void;
  onOpenClient: (clientId: string) => void;
  onNewClient: () => void;
  onImport: () => void;
  onRefresh: () => void;
}

export function ContactRoster<Client extends ContactRosterClient>(props: ContactRosterProps<Client>): React.ReactElement {
  return (
    <section className="nexops-clients-workspace">
      <div className="nexops-clients-heading">
        <div>
          <h1 className="nexops-page-title-with-icon"><NexOpsNavGlyph module="clients" /><span>Clients</span></h1>
          <p>{props.status} Open any row to move into the full client workspace.</p>
        </div>
        <div className="nexops-client-actions">
          <button type="button" onClick={props.onNewClient}>New Client</button>
          <button type="button" onClick={props.onImport}>Import CSV</button>
          <button type="button" onClick={props.onRefresh}>Refresh</button>
        </div>
      </div>

      <div className="nexops-client-stats" aria-label="Client metrics">
        <article><span>Active Clients</span><strong>{props.activeCount}</strong><small>Native NexOps</small></article>
        <article><span>Leads</span><strong>{props.leadCount}</strong><small>Ready for follow-up</small></article>
        <article><span>Text-Ready</span><strong>{props.textReadyCount}</strong><small>Mobile confirmed</small></article>
        <article><span>Sites</span><strong>{props.propertyCount}</strong><small>Multi-site hierarchy</small></article>
      </div>

      <div className="nexops-client-controls">
        <button type="button">Filter by Tag +</button>
        <button type="button">Status | Leads and Active</button>
        <label>
          <span className="sr-only">Search Clients</span>
          <input value={props.query} placeholder="Search Clients..." onChange={(event) => props.onQueryChange(event.target.value)} />
        </label>
      </div>

      <div className="nexops-client-layout compact">
        <section className="nexops-client-table-card" aria-label="Client list">
          <div className="nexops-client-table">
            <div className="nexops-client-table-head">
              <span>Name</span><span>Primary Address</span><span>Contact</span><span>Status</span><span>Last Activity</span>
            </div>
            {props.clients.map((client) => (
              <button
                className={`nexops-client-table-row ${props.selectedClientId === client.id ? "selected" : ""}`}
                key={client.id}
                type="button"
                onClick={() => props.onOpenClient(client.id)}
              >
                <span>
                  <strong>{props.clientDisplayName(client)}</strong>
                  <small>{client.company?.trim() ? client.company : props.contactSummary(client)}</small>
                  {isImportedHistoryRecord(client) ? <small className="nexops-client-imported-history">Imported History</small> : null}
                </span>
                <span>{props.clientPrimaryAddress(client)}</span>
                <span>{props.selectedClientId === client.id ? "Open Now" : (client.phones[0] ?? client.emails[0] ?? "No Contact Saved")}</span>
                <span><mark>{props.clientStatusLabel(client)}</mark></span>
                <span>{client.tags?.[0] ?? "Native Record"}</span>
              </button>
            ))}
            {!props.clients.length ? (
              <div className="nexops-client-empty"><h2>No clients match this view yet</h2><p>Create one, import a CSV, or start from a native request.</p></div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
