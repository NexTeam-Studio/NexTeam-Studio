import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export const JOB_STATES = ["QUEUED", "DISPATCHED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"];
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);
const TRANSITIONS = {
  QUEUED: new Set(["DISPATCHED", "CANCELLED"]),
  DISPATCHED: new Set(["RUNNING", "QUEUED", "FAILED", "CANCELLED"]),
  RUNNING: new Set(["SUCCEEDED", "FAILED", "QUEUED", "CANCELLED"]),
  SUCCEEDED: new Set(), FAILED: new Set(), CANCELLED: new Set()
};

export function identityPurposeRegistry() {
  return Object.freeze({
    "global-control-dispatcher": { purpose: "dispatch queued control jobs", environments: ["staging"], interactive: false },
    "github-actions-staging": { purpose: "deploy verified source to staging", environments: ["staging"], interactive: false },
    "staging-regression-harness": { purpose: "read-only browser and mobile auth regression", environments: ["staging"], interactive: false },
    "environment-bootstrap": { purpose: "idempotently verify environment prerequisites", environments: ["local", "staging"], interactive: false }
  });
}

export function assertIdentityPurpose({ identity, purpose, environment }) {
  const entry = identityPurposeRegistry()[identity];
  if (!entry || entry.purpose !== purpose || !entry.environments.includes(environment)) {
    throw new Error("Identity is not authorized for this purpose and environment.");
  }
  return entry;
}

function parse(lines) {
  const events = [];
  for (const line of lines.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object" && typeof value.type === "string" && typeof value.jobId === "string") events.push(value);
    } catch { /* torn/corrupt JSONL line is ignored; reconciliation records the correction */ }
  }
  return events;
}

export async function readJournal(file) {
  try { return parse(await readFile(file, "utf8")); } catch (error) { if (error?.code === "ENOENT") return []; throw error; }
}

export async function appendEvent(file, event) {
  if (!event || typeof event.jobId !== "string" || !event.jobId.trim() || typeof event.type !== "string") throw new Error("A JSONL event needs jobId and type.");
  await mkdir(dirname(file), { recursive: true });
  const durable = { ...event, at: event.at ?? new Date().toISOString() };
  await appendFile(file, `${JSON.stringify(durable)}\n`, "utf8");
  return durable;
}

export function projectJobs(events, now = Date.now(), leaseMs = 60_000) {
  const jobs = new Map();
  for (const event of events) {
    if (event.type === "JOB_QUEUED") {
      const existing = jobs.get(event.jobId);
      if (!existing) {
        jobs.set(event.jobId, {
          id: event.jobId,
          state: "QUEUED",
          payload: event.payload ?? null,
          continuationOf: typeof event.continuationOf === "string" && event.continuationOf.trim() ? event.continuationOf : null,
          attempts: 0,
          resumes: 0,
          events: [event]
        });
      } else if (existing.state === "FAILED") {
        // A failed control job is incomplete, not a permanently blocked duplicate.
        // Re-queue the same ID so a bridge retry can resume it without manual repair.
        existing.state = "QUEUED";
        existing.payload = event.payload ?? existing.payload;
        existing.resumes += 1;
        existing.events.push(event);
      }
      continue;
    }
    const job = jobs.get(event.jobId);
    if (!job) continue;
    if (event.type === "JOB_TRANSITION" && JOB_STATES.includes(event.to) && TRANSITIONS[job.state].has(event.to)) {
      job.state = event.to; job.attempts += event.to === "DISPATCHED" ? 1 : 0; job.leaseUntil = event.leaseUntil ?? null; job.events.push(event);
    }
  }
  for (const job of jobs.values()) {
    if (["DISPATCHED", "RUNNING"].includes(job.state) && (!job.leaseUntil || Date.parse(job.leaseUntil) <= now)) job.state = "QUEUED";
  }
  return [...jobs.values()];
}

export async function reconcileJournal({ file, now = Date.now(), leaseMs = 60_000 }) {
  const jobs = projectJobs(await readJournal(file), now, leaseMs);
  const corrected = jobs.filter((job) => job.state === "QUEUED" && job.events.at(-1)?.type === "JOB_TRANSITION");
  for (const job of corrected) await appendEvent(file, { type: "JOB_TRANSITION", jobId: job.id, to: "QUEUED", reason: "lease_expired_reconciliation" });
  return { jobs, requeued: corrected.map((job) => job.id) };
}

export async function dispatchNext({ file, dispatch, now = Date.now(), leaseMs = 60_000 }) {
  const { jobs } = await reconcileJournal({ file, now, leaseMs });
  const job = jobs.find((item) => item.state === "QUEUED");
  if (!job) return null;
  const leaseUntil = new Date(now + leaseMs).toISOString();
  await appendEvent(file, { type: "JOB_TRANSITION", jobId: job.id, to: "DISPATCHED", leaseUntil });
  try {
    await dispatch(job);
    await appendEvent(file, { type: "JOB_TRANSITION", jobId: job.id, to: "RUNNING", leaseUntil });
    return { ...job, state: "RUNNING", leaseUntil };
  } catch (error) {
    await appendEvent(file, { type: "JOB_TRANSITION", jobId: job.id, to: "QUEUED", reason: "dispatch_failed" });
    throw error;
  }
}

export async function completeJob({ file, jobId, succeeded, reason }) {
  const jobs = projectJobs(await readJournal(file));
  const job = jobs.find((item) => item.id === jobId);
  if (!job || TERMINAL.has(job.state)) return { changed: false };
  const to = succeeded ? "SUCCEEDED" : "FAILED";
  if (!TRANSITIONS[job.state].has(to)) throw new Error(`Cannot complete ${job.state} job.`);
  await appendEvent(file, { type: "JOB_TRANSITION", jobId, to, reason });
  return { changed: true, state: to };
}

export async function pollStatus({ file, now = Date.now() }) {
  const { jobs, requeued } = await reconcileJournal({ file, now });
  const counts = Object.fromEntries(JOB_STATES.map((state) => [state, jobs.filter((job) => job.state === state).length]));
  return { authoritativeTransport: "jsonl", counts, jobs, requeued };
}
