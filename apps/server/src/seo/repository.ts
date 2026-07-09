import type { Firestore, DocumentData } from "firebase-admin/firestore";
import {
  seoArticleBriefSchema,
  seoAuditSchema,
  seoRankSnapshotSchema,
  seoReportSchema,
  type SeoArticleBrief,
  type SeoAudit,
  type SeoRankSnapshot,
  type SeoReport
} from "./schemas.js";

export interface SeoRepository {
  saveRankSnapshots(snapshots: SeoRankSnapshot[]): Promise<SeoRankSnapshot[]>;
  listRankSnapshots(tenantId: string): Promise<SeoRankSnapshot[]>;
  saveAudit(audit: SeoAudit): Promise<SeoAudit>;
  getAudit(tenantId: string, auditId: string): Promise<SeoAudit | null>;
  listAudits(tenantId: string): Promise<SeoAudit[]>;
  saveArticleBrief(brief: SeoArticleBrief): Promise<SeoArticleBrief>;
  listArticleBriefs(tenantId: string): Promise<SeoArticleBrief[]>;
  saveReport(report: SeoReport): Promise<SeoReport>;
  listReports(tenantId: string): Promise<SeoReport[]>;
}

export class InMemorySeoRepository implements SeoRepository {
  private readonly rankSnapshots = new Map<string, SeoRankSnapshot>();
  private readonly audits = new Map<string, SeoAudit>();
  private readonly articleBriefs = new Map<string, SeoArticleBrief>();
  private readonly reports = new Map<string, SeoReport>();

  async saveRankSnapshots(snapshots: SeoRankSnapshot[]): Promise<SeoRankSnapshot[]> {
    const parsed = snapshots.map((snapshot) => seoRankSnapshotSchema.parse(snapshot) as SeoRankSnapshot);
    for (const snapshot of parsed) {
      this.rankSnapshots.set(snapshot.id, snapshot);
    }
    return parsed;
  }

  async listRankSnapshots(tenantId: string): Promise<SeoRankSnapshot[]> {
    return Array.from(this.rankSnapshots.values())
      .filter((snapshot) => snapshot.tenantId === tenantId)
      .sort((left, right) => right.checkedAt.localeCompare(left.checkedAt));
  }

  async saveAudit(audit: SeoAudit): Promise<SeoAudit> {
    const parsed = seoAuditSchema.parse(audit) as SeoAudit;
    this.audits.set(parsed.id, parsed);
    return parsed;
  }

  async getAudit(tenantId: string, auditId: string): Promise<SeoAudit | null> {
    const audit = this.audits.get(auditId);
    return audit?.tenantId === tenantId ? audit : null;
  }

  async listAudits(tenantId: string): Promise<SeoAudit[]> {
    return Array.from(this.audits.values())
      .filter((audit) => audit.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async saveArticleBrief(brief: SeoArticleBrief): Promise<SeoArticleBrief> {
    const parsed = seoArticleBriefSchema.parse(brief) as SeoArticleBrief;
    this.articleBriefs.set(parsed.id, parsed);
    return parsed;
  }

  async listArticleBriefs(tenantId: string): Promise<SeoArticleBrief[]> {
    return Array.from(this.articleBriefs.values())
      .filter((brief) => brief.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async saveReport(report: SeoReport): Promise<SeoReport> {
    const parsed = seoReportSchema.parse(report) as SeoReport;
    this.reports.set(parsed.id, parsed);
    return parsed;
  }

  async listReports(tenantId: string): Promise<SeoReport[]> {
    return Array.from(this.reports.values())
      .filter((report) => report.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}

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

export class FirestoreSeoRepository implements SeoRepository {
  constructor(private readonly db: Firestore) {}

  async saveRankSnapshots(snapshots: SeoRankSnapshot[]): Promise<SeoRankSnapshot[]> {
    const parsed = snapshots.map((snapshot) => seoRankSnapshotSchema.parse(snapshot) as SeoRankSnapshot);
    const batch = this.db.batch();
    for (const snapshot of parsed) {
      // @tenant-doc:seoRankSnapshots seoRankSnapshotSchema requires tenantId before write.
      batch.set(this.db.collection("seoRankSnapshots").doc(snapshot.id), asDocumentData(snapshot), { merge: true });
    }
    await batch.commit();
    return parsed;
  }

  async listRankSnapshots(tenantId: string): Promise<SeoRankSnapshot[]> {
    const snapshot = await this.db.collection("seoRankSnapshots").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => seoRankSnapshotSchema.parse(doc.data()) as SeoRankSnapshot)
      .sort((left, right) => right.checkedAt.localeCompare(left.checkedAt));
  }

  async saveAudit(audit: SeoAudit): Promise<SeoAudit> {
    const parsed = seoAuditSchema.parse(audit) as SeoAudit;
    // @tenant-doc:seoAudits seoAuditSchema requires tenantId before write.
    await this.db.collection("seoAudits").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async getAudit(tenantId: string, auditId: string): Promise<SeoAudit | null> {
    const doc = await this.db.collection("seoAudits").doc(auditId).get();
    if (!doc.exists) {
      return null;
    }
    const audit = seoAuditSchema.parse(doc.data()) as SeoAudit;
    return audit.tenantId === tenantId ? audit : null;
  }

  async listAudits(tenantId: string): Promise<SeoAudit[]> {
    const snapshot = await this.db.collection("seoAudits").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => seoAuditSchema.parse(doc.data()) as SeoAudit)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async saveArticleBrief(brief: SeoArticleBrief): Promise<SeoArticleBrief> {
    const parsed = seoArticleBriefSchema.parse(brief) as SeoArticleBrief;
    // @tenant-doc:seoArticleBriefs seoArticleBriefSchema requires tenantId before write.
    await this.db.collection("seoArticleBriefs").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async listArticleBriefs(tenantId: string): Promise<SeoArticleBrief[]> {
    const snapshot = await this.db.collection("seoArticleBriefs").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => seoArticleBriefSchema.parse(doc.data()) as SeoArticleBrief)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async saveReport(report: SeoReport): Promise<SeoReport> {
    const parsed = seoReportSchema.parse(report) as SeoReport;
    // @tenant-doc:seoReports seoReportSchema requires tenantId before write.
    await this.db.collection("seoReports").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async listReports(tenantId: string): Promise<SeoReport[]> {
    const snapshot = await this.db.collection("seoReports").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => seoReportSchema.parse(doc.data()) as SeoReport)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
