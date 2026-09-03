import type { Firestore } from "firebase-admin/firestore";
import { clientSchema, DEFAULT_FIRESTORE_READ_LIMIT, propertySchema, type Client, type Property } from "@nexteam/core";


import { asDocumentData, createTenantFirestoreReader } from "../../../../../shared/persistence/firestoreRepositoryBase.js";
import { deleteTenantOwnedDocument, setTenantOwnedDocument } from "../../../../../../../core/tenantOwnedWrite.js";

export function createContactFirestoreRepository(db: Firestore) {
  const { listByTenant, listPageByTenant } = createTenantFirestoreReader(db);
  return {
    async listClients(tenantId: string): Promise<Client[]> {
        return (await listByTenant("clients", tenantId, clientSchema)) as Client[];
      },

    async listClientsPage(tenantId: string, input: { limit?: number | undefined; cursor?: string | undefined } = {}) {
      return listPageByTenant("clients", tenantId, clientSchema, input);
    },

    async listProperties(tenantId: string): Promise<Property[]> {
        return (await listByTenant("properties", tenantId, propertySchema)) as Property[];
      },

    async deleteClient(tenantId: string, clientId: string): Promise<void> {
        await deleteTenantOwnedDocument({ db, collection: "clients", id: clientId, tenantId, label: `Client ${clientId}` });
      },

    async deletePropertiesForClient(tenantId: string, clientId: string): Promise<string[]> {
        const deletedIds: string[] = [];
        while (true) {
          const snapshot = await db
            .collection("properties")
            .where("tenantId", "==", tenantId)
            .where("clientId", "==", clientId)
            .limit(DEFAULT_FIRESTORE_READ_LIMIT)
            .get();
          if (snapshot.empty) break;
          for (const doc of snapshot.docs) {
            const deleted = await deleteTenantOwnedDocument({ db, collection: "properties", id: doc.id, tenantId, label: `Property ${doc.id}` });
            if (deleted) deletedIds.push(doc.id);
          }
        }
        return deletedIds;
      },

    async createClient(client: Client): Promise<Client> {
        const parsed = clientSchema.parse(client) as Client;
        await setTenantOwnedDocument({ db, collection: "clients", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Client ${parsed.id}` });
        return parsed;
      },

    async upsertClient(client: Client): Promise<Client> {
        const parsed = clientSchema.parse(client) as Client;
        await setTenantOwnedDocument({ db, collection: "clients", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Client ${parsed.id}` });
        return parsed;
      },

    async upsertProperty(property: Property): Promise<Property> {
        const parsed = propertySchema.parse(property) as Property;
        await setTenantOwnedDocument({ db, collection: "properties", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Property ${parsed.id}` });
        return parsed;
      }
  };
}
