import type { Firestore } from "firebase-admin/firestore";
import { jobSchema, RailError, type Job } from "@nexteam/core";


import { asDocumentData, createTenantFirestoreReader } from "../../../../../shared/persistence/firestoreRepositoryBase.js";
import { assertTenantDocumentOwner, setTenantOwnedDocument, updateTenantOwnedDocument } from "../../../../../../../core/tenantOwnedWrite.js";

export function createJobFirestoreRepository(db: Firestore) {
  const { listByTenant } = createTenantFirestoreReader(db);
  return {
    async listJobs(tenantId: string): Promise<Job[]> {
        return (await listByTenant("jobs", tenantId, jobSchema)) as Job[];
      },

    async upsertJob(job: Job): Promise<Job> {
        const parsed = jobSchema.parse(job) as Job;
        await setTenantOwnedDocument({ db, collection: "jobs", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Job ${parsed.id}` });
        return parsed;
      },

    async createJobIfAbsent(job: Job): Promise<{ job: Job; created: boolean }> {
        const parsed = jobSchema.parse(job) as Job;
        const ref = db.collection("jobs").doc(parsed.id);
        return db.runTransaction(async (transaction) => {
          const existing = await transaction.get(ref);
          if (existing.exists) {
            assertTenantDocumentOwner(existing.data(), parsed.tenantId, `Job ${parsed.id}`);
            return { job: jobSchema.parse(existing.data()) as Job, created: false };
          }
          transaction.set(ref, asDocumentData(parsed));
          return { job: parsed, created: true };
        });
      },

    async updateJob(id: string, patch: Partial<Job>): Promise<Job> {
        if (!patch.tenantId) throw new RailError("Job update requires tenant context.", { provider: "native", op: "updateJob", status: 400 });
        const next = await updateTenantOwnedDocument({
          db, collection: "jobs", id, tenantId: patch.tenantId, label: `Native job ${id}`,
          update: (existing) => asDocumentData(jobSchema.parse({ ...existing, ...patch, id, tenantId: patch.tenantId }) as Job)
        });
        return jobSchema.parse(next) as Job;
      }
  };
}
