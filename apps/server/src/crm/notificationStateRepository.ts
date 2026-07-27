import type { Firestore } from "firebase-admin/firestore";
import { RailError } from "@nexteam/core";
import { z } from "zod";
import { assertMemoryTenantOwner, setTenantOwnedDocument } from "../core/tenantOwnedWrite.js";

const notificationReadStateSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  tenantUserId: z.string().min(1),
  notificationId: z.string().min(1),
  readAt: z.string().min(1)
});

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

function stateId(tenantId: string, tenantUserId: string, notificationId: string): string {
  return `${tenantId}__${tenantUserId}__${encodeURIComponent(notificationId).replace(/%/g, "_")}`;
}

export interface NotificationReadState {
  id: string;
  tenantId: string;
  tenantUserId: string;
  notificationId: string;
  readAt: string;
}

export interface NotificationStateRepository {
  listReadStates(tenantId: string, tenantUserId: string): Promise<NotificationReadState[]>;
  markRead(input: { tenantId: string; tenantUserId: string; notificationId: string; readAt: string }): Promise<NotificationReadState>;
  markReadMany(input: { tenantId: string; tenantUserId: string; notificationIds: string[]; readAt: string }): Promise<NotificationReadState[]>;
}

export class InMemoryNotificationStateRepository implements NotificationStateRepository {
  private readonly records = new Map<string, NotificationReadState>();

  async listReadStates(tenantId: string, tenantUserId: string): Promise<NotificationReadState[]> {
    return [...this.records.values()]
      .filter((record) => record.tenantId === tenantId && record.tenantUserId === tenantUserId)
      .sort((left, right) => right.readAt.localeCompare(left.readAt));
  }

  async markRead(input: { tenantId: string; tenantUserId: string; notificationId: string; readAt: string }): Promise<NotificationReadState> {
    const record: NotificationReadState = {
      id: stateId(input.tenantId, input.tenantUserId, input.notificationId),
      tenantId: input.tenantId,
      tenantUserId: input.tenantUserId,
      notificationId: input.notificationId,
      readAt: input.readAt
    };
    assertMemoryTenantOwner(this.records.get(record.id), record.tenantId, `Notification read ${record.id}`);
    this.records.set(record.id, record);
    return record;
  }

  async markReadMany(input: { tenantId: string; tenantUserId: string; notificationIds: string[]; readAt: string }): Promise<NotificationReadState[]> {
    const uniqueIds = [...new Set(input.notificationIds.filter((value) => value.trim().length > 0))];
    const saved: NotificationReadState[] = [];
    for (const notificationId of uniqueIds) {
      saved.push(await this.markRead({
        tenantId: input.tenantId,
        tenantUserId: input.tenantUserId,
        notificationId,
        readAt: input.readAt
      }));
    }
    return saved;
  }
}

export class FirestoreNotificationStateRepository implements NotificationStateRepository {
  constructor(private readonly db: Firestore) {}

  async listReadStates(tenantId: string, tenantUserId: string): Promise<NotificationReadState[]> {
    const snapshot = await this.db
      .collection("notificationReads")
      .where("tenantId", "==", tenantId)
      .where("tenantUserId", "==", tenantUserId)
      .get();
    return snapshot.docs
      .map((doc) => notificationReadStateSchema.safeParse(doc.data()))
      .filter((result): result is { success: true; data: NotificationReadState } => result.success)
      .map((result) => result.data)
      .sort((left, right) => right.readAt.localeCompare(left.readAt));
  }

  async markRead(input: { tenantId: string; tenantUserId: string; notificationId: string; readAt: string }): Promise<NotificationReadState> {
    const record = notificationReadStateSchema.parse({
      id: stateId(input.tenantId, input.tenantUserId, input.notificationId),
      tenantId: input.tenantId,
      tenantUserId: input.tenantUserId,
      notificationId: input.notificationId,
      readAt: input.readAt
    });
    await setTenantOwnedDocument({
      db: this.db,
      collection: "notificationReads",
      id: record.id,
      tenantId: record.tenantId,
      data: removeUndefined(record) as FirebaseFirestore.WithFieldValue<FirebaseFirestore.DocumentData>,
      label: `Notification read ${record.id}`
    });
    return record;
  }

  async markReadMany(input: { tenantId: string; tenantUserId: string; notificationIds: string[]; readAt: string }): Promise<NotificationReadState[]> {
    const uniqueIds = [...new Set(input.notificationIds.filter((value) => value.trim().length > 0))];
    const saved: NotificationReadState[] = [];
    for (const notificationId of uniqueIds) {
      saved.push(await this.markRead({
        tenantId: input.tenantId,
        tenantUserId: input.tenantUserId,
        notificationId,
        readAt: input.readAt
      }));
    }
    return saved;
  }
}

export function requireNotificationReadState(
  value: NotificationReadState | null | undefined,
  message: string,
  op: string
): NotificationReadState {
  if (!value) {
    throw new RailError(message, { provider: "native", op, status: 404 });
  }
  return value;
}
