import type { Firestore } from "firebase-admin/firestore";
import { addressSchema, intakeSnapshotSchema, RailError } from "@nexteam/core";
import type { ScheduledVisit } from "./schedulingEngine.js";
import { z } from "zod";

const scheduledVisitSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  requestId: z.string().min(1).optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  assignedTo: z.array(z.string().min(1)),
  checklistRef: z.string().min(1).optional(),
  outcome: z.string().optional(),
  intake: intakeSnapshotSchema.optional(),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  title: z.string().min(1),
  location: z.object({
    label: z.string().min(1),
    address: addressSchema.optional(),
    geo: z.object({ lat: z.number(), lng: z.number() }).optional()
  }),
  status: z.enum(["scheduled", "pending_approval", "complete", "cancelled"]),
  details: z.string().optional(),
  confirmedAt: z.string().optional(),
  confirmedBy: z.string().optional(),
  confirmedVia: z.enum(["portal", "office"]).optional(),
  completedAt: z.string().optional(),
  completedBy: z.string().optional(),
  source: z.string().optional(),
  readOnly: z.boolean().optional()
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

export interface SchedulingRepository {
  listVisits(tenantId: string, range: { from?: string; to?: string }): Promise<ScheduledVisit[]>;
  saveVisit(visit: ScheduledVisit): Promise<ScheduledVisit>;
  getVisit(tenantId: string, visitId: string): Promise<ScheduledVisit | null>;
}

export class InMemorySchedulingRepository implements SchedulingRepository {
  private readonly visits = new Map<string, ScheduledVisit>();

  async listVisits(tenantId: string, range: { from?: string; to?: string } = {}): Promise<ScheduledVisit[]> {
    const from = range.from ? new Date(range.from) : null;
    const to = range.to ? new Date(range.to) : null;
    return [...this.visits.values()]
      .filter((visit) => visit.tenantId === tenantId)
      .filter((visit) => !from || new Date(visit.end) >= from)
      .filter((visit) => !to || new Date(visit.start) <= to)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  async saveVisit(visit: ScheduledVisit): Promise<ScheduledVisit> {
    const existing = this.visits.get(visit.id);
    if (existing && existing.tenantId !== visit.tenantId) {
      throw new RailError(`Scheduled visit ${visit.id} belongs to another tenant.`, { provider: "native", op: "saveScheduledVisit", status: 409 });
    }
    this.visits.set(visit.id, visit);
    return visit;
  }

  async getVisit(tenantId: string, visitId: string): Promise<ScheduledVisit | null> {
    const visit = this.visits.get(visitId);
    return visit?.tenantId === tenantId ? visit : null;
  }
}

export class FirestoreSchedulingRepository implements SchedulingRepository {
  constructor(private readonly db: Firestore) {}

  async listVisits(tenantId: string, range: { from?: string; to?: string } = {}): Promise<ScheduledVisit[]> {
    const snapshot = await this.db.collection("scheduledVisits").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => scheduledVisitSchema.safeParse(doc.data()))
      .filter((result): result is { success: true; data: ScheduledVisit } => result.success)
      .map((result) => result.data)
      .filter((visit) => !range.from || new Date(visit.end) >= new Date(range.from))
      .filter((visit) => !range.to || new Date(visit.start) <= new Date(range.to))
      .sort((left, right) => left.start.localeCompare(right.start));
  }

  async saveVisit(visit: ScheduledVisit): Promise<ScheduledVisit> {
    const parsed = scheduledVisitSchema.parse(visit) as ScheduledVisit;
    const ref = this.db.collection("scheduledVisits").doc(parsed.id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        const existing = scheduledVisitSchema.safeParse(snapshot.data());
        if (!existing.success) {
          throw new RailError(`Scheduled visit ${parsed.id} could not be parsed.`, { provider: "firebase", op: "saveScheduledVisit", status: 500 });
        }
        if (existing.data.tenantId !== parsed.tenantId) {
          throw new RailError(`Scheduled visit ${parsed.id} belongs to another tenant.`, { provider: "firebase", op: "saveScheduledVisit", status: 409 });
        }
      }
      transaction.set(ref, removeUndefined(parsed) as FirebaseFirestore.WithFieldValue<FirebaseFirestore.DocumentData>);
    });
    return parsed;
  }

  async getVisit(tenantId: string, visitId: string): Promise<ScheduledVisit | null> {
    const snapshot = await this.db.collection("scheduledVisits").doc(visitId).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = scheduledVisitSchema.safeParse(snapshot.data());
    if (!parsed.success) {
      throw new RailError(`Scheduled visit ${visitId} could not be parsed.`, { provider: "firebase", op: "getScheduledVisit", status: 500 });
    }
    return parsed.data.tenantId === tenantId ? parsed.data : null;
  }
}
