import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryMobileStore, MobileOfflineController } from "../dist/index.js";

function makeClock() {
  const times = [
    "2026-07-07T13:00:00.000Z",
    "2026-07-07T13:01:00.000Z",
    "2026-07-07T13:02:00.000Z",
    "2026-07-07T13:03:00.000Z",
    "2026-07-07T13:04:00.000Z",
    "2026-07-07T13:05:00.000Z"
  ];
  let index = 0;
  return () => times[index++] ?? "2026-07-07T13:59:00.000Z";
}

function makeIdFactory() {
  let index = 0;
  return (prefix) => `${prefix}_${++index}`;
}

function makeSchedule() {
  return {
    tenantId: "aquatrace",
    date: "2026-07-07",
    technicianId: "tech_chris",
    cachedAt: "2026-07-07T12:55:00.000Z",
    expiresAt: "2026-07-08T03:59:59.000Z",
    jobs: [
      {
        tenantId: "aquatrace",
        jobId: "job_deborah_justice",
        clientId: "client_deborah_justice",
        clientName: "Deborah Justice",
        propertyId: "property_isbell_road",
        propertyName: "181 Isbell Road",
        serviceAddress: {
          line1: "181 Isbell Road",
          city: "Fair Play",
          state: "SC",
          postalCode: "29643",
          geo: {
            latitude: 34.5121,
            longitude: -82.9853,
            accuracyMeters: 6
          }
        },
        scheduledStart: "2026-07-07T14:00:00.000Z",
        scheduledEnd: "2026-07-07T17:00:00.000Z",
        status: "scheduled",
        technicianIds: ["tech_chris", "tech_logan"],
        checklistTemplateIds: ["aquatrace-leak-detection"],
        notes: "",
        updatedAt: "2026-07-07T12:50:00.000Z"
      },
      {
        tenantId: "aquatrace",
        jobId: "job_office_only",
        clientId: "client_office_only",
        clientName: "Office Only",
        serviceAddress: {
          line1: "200 Not Assigned Road",
          city: "Bryson City",
          state: "NC",
          postalCode: "28713"
        },
        scheduledStart: "2026-07-07T18:00:00.000Z",
        scheduledEnd: "2026-07-07T19:00:00.000Z",
        status: "scheduled",
        technicianIds: ["tech_catherine"],
        checklistTemplateIds: ["aquatrace-leak-detection"],
        notes: "",
        updatedAt: "2026-07-07T12:51:00.000Z"
      }
    ]
  };
}

class FakeRemoteAdapter {
  constructor(schedule) {
    this.schedule = schedule;
    this.applied = [];
    this.remoteJobs = new Map(schedule.jobs.map((job) => [job.jobId, { ...job }]));
  }

  async fetchDaySchedule(input) {
    assert.equal(input.tenantId, this.schedule.tenantId);
    assert.equal(input.date, this.schedule.date);
    return this.schedule;
  }

  moveRemoteJobBeforeSync(jobId) {
    const current = this.remoteJobs.get(jobId);
    assert.ok(current);
    this.remoteJobs.set(jobId, {
      ...current,
      status: "needs_review",
      notes: "Office changed this while the phone was offline.",
      updatedAt: "2026-07-07T13:30:00.000Z"
    });
  }

  async applyOperation(operation) {
    this.applied.push(operation);
    const current = this.remoteJobs.get(operation.jobId);
    assert.ok(current);

    const conflicts =
      operation.type === "jobStatus.update" &&
      operation.baseRemoteUpdatedAt &&
      current.updatedAt > operation.baseRemoteUpdatedAt
        ? [
            {
              field: "status",
              localValue: operation.payload.status,
              remoteValue: current.status,
              remoteUpdatedAt: current.updatedAt
            }
          ]
        : [];

    if (operation.type === "jobStatus.update") {
      this.remoteJobs.set(operation.jobId, {
        ...current,
        status: operation.payload.status,
        notes: operation.payload.notes,
        updatedAt: operation.localUpdatedAt
      });
      return { remoteUpdatedAt: operation.localUpdatedAt, conflicts };
    }

    if (operation.type === "photo.upload") {
      return {
        remoteUpdatedAt: operation.localUpdatedAt,
        remoteUrl: `https://storage.example/${operation.tenantId}/${operation.payload.localPhotoId}.jpg`,
        conflicts
      };
    }

    return { remoteUpdatedAt: operation.localUpdatedAt, conflicts };
  }
}

test("M11 airplane-mode job flow syncs after reconnect with conflict flags", async () => {
  const store = new InMemoryMobileStore();
  const remote = new FakeRemoteAdapter(makeSchedule());
  const controller = new MobileOfflineController({
    store,
    remote,
    now: makeClock(),
    idFactory: makeIdFactory()
  });

  const schedule = await controller.preloadDaySchedule({
    tenantId: "aquatrace",
    date: "2026-07-07",
    technicianId: "tech_chris"
  });
  assert.equal(schedule.jobs.length, 1);
  assert.equal(store.getCachedJob("aquatrace", "job_office_only"), null);

  controller.setOnline(false);
  assert.deepEqual(controller.getNexiConnectionState(), {
    canAskNexi: false,
    showSpinner: false,
    message:
      "Nexi needs internet. Your checklist, notes, and photos are still saving here and will sync when the signal comes back."
  });

  const draft = controller.updateChecklist({
    tenantId: "aquatrace",
    jobId: "job_deborah_justice",
    checklistId: "aquatrace-leak-detection",
    answers: {
      arrived: true,
      waterLossInches: 2.5,
      result: "Fail: suction-side leak found"
    },
    updatedBy: "tech_chris"
  });
  assert.equal(draft.syncStatus, "queued");

  const photo = controller.captureJobPhoto({
    tenantId: "aquatrace",
    jobId: "job_deborah_justice",
    localUri: "file:///device/photos/deborah-main-drain.jpg",
    capturedBy: "tech_chris",
    caption: "Main drain dye test",
    exif: {
      capturedAt: "2026-07-07T15:12:00.000Z",
      latitude: 34.51212,
      longitude: -82.98531,
      accuracyMeters: 5,
      deviceModel: "iPhone Field Test"
    },
    candidates: [
      {
        tenantId: "other-tenant",
        clientId: "client_wrong",
        clientName: "Wrong Tenant Pool",
        geo: {
          latitude: 34.51212,
          longitude: -82.98531
        }
      },
      {
        tenantId: "aquatrace",
        clientId: "client_deborah_justice",
        clientName: "Deborah Justice",
        propertyId: "property_isbell_road",
        propertyName: "181 Isbell Road",
        geo: {
          latitude: 34.5121,
          longitude: -82.9853
        }
      }
    ]
  });
  assert.equal(photo.syncStatus, "queued");
  assert.equal(photo.nearestClientMatch?.clientId, "client_deborah_justice");

  const closedJob = controller.closeOutJob({
    tenantId: "aquatrace",
    jobId: "job_deborah_justice",
    status: "completed",
    notes: "Checklist complete and photos captured offline.",
    updatedBy: "tech_chris"
  });
  assert.equal(closedJob.status, "completed");
  assert.equal(store.listPendingOperations("aquatrace").length, 3);
  assert.deepEqual(store.listPendingOperations("aquatrace").map((operation) => operation.actorTenantUserId), [
    "tech_chris",
    "tech_chris",
    "tech_chris"
  ]);

  const offlineSummary = await controller.syncNow("aquatrace");
  assert.deepEqual(offlineSummary, {
    status: "offline",
    attempted: 0,
    synced: 0,
    conflicts: 0,
    remaining: 3
  });

  remote.moveRemoteJobBeforeSync("job_deborah_justice");
  controller.setOnline(true);

  const syncSummary = await controller.syncNow("aquatrace");
  assert.deepEqual(syncSummary, {
    status: "synced",
    attempted: 3,
    synced: 3,
    conflicts: 1,
    remaining: 0
  });

  assert.equal(remote.applied.length, 3);
  assert.equal(store.getChecklistDraft("aquatrace", "job_deborah_justice", "aquatrace-leak-detection")?.syncStatus, "synced");
  assert.equal(store.getPhotoCapture("aquatrace", "photo_2")?.syncStatus, "synced");
  assert.equal(store.getCachedJob("aquatrace", "job_deborah_justice")?.status, "completed");

  const conflicts = store.listConflicts("aquatrace");
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.field, "status");
  assert.equal(conflicts[0]?.resolution, "last_write_wins");
  assert.equal(conflicts[0]?.requiresReview, true);
});

test("M11 mobile rejects unassigned cached job writes", async () => {
  const store = new InMemoryMobileStore();
  const remote = new FakeRemoteAdapter(makeSchedule());
  const controller = new MobileOfflineController({
    store,
    remote,
    now: makeClock(),
    idFactory: makeIdFactory()
  });

  store.upsertCachedJob({
    ...makeSchedule().jobs[1],
    technicianIds: ["tech_catherine"]
  });

  assert.throws(() => controller.updateChecklist({
    tenantId: "aquatrace",
    jobId: "job_office_only",
    checklistId: "aquatrace-leak-detection",
    answers: { arrived: true },
    updatedBy: "tech_chris"
  }), /not assigned/);
});
