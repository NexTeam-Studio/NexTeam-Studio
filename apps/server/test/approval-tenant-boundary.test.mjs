import test from "node:test";
import assert from "node:assert/strict";
import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { FirestoreApprovalQueueRepository } from "../dist/approval/firestoreRepository.js";

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
  constructor(seed = {}) { this.store = new Map(Object.entries(seed)); }
  collection(name) { return { doc: (id) => new FakeRef(this.store, `${name}/${id}`) }; }
  async runTransaction(callback) {
    return callback({ get: (ref) => ref.get(), set: (ref, value) => ref.set(value) });
  }
}

function approval(tenantId, id = "approval_shared") {
  return {
    id,
    tenantId,
    kind: "email",
    preview: { title: "Private approval", body: "Tenant-owned content" },
    execute: { service: "comms", op: "sendEmail", args: { tenantId } },
    status: "pending",
    createdBy: "system"
  };
}

test("ApprovalQueue service cannot read or mutate an item through another tenant", async () => {
  const repository = new InMemoryApprovalQueueRepository();
  const service = new ApprovalQueueService(repository);
  const item = await repository.create(approval("tenant_b"));

  assert.equal(await service.get("tenant_a", item.id), null);
  await assert.rejects(() => service.approve("tenant_a", item.id), /was not found/i);
  await assert.rejects(() => service.reject("tenant_a", item.id), /was not found/i);
  await assert.rejects(() => service.executeApproved("tenant_a", item.id), /is not approved/i);
  assert.equal((await service.get("tenant_b", item.id))?.status, "pending");
});

test("ApprovalQueue Firestore writes reject cross-tenant ids and preserve tenant identity", async () => {
  const existing = approval("tenant_b");
  const db = new FakeFirestore({ "approvalQueue/approval_shared": existing });
  const repository = new FirestoreApprovalQueueRepository(db);

  assert.equal(await repository.get("tenant_a", existing.id), null);
  await assert.rejects(() => repository.create(approval("tenant_a")), /belongs to another tenant/i);
  await assert.rejects(() => repository.update("tenant_a", existing.id, { status: "approved" }), /belongs to another tenant/i);
  const updated = await repository.update("tenant_b", existing.id, { tenantId: "tenant_a", status: "approved" });
  assert.equal(updated.tenantId, "tenant_b");
  assert.equal(db.store.get("approvalQueue/approval_shared").tenantId, "tenant_b");
});
