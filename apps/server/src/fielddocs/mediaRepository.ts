import type { Firestore, DocumentData } from "firebase-admin/firestore";
import { mediaSchema, RailError, type Media } from "@nexteam/core";

export interface MediaRepository {
  listMedia(tenantId: string): Promise<Media[]>;
  getMedia(tenantId: string, id: string): Promise<Media | null>;
  saveMedia(media: Media): Promise<Media>;
  updateMedia(id: string, patch: Partial<Media>): Promise<Media>;
}

export class MemoryMediaRepository implements MediaRepository {
  private readonly records: Media[];

  constructor(records: Media[] = []) {
    this.records = [...records];
  }

  async listMedia(tenantId: string): Promise<Media[]> {
    return this.records.filter((record) => record.tenantId === tenantId);
  }

  async getMedia(tenantId: string, id: string): Promise<Media | null> {
    return this.records.find((record) => record.tenantId === tenantId && record.id === id) ?? null;
  }

  async saveMedia(media: Media): Promise<Media> {
    this.records.push(media);
    return media;
  }

  async updateMedia(id: string, patch: Partial<Media>): Promise<Media> {
    const index = this.records.findIndex((record) => record.id === id);
    if (index === -1) {
      throw new RailError(`Native media ${id} was not found.`, { provider: "native", op: "updateMedia", status: 404 });
    }
    const existing = this.records[index];
    if (!existing) {
      throw new RailError(`Native media ${id} was not found.`, { provider: "native", op: "updateMedia", status: 404 });
    }
    const next = mediaSchema.parse({ ...existing, ...patch }) as Media;
    this.records[index] = next;
    return next;
  }
}

function asDocumentData(value: object): DocumentData {
  return value as DocumentData;
}

export class FirestoreMediaRepository implements MediaRepository {
  constructor(private readonly db: Firestore) {}

  async listMedia(tenantId: string): Promise<Media[]> {
    const snapshot = await this.db.collection("media").where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => mediaSchema.parse(doc.data()) as Media);
  }

  async getMedia(tenantId: string, id: string): Promise<Media | null> {
    const snapshot = await this.db.collection("media").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = mediaSchema.parse(snapshot.data()) as Media;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async saveMedia(media: Media): Promise<Media> {
    await this.db.collection("media").doc(media.id).set(asDocumentData(media));
    return mediaSchema.parse(media) as Media;
  }

  async updateMedia(id: string, patch: Partial<Media>): Promise<Media> {
    const ref = this.db.collection("media").doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw new RailError(`Native media ${id} was not found.`, { provider: "native", op: "updateMedia", status: 404 });
    }
    const next = mediaSchema.parse({ ...snapshot.data(), ...patch }) as Media;
    await ref.set(asDocumentData(next));
    return next;
  }
}
