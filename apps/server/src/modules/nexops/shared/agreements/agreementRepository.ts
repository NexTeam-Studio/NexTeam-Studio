import type { Firestore } from "firebase-admin/firestore";
import { setTenantOwnedDocument } from "../../../../core/tenantOwnedWrite.js";
import { asDocumentData } from "../persistence/firestoreRepositoryBase.js";
import { agreementSchema, type Agreement, type AgreementEvent, type AgreementRepository } from "./agreementFoundation.js";

export class FirestoreAgreementRepository implements AgreementRepository {
  constructor(private readonly db: Firestore) {}
  async list(tenantId: string) { const snapshot = await this.db.collection("serviceAgreements").where("tenantId", "==", tenantId).get(); return snapshot.docs.map((doc) => agreementSchema.parse(doc.data())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async get(tenantId: string, id: string) { const snapshot = await this.db.collection("serviceAgreements").doc(id).get(); if (!snapshot.exists) return null; const agreement = agreementSchema.parse(snapshot.data()); return agreement.tenantId === tenantId ? agreement : null; }
  async save(agreement: Agreement) { const parsed = agreementSchema.parse(agreement); await setTenantOwnedDocument({ db: this.db, collection: "serviceAgreements", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Agreement ${parsed.id}` }); return parsed; }
  async appendEvent(event: AgreementEvent) { await setTenantOwnedDocument({ db: this.db, collection: "serviceAgreementEvents", id: event.id, tenantId: event.tenantId, data: asDocumentData(event), label: `Agreement event ${event.id}` }); }
  async listEvents(tenantId: string, agreementId: string) { const snapshot = await this.db.collection("serviceAgreementEvents").where("tenantId", "==", tenantId).where("agreementId", "==", agreementId).get(); return snapshot.docs.map((doc) => doc.data() as AgreementEvent).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)); }
}
