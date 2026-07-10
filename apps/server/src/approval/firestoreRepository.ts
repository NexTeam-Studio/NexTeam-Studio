import type { Firestore, DocumentData } from "firebase-admin/firestore";
import {
  approvalItemSchema,
  RailError,
  type ApprovalItem,
  type ApprovalQueueRepository,
  type ID
} from "@nexteam/core";

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
    // @tenant-doc:approvalQueue approvalItemSchema requires tenantId before write.
    await this.db.collection("approvalQueue").doc(parsed.id).set(asDocumentData(parsed));
    return parsed;
  }

  async get(id: ID): Promise<ApprovalItem | null> {
    const doc = await this.db.collection("approvalQueue").doc(id).get();
    return doc.exists ? (approvalItemSchema.parse(doc.data()) as ApprovalItem) : null;
  }

  async update(id: ID, patch: Partial<ApprovalItem>): Promise<ApprovalItem> {
    const existing = await this.get(id);
    if (!existing) {
      throw new RailError(`Approval item ${id} was not found.`, { provider: "approval", op: "update", status: 404 });
    }
    const next = approvalItemSchema.parse({ ...existing, ...patch }) as ApprovalItem;
    await this.db.collection("approvalQueue").doc(id).set(asDocumentData(next), { merge: false });
    return next;
  }

  async listPending(tenantId: ID): Promise<ApprovalItem[]> {
    const snapshot = await this.db
      .collection("approvalQueue")
      .where("tenantId", "==", tenantId)
      .where("status", "==", "pending")
      .get();
    return snapshot.docs.map((doc) => approvalItemSchema.parse(doc.data()) as ApprovalItem);
  }
}
