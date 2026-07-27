import type { Firestore } from "firebase-admin/firestore";
import { crmSettingsSchema, type CrmSettings } from "@nexteam/core";
import { defaultCrmSettings } from "@nexteam/providers";
import { asDocumentData } from "../../../../../../../crm/firestoreRepositoryBase.js";
import { requireTenantMatch } from "../../../../../../../core/tenantConfig.js";

export function createTenantConfigFirestoreRepository(db: Firestore) {
  return {
    async getCrmSettings(tenantId: string): Promise<CrmSettings> {
        // @tenant-doc:crmSettings - the tenant id is the document id and is validated again after parsing.
        const snapshot = await db.collection("crmSettings").doc(tenantId).get();
        if (!snapshot.exists) {
          return defaultCrmSettings(tenantId);
        }
        const parsed = crmSettingsSchema.safeParse(snapshot.data());
        if (!parsed.success) {
          return defaultCrmSettings(tenantId);
        }
        requireTenantMatch(tenantId, parsed.data.tenantId, "getCrmSettings");
        return parsed.data as CrmSettings;
      },

    async saveCrmSettings(settings: CrmSettings): Promise<CrmSettings> {
        const parsed = crmSettingsSchema.parse(settings) as CrmSettings;
        await db.collection("crmSettings").doc(parsed.tenantId).set(asDocumentData(parsed), { merge: true });
        return parsed;
      }
  };
}
