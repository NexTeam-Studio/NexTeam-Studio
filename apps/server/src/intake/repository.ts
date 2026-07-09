import type { Firestore, DocumentData } from "firebase-admin/firestore";
import { intakeSessionSchema, type IntakeSession } from "./schemas.js";

export interface IntakeRepository {
  save(session: IntakeSession): Promise<IntakeSession>;
  get(tenantId: string, sessionId: string): Promise<IntakeSession | null>;
  listByTenant(tenantId: string): Promise<IntakeSession[]>;
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

export class InMemoryIntakeRepository implements IntakeRepository {
  private readonly sessions = new Map<string, IntakeSession>();

  async save(session: IntakeSession): Promise<IntakeSession> {
    const parsed = intakeSessionSchema.parse(session) as IntakeSession;
    this.sessions.set(parsed.id, parsed);
    return parsed;
  }

  async get(tenantId: string, sessionId: string): Promise<IntakeSession | null> {
    const session = this.sessions.get(sessionId);
    return session && session.tenantId === tenantId ? session : null;
  }

  async listByTenant(tenantId: string): Promise<IntakeSession[]> {
    return [...this.sessions.values()]
      .filter((session) => session.tenantId === tenantId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
}

export class FirestoreIntakeRepository implements IntakeRepository {
  constructor(private readonly db: Firestore) {}

  async save(session: IntakeSession): Promise<IntakeSession> {
    const parsed = intakeSessionSchema.parse(session) as IntakeSession;
    // @tenant-doc:intakeSessions intakeSessionSchema requires tenantId before write.
    await this.db.collection("intakeSessions").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async get(tenantId: string, sessionId: string): Promise<IntakeSession | null> {
    const doc = await this.db.collection("intakeSessions").doc(sessionId).get();
    if (!doc.exists) {
      return null;
    }
    const parsed = intakeSessionSchema.parse(doc.data()) as IntakeSession;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async listByTenant(tenantId: string): Promise<IntakeSession[]> {
    const snapshot = await this.db.collection("intakeSessions").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => intakeSessionSchema.parse(doc.data()) as IntakeSession)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
}
