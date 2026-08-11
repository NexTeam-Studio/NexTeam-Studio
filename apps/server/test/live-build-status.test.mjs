import assert from "node:assert/strict";
import test from "node:test";
import { readLiveBuildStatus } from "../dist/platform/liveBuildStatus.js";

const sha = "a".repeat(40);
const now = Date.parse("2026-08-11T12:00:00.000Z");

function store({ state = null, run = null, events = [] } = {}) {
  return {
    async readState() { return state; },
    async readRun() { return run; },
    async listEvents() { return events; }
  };
}

test("live build status is IDLE without durable controller state and fails closed for stale state", async () => {
  assert.equal((await readLiveBuildStatus({}, now, store())).controlState, "IDLE");
  const stale = await readLiveBuildStatus({}, now, store({
    state: { state: "RUNNING", runId: "run-stale", lastHeartbeat: "2026-08-11T11:57:00.000Z" },
    run: { state: "RUNNING", runId: "run-stale", pid: 123, lastHeartbeat: "2026-08-11T11:57:00.000Z" }
  }));
  assert.equal(stale.actualState, "IDLE");
});

test("live build status projects a durable run, warns after 30 minutes without progress, and returns ten newest events", async () => {
  const events = Array.from({ length: 12 }, (_, index) => ({ id: `event-${index}`, type: "JOB_PROGRESS", at: new Date(now - index * 1_000).toISOString(), detail: `step ${index}` }));
  const status = await readLiveBuildStatus({ NEXTEAM_DEPLOY_SHA: sha }, now, store({
    state: { currentBuild: "Day 1 live build", currentTask: "Run staging matrix", state: "RUNNING", runId: "run-123", lastHeartbeat: "2026-08-11T11:59:00.000Z", lastProgressAt: "2026-08-11T11:29:00.000Z", progress: "2/4", lastActivity: "Matrix started" },
    run: { currentBuild: "Day 1 live build", currentTask: "Run staging matrix", state: "RUNNING", runId: "run-123", pid: 4242, lastHeartbeat: "2026-08-11T11:59:00.000Z", completedTasks: ["Inspect"], remainingTasks: ["Verify"], blocker: null, deploymentEvidence: { environment: "staging", sourceSha: sha, deploymentSha: sha, liveSha: sha, verifiedAt: "2026-08-11T11:58:00.000Z" } },
    events
  }));
  assert.equal(status.actualState, "ACTIVE");
  assert.equal(status.controlState, "RUNNING");
  assert.equal(status.noProgressWarning, true);
  assert.equal(status.events.length, 10);
  assert.equal(status.deploymentEvidence?.liveSha, sha);
  assert.deepEqual(status.completedTasks, ["Inspect"]);
});

test("deployment evidence is omitted unless it exactly corroborates the live runtime SHA", async () => {
  const status = await readLiveBuildStatus({ NEXTEAM_DEPLOY_SHA: sha }, now, store({
    state: { state: "SUCCEEDED", runId: "run-123" },
    run: { state: "SUCCEEDED", runId: "run-123", deploymentEvidence: { environment: "production", sourceSha: sha, deploymentSha: sha, liveSha: sha, verifiedAt: "2026-08-11T11:58:00.000Z" } }
  }));
  assert.equal(status.controlState, "SUCCEEDED");
  assert.equal(status.deploymentEvidence, null);
});
