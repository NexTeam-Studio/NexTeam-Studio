import type { Firestore, DocumentData } from "firebase-admin/firestore";
import {
  approvalItemSchema,
  RailError,
  type ApprovalItem,
  type ApprovalQueueRepository,
  type ID
} from "@nexteam/core";
import { assertTenantDocumentOwner, setTenantOwnedDocument } from "../core/tenantOwnedWrite.js";

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, removeUndefined(entry)])
    );
  }
  return value;
}

function asDocumentData(value: object): DocumentData {
  return removeUndefined(value) as DocumentData;
}

export class FirestoreApprovalQueueRepository implements ApprovalQueueRepository {
  constructor(private readonly db: Firestore) {}

  async create(item: ApprovalItem): Promise<ApprovalItem> {
    const parsed = approvalItemSchema.parse(item) as ApprovalItem;
    await setTenantOwnedDocument({
      db: this.db,
      collection: "approvalQueue",
      id: parsed.id,
      tenantId: parsed.tenantId,
      data: asDocumentData(parsed),
      label: `Approval item ${parsed.id}`
    });
    return parsed;
  }

  async get(tenantId: ID, id: ID): Promise<ApprovalItem | null> {
    const doc = await this.db.collection("approvalQueue").doc(id).get();
    if (!doc.exists) return null;
    const item = approvalItemSchema.parse(doc.data()) as ApprovalItem;
    return item.tenantId === tenantId ? item : null;
  }

  async update(tenantId: ID, id: ID, patch: Partial<ApprovalItem>): Promise<ApprovalItem> {
    const ref = this.db.collection("approvalQueue").doc(id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new RailError(`Approval item ${id} was not found.`, { provider: "approval", op: "update", status: 404 });
      }
      assertTenantDocumentOwner(snapshot.data(), tenantId, `Approval item ${id}`);
      const existing = approvalItemSchema.parse(snapshot.data()) as ApprovalItem;
      const next = approvalItemSchema.parse({ ...existing, ...patch, id, tenantId }) as ApprovalItem;
      transaction.set(ref, asDocumentData(next));
      return next;
    });
  }

  async listPending(tenantId: ID): Promise<ApprovalItem[]> {
    const snapshot = await this.db
      .collection("approvalQueue")
      .where("tenantId", "==", tenantId)
      .where("status", "==", "pending")
      .get();
    return snapshot.docs.map((doc) => approvalItemSchema.parse(doc.data()) as ApprovalItem);
  }

  async listByTenant(tenantId: ID): Promise<ApprovalItem[]> {
    const snapshot = await this.db
      .collection("approvalQueue")
      .where("tenantId", "==", tenantId)
      .get();
    return snapshot.docs
      .map((doc) => approvalItemSchema.parse(doc.data()) as ApprovalItem)
      .sort((left, right) => {
        const leftTs = left.decidedAt ?? "";
        const rightTs = right.decidedAt ?? "";
        return rightTs.localeCompare(leftTs);
      });
  }
}
