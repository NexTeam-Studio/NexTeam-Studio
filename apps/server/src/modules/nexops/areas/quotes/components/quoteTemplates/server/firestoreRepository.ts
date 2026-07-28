import type { Firestore } from "firebase-admin/firestore";
import { quoteTemplateSchema, type QuoteTemplate } from "@nexteam/core";
import { defaultQuoteTemplates } from "@nexteam/providers";

import { asDocumentData, createTenantFirestoreReader } from "../../../../../shared/persistence/firestoreRepositoryBase.js";
import { setTenantOwnedDocument } from "../../../../../../../core/tenantOwnedWrite.js";

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
        await setTenantOwnedDocument({ db, collection: "quoteTemplates", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Quote template ${parsed.id}` });
        return parsed;
      }
  };
}
