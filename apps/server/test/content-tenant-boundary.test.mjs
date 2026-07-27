import test from "node:test";
import assert from "node:assert/strict";
import {
  FirestoreContentRepository,
  InMemoryContentRepository
} from "../dist/content/repository.js";

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

const collisionCases = [
  ["contentDrafts", "saveDraft", (record) => [record]],
  ["contentEligibility", "saveEligibility", (record) => [record]],
  ["contentShowcases", "saveShowcase", (record) => [record]],
  ["contentCalendar", "saveCalendarItems", (record) => [[record]]],
  ["contentPerformance", "savePerformance", (record) => [record]]
];

test("Content Admin writes reject cross-tenant ids across every shared-id collection", async () => {
  for (const [collection, method, argsFor] of collisionCases) {
    const existing = { id: "shared_id", tenantId: "tenant_b", marker: "private" };
    const db = new FakeFirestore({ [`${collection}/shared_id`]: existing });
    const repository = new FirestoreContentRepository(db);

    await assert.rejects(() => repository[method](...argsFor({ id: "shared_id", tenantId: "tenant_a" })), /belongs to another tenant/i);
    assert.deepEqual(db.store.get(`${collection}/shared_id`), existing);
  }
});

test("Content draft updates reject another tenant and cannot mutate tenant identity", async () => {
  const existing = { id: "draft_shared", tenantId: "tenant_a", title: "Owned" };
  const db = new FakeFirestore({ "contentDrafts/draft_shared": existing });
  const repository = new FirestoreContentRepository(db);

  await assert.rejects(() => repository.updateDraft("tenant_b", "draft_shared", { title: "Blocked" }), /belongs to another tenant/i);
  const updated = await repository.updateDraft("tenant_a", "draft_shared", { tenantId: "tenant_b", title: "Allowed title" });
  assert.equal(updated.tenantId, "tenant_a");
  assert.equal(db.store.get("contentDrafts/draft_shared").tenantId, "tenant_a");
});

test("Content memory persistence has matching collision and immutable-tenant behavior", async () => {
  const repository = new InMemoryContentRepository();
  await repository.saveDraft({ id: "draft_shared", tenantId: "tenant_b", title: "Private" });

  await assert.rejects(() => repository.saveDraft({ id: "draft_shared", tenantId: "tenant_a", title: "Blocked" }), /belongs to another tenant/i);
  const updated = await repository.updateDraft("tenant_b", "draft_shared", { tenantId: "tenant_a", title: "Updated" });
  assert.equal(updated.tenantId, "tenant_b");
});
