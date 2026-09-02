import assert from "node:assert/strict";
import test from "node:test";
import { FirestoreJobLifecycleRepository } from "../dist/modules/nexops/areas/jobs/components/jobCore/server/jobLifecycleRepository.js";

function firestoreWithLifecycleEvent() {
  const operations = [];
  return {
    operations,
    collection(name) {
      assert.equal(name, "jobLifecycleEvents");
      return {
        where(field, operator, value) {
          operations.push(["where", field, operator, value]);
          return this;
        },
        limit(value) {
          operations.push(["limit", value]);
          return this;
        },
        async get() {
          return {
            docs: [{ data: () => ({
              id: "job_evt_1",
              tenantId: "tenant_1",
              jobId: "job_1",
              type: "job.created",
              createdAt: "2026-09-03T00:00:00.000Z",
              payload: {}
            }) }]
          };
        }
      };
    }
  };
}

test("job detail lifecycle history queries only the selected job", async () => {
  const db = firestoreWithLifecycleEvent();
  const repository = new FirestoreJobLifecycleRepository(db);

  const events = await repository.listLifecycleEvents("tenant_1", "job_1");

  assert.equal(events.length, 1);
  assert.deepEqual(db.operations, [
    ["where", "tenantId", "==", "tenant_1"],
    ["where", "jobId", "==", "job_1"],
    ["limit", 250]
  ]);
});

test("job roster does not read lifecycle history it never uses", async () => {
  const db = { collection: () => { throw new Error("unexpected Firestore read"); } };
  const repository = new FirestoreJobLifecycleRepository(db);

  assert.deepEqual(await repository.listLifecycleEvents("tenant_1"), []);
});
