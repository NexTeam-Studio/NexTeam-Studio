import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository
} from "@nexteam/core";
import { assertMobileDayScheduleAccess, assertMobileJobAccess } from "../dist/mobile/access.js";
import { InMemoryMobileRepository } from "../dist/mobile/repository.js";
import { registerMobileRoutes } from "../dist/mobile/routes.js";

function access(overrides = {}) {
  return {
    tenantId: "aquatrace",
    tenantUserId: "tech_chris",
    role: "TECHNICIAN",
    accessKind: "internal",
    ...overrides
  };
}

function makeServer() {
  const repository = new InMemoryMobileRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const app = express();
  app.use(express.json());
  registerMobileRoutes(app, {
    repository,
    approvalQueue,
    env: {
      TENANT_ID: "aquatrace",
      NEXI_FIREBASE_AUTH_REQUIRED: "false"
    }
  });
  return { app, repository, approvalQueue };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("M11 mobile day schedule returns assigned jobs for the requested field user", async () => {
  const { app } = makeServer();
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/mobile/day-schedule?tenantId=aquatrace&date=2026-07-07&technicianId=tech_chris`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.schedule.jobs.map((job) => job.jobId), ["job_deborah_justice"]);
    assert.equal(body.schedule.jobs[0].technicianIds.includes("tech_chris"), true);
  });
});

test("M11 mobile sync accepts airplane-mode checklist, photo, and close-out operations", async () => {
  const { app, repository } = makeServer();
  const job = repository.getJob("aquatrace", "job_deborah_justice");
  assert.ok(job);

  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/mobile/sync?tenantId=aquatrace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operations: [
          {
            tenantId: "aquatrace",
            opId: "op_checklist",
            jobId: "job_deborah_justice",
            actorTenantUserId: "tech_chris",
            createdAt: "2026-07-07T14:01:00.000Z",
            localUpdatedAt: "2026-07-07T14:01:00.000Z",
            baseRemoteUpdatedAt: job.updatedAt,
            type: "checklist.upsert",
            payload: {
              checklistId: "aquatrace-leak-detection",
              answers: { arrived: true, waterLossInches: 2.5 },
              updatedBy: "tech_chris"
            }
          },
          {
            tenantId: "aquatrace",
            opId: "op_photo",
            jobId: "job_deborah_justice",
            actorTenantUserId: "tech_chris",
            createdAt: "2026-07-07T14:02:00.000Z",
            localUpdatedAt: "2026-07-07T14:02:00.000Z",
            baseRemoteUpdatedAt: job.updatedAt,
            type: "photo.upload",
            payload: {
              localPhotoId: "photo_local_1",
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
            tenantId: "aquatrace",
            opId: "op_close",
            jobId: "job_deborah_justice",
            actorTenantUserId: "tech_chris",
            createdAt: "2026-07-07T14:03:00.000Z",
            localUpdatedAt: "2026-07-07T14:03:00.000Z",
            baseRemoteUpdatedAt: job.updatedAt,
            type: "jobStatus.update",
            payload: {
              status: "completed",
              notes: "Checklist complete and photos captured offline.",
              updatedBy: "tech_chris"
            }
          }
        ]
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.summary, { attempted: 3, synced: 3, conflicts: 0 });
    assert.match(body.results.find((result) => result.opId === "op_photo").remoteUrl, /^gs:\/\/nexteam-studio\.firebasestorage\.app\/aquatrace\/field-photos/);
    assert.equal(repository.getJob("aquatrace", "job_deborah_justice").status, "completed");
  });
});

test("M11 mobile push registration and approval review stay role-gated", async () => {
  const { app, approvalQueue } = makeServer();
  const approval = await approvalQueue.create({
    tenantId: "aquatrace",
    kind: "email",
    preview: { title: "Report delivery", body: "Owner approval required." },
    execute: { service: "mobile", op: "approvalOnly", args: { actorId: "internal:owner" } },
    createdBy: "user"
  });

  await withServer(app, async (base) => {
    const push = await fetch(`${base}/api/mobile/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        expoPushToken: "ExponentPushToken[receipt-test]",
        deviceId: "device_1",
        platform: "ios"
      })
    }).then((response) => response.json());
    assert.equal(push.ok, true);
    assert.equal(push.registration.expoPushToken, "ExponentPushToken[receipt-test]");

    const approvals = await fetch(`${base}/api/mobile/approvals?tenantId=aquatrace`).then((response) => response.json());
    assert.equal(approvals.ok, true);
    assert.deepEqual(approvals.items.map((item) => item.id), [approval.id]);
  });
});

test("M11 mobile access policy blocks cross-user and unscoped job-link access", () => {
  assert.throws(() => assertMobileDayScheduleAccess(access(), "tech_catherine"), /own assigned day/);

  const repository = new InMemoryMobileRepository();
  const job = repository.getJob("aquatrace", "job_deborah_justice");
  assert.ok(job);

  assert.equal(assertMobileJobAccess(access({ role: "OWNER", tenantUserId: "owner_1" }), job).jobId, "job_deborah_justice");
  assert.equal(assertMobileJobAccess(access({ accessKind: "job_link", jobAccessLinkId: "link_deborah_subcontractor" }), job).jobId, "job_deborah_justice");
  assert.throws(() => assertMobileJobAccess(access({ accessKind: "job_link", jobAccessLinkId: "wrong_link" }), job), /not allowed/);
});
