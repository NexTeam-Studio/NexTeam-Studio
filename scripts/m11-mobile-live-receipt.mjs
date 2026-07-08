import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createOperatorProofSession,
  fetchJson,
  resolveBaseUrl
} from "./support/liveProofHelpers.mjs";

const baseUrl = (process.env.NEXI_BASE_URL || resolveBaseUrl()).replace(/\/$/, "");
const expectedSha = process.env.EXPECTED_SHA || process.env.NEXTEAM_DEPLOY_SHA || "";
const tenantId = process.env.TENANT_ID || "aquatrace";
const receiptPath = process.env.M11_MOBILE_LIVE_RECEIPT || "receipts/m11/mobile-live-api-receipt-current.json";
const runId = `m11-live-${Date.now()}-${randomUUID().slice(0, 8)}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, { idToken, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  const response = await fetchJson(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok || response.json?.ok === false) {
    throw new Error(`${method} ${path} failed (${response.status}): ${response.json?.error || response.text}`);
  }
  return response.json;
}

const receipt = {
  ok: false,
  receiptName: "m11-mobile-live-api-receipt-current",
  startedAt: new Date().toISOString(),
  stagingBaseUrl: baseUrl,
  expectedSha,
  tenantId,
  runId,
  checks: {},
  raw: {}
};

let proof = null;
try {
  proof = await createOperatorProofSession();
  const idToken = proof.idToken;

  const version = await request("/api/version");
  receipt.raw.version = version;
  receipt.checks.versionShaMatched = expectedSha ? version.sha === expectedSha : Boolean(version.sha);
  assert(receipt.checks.versionShaMatched, `version SHA mismatch: expected ${expectedSha}, got ${version.sha}`);

  const health = await request("/api/health");
  receipt.raw.health = health;
  receipt.checks.healthGreen = Boolean(health.ok && health.rails?.jobber?.ok && health.rails?.companycam?.ok && health.rails?.anthropic?.ok);
  assert(receipt.checks.healthGreen, "health was not green");

  const schedule = await request(`/api/mobile/day-schedule?tenantId=${encodeURIComponent(tenantId)}&date=2026-07-07&technicianId=tech_chris`, { idToken });
  receipt.raw.schedule = schedule;
  receipt.checks.assignedScheduleOnly = schedule.schedule?.jobs?.length === 1
    && schedule.schedule.jobs[0]?.jobId === "job_deborah_justice"
    && !schedule.schedule.jobs.some((job) => job.jobId === "job_catherine_only");
  assert(receipt.checks.assignedScheduleOnly, "assigned day schedule was not scoped to tech_chris");

  const job = await request(`/api/mobile/jobs/job_deborah_justice?tenantId=${encodeURIComponent(tenantId)}`, { idToken });
  receipt.raw.job = job;
  receipt.checks.oneJobReadWorks = job.job?.jobId === "job_deborah_justice";
  assert(receipt.checks.oneJobReadWorks, "one-job mobile read did not return the expected job");

  const push = await request("/api/mobile/push-token", {
    idToken,
    method: "POST",
    body: {
      tenantId,
      expoPushToken: `ExponentPushToken[${runId}]`,
      deviceId: runId,
      platform: "ios"
    }
  });
  receipt.raw.push = push;
  receipt.checks.pushRegistered = push.registration?.deviceId === runId;
  assert(receipt.checks.pushRegistered, "push token did not register");

  const sync = await request(`/api/mobile/sync?tenantId=${encodeURIComponent(tenantId)}`, {
    idToken,
    method: "POST",
    body: {
      operations: [
        {
          tenantId,
          opId: `${runId}_checklist`,
          jobId: "job_deborah_justice",
          actorTenantUserId: "tech_chris",
          createdAt: "2026-07-07T14:01:00.000Z",
          localUpdatedAt: "2026-07-07T14:01:00.000Z",
          baseRemoteUpdatedAt: job.job.updatedAt,
          type: "checklist.upsert",
          payload: {
            checklistId: "aquatrace-leak-detection",
            answers: { arrived: true, waterLossInches: 2.5 },
            updatedBy: "tech_chris"
          }
        },
        {
          tenantId,
          opId: `${runId}_photo`,
          jobId: "job_deborah_justice",
          actorTenantUserId: "tech_chris",
          createdAt: "2026-07-07T14:02:00.000Z",
          localUpdatedAt: "2026-07-07T14:02:00.000Z",
          baseRemoteUpdatedAt: job.job.updatedAt,
          type: "photo.upload",
          payload: {
            localPhotoId: `${runId}_photo_local`,
            clientId: "client_deborah_justice",
            uri: "file:///device/photos/deborah-main-drain.jpg",
            exif: {
              capturedAt: "2026-07-07T14:02:00.000Z",
              latitude: 34.51212,
              longitude: -82.98531,
              accuracyMeters: 5
            },
            caption: "Main drain dye test",
            capturedBy: "tech_chris"
          }
        },
        {
          tenantId,
          opId: `${runId}_close`,
          jobId: "job_deborah_justice",
          actorTenantUserId: "tech_chris",
          createdAt: "2026-07-07T14:03:00.000Z",
          localUpdatedAt: "2026-07-07T14:03:00.000Z",
          baseRemoteUpdatedAt: job.job.updatedAt,
          type: "jobStatus.update",
          payload: {
            status: "completed",
            notes: "Checklist complete and photos captured offline.",
            updatedBy: "tech_chris"
          }
        }
      ]
    }
  });
  receipt.raw.sync = sync;
  receipt.checks.syncBatchApplied = sync.summary?.attempted === 3
    && sync.summary?.synced === 3
    && sync.results?.some((result) => result.remoteUrl?.startsWith("gs://nexteam-studio.firebasestorage.app/"));
  assert(receipt.checks.syncBatchApplied, "mobile sync batch did not apply all operations");

  const approvalSeed = await request("/api/approval-queue", {
    method: "POST",
    body: {
      tenantId,
      kind: "email",
      preview: { title: `M11 approval ${runId}`, body: "Owner approval required." },
      execute: { service: "mobile", op: "approvalOnly", args: { actorId: "internal:owner" } },
      createdBy: "user"
    }
  });
  const approvals = await request(`/api/mobile/approvals?tenantId=${encodeURIComponent(tenantId)}`, { idToken });
  receipt.raw.approvals = { seededId: approvalSeed.id, listedCount: approvals.items?.length ?? 0 };
  receipt.checks.approvalsVisibleToOwner = approvals.items?.some((item) => item.id === approvalSeed.id) === true;
  assert(receipt.checks.approvalsVisibleToOwner, "mobile approval review did not list the seeded approval");

  receipt.ok = true;
  receipt.finishedAt = new Date().toISOString();
  receipt.operator = {
    mode: proof.mode,
    email: proof.identity.email || null,
    uidPresent: Boolean(proof.identity.uid)
  };
  receipt.boundaries = {
    outboundExecuted: false,
    productionDeploy: false,
    jobberWrites: false,
    companyCamWrites: false
  };
} catch (error) {
  receipt.ok = false;
  receipt.error = error instanceof Error ? error.message : String(error);
  receipt.finishedAt = new Date().toISOString();
  throw error;
} finally {
  await proof?.dispose?.().catch(() => {});
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: receipt.ok,
    receiptPath,
    checks: receipt.checks,
    sha: receipt.raw.version?.sha,
    error: receipt.error
  }, null, 2));
}
