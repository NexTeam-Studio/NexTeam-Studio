import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FirestoreEventBus, InMemoryEventBus } from "../dist/index.js";

const eventDocument = {
  id: "evt_1",
  tenantId: "tenant_1",
  type: "job.completed",
  payload: {},
  ts: "2026-09-03T00:00:00.000Z",
  processedBy: []
};

function missingIndexFirestore() {
  const queries = [];
  let attempts = 0;
  return {
    queries,
    collection() {
      const operations = [];
      queries.push(operations);
      return {
        where(field, operator, value) {
          operations.push(["where", field, operator, value]);
          return this;
        },
        orderBy(field, direction) {
          operations.push(["orderBy", field, direction]);
          return this;
        },
        limit(value) {
          operations.push(["limit", value]);
          return this;
        },
        async get() {
          attempts += 1;
          if (attempts === 1) throw new Error("FAILED_PRECONDITION: The query requires an index");
          return { docs: [{ data: () => eventDocument }] };
        }
      };
    }
  };
}

test("Firestore event fallback stays bounded when the primary index is unavailable", async () => {
  const db = missingIndexFirestore();
  const bus = new FirestoreEventBus(db);

  const events = await bus.listEvents({ tenantId: "tenant_1", types: ["job.completed"] });

  assert.equal(events.length, 1);
  assert.deepEqual(db.queries[1], [
    ["where", "tenantId", "==", "tenant_1"],
    ["limit", 250]
  ]);
});

test("event subscriptions expose an unsubscribe handle", async () => {
  const bus = new InMemoryEventBus();
  let calls = 0;
  const unsubscribe = bus.subscribe("job.completed", "listener", async () => { calls += 1; });

  unsubscribe();
  await bus.emit({ tenantId: "tenant_1", type: "job.completed", payload: {} });

  assert.equal(calls, 0);
});

test("Firestore event subscriptions never open an unbounded snapshot listener", () => {
  const source = readFileSync(new URL("../src/eventBus.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /onSnapshot\(/);
  assert.match(source, /private readonly handlers = new Map/);
});
