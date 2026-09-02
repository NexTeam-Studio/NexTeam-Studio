import type { Firestore } from "firebase-admin/firestore";
import { setTenantOwnedDocument } from "../../../../core/tenantOwnedWrite.js";
import { asDocumentData } from "../persistence/firestoreRepositoryBase.js";
import { DEFAULT_FIRESTORE_READ_LIMIT, recordFirestoreRead } from "@nexteam/core";
import { jobCostFactSchema, type JobCostFact, type JobCostFactEvent, type JobCostingRepository } from "./jobCostingFoundation.js";

export class FirestoreJobCostingRepository implements JobCostingRepository {
  constructor(private readonly db: Firestore) {}
  async listFacts(tenantId: string, jobId: string) { const snapshot = await this.db.collection("jobCostFacts").where("tenantId", "==", tenantId).where("jobId", "==", jobId).limit(DEFAULT_FIRESTORE_READ_LIMIT).get(); recordFirestoreRead({ collection: "jobCostFacts", operation: "job-cost-facts", tenantId, returnedDocumentCount: snapshot.docs.length, limit: DEFAULT_FIRESTORE_READ_LIMIT, filters: ["tenantId", "jobId"] }); return snapshot.docs.map((doc) => jobCostFactSchema.parse(doc.data())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async getFact(tenantId: string, id: string) { const snapshot = await this.db.collection("jobCostFacts").doc(id).get(); if (!snapshot.exists) return null; const fact = jobCostFactSchema.parse(snapshot.data()); return fact.tenantId === tenantId ? fact : null; }
  async saveFact(fact: JobCostFact) { const parsed = jobCostFactSchema.parse(fact); await setTenantOwnedDocument({ db: this.db, collection: "jobCostFacts", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Job cost fact ${parsed.id}` }); return parsed; }
  async appendEvent(event: JobCostFactEvent) { await setTenantOwnedDocument({ db: this.db, collection: "jobCostFactEvents", id: event.id, tenantId: event.tenantId, data: asDocumentData(event), label: `Job cost event ${event.id}` }); }
  async listEvents(tenantId: string, jobId: string) { const snapshot = await this.db.collection("jobCostFactEvents").where("tenantId", "==", tenantId).where("jobId", "==", jobId).limit(DEFAULT_FIRESTORE_READ_LIMIT).get(); recordFirestoreRead({ collection: "jobCostFactEvents", operation: "job-cost-events", tenantId, returnedDocumentCount: snapshot.docs.length, limit: DEFAULT_FIRESTORE_READ_LIMIT, filters: ["tenantId", "jobId"] }); return snapshot.docs.map((doc) => doc.data() as JobCostFactEvent).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)); }
}
