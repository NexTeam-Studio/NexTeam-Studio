import type { DocumentData, Firestore } from "firebase-admin/firestore";
import {
  splinterJobCreateSchema,
  splinterJobSchema,
  splinterJobUpdateSchema,
  type SplinterJob,
  type SplinterJobCreate,
  type SplinterJobState,
  type SplinterJobUpdate
} from "@nexteam/core";

const SPLINTER_JOB_COLLECTION_PATH = "admin/splinter/splinterJobs";

export { SPLINTER_JOB_COLLECTION_PATH };

export interface SplinterRepository {
  create(job: SplinterJobCreate): Promise<SplinterJob>;
  get(id: string): Promise<SplinterJob | null>;
  listQueued(limit: number): Promise<SplinterJob[]>;
  update(id: string, patch: SplinterJobUpdate): Promise<SplinterJob | null>;
  compareAndSet(id: string, expectedState: SplinterJobState, patch: SplinterJobUpdate): Promise<SplinterJob | null>;
}

export interface SplinterRepositoryOptions {
  now?: () => string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function firestoreDoc<T>(value: T): DocumentData {
  return JSON.parse(JSON.stringify(value)) as DocumentData;
}

function sanitizeErrorMessage(message: string): string {
  const normalized = message.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  const redacted = normalized
    .replace(/\b(Bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\b(api[_-]?key|token|password|secret|credential|authorization|cookie|private[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\b(?:sk|rk|ghp|github_pat)_[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\bAIza[\w-]+\b/g, "[REDACTED]");
  return redacted.slice(0, 500) || "An operational error occurred.";
}

function sanitizeLastError(lastError: SplinterJob["lastError"]): SplinterJob["lastError"] {
  if (!lastError) return null;
  return { message: sanitizeErrorMessage(lastError.message), at: lastError.at };
}

function createRecord(job: SplinterJobCreate, timestamp: string): SplinterJob {
  const parsed = splinterJobCreateSchema.parse(job);
  return splinterJobSchema.parse({
    ...parsed,
    lastError: sanitizeLastError(parsed.lastError),
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

function updateRecord(existing: SplinterJob, patch: SplinterJobUpdate, timestamp: string): SplinterJob {
  const parsed = splinterJobUpdateSchema.parse(patch);
  return splinterJobSchema.parse({
    ...existing,
    ...parsed,
    ...(parsed.lastError === undefined ? {} : { lastError: sanitizeLastError(parsed.lastError) }),
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: timestamp
  });
}

export class InMemorySplinterRepository implements SplinterRepository {
  private readonly jobs = new Map<string, SplinterJob>();
  private readonly now: () => string;

  constructor(options: SplinterRepositoryOptions = {}) {
    this.now = options.now ?? nowIso;
  }

  async create(job: SplinterJobCreate): Promise<SplinterJob> {
    const record = createRecord(job, this.now());
    if (this.jobs.has(record.id)) {
      throw new Error(`Splinter job ${record.id} already exists.`);
    }
    this.jobs.set(record.id, record);
    return record;
  }

  async get(id: string): Promise<SplinterJob | null> {
    return this.jobs.get(id) ?? null;
  }

  async listQueued(limit: number): Promise<SplinterJob[]> {
    return [...this.jobs.values()]
      .filter((job) => job.state === "QUEUED")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .slice(0, limit);
  }

  async update(id: string, patch: SplinterJobUpdate): Promise<SplinterJob | null> {
    const existing = this.jobs.get(id);
    if (!existing) return null;
    const record = updateRecord(existing, patch, this.now());
    this.jobs.set(id, record);
    return record;
  }

  async compareAndSet(id: string, expectedState: SplinterJobState, patch: SplinterJobUpdate): Promise<SplinterJob | null> {
    const existing = this.jobs.get(id);
    if (!existing || existing.state !== expectedState) return null;
    const record = updateRecord(existing, patch, this.now());
    this.jobs.set(id, record);
    return record;
  }
}

export class FirestoreSplinterRepository implements SplinterRepository {
  private readonly now: () => string;

  constructor(private readonly db: Firestore, options: SplinterRepositoryOptions = {}) {
    this.now = options.now ?? nowIso;
  }

  async create(job: SplinterJobCreate): Promise<SplinterJob> {
    const record = createRecord(job, this.now());
    const ref = this.jobRef(record.id);
    await this.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists) {
        throw new Error(`Splinter job ${record.id} already exists.`);
      }
      transaction.set(ref, firestoreDoc(record));
    });
    return record;
  }

  async get(id: string): Promise<SplinterJob | null> {
    const snapshot = await this.jobRef(id).get();
    if (!snapshot.exists) return null;
    return splinterJobSchema.parse(snapshot.data());
  }

  async listQueued(limit: number): Promise<SplinterJob[]> {
    const snapshot = await this.db.collection("admin").doc("splinter").collection("splinterJobs")
      .where("state", "==", "QUEUED")
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .limit(limit)
      .get();
    return snapshot.docs.map((document) => splinterJobSchema.parse(document.data()));
  }

  async update(id: string, patch: SplinterJobUpdate): Promise<SplinterJob | null> {
    const ref = this.jobRef(id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const existing = splinterJobSchema.parse(snapshot.data());
      const record = updateRecord(existing, patch, this.now());
      transaction.set(ref, firestoreDoc(record));
      return record;
    });
  }

  async compareAndSet(id: string, expectedState: SplinterJobState, patch: SplinterJobUpdate): Promise<SplinterJob | null> {
    const ref = this.jobRef(id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const existing = splinterJobSchema.parse(snapshot.data());
      if (existing.state !== expectedState) return null;
      const record = updateRecord(existing, patch, this.now());
      transaction.set(ref, firestoreDoc(record));
      return record;
    });
  }

  private jobRef(id: string) {
    const parsedId = splinterJobSchema.shape.id.parse(id);
    return this.db.collection("admin").doc("splinter").collection("splinterJobs").doc(parsedId);
  }
}
