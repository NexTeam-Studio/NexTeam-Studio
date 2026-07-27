import test from "node:test";
import assert from "node:assert/strict";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { createTenantConfigFirestoreRepository } from "../dist/modules/nexops/areas/settings/components/tenantConfig/server/firestoreRepository.js";
import { createQuoteFirestoreRepository } from "../dist/modules/nexops/areas/quotes/components/quoteEngine/server/firestoreRepository.js";

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
  collection(name) { return { doc: (id) => new FakeRef(this.store, `${name}/${id}`) }; }
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
