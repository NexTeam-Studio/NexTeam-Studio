import test from "node:test";
import assert from "node:assert/strict";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { createTenantConfigFirestoreRepository } from "../dist/modules/nexops/areas/settings/components/tenantConfig/server/firestoreRepository.js";
import { createQuoteFirestoreRepository } from "../dist/modules/nexops/areas/quotes/components/quoteEngine/server/firestoreRepository.js";
import { FirestorePlatformRepository } from "../dist/platform/repository.js";

const tenantA = "tenant-a";
const tenantB = "tenant-b";

function quote(tenantId, id) {
  return {
    id,
    tenantId,
    clientId: `client-${tenantId}`,
    status: "draft",
    title: "Tenant-bound quote",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 },
    approvalRules: { requireSignature: false, requireDeposit: false, requireCardOnFile: false },
    pdfRef: `native://quotes/${tenantId}/${id}.pdf`
  };
}

class FakeSnapshot {
  constructor(value) { this.value = value; this.exists = value !== undefined; }
  data() { return this.value; }
}

class FakeRef {
  constructor(store, key) { this.store = store; this.key = key; }
  async get() { return new FakeSnapshot(this.store.get(this.key)); }
  async set(value) { this.store.set(this.key, value); }
  async delete() { this.store.delete(this.key); }
}

class FakeFirestore {
  constructor(seed = {}) { this.store = new Map(Object.entries(seed)); }
  collection(name) {
    const store = this.store;
    return {
      doc: (id) => new FakeRef(store, `${name}/${id}`),
      async get() {
        const prefix = `${name}/`;
        return { docs: [...store.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ id: key.slice(prefix.length), data: () => value })) };
      }
    };
  }
  async runTransaction(callback) {
    return callback({
      get: (ref) => ref.get(),
      set: (ref, value) => ref.set(value),
      delete: (ref) => ref.delete()
    });
  }
}

test("native CRM rejects cross-tenant document updates and tenantId mutation", async () => {
  const repository = new MemoryNativeCrmRepository({ quotes: [quote(tenantA, "quote-a")] });
  const owner = new NativeAdapter(repository, tenantA);
  const outsider = new NativeAdapter(repository, tenantB);

  await assert.rejects(() => outsider.updateQuote("quote-a", { title: "cross-tenant attempt" }), /not found/);
  await assert.rejects(() => owner.updateQuote("quote-a", { tenantId: tenantB }), /tenant mismatch/);
  assert.equal((await owner.getQuotes())[0].tenantId, tenantA);
  assert.equal((await owner.getQuotes())[0].title, "Tenant-bound quote");
});

test("native CRM Firestore writes reject cross-tenant IDs inside the write transaction", async () => {
  const existing = quote(tenantB, "quote-shared");
  const db = new FakeFirestore({ "quotes/quote-shared": existing });
  const repository = createQuoteFirestoreRepository(db);

  await assert.rejects(() => repository.createQuote(quote(tenantA, "quote-shared")), /belongs to another tenant/i);
  await assert.rejects(() => repository.updateQuote("quote-shared", { tenantId: tenantA, title: "Blocked" }), /belongs to another tenant/i);
  const updated = await repository.updateQuote("quote-shared", { tenantId: tenantB, title: "Allowed" });
  assert.equal(updated.tenantId, tenantB);
  assert.equal(db.store.get("quotes/quote-shared").tenantId, tenantB);
});

test("tenant settings rejects a document whose stored tenant differs from the requested tenant", async () => {
  const storedSettings = await new MemoryNativeCrmRepository().getCrmSettings(tenantB);
  const db = {
    collection(collectionName) {
      assert.equal(collectionName, "crmSettings");
      return {
        doc(documentId) {
          assert.equal(documentId, tenantA);
          return {
            async get() {
              return {
                exists: true,
                data: () => storedSettings
              };
            }
          };
        }
      };
    }
  };

  const repository = createTenantConfigFirestoreRepository(db);
  await assert.rejects(() => repository.getCrmSettings(tenantA), /Cross-tenant persistence access was rejected/);
});

test("platform persistence rejects a tenant user ID already owned by another tenant", async () => {
  const existing = {
    id: "shared-user",
    tenantId: tenantB,
    displayName: "Tenant B User",
    role: "OFFICE_ADMIN",
    active: true,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z"
  };
  const db = new FakeFirestore({ "tenantUsers/shared-user": existing });
  const repository = new FirestorePlatformRepository(db);

  await assert.rejects(() => repository.upsertTenantUser({
    ...existing,
    tenantId: tenantA,
    displayName: "Cross-tenant overwrite"
  }), /belongs to another tenant/i);
  assert.deepEqual(db.store.get("tenantUsers/shared-user"), existing);
});
