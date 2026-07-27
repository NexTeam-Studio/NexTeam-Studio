import test from "node:test";
import assert from "node:assert/strict";
import {
  FirestoreSchedulingRepository,
  InMemorySchedulingRepository
} from "../dist/scheduling/repository.js";

class FakeDocumentSnapshot {
  constructor(value) {
    this.value = value;
    this.exists = value !== undefined;
  }

  data() {
    return this.value;
  }
}

class FakeDocumentReference {
  constructor(store, collection, id) {
    this.store = store;
    this.key = `${collection}/${id}`;
  }

  async get() {
    return new FakeDocumentSnapshot(this.store.get(this.key));
  }

  async set(value) {
    this.store.set(this.key, value);
  }
}

class FakeFirestore {
  constructor(seed = {}) {
    this.store = new Map(Object.entries(seed));
  }

  collection(name) {
    return { doc: (id) => new FakeDocumentReference(this.store, name, id) };
  }

  async runTransaction(callback) {
    return callback({
      get: (ref) => ref.get(),
      set: (ref, value) => ref.set(value)
    });
  }
}

function visit(tenantId, title) {
  return {
    id: "visit_shared",
    tenantId,
    jobId: `job_${tenantId}`,
    title,
    start: "2026-07-27T13:00:00.000Z",
    end: "2026-07-27T14:00:00.000Z",
    assignedTo: ["crew_1"],
    location: { label: "Customer site" },
    status: "scheduled"
  };
}

test("Scheduling Admin writes reject a visit id owned by another tenant", async () => {
  const existing = visit("tenant_b", "Tenant B private visit");
  const db = new FakeFirestore({ "scheduledVisits/visit_shared": existing });
  const repository = new FirestoreSchedulingRepository(db);

  await assert.rejects(() => repository.saveVisit(visit("tenant_a", "Blocked overwrite")), /belongs to another tenant/i);
  assert.deepEqual(db.store.get("scheduledVisits/visit_shared"), existing);
});

test("Scheduling memory parity also rejects cross-tenant visit collisions", async () => {
  const repository = new InMemorySchedulingRepository();
  await repository.saveVisit(visit("tenant_b", "Tenant B private visit"));

  await assert.rejects(() => repository.saveVisit(visit("tenant_a", "Blocked overwrite")), /belongs to another tenant/i);
  assert.equal((await repository.getVisit("tenant_b", "visit_shared")).title, "Tenant B private visit");
});
