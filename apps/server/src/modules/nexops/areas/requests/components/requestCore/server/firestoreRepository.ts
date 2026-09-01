import type { Firestore } from "firebase-admin/firestore";
import { requestFormSchema, serviceRequestSchema, RailError, type RequestForm, type ServiceRequest } from "@nexteam/core";


import { asDocumentData, createTenantFirestoreReader } from "../../../../../shared/persistence/firestoreRepositoryBase.js";
import { deleteTenantOwnedDocument, setTenantOwnedDocument, updateTenantOwnedDocument } from "../../../../../../../core/tenantOwnedWrite.js";

export function createRequestFirestoreRepository(db: Firestore) {
  const { listByTenant } = createTenantFirestoreReader(db);
  return {
    async listRequests(tenantId: string): Promise<ServiceRequest[]> {
        return (await listByTenant("requests", tenantId, serviceRequestSchema))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)) as ServiceRequest[];
      },

    async getRequest(tenantId: string, id: string): Promise<ServiceRequest | null> {
        const snapshot = await db.collection("requests").doc(id).get();
        if (!snapshot.exists) {
          return null;
        }
        const parsed = serviceRequestSchema.parse(snapshot.data()) as ServiceRequest;
        return parsed.tenantId === tenantId ? parsed : null;
      },

    async createRequest(request: ServiceRequest): Promise<ServiceRequest> {
        const parsed = serviceRequestSchema.parse(request) as ServiceRequest;
        await setTenantOwnedDocument({ db, collection: "requests", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Request ${parsed.id}` });
        return parsed;
      },

    async deleteRequest(tenantId: string, requestId: string): Promise<void> {
        await deleteTenantOwnedDocument({ db, collection: "requests", id: requestId, tenantId, label: `Request ${requestId}` });
      },

    async updateRequest(id: string, patch: Partial<ServiceRequest>): Promise<ServiceRequest> {
        if (!patch.tenantId) throw new RailError("Request update requires tenant context.", { provider: "native", op: "updateRequest", status: 400 });
        const next = await updateTenantOwnedDocument({
          db, collection: "requests", id, tenantId: patch.tenantId, label: `Native request ${id}`,
          update: (existing) => asDocumentData(serviceRequestSchema.parse({ ...existing, ...patch, id, tenantId: patch.tenantId }) as ServiceRequest)
        });
        return serviceRequestSchema.parse(next) as ServiceRequest;
      },

    async listRequestForms(tenantId: string): Promise<RequestForm[]> {
        return (await listByTenant("requestForms", tenantId, requestFormSchema))
          .sort((left, right) => left.title.localeCompare(right.title)) as RequestForm[];
      },

    async getRequestForm(tenantId: string, id: string): Promise<RequestForm | null> {
        const snapshot = await db.collection("requestForms").doc(id).get();
        if (!snapshot.exists) {
          return null;
        }
        const parsed = requestFormSchema.parse(snapshot.data()) as RequestForm;
        return parsed.tenantId === tenantId ? parsed : null;
      },

    async getRequestFormBySlug(tenantId: string, slug: string): Promise<RequestForm | null> {
        const snapshot = await db
          .collection("requestForms")
          .where("tenantId", "==", tenantId)
          .where("slug", "==", slug)
          .limit(1)
          .get();
        const doc = snapshot.docs[0];
        return doc ? (requestFormSchema.parse(doc.data()) as RequestForm) : null;
      },

    async upsertRequestForm(form: RequestForm): Promise<RequestForm> {
        const parsed = requestFormSchema.parse(form) as RequestForm;
        await setTenantOwnedDocument({ db, collection: "requestForms", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Request form ${parsed.id}` });
        return parsed;
      }
  };
}
