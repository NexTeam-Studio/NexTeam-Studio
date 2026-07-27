import type { Firestore } from "firebase-admin/firestore";
import {
  clientSchema, crmSettingsSchema, invoiceSchema, jobSchema, propertySchema, quoteSchema, quoteTemplateSchema, requestFormSchema, serviceRequestSchema, RailError,
  type Client, type CrmSettings, type DocumentSequenceKind, type Invoice, type Job, type Property, type Quote, type QuoteTemplate, type RequestForm, type ServiceRequest
} from "@nexteam/core";
import { defaultCrmSettings, defaultQuoteTemplates } from "@nexteam/providers";
import { advanceDocumentNumber } from "@nexteam/shared";
import { asDocumentData, createTenantFirestoreReader } from "../../../../../../../crm/firestoreRepositoryBase.js";

export function createTenantConfigFirestoreRepository(db: Firestore) {
  const { listByTenant } = createTenantFirestoreReader(db);
  return {
    async getCrmSettings(tenantId: string): Promise<CrmSettings> {
        const snapshot = await db.collection("crmSettings").doc(tenantId).get();
        if (!snapshot.exists) {
          return defaultCrmSettings(tenantId);
        }
        const parsed = crmSettingsSchema.safeParse(snapshot.data());
        return parsed.success ? parsed.data as CrmSettings : defaultCrmSettings(tenantId);
      },

    async saveCrmSettings(settings: CrmSettings): Promise<CrmSettings> {
        const parsed = crmSettingsSchema.parse(settings) as CrmSettings;
        await db.collection("crmSettings").doc(parsed.tenantId).set(asDocumentData(parsed), { merge: true });
        return parsed;
      }
  };
}
