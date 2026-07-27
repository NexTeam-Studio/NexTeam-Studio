import type { Firestore } from "firebase-admin/firestore";
import {
  clientSchema, crmSettingsSchema, invoiceSchema, jobSchema, propertySchema, quoteSchema, quoteTemplateSchema, requestFormSchema, serviceRequestSchema, RailError,
  type Client, type CrmSettings, type DocumentSequenceKind, type Invoice, type Job, type Property, type Quote, type QuoteTemplate, type RequestForm, type ServiceRequest
} from "@nexteam/core";
import { defaultCrmSettings, defaultQuoteTemplates } from "@nexteam/providers";
import { advanceDocumentNumber } from "@nexteam/shared";
import { asDocumentData, createTenantFirestoreReader } from "../../../../../../../crm/firestoreRepositoryBase.js";

export function createJobFirestoreRepository(db: Firestore) {
  const { listByTenant } = createTenantFirestoreReader(db);
  return {
    async listJobs(tenantId: string): Promise<Job[]> {
        return (await listByTenant("jobs", tenantId, jobSchema)) as Job[];
      },

    async upsertJob(job: Job): Promise<Job> {
        const parsed = jobSchema.parse(job) as Job;
        await db.collection("jobs").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
        return parsed;
      },

    async updateJob(id: string, patch: Partial<Job>): Promise<Job> {
        const ref = db.collection("jobs").doc(id);
        const snapshot = await ref.get();
        if (!snapshot.exists) {
          throw new RailError(`Native job ${id} was not found.`, { provider: "native", op: "updateJob", status: 404 });
        }
        const next = jobSchema.parse({ ...snapshot.data(), ...patch }) as Job;
        await ref.set(asDocumentData(next));
        return next;
      }
  };
}
