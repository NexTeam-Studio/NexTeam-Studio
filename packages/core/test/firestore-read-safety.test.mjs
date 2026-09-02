import assert from "node:assert/strict";
import test from "node:test";
import { boundedTenantQuery, DEFAULT_FIRESTORE_READ_LIMIT } from "../dist/index.js";

test("bounded tenant query always applies the protected maximum", () => {
  const operations = [];
  const db = {
    collection(collection) {
      operations.push(["collection", collection]);
      return {
        where(field, operator, value) {
          operations.push(["where", field, operator, value]);
          return this;
        },
        limit(value) {
          operations.push(["limit", value]);
          return this;
        }
      };
    }
  };

  boundedTenantQuery(db, "events", "tenant_1", { limit: 10_000 });

  assert.deepEqual(operations, [
    ["collection", "events"],
    ["where", "tenantId", "==", "tenant_1"],
    ["limit", DEFAULT_FIRESTORE_READ_LIMIT]
  ]);
});
