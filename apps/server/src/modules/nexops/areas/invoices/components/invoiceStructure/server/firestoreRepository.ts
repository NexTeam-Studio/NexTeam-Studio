import type { Firestore } from "firebase-admin/firestore";
import { invoiceSchema, RailError, type Invoice } from "@nexteam/core";


import { asDocumentData, createTenantFirestoreReader } from "../../../../../shared/persistence/firestoreRepositoryBase.js";
import { setTenantOwnedDocument, updateTenantOwnedDocument } from "../../../../../../../core/tenantOwnedWrite.js";

export function createInvoiceFirestoreRepository(db: Firestore) {
  const { listByTenant } = createTenantFirestoreReader(db);
  return {
    async listInvoices(tenantId: string): Promise<Invoice[]> {
        return (await listByTenant("invoices", tenantId, invoiceSchema)) as Invoice[];
      },

    async createInvoice(invoice: Invoice): Promise<Invoice> {
        const parsed = invoiceSchema.parse(invoice) as Invoice;
        await setTenantOwnedDocument({ db, collection: "invoices", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Invoice ${parsed.id}` });
        return parsed;
      },

    async updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice> {
        if (!patch.tenantId) throw new RailError("Invoice update requires tenant context.", { provider: "native", op: "updateInvoice", status: 400 });
        const next = await updateTenantOwnedDocument({
          db, collection: "invoices", id, tenantId: patch.tenantId, label: `Native invoice ${id}`,
          update: (existing) => asDocumentData(invoiceSchema.parse({ ...existing, ...patch, id, tenantId: patch.tenantId }) as Invoice)
        });
        return invoiceSchema.parse(next) as Invoice;
      }
  };
}
