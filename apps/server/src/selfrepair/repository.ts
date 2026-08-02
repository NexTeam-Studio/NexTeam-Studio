import type { Firestore } from "firebase-admin/firestore";
import { selfRepairLogSchema, type SelfRepairLog } from "./schemas.js";
import { assertMemoryTenantOwner, setTenantOwnedDocument } from "../core/tenantOwnedWrite.js";

function firestoreDoc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
    assertMemoryTenantOwner(this.logs.get(parsed.id), parsed.tenantId, `Self-repair log ${parsed.id}`);
    this.logs.set(parsed.id, parsed);
    return parsed;
  }

  async getLog(tenantId: string, date: string): Promise<SelfRepairLog | null> {
    return [...this.logs.values()]
      .filter((log) => log.tenantId === tenantId && log.date === date)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }

  async listRecentLogs(tenantId: string, limit: number): Promise<SelfRepairLog[]> {
    return [...this.logs.values()]
      .filter((log) => log.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }
}

export class FirestoreSelfRepairRepository implements SelfRepairRepository {
  constructor(private readonly db: Firestore) {}

  async saveLog(log: SelfRepairLog): Promise<SelfRepairLog> {
    const parsed = selfRepairLogSchema.parse(log);
    await setTenantOwnedDocument({ db: this.db, collection: "selfRepairLog", id: parsed.id, tenantId: parsed.tenantId, data: firestoreDoc(parsed), label: `Self-repair log ${parsed.id}` });
    return parsed;
  }

  async getLog(tenantId: string, date: string): Promise<SelfRepairLog | null> {
    const snapshot = await this.db.collection("selfRepairLog")
      .where("tenantId", "==", tenantId)
      .where("date", "==", date)
      .get();
    return snapshot.docs
      .map((doc) => selfRepairLogSchema.parse(doc.data()))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }

  async listRecentLogs(tenantId: string, limit: number): Promise<SelfRepairLog[]> {
    const snapshot = await this.db.collection("selfRepairLog").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => selfRepairLogSchema.parse(doc.data()))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }
}
