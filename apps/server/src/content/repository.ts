import { RailError, type ID } from "@nexteam/core";
import type { Firestore, DocumentData } from "firebase-admin/firestore";
import type {
  ContentCalendarItem,
  ContentDraft,
  ContentEligibilityRecord,
  ContentPerformanceSnapshot,
  ContentSettings,
  ContentShowcase
} from "./contentEngine.js";
import { assertTenantDocumentOwner, setTenantOwnedDocument } from "../core/tenantOwnedWrite.js";

export interface ContentRepository {
  saveDraft(draft: ContentDraft): Promise<ContentDraft>;
  updateDraft(tenantId: ID, draftId: ID, patch: Partial<ContentDraft>): Promise<ContentDraft | null>;
  getDraft(tenantId: ID, draftId: ID): Promise<ContentDraft | null>;
  listDrafts(tenantId: ID): Promise<ContentDraft[]>;
  saveEligibility(record: ContentEligibilityRecord): Promise<ContentEligibilityRecord>;
  getEligibilityByJob(tenantId: ID, jobId: ID): Promise<ContentEligibilityRecord | null>;
  listEligibility(tenantId: ID): Promise<ContentEligibilityRecord[]>;
  saveSettings(settings: ContentSettings): Promise<ContentSettings>;
  getSettings(tenantId: ID): Promise<ContentSettings | null>;
  saveShowcase(showcase: ContentShowcase): Promise<ContentShowcase>;
  getShowcase(tenantId: ID, showcaseId: ID): Promise<ContentShowcase | null>;
  listShowcases(tenantId: ID): Promise<ContentShowcase[]>;
  saveCalendarItems(items: ContentCalendarItem[]): Promise<ContentCalendarItem[]>;
  listCalendar(tenantId: ID): Promise<ContentCalendarItem[]>;
  savePerformance(snapshot: ContentPerformanceSnapshot): Promise<ContentPerformanceSnapshot>;
  listPerformance(tenantId: ID): Promise<ContentPerformanceSnapshot[]>;
}

function saveMemoryOwned<T extends { tenantId: ID }>(map: Map<ID, T>, id: ID, value: T, label: string): void {
  const existing = map.get(id);
  if (existing && existing.tenantId !== value.tenantId) {
    throw new RailError(`${label} belongs to another tenant.`, { provider: "native", op: "saveContent", status: 409 });
  }
  map.set(id, value);
}

export class InMemoryContentRepository implements ContentRepository {
  private readonly drafts = new Map<ID, ContentDraft>();
  private readonly eligibility = new Map<ID, ContentEligibilityRecord>();
  private readonly settings = new Map<ID, ContentSettings>();
  private readonly showcases = new Map<ID, ContentShowcase>();
  private readonly calendar = new Map<ID, ContentCalendarItem>();
  private readonly performance = new Map<ID, ContentPerformanceSnapshot>();

  async saveDraft(draft: ContentDraft): Promise<ContentDraft> {
    saveMemoryOwned(this.drafts, draft.id, draft, `Content draft ${draft.id}`);
    return draft;
  }

  async updateDraft(tenantId: ID, draftId: ID, patch: Partial<ContentDraft>): Promise<ContentDraft | null> {
    const existing = this.drafts.get(draftId);
    if (!existing || existing.tenantId !== tenantId) {
      return null;
    }
    const updated = { ...existing, ...patch, id: existing.id, tenantId: existing.tenantId };
    this.drafts.set(draftId, updated);
    return updated;
  }

  async getDraft(tenantId: ID, draftId: ID): Promise<ContentDraft | null> {
    const draft = this.drafts.get(draftId);
    return draft?.tenantId === tenantId ? draft : null;
  }

  async listDrafts(tenantId: ID): Promise<ContentDraft[]> {
    return [...this.drafts.values()]
      .filter((draft) => draft.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveEligibility(record: ContentEligibilityRecord): Promise<ContentEligibilityRecord> {
    saveMemoryOwned(this.eligibility, record.id, record, `Content eligibility ${record.id}`);
    return record;
  }

  async getEligibilityByJob(tenantId: ID, jobId: ID): Promise<ContentEligibilityRecord | null> {
    return [...this.eligibility.values()].find((record) => record.tenantId === tenantId && record.jobId === jobId) ?? null;
  }

  async listEligibility(tenantId: ID): Promise<ContentEligibilityRecord[]> {
    return [...this.eligibility.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async saveSettings(settings: ContentSettings): Promise<ContentSettings> {
    saveMemoryOwned(this.settings, settings.tenantId, settings, `Content settings ${settings.tenantId}`);
    return settings;
  }

  async getSettings(tenantId: ID): Promise<ContentSettings | null> {
    return this.settings.get(tenantId) ?? null;
  }

  async saveShowcase(showcase: ContentShowcase): Promise<ContentShowcase> {
    saveMemoryOwned(this.showcases, showcase.id, showcase, `Content showcase ${showcase.id}`);
    return showcase;
  }

  async getShowcase(tenantId: ID, showcaseId: ID): Promise<ContentShowcase | null> {
    const showcase = this.showcases.get(showcaseId);
    return showcase?.tenantId === tenantId ? showcase : null;
  }

  async listShowcases(tenantId: ID): Promise<ContentShowcase[]> {
    return [...this.showcases.values()]
      .filter((showcase) => showcase.tenantId === tenantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async saveCalendarItems(items: ContentCalendarItem[]): Promise<ContentCalendarItem[]> {
    for (const item of items) {
      saveMemoryOwned(this.calendar, item.id, item, `Content calendar item ${item.id}`);
    }
    return items;
  }

  async listCalendar(tenantId: ID): Promise<ContentCalendarItem[]> {
    return [...this.calendar.values()]
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  }

  async savePerformance(snapshot: ContentPerformanceSnapshot): Promise<ContentPerformanceSnapshot> {
    saveMemoryOwned(this.performance, snapshot.id, snapshot, `Content performance ${snapshot.id}`);
    return snapshot;
  }

  async listPerformance(tenantId: ID): Promise<ContentPerformanceSnapshot[]> {
    return [...this.performance.values()]
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.metricDate.localeCompare(a.metricDate));
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

function asContentDraft(value: DocumentData): ContentDraft {
  return value as ContentDraft;
}

function asContentEligibilityRecord(value: DocumentData): ContentEligibilityRecord {
  return value as ContentEligibilityRecord;
}

function asContentSettings(value: DocumentData): ContentSettings {
  return value as ContentSettings;
}

function asContentShowcase(value: DocumentData): ContentShowcase {
  return value as ContentShowcase;
}

function asContentCalendarItem(value: DocumentData): ContentCalendarItem {
  return value as ContentCalendarItem;
}

function asContentPerformanceSnapshot(value: DocumentData): ContentPerformanceSnapshot {
  return value as ContentPerformanceSnapshot;
}

export class FirestoreContentRepository implements ContentRepository {
  constructor(private readonly db: Firestore) {}

  private saveOwned(collection: string, id: string, tenantId: string, value: object, label: string): Promise<void> {
    return setTenantOwnedDocument({
      db: this.db,
      collection,
      id,
      tenantId,
      data: asDocumentData(value),
      label
    });
  }

  async saveDraft(draft: ContentDraft): Promise<ContentDraft> {
    await this.saveOwned("contentDrafts", draft.id, draft.tenantId, draft, `Content draft ${draft.id}`);
    return draft;
  }

  async updateDraft(tenantId: ID, draftId: ID, patch: Partial<ContentDraft>): Promise<ContentDraft | null> {
    const ref = this.db.collection("contentDrafts").doc(draftId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      assertTenantDocumentOwner(snapshot.data(), tenantId, `Content draft ${draftId}`);
      const existing = asContentDraft(snapshot.data() ?? {});
      const updated = { ...existing, ...patch, id: existing.id, tenantId: existing.tenantId };
      transaction.set(ref, asDocumentData(updated));
      return updated;
    });
  }

  async getDraft(tenantId: ID, draftId: ID): Promise<ContentDraft | null> {
    const snapshot = await this.db.collection("contentDrafts").doc(draftId).get();
    if (!snapshot.exists) {
      return null;
    }
    const draft = asContentDraft(snapshot.data() ?? {});
    return draft.tenantId === tenantId ? draft : null;
  }

  async listDrafts(tenantId: ID): Promise<ContentDraft[]> {
    const snapshot = await this.db.collection("contentDrafts").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => asContentDraft(doc.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveEligibility(record: ContentEligibilityRecord): Promise<ContentEligibilityRecord> {
    await this.saveOwned("contentEligibility", record.id, record.tenantId, record, `Content eligibility ${record.id}`);
    return record;
  }

  async getEligibilityByJob(tenantId: ID, jobId: ID): Promise<ContentEligibilityRecord | null> {
    const snapshot = await this.db.collection("contentEligibility")
      .where("tenantId", "==", tenantId)
      .where("jobId", "==", jobId)
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    return doc ? asContentEligibilityRecord(doc.data()) : null;
  }

  async listEligibility(tenantId: ID): Promise<ContentEligibilityRecord[]> {
    const snapshot = await this.db.collection("contentEligibility").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => asContentEligibilityRecord(doc.data()))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async saveSettings(settings: ContentSettings): Promise<ContentSettings> {
    await this.saveOwned("contentSettings", settings.tenantId, settings.tenantId, settings, `Content settings ${settings.tenantId}`);
    return settings;
  }

  async getSettings(tenantId: ID): Promise<ContentSettings | null> {
    const snapshot = await this.db.collection("contentSettings").doc(String(tenantId)).get();
    return snapshot.exists ? asContentSettings(snapshot.data() ?? {}) : null;
  }

  async saveShowcase(showcase: ContentShowcase): Promise<ContentShowcase> {
    await this.saveOwned("contentShowcases", showcase.id, showcase.tenantId, showcase, `Content showcase ${showcase.id}`);
    return showcase;
  }

  async getShowcase(tenantId: ID, showcaseId: ID): Promise<ContentShowcase | null> {
    const snapshot = await this.db.collection("contentShowcases").doc(showcaseId).get();
    if (!snapshot.exists) {
      return null;
    }
    const showcase = asContentShowcase(snapshot.data() ?? {});
    return showcase.tenantId === tenantId ? showcase : null;
  }

  async listShowcases(tenantId: ID): Promise<ContentShowcase[]> {
    const snapshot = await this.db.collection("contentShowcases").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => asContentShowcase(doc.data()))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async saveCalendarItems(items: ContentCalendarItem[]): Promise<ContentCalendarItem[]> {
    for (const item of items) {
      await this.saveOwned("contentCalendar", item.id, item.tenantId, item, `Content calendar item ${item.id}`);
    }
    return items;
  }

  async listCalendar(tenantId: ID): Promise<ContentCalendarItem[]> {
    const snapshot = await this.db.collection("contentCalendar").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => asContentCalendarItem(doc.data()))
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  }

  async savePerformance(snapshot: ContentPerformanceSnapshot): Promise<ContentPerformanceSnapshot> {
    await this.saveOwned("contentPerformance", snapshot.id, snapshot.tenantId, snapshot, `Content performance ${snapshot.id}`);
    return snapshot;
  }

  async listPerformance(tenantId: ID): Promise<ContentPerformanceSnapshot[]> {
    const snapshot = await this.db.collection("contentPerformance").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => asContentPerformanceSnapshot(doc.data()))
      .sort((a, b) => b.metricDate.localeCompare(a.metricDate));
  }
}
