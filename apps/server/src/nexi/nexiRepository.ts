import type { Firestore } from "firebase-admin/firestore";
import {
  conversationRecordSchema,
  failureLogRecordSchema,
  siteJobBlueprintSchema,
  type ConversationRecord,
  type FailureLogRecord,
  type SiteJobBlueprint
} from "@nexteam/core";
import type { GatewayMessage } from "@nexteam/nexi";

export interface NexiRepository {
  loadHistory(tenantId: string, conversationId: string | undefined, limit: number): Promise<GatewayMessage[]>;
  loadRecentConversations(tenantId: string, conversationId: string | undefined, limit: number): Promise<ConversationRecord[]>;
  loadSiteJobBlueprints(tenantId: string, limit: number): Promise<SiteJobBlueprint[]>;
  saveConversation(record: Omit<ConversationRecord, "id" | "createdAt">): Promise<ConversationRecord>;
  saveFailure(record: Omit<FailureLogRecord, "id" | "createdAt" | "module">): Promise<FailureLogRecord>;
  saveSiteJobBlueprint(record: SiteJobBlueprint): Promise<SiteJobBlueprint>;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function firestoreDoc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sortByIsoDesc<T>(records: T[], field: keyof T): T[] {
  return [...records].sort((left, right) => String(right[field]).localeCompare(String(left[field])));
}

export class MemoryNexiRepository implements NexiRepository {
  readonly conversations: ConversationRecord[] = [];
  readonly failureLog: FailureLogRecord[] = [];
  readonly siteJobBlueprints: SiteJobBlueprint[] = [];

  async loadHistory(tenantId: string, conversationId: string | undefined, limit: number): Promise<GatewayMessage[]> {
    return (await this.loadRecentConversations(tenantId, conversationId, limit))
      .flatMap((record): GatewayMessage[] => [
        { role: "user", content: record.userText },
        { role: "assistant", content: record.assistantText }
      ]);
  }

  async loadRecentConversations(tenantId: string, conversationId: string | undefined, limit: number): Promise<ConversationRecord[]> {
    if (!conversationId) {
      return [];
    }
    return this.conversations
      .filter((record) => record.tenantId === tenantId)
      .filter((record) => record.conversationId === conversationId)
      .slice(-limit);
  }

  async loadSiteJobBlueprints(tenantId: string, limit: number): Promise<SiteJobBlueprint[]> {
    return this.siteJobBlueprints
      .filter((record) => record.tenantId === tenantId)
      .slice(-limit)
      .reverse();
  }

  async saveConversation(record: Omit<ConversationRecord, "id" | "createdAt">): Promise<ConversationRecord> {
    const saved = conversationRecordSchema.parse({ ...record, id: newId("conv"), createdAt: new Date().toISOString() });
    this.conversations.push(saved);
    return saved;
  }

  async saveFailure(record: Omit<FailureLogRecord, "id" | "createdAt" | "module">): Promise<FailureLogRecord> {
    const saved = failureLogRecordSchema.parse({
      ...record,
      id: newId("fail"),
      module: "nexi",
      createdAt: new Date().toISOString()
    });
    this.failureLog.push(saved);
    return saved;
  }

  async saveSiteJobBlueprint(record: SiteJobBlueprint): Promise<SiteJobBlueprint> {
    const parsed = siteJobBlueprintSchema.parse(record) as SiteJobBlueprint;
    this.siteJobBlueprints.push(parsed);
    return parsed;
  }
}

export class FirestoreNexiRepository implements NexiRepository {
  constructor(private readonly db: Firestore) {}

  async loadHistory(tenantId: string, conversationId: string | undefined, limit: number): Promise<GatewayMessage[]> {
    return (await this.loadRecentConversations(tenantId, conversationId, limit))
      .flatMap((record): GatewayMessage[] => [
        { role: "user", content: record.userText },
        { role: "assistant", content: record.assistantText }
      ]);
  }

  async loadRecentConversations(tenantId: string, conversationId: string | undefined, limit: number): Promise<ConversationRecord[]> {
    if (!conversationId) {
      return [];
    }
    const snapshot = await this.db
      .collection("conversations")
      .where("tenantId", "==", tenantId)
      .where("conversationId", "==", conversationId)
      .get();
    return snapshot.docs
      .map((doc) => conversationRecordSchema.parse(doc.data()))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(-limit);
  }

  async loadSiteJobBlueprints(tenantId: string, limit: number): Promise<SiteJobBlueprint[]> {
    const snapshot = await this.db
      .collection("siteJobBlueprints")
      .where("tenantId", "==", tenantId)
      .get();
    return sortByIsoDesc(
      snapshot.docs.map((doc) => siteJobBlueprintSchema.parse(doc.data()) as SiteJobBlueprint),
      "extractedAt"
    ).slice(0, limit);
  }

  async saveConversation(record: Omit<ConversationRecord, "id" | "createdAt">): Promise<ConversationRecord> {
    const saved = conversationRecordSchema.parse({ ...record, id: newId("conv"), createdAt: new Date().toISOString() });
    await this.db.collection("conversations").doc(saved.id).set(firestoreDoc(saved));
    return saved;
  }

  async saveFailure(record: Omit<FailureLogRecord, "id" | "createdAt" | "module">): Promise<FailureLogRecord> {
    const saved = failureLogRecordSchema.parse({
      ...record,
      id: newId("fail"),
      module: "nexi",
      createdAt: new Date().toISOString()
    });
    await this.db.collection("failureLog").doc(saved.id).set(firestoreDoc(saved));
    return saved;
  }

  async saveSiteJobBlueprint(record: SiteJobBlueprint): Promise<SiteJobBlueprint> {
    const saved = siteJobBlueprintSchema.parse(record) as SiteJobBlueprint;
    await this.db.collection("siteJobBlueprints").doc(saved.id).set(firestoreDoc(saved));
    return saved;
  }
}
