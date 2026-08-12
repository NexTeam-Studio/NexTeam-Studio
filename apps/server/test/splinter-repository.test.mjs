import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { splinterJobSchema } from "@nexteam/core";
import {
  FirestoreSplinterRepository,
  InMemorySplinterRepository,
  SPLINTER_JOB_COLLECTION_PATH
} from "../src/splinter/repository.ts";

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
