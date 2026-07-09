import type { Firestore } from "firebase-admin/firestore";
import { selfRepairLogSchema, type SelfRepairLog } from "./schemas.js";

function firestoreDoc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function docId(tenantId: string, date: string): string {
  return `${tenantId}_${date}`;
}

export interface SelfRepairRepository {
  saveLog(log: SelfRepairLog): Promise<SelfRepairLog>;
  getLog(tenantId: string, date: string): Promise<SelfRepairLog | null>;
  listRecentLogs(tenantId: string, limit: number): Promise<SelfRepairLog[]>;
}

export class InMemorySelfRepairRepository implements SelfRepairRepository {
  readonly logs = new Map<string, SelfRepairLog>();

  async saveLog(log: SelfRepairLog): Promise<SelfRepairLog> {
    const parsed = selfRepairLogSchema.parse(log);
    this.logs.set(parsed.id, parsed);
    return parsed;
  }

  async getLog(tenantId: string, date: string): Promise<SelfRepairLog | null> {
    return this.logs.get(docId(tenantId, date)) ?? null;
  }

  async listRecentLogs(tenantId: string, limit: number): Promise<SelfRepairLog[]> {
    return [...this.logs.values()]
      .filter((log) => log.tenantId === tenantId)
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, limit);
  }
}

export class FirestoreSelfRepairRepository implements SelfRepairRepository {
  constructor(private readonly db: Firestore) {}

  async saveLog(log: SelfRepairLog): Promise<SelfRepairLog> {
    const parsed = selfRepairLogSchema.parse(log);
    await this.db.collection("selfRepairLog").doc(parsed.id).set(firestoreDoc(parsed), { merge: true });
    return parsed;
  }

  async getLog(tenantId: string, date: string): Promise<SelfRepairLog | null> {
    const doc = await this.db.collection("selfRepairLog").doc(docId(tenantId, date)).get();
    return doc.exists ? selfRepairLogSchema.parse(doc.data()) : null;
  }

  async listRecentLogs(tenantId: string, limit: number): Promise<SelfRepairLog[]> {
    const snapshot = await this.db.collection("selfRepairLog").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => selfRepairLogSchema.parse(doc.data()))
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, limit);
  }
}
