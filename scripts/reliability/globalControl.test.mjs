import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendEvent, completeJob, dispatchNext, pollStatus, reconcileJournal } from "./globalControl.mjs";
import { assertStagingGitHubRail, evidenceGate, runEnvironmentBootstrap, runStagingAuthRegression } from "./stagingReliability.mjs";

test("JSONL control journal dispatches queued jobs, retries expired leases, and advances to next job", async () => {
  const dir = await mkdtemp(join(tmpdir(), "global-control-")); const file = join(dir, "jobs.jsonl"); const now = Date.now(); const dispatched = [];
  try {
    await appendEvent(file, { type: "JOB_QUEUED", jobId: "one", payload: { command: "verify" } });
    await appendEvent(file, { type: "JOB_QUEUED", jobId: "two" });
    assert.equal((await dispatchNext({ file, now, dispatch: async (job) => dispatched.push(job.id) })).id, "one");
    await completeJob({ file, jobId: "one", succeeded: true, reason: "passed" });
    assert.equal((await dispatchNext({ file, now: now + 1, dispatch: async (job) => dispatched.push(job.id) })).id, "two");
    await reconcileJournal({ file, now: now + 61_001 });
    const status = await pollStatus({ file, now: now + 61_002 });
    assert.deepEqual(dispatched, ["one", "two"]); assert.equal(status.authoritativeTransport, "jsonl"); assert.equal(status.counts.SUCCEEDED, 1); assert.equal(status.counts.QUEUED, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("duplicate guard resumes incomplete same-job work and retains linked continuations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "global-control-resume-")); const file = join(dir, "jobs.jsonl");
  try {
    await appendEvent(file, { type: "JOB_QUEUED", jobId: "tenant-lifecycle", payload: { phase: "STAGING_PROMOTION" } });
    await appendEvent(file, { type: "JOB_TRANSITION", jobId: "tenant-lifecycle", to: "DISPATCHED" });
    await appendEvent(file, { type: "JOB_TRANSITION", jobId: "tenant-lifecycle", to: "RUNNING" });
    await appendEvent(file, { type: "JOB_TRANSITION", jobId: "tenant-lifecycle", to: "FAILED", reason: "interrupted" });
    await appendEvent(file, { type: "JOB_QUEUED", jobId: "tenant-lifecycle", payload: { phase: "STAGING_PROMOTION" } });
    await appendEvent(file, { type: "JOB_QUEUED", jobId: "tenant-lifecycle-verify", continuationOf: "tenant-lifecycle", payload: { phase: "LIVE_REGRESSION" } });
    const status = await pollStatus({ file });
    const resumed = status.jobs.find((job) => job.id === "tenant-lifecycle");
    const continuation = status.jobs.find((job) => job.id === "tenant-lifecycle-verify");
    assert.equal(resumed?.state, "QUEUED"); assert.equal(resumed?.resumes, 1);
    assert.equal(continuation?.state, "QUEUED"); assert.equal(continuation?.continuationOf, "tenant-lifecycle");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("staging rail, SHA model, bootstrap, auth harness, and evidence gate fail closed", async () => {
  const sha = "a".repeat(40); assert.equal(assertStagingGitHubRail({ environment: "staging", deploymentRail: "github-actions", sourceSha: sha, deploymentSha: sha, liveSha: sha }).verified, true);
  assert.throws(() => assertStagingGitHubRail({ environment: "production", deploymentRail: "railway-cli", sourceSha: sha, deploymentSha: sha, liveSha: sha }));
  const boot = await runEnvironmentBootstrap({ environment: "staging", identity: "environment-bootstrap", purpose: "idempotently verify environment prerequisites", steps: [{ id: "config", check: async () => true }] }); assert.equal(boot.changed, false);
  const auth = await runStagingAuthRegression({ baseUrl: "https://staging.invalid", expectedSha: sha, fetchImpl: async () => new Response(JSON.stringify({ sha }), { status: 200 }) }); assert.equal(auth.shaMatches, true);
  const dir = await mkdtemp(join(tmpdir(), "evidence-")); const receipt = join(dir, "receipt.json");
  try { await writeFile(receipt, JSON.stringify({ environment: "staging", deploymentRail: "github-actions", green: true, fixed: true, productionChanged: false })); assert.equal((await evidenceGate({ sourceSha: sha, deploymentSha: sha, liveSha: sha, receiptFile: receipt })).receiptVerified, true); } finally { await rm(dir, { recursive: true, force: true }); }
});
