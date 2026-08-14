import { randomUUID } from "node:crypto";
import type { Firestore, DocumentData } from "firebase-admin/firestore";
import { RailError, customerDocumentPackageSchema, eventTypeSchema, type CustomerDocumentPackage, type EventType } from "@nexteam/core";
import { z } from "zod";
import { assertMemoryTenantOwner, setTenantOwnedDocument } from "../../../../../../../core/tenantOwnedWrite.js";
import {
  FirestoreVisitReminderRepository,
  MemoryVisitReminderRepository,
  type VisitReminderRecord,
  type VisitReminderRepository
} from "../../../../visits/components/visitCore/server/visitReminderRepository.js";

export {
  pendingVisitRemindersForVisit,
  type VisitReminderRecord,
  type VisitReminderStatus
} from "../../../../visits/components/visitCore/server/visitReminderRepository.js";

export type InvoiceReminderStatus = "pending" | "resolved" | "dismissed";
export type JobActionAlertStatus = "pending" | "resolved";

export interface InvoiceReminderRecord {
  id: string;
  tenantId: string;
  jobId: string;
  kind: string;
  dueAt: string;
  status: InvoiceReminderStatus;
  createdByRule: string;
  createdAt: string;
  recurrence?: "single" | "daily_9am" | undefined;
  nextDueAt?: string | undefined;
  lastTriggeredAt?: string | undefined;
  resolvedAt?: string | undefined;
  resolvedByAction?: string | undefined;
}

export interface JobActionAlertRecord {
  id: string;
  tenantId: string;
  jobId: string;
  kind: "close_or_invoice_review";
  status: JobActionAlertStatus;
  createdAt: string;
  resolvedAt?: string | undefined;
  resolvedByAction?: string | undefined;
  note?: string | undefined;
}

export interface JobLifecycleEventRecord {
  id: string;
  tenantId: string;
  jobId: string;
  type: EventType;
  createdAt: string;
  payload: Record<string, unknown>;
}

const invoiceReminderSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  kind: z.string().min(1),
  dueAt: z.string().min(1),
  status: z.enum(["pending", "resolved", "dismissed"]),
  createdByRule: z.string().min(1),
  createdAt: z.string().min(1),
  recurrence: z.enum(["single", "daily_9am"]).optional(),
  nextDueAt: z.string().optional(),
  lastTriggeredAt: z.string().optional(),
  resolvedAt: z.string().optional(),
  resolvedByAction: z.string().optional()
});

const jobActionAlertSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  kind: z.literal("close_or_invoice_review"),
  status: z.enum(["pending", "resolved"]),
  createdAt: z.string().min(1),
  resolvedAt: z.string().optional(),
  resolvedByAction: z.string().optional(),
  note: z.string().optional()
});

const lifecycleEventSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  type: eventTypeSchema,
  createdAt: z.string().min(1),
  payload: z.record(z.unknown())
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

function asDocumentData(value: object): DocumentData {
  return removeUndefined(value) as DocumentData;
}

export interface JobLifecycleRepository extends VisitReminderRepository {
  listInvoiceReminders(tenantId: string): Promise<InvoiceReminderRecord[]>;
  upsertInvoiceReminder(record: InvoiceReminderRecord): Promise<InvoiceReminderRecord>;
  listJobActionAlerts(tenantId: string): Promise<JobActionAlertRecord[]>;
  upsertJobActionAlert(record: JobActionAlertRecord): Promise<JobActionAlertRecord>;
  listLifecycleEvents(tenantId: string, jobId?: string): Promise<JobLifecycleEventRecord[]>;
  appendLifecycleEvent(record: Omit<JobLifecycleEventRecord, "id">): Promise<JobLifecycleEventRecord>;
  getCustomerDocumentPackage(tenantId: string, jobId: string): Promise<CustomerDocumentPackage | null>;
  upsertCustomerDocumentPackage(record: CustomerDocumentPackage): Promise<CustomerDocumentPackage>;
}

export class MemoryJobLifecycleRepository implements JobLifecycleRepository {
  private readonly invoiceReminders = new Map<string, InvoiceReminderRecord>();
  private readonly visitReminders = new MemoryVisitReminderRepository();
  private readonly jobActionAlerts = new Map<string, JobActionAlertRecord>();
  private readonly lifecycleEvents = new Map<string, JobLifecycleEventRecord>();
  private readonly customerDocumentPackages = new Map<string, CustomerDocumentPackage>();

  async listInvoiceReminders(tenantId: string): Promise<InvoiceReminderRecord[]> {
    return [...this.invoiceReminders.values()].filter((record) => record.tenantId === tenantId);
  }

  async upsertInvoiceReminder(record: InvoiceReminderRecord): Promise<InvoiceReminderRecord> {
    const parsed = invoiceReminderSchema.parse(record) as InvoiceReminderRecord;
    assertMemoryTenantOwner(this.invoiceReminders.get(parsed.id), parsed.tenantId, `Invoice reminder ${parsed.id}`);
    this.invoiceReminders.set(parsed.id, parsed);
    return parsed;
  }

  async listVisitReminders(tenantId: string): Promise<VisitReminderRecord[]> {
    return this.visitReminders.listVisitReminders(tenantId);
  }

  async upsertVisitReminder(record: VisitReminderRecord): Promise<VisitReminderRecord> {
    return this.visitReminders.upsertVisitReminder(record);
  }

  async listJobActionAlerts(tenantId: string): Promise<JobActionAlertRecord[]> {
    return [...this.jobActionAlerts.values()].filter((record) => record.tenantId === tenantId);
  }

  async upsertJobActionAlert(record: JobActionAlertRecord): Promise<JobActionAlertRecord> {
    const parsed = jobActionAlertSchema.parse(record) as JobActionAlertRecord;
    assertMemoryTenantOwner(this.jobActionAlerts.get(parsed.id), parsed.tenantId, `Job action alert ${parsed.id}`);
    this.jobActionAlerts.set(parsed.id, parsed);
    return parsed;
  }

  async listLifecycleEvents(tenantId: string, jobId?: string): Promise<JobLifecycleEventRecord[]> {
    return [...this.lifecycleEvents.values()]
      .filter((record) => record.tenantId === tenantId)
      .filter((record) => !jobId || record.jobId === jobId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async appendLifecycleEvent(record: Omit<JobLifecycleEventRecord, "id">): Promise<JobLifecycleEventRecord> {
    const parsed = lifecycleEventSchema.parse({ ...record, id: `job_evt_${randomUUID()}` }) as JobLifecycleEventRecord;
    this.lifecycleEvents.set(parsed.id, parsed);
    return parsed;
  }

  async getCustomerDocumentPackage(tenantId: string, jobId: string): Promise<CustomerDocumentPackage | null> {
    return [...this.customerDocumentPackages.values()].find((record) => record.tenantId === tenantId && record.jobId === jobId) ?? null;
  }

  async upsertCustomerDocumentPackage(record: CustomerDocumentPackage): Promise<CustomerDocumentPackage> {
    const parsed = customerDocumentPackageSchema.parse(record) as CustomerDocumentPackage;
    assertMemoryTenantOwner(this.customerDocumentPackages.get(parsed.id), parsed.tenantId, `Customer document package ${parsed.id}`);
    this.customerDocumentPackages.set(parsed.id, parsed);
    return parsed;
  }
}

export class FirestoreJobLifecycleRepository implements JobLifecycleRepository {
  private readonly visitReminders: FirestoreVisitReminderRepository;

  constructor(private readonly db: Firestore) {
    this.visitReminders = new FirestoreVisitReminderRepository(db);
  }

  private async listByTenant<T>(collectionName: string, tenantId: string, schema: z.ZodSchema<T>): Promise<T[]> {
    const snapshot = await this.db.collection(collectionName).where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => schema.parse(doc.data()));
  }

  async listInvoiceReminders(tenantId: string): Promise<InvoiceReminderRecord[]> {
    return this.listByTenant("jobInvoiceReminders", tenantId, invoiceReminderSchema) as Promise<InvoiceReminderRecord[]>;
  }

  async upsertInvoiceReminder(record: InvoiceReminderRecord): Promise<InvoiceReminderRecord> {
    const parsed = invoiceReminderSchema.parse(record) as InvoiceReminderRecord;
    await setTenantOwnedDocument({ db: this.db, collection: "jobInvoiceReminders", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Invoice reminder ${parsed.id}` });
    return parsed;
  }

  async listVisitReminders(tenantId: string): Promise<VisitReminderRecord[]> {
    return this.visitReminders.listVisitReminders(tenantId);
  }

  async upsertVisitReminder(record: VisitReminderRecord): Promise<VisitReminderRecord> {
    return this.visitReminders.upsertVisitReminder(record);
  }

  async listJobActionAlerts(tenantId: string): Promise<JobActionAlertRecord[]> {
    return this.listByTenant("jobActionAlerts", tenantId, jobActionAlertSchema) as Promise<JobActionAlertRecord[]>;
  }

  async upsertJobActionAlert(record: JobActionAlertRecord): Promise<JobActionAlertRecord> {
    const parsed = jobActionAlertSchema.parse(record) as JobActionAlertRecord;
    await setTenantOwnedDocument({ db: this.db, collection: "jobActionAlerts", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Job action alert ${parsed.id}` });
    return parsed;
  }

  async listLifecycleEvents(tenantId: string, jobId?: string): Promise<JobLifecycleEventRecord[]> {
    const records = await this.listByTenant("jobLifecycleEvents", tenantId, lifecycleEventSchema) as JobLifecycleEventRecord[];
    return records
      .filter((record) => !jobId || record.jobId === jobId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async appendLifecycleEvent(record: Omit<JobLifecycleEventRecord, "id">): Promise<JobLifecycleEventRecord> {
    const parsed = lifecycleEventSchema.parse({ ...record, id: `job_evt_${randomUUID()}` }) as JobLifecycleEventRecord;
    await setTenantOwnedDocument({ db: this.db, collection: "jobLifecycleEvents", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Job lifecycle event ${parsed.id}` });
    return parsed;
  }

  async getCustomerDocumentPackage(tenantId: string, jobId: string): Promise<CustomerDocumentPackage | null> {
    const records = await this.listByTenant("customerDocumentPackages", tenantId, customerDocumentPackageSchema) as CustomerDocumentPackage[];
    return records.find((record) => record.jobId === jobId) ?? null;
  }

  async upsertCustomerDocumentPackage(record: CustomerDocumentPackage): Promise<CustomerDocumentPackage> {
    const parsed = customerDocumentPackageSchema.parse(record) as CustomerDocumentPackage;
    await setTenantOwnedDocument({ db: this.db, collection: "customerDocumentPackages", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Customer document package ${parsed.id}` });
    return parsed;
  }
}

export function pendingInvoiceReminderForJob(reminders: InvoiceReminderRecord[], jobId: string): InvoiceReminderRecord | undefined {
  return reminders
    .filter((record) => record.jobId === jobId && record.status === "pending")
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0];
}

export function pendingJobAlertForJob(alerts: JobActionAlertRecord[], jobId: string): JobActionAlertRecord | undefined {
  return alerts
    .filter((record) => record.jobId === jobId && record.status === "pending")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
}

export function requireJobLifecycleRecord<T>(value: T | null | undefined, message: string, op: string): T {
  if (!value) {
    throw new RailError(message, { provider: "native", op, status: 404 });
  }
  return value;
}
