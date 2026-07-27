import type { Firestore } from "firebase-admin/firestore";
import { invoiceSchema, RailError, type Invoice } from "@nexteam/core";


import { asDocumentData, createTenantFirestoreReader } from "../../../../../../../crm/firestoreRepositoryBase.js";

export function createInvoiceFirestoreRepository(db: Firestore) {
  const { listByTenant } = createTenantFirestoreReader(db);
  return {
    async listInvoices(tenantId: string): Promise<Invoice[]> {
        return (await listByTenant("invoices", tenantId, invoiceSchema)) as Invoice[];
      },

    async createInvoice(invoice: Invoice): Promise<Invoice> {
        await db.collection("invoices").doc(invoice.id).set(asDocumentData(invoice));
        return invoiceSchema.parse(invoice) as Invoice;
      },

    async updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
        const ref = db.collection("invoices").doc(id);
        const snapshot = await ref.get();
        if (!snapshot.exists) {
          throw new RailError(`Native invoice ${id} was not found.`, { provider: "native", op: "updateInvoice", status: 404 });
        }
        const next = invoiceSchema.parse({ ...snapshot.data(), ...patch }) as Invoice;
        await ref.set(asDocumentData(next));
        return next;
      }
  };
}
