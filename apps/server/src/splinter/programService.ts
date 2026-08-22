import crypto from "node:crypto";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { splinterProgramSchema, splinterWorkItemSchema, type SplinterProgram, type SplinterProgramState } from "@nexteam/core";
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
  reserveDispatch(id: string, token: string): Promise<SplinterProgram | null>;
  renewLease(id: string, workerId: string, workItemId: string, activeJobId: string, now: string, leaseMs: number): Promise<SplinterProgram | null>;
  consumeApproval(id: string, approvalId: string, fingerprint: string, now: string): Promise<SplinterProgram | null>;
  consumeApprovalAndRelease(id: string, approvalId: string, fingerprint: string, workItemId: string, revision: string, now: string): Promise<SplinterProgram | null>;
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
  async reserveDispatch(id: string, token: string) { const value = this.values.get(id); if (!value || value.state !== "ACTIVE" || value.activeJobId) return null; const next = updated(value, { activeJobId: token, nextAction: "Reserve one durable work dispatch." }, this.now()); this.values.set(id, next); return next; }
  async renewLease(id: string, workerId: string, workItemId: string, activeJobId: string, now: string, leaseMs: number) { const value = this.values.get(id); const lease = value?.workerLease; if (!value || value.state !== "ACTIVE" || value.activeWorkItemId !== workItemId || value.activeJobId !== activeJobId || !lease || lease.workerId !== workerId || Date.parse(lease.expiresAt) < Date.parse(now)) return null; const next = updated(value, { workerLease: { ...lease, heartbeatAt: now, expiresAt: new Date(Date.parse(now) + leaseMs).toISOString() } }, this.now()); this.values.set(id, next); return next; }
  async consumeApproval(id: string, approvalId: string, fingerprint: string, now: string) { const value = this.values.get(id), approval = value?.approvals.find(a => a.approvalId === approvalId); if (!value || !approval || approval.state !== "GRANTED" || approval.scopeFingerprint !== fingerprint) return null; const next = updated(value, { approvals: value.approvals.map(a => a.approvalId === approvalId ? { ...a, state: "CONSUMED", consumedAt: now } : a) }, this.now()); this.values.set(id, next); return next; }
  async consumeApprovalAndRelease(id: string, approvalId: string, fingerprint: string, _workItemId: string, _revision: string, now: string) { return this.consumeApproval(id, approvalId, fingerprint, now); }
}

export class FirestoreSplinterProgramRepository implements SplinterProgramRepository {
  constructor(private readonly db: Firestore, private readonly now: () => string = iso) {}
  private ref(id: string) { return this.db.collection("admin").doc("splinter").collection("programs").doc(id); }
  async create(input: Omit<SplinterProgram, "createdAt" | "updatedAt" | "audit">) { const value = makeRecord(input, this.now()); await this.db.runTransaction(async tx => { const existing = await tx.get(this.ref(value.programId)); if (existing.exists) throw new Error("Duplicate Splinter program."); tx.set(this.ref(value.programId), serial(value)); }); return value; }
  async get(id: string) { const snap = await this.ref(id).get(); return snap.exists ? splinterProgramSchema.parse(snap.data()) : null; }
  async update(id: string, change: Partial<SplinterProgram>) { return this.db.runTransaction(async tx => { const ref = this.ref(id), snap = await tx.get(ref); if (!snap.exists) return null; const next = updated(splinterProgramSchema.parse(snap.data()), change, this.now()); tx.set(ref, serial(next)); return next; }); }
  async claimLease(id: string, lease: NonNullable<SplinterProgram["workerLease"]>, now: string) { return this.db.runTransaction(async tx => { const ref = this.ref(id), snap = await tx.get(ref); if (!snap.exists) return null; const current = splinterProgramSchema.parse(snap.data()); if (current.workerLease && Date.parse(current.workerLease.expiresAt) > Date.parse(now)) return null; const next = updated(current, { workerLease: lease }, this.now()); tx.set(ref, serial(next)); return next; }); }
  async reserveDispatch(id: string, token: string) { return this.db.runTransaction(async tx => { const ref = this.ref(id), snap = await tx.get(ref); if (!snap.exists) return null; const current = splinterProgramSchema.parse(snap.data()); if (current.state !== "ACTIVE" || current.activeJobId) return null; const next = updated(current, { activeJobId: token, nextAction: "Reserve one durable work dispatch." }, this.now()); tx.set(ref, serial(next)); return next; }); }
  async renewLease(id: string, workerId: string, workItemId: string, activeJobId: string, now: string, leaseMs: number) { return this.db.runTransaction(async tx => { const ref = this.ref(id), snap = await tx.get(ref); if (!snap.exists) return null; const current = splinterProgramSchema.parse(snap.data()), lease = current.workerLease; if (current.state !== "ACTIVE" || current.activeWorkItemId !== workItemId || current.activeJobId !== activeJobId || !lease || lease.workerId !== workerId || Date.parse(lease.expiresAt) < Date.parse(now)) return null; const next = updated(current, { workerLease: { ...lease, heartbeatAt: now, expiresAt: new Date(Date.parse(now) + leaseMs).toISOString() } }, this.now()); tx.set(ref, serial(next)); return next; }); }
  async consumeApproval(id: string, approvalId: string, fingerprint: string, now: string) { return this.db.runTransaction(async tx => { const ref = this.ref(id), snap = await tx.get(ref); if (!snap.exists) return null; const current = splinterProgramSchema.parse(snap.data()), approval = current.approvals.find(a => a.approvalId === approvalId); if (!approval || approval.state !== "GRANTED" || approval.scopeFingerprint !== fingerprint) return null; const next = updated(current, { approvals: current.approvals.map(a => a.approvalId === approvalId ? { ...a, state: "CONSUMED", consumedAt: now } : a) }, this.now()); tx.set(ref, serial(next)); return next; }); }
  async consumeApprovalAndRelease(id: string, approvalId: string, fingerprint: string, workItemId: string, revision: string, now: string) { return this.db.runTransaction(async tx => { const ref = this.ref(id), workRef = this.db.collection("admin").doc("splinter").collection("workItems").doc(workItemId), [programSnap, workSnap] = await Promise.all([tx.get(ref), tx.get(workRef)]); if (!programSnap.exists || !workSnap.exists) return null; const current = splinterProgramSchema.parse(programSnap.data()), approval = current.approvals.find(a => a.approvalId === approvalId), work = splinterWorkItemSchema.parse(workSnap.data()); if (!approval || approval.state !== "GRANTED" || approval.scopeFingerprint !== fingerprint || work.requirementRevision !== revision || !current.workItemIds.includes(workItemId)) return null; const next = updated(current, { approvals: current.approvals.map(a => a.approvalId === approvalId ? { ...a, state: "CONSUMED", consumedAt: now } : a) }, this.now()); tx.set(ref, serial(next)); const { blockedBy: _blockedBy, ...released } = work; tx.set(workRef, serial({ ...released, status: "APPROVED", ownerDecisionRequired: false, updatedAt: now })); return next; }); }
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
    if (program.activeJobId?.startsWith("dispatch-")) {
      if (Date.parse(program.updatedAt) + 300000 > Date.parse(this.now())) return { program };
      const claimed = items.filter(item => item.status === "CLAIMED" && item.activeSplinterJobId);
      const recoverable = (await Promise.all(claimed.map(async item => ({ item, job: item.activeSplinterJobId ? await this.jobs.get(item.activeSplinterJobId) : null })))).filter(candidate => candidate.job?.workItemContext?.workItemId === candidate.item.workItemId && candidate.job.workItemContext.programId === program.programId);
      if (recoverable.length === 1) {
        const recovered = recoverable[0]!;
        await this.persistRequired(program, { activeWorkItemId: recovered.item.workItemId, activeJobId: recovered.item.activeSplinterJobId, nextAction: `Recover claimed work ${recovered.item.workItemId} after dispatch interruption.` }, "DISPATCH_CLAIM_RECOVERED");
        return this.reconcile(id, currentStagingSha);
      }
      await this.persistRequired(program, { activeJobId: undefined, activeWorkItemId: undefined, nextAction: "Recover an expired dispatch reservation." }, "DISPATCH_RESERVATION_EXPIRED");
      return this.reconcile(id, currentStagingSha);
    }
    const active = program.activeJobId ? await this.jobs.get(program.activeJobId) : null;
    if (active && !["SUCCEEDED", "FAILED", "AWAITING_HUMAN"].includes(active.state)) return { program: await this.persistRequired(program, { ownerActionQueue: actions, nextAction: `Worker continues ${program.activeWorkItemId}.` }, "WORKER_ACTIVE") };
    const activeItem = program.activeWorkItemId ? items.find(item => item.workItemId === program.activeWorkItemId) : null;
    if (active && activeItem && activeItem.status !== "COMPLETED" && activeItem.status !== "OBSOLETE") {
      return { program: await this.persistRequired(program, { ownerActionQueue: actions, nextAction: active.state === "SUCCEEDED" ? `Reconcile review, deployment, and browser evidence for ${activeItem.workItemId}.` : `Resolve the scoped result for ${activeItem.workItemId}.` }, "WORK_RESULT_RECONCILIATION_PENDING") };
    }
    if (program.activeJobId) await this.persistRequired(program, { activeJobId: undefined, activeWorkItemId: undefined, workerLease: undefined, ownerActionQueue: actions, nextAction: "Select the next eligible work item." }, "WORK_ITEM_CLEARED");
    const reserved = await this.programs.reserveDispatch(program.programId, `dispatch-${crypto.randomUUID()}`);
    if (!reserved) return { program: await this.require(program.programId) };
    let selected: Awaited<ReturnType<SplinterWorkSelector["select"]>>;
    try { selected = await this.selector.select(currentStagingSha, program.workItemIds, program.programId); }
    catch (error) { await this.persistRequired(reserved, { activeJobId: undefined, activeWorkItemId: undefined, nextAction: "Release failed dispatch reservation." }, "DISPATCH_RESERVATION_RELEASED"); throw error; }
    if (selected) {
      const next = await this.persistRequired(reserved, { activeWorkItemId: selected.item.workItemId, activeJobId: selected.job.id, workerLease: undefined, ownerActionQueue: actions, nextAction: `Dispatch ${selected.item.workItemId} to a Donatello worker.` }, "WORK_DISPATCHED");
      return { program: next, dispatch: { workItemId: selected.item.workItemId, jobId: selected.job.id } };
    }
    await this.persistRequired(reserved, { activeJobId: undefined, activeWorkItemId: undefined, workerLease: undefined, ownerActionQueue: actions, nextAction: "No work dispatch was selected." }, "DISPATCH_RELEASED");
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
  async heartbeatWorker(id: string, workerId: string, leaseMs = 300000) { const p = await this.require(id); if (!p.activeWorkItemId || !p.activeJobId || p.activeJobId.startsWith("dispatch-")) throw new Error("Worker lease no longer owns active work."); const now = this.now(); const renewed = await this.programs.renewLease(id, workerId, p.activeWorkItemId, p.activeJobId, now, leaseMs); if (!renewed) throw new Error("Worker lease was lost."); return renewed; }
  async grantApproval(id: string, approvalId: string, scopeFingerprint: string) { const p = await this.require(id); if (p.approvals.some(approval => approval.approvalId === approvalId)) throw new Error("Approval IDs are immutable and cannot be regranted."); const item = await this.approvalWork(p, scopeFingerprint); return this.persistRequired(p, { approvals: [...p.approvals, { approvalId, scopeFingerprint, state: "GRANTED", grantedAt: this.now() }], ownerActionQueue: [...p.ownerActionQueue, { actionId: `owner-${item.workItemId}`, workItemId: item.workItemId, title: item.title, detail: "A durable owner approval is ready for this requirement revision.", state: "OPEN", createdAt: this.now() }] }, "APPROVAL_GRANTED"); }
  async consumeApproval(id: string, approvalId: string, scopeFingerprint: string) { const p = await this.require(id); const item = await this.approvalWork(p, scopeFingerprint); const consumed = await this.programs.consumeApprovalAndRelease(id, approvalId, scopeFingerprint, item.workItemId, item.requirementRevision, this.now()); if (!consumed) throw new Error("Approval is unavailable or already consumed."); if (!(this.programs instanceof FirestoreSplinterProgramRepository)) { const released = await this.work.update(item.workItemId, { status: "APPROVED", ownerDecisionRequired: false, blockedBy: undefined }); if (!released) throw new Error("Approved work item disappeared."); } return this.persistRequired(consumed, { ownerActionQueue: consumed.ownerActionQueue.map(action => action.workItemId === item.workItemId ? { ...action, state: "RESOLVED", resolvedAt: this.now() } : action), nextAction: `Reconcile approved work ${item.workItemId}.` }, "APPROVAL_CONSUMED"); }
  private async approvalWork(program: SplinterProgram, scopeFingerprint: string) { const [workItemId, revision] = scopeFingerprint.split("@"); const item = (await this.work.list()).find(candidate => candidate.workItemId === workItemId && candidate.requirementRevision === revision && program.workItemIds.includes(candidate.workItemId)); if (!item) throw new Error("Approval scope does not match a program work item."); return item; }
  private async require(id: string) { const record = await this.programs.get(id); if (!record) throw new Error("Splinter program was not found."); return record; }
  private async persistRequired(record: SplinterProgram, change: Partial<SplinterProgram>, kind: string) { const saved = await this.programs.update(record.programId, { ...change, audit: [...record.audit, { at: this.now(), kind, detail: change.nextAction ?? record.nextAction }].slice(-200) }); if (!saved) throw new Error("Splinter program disappeared during reconciliation."); return saved; }
}
