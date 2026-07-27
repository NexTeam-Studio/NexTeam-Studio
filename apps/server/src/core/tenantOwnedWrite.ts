import { RailError } from "@nexteam/core";
import type { DocumentData, Firestore } from "firebase-admin/firestore";

export function assertTenantDocumentOwner(
  data: DocumentData | undefined,
  tenantId: string,
  label: string
): void {
  if (!data || typeof data.tenantId !== "string" || !data.tenantId) {
    throw new RailError(`${label} has no valid tenant owner.`, { provider: "firebase", op: "tenantOwnedWrite", status: 500 });
  }
  if (data.tenantId !== tenantId) {
    throw new RailError(`${label} belongs to another tenant.`, { provider: "firebase", op: "tenantOwnedWrite", status: 409 });
  }
}

export async function setTenantOwnedDocument(input: {
  db: Firestore;
  collection: string;
  id: string;
  tenantId: string;
  data: DocumentData;
  label: string;
}): Promise<void> {
  const ref = input.db.collection(input.collection).doc(input.id);
  await input.db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      assertTenantDocumentOwner(existing.data(), input.tenantId, input.label);
    }
    transaction.set(ref, input.data);
  });
}

export function assertMemoryTenantOwner(
  existing: { tenantId: string } | undefined,
  tenantId: string,
  label: string
): void {
  if (existing && existing.tenantId !== tenantId) {
    throw new RailError(`${label} belongs to another tenant.`, { provider: "native", op: "tenantOwnedWrite", status: 409 });
  }
}
