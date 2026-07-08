import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryMobileStore, MobileOfflineController } from "@nexteam/mobile";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "receipts", "m11", "mobile-offline-first-receipt-current.json");

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
          geo: { latitude: 34.5121, longitude: -82.9853, accuracyMeters: 6 }
        },
        scheduledStart: "2026-07-07T14:00:00.000Z",
        scheduledEnd: "2026-07-07T17:00:00.000Z",
        status: "scheduled",
        technicianIds: ["tech_chris", "tech_logan"],
        jobAccessLinkIds: ["link_deborah_subcontractor"],
        checklistTemplateIds: ["aquatrace-leak-detection"],
        notes: "",
        updatedAt: "2026-07-07T12:50:00.000Z"
      },
      {
        tenantId: "aquatrace",
        jobId: "job_catherine_only",
        clientId: "client_catherine_only",
        clientName: "Catherine Route",
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

function makeClock() {
  const times = [
    "2026-07-07T13:00:00.000Z",
    "2026-07-07T13:01:00.000Z",
    "2026-07-07T13:02:00.000Z",
    "2026-07-07T13:03:00.000Z",
    "2026-07-07T13:04:00.000Z",
    "2026-07-07T13:05:00.000Z",
    "2026-07-07T13:06:00.000Z"
  ];
  let index = 0;
  return () => times[index++] ?? "2026-07-07T13:59:00.000Z";
}

function makeIdFactory() {
  let index = 0;
  return (prefix) => `${prefix}_${++index}`;
}

class ReceiptRemoteAdapter {
  constructor(schedule) {
    this.schedule = schedule;
    this.applied = [];
    this.remoteJobs = new Map(schedule.jobs.map((job) => [job.jobId, { ...job }]));
  }

  async fetchDaySchedule(input) {
    if (input.tenantId !== this.schedule.tenantId || input.date !== this.schedule.date) {
      throw new Error("receipt schedule mismatch");
    }
    return this.schedule;
  }

  moveRemoteJobBeforeSync(jobId) {
    const current = this.remoteJobs.get(jobId);
    if (!current) throw new Error("missing remote job");
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
    if (!current) throw new Error("missing remote job");
    const conflicts =
      operation.type === "jobStatus.update" &&
      operation.baseRemoteUpdatedAt &&
      current.updatedAt > operation.baseRemoteUpdatedAt
        ? [{
            field: "status",
            localValue: operation.payload.status,
            remoteValue: current.status,
            remoteUpdatedAt: current.updatedAt
          }]
        : [];

    if (operation.type === "jobStatus.update") {
      this.remoteJobs.set(operation.jobId, {
        ...current,
        status: operation.payload.status,
        notes: operation.payload.notes,
        updatedAt: operation.localUpdatedAt
      });
    }

    return {
      remoteUpdatedAt: operation.localUpdatedAt,
      ...(operation.type === "photo.upload"
        ? { remoteUrl: `gs://nexteam-studio.firebasestorage.app/${operation.tenantId}/field-photos/${operation.payload.localPhotoId}.jpg` }
        : {}),
      conflicts
    };
  }
}

const store = new InMemoryMobileStore();
const remote = new ReceiptRemoteAdapter(makeSchedule());
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

controller.setOnline(false);
const offlineNexi = controller.getNexiConnectionState();
const checklist = controller.updateChecklist({
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
  }
});
const closed = controller.closeOutJob({
  tenantId: "aquatrace",
  jobId: "job_deborah_justice",
  status: "completed",
  notes: "Checklist complete and photos captured offline.",
  updatedBy: "tech_chris"
});
const offlineSync = await controller.syncNow("aquatrace");

remote.moveRemoteJobBeforeSync("job_deborah_justice");
controller.setOnline(true);
const sync = await controller.syncNow("aquatrace");

const receipt = {
  ok: true,
  module: "M11 Mobile",
  generatedAt: new Date().toISOString(),
  scope: "offline-first core plus Expo/API shell",
  expoShell: {
    appJson: "apps/mobile/app.json",
    entry: "apps/mobile/app/index.tsx",
    apiClient: "apps/mobile/src/native/apiClient.ts"
  },
  serverRail: {
    routes: "apps/server/src/mobile/routes.ts",
    accessPolicy: "apps/server/src/mobile/access.ts",
    repository: "apps/server/src/mobile/repository.ts"
  },
  airplaneModeFlow: {
    schedulePreloaded: schedule.jobs.map((job) => ({
      jobId: job.jobId,
      clientName: job.clientName,
      technicianIds: job.technicianIds
    })),
    unassignedJobCached: store.getCachedJob("aquatrace", "job_catherine_only") !== null,
    offlineNexi,
    checklist: {
      syncStatus: checklist.syncStatus,
      answers: checklist.answers
    },
    photo: {
      syncStatus: photo.syncStatus,
      exif: photo.exif,
      nearestClientMatch: photo.nearestClientMatch
    },
    closeOut: {
      status: closed.status,
      notes: closed.notes
    },
    pendingBeforeReconnect: store.listPendingOperations("aquatrace").length,
    offlineSync,
    reconnectSync: sync,
    remoteOperationsApplied: remote.applied.map((operation) => ({
      opId: operation.opId,
      type: operation.type,
      actorTenantUserId: operation.actorTenantUserId
    })),
    conflicts: store.listConflicts("aquatrace")
  },
  hardLimits: {
    outboundSends: "none",
    productionDeploy: "none",
    jobberWrites: "none",
    companyCamWrites: "none"
  },
  realDeviceReceipt: {
    status: "blocked",
    exactBlocker: "No real phone is connected to this Codex runtime; Expo shell is built, but the Bible-required phone video/airplane-mode device proof still needs a physical device session."
  }
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, receipt: OUT, sync: receipt.airplaneModeFlow.reconnectSync }, null, 2));
