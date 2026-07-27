import type { Firestore } from "firebase-admin/firestore";
import { quoteSchema, RailError, type Quote } from "@nexteam/core";


import { asDocumentData, createTenantFirestoreReader } from "../../../../../../../crm/firestoreRepositoryBase.js";

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
        await db.collection("quotes").doc(quote.id).set(asDocumentData(quote));
        return quoteSchema.parse(quote);
      },

    async updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
        const ref = db.collection("quotes").doc(id);
        const snapshot = await ref.get();
        if (!snapshot.exists) {
          throw new RailError(`Native quote ${id} was not found.`, { provider: "native", op: "updateQuote", status: 404 });
        }
        const next = quoteSchema.parse({ ...snapshot.data(), ...patch }) as Quote;
        await ref.set(asDocumentData(next));
        return next;
      }
  };
}
