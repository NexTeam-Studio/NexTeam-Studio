import type { DocumentData, Firestore } from "firebase-admin/firestore";
import type { ZodSchema } from "zod";

export type NativeCollectionName = "clients" | "properties" | "requests" | "requestForms" | "crmSettings" | "quoteTemplates" | "jobs" | "quotes" | "invoices";

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, removeUndefined(entry)])
    );
  }
  return value;
}

export function asDocumentData(value: object): DocumentData {
  return removeUndefined(value) as DocumentData;
}

export function createTenantFirestoreReader(db: Firestore) {
  return {
    async listByTenant<T>(collectionName: NativeCollectionName, tenantId: string, schema: ZodSchema<T>): Promise<T[]> {
      const snapshot = await db.collection(collectionName).where("tenantId", "==", tenantId).get();
      return snapshot.docs.map((doc) => schema.parse(doc.data()));
    }
  };
}
