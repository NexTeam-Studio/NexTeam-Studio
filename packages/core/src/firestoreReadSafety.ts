import type { Firestore } from "firebase-admin/firestore";
import { logger } from "./logger.js";

export const DEFAULT_FIRESTORE_READ_LIMIT = 250;

export function boundedTenantQuery(
  db: Firestore,
  collectionName: string,
  tenantId: string,
  input: { limit?: number | undefined } = {}
) {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_FIRESTORE_READ_LIMIT, 1), DEFAULT_FIRESTORE_READ_LIMIT);
  return db.collection(collectionName).where("tenantId", "==", tenantId).limit(limit);
}

export function recordFirestoreRead(input: {
  collection: string;
  operation: string;
  tenantId: string;
  returnedDocumentCount: number;
  limit: number;
  filters: string[];
}): void {
  const event = {
    metric: "firestore_query_documents_returned",
    ...input
  };
  if (input.returnedDocumentCount >= input.limit) {
    logger.warn(event, "Firestore bounded query reached its limit; inspect pagination and read volume.");
    return;
  }
  logger.info(event, "Firestore bounded query completed.");
}
