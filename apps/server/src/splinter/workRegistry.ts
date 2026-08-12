import crypto from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { splinterWorkItemSchema, type SplinterJob, type SplinterWorkItem } from "@nexteam/core";
import type { SplinterRepository } from "./repository.js";

export const SPLINTER_WORK_ITEM_COLLECTION_PATH = "admin/splinter/workItems";
const iso = () => new Date().toISOString();

export interface WorkRegistry { create(item: Omit<SplinterWorkItem, "createdAt" | "updatedAt" | "status">): Promise<SplinterWorkItem>; get(id: string): Promise<SplinterWorkItem | null>; list(): Promise<SplinterWorkItem[]>; update(id: string, patch: Partial<SplinterWorkItem>): Promise<SplinterWorkItem | null>; claim(id: string, jobId: string, stagingSha: string): Promise<SplinterWorkItem | null>; }
function normalize(input: unknown) { return splinterWorkItemSchema.parse(input); }

export class InMemoryWorkRegistry implements WorkRegistry {
  private readonly records = new Map<string, SplinterWorkItem>();
  async create(item: Omit<SplinterWorkItem, "createdAt" | "updatedAt" | "status">) { const now = iso(), record = normalize({ ...item, status: "DRAFT", createdAt: now, updatedAt: now }); if (this.records.has(record.workItemId)) throw new Error("Duplicate work item."); this.records.set(record.workItemId, record); return record; }
  async get(id: string) { return this.records.get(id) ?? null; }
  async list() { return [...this.records.values()]; }
  async update(id: string, patch: Partial<SplinterWorkItem>) { const current = this.records.get(id); if (!current) return null; const next = normalize({ ...current, ...patch, workItemId: current.workItemId, createdAt: current.createdAt, updatedAt: iso() }); this.records.set(id, next); return next; }
  async claim(id: string, jobId: string, stagingSha: string) { const current = this.records.get(id); if (!current || current.status !== "APPROVED" || current.activeSplinterJobId) return null; return this.update(id, { status: "CLAIMED", activeSplinterJobId: jobId, selectedStagingBaseSha: stagingSha }); }
}

export class FirestoreWorkRegistry implements WorkRegistry {
  constructor(private readonly db: Firestore) {}
  private ref(id: string) { return this.db.collection("admin").doc("splinter").collection("workItems").doc(id); }
  async create(item: Omit<SplinterWorkItem, "createdAt" | "updatedAt" | "status">) { const now = iso(), record = normalize({ ...item, status: "DRAFT", createdAt: now, updatedAt: now }); await this.db.runTransaction(async tx => { const snapshot = await tx.get(this.ref(record.workItemId)); if (snapshot.exists) throw new Error("Duplicate work item."); tx.set(this.ref(record.workItemId), JSON.parse(JSON.stringify(record))); }); return record; }
  async get(id: string) { const snapshot = await this.ref(id).get(); return snapshot.exists ? normalize(snapshot.data()) : null; }
  async list() { const snapshot = await this.db.collection("admin").doc("splinter").collection("workItems").get(); return snapshot.docs.map(doc => normalize(doc.data())); }
  async update(id: string, patch: Partial<SplinterWorkItem>) { return this.db.runTransaction(async tx => { const ref = this.ref(id), snapshot = await tx.get(ref); if (!snapshot.exists) return null; const current = normalize(snapshot.data()), next = normalize({ ...current, ...patch, workItemId: current.workItemId, createdAt: current.createdAt, updatedAt: iso() }); tx.set(ref, JSON.parse(JSON.stringify(next))); return next; }); }
  async claim(id: string, jobId: string, stagingSha: string) { return this.db.runTransaction(async tx => { const ref = this.ref(id), snapshot = await tx.get(ref); if (!snapshot.exists) return null; const current = normalize(snapshot.data()); if (current.status !== "APPROVED" || current.activeSplinterJobId) return null; const next = normalize({ ...current, status: "CLAIMED", activeSplinterJobId: jobId, selectedStagingBaseSha: stagingSha, updatedAt: iso() }); tx.set(ref, JSON.parse(JSON.stringify(next))); return next; }); }
}

function dependenciesComplete(item: SplinterWorkItem, all: Map<string, SplinterWorkItem>) { return item.dependencies.every(id => { const dependency = all.get(id); return dependency?.status === "COMPLETED" && dependency.completedEvidenceRefs.length > 0; }); }
function eligible(item: SplinterWorkItem, all: Map<string, SplinterWorkItem>) { return item.status === "APPROVED" && !item.activeSplinterJobId && !item.blockedBy && !item.ownerDecisionRequired && item.sourceRequirementRefs.length > 0 && item.acceptanceCriteria.length > 0 && (item.requiredChecks.length > 0 || item.pathDiscoveryPolicy === "APPROVED_DISCOVERY") && dependenciesComplete(item, all); }
function rank(left: SplinterWorkItem, right: SplinterWorkItem) { return left.priority - right.priority || Number(right.launchCritical) - Number(left.launchCritical) || left.createdAt.localeCompare(right.createdAt) || left.workItemId.localeCompare(right.workItemId); }
export function validateDependencyGraph(items: SplinterWorkItem[]): void { const byId = new Map(items.map(item => [item.workItemId, item])); const visiting = new Set<string>(), complete = new Set<string>(); const visit = (id: string) => { if (complete.has(id)) return; if (visiting.has(id)) throw new Error("Circular Splinter work dependency."); const item = byId.get(id); if (!item) throw new Error("Missing Splinter work dependency."); visiting.add(id); item.dependencies.forEach(visit); visiting.delete(id); complete.add(id); }; items.forEach(item => visit(item.workItemId)); }

export class SplinterWorkSelector {
  constructor(private readonly work: WorkRegistry, private readonly jobs: SplinterRepository) {}
  async approve(id: string) { const all = await this.work.list(); validateDependencyGraph(all); const item = await this.work.get(id); if (!item || item.status !== "DRAFT") throw new Error("Only draft work items can be approved."); return this.work.update(id, { status: "APPROVED" }); }
  async select(currentStagingSha: string): Promise<{ item: SplinterWorkItem; job: SplinterJob } | null> { const items = await this.work.list(); validateDependencyGraph(items); const all = new Map(items.map(item => [item.workItemId, item])); const candidate = items.filter(item => eligible(item, all)).sort(rank)[0]; if (!candidate) return null; const jobId = `splinter-work-${crypto.randomUUID()}`; const claimed = await this.work.claim(candidate.workItemId, jobId, currentStagingSha); if (!claimed) return null; const job = await this.jobs.create({ id: jobId, goal: claimed.goal, executionMode: "READ_ONLY", allowedPaths: claimed.allowedPaths, acceptanceCriteria: claimed.acceptanceCriteria, requiredChecks: claimed.requiredChecks, attemptCount: 0, maxAttempts: 1, lastCheckFailures: [], nonPromotable: claimed.nonPromotable, reviewRequired: false, reviewStatus: "NOT_REQUIRED", workerHistory: [], integration: { status: "NOT_REQUESTED", verification: [] }, deployment: { status: "NOT_REQUESTED", verification: [] }, reviewCycleCount: 0, maxReviewCycles: 3, reviewHistory: [], state: "QUEUED", next: { owner: "splinter", action: `Execute approved work item ${claimed.workItemId} (${claimed.requirementRevision}).` }, result: "PENDING", lastError: null }); return { item: claimed, job }; }
  async reconcile(id: string, evidenceRefs: string[]) { const item = await this.work.get(id); if (!item || item.status !== "CLAIMED" || !item.activeSplinterJobId || evidenceRefs.length === 0) throw new Error("Work completion evidence is insufficient."); const job = await this.jobs.get(item.activeSplinterJobId); if (!job || job.state !== "SUCCEEDED" || job.result !== "PASS") throw new Error("Linked Splinter job is not complete."); return this.work.update(id, { status: "COMPLETED", completedEvidenceRefs: evidenceRefs, activeSplinterJobId: undefined }); }
}
