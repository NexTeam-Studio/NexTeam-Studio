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

/**
 * Platform records such as pre-tenant Prospects have no tenantId yet. They are
 * still written transactionally so an Admin SDK write cannot bypass the common
 * persistence/audit seam. Platform routes provide the operator authorization.
 */
export async function setPlatformOwnedDocument(input: {
  db: Firestore;
  collection: string;
  id: string;
  data: DocumentData;
}): Promise<void> {
  const ref = input.db.collection(input.collection).doc(input.id);
  await input.db.runTransaction(async (transaction) => {
    await transaction.get(ref);
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

export async function updateTenantOwnedDocument<T extends DocumentData>(input: {
  db: Firestore;
  collection: string;
  id: string;
  tenantId: string;
  label: string;
  update: (existing: DocumentData) => T;
}): Promise<T> {
  const ref = input.db.collection(input.collection).doc(input.id);
  return input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new RailError(`${input.label} was not found.`, { provider: "native", op: "tenantOwnedWrite", status: 404 });
    }
    const existing = snapshot.data();
    assertTenantDocumentOwner(existing, input.tenantId, input.label);
    const next = input.update(existing ?? {});
    transaction.set(ref, next);
    return next;
  });
}

export async function deleteTenantOwnedDocument(input: {
  db: Firestore;
  collection: string;
  id: string;
  tenantId: string;
  label: string;
}): Promise<boolean> {
  const ref = input.db.collection(input.collection).doc(input.id);
  return input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    assertTenantDocumentOwner(snapshot.data(), input.tenantId, input.label);
    transaction.delete(ref);
    return true;
  });
}
