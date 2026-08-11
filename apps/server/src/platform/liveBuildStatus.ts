import type { Firestore } from "firebase-admin/firestore";
import { getBuildInfo } from "../buildInfo.js";
import { getAdminDb } from "../firebase.js";

export const LIVE_BUILD_STATES = ["IDLE", "QUEUED", "DISPATCHED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
export type LiveBuildControlState = typeof LIVE_BUILD_STATES[number];
export type LiveBuildActualState = "ACTIVE" | "IDLE";

export interface LiveBuildEvent {
  id: string;
  type: string;
  at: string;
  detail: string | null;
}

export interface LiveBuildDeploymentEvidence {
  environment: "staging";
  sourceSha: string;
  deploymentSha: string;
  liveSha: string;
  verifiedAt: string;
}

export interface LiveBuildStatus {
  currentBuild: string | null;
  currentTask: string | null;
  actualState: LiveBuildActualState;
  controlState: LiveBuildControlState;
  runId: string | null;
  pid: number | null;
  lastHeartbeat: string | null;
  progress: string | null;
  completedTasks: string[];
  remainingTasks: string[];
  blocker: string | null;
  lastActivity: string | null;
  noProgressWarning: boolean;
  noProgressSince: string | null;
  events: LiveBuildEvent[];
  deploymentEvidence: LiveBuildDeploymentEvidence | null;
}

interface DurableControlStore {
  readState(): Promise<Record<string, unknown> | null>;
  readRun(runId: string): Promise<Record<string, unknown> | null>;
  listEvents(runId: string, limit: number): Promise<Record<string, unknown>[]>;
}

const maxHeartbeatAgeMs = 2 * 60 * 1000;
const noProgressWarningAgeMs = 30 * 60 * 1000;
const shaPattern = /^[0-9a-f]{7,64}$/i;

function idleStatus(): LiveBuildStatus {
  return { currentBuild: null, currentTask: null, actualState: "IDLE", controlState: "IDLE", runId: null, pid: null, lastHeartbeat: null, progress: null, completedTasks: [], remainingTasks: [], blocker: null, lastActivity: null, noProgressWarning: false, noProgressSince: null, events: [], deploymentEvidence: null };
}

function optionalText(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function textList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : []; }
function timestamp(value: unknown): number { const text = optionalText(value); return text ? Date.parse(text) : Number.NaN; }
function controlState(value: unknown): LiveBuildControlState | null { return typeof value === "string" && (LIVE_BUILD_STATES as readonly string[]).includes(value) ? value as LiveBuildControlState : null; }
function safeEvent(value: Record<string, unknown>): LiveBuildEvent | null {
  const id = optionalText(value.id); const type = optionalText(value.type); const at = optionalText(value.at);
  if (!id || !type || !at || !Number.isFinite(Date.parse(at))) return null;
  return { id, type, at, detail: optionalText(value.detail) };
}

class FirestoreControlStore implements DurableControlStore {
  constructor(private readonly db: Firestore) {}
  async readState(): Promise<Record<string, unknown> | null> {
    const snapshot = await this.db.collection("nexcommandControllerStates").doc("current").get();
    return snapshot.exists ? snapshot.data() as Record<string, unknown> : null;
  }
  async readRun(runId: string): Promise<Record<string, unknown> | null> {
    const snapshot = await this.db.collection("nexcommandControllerRuns").doc(runId).get();
    return snapshot.exists ? snapshot.data() as Record<string, unknown> : null;
  }
  async listEvents(runId: string, limit: number): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db.collection("nexcommandControllerEvents").where("runId", "==", runId).orderBy("at", "desc").limit(limit).get();
    return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  }
}

function deploymentEvidence(value: unknown, runtimeSha: string): LiveBuildDeploymentEvidence | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const environment = optionalText(source.environment)?.toLowerCase();
  const sourceSha = optionalText(source.sourceSha); const deploymentSha = optionalText(source.deploymentSha); const liveSha = optionalText(source.liveSha); const verifiedAt = optionalText(source.verifiedAt);
  if (environment !== "staging" || !sourceSha || !deploymentSha || !liveSha || !verifiedAt || !shaPattern.test(sourceSha) || sourceSha !== deploymentSha || deploymentSha !== liveSha || runtimeSha !== liveSha || !Number.isFinite(Date.parse(verifiedAt))) return null;
  return { environment: "staging", sourceSha, deploymentSha, liveSha, verifiedAt };
}

/**
 * Read-only projection of controller-owned Firestore records. The deployed app
 * has no status-writing route: an authorized external controller owns record
 * creation, while this endpoint only reports durable, corroborated evidence.
 */
export async function readLiveBuildStatus(env: NodeJS.ProcessEnv, now = Date.now(), store: DurableControlStore | null = getAdminDb(env) ? new FirestoreControlStore(getAdminDb(env)!) : null): Promise<LiveBuildStatus> {
  if (!store) return idleStatus();
  try {
    const stateRecord = await store.readState();
    if (!stateRecord) return idleStatus();
    const runId = optionalText(stateRecord.runId); const state = controlState(stateRecord.state);
    if (!runId || !state || state === "IDLE") return idleStatus();
    const run = await store.readRun(runId);
    if (!run || optionalText(run.runId) !== runId || controlState(run.state) !== state) return idleStatus();
    const lastHeartbeat = optionalText(stateRecord.lastHeartbeat) ?? optionalText(run.lastHeartbeat);
    const heartbeatTime = timestamp(lastHeartbeat);
    const active = state === "DISPATCHED" || state === "RUNNING";
    if (active && (!Number.isFinite(heartbeatTime) || heartbeatTime > now || now - heartbeatTime > maxHeartbeatAgeMs)) return idleStatus();
    const lastProgressAt = optionalText(stateRecord.lastProgressAt) ?? optionalText(run.lastProgressAt) ?? lastHeartbeat;
    const progressTime = timestamp(lastProgressAt);
    const noProgressWarning = active && Number.isFinite(progressTime) && now - progressTime >= noProgressWarningAgeMs;
    const events = (await store.listEvents(runId, 10)).map(safeEvent).filter((event): event is LiveBuildEvent => event !== null).slice(0, 10);
    const pid = typeof run.pid === "number" && Number.isSafeInteger(run.pid) && run.pid > 0 ? run.pid : null;
    const runtimeSha = getBuildInfo(env).sha;
    return {
      currentBuild: optionalText(stateRecord.currentBuild) ?? optionalText(run.currentBuild), currentTask: optionalText(stateRecord.currentTask) ?? optionalText(run.currentTask), actualState: active ? "ACTIVE" : "IDLE", controlState: state, runId, pid, lastHeartbeat,
      progress: optionalText(stateRecord.progress) ?? optionalText(run.progress), completedTasks: textList(run.completedTasks), remainingTasks: textList(run.remainingTasks), blocker: optionalText(stateRecord.blocker) ?? optionalText(run.blocker), lastActivity: optionalText(stateRecord.lastActivity) ?? optionalText(run.lastActivity),
      noProgressWarning, noProgressSince: noProgressWarning ? lastProgressAt : null, events, deploymentEvidence: deploymentEvidence(run.deploymentEvidence, runtimeSha)
    };
  } catch { return idleStatus(); }
}
