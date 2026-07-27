import type { Firestore } from "firebase-admin/firestore";
import { jobSchema, RailError, type Job } from "@nexteam/core";


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
