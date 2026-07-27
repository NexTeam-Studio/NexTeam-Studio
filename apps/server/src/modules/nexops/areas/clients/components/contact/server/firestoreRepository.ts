import type { Firestore } from "firebase-admin/firestore";
import {
  clientSchema, crmSettingsSchema, invoiceSchema, jobSchema, propertySchema, quoteSchema, quoteTemplateSchema, requestFormSchema, serviceRequestSchema, RailError,
  type Client, type CrmSettings, type DocumentSequenceKind, type Invoice, type Job, type Property, type Quote, type QuoteTemplate, type RequestForm, type ServiceRequest
} from "@nexteam/core";
import { defaultCrmSettings, defaultQuoteTemplates } from "@nexteam/providers";
import { advanceDocumentNumber } from "@nexteam/shared";
import { asDocumentData, createTenantFirestoreReader } from "../../../../../../../crm/firestoreRepositoryBase.js";

export function createContactFirestoreRepository(db: Firestore) {
  const { listByTenant } = createTenantFirestoreReader(db);
  return {
    async listClients(tenantId: string): Promise<Client[]> {
        return (await listByTenant("clients", tenantId, clientSchema)) as Client[];
      },

    async listProperties(tenantId: string): Promise<Property[]> {
        return (await listByTenant("properties", tenantId, propertySchema)) as Property[];
      },

    async deleteClient(tenantId: string, clientId: string): Promise<void> {
        const ref = db.collection("clients").doc(clientId);
        const snapshot = await ref.get();
        if (!snapshot.exists) {
          return;
        }
        const parsed = clientSchema.parse(snapshot.data()) as Client;
        if (parsed.tenantId !== tenantId) {
          throw new RailError(`Client ${clientId} was not found for tenant ${tenantId}.`, { provider: "native", op: "deleteClient", status: 404 });
        }
        await ref.delete();
      },

    async deletePropertiesForClient(tenantId: string, clientId: string): Promise<string[]> {
        const snapshot = await db
          .collection("properties")
          .where("tenantId", "==", tenantId)
          .where("clientId", "==", clientId)
          .get();
        if (snapshot.empty) {
          return [];
        }
        const batch = db.batch();
        const deletedIds: string[] = [];
        for (const doc of snapshot.docs) {
          deletedIds.push(doc.id);
          batch.delete(doc.ref);
        }
        await batch.commit();
        return deletedIds;
      },

    async createClient(client: Client): Promise<Client> {
        await db.collection("clients").doc(client.id).set(asDocumentData(client));
        return clientSchema.parse(client);
      },

    async upsertClient(client: Client): Promise<Client> {
        const parsed = clientSchema.parse(client) as Client;
        await db.collection("clients").doc(parsed.id).set(asDocumentData(parsed), { merge: false });
        return parsed;
      },

    async upsertProperty(property: Property): Promise<Property> {
        const parsed = propertySchema.parse(property) as Property;
        await db.collection("properties").doc(parsed.id).set(asDocumentData(parsed), { merge: false });
        return parsed;
      }
  };
}
