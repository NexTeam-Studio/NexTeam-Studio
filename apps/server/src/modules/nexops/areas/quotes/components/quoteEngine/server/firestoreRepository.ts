import type { Firestore } from "firebase-admin/firestore";
import { quoteSchema, RailError, type Quote } from "@nexteam/core";


import { asDocumentData, createTenantFirestoreReader } from "../../../../../../../crm/firestoreRepositoryBase.js";
import { setTenantOwnedDocument, updateTenantOwnedDocument } from "../../../../../../../core/tenantOwnedWrite.js";

export function createQuoteFirestoreRepository(db: Firestore) {
  const { listByTenant } = createTenantFirestoreReader(db);
  return {
    async listQuotes(tenantId: string): Promise<Quote[]> {
        return (await listByTenant("quotes", tenantId, quoteSchema)) as Quote[];
      },

    async getQuote(tenantId: string, id: string): Promise<Quote | null> {
        const snapshot = await db.collection("quotes").doc(id).get();
        if (!snapshot.exists) {
          return null;
        }
        const parsed = quoteSchema.parse(snapshot.data()) as Quote;
        return parsed.tenantId === tenantId ? parsed : null;
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
          update: (existing) => asDocumentData(quoteSchema.parse({ ...existing, ...patch, id, tenantId: patch.tenantId }) as Quote)
        });
        return quoteSchema.parse(next) as Quote;
      }
  };
}
