import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { createTenantFirestoreReader } from "../dist/modules/nexops/shared/persistence/firestoreRepositoryBase.js";

function pagedFirestore() {
  const operations = [];
  return {
    operations,
    collection() {
      return {
        where(field, operator, value) {
          operations.push(["where", field, operator, value]);
          return this;
        },
        orderBy() {
          operations.push(["orderBy"]);
          return this;
        },
        limit(value) {
          operations.push(["limit", value]);
          return this;
        },
        startAfter(value) {
          operations.push(["startAfter", value]);
          return this;
        },
        async get() {
          return { docs: [{ id: "client_251", data: () => ({ id: "client_251" }) }] };
        }
      };
    }
  };
}

test("shared tenant reader bounds the default page and returns an opaque continuation cursor", async () => {
  const db = pagedFirestore();
  const reader = createTenantFirestoreReader(db);

  const page = await reader.listPageByTenant("clients", "tenant_1", z.object({ id: z.string() }));

  assert.deepEqual(page, { records: [{ id: "client_251" }], nextCursor: undefined });
  assert.deepEqual(db.operations, [
    ["where", "tenantId", "==", "tenant_1"],
    ["limit", 250],
    ["orderBy"]
  ]);
});

test("shared tenant reader applies a supplied cursor before reading the next page", async () => {
  const db = pagedFirestore();
  const reader = createTenantFirestoreReader(db);

  await reader.listPageByTenant("clients", "tenant_1", z.object({ id: z.string() }), { limit: 10, cursor: "client_250" });

  assert.deepEqual(db.operations.at(-1), ["startAfter", "client_250"]);
  assert.ok(db.operations.some((operation) => operation[0] === "limit" && operation[1] === 10));
});

test("shared tenant reader methods work when destructured from their source object", async () => {
  const db = pagedFirestore();
  const { listByTenant, listPageByTenant } = createTenantFirestoreReader(db);
  const schema = z.object({ id: z.string() });

  assert.deepEqual(await listByTenant("clients", "tenant_1", schema), [{ id: "client_251" }]);
  assert.deepEqual(await listPageByTenant("clients", "tenant_1", schema, { limit: 1 }), {
    records: [{ id: "client_251" }],
    nextCursor: "client_251"
  });
});
