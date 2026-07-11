import type { ID } from "@nexteam/core";
import type { Firestore, DocumentData } from "firebase-admin/firestore";
import type { ContentCalendarItem, ContentDraft, ContentPerformanceSnapshot } from "./contentEngine.js";

export interface ContentRepository {
  saveDraft(draft: ContentDraft): Promise<ContentDraft>;
  updateDraft(tenantId: ID, draftId: ID, patch: Partial<ContentDraft>): Promise<ContentDraft | null>;
  getDraft(tenantId: ID, draftId: ID): Promise<ContentDraft | null>;
  listDrafts(tenantId: ID): Promise<ContentDraft[]>;
  saveCalendarItems(items: ContentCalendarItem[]): Promise<ContentCalendarItem[]>;
  listCalendar(tenantId: ID): Promise<ContentCalendarItem[]>;
  savePerformance(snapshot: ContentPerformanceSnapshot): Promise<ContentPerformanceSnapshot>;
  listPerformance(tenantId: ID): Promise<ContentPerformanceSnapshot[]>;
}

export class InMemoryContentRepository implements ContentRepository {
  private readonly drafts = new Map<ID, ContentDraft>();
  private readonly calendar = new Map<ID, ContentCalendarItem>();
  private readonly performance = new Map<ID, ContentPerformanceSnapshot>();

  async saveDraft(draft: ContentDraft): Promise<ContentDraft> {
    this.drafts.set(draft.id, draft);
    return draft;
  }

  async updateDraft(tenantId: ID, draftId: ID, patch: Partial<ContentDraft>): Promise<ContentDraft | null> {
    const existing = this.drafts.get(draftId);
    if (!existing || existing.tenantId !== tenantId) {
      return null;
    }
    const updated = { ...existing, ...patch };
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

  async saveCalendarItems(items: ContentCalendarItem[]): Promise<ContentCalendarItem[]> {
    for (const item of items) {
      this.calendar.set(item.id, item);
    }
    return items;
  }

  async listCalendar(tenantId: ID): Promise<ContentCalendarItem[]> {
    return [...this.calendar.values()]
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  }

  async savePerformance(snapshot: ContentPerformanceSnapshot): Promise<ContentPerformanceSnapshot> {
    this.performance.set(snapshot.id, snapshot);
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

function asContentCalendarItem(value: DocumentData): ContentCalendarItem {
  return value as ContentCalendarItem;
}

function asContentPerformanceSnapshot(value: DocumentData): ContentPerformanceSnapshot {
  return value as ContentPerformanceSnapshot;
}

export class FirestoreContentRepository implements ContentRepository {
  constructor(private readonly db: Firestore) {}

  async saveDraft(draft: ContentDraft): Promise<ContentDraft> {
    await this.db.collection("contentDrafts").doc(draft.id).set(asDocumentData(draft));
    return draft;
  }

  async updateDraft(tenantId: ID, draftId: ID, patch: Partial<ContentDraft>): Promise<ContentDraft | null> {
    const existing = await this.getDraft(tenantId, draftId);
    if (!existing) {
      return null;
    }
    const updated = { ...existing, ...patch };
    await this.db.collection("contentDrafts").doc(draftId).set(asDocumentData(updated));
    return updated;
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

  async saveCalendarItems(items: ContentCalendarItem[]): Promise<ContentCalendarItem[]> {
    for (const item of items) {
      await this.db.collection("contentCalendar").doc(item.id).set(asDocumentData(item));
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
    await this.db.collection("contentPerformance").doc(snapshot.id).set(asDocumentData(snapshot));
    return snapshot;
  }

  async listPerformance(tenantId: ID): Promise<ContentPerformanceSnapshot[]> {
    const snapshot = await this.db.collection("contentPerformance").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => asContentPerformanceSnapshot(doc.data()))
      .sort((a, b) => b.metricDate.localeCompare(a.metricDate));
  }
}
