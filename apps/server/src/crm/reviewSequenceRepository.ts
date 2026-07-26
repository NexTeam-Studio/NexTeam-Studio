import type { Firestore, DocumentData } from "firebase-admin/firestore";
import { z } from "zod";

export type ReviewSequenceStatus = "active" | "stopped" | "completed";
export type ReviewSequenceStopReason = "reviewed" | "opt_out" | "exhausted" | "manual";
export type ReviewSequenceStepStatus = "pending" | "sent" | "stopped";

export interface ReviewSequenceStepRecord {
  id: string;
  label: string;
  offsetDays: number;
  channels: "email" | "sms" | "both";
  templateCategory: "review_request_initial" | "review_request_nudge";
  dueAt: string;
  status: ReviewSequenceStepStatus;
  sentAt?: string | undefined;
}

export interface ReviewSequenceRecord {
  id: string;
  tenantId: string;
  clientId: string;
  jobId: string;
  invoiceId?: string | undefined;
  source: "automatic" | "manual";
  providerState: "manual_only" | "gbp_pending";
  status: ReviewSequenceStatus;
  activeStepId?: string | undefined;
  nextSendAt?: string | undefined;
  stopReason?: ReviewSequenceStopReason | undefined;
  reviewedAt?: string | undefined;
  optOutAt?: string | undefined;
  stoppedAt?: string | undefined;
  optOutTokenHash?: string | undefined;
  steps: ReviewSequenceStepRecord[];
  createdAt: string;
  updatedAt: string;
}

const reviewSequenceStepSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  offsetDays: z.number().int().min(0),
  channels: z.enum(["email", "sms", "both"]),
  templateCategory: z.enum(["review_request_initial", "review_request_nudge"]),
  dueAt: z.string().min(1),
  status: z.enum(["pending", "sent", "stopped"]),
  sentAt: z.string().min(1).optional()
});

const reviewSequenceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  jobId: z.string().min(1),
  invoiceId: z.string().min(1).optional(),
  source: z.enum(["automatic", "manual"]),
  providerState: z.enum(["manual_only", "gbp_pending"]),
  status: z.enum(["active", "stopped", "completed"]),
  activeStepId: z.string().min(1).optional(),
  nextSendAt: z.string().min(1).optional(),
  stopReason: z.enum(["reviewed", "opt_out", "exhausted", "manual"]).optional(),
  reviewedAt: z.string().min(1).optional(),
  optOutAt: z.string().min(1).optional(),
  stoppedAt: z.string().min(1).optional(),
  optOutTokenHash: z.string().min(1).optional(),
  steps: z.array(reviewSequenceStepSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
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

export interface ReviewSequenceRepository {
  listReviewSequences(tenantId: string): Promise<ReviewSequenceRecord[]>;
  getReviewSequence(tenantId: string, reviewSequenceId: string): Promise<ReviewSequenceRecord | null>;
  upsertReviewSequence(record: ReviewSequenceRecord): Promise<ReviewSequenceRecord>;
}

export class InMemoryReviewSequenceRepository implements ReviewSequenceRepository {
  private readonly sequences = new Map<string, ReviewSequenceRecord>();

  async listReviewSequences(tenantId: string): Promise<ReviewSequenceRecord[]> {
    return [...this.sequences.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getReviewSequence(tenantId: string, reviewSequenceId: string): Promise<ReviewSequenceRecord | null> {
    const record = this.sequences.get(reviewSequenceId);
    return record?.tenantId === tenantId ? record : null;
  }

  async upsertReviewSequence(record: ReviewSequenceRecord): Promise<ReviewSequenceRecord> {
    const parsed = reviewSequenceSchema.parse(record) as ReviewSequenceRecord;
    this.sequences.set(parsed.id, parsed);
    return parsed;
  }
}

export class FirestoreReviewSequenceRepository implements ReviewSequenceRepository {
  constructor(private readonly db: Firestore) {}

  async listReviewSequences(tenantId: string): Promise<ReviewSequenceRecord[]> {
    const snapshot = await this.db.collection("reviewSequences").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => reviewSequenceSchema.safeParse(doc.data()))
      .filter((result): result is { success: true; data: ReviewSequenceRecord } => result.success)
      .map((result) => result.data)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getReviewSequence(tenantId: string, reviewSequenceId: string): Promise<ReviewSequenceRecord | null> {
    const snapshot = await this.db.collection("reviewSequences").doc(reviewSequenceId).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = reviewSequenceSchema.safeParse(snapshot.data());
    return parsed.success && parsed.data.tenantId === tenantId ? parsed.data : null;
  }

  async upsertReviewSequence(record: ReviewSequenceRecord): Promise<ReviewSequenceRecord> {
    const parsed = reviewSequenceSchema.parse(record) as ReviewSequenceRecord;
    await this.db.collection("reviewSequences").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }
}
