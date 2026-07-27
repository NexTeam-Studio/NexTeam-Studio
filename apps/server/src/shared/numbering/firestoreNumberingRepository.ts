import type { Firestore } from "firebase-admin/firestore";
import {
  clientSchema, crmSettingsSchema, invoiceSchema, jobSchema, propertySchema, quoteSchema, quoteTemplateSchema, requestFormSchema, serviceRequestSchema, RailError,
  type Client, type CrmSettings, type DocumentSequenceKind, type Invoice, type Job, type Property, type Quote, type QuoteTemplate, type RequestForm, type ServiceRequest
} from "@nexteam/core";
import { defaultCrmSettings, defaultQuoteTemplates } from "@nexteam/providers";
import { advanceDocumentNumber } from "@nexteam/shared";
import { asDocumentData, createTenantFirestoreReader } from "../../crm/firestoreRepositoryBase.js";

export function createNumberingFirestoreRepository(db: Firestore) {
  const { listByTenant } = createTenantFirestoreReader(db);
  return {
    async reserveDocumentNumber(tenantId: string, kind: DocumentSequenceKind): Promise<string> {
        const ref = db.collection("crmSettings").doc(tenantId);
        return db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(ref);
          const parsed = snapshot.exists ? crmSettingsSchema.safeParse(snapshot.data()) : null;
          const current = parsed?.success ? parsed.data as CrmSettings : defaultCrmSettings(tenantId);
          if (current.tenantId !== tenantId) {
            throw new RailError("Numbering settings do not belong to the requested tenant.", { provider: "native", op: "reserveDocumentNumber", status: 403 });
          }
          const reservation = advanceDocumentNumber(current.documentNumbering[kind]);
          const next = crmSettingsSchema.parse({
            ...current,
            documentNumbering: { ...current.documentNumbering, [kind]: reservation.nextRule },
            updatedAt: new Date().toISOString()
          }) as CrmSettings;
          transaction.set(ref, asDocumentData(next), { merge: true });
          return reservation.number;
        });
      }
  };
}
