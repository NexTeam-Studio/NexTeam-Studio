import type { Firestore } from "firebase-admin/firestore";
import { setTenantOwnedDocument } from "../../../../core/tenantOwnedWrite.js";
import { asDocumentData } from "../persistence/firestoreRepositoryBase.js";
import { DEFAULT_FIRESTORE_READ_LIMIT, recordFirestoreRead } from "@nexteam/core";
import { compensationFactSchema, laborFactSchema, type CompensationFact, type LaborFact, type TimePayEvent, type TimePayRepository } from "./timePayFoundation.js";

export class FirestoreTimePayRepository implements TimePayRepository {
  constructor(private readonly db: Firestore) {}
  async listLabor(tenantId: string, employeeId?: string) { const rows = await this.db.collection("laborFacts").where("tenantId", "==", tenantId).get(); return rows.docs.map((d) => laborFactSchema.parse(d.data())).filter((x) => !employeeId || x.employeeId === employeeId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
  async getLabor(tenantId: string, id: string) { const row = await this.db.collection("laborFacts").doc(id).get(); if (!row.exists) return null; const fact = laborFactSchema.parse(row.data()); return fact.tenantId === tenantId ? fact : null; }
  async saveLabor(fact: LaborFact) { const parsed = laborFactSchema.parse(fact); await setTenantOwnedDocument({ db: this.db, collection: "laborFacts", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Labor fact ${parsed.id}` }); return parsed; }
  async listCompensation(tenantId: string, employeeId?: string) { const rows = await this.db.collection("compensationFacts").where("tenantId", "==", tenantId).get(); return rows.docs.map((d) => compensationFactSchema.parse(d.data())).filter((x) => !employeeId || x.employeeId === employeeId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)); }
  async getCompensation(tenantId: string, id: string) { const row = await this.db.collection("compensationFacts").doc(id).get(); if (!row.exists) return null; const fact = compensationFactSchema.parse(row.data()); return fact.tenantId === tenantId ? fact : null; }
  async saveCompensation(fact: CompensationFact) { const parsed = compensationFactSchema.parse(fact); await setTenantOwnedDocument({ db: this.db, collection: "compensationFacts", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Compensation fact ${parsed.id}` }); return parsed; }
  async appendEvent(event: TimePayEvent) { await setTenantOwnedDocument({ db: this.db, collection: "timePayEvents", id: event.id, tenantId: event.tenantId, data: asDocumentData(event), label: `Time/pay event ${event.id}` }); }
  async listEvents(tenantId: string, factId?: string) { let query = this.db.collection("timePayEvents").where("tenantId", "==", tenantId); if (factId) query = query.where("factId", "==", factId); const rows = await query.limit(DEFAULT_FIRESTORE_READ_LIMIT).get(); recordFirestoreRead({ collection: "timePayEvents", operation: "time-pay-events", tenantId, returnedDocumentCount: rows.docs.length, limit: DEFAULT_FIRESTORE_READ_LIMIT, filters: factId ? ["tenantId", "factId"] : ["tenantId"] }); return rows.docs.map((d) => d.data() as TimePayEvent).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)); }
}
