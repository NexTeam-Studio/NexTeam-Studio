import { FieldPath, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { boundedTenantQuery, DEFAULT_FIRESTORE_READ_LIMIT, recordFirestoreRead } from "@nexteam/core";
import type { ZodSchema } from "zod";

export type NativeCollectionName = "clients" | "properties" | "requests" | "requestForms" | "crmSettings" | "quoteTemplates" | "jobs" | "quotes" | "invoices";

export type TenantListPage<T> = {
  records: T[];
  nextCursor?: string | undefined;
};

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
    async listPageByTenant<T>(
      collectionName: NativeCollectionName,
      tenantId: string,
      schema: ZodSchema<T>,
      input: { limit?: number | undefined; cursor?: string | undefined } = {}
    ): Promise<TenantListPage<T>> {
      const limit = Math.min(Math.max(input.limit ?? DEFAULT_FIRESTORE_READ_LIMIT, 1), DEFAULT_FIRESTORE_READ_LIMIT);
      let query = boundedTenantQuery(db, collectionName, tenantId, { limit }).orderBy(FieldPath.documentId());
      if (input.cursor) {
        query = query.startAfter(input.cursor);
      }
      const snapshot = await query.get();
      recordFirestoreRead({
        collection: collectionName,
        operation: "tenant-list-page",
        tenantId,
        returnedDocumentCount: snapshot.docs.length,
        limit,
        filters: ["tenantId"]
      });
      return {
        records: snapshot.docs.map((doc) => schema.parse(doc.data())),
        nextCursor: snapshot.docs.length === limit ? snapshot.docs.at(-1)?.id : undefined
      };
    },
    async listByTenant<T>(collectionName: NativeCollectionName, tenantId: string, schema: ZodSchema<T>): Promise<T[]> {
      return (await this.listPageByTenant(collectionName, tenantId, schema)).records;
    }
  };
}
