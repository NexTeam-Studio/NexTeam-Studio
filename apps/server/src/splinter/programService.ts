import crypto from "node:crypto";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { splinterProgramSchema, type SplinterProgram, type SplinterProgramState } from "@nexteam/core";
import type { SplinterRepository } from "./repository.js";
import type { WorkRegistry, SplinterWorkSelector } from "./workRegistry.js";

export const SPLINTER_PROGRAM_COLLECTION_PATH = "admin/splinter/programs";
const iso = () => new Date().toISOString();
const serial = <T>(value: T): DocumentData => JSON.parse(JSON.stringify(value)) as DocumentData;

export interface SplinterProgramRepository {
  create(input: Omit<SplinterProgram, "createdAt" | "updatedAt" | "audit">): Promise<SplinterProgram>;
  get(id: string): Promise<SplinterProgram | null>;
  update(id: string, change: Partial<SplinterProgram>): Promise<SplinterProgram | null>;
  claimLease(id: string, lease: NonNullable<SplinterProgram["workerLease"]>, now: string): Promise<SplinterProgram | null>;
}

function makeRecord(input: Omit<SplinterProgram, "createdAt" | "updatedAt" | "audit">, now: string) {
  return splinterProgramSchema.parse({ ...input, audit: [{ at: now, kind: "PROGRAM_CREATED", detail: "Splinter accepted the authorized engineering program." }], createdAt: now, updatedAt: now });
}
function updated(record: SplinterProgram, change: Partial<SplinterProgram>, now: string) {
  const audit = change.audit ?? record.audit;
  return splinterProgramSchema.parse({ ...record, ...change, programId: record.programId, createdAt: record.createdAt, audit, updatedAt: now });
}

export class InMemorySplinterProgramRepository implements SplinterProgramRepository {
  private readonly values = new Map<string, SplinterProgram>();
  constructor(private readonly now: () => string = iso) {}
  async create(input: Omit<SplinterProgram, "createdAt" | "updatedAt" | "audit">) { const value = makeRecord(input, this.now()); if (this.values.has(value.programId)) throw new Error("Duplicate Splinter program."); this.values.set(value.programId, value); return value; }
  async get(id: string) { return this.values.get(id) ?? null; }
  async update(id: string, change: Partial<SplinterProgram>) { const value = this.values.get(id); if (!value) return null; const next = updated(value, change, this.now()); this.values.set(id, next); return next; }
  async claimLease(id: string, lease: NonNullable<SplinterProgram["workerLease"]>, now: string) { const value = this.values.get(id); if (!value || (value.workerLease && Date.parse(value.workerLease.expiresAt) > Date.parse(now))) return null; const next = updated(value, { workerLease: lease }, this.now()); this.values.set(id, next); return next; }
}

export class FirestoreSplinterProgramRepository implements SplinterProgramRepository {
  constructor(private readonly db: Firestore, private readonly now: () => string = iso) {}
  private ref(id: string) { return this.db.collection("admin").doc("splinter").collection("programs").doc(id); }
  async create(input: Omit<SplinterProgram, "createdAt" | "updatedAt" | "audit">) { const value = makeRecord(input, this.now()); await this.db.runTransaction(async tx => { const existing = await tx.get(this.ref(value.programId)); if (existing.exists) throw new Error("Duplicate Splinter program."); tx.set(this.ref(value.programId), serial(value)); }); return value; }
  async get(id: string) { const snap = await this.ref(id).get(); return snap.exists ? splinterProgramSchema.parse(snap.data()) : null; }
  async update(id: string, change: Partial<SplinterProgram>) { return this.db.runTransaction(async tx => { const ref = this.ref(id), snap = await tx.get(ref); if (!snap.exists) return null; const next = updated(splinterProgramSchema.parse(snap.data()), change, this.now()); tx.set(ref, serial(next)); return next; }); }
  async claimLease(id: string, lease: NonNullable<SplinterProgram["workerLease"]>, now: string) { return this.db.runTransaction(async tx => { const ref = this.ref(id), snap = await tx.get(ref); if (!snap.exists) return null; const current = splinterProgramSchema.parse(snap.data()); if (current.workerLease && Date.parse(current.workerLease.expiresAt) > Date.parse(now)) return null; const next = updated(current, { workerLease: lease }, this.now()); tx.set(ref, serial(next)); return next; }); }
}

export interface ProgramReconcileResult { program: SplinterProgram; dispatch?: { workItemId: string; jobId: string }; }
export class SplinterProgramService {
  constructor(private readonly programs: SplinterProgramRepository, private readonly work: WorkRegistry, private readonly jobs: SplinterRepository, private readonly selector: SplinterWorkSelector, private readonly now: () => string = iso) {}
  async create(input: { programId?: string; objective: string; workItemIds: string[] }) {
    if (new Set(input.workItemIds).size !== input.workItemIds.length) throw new Error("Splinter program work scope contains duplicates.");
    const records = await this.work.list(); if (input.workItemIds.some(id => !records.some(record => record.workItemId === id))) throw new Error("Splinter program work scope contains an unknown item.");
    return this.programs.create({ programId: input.programId ?? `program-${crypto.randomUUID()}`, objective: input.objective, workItemIds: input.workItemIds, state: "ACTIVE", ownerActionQueue: [], approvals: [], nextAction: "Reconcile the durable work queue." });
  }
  async reconcile(id: string, currentStagingSha: string): Promise<ProgramReconcileResult> {
    const program = await this.require(id); if (["COMPLETE", "SAFETY_STOP", "EXHAUSTED_FAILURE"].includes(program.state)) return { program };
    const items = (await this.work.list()).filter(item => program.workItemIds.includes(item.workItemId));
    const actions = items.filter(item => item.ownerDecisionRequired || item.status === "OWNER_REQUIRED" || item.blockedBy?.classification === "OWNER_REQUIRED").map(item => ({ actionId: `owner-${item.workItemId}`, workItemId: item.workItemId, title: item.title, detail: item.blockedBy?.detail ?? "Owner decision required for this work item.", state: "OPEN" as const, createdAt: item.updatedAt }));
    const active = program.activeJobId ? await this.jobs.get(program.activeJobId) : null;
    if (active && !["SUCCEEDED", "FAILED", "AWAITING_HUMAN"].includes(active.state)) return { program: await this.persistRequired(program, { ownerActionQueue: actions, nextAction: `Worker continues ${program.activeWorkItemId}.` }, "WORKER_ACTIVE") };
    const activeItem = program.activeWorkItemId ? items.find(item => item.workItemId === program.activeWorkItemId) : null;
    if (active && activeItem && activeItem.status !== "COMPLETED" && activeItem.status !== "OBSOLETE") {
      return { program: await this.persistRequired(program, { ownerActionQueue: actions, nextAction: active.state === "SUCCEEDED" ? `Reconcile review, deployment, and browser evidence for ${activeItem.workItemId}.` : `Resolve the scoped result for ${activeItem.workItemId}.` }, "WORK_RESULT_RECONCILIATION_PENDING") };
    }
    if (program.activeJobId) await this.persistRequired(program, { activeJobId: undefined, activeWorkItemId: undefined, workerLease: undefined, ownerActionQueue: actions, nextAction: "Select the next eligible work item." }, "WORK_ITEM_CLEARED");
    const selected = await this.selector.select(currentStagingSha, program.workItemIds);
    if (selected) {
      const next = await this.persistRequired(program, { activeWorkItemId: selected.item.workItemId, activeJobId: selected.job.id, workerLease: undefined, ownerActionQueue: actions, nextAction: `Dispatch ${selected.item.workItemId} to a Donatello worker.` }, "WORK_DISPATCHED");
      return { program: next, dispatch: { workItemId: selected.item.workItemId, jobId: selected.job.id } };
    }
    const unfinished = items.filter(item => item.status !== "COMPLETED" && item.status !== "OBSOLETE");
    const allOwnerBlocked = unfinished.length > 0 && unfinished.every(item => item.ownerDecisionRequired || item.status === "OWNER_REQUIRED" || item.blockedBy?.classification === "OWNER_REQUIRED");
    const allExternalBlocked = unfinished.length > 0 && unfinished.every(item => item.blockedBy?.classification === "EXTERNAL_BLOCKER");
    const state: SplinterProgramState = unfinished.length === 0 ? "COMPLETE" : allOwnerBlocked ? "GLOBAL_OWNER_REQUIRED" : allExternalBlocked ? "GLOBAL_EXTERNAL_BLOCKER" : "ACTIVE";
    return { program: await this.persistRequired(program, { state, ownerActionQueue: actions, ...(state === "ACTIVE" ? {} : { terminalReason: state === "COMPLETE" ? "All program work items are complete." : "All remaining program work is scoped-blocked." }), nextAction: state === "COMPLETE" ? "Program complete." : state === "ACTIVE" ? "Await dependency, approval, review, deployment, or worker progress." : "Await the scoped blocker resolution." }, "PROGRAM_RECONCILED") };
  }
  async claimWorker(id: string, workerId: string, leaseMs = 300000) {
    const program = await this.require(id); if (program.state !== "ACTIVE" || !program.activeWorkItemId) throw new Error("No dispatchable program work is active.");
    const now = this.now(); const claimed = await this.programs.claimLease(program.programId, { workerId, workItemId: program.activeWorkItemId, claimedAt: now, heartbeatAt: now, expiresAt: new Date(Date.parse(now) + leaseMs).toISOString() }, now); if (!claimed) throw new Error("An active worker lease already exists."); return claimed;
  }
  async recoverExpiredLease(id: string, currentStagingSha: string) {
    const program = await this.require(id); if (program.workerLease && Date.parse(program.workerLease.expiresAt) <= Date.parse(this.now())) await this.persistRequired(program, { workerLease: undefined, nextAction: "Reconcile expired worker lease." }, "LEASE_EXPIRED");
    return this.reconcile(id, currentStagingSha);
  }
  async grantApproval(id: string, approvalId: string, scopeFingerprint: string) { const p = await this.require(id); return this.persistRequired(p, { approvals: [...p.approvals.filter(a => a.approvalId !== approvalId), { approvalId, scopeFingerprint, state: "GRANTED", grantedAt: this.now() }] }, "APPROVAL_GRANTED"); }
  private async require(id: string) { const record = await this.programs.get(id); if (!record) throw new Error("Splinter program was not found."); return record; }
  private async persistRequired(record: SplinterProgram, change: Partial<SplinterProgram>, kind: string) { const saved = await this.programs.update(record.programId, { ...change, audit: [...record.audit, { at: this.now(), kind, detail: change.nextAction ?? record.nextAction }].slice(-200) }); if (!saved) throw new Error("Splinter program disappeared during reconciliation."); return saved; }
}
