import React, { useMemo, useState } from "react";
import { NexOpsNavGlyph } from "../../../nexopsShell/workspaceSupport";
import { isImportedHistoryRecord } from "./domain/clientProfile";
import {
  clientRosterStatusLabel,
  filterAndSortRosterClients,
  rosterTagOptions,
  type ClientRosterSort,
  type ClientRosterStatus
} from "./domain/clientRoster";

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
  const [statusFilter, setStatusFilter] = useState<"all" | ClientRosterStatus>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState<ClientRosterSort>("name-asc");
  const tagOptions = useMemo(() => rosterTagOptions(props.clients), [props.clients]);
  const visibleClients = useMemo(() => filterAndSortRosterClients({
    clients: props.clients,
    status: statusFilter,
    tag: tagFilter,
    sort,
    displayName: props.clientDisplayName
  }), [props.clients, props.clientDisplayName, sort, statusFilter, tagFilter]);

  return (
    <section className="nexops-clients-workspace">
      <div className="nexops-clients-heading">
        <div className="nexops-clients-heading-copy">
          <span className="nexops-clients-heading-eyebrow">NexOps Client Manager</span>
          <h1 className="nexops-page-title-with-icon"><NexOpsNavGlyph module="clients" /><span>Clients</span></h1>
          <p>{props.status} Open any row to move into the full Client workspace.</p>
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
        <label className="nexops-client-control-field">
          <span>Filter by Tag</span>
          <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} aria-label="Filter clients by tag">
            <option value="">All tags</option>
            {tagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </label>
        <label className="nexops-client-control-field">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | ClientRosterStatus)} aria-label="Filter clients by status">
            <option value="all">All statuses</option>
            <option value="active">Active clients</option>
            <option value="lead">Leads &amp; prospects</option>
            <option value="archived">Archived clients</option>
          </select>
        </label>
        <label className="nexops-client-control-field">
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as ClientRosterSort)} aria-label="Sort clients">
            <option value="name-asc">Name, A–Z</option>
            <option value="name-desc">Name, Z–A</option>
            <option value="status">Status</option>
          </select>
        </label>
        <label className="nexops-client-search-field">
          <span className="sr-only">Search Clients</span>
          <input value={props.query} placeholder="Search Clients..." onChange={(event) => props.onQueryChange(event.target.value)} />
        </label>
      </div>

      <div className="nexops-client-layout compact">
        <section className="nexops-client-table-card" aria-label="Client list">
          <div className="nexops-client-table">
            <div className="nexops-client-table-head">
              <span>Name</span><span>Primary Address</span><span>Contact</span><span>Status</span><span>Client record</span>
            </div>
            {visibleClients.map((client) => (
              <button
                className={`nexops-client-table-row ${props.selectedClientId === client.id ? "selected" : ""}`}
                key={client.id}
                type="button"
                onClick={() => props.onOpenClient(client.id)}
              >
                <span className="nexops-client-row-identity" data-label="Client">
                  <strong>{props.clientDisplayName(client)}</strong>
                  <small>{client.company?.trim() ? client.company : props.contactSummary(client)}</small>
                  {isImportedHistoryRecord(client) ? <small className="nexops-client-imported-history">Imported history</small> : null}
                </span>
                <span className="nexops-client-row-address" data-label="Primary address">{props.clientPrimaryAddress(client)}</span>
                <span className="nexops-client-row-contact" data-label="Contact">{props.selectedClientId === client.id ? "Open now" : (client.phones[0] ?? client.emails[0] ?? "No contact saved")}</span>
                <span className="nexops-client-row-status" data-label="Status"><mark>{clientRosterStatusLabel(client, props.clientStatusLabel(client))}</mark></span>
                <span className="nexops-client-row-activity" data-label="Client record">
                  <small>{client.tags?.[0] ? `Tag · ${client.tags[0]}` : "No recent activity"}</small>
                  <span className="nexops-client-row-open">Open Client <span aria-hidden="true">→</span></span>
                </span>
              </button>
            ))}
            {!visibleClients.length ? (
              <div className="nexops-client-empty"><h2>No clients match this view yet</h2><p>Create one, import a CSV, or start from a native request.</p></div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
