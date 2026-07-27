import test from "node:test";
import assert from "node:assert/strict";
import { FirestoreReputationRepository } from "../dist/reputation/repository.js";

class FakeSnapshot {
  constructor(value) {
    this.value = value;
    this.exists = value !== undefined;
  }
  data() { return this.value; }
}

class FakeRef {
  constructor(store, key) {
    this.store = store;
    this.key = key;
  }
  async get() { return new FakeSnapshot(this.store.get(this.key)); }
  async set(value) { this.store.set(this.key, value); }
}

class FakeFirestore {
  constructor(seed) { this.store = new Map(Object.entries(seed)); }
  collection(name) { return { doc: (id) => new FakeRef(this.store, `${name}/${id}`) }; }
  async runTransaction(callback) {
    return callback({ get: (ref) => ref.get(), set: (ref, value) => ref.set(value) });
  }
}

const timestamp = "2026-07-27T00:00:00.000Z";
function review(tenantId) {
  return {
    id: "review_shared",
    tenantId,
    provider: "native",
    locationId: "primary",
    authorName: "Customer",
    rating: 5,
    comment: "Private feedback",
    reviewedAt: timestamp,
    replyStatus: "none",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function profile(tenantId) {
  return {
    id: "profile_shared",
    tenantId,
    locationId: "primary",
    hours: {},
    services: [],
    qas: [],
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

test("Reputation Admin writes reject cross-tenant review and profile ids", async () => {
  const reviewB = review("tenant_b");
  const profileB = profile("tenant_b");
  const db = new FakeFirestore({
    "reputationReviews/review_shared": reviewB,
    "reputationProfiles/profile_shared": profileB
  });
  const repository = new FirestoreReputationRepository(db);

  await assert.rejects(() => repository.upsertReview(review("tenant_a")), /belongs to another tenant/i);
  await assert.rejects(() => repository.saveProfile(profile("tenant_a")), /belongs to another tenant/i);
  assert.deepEqual(db.store.get("reputationReviews/review_shared"), reviewB);
  assert.deepEqual(db.store.get("reputationProfiles/profile_shared"), profileB);
});
