export type ClientRosterStatus = "active" | "lead" | "archived";
export type ClientRosterSort = "name-asc" | "name-desc" | "status";

export interface RosterClient {
  tags?: string[];
}

function normalizedTags(client: RosterClient): string[] {
  return (client.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
}

/**
 * The client model stores roster state as tags. Keep this projection local to
 * the roster so it does not create or persist a parallel lifecycle state.
 */
export function clientRosterStatus(client: RosterClient): ClientRosterStatus {
  const tags = normalizedTags(client);
  if (tags.includes("archived")) return "archived";
  if (tags.includes("lead") || tags.includes("prospect")) return "lead";
  return "active";
}

export function clientRosterStatusLabel(client: RosterClient, fallbackLabel: string): string {
  const status = clientRosterStatus(client);
  if (status === "archived") return "Archived";
  if (status === "lead") return fallbackLabel === "Lead" ? fallbackLabel : "Lead";
  return fallbackLabel;
}

export function rosterTagOptions(clients: RosterClient[]): string[] {
  return [...new Set(clients.flatMap((client) => client.tags ?? []).map((tag) => tag.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

export function filterAndSortRosterClients<Client extends RosterClient>(input: {
  clients: Client[];
  status: "all" | ClientRosterStatus;
  tag: string;
  sort: ClientRosterSort;
  displayName: (client: Client) => string;
}): Client[] {
  const tag = input.tag.trim().toLowerCase();
  const statusRank: Record<ClientRosterStatus, number> = { lead: 0, active: 1, archived: 2 };
  return input.clients
    .filter((client) => input.status === "all" || clientRosterStatus(client) === input.status)
    .filter((client) => !tag || normalizedTags(client).includes(tag))
    .toSorted((left, right) => {
      const nameComparison = input.displayName(left).localeCompare(input.displayName(right), undefined, { sensitivity: "base" });
      if (input.sort === "name-desc") return -nameComparison;
      if (input.sort === "status") {
        const statusComparison = statusRank[clientRosterStatus(left)] - statusRank[clientRosterStatus(right)];
        return statusComparison || nameComparison;
      }
      return nameComparison;
    });
}
