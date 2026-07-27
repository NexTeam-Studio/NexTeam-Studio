import type { Firestore } from "firebase-admin/firestore";
import {
  clientSchema, crmSettingsSchema, invoiceSchema, jobSchema, propertySchema, quoteSchema, quoteTemplateSchema, requestFormSchema, serviceRequestSchema, RailError,
  type Client, type CrmSettings, type DocumentSequenceKind, type Invoice, type Job, type Property, type Quote, type QuoteTemplate, type RequestForm, type ServiceRequest
} from "@nexteam/core";
import { defaultCrmSettings, defaultQuoteTemplates } from "@nexteam/providers";
import { advanceDocumentNumber } from "@nexteam/shared";
import { asDocumentData, createTenantFirestoreReader } from "../../../../../../../crm/firestoreRepositoryBase.js";

export function createQuoteTemplateFirestoreRepository(db: Firestore) {
  const { listByTenant } = createTenantFirestoreReader(db);
  return {
    async listQuoteTemplates(tenantId: string): Promise<QuoteTemplate[]> {
        const templates = (await listByTenant("quoteTemplates", tenantId, quoteTemplateSchema))
          .sort((left, right) => left.name.localeCompare(right.name)) as QuoteTemplate[];
        return templates.length ? templates : defaultQuoteTemplates(tenantId);
      },

    async getQuoteTemplate(tenantId: string, id: string): Promise<QuoteTemplate | null> {
        const snapshot = await db.collection("quoteTemplates").doc(id).get();
        if (!snapshot.exists) {
          return null;
        }
        const parsed = quoteTemplateSchema.parse(snapshot.data()) as QuoteTemplate;
        return parsed.tenantId === tenantId ? parsed : null;
      },

    async upsertQuoteTemplate(template: QuoteTemplate): Promise<QuoteTemplate> {
        const parsed = quoteTemplateSchema.parse(template) as QuoteTemplate;
        await db.collection("quoteTemplates").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
        return parsed;
      }
  };
}
