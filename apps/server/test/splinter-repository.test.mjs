import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { splinterJobSchema } from "@nexteam/core";
import {
  FirestoreSplinterRepository,
  InMemorySplinterRepository,
  SPLINTER_JOB_COLLECTION_PATH
} from "../src/splinter/repository.ts";
import { SplinterJobService } from "../src/splinter/service.ts";
import { InMemoryWorkRegistry, SPLINTER_WORK_ITEM_COLLECTION_PATH, SplinterWorkSelector, validateDependencyGraph } from "../src/splinter/workRegistry.ts";
import { registerSplinterRelayRoutes } from "../src/splinter/routes.ts";
import express from "express";

const timestamps = ["2026-08-11T12:00:00.000Z", "2026-08-11T12:05:00.000Z"];

function sequentialClock() {
  let index = 0;
  return () => timestamps[Math.min(index++, timestamps.length - 1)];
}

function validJob(overrides = {}) {
  return {
    id: "splinter-job-1",
    goal: "Persist the first Splinter job record.",
    state: "QUEUED",
    next: { owner: "splinter", action: "Store durable job record" },
    result: "PENDING",
    lastError: null,
    ...overrides
  };
}

class FakeFirestore {
  records = new Map();
  paths = [];

  collection(name) {
    return new FakeCollection(this, name);
  }

  async runTransaction(callback) {
    return callback({
      get: async (ref) => ref.get(),
      set: (ref, value) => this.records.set(ref.path, structuredClone(value))
    });
  }
}

class FakeCollection {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }

  doc(id) {
    return new FakeDocument(this.db, `${this.path}/${id}`);
  }
}

class FakeDocument {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    db.paths.push(path);
  }

  collection(name) {
    return new FakeCollection(this.db, `${this.path}/${name}`);
  }

  async get() {
    const value = this.db.records.get(this.path);
    return {
      exists: value !== undefined,
      data: () => structuredClone(value)
    };
  }
}

test("Splinter durable job records create, retrieve, and update with server timestamps", async () => {
  const repository = new InMemorySplinterRepository({ now: sequentialClock() });
  const created = await repository.create(validJob());
  const fetched = await repository.get(created.id);
  const updated = await repository.update(created.id, {
    state: "RUNNING",
    next: { owner: "worker", action: "Run focused repository tests" }
  });

  assert.deepEqual(fetched, created);
  assert.equal(created.createdAt, timestamps[0]);
  assert.equal(created.updatedAt, timestamps[0]);
  assert.equal(updated.createdAt, timestamps[0]);
  assert.equal(updated.updatedAt, timestamps[1]);
  assert.equal(updated.state, "RUNNING");
  assert.equal(updated.next.owner, "worker");
});

test("Splinter schema rejects invalid durable records", () => {
  assert.throws(
    () => splinterJobSchema.parse({ ...validJob(), state: "DISPATCHING", createdAt: "now", updatedAt: "now" }),
    z.ZodError
  );
});

test("Splinter repository returns null for unknown job IDs", async () => {
  const repository = new InMemorySplinterRepository();
  assert.equal(await repository.get("missing-splinter-job"), null);
  assert.equal(await repository.update("missing-splinter-job", { state: "FAILED" }), null);
});

test("Splinter records are platform-only and sanitize error metadata", async () => {
  const db = new FakeFirestore();
  const repository = new FirestoreSplinterRepository(db, { now: sequentialClock() });
  const created = await repository.create(validJob({
    lastError: {
      message: "deployment failed: api_key=super-secret-value Bearer token-value",
      at: timestamps[0]
    }
  }));

  assert.equal(SPLINTER_JOB_COLLECTION_PATH, "admin/splinter/splinterJobs");
  assert.equal(db.paths.at(-1), "admin/splinter/splinterJobs/splinter-job-1");
  assert.equal("tenantId" in created, false);
  assert.match(created.lastError.message, /api_key=\[REDACTED\]/);
  assert.match(created.lastError.message, /Bearer \[REDACTED\]/);
  assert.doesNotMatch(created.lastError.message, /super-secret-value|token-value/);
});

async function queuedService() {
  const repository = new InMemorySplinterRepository({ now: sequentialClock() });
  const job = await repository.create(validJob());
  return { job, repository, service: new SplinterJobService(repository, { now: () => timestamps[1] }) };
}

test("QUEUED -> RUNNING succeeds", async () => {
  const { job, service } = await queuedService();
  const updated = await service.transition(job.id, "RUNNING");
  assert.equal(updated.state, "RUNNING");
  assert.equal(updated.result, "PENDING");
  assert.equal(updated.next.owner, "worker");
});

test("RUNNING -> SUCCEEDED succeeds and produces PASS", async () => {
  const { job, service } = await queuedService();
  await service.transition(job.id, "RUNNING");
  const updated = await service.transition(job.id, "SUCCEEDED");
  assert.equal(updated.state, "SUCCEEDED");
  assert.equal(updated.result, "PASS");
  assert.equal(updated.next.action, "No further action required.");
});

test("RUNNING -> FAILED succeeds and produces sanitized FAIL", async () => {
  const { job, service } = await queuedService();
  await service.transition(job.id, "RUNNING");
  const updated = await service.transition(job.id, "FAILED", { errorMessage: "token=not-for-storage" });
  assert.equal(updated.state, "FAILED");
  assert.equal(updated.result, "FAIL");
  assert.equal(updated.lastError.message, "token=[REDACTED]");
});

test("RUNNING -> AWAITING_HUMAN assigns human ownership", async () => {
  const { job, service } = await queuedService();
  await service.transition(job.id, "RUNNING");
  const updated = await service.transition(job.id, "AWAITING_HUMAN");
  assert.equal(updated.next.owner, "human");
  assert.equal(updated.result, "PENDING");
});

test("AWAITING_HUMAN -> RUNNING succeeds", async () => {
  const { job, service } = await queuedService();
  await service.transition(job.id, "RUNNING");
  await service.transition(job.id, "AWAITING_HUMAN");
  assert.equal((await service.transition(job.id, "RUNNING")).state, "RUNNING");
});

test("FAILED -> RUNNING allows a controlled retry", async () => {
  const { job, service } = await queuedService();
  await service.transition(job.id, "RUNNING");
  await service.transition(job.id, "FAILED", { errorMessage: "safe failure" });
  const updated = await service.transition(job.id, "RUNNING", { runningOwner: "splinter" });
  assert.equal(updated.state, "RUNNING");
  assert.equal(updated.next.owner, "splinter");
  assert.equal(updated.lastError, null);
});

test("SUCCEEDED cannot transition anywhere", async () => {
  const { job, service } = await queuedService();
  await service.transition(job.id, "RUNNING");
  await service.transition(job.id, "SUCCEEDED");
  await assert.rejects(() => service.transition(job.id, "RUNNING"), { code: "INVALID_TRANSITION" });
  await assert.rejects(() => service.transition(job.id, "FAILED"), { code: "INVALID_TRANSITION" });
});

test("invalid transitions are rejected without corrupting the stored job", async () => {
  const { job, repository, service } = await queuedService();
  const before = await repository.get(job.id);
  await assert.rejects(() => service.transition(job.id, "SUCCEEDED"), { code: "INVALID_TRANSITION" });
  assert.deepEqual(await repository.get(job.id), before);
});

test("successful transitions preserve createdAt and update updatedAt", async () => {
  const { job, service } = await queuedService();
  const updated = await service.transition(job.id, "RUNNING");
  assert.equal(updated.createdAt, job.createdAt);
  assert.notEqual(updated.updatedAt, job.updatedAt);
});

test("invalid and missing job IDs fail safely", async () => {
  const { service } = await queuedService();
  await assert.rejects(() => service.transition("", "RUNNING"), { code: "INVALID_JOB_ID" });
  await assert.rejects(() => service.transition("missing-job", "RUNNING"), { code: "NOT_FOUND" });
  await assert.rejects(() => service.transition("splinter-job-1", "NOT_A_STATE"), z.ZodError);
});

test("compare-and-set prevents a stale caller from persisting a conflicting transition", async () => {
  const { job, repository, service } = await queuedService();
  await service.transition(job.id, "RUNNING");
  assert.equal(await repository.compareAndSet(job.id, "QUEUED", { state: "FAILED", result: "FAIL" }), null);
  assert.equal((await repository.get(job.id)).state, "RUNNING");
});

test("Splinter relay API rejects unauthenticated and invalid service credentials", async () => {
  const { repository, service } = await queuedService(); const app = express(); app.use(express.json()); registerSplinterRelayRoutes(app, { repository, service, env: { SPLINTER_RELAY_SERVICE_TOKEN: "relay-secret" } });
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/internal/splinter/health`)).status, 401);
    assert.equal((await fetch(`${base}/api/internal/splinter/health`, { headers: { "x-splinter-relay-token": "wrong" } })).status, 401);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs/splinter-job-1`)).status, 401);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs/splinter-job-1`, { headers: { "x-splinter-relay-token": "wrong" } })).status, 401);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal: "unauthorized", nextAction: "reject" }) })).status, 401);
  } finally { server.close(); }
});

test("Splinter relay health returns only the safe controller version payload", async () => {
  const { repository, service } = await queuedService(); const app = express(); app.use(express.json()); registerSplinterRelayRoutes(app, { repository, service, env: { SPLINTER_RELAY_SERVICE_TOKEN: "relay-secret" } });
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/api/internal/splinter/health`, { headers: { "x-splinter-relay-token": "relay-secret" } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ["controllerVersion", "ok"]);
    assert.deepEqual(body, { ok: true, controllerVersion: "splinter-v1" });
  } finally { server.close(); }
});

test("Splinter classifies ordinary failures without creating an owner RFI", async () => {
  const { job, service } = await queuedService(); await service.transition(job.id, "RUNNING");
  const updated = await service.classifyIssue(job.id, { classification: "AUTONOMOUS", detail: "Focused test failed; repair remains authorized." });
  assert.equal(updated.state, "RUNNING"); assert.equal(updated.escalation.classification, "AUTONOMOUS"); assert.equal(updated.rfi, undefined);
});

test("Splinter records an owner RFI and resumes only after an authorized resolution", async () => {
  const { job, service } = await queuedService(); await service.transition(job.id, "RUNNING");
  const rfi = { rfiId: "rfi-owner-choice-1", jobId: job.id, category: "OWNER_REQUIRED", title: "Status vocabulary", decisionNeeded: "Choose a status label.", whyAutomationCannotDecide: "No approved requirement selects either valid term.", knownFacts: ["Both labels are valid."], options: [{ id: "ready", label: "Use ready" }, { id: "available", label: "Use available" }], recommendedOption: "ready", affectedScope: "Test-only Splinter proof", currentSafeState: "No source change has been made.", blocking: true, createdAt: timestamps[1] };
  const paused = await service.classifyIssue(job.id, { classification: "OWNER_REQUIRED", detail: "Product wording is ambiguous.", rfi });
  assert.equal(paused.state, "AWAITING_HUMAN"); assert.equal(paused.next.owner, "human");
  const resumed = await service.resolveOwnerRfi(job.id, { rfiId: rfi.rfiId, resolution: "ready", resolutionScope: "JOB_ONLY" });
  assert.equal(resumed.state, "QUEUED"); assert.equal(resumed.rfi.resolution, "ready"); assert.equal(resumed.rfi.resolutionScope, "JOB_ONLY");
  await assert.rejects(() => service.resolveOwnerRfi(job.id, { rfiId: rfi.rfiId, resolution: "ready", resolutionScope: "JOB_ONLY" }), { code: "INVALID_TRANSITION" });
});

test("Splinter safety stops fail closed and external blockers do not create owner RFIs", async () => {
  const { job, service } = await queuedService(); await service.transition(job.id, "RUNNING");
  const blocked = await service.classifyIssue(job.id, { classification: "EXTERNAL_BLOCKER", detail: "Third-party service is unavailable." });
  assert.equal(blocked.state, "RUNNING"); assert.equal(blocked.rfi, undefined);
  const { job: safetyJob, service: safetyService } = await queuedService(); await safetyService.transition(safetyJob.id, "RUNNING");
  const stopped = await safetyService.classifyIssue(safetyJob.id, { classification: "SAFETY_STOP", detail: "Attempted tenant-boundary bypass." });
  assert.equal(stopped.state, "FAILED"); assert.equal(stopped.result, "FAIL");
});

test("owner RFI resolution requires a distinct owner credential", async () => {
  const { job, repository, service } = await queuedService(); await service.transition(job.id, "RUNNING");
  const rfi = { rfiId: "rfi-auth-1", jobId: job.id, category: "OWNER_REQUIRED", title: "Choice", decisionNeeded: "Choose.", whyAutomationCannotDecide: "Ambiguous.", knownFacts: ["Two valid options."], options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], recommendedOption: "a", affectedScope: "test", currentSafeState: "paused", blocking: true, createdAt: timestamps[1] };
  await service.classifyIssue(job.id, { classification: "OWNER_REQUIRED", detail: "Ambiguous.", rfi });
  const app = express(); app.use(express.json()); registerSplinterRelayRoutes(app, { repository, service, env: { SPLINTER_RELAY_SERVICE_TOKEN: "relay-secret", SPLINTER_OWNER_SERVICE_TOKEN: "owner-secret" } });
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs/${job.id}/rfi/resolve`, { method: "POST", headers: { "content-type": "application/json", "x-splinter-relay-token": "relay-secret" }, body: JSON.stringify({ rfiId: rfi.rfiId, resolution: "a", resolutionScope: "JOB_ONLY" }) })).status, 401);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs/${job.id}/rfi/resolve`, { method: "POST", headers: { "content-type": "application/json", "x-splinter-owner-token": "owner-secret" }, body: JSON.stringify({ rfiId: rfi.rfiId, resolution: "a", resolutionScope: "JOB_ONLY" }) })).status, 200);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

function workItem(overrides = {}) { return { workItemId: "work-a", title: "Read service", goal: "Inspect apps/server/src/splinter/service.ts without modifying files.", module: "splinter", tenantScope: "platform", priority: 2, launchCritical: true, dependencies: [], acceptanceCriteria: ["File is inspected."], requiredChecks: [], allowedPaths: [], pathDiscoveryPolicy: "APPROVED_DISCOVERY", ownerDecisionRequired: false, promotionPolicy: "NONE", sourceRequirementRefs: ["docs/specs/test.md#A"], requirementRevision: "r1", nonPromotable: true, completedEvidenceRefs: [], ...overrides }; }

test("Splinter work registry validates records, dependency cycles, and deterministic blocked-work selection", async () => {
  const work = new InMemoryWorkRegistry(); const jobs = new InMemorySplinterRepository(); const selector = new SplinterWorkSelector(work, jobs);
  await work.create(workItem({ workItemId: "blocked", priority: 1 })); await work.update("blocked", { status: "BLOCKED", blockedBy: { classification: "EXTERNAL_BLOCKER", detail: "provider unavailable" } });
  await work.create(workItem({ workItemId: "work-a", priority: 2 })); await selector.approve("work-a");
  const selected = await selector.select("abcdef1"); assert.equal(selected.item.workItemId, "work-a"); assert.equal(selected.item.status, "CLAIMED"); assert.equal(selected.job.state, "QUEUED"); assert.equal(SPLINTER_WORK_ITEM_COLLECTION_PATH, "admin/splinter/workItems");
  assert.equal(await selector.select("abcdef1"), null);
  const cycleA = { ...workItem({ workItemId: "cycle-a", dependencies: ["cycle-b"] }), status: "DRAFT", createdAt: timestamps[0], updatedAt: timestamps[0] }; const cycleB = { ...workItem({ workItemId: "cycle-b", dependencies: ["cycle-a"] }), status: "DRAFT", createdAt: timestamps[0], updatedAt: timestamps[0] };
  assert.throws(() => validateDependencyGraph([cycleA, cycleB]), /Circular/);
});

test("Splinter work selector requires completed dependency evidence and linked job proof before completion", async () => {
  const work = new InMemoryWorkRegistry(); const jobs = new InMemorySplinterRepository(); const selector = new SplinterWorkSelector(work, jobs);
  await work.create(workItem({ workItemId: "dependency" })); await work.update("dependency", { status: "COMPLETED", completedEvidenceRefs: ["job:done"] });
  await work.create(workItem({ workItemId: "dependent", dependencies: ["dependency"] })); await selector.approve("dependent");
  const next = await selector.select("abcdef1"); assert.equal(next.item.workItemId, "dependent"); await assert.rejects(() => selector.reconcile("dependent", ["claim-only"]), /not complete/);
});

test("Splinter work selector preserves safe READ_ONLY defaults for pre-code-change registry records", async () => {
  const work = new InMemoryWorkRegistry(); const jobs = new InMemorySplinterRepository(); const selector = new SplinterWorkSelector(work, jobs);
  await work.create(workItem({ workItemId: "read-only-legacy", priority: 1 })); await selector.approve("read-only-legacy");
  const selected = await selector.select("abcdef1");
  assert.equal(selected.item.executionMode, "READ_ONLY"); assert.equal(selected.item.maxAttempts, 1);
  assert.equal(selected.job.executionMode, "READ_ONLY"); assert.equal(selected.job.reviewRequired, false); assert.equal(selected.job.maxAttempts, 1);
});

test("Splinter work selector maps approved CODE_CHANGE authority into the existing job contract", async () => {
  const work = new InMemoryWorkRegistry(); const jobs = new InMemorySplinterRepository(); const selector = new SplinterWorkSelector(work, jobs);
  await work.create(workItem({ workItemId: "code-change", priority: 1, executionMode: "CODE_CHANGE", reviewRequired: true, maxAttempts: 3, allowedPaths: ["apps/server/test/splinter-repository.test.mjs"], pathDiscoveryPolicy: "EXPLICIT_PATHS", requiredChecks: ["SPLINTER_FOCUSED_TESTS", "SPLINTER_FOCUSED_TYPECHECK"], promotionPolicy: "NONE", nonPromotable: true }));
  await selector.approve("code-change"); const selected = await selector.select("abcdef1");
  assert.equal(selected.job.executionMode, "CODE_CHANGE"); assert.equal(selected.job.reviewRequired, true); assert.equal(selected.job.maxAttempts, 3);
  assert.deepEqual(selected.job.allowedPaths, ["apps/server/test/splinter-repository.test.mjs"]); assert.equal(selected.job.pathDiscoveryPolicy, "EXPLICIT_PATHS");
  assert.deepEqual(selected.job.workItemContext, { workItemId: "code-change", module: "splinter", tenantScope: "platform", promotionPolicy: "NONE", sourceRequirementRefs: ["docs/specs/test.md#A"], requirementRevision: "r1" });
  await assert.rejects(() => work.create(workItem({ workItemId: "code-no-review", executionMode: "CODE_CHANGE", reviewRequired: false, allowedPaths: ["apps/server/test/splinter-repository.test.mjs"], requiredChecks: ["SPLINTER_FOCUSED_TESTS"], maxAttempts: 3 })), /independent review/);
  await assert.rejects(() => work.create(workItem({ workItemId: "code-no-path", executionMode: "CODE_CHANGE", reviewRequired: true, allowedPaths: [], requiredChecks: ["SPLINTER_FOCUSED_TESTS"], maxAttempts: 3 })), /bounded write envelope/);
  await assert.rejects(() => work.create(workItem({ workItemId: "code-no-check", executionMode: "CODE_CHANGE", reviewRequired: true, allowedPaths: ["apps/server/test/splinter-repository.test.mjs"], requiredChecks: [], maxAttempts: 3 })), /deterministic checks/);
});

test("legacy Atlas worker evidence remains readable while new builder evidence is Donatello", () => {
  const legacy = splinterJobSchema.parse({ ...validJob({ workerResult: { workerRunId: "atlas-legacy-run", status: "SUCCEEDED", summary: "Historical Atlas result.", filesInspected: [], filesChanged: [], testsPerformed: [], startedAt: timestamps[0], completedAt: timestamps[1] } }), createdAt: timestamps[0], updatedAt: timestamps[1] });
  assert.equal(legacy.workerResult.builderDisplayName, "Donatello");
});

test("RUNNING code-change job records only bounded sanitized repair attempts", async () => {
  const { job, repository, service } = await queuedService();
  await repository.update(job.id, { executionMode: "CODE_CHANGE", allowedPaths: ["apps/server/src/splinter/routes.ts"], acceptanceCriteria: ["route"], requiredChecks: ["SPLINTER_FOCUSED_TESTS"], maxAttempts: 3 });
  await service.transition(job.id, "RUNNING");
  const first = await service.beginWorkerAttempt(job.id, ["token=not-for-storage test failed"]);
  const second = await service.beginWorkerAttempt(job.id, ["typecheck failed"]);
  const third = await service.beginWorkerAttempt(job.id, ["test failed again"]);
  assert.equal(first.attemptCount, 1); assert.match(first.lastCheckFailures[0], /\[REDACTED\]/);
  assert.equal(second.attemptCount, 2); assert.equal(third.attemptCount, 3);
  await assert.rejects(() => service.beginWorkerAttempt(job.id), { code: "INVALID_TRANSITION" });
});

test("Splinter relay API creates only normalized queued jobs through authenticated server authority", async () => {
  const { repository, service } = await queuedService(); const app = express(); app.use(express.json()); registerSplinterRelayRoutes(app, { repository, service, env: { SPLINTER_RELAY_SERVICE_TOKEN: "relay-secret" } });
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`; const headers = { "content-type": "application/json", "x-splinter-relay-token": "relay-secret" };
  try {
    const created = await fetch(`${base}/api/internal/splinter/jobs`, { method: "POST", headers, body: JSON.stringify({ id: "splinter-created-1", goal: "Read one safe file.", nextAction: "Dispatch the authorized smoke task." }) });
    const body = await created.json();
    assert.equal(created.status, 201); assert.equal(body.job.state, "QUEUED"); assert.equal(body.job.result, "PENDING"); assert.equal(body.job.next.owner, "splinter"); assert.ok(body.job.createdAt); assert.equal(body.job.createdAt, body.job.updatedAt);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs`, { method: "POST", headers, body: JSON.stringify({ goal: "invalid", nextAction: "reject", state: "SUCCEEDED" }) })).status, 400);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs`, { method: "POST", headers, body: JSON.stringify({ goal: "invalid", nextAction: "reject", result: "PASS" }) })).status, 400);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs`, { method: "POST", headers, body: JSON.stringify({ goal: "invalid" }) })).status, 400);
    assert.equal((await repository.get("splinter-created-1")).state, "QUEUED");
    const codeChange = await fetch(`${base}/api/internal/splinter/jobs`, { method: "POST", headers, body: JSON.stringify({ id: "splinter-code-change", goal: "Add a narrow health route.", nextAction: "Dispatch the controlled code task.", executionMode: "CODE_CHANGE", allowedPaths: ["apps/server/src/splinter/routes.ts"], acceptanceCriteria: ["Route responds safely."], requiredChecks: ["SPLINTER_FOCUSED_TESTS"] }) });
    assert.equal(codeChange.status, 201); assert.equal((await codeChange.json()).job.executionMode, "CODE_CHANGE");
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs`, { method: "POST", headers, body: JSON.stringify({ goal: "invalid code change", nextAction: "reject", executionMode: "CODE_CHANGE", allowedPaths: [], acceptanceCriteria: [], requiredChecks: [] }) })).status, 400);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs`, { method: "POST", headers, body: JSON.stringify({ goal: "invalid path", nextAction: "reject", executionMode: "CODE_CHANGE", allowedPaths: ["../outside.ts"], acceptanceCriteria: ["x"], requiredChecks: ["SPLINTER_FOCUSED_TESTS"] }) })).status, 400);
  } finally { server.close(); }
});

test("Splinter relay API returns only the oldest bounded queued jobs in a sanitized deterministic projection", async () => {
  const repository = new InMemorySplinterRepository({ now: (() => { let index = 0; return () => `2026-08-11T12:0${index++}:00.000Z`; })() });
  const service = new SplinterJobService(repository);
  await repository.create(validJob({ id: "splinter-z", goal: "oldest" }));
  await repository.create(validJob({ id: "splinter-a", goal: "second" }));
  await repository.create(validJob({ id: "splinter-running", goal: "not queued" }));
  await service.transition("splinter-running", "RUNNING");
  const app = express(); app.use(express.json()); registerSplinterRelayRoutes(app, { repository, service, env: { SPLINTER_RELAY_SERVICE_TOKEN: "relay-secret" } });
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`; const headers = { "x-splinter-relay-token": "relay-secret" };
  try {
    const response = await fetch(`${base}/api/internal/splinter/jobs?state=QUEUED`, { headers }); const body = await response.json();
    assert.equal(response.status, 200); assert.deepEqual(body.jobs.map((job) => job.id), ["splinter-z", "splinter-a"]); assert.equal("lastError" in body.jobs[0], false); assert.equal("workerResult" in body.jobs[0], false);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs?state=RUNNING`, { headers })).status, 400);
  } finally { server.close(); }
});

test("Splinter relay API fails queued discovery safely when persistence is temporarily unavailable", async () => {
  const { service } = await queuedService(); const app = express(); app.use(express.json());
  registerSplinterRelayRoutes(app, { repository: { listQueued: async () => { throw new Error("index unavailable"); } }, service, env: { SPLINTER_RELAY_SERVICE_TOKEN: "relay-secret" } });
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  try { assert.equal((await fetch(`${base}/api/internal/splinter/jobs?state=QUEUED`, { headers: { "x-splinter-relay-token": "relay-secret" } })).status, 503); } finally { server.close(); }
});

test("Splinter relay API reads, claims, and records only validated outcomes through the service", async () => {
  const { repository, service } = await queuedService(); const app = express(); app.use(express.json()); registerSplinterRelayRoutes(app, { repository, service, env: { SPLINTER_RELAY_SERVICE_TOKEN: "relay-secret" } });
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`; const headers = { "content-type": "application/json", "x-splinter-relay-token": "relay-secret" };
  try {
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs/splinter-job-1`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs/splinter-job-1/claim`, { method: "POST", headers })).status, 200);
    const outcome = { workerRunId: "run-1", status: "SUCCEEDED", summary: "Read package metadata.", filesInspected: ["package.json"], filesChanged: [], testsPerformed: [], startedAt: timestamps[0], completedAt: timestamps[1] };
    const response = await fetch(`${base}/api/internal/splinter/jobs/splinter-job-1/outcome`, { method: "POST", headers, body: JSON.stringify(outcome) }); const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.job.state, "SUCCEEDED"); assert.equal(body.job.workerResult.workerRunId, "run-1");
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs/missing/claim`, { method: "POST", headers })).status, 409);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs/splinter-job-1/outcome`, { method: "POST", headers, body: JSON.stringify({ ...outcome, rawPrompt: "forbidden" }) })).status, 400);
  } finally { server.close(); }
});

test("Splinter review accepts only matching autonomous commit evidence and preserves rejects", async () => {
  const { job, repository, service } = await queuedService();
  await repository.update(job.id, { executionMode: "CODE_CHANGE", reviewRequired: true, allowedPaths: ["apps/server/src/splinter/routes.ts"], acceptanceCriteria: ["route"], requiredChecks: ["SPLINTER_FOCUSED_TESTS"], maxAttempts: 3 });
  await service.transition(job.id, "RUNNING");
  await service.submitWorkerOutcome(job.id, { workerRunId: "builder", status: "SUCCEEDED", summary: "done", filesInspected: [], filesChanged: ["apps/server/src/splinter/routes.ts"], testsPerformed: ["check"], commitSha: "abcdef1", startedAt: timestamps[0], completedAt: timestamps[1] });
  const review = { reviewResult: "REJECT", summary: "Needs a test.", blockingFindings: ["Missing focused coverage."], nonBlockingFindings: [], reviewedCommitSha: "abcdef1", reviewerRunId: "raphael-1", reviewerProvider: "anthropic", reviewerModel: "claude-sonnet-4-5", startedAt: timestamps[0], completedAt: timestamps[1] };
  const updated = await service.submitReview(job.id, review);
  assert.equal(updated.state, "RUNNING"); assert.equal(updated.result, "PENDING"); assert.equal(updated.reviewStatus, "REJECTED"); assert.equal(updated.review.reviewResult, "REJECT"); assert.deepEqual(updated.review.blockingFindings, ["Missing focused coverage."]);
  await assert.rejects(() => service.submitReview(job.id, { ...review, reviewedCommitSha: "deadbee" }), { code: "INVALID_TRANSITION" });
});

test("Splinter bounds Raphael review cycles at three while preserving review history", async () => {
  const { job, repository, service } = await queuedService(); await repository.update(job.id, { executionMode: "CODE_CHANGE", reviewRequired: true, allowedPaths: ["apps/server/src/splinter/routes.ts"], acceptanceCriteria: ["route"], requiredChecks: ["SPLINTER_FOCUSED_TESTS"], maxAttempts: 3 }); await service.transition(job.id, "RUNNING");
  await service.submitWorkerOutcome(job.id, { workerRunId: "builder", status: "SUCCEEDED", summary: "done", filesInspected: [], filesChanged: [], testsPerformed: [], commitSha: "abcdef1", startedAt: timestamps[0], completedAt: timestamps[1] });
  const review = (run, reviewedCommitSha) => ({ reviewResult: "REJECT", summary: `reject ${run}`, blockingFindings: ["inside allowed path"], nonBlockingFindings: [], reviewedCommitSha, reviewerRunId: `raphael-${run}`, reviewerProvider: "anthropic", reviewerModel: "claude", startedAt: timestamps[0], completedAt: timestamps[1] });
  await service.submitReview(job.id, review(1, "abcdef1")); await service.recordReviewRepair(job.id, { workerRunId: "repair-1", status: "SUCCEEDED", summary: "repaired", filesInspected: [], filesChanged: ["apps/server/src/splinter/routes.ts"], testsPerformed: ["check"], commitSha: "abcdef2", startedAt: timestamps[0], completedAt: timestamps[1] });
  await service.submitReview(job.id, review(2, "abcdef2")); await service.recordReviewRepair(job.id, { workerRunId: "repair-2", status: "SUCCEEDED", summary: "repaired", filesInspected: [], filesChanged: ["apps/server/src/splinter/routes.ts"], testsPerformed: ["check"], commitSha: "abcdef3", startedAt: timestamps[0], completedAt: timestamps[1] }); const third = await service.submitReview(job.id, review(3, "abcdef3"));
  assert.equal(third.reviewCycleCount, 3); assert.equal(third.reviewHistory.length, 3); await assert.rejects(() => service.submitReview(job.id, review(4, "abcdef3")), { code: "INVALID_TRANSITION" });
});

test("review-required code-change builder success remains awaiting Raphael approval", async () => {
  const { job, repository, service } = await queuedService();
  await repository.update(job.id, { executionMode: "CODE_CHANGE", reviewRequired: true, allowedPaths: ["apps/server/src/splinter/routes.ts"], acceptanceCriteria: ["route"], requiredChecks: ["SPLINTER_FOCUSED_TESTS"], maxAttempts: 3 }); await service.transition(job.id, "RUNNING");
  const built = await service.submitWorkerOutcome(job.id, { workerRunId: "builder", status: "SUCCEEDED", summary: "done", filesInspected: [], filesChanged: ["apps/server/src/splinter/routes.ts"], testsPerformed: ["check"], commitSha: "abcdef1", startedAt: timestamps[0], completedAt: timestamps[1] });
  assert.equal(built.state, "RUNNING"); assert.equal(built.result, "PENDING"); assert.equal(built.reviewStatus, "AWAITING_REVIEW"); assert.equal(built.workerHistory[0].workerRunId, "builder");
});

test("only an exact Raphael PASS finalizes a review-required code change", async () => {
  const { job, repository, service } = await queuedService();
  await repository.update(job.id, { executionMode: "CODE_CHANGE", reviewRequired: true, allowedPaths: ["apps/server/src/splinter/routes.ts"], acceptanceCriteria: ["route"], requiredChecks: ["SPLINTER_FOCUSED_TESTS"], maxAttempts: 3 }); await service.transition(job.id, "RUNNING");
  await service.submitWorkerOutcome(job.id, { workerRunId: "builder", status: "SUCCEEDED", summary: "done", filesInspected: [], filesChanged: ["apps/server/src/splinter/routes.ts"], testsPerformed: ["check"], commitSha: "abcdef1", startedAt: timestamps[0], completedAt: timestamps[1] });
  const review = (reviewResult, reviewedCommitSha = "abcdef1") => ({ reviewResult, summary: "review", blockingFindings: reviewResult === "REJECT" ? ["fix"] : [], nonBlockingFindings: [], reviewedCommitSha, reviewerRunId: `raphael-${reviewResult}`, reviewerProvider: "anthropic", reviewerModel: "claude", startedAt: timestamps[0], completedAt: timestamps[1] });
  await assert.rejects(() => service.submitReview(job.id, review("PASS", "deadbee")), { code: "INVALID_TRANSITION" });
  assert.equal((await repository.get(job.id)).state, "RUNNING");
  const approved = await service.submitReview(job.id, review("PASS"));
  assert.equal(approved.state, "SUCCEEDED"); assert.equal(approved.result, "PASS"); assert.equal(approved.reviewStatus, "APPROVED");
});

test("infrastructure failure and reject cannot finalize a review-required code change", async () => {
  for (const reviewResult of ["INFRASTRUCTURE_FAILURE", "REJECT"]) {
    const { job, repository, service } = await queuedService();
    await repository.update(job.id, { executionMode: "CODE_CHANGE", reviewRequired: true, allowedPaths: ["apps/server/src/splinter/routes.ts"], acceptanceCriteria: ["route"], requiredChecks: ["SPLINTER_FOCUSED_TESTS"], maxAttempts: 3 }); await service.transition(job.id, "RUNNING");
    await service.submitWorkerOutcome(job.id, { workerRunId: "builder", status: "SUCCEEDED", summary: "done", filesInspected: [], filesChanged: ["apps/server/src/splinter/routes.ts"], testsPerformed: ["check"], commitSha: "abcdef1", startedAt: timestamps[0], completedAt: timestamps[1] });
    const result = await service.submitReview(job.id, { reviewResult, summary: "not approved", blockingFindings: reviewResult === "REJECT" ? ["fix"] : [], nonBlockingFindings: [], reviewedCommitSha: "abcdef1", reviewerRunId: `raphael-${reviewResult}`, reviewerProvider: "anthropic", reviewerModel: "claude", startedAt: timestamps[0], completedAt: timestamps[1] });
    assert.equal(result.state, "RUNNING"); assert.equal(result.result, "PENDING");
  }
});

test("read-only worker success remains final without Raphael review", async () => {
  const { job, service } = await queuedService(); await service.transition(job.id, "RUNNING");
  const finished = await service.submitWorkerOutcome(job.id, { workerRunId: "reader", status: "SUCCEEDED", summary: "done", filesInspected: ["package.json"], filesChanged: [], testsPerformed: [], startedAt: timestamps[0], completedAt: timestamps[1] });
  assert.equal(finished.state, "SUCCEEDED"); assert.equal(finished.result, "PASS"); assert.equal(finished.reviewStatus, "NOT_REQUIRED");
});

test("review repair preserves both Atlas run records", async () => {
  const { job, repository, service } = await queuedService();
  await repository.update(job.id, { executionMode: "CODE_CHANGE", reviewRequired: true, allowedPaths: ["apps/server/src/splinter/routes.ts"], acceptanceCriteria: ["route"], requiredChecks: ["SPLINTER_FOCUSED_TESTS"], maxAttempts: 3 }); await service.transition(job.id, "RUNNING");
  await service.submitWorkerOutcome(job.id, { workerRunId: "builder", status: "SUCCEEDED", summary: "done", filesInspected: [], filesChanged: ["apps/server/src/splinter/routes.ts"], testsPerformed: ["check"], commitSha: "abcdef1", startedAt: timestamps[0], completedAt: timestamps[1] });
  await service.submitReview(job.id, { reviewResult: "REJECT", summary: "fix", blockingFindings: ["fix"], nonBlockingFindings: [], reviewedCommitSha: "abcdef1", reviewerRunId: "raphael-1", reviewerProvider: "anthropic", reviewerModel: "claude", startedAt: timestamps[0], completedAt: timestamps[1] });
  const repaired = await service.recordReviewRepair(job.id, { workerRunId: "repair", status: "SUCCEEDED", summary: "fixed", filesInspected: [], filesChanged: ["apps/server/src/splinter/routes.ts"], testsPerformed: ["check"], baseSha: "abcdef0", commitSha: "abcdef2", startedAt: timestamps[0], completedAt: timestamps[1] });
  assert.deepEqual(repaired.workerHistory.map((item) => item.workerRunId), ["builder", "repair"]);
});

async function approvedCodeChange(service, repository, id = "splinter-promotion-job") {
  const created = await repository.create(validJob({ id }));
  await repository.update(created.id, { executionMode: "CODE_CHANGE", reviewRequired: true, allowedPaths: ["apps/server/src/splinter/routes.ts"], acceptanceCriteria: ["route"], requiredChecks: ["SPLINTER_FOCUSED_TESTS"], maxAttempts: 3 });
  await service.transition(created.id, "RUNNING");
  await service.submitWorkerOutcome(created.id, { workerRunId: "builder", status: "SUCCEEDED", summary: "done", filesInspected: [], filesChanged: ["apps/server/src/splinter/routes.ts"], testsPerformed: ["check"], commitSha: "abcdef1", startedAt: timestamps[0], completedAt: timestamps[1] });
  return service.submitReview(created.id, { reviewResult: "PASS", summary: "approved", blockingFindings: [], nonBlockingFindings: [], reviewedCommitSha: "abcdef1", reviewerRunId: "raphael-approved", reviewerProvider: "anthropic", reviewerModel: "claude", startedAt: timestamps[0], completedAt: timestamps[1] });
}

test("only an exact Raphael-approved promotable code change can begin staging integration", async () => {
  const { repository, service } = await queuedService();
  const approved = await approvedCodeChange(service, repository);
  const started = await service.beginIntegration(approved.id, "1234567", "abcdef1");
  assert.equal(started.integration.status, "IN_PROGRESS");
  assert.equal(started.integration.stagingBaseSha, "1234567");
  assert.equal(started.integration.approvedCommitSha, "abcdef1");
  assert.equal(started.state, "SUCCEEDED");
});

test("unreviewed, mismatched, and proof-only jobs cannot enter staging integration", async () => {
  const { job, repository, service } = await queuedService();
  await repository.update(job.id, { executionMode: "CODE_CHANGE", reviewRequired: true, allowedPaths: ["apps/server/src/splinter/routes.ts"], acceptanceCriteria: ["route"], requiredChecks: ["SPLINTER_FOCUSED_TESTS"], maxAttempts: 3 });
  await service.transition(job.id, "RUNNING");
  await service.submitWorkerOutcome(job.id, { workerRunId: "builder", status: "SUCCEEDED", summary: "done", filesInspected: [], filesChanged: [], testsPerformed: [], commitSha: "abcdef1", startedAt: timestamps[0], completedAt: timestamps[1] });
  await assert.rejects(() => service.beginIntegration(job.id, "1234567", "abcdef1"), { code: "INVALID_TRANSITION" });
  const approved = await approvedCodeChange(service, repository, "splinter-approved-mismatch");
  await assert.rejects(() => service.beginIntegration(approved.id, "1234567", "deadbee"), { code: "INVALID_TRANSITION" });
  const proof = await approvedCodeChange(service, repository, "splinter-review-proof-historical");
  await assert.rejects(() => service.beginIntegration(proof.id, "1234567", "abcdef1"), { code: "INVALID_TRANSITION" });
});

test("integration results require the active base and preserve verified candidate evidence", async () => {
  const { repository, service } = await queuedService();
  const approved = await approvedCodeChange(service, repository, "splinter-integration-result");
  await service.beginIntegration(approved.id, "1234567", "abcdef1");
  const finished = await service.recordIntegration(approved.id, { status: "PASSED", stagingBaseSha: "1234567", approvedCommitSha: "abcdef1", integratedCandidateSha: "fedcba1", verification: ["focused tests passed", "typecheck passed"] });
  assert.equal(finished.integration.status, "PASSED");
  assert.equal(finished.integration.integratedCandidateSha, "fedcba1");
  await assert.rejects(() => service.recordIntegration(approved.id, { status: "STALE", stagingBaseSha: "7654321", approvedCommitSha: "abcdef1", verification: [] }), { code: "INVALID_TRANSITION" });
});

test("only an integrated exact approved candidate can begin and record staging deployment", async () => {
  const { repository, service } = await queuedService();
  const approved = await approvedCodeChange(service, repository, "splinter-deployment-job");
  await service.beginIntegration(approved.id, "1234567", "abcdef1");
  await service.recordIntegration(approved.id, { status: "PASSED", stagingBaseSha: "1234567", approvedCommitSha: "abcdef1", integratedCandidateSha: "fedcba1", verification: ["combined checks passed"] });
  const started = await service.beginDeployment(approved.id, "1234567", "fedcba1");
  assert.equal(started.deployment.status, "DEPLOYING");
  const completed = await service.recordDeployment(approved.id, { status: "PASSED", previousKnownGoodStagingSha: "1234567", requestedCandidateSha: "fedcba1", actualLiveSha: "fedcba1", deploymentRunId: "staging-run-1", verification: ["live SHA verified", "health passed"] });
  assert.equal(completed.deployment.status, "PASSED"); assert.equal(completed.deployment.actualLiveSha, "fedcba1");
  await assert.rejects(() => service.beginDeployment(approved.id, "1234567", "abcdef1"), { code: "INVALID_TRANSITION" });
});

test("relay rediscovery resumes only an integrated Raphael-approved code change that has not started deployment", async () => {
  const { repository, service } = await queuedService();
  const eligible = await approvedCodeChange(service, repository, "splinter-deployment-recovery");
  await service.beginIntegration(eligible.id, "1234567", "abcdef1");
  await service.recordIntegration(eligible.id, { status: "PASSED", stagingBaseSha: "1234567", approvedCommitSha: "abcdef1", integratedCandidateSha: "fedcba1", verification: ["combined checks passed"] });
  const unapproved = await approvedCodeChange(service, repository, "splinter-not-approved");
  await service.beginIntegration(unapproved.id, "1234567", "abcdef1");
  await service.recordIntegration(unapproved.id, { status: "PASSED", stagingBaseSha: "1234567", approvedCommitSha: "abcdef1", integratedCandidateSha: "fedcba1", verification: [] });
  await repository.update(unapproved.id, { reviewStatus: "AWAITING_REVIEW" });
  const app = express(); app.use(express.json()); registerSplinterRelayRoutes(app, { repository, service, env: { SPLINTER_RELAY_SERVICE_TOKEN: "relay-secret" } });
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/api/internal/splinter/jobs?state=QUEUED`, { headers: { "x-splinter-relay-token": "relay-secret" } }); const body = await response.json();
    const recovered = body.jobs.find((job) => job.id === eligible.id);
    assert.equal(response.status, 200); assert.equal(recovered.state, "SUCCEEDED"); assert.equal(recovered.integration.integratedCandidateSha, "fedcba1"); assert.equal(recovered.deployment.status, "NOT_REQUESTED"); assert.equal(body.jobs.some((job) => job.id === unapproved.id), false);
    const starts = await Promise.allSettled([service.beginDeployment(eligible.id, "1234567", "fedcba1"), service.beginDeployment(eligible.id, "1234567", "fedcba1")]);
    assert.equal(starts.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal((await repository.get(eligible.id)).deployment.status, "DEPLOYING");
    const afterStart = await fetch(`${base}/api/internal/splinter/jobs?state=QUEUED`, { headers: { "x-splinter-relay-token": "relay-secret" } });
    assert.equal((await afterStart.json()).jobs.some((job) => job.id === eligible.id), false);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("unintegrated, stale, or failed deployment evidence cannot become known-good", async () => {
  const { repository, service } = await queuedService();
  const approved = await approvedCodeChange(service, repository, "splinter-deployment-reject");
  await assert.rejects(() => service.beginDeployment(approved.id, "1234567", "abcdef1"), { code: "INVALID_TRANSITION" });
  await service.beginIntegration(approved.id, "1234567", "abcdef1");
  await service.recordIntegration(approved.id, { status: "STALE", stagingBaseSha: "1234567", approvedCommitSha: "abcdef1", verification: [], error: "staging advanced" });
  await assert.rejects(() => service.beginDeployment(approved.id, "1234567", "abcdef1"), { code: "INVALID_TRANSITION" });
});

async function failedDeployment(service, repository, id = "splinter-deployment-retry") {
  const approved = await approvedCodeChange(service, repository, id);
  await service.beginIntegration(approved.id, "1234567", "abcdef1");
  await service.recordIntegration(approved.id, { status: "PASSED", stagingBaseSha: "1234567", approvedCommitSha: "abcdef1", integratedCandidateSha: "fedcba1", verification: ["combined checks passed"] });
  await service.beginDeployment(approved.id, "1234567", "fedcba1");
  return service.recordDeployment(approved.id, { status: "FAILED", previousKnownGoodStagingSha: "1234567", requestedCandidateSha: "fedcba1", deploymentRunId: "staging-run-failed", verification: ["health failed"], error: "safe failure" });
}

test("an eligible failed staging deployment retries atomically with preserved audited failure evidence", async () => {
  const { repository, service } = await queuedService();
  const failed = await failedDeployment(service, repository);
  const retries = await Promise.allSettled([service.retryFailedDeployment(failed.id), service.retryFailedDeployment(failed.id)]);
  assert.equal(retries.filter((result) => result.status === "fulfilled").length, 1);
  const retried = retries.find((result) => result.status === "fulfilled").value;
  assert.equal(retried.state, "RUNNING"); assert.equal(retried.deployment.status, "DEPLOYING"); assert.equal(retried.deployment.requestedCandidateSha, "fedcba1");
  assert.equal(retried.deploymentHistory.length, 1); assert.deepEqual(retried.deploymentHistory[0].deployment, failed.deployment); assert.equal(retried.deploymentHistory[0].retriedBy, "splinter");
});

test("deployment retry binds only the current integration candidate and rejects ineligible conditions", async () => {
  const { repository, service } = await queuedService();
  const failed = await failedDeployment(service, repository, "splinter-deployment-retry-reject");
  const app = express(); app.use(express.json()); registerSplinterRelayRoutes(app, { repository, service, env: { SPLINTER_RELAY_SERVICE_TOKEN: "relay-secret" } });
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const arbitrary = await fetch(`${base}/api/internal/splinter/jobs/${failed.id}/deployment/retry`, { method: "POST", headers: { "content-type": "application/json", "x-splinter-relay-token": "relay-secret" }, body: JSON.stringify({ requestedCandidateSha: "deadbee" }) });
    assert.equal(arbitrary.status, 400);
    await repository.update(failed.id, { integration: { ...failed.integration, integratedCandidateSha: "deadbee" } });
    const retried = await service.retryFailedDeployment(failed.id);
    assert.equal(retried.deployment.requestedCandidateSha, "deadbee");
    assert.equal(retried.deploymentHistory[0].deployment.requestedCandidateSha, "fedcba1");
    await repository.update(failed.id, { state: "SUCCEEDED", result: "PASS", deployment: failed.deployment, deploymentHistory: undefined, integration: failed.integration, nonPromotable: true });
    await assert.rejects(() => service.retryFailedDeployment(failed.id), { code: "INVALID_TRANSITION" });
    await repository.update(failed.id, { nonPromotable: false, reviewStatus: "AWAITING_REVIEW" });
    await assert.rejects(() => service.retryFailedDeployment(failed.id), { code: "INVALID_TRANSITION" });
    await repository.update(failed.id, { reviewStatus: "APPROVED", rfi: { rfiId: "retry-rfi", jobId: failed.id, category: "OWNER_REQUIRED", title: "decision", decisionNeeded: "choose", whyAutomationCannotDecide: "authority", knownFacts: ["fact"], options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }], recommendedOption: "yes", affectedScope: "job", currentSafeState: "failed", blocking: true, createdAt: timestamps[0] } });
    await assert.rejects(() => service.retryFailedDeployment(failed.id), { code: "INVALID_TRANSITION" });
    await repository.update(failed.id, { rfi: undefined, escalation: { classification: "SAFETY_STOP", detail: "stop" } });
    await assert.rejects(() => service.retryFailedDeployment(failed.id), { code: "INVALID_TRANSITION" });
    await repository.update(failed.id, { escalation: undefined, deployment: { ...failed.deployment, status: "STALE" } });
    await assert.rejects(() => service.retryFailedDeployment(failed.id), { code: "INVALID_TRANSITION" });
    for (const status of ["NOT_REQUESTED", "DEPLOYING", "PASSED", "ROLLED_BACK", "ROLLBACK_FAILED"]) {
      await repository.update(failed.id, { deployment: { ...failed.deployment, status } });
      await assert.rejects(() => service.retryFailedDeployment(failed.id), { code: "INVALID_TRANSITION" });
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

function reconciliationWorkItem(overrides = {}) {
  return {
    workItemId: "request-foundation-reconciliation",
    title: "First-class Request lifecycle foundation",
    goal: "Reconcile the current Request foundation against approved requirements.",
    module: "NexOps / CRM / Requests",
    tenantScope: "Aquatrace-first reusable tenant architecture",
    priority: 1,
    launchCritical: true,
    dependencies: [],
    acceptanceCriteria: ["Current Request behavior is verified against the approved revision."],
    requiredChecks: ["SPLINTER_FOCUSED_TESTS", "SPLINTER_FOCUSED_TYPECHECK"],
    allowedPaths: [],
    pathDiscoveryPolicy: "APPROVED_DISCOVERY",
    ownerDecisionRequired: false,
    promotionPolicy: "NONE",
    sourceRequirementRefs: ["docs/specs/phase1/NEXOPS-OPERATING-MODEL-DECISIONS-20260712.md#1.1"],
    requirementRevision: "2026-07-12-settled",
    nonPromotable: false,
    reconciliationMode: true,
    completedEvidenceRefs: [],
    ...overrides
  };
}

function reconciliationEvidence(overrides = {}) {
  return {
    reconciliationId: "reconciliation-request-foundation",
    sourceRequirementRefs: ["docs/specs/phase1/NEXOPS-OPERATING-MODEL-DECISIONS-20260712.md#1.1"],
    requirementRevision: "2026-07-12-settled",
    stagingShaVerified: "31b736e",
    deterministicChecks: ["focused Request foundation tests: PASS", "server typecheck: PASS"],
    liveChecks: ["staging version: PASS", "unauthenticated request protection: PASS"],
    reviewResult: "PASS",
    reviewedEvidence: ["raphael:raphael-reconciliation-1"],
    missingEvidence: [],
    reconciledAt: timestamps[1],
    reconciledBy: "splinter",
    completionStatus: "VERIFIED_COMPLETE",
    ...overrides
  };
}

test("pre-registry reconciliation completes only fully verified current evidence without creating a development job", async () => {
  const registry = new InMemoryWorkRegistry();
  const jobs = new InMemorySplinterRepository({ now: sequentialClock() });
  const selector = new SplinterWorkSelector(registry, jobs);
  await registry.create(reconciliationWorkItem());
  const item = await selector.reconcilePreRegistry("request-foundation-reconciliation", reconciliationEvidence());
  assert.equal(item.status, "COMPLETED");
  assert.equal(item.activeSplinterJobId, undefined);
  assert.deepEqual(item.completedEvidenceRefs, ["reconciliation:reconciliation-request-foundation", "raphael:raphael-reconciliation-1"]);
  assert.equal((await jobs.listQueued()).length, 0);
  assert.equal(await selector.select("31b736e"), null);
});

test("pre-registry reconciliation preserves partial evidence without a duplicate development job", async () => {
  const registry = new InMemoryWorkRegistry(); const jobs = new InMemorySplinterRepository({ now: sequentialClock() }); const selector = new SplinterWorkSelector(registry, jobs);
  await registry.create(reconciliationWorkItem({ workItemId: "request-partial" }));
  const result = await selector.reconcilePreRegistry("request-partial", reconciliationEvidence({ reconciliationId: "reconciliation-partial", completionStatus: "PARTIALLY_VERIFIED", reviewResult: "INSUFFICIENT_EVIDENCE", liveChecks: [], missingEvidence: ["Authenticated Aquatrace live tenant acceptance is unavailable."] }));
  assert.equal(result.status, "DRAFT"); assert.equal(result.reconciliation.completionStatus, "PARTIALLY_VERIFIED"); assert.equal(result.completedEvidenceRefs.length, 0); assert.equal((await jobs.listQueued()).length, 0);
});

test("pre-registry reconciliation rejects incomplete, stale, active, and self-certified completion evidence", async () => {
  const registry = new InMemoryWorkRegistry(); const jobs = new InMemorySplinterRepository({ now: sequentialClock() }); const selector = new SplinterWorkSelector(registry, jobs);
  await registry.create(reconciliationWorkItem({ workItemId: "request-incomplete" }));
  await assert.rejects(() => selector.reconcilePreRegistry("request-incomplete", reconciliationEvidence({ completionStatus: "VERIFIED_COMPLETE", reviewResult: "REJECT" })));
  await registry.create(reconciliationWorkItem({ workItemId: "request-stale", requirementRevision: "new-revision" }));
  await assert.rejects(() => selector.reconcilePreRegistry("request-stale", reconciliationEvidence()));
  await registry.create(reconciliationWorkItem({ workItemId: "request-active", activeSplinterJobId: "job-existing" }));
  await assert.rejects(() => selector.reconcilePreRegistry("request-active", reconciliationEvidence()));
  await assert.rejects(() => selector.reconcilePreRegistry("request-incomplete", { ...reconciliationEvidence(), reconciledBy: "donatello" }));
});

test("pre-registry reconciliation route is owner-only and relay authority cannot directly complete an item", async () => {
  const registry = new InMemoryWorkRegistry(); const jobs = new InMemorySplinterRepository({ now: sequentialClock() }); const service = new SplinterJobService(jobs); const selector = new SplinterWorkSelector(registry, jobs);
  await registry.create(reconciliationWorkItem({ workItemId: "request-route" }));
  const app = express(); app.use(express.json()); registerSplinterRelayRoutes(app, { repository: jobs, service, workRegistry: registry, workSelector: selector, env: { SPLINTER_RELAY_SERVICE_TOKEN: "relay-secret", SPLINTER_OWNER_SERVICE_TOKEN: "owner-secret" } });
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const body = JSON.stringify(reconciliationEvidence({ reconciliationId: "reconciliation-route" }));
    assert.equal((await fetch(`${base}/api/internal/splinter/work-items/request-route/reconcile`, { method: "POST", headers: { "content-type": "application/json", "x-splinter-relay-token": "relay-secret" }, body })).status, 401);
    assert.equal((await fetch(`${base}/api/internal/splinter/work-items/request-route/reconcile`, { method: "POST", headers: { "content-type": "application/json", "x-splinter-owner-token": "owner-secret" }, body })).status, 200);
  } finally { server.close(); }
});
