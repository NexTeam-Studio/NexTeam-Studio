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
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs/splinter-job-1`)).status, 401);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs/splinter-job-1`, { headers: { "x-splinter-relay-token": "wrong" } })).status, 401);
    assert.equal((await fetch(`${base}/api/internal/splinter/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal: "unauthorized", nextAction: "reject" }) })).status, 401);
  } finally { server.close(); }
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
