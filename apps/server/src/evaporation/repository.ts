import type { ID } from "@nexteam/core";
import type { Firestore } from "firebase-admin/firestore";
import type { MediaRepository } from "../fielddocs/mediaRepository.js";
import { createFieldReportRecord } from "../fielddocs/reportService.js";
import { setTenantOwnedDocument } from "../core/tenantOwnedWrite.js";
import { evaporationReportRecordSchema, evaporationReviewRecordSchema, type EvaporationReportRecord, type EvaporationReviewRecord } from "./record.js";

export { evaporationReportRecordSchema, type EvaporationReportRecord } from "./record.js";

export interface EvaporationRepository {
  saveReport(report: EvaporationReportRecord): Promise<EvaporationReportRecord>;
  getReport(tenantId: ID, reportId: ID): Promise<EvaporationReportRecord | null>;
  saveReview(review: EvaporationReviewRecord): Promise<EvaporationReviewRecord>;
  consumeReview(tenantId: ID, reviewId: ID): Promise<EvaporationReviewRecord | null>;
}

export class MemoryEvaporationRepository implements EvaporationRepository {
  private readonly reports = new Map<ID, EvaporationReportRecord>();
  private readonly reviews = new Map<ID, EvaporationReviewRecord>();

  async saveReport(report: EvaporationReportRecord): Promise<EvaporationReportRecord> {
    const parsed = evaporationReportRecordSchema.parse(report) as EvaporationReportRecord;
    this.reports.set(parsed.id, parsed);
    return parsed;
  }

  async getReport(tenantId: ID, reportId: ID): Promise<EvaporationReportRecord | null> {
    const report = this.reports.get(reportId);
    return report?.tenantId === tenantId ? report : null;
  }
  async saveReview(review: EvaporationReviewRecord): Promise<EvaporationReviewRecord> { const parsed = evaporationReviewRecordSchema.parse(review); this.reviews.set(parsed.id, parsed); return parsed; }
  async consumeReview(tenantId: ID, reviewId: ID): Promise<EvaporationReviewRecord | null> { const review = this.reviews.get(reviewId); if (!review || review.tenantId !== tenantId || review.status !== "pending") return null; const next = { ...review, status: "consumed" as const, consumedAt: new Date().toISOString() }; this.reviews.set(reviewId, next); return next; }
}

export class FirestoreEvaporationRepository implements EvaporationRepository {
  constructor(private readonly db: Firestore) {}

  async saveReport(report: EvaporationReportRecord): Promise<EvaporationReportRecord> {
    const parsed = evaporationReportRecordSchema.parse(report) as EvaporationReportRecord;
    await setTenantOwnedDocument({
      db: this.db,
      collection: "evaporationReports",
      id: parsed.id,
      tenantId: parsed.tenantId,
      data: JSON.parse(JSON.stringify(parsed)),
      label: `Evaporation report ${parsed.id}`
    });
    return parsed;
  }

  async getReport(tenantId: ID, reportId: ID): Promise<EvaporationReportRecord | null> {
    const snapshot = await this.db.collection("evaporationReports").doc(reportId).get();
    if (!snapshot.exists) return null;
    const parsed = evaporationReportRecordSchema.parse(snapshot.data()) as EvaporationReportRecord;
    return parsed.tenantId === tenantId ? parsed : null;
  }
  async saveReview(review: EvaporationReviewRecord): Promise<EvaporationReviewRecord> { const parsed = evaporationReviewRecordSchema.parse(review); await setTenantOwnedDocument({ db: this.db, collection: "evaporationReviews", id: parsed.id, tenantId: parsed.tenantId, data: JSON.parse(JSON.stringify(parsed)), label: `Evaporation review ${parsed.id}` }); return parsed; }
  async consumeReview(tenantId: ID, reviewId: ID): Promise<EvaporationReviewRecord | null> { return this.db.runTransaction(async transaction => { const ref = this.db.collection("evaporationReviews").doc(reviewId); const snap = await transaction.get(ref); if (!snap.exists) return null; const review = evaporationReviewRecordSchema.parse(snap.data()); if (review.tenantId !== tenantId || review.status !== "pending") return null; const next = { ...review, status: "consumed" as const, consumedAt: new Date().toISOString() }; transaction.set(ref, JSON.parse(JSON.stringify(next))); return next; }); }
}

/**
 * Persists evaporation calculations through the authoritative FieldDocs
 * repository. The FieldReport representation is metadata for the same report
 * (not a second file), which lets NexDocs and Closeout use their existing
 * Job/Visit artifact resolver.
 */
export class FieldDocsEvaporationRepository implements EvaporationRepository {
  constructor(
    private readonly primary: EvaporationRepository,
    private readonly mediaRepository: MediaRepository
  ) {}

  async saveReport(report: EvaporationReportRecord): Promise<EvaporationReportRecord> {
    const parsed = evaporationReportRecordSchema.parse(report) as EvaporationReportRecord;
    await this.primary.saveReport(parsed);
    if (!parsed.jobId) {
      return parsed;
    }
    await this.mediaRepository.saveReport(createFieldReportRecord({
      id: parsed.id,
      tenantId: parsed.tenantId,
      jobId: parsed.jobId,
      ...(parsed.propertyId ? { propertyId: parsed.propertyId } : {}),
      ...(parsed.visitId ? { visitId: parsed.visitId } : {}),
      kind: "evaporation",
      title: "Pool evaporation report",
      findings: [
        `Expected evaporation: ${parsed.result.evapInchesPerDay} in/day`,
        ...(parsed.result.observedLossInchesPerDay === null ? [] : [`Observed loss: ${parsed.result.observedLossInchesPerDay} in/day`]),
        ...(parsed.result.leakInchesPerDay === null ? [] : [`Leak loss after evaporation: ${parsed.result.leakInchesPerDay} in/day`]),
        `Assessment: ${parsed.result.note}`
      ],
      mediaIds: [],
      ...(parsed.checklistId ? { checklistId: parsed.checklistId } : {}),
      pdfRef: parsed.pdfRef,
      createdAt: parsed.createdAt,
      postedAt: parsed.createdAt,
      evaporationReportId: parsed.id
    }));
    return parsed;
  }

  async getReport(tenantId: ID, reportId: ID): Promise<EvaporationReportRecord | null> {
    return this.primary.getReport(tenantId, reportId);
  }
  async saveReview(review: EvaporationReviewRecord): Promise<EvaporationReviewRecord> { return this.primary.saveReview(review); }
  async consumeReview(tenantId: ID, reviewId: ID): Promise<EvaporationReviewRecord | null> { return this.primary.consumeReview(tenantId, reviewId); }
}
