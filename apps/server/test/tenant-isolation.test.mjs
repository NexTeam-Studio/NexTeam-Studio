import test from "node:test";
import assert from "node:assert/strict";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { createTenantConfigFirestoreRepository } from "../dist/modules/nexops/areas/settings/components/tenantConfig/server/firestoreRepository.js";

const tenantA = "tenant-a";
const tenantB = "tenant-b";

function quote(tenantId, id) {
  return {
    id,
    tenantId,
    clientId: `client-${tenantId}`,
    status: "pending_approval",
    title: "Tenant-bound quote",
    lineItems: [],
    totals: { subtotal: 0, tax: 0, total: 0 },
    pdfRef: `native://quotes/${tenantId}/${id}.pdf`
  };
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
