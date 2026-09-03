import React, { useMemo, useState } from "react";
import { NexOpsNavGlyph } from "../../../nexopsShell/workspaceSupport";
import { NexOpsRosterSurface, NexOpsRosterTemplate } from "../../../../shared/ui/NexOpsBusinessTemplates";
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
  hasMoreClients: boolean;
  loadingMoreClients: boolean;
  onLoadMoreClients: () => void;
}

export function ContactRoster<Client extends ContactRosterClient>(props: ContactRosterProps<Client>): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<"all" | ClientRosterStatus>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [sort] = useState<ClientRosterSort>("name-asc");
  const [filterOpen, setFilterOpen] = useState(false);
  const tagOptions = useMemo(() => rosterTagOptions(props.clients), [props.clients]);
  const visibleClients = useMemo(() => filterAndSortRosterClients({
    clients: props.clients,
    status: statusFilter,
    tag: tagFilter,
    sort,
    displayName: props.clientDisplayName
  }), [props.clients, props.clientDisplayName, sort, statusFilter, tagFilter]);

  return (
      <NexOpsRosterTemplate
        title="Clients"
        detail={`${props.status} Open any row to move into the full Client workspace.`}
        icon={<NexOpsNavGlyph module="clients" />}
        primaryAction={<button className="nexops-hero-primary-button" type="button" onClick={props.onNewClient}>New Client</button>}
        secondaryActions={<>
          <button type="button" onClick={props.onImport}>Import CSV</button>
          <button type="button" onClick={props.onRefresh}>Refresh</button>
        </>}
      >
      <NexOpsRosterSurface ariaLabel="Search and filter clients" searchTitle="Search Clients" resultCount={visibleClients.length} resultNoun="Client" showResults={Boolean(props.clients.length || props.query.trim() || tagFilter || statusFilter !== "all")}
        search={<label className="nexops-quote-roster-search"><span className="sr-only">Search Clients</span><input value={props.query} placeholder="Search Clients" onChange={(event) => props.onQueryChange(event.target.value)} /></label>}
        filter={<button className="nexops-jobs-filter-pill nexops-quote-filter-trigger" type="button" aria-expanded={filterOpen} onClick={() => setFilterOpen((current) => !current)}><span className="nexops-quote-filter-icon" aria-hidden="true">☷</span><span className="nexops-quote-filter-label">Filter</span></button>}
        filterOptions={filterOpen ? <div className="nexops-quote-filter-options" aria-label="Client filters"><label className="nexops-field"><span>Filter by Tag</span><select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">All Tags</option>{tagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label>{(["all", "active", "lead", "archived"] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={statusFilter === value} className={`nexops-jobs-filter-pill${statusFilter === value ? " active" : ""}`} onClick={() => setStatusFilter(value)}><span>{value === "all" ? "All Clients" : value === "lead" ? "Leads & Prospects" : `${value[0].toUpperCase()}${value.slice(1)} Clients`}</span><small>{value === "all" ? props.clients.length : props.clients.filter((client) => clientRosterStatusLabel(client, props.clientStatusLabel(client)).toLowerCase() === value).length}</small></button>)}</div> : null}
        empty={!visibleClients.length ? <div className="nexops-quote-filtered-empty"><h2>No Clients Match This View</h2><p>Create one, import a CSV, or change the current filters.</p></div> : undefined}>
          {visibleClients.map((client) => <article className="nexops-quote-filtered-row expanded" key={client.id}>
            <button className="nexops-quote-filtered-identity-banner" type="button" onClick={() => props.onOpenClient(client.id)}><span className="nexops-quote-filtered-identity"><strong>{props.clientDisplayName(client)}</strong><small>{client.company?.trim() ? client.company : props.contactSummary(client)}</small></span></button>
            <div className="nexops-quote-filtered-details"><span className="nexops-quote-filtered-title" data-label="Primary Address">{props.clientPrimaryAddress(client)}</span><span className="nexops-quote-filtered-updated" data-label="Contact">{client.phones[0] ?? client.emails[0] ?? "No contact saved"}</span><span className="nexops-quote-filtered-status" data-label="Status"><mark>{clientRosterStatusLabel(client, props.clientStatusLabel(client))}</mark></span><span className="nexops-quote-filtered-activity" data-label="Client Record"><small>{client.tags?.[0] ? `Tag · ${client.tags[0]}` : "No recent activity"}</small><button className="nexops-quote-filtered-open" type="button" onClick={() => props.onOpenClient(client.id)}>Open Client <span aria-hidden="true">→</span></button></span></div>
          </article>)}
          {props.hasMoreClients ? <button className="nexops-hero-primary-button" type="button" disabled={props.loadingMoreClients} onClick={props.onLoadMoreClients}>{props.loadingMoreClients ? "Loading clients…" : "Load more clients"}</button> : null}
      </NexOpsRosterSurface>
      </NexOpsRosterTemplate>
  );
}
