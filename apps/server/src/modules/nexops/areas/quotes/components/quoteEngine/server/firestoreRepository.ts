import type { Firestore } from "firebase-admin/firestore";
import { quoteSchema, RailError, type Quote } from "@nexteam/core";


import { asDocumentData } from "../../../../../shared/persistence/firestoreRepositoryBase.js";
import { setTenantOwnedDocument, updateTenantOwnedDocument } from "../../../../../../../core/tenantOwnedWrite.js";
import { legacyQuoteCompatibilityPatch, normalizeQuoteRecord } from "../domain/quoteStatusCompatibility.js";

export function createQuoteFirestoreRepository(db: Firestore) {
  async function normalizeStoredQuote(record: Record<string, unknown>, persistPatch: (patch: Record<string, unknown>) => Promise<unknown>): Promise<Quote> {
    const patch = legacyQuoteCompatibilityPatch(record);
    if (patch) {
      await persistPatch(patch);
    }
    return normalizeQuoteRecord(record);
  }

  return {
    async listQuotes(tenantId: string): Promise<Quote[]> {
      const snapshot = await db.collection("quotes").where("tenantId", "==", tenantId).get();
      return Promise.all(snapshot.docs.map((doc) => normalizeStoredQuote(
        doc.data(),
        (patch) => updateTenantOwnedDocument({
          db,
          collection: "quotes",
          id: doc.id,
          tenantId,
          label: `Quote ${doc.id} compatibility update`,
          update: (existing) => asDocumentData({ ...existing, ...patch, id: doc.id, tenantId })
        })
      )));
    },

    async getQuote(tenantId: string, id: string): Promise<Quote | null> {
      const snapshot = await db.collection("quotes").doc(id).get();
      if (!snapshot.exists) {
        return null;
      }
      const record = snapshot.data();
      if (record?.tenantId !== tenantId) {
        return null;
      }
      return normalizeStoredQuote(record, (patch) => updateTenantOwnedDocument({
        db,
        collection: "quotes",
        id,
        tenantId,
        label: `Quote ${id} compatibility update`,
        update: (existing) => asDocumentData({ ...existing, ...patch, id, tenantId })
      }));
    },

    async createQuote(quote: Quote): Promise<Quote> {
        const parsed = quoteSchema.parse(quote) as Quote;
        await setTenantOwnedDocument({ db, collection: "quotes", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Quote ${parsed.id}` });
        return parsed;
      },

    async updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
        if (!patch.tenantId) throw new RailError("Quote update requires tenant context.", { provider: "native", op: "updateQuote", status: 400 });
        const next = await updateTenantOwnedDocument({
          db, collection: "quotes", id, tenantId: patch.tenantId, label: `Native quote ${id}`,
          update: (existing) => asDocumentData(normalizeQuoteRecord({ ...existing, ...patch, id, tenantId: patch.tenantId }))
        });
        return normalizeQuoteRecord(next);
      }
  };
}
