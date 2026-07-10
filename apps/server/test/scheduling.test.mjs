import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository
} from "@nexteam/core";
import { createSchedulingNexiTools } from "../dist/scheduling/nexiTools.js";
import { queueScheduleNotification } from "../dist/scheduling/notifications.js";
import { InMemorySchedulingRepository } from "../dist/scheduling/repository.js";
import { registerSchedulingRoutes } from "../dist/scheduling/routes.js";
import { detectConflicts, suggestSlots } from "../dist/scheduling/schedulingEngine.js";

function tenant() {
  return {
    id: "aquatrace",
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "companycam", email: "gmail_relay" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

function visit(overrides) {
  return {
    id: overrides.id,
    tenantId: "aquatrace",
    jobId: overrides.jobId ?? overrides.id,
    title: overrides.title,
    start: overrides.start,
    end: overrides.end,
    assignedTo: overrides.assignedTo ?? ["crew-1"],
    location: overrides.location,
    status: overrides.status ?? "scheduled"
  };
}

const fixedDriveProvider = {
  async estimateMinutes(origin, destination) {
    const key = `${origin.label}->${destination.label}`;
    return {
      "Bryson City cluster->Asheville add-on": 70,
      "Asheville add-on->Asheville afternoon": 8,
      "Asheville afternoon->Asheville add-on": 8
    }[key] ?? 30;
  }
};

test("suggestSlots prefers the least-drive non-conflicting slot", async () => {
  const existingVisits = [
    visit({
      id: "visit_morning",
      title: "Bryson City cluster",
      start: "2026-07-07T08:00:00.000Z",
      end: "2026-07-07T10:00:00.000Z",
      location: { label: "Bryson City cluster" }
    }),
    visit({
      id: "visit_afternoon",
      title: "Asheville afternoon",
      start: "2026-07-07T13:00:00.000Z",
      end: "2026-07-07T15:00:00.000Z",
      location: { label: "Asheville afternoon" }
    })
  ];

  const suggestions = await suggestSlots({
    tenantId: "aquatrace",
    jobId: "job_new",
    title: "Asheville add-on",
    location: { label: "Asheville add-on" },
    from: "2026-07-07T08:00:00.000Z",
    to: "2026-07-07T17:00:00.000Z",
    durationMinutes: 120,
    existingVisits
  }, fixedDriveProvider);

  assert.equal(suggestions[0].start, "2026-07-07T15:00:00.000Z");
  assert.equal(suggestions[0].driveMinutes, 8);
  assert.equal(suggestions[0].conflictCount, 0);
  assert.match(suggestions[0].reasoning.join(" "), /Drive from previous visit Asheville afternoon: 8 min/);
});

test("detectConflicts only flags overlapping visits for the same assigned crew", () => {
  const existingVisits = [
    visit({
      id: "same_crew",
      title: "Same crew overlap",
      start: "2026-07-07T09:00:00.000Z",
      end: "2026-07-07T11:00:00.000Z",
      assignedTo: ["crew-1"],
      location: { label: "One" }
    }),
    visit({
      id: "other_crew",
      title: "Other crew overlap",
      start: "2026-07-07T09:00:00.000Z",
      end: "2026-07-07T11:00:00.000Z",
      assignedTo: ["crew-2"],
      location: { label: "Two" }
    })
  ];

  const conflicts = detectConflicts(existingVisits, {
    start: "2026-07-07T10:00:00.000Z",
    end: "2026-07-07T12:00:00.000Z",
    assignedTo: ["crew-1"]
  });

  assert.deepEqual(conflicts.map((item) => item.id), ["same_crew"]);
});

test("bookVisit parks the visit and queues a notification instead of sending", async () => {
  const repository = new InMemorySchedulingRepository();
  const approvalRepository = new InMemoryApprovalQueueRepository();
  const approvalQueue = new ApprovalQueueService(approvalRepository);
  const bookVisit = createSchedulingNexiTools({ repository, approvalQueue })
    .find((tool) => tool.name === "bookVisit");

  const output = await bookVisit.handler(tenant(), {
    jobId: "job_queued",
    title: "Least-drive booking",
    location: { label: "Asheville add-on" },
    start: "2026-07-07T15:00:00.000Z",
    end: "2026-07-07T17:00:00.000Z",
    assignedTo: ["crew-1"],
    notifyTo: "client@example.com"
  });

  assert.equal(output.result.visit.status, "pending_approval");
  assert.equal(output.result.conflicts.length, 0);
  assert.equal(output.result.approval.kind, "email");
  assert.equal(output.result.approval.status, "pending");
  assert.equal(output.result.approval.execute.service, "scheduling");
  assert.equal(output.result.approval.execute.op, "sendBookingNotification");
  assert.equal(output.sources.every((source) => source.rail === "native"), true);

  const pending = await approvalQueue.listPending("aquatrace");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, output.result.approval.id);
});

test("whatsMyDay reads native visits for the requested technician", async () => {
  const repository = new InMemorySchedulingRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  await repository.saveVisit(visit({
    id: "visit_logan",
    title: "Logan morning route",
    start: "2026-07-08T09:00:00.000Z",
    end: "2026-07-08T11:00:00.000Z",
    assignedTo: ["logan"],
    location: { label: "Fair Play" }
  }));
  await repository.saveVisit(visit({
    id: "visit_chris",
    title: "Chris afternoon route",
    start: "2026-07-08T13:00:00.000Z",
    end: "2026-07-08T15:00:00.000Z",
    assignedTo: ["chris"],
    location: { label: "Seneca" }
  }));

  const whatsMyDay = createSchedulingNexiTools({ repository, approvalQueue })
    .find((tool) => tool.name === "whatsMyDay");
  const output = await whatsMyDay.handler(tenant(), {
    date: "2026-07-08",
    technicianId: "logan"
  });

  assert.deepEqual(output.result.visits.map((item) => item.id), ["visit_logan"]);
  assert.equal(output.sources[0].rail, "native");
});

test("calendar board overlays Jobber visits as read-only schedule cards", async () => {
  const repository = new InMemorySchedulingRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  await repository.saveVisit(visit({
    id: "native_visit",
    jobId: "native_job",
    title: "Native booked visit",
    start: "2026-07-08T09:00:00.000Z",
    end: "2026-07-08T11:00:00.000Z",
    assignedTo: ["logan"],
    location: { label: "Fair Play" }
  }));

  const app = express();
  app.use(express.json());
  registerSchedulingRoutes(app, {
    repository,
    approvalQueue,
    jobber: {
      isConfigured: () => true,
      async getJobs(range) {
        assert.equal(range.from, "2026-07-08T00:00:00.000Z");
        assert.equal(range.to, "2026-07-09T00:00:00.000Z");
        return [{
          id: "jobber_real_tomorrow",
          tenantId: "aquatrace",
          clientId: "client_rachel",
          status: "scheduled",
          title: "Rachel Payne - Swimming Pool Leak Detection Service",
          startAt: "2026-07-08T13:00:00.000Z",
          endAt: "2026-07-08T15:00:00.000Z",
          lineItems: [],
          totals: { subtotal: 0, tax: 0, total: 0 },
          externalIds: { jobber: "jobber_real_tomorrow" }
        }];
      }
    }
  });

  const server = app.listen(0);
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/scheduling/calendar?tenantId=aquatrace&from=2026-07-08T00%3A00%3A00.000Z&to=2026-07-09T00%3A00%3A00.000Z`);
    const body = await response.json();

    assert.equal(body.ok, true);
    assert.deepEqual(body.sourceCounts, { native: 1, jobber: 1 });
    assert.deepEqual(body.visits.map((item) => item.id), ["native_visit", "jobber_jobber_real_tomorrow"]);
    const jobberVisit = body.visits.find((item) => item.source === "jobber");
    assert.equal(jobberVisit.title, "Rachel Payne - Swimming Pool Leak Detection Service");
    assert.equal(jobberVisit.readOnly, true);
    assert.equal(jobberVisit.status, "scheduled");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("calendar board returns native visits when Jobber overlay is slow", async () => {
  const repository = new InMemorySchedulingRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  await repository.saveVisit(visit({
    id: "native_only",
    jobId: "native_job",
    title: "Native booked visit",
    start: "2026-07-08T09:00:00.000Z",
    end: "2026-07-08T11:00:00.000Z",
    assignedTo: ["logan"],
    location: { label: "Fair Play" }
  }));

  const app = express();
  app.use(express.json());
  registerSchedulingRoutes(app, {
    repository,
    approvalQueue,
    env: { SCHEDULE_JOBBER_OVERLAY_TIMEOUT_MS: "20" },
    jobber: {
      isConfigured: () => true,
      async getJobs() {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return [];
      }
    }
  });

  const server = app.listen(0);
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/scheduling/calendar?tenantId=aquatrace&from=2026-07-08T00%3A00%3A00.000Z&to=2026-07-09T00%3A00%3A00.000Z`);
    const body = await response.json();

    assert.equal(body.ok, true);
    assert.deepEqual(body.sourceCounts, { native: 1, jobber: 0 });
    assert.equal(body.visits[0].id, "native_only");
    assert.match(body.warnings[0], /Jobber overlay skipped after 20ms/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("reminder and on-my-way messages are approval queued, not sent", async () => {
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const scheduledVisit = visit({
    id: "visit_message",
    title: "Client arrival window",
    start: "2026-07-08T09:00:00.000Z",
    end: "2026-07-08T11:00:00.000Z",
    assignedTo: ["logan"],
    location: { label: "Fair Play" }
  });

  const reminder = await queueScheduleNotification({
    approvalQueue,
    tenantId: "aquatrace",
    visit: scheduledVisit,
    notificationKind: "reminder",
    channel: "sms",
    to: "+15555550123"
  });
  const onMyWay = await queueScheduleNotification({
    approvalQueue,
    tenantId: "aquatrace",
    visit: scheduledVisit,
    notificationKind: "on_my_way",
    channel: "sms",
    etaMinutes: 25,
    to: "+15555550123"
  });

  assert.equal(reminder.kind, "sms");
  assert.equal(reminder.status, "pending");
  assert.equal(reminder.execute.op, "sendVisitReminder");
  assert.equal(onMyWay.execute.op, "sendOnMyWayMessage");
  assert.equal(onMyWay.execute.args.etaMinutes, 25);

  const pending = await approvalQueue.listPending("aquatrace");
  assert.deepEqual(pending.map((item) => item.status), ["pending", "pending"]);
});
