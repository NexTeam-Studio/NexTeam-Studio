import assert from "node:assert/strict";
import test from "node:test";

import { resolveQuotePropertyContext } from "../src/modules/nexops/areas/quotes/components/quoteEngine/server/routes.ts";

const tenantId = "aquatrace";
const clientId = "client_brian";

test("a stale inherited quote property is cleared so approval-rule edits can save", async () => {
  const propertyId = await resolveQuotePropertyContext({
    async listProperties() {
      return [{ id: "property_other_client", clientId: "client_other" }];
    }
  }, tenantId, clientId, "property_other_client", "property_other_client");

  assert.equal(propertyId, undefined);
});

test("a newly selected property belonging to a different client remains rejected", async () => {
  await assert.rejects(() => resolveQuotePropertyContext({
    async listProperties() {
      return [{ id: "property_other_client", clientId: "client_other" }];
    }
  }, tenantId, clientId, "property_other_client"), /does not belong to this client/);
});
