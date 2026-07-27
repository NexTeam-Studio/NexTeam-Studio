import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { z } from "zod";

export type VisitReminderStatus = "pending" | "sent" | "cancelled";

export interface VisitReminderRecord {
  id: string;
  tenantId: string;
  jobId: string;
  visitId: string;
  channel: "email" | "sms";
  trigger: "day_before_email" | "hour_before_sms";
  dueAt: string;
  status: VisitReminderStatus;
  createdAt: string;
  sentAt?: string | undefined;
  cancelledAt?: string | undefined;
}

const visitReminderSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  visitId: z.string().min(1),
  channel: z.enum(["email", "sms"]),
  trigger: z.enum(["day_before_email", "hour_before_sms"]),
  dueAt: z.string().min(1),
  status: z.enum(["pending", "sent", "cancelled"]),
  createdAt: z.string().min(1),
  sentAt: z.string().optional(),
  cancelledAt: z.string().optional()
});

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

export interface VisitReminderRepository {
  listVisitReminders(tenantId: string): Promise<VisitReminderRecord[]>;
  upsertVisitReminder(record: VisitReminderRecord): Promise<VisitReminderRecord>;
}

export class MemoryVisitReminderRepository implements VisitReminderRepository {
  private readonly records = new Map<string, VisitReminderRecord>();

  async listVisitReminders(tenantId: string): Promise<VisitReminderRecord[]> {
    return [...this.records.values()].filter((record) => record.tenantId === tenantId);
  }

  async upsertVisitReminder(record: VisitReminderRecord): Promise<VisitReminderRecord> {
    const parsed = visitReminderSchema.parse(record) as VisitReminderRecord;
    this.records.set(parsed.id, parsed);
    return parsed;
  }
}

export class FirestoreVisitReminderRepository implements VisitReminderRepository {
  constructor(private readonly db: Firestore) {}

  async listVisitReminders(tenantId: string): Promise<VisitReminderRecord[]> {
    const snapshot = await this.db.collection("jobVisitReminders").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => visitReminderSchema.parse(doc.data()) as VisitReminderRecord);
  }

  async upsertVisitReminder(record: VisitReminderRecord): Promise<VisitReminderRecord> {
    const parsed = visitReminderSchema.parse(record) as VisitReminderRecord;
    await this.db.collection("jobVisitReminders").doc(parsed.id).set(removeUndefined(parsed) as DocumentData, { merge: true });
    return parsed;
  }
}

export function pendingVisitRemindersForVisit(reminders: VisitReminderRecord[], visitId: string): VisitReminderRecord[] {
  return reminders
    .filter((record) => record.visitId === visitId && record.status === "pending")
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
}
