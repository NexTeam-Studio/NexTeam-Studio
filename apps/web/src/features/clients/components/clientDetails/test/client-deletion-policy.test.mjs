import test from "node:test";
import assert from "node:assert/strict";

import {
  isProtectedLegacyClient,
  protectedLegacyClientDeleteMessage
} from "../domain/clientDeletionPolicy.ts";

const baseClient = {
  id: "client_1",
  tenantId: "tenant_1",
  name: "Client",
  emails: [],
  phones: [],
  consent: { email: false, sms: false }
};

test("imported client records are protected from deletion", () => {
  assert.equal(isProtectedLegacyClient({ ...baseClient, externalIds: { jobber: "legacy_1" } }), true);
  assert.equal(isProtectedLegacyClient({ ...baseClient, customFields: { recordClassification: "imported_history" } }), true);
  assert.equal(isProtectedLegacyClient({ ...baseClient, customFields: { note: "NexTeam created" } }), false);
  assert.match(protectedLegacyClientDeleteMessage(), /cannot be deleted/i);
});
