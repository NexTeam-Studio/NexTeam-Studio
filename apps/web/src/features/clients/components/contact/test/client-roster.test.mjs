import assert from "node:assert/strict";
import test from "node:test";

import {
  clientRosterStatus,
  clientRosterStatusLabel,
  filterAndSortRosterClients,
  rosterTagOptions
} from "../domain/clientRoster.ts";

const clients = [
  { id: "active", name: "Bravo Client", tags: ["Client", "Priority"] },
  { id: "prospect", name: "Alpha Prospect", tags: ["Prospect", "Priority"] },
  { id: "archived", name: "Charlie Archive", tags: ["Archived"] }
];

test("roster status filters project existing tag semantics without a new client state", () => {
  assert.equal(clientRosterStatus(clients[0]), "active");
  assert.equal(clientRosterStatus(clients[1]), "lead");
  assert.equal(clientRosterStatus(clients[2]), "archived");
  assert.equal(clientRosterStatusLabel(clients[2], "Active"), "Archived");
});

test("roster tag, status, and name sorting compose against the same client records", () => {
  assert.deepEqual(rosterTagOptions(clients), ["Archived", "Client", "Priority", "Prospect"]);
  assert.deepEqual(
    filterAndSortRosterClients({ clients, status: "lead", tag: "priority", sort: "name-asc", displayName: (client) => client.name }).map((client) => client.id),
    ["prospect"]
  );
  assert.deepEqual(
    filterAndSortRosterClients({ clients, status: "all", tag: "", sort: "name-desc", displayName: (client) => client.name }).map((client) => client.id),
    ["archived", "active", "prospect"]
  );
});
