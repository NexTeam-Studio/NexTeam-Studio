import type { Firestore, DocumentData } from "firebase-admin/firestore";
import { z } from "zod";
import { assertMemoryTenantOwner, setTenantOwnedDocument } from "../core/tenantOwnedWrite.js";

export type PortalSessionScope = "client" | "property";
export type PortalVerificationMethod = "magic_link" | "phone_last4";

export interface PortalSessionRecord {
  id: string;
  tenantId: string;
  clientId: string;
  scope: PortalSessionScope;
  propertyId?: string | undefined;
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
  issuedAt: string;
  lastSentAt?: string | undefined;
  lastVerifiedAt: string;
  lastActivityAt: string;
  verificationMethod: PortalVerificationMethod;
  sourceObjectType?: "quote" | "invoice" | undefined;
  sourceObjectId?: string | undefined;
  target?: string | undefined;
  revokedAt?: string | undefined;
}

const portalSessionSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  scope: z.enum(["client", "property"]),
  propertyId: z.string().min(1).optional(),
  tokenHash: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  issuedAt: z.string().min(1),
  lastSentAt: z.string().min(1).optional(),
  lastVerifiedAt: z.string().min(1),
  lastActivityAt: z.string().min(1),
  verificationMethod: z.enum(["magic_link", "phone_last4"]),
  sourceObjectType: z.enum(["quote", "invoice"]).optional(),
  sourceObjectId: z.string().min(1).optional(),
  target: z.string().min(1).optional(),
  revokedAt: z.string().min(1).optional()
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

export interface PortalHubRepository {
  listPortalSessions(tenantId: string): Promise<PortalSessionRecord[]>;
  getPortalSession(tenantId: string, sessionId: string): Promise<PortalSessionRecord | null>;
  upsertPortalSession(session: PortalSessionRecord): Promise<PortalSessionRecord>;
}

export class InMemoryPortalHubRepository implements PortalHubRepository {
  private readonly sessions = new Map<string, PortalSessionRecord>();

  async listPortalSessions(tenantId: string): Promise<PortalSessionRecord[]> {
    return [...this.sessions.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getPortalSession(tenantId: string, sessionId: string): Promise<PortalSessionRecord | null> {
    const record = this.sessions.get(sessionId);
    return record?.tenantId === tenantId ? record : null;
  }

  async upsertPortalSession(session: PortalSessionRecord): Promise<PortalSessionRecord> {
    const parsed = portalSessionSchema.parse(session) as PortalSessionRecord;
    assertMemoryTenantOwner(this.sessions.get(parsed.id), parsed.tenantId, `Portal session ${parsed.id}`);
    this.sessions.set(parsed.id, parsed);
    return parsed;
  }
}

export class FirestorePortalHubRepository implements PortalHubRepository {
  constructor(private readonly db: Firestore) {}

  async listPortalSessions(tenantId: string): Promise<PortalSessionRecord[]> {
    const snapshot = await this.db.collection("portalSessions").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => portalSessionSchema.safeParse(doc.data()))
      .filter((result): result is { success: true; data: PortalSessionRecord } => result.success)
      .map((result) => result.data)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getPortalSession(tenantId: string, sessionId: string): Promise<PortalSessionRecord | null> {
    const snapshot = await this.db.collection("portalSessions").doc(sessionId).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = portalSessionSchema.safeParse(snapshot.data());
    return parsed.success && parsed.data.tenantId === tenantId ? parsed.data : null;
  }

  async upsertPortalSession(session: PortalSessionRecord): Promise<PortalSessionRecord> {
    const parsed = portalSessionSchema.parse(session) as PortalSessionRecord;
    await setTenantOwnedDocument({ db: this.db, collection: "portalSessions", id: parsed.id, tenantId: parsed.tenantId, data: asDocumentData(parsed), label: `Portal session ${parsed.id}` });
    return parsed;
  }
}
