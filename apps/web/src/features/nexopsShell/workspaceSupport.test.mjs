import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveClientScopedCreateId } from "./clientCreateHandoff.ts";

test("client-scoped Create only carries a client from the active tenant list", () => {
  assert.equal(resolveClientScopedCreateId("client_northside", ["client_northside", "client_westside"]), "client_northside");
  assert.equal(resolveClientScopedCreateId("client_other_tenant", ["client_northside", "client_westside"]), "");
  assert.equal(resolveClientScopedCreateId("", ["client_northside"]), "");
});
