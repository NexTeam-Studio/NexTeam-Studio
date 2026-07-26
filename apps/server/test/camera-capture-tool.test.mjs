import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository,
  InMemoryEventBus
} from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { JobLifecycleService } from "../dist/crm/jobLifecycle.js";
import { MemoryJobLifecycleRepository } from "../dist/crm/jobLifecycleRepository.js";
import { InMemoryNotificationStateRepository } from "../dist/crm/notificationStateRepository.js";
import { OperationsHubService } from "../dist/crm/operationsHub.js";
import { registerCrmRoutes } from "../dist/crm/routes.js";
import { createFieldDocsTools } from "../dist/fielddocs/nexiTools.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { registerFieldDocsRoutes } from "../dist/fielddocs/routes.js";
import { runExplicitLocalToolLoop } from "../dist/nexi/nexiService.js";
import { InMemorySchedulingRepository } from "../dist/scheduling/repository.js";

const tenantId = "aquatrace";
const serial = { concurrency: false };

function tenant() {
  return {
    id: tenantId,
    name: "Aquatrace",
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "native", email: "gmail_relay" },
    approval: {},
    timezone: "America/New_York",
    plan: "suite"
  };
}

function access(role, tenantUserId) {
  return {
    tenantId,
    tenantUserId,
    role,
    accessKind: "internal"
  };
}

function platformRepository() {
  return {
    async listTenantUsers() {
      return [
        { id: "owner_1", tenantId, displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" },
        { id: "office_1", tenantId, displayName: "Catherine", role: "OFFICE_ADMIN", active: true, email: "office@example.test" },
        { id: "tech_1", tenantId, displayName: "Logan", role: "TECHNICIAN", active: true, email: "logan@example.test" },
        { id: "tech_2", tenantId, displayName: "Mason", role: "TECHNICIAN", active: true, email: "mason@example.test" }
      ];
    }
  };
}

function seedCrmRecords() {
  return {
    clients: [{
      id: "client_1",
      tenantId,
      name: "Deborah Justice",
      emails: ["deborah@example.test"],
      phones: ["8645551212"],
      tags: [],
      consent: { email: true, sms: true }
    }],
    properties: [{
      id: "property_1",
      tenantId,
      clientId: "client_1",
      address: { street1: "181 Isbell Road", city: "Fair Play", province: "SC", postalCode: "29643", country: "US" },
      access: { gateCode: "4421", accessNotes: "Use the side gate." },
      assets: []
    }],
    jobs: [{
      id: "job_1",
      tenantId,
      clientId: "client_1",
      propertyId: "property_1",
      status: "Unscheduled",
      title: "Leak detection",
      lineItems: [],
      totals: { subtotal: 0, tax: 0, total: 0 }
    }]
  };
}

async function startServer({ crmRepository, mediaRepository, schedulingRepository }) {
  const adapter = new NativeAdapter(crmRepository, tenantId);
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter));
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: crmRepository,
    platformRepository: platformRepository(),
    env: { TENANT_ID: tenantId, NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  registerFieldDocsRoutes(app, {
    repository: mediaRepository,
    crmRepository,
    schedulingRepository,
    platformRepository: platformRepository(),
    env: { TENANT_ID: tenantId, NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return {
    server,
    base: `http://127.0.0.1:${address.port}`
  };
}

async function stopServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function createCaptureBatch(base) {
  const response = await fetch(`${base}/api/fielddocs/capture-batches`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenantId })
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  return body.batch;
}

async function uploadCapture(base, batchId, filename, gps = { lat: 34.1, lng: -82.9 }) {
  const response = await fetch(`${base}/api/fielddocs/uploads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenantId,
      captureBatchId: batchId,
      filename,
      mime: "image/jpeg",
      gps,
      tags: ["nexcam-capture-tool"]
    })
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  return body.media;
}

test("multi-shot capture batches stay draft until routed, materialize request images, and keep later uploads auto-scoped", serial, async () => {
  const crmRepository = new MemoryNativeCrmRepository();
  const mediaRepository = new MemoryMediaRepository();
  const schedulingRepository = new InMemorySchedulingRepository();
  const { server, base } = await startServer({ crmRepository, mediaRepository, schedulingRepository });

  try {
    const batch = await createCaptureBatch(base);
    const firstMedia = await uploadCapture(base, batch.id, "request-route-1.jpg");
    const secondMedia = await uploadCapture(base, batch.id, "request-route-2.jpg", { lat: 34.18, lng: -82.86 });

    const draftBatch = await mediaRepository.getCaptureBatch(tenantId, batch.id);
    assert.equal(draftBatch?.status, "draft");
    assert.deepEqual(draftBatch?.mediaIds, [firstMedia.id, secondMedia.id]);
    assert.equal(draftBatch?.originGps?.lat, 34.1);
    assert.equal(draftBatch?.latestGps?.lat, 34.18);

    const formsResponse = await fetch(`${base}/api/crm/request-forms?tenantId=${tenantId}`);
    const formsBody = await formsResponse.json();
    assert.equal(formsBody.ok, true);

    const requestResponse = await fetch(`${base}/api/crm/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        source: "office_new_client",
        formId: formsBody.forms[0].id,
        formSlug: formsBody.forms[0].slug,
        fieldValues: [
          { key: "client_name", value: "Logan Sears" },
          { key: "email", value: "logan@example.test" },
          { key: "phone", value: "8645551212" },
          { key: "property_street1", value: "102 Kate Lane" },
          { key: "property_city", value: "Fair Play" },
          { key: "property_province", value: "SC" },
          { key: "property_postal_code", value: "29643" },
          { key: "pool_configuration", value: "pool_and_spa" },
          { key: "gate_code", value: "4421" },
          { key: "pet_present", value: true },
          { key: "pet_name", value: "Scout" },
          { key: "issue_summary", value: "Water loss around the skimmer throat." }
        ]
      })
    });
    const requestBody = await requestResponse.json();
    assert.equal(requestBody.ok, true);

    const assignResponse = await fetch(`${base}/api/fielddocs/capture-batches/${encodeURIComponent(batch.id)}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        mode: "request",
        requestId: requestBody.request.id
      })
    });
    const assignBody = await assignResponse.json();
    assert.equal(assignBody.ok, true);
    assert.equal(assignBody.batch.assignmentMode, "request");
    assert.equal(assignBody.batch.status, "assigned");
    assert.equal(assignBody.clientId?.startsWith("client_"), true);

    const requestAfterAssign = await crmRepository.getRequest(tenantId, requestBody.request.id);
    assert.deepEqual(requestAfterAssign?.intake.fieldIndex.request_images, [firstMedia.id, secondMedia.id]);
    const firstMediaSaved = await mediaRepository.getMedia(tenantId, firstMedia.id);
    assert.equal(firstMediaSaved?.clientId, assignBody.clientId);
    const secondMediaSavedBeforeContinuation = await mediaRepository.getMedia(tenantId, secondMedia.id);
    assert.equal(secondMediaSavedBeforeContinuation?.clientId, assignBody.clientId);

    const thirdMedia = await uploadCapture(base, batch.id, "request-route-3.jpg", { lat: 34.2, lng: -82.8 });
    const thirdMediaSaved = await mediaRepository.getMedia(tenantId, thirdMedia.id);
    assert.equal(thirdMediaSaved?.clientId, assignBody.clientId);

    const requestAfterSecondUpload = await crmRepository.getRequest(tenantId, requestBody.request.id);
    assert.deepEqual(requestAfterSecondUpload?.intake.fieldIndex.request_images, [firstMedia.id, secondMedia.id, thirdMedia.id]);

    const updatedBatch = await mediaRepository.getCaptureBatch(tenantId, batch.id);
    assert.equal(updatedBatch?.assignmentMode, "request");
    assert.equal(updatedBatch?.assignedRequestId, requestBody.request.id);
    assert.deepEqual(updatedBatch?.mediaIds, [firstMedia.id, secondMedia.id, thirdMedia.id]);
  } finally {
    await stopServer(server);
  }
});

test("existing-client capture routing supports decide-later inbox, target lookup, mixed client rail, and later move-to-job", serial, async () => {
  const crmRepository = new MemoryNativeCrmRepository(seedCrmRecords());
  const mediaRepository = new MemoryMediaRepository();
  const schedulingRepository = new InMemorySchedulingRepository();
  await schedulingRepository.saveVisit({
    id: "visit_1",
    tenantId,
    jobId: "job_1",
    title: "Leak detection visit",
    start: "2026-07-18T13:00:00.000Z",
    end: "2026-07-18T15:00:00.000Z",
    assignedTo: ["tech_1"],
    status: "scheduled"
  });
  const { server, base } = await startServer({ crmRepository, mediaRepository, schedulingRepository });

  try {
    const batch = await createCaptureBatch(base);
    const firstMedia = await uploadCapture(base, batch.id, "existing-client-1.jpg", { lat: 34.15, lng: -82.82 });

    const decideLaterResponse = await fetch(`${base}/api/fielddocs/capture-batches/${encodeURIComponent(batch.id)}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId, mode: "decide_later" })
    });
    const decideLaterBody = await decideLaterResponse.json();
    assert.equal(decideLaterBody.ok, true);
    assert.equal(decideLaterBody.batch.status, "unassigned");
    assert.equal(decideLaterBody.batch.originGps?.lat, 34.15);
    assert.equal(decideLaterBody.batch.latestGps?.lat, 34.15);

    const inboxResponse = await fetch(`${base}/api/fielddocs/capture-batches?tenantId=${tenantId}&status=unassigned&limit=10`);
    const inboxBody = await inboxResponse.json();
    assert.equal(inboxBody.ok, true);
    assert.equal(inboxBody.batches.length, 1);
    assert.equal(inboxBody.batches[0].id, batch.id);

    const targetsResponse = await fetch(`${base}/api/fielddocs/clients/client_1/targets?tenantId=${tenantId}`);
    const targetsBody = await targetsResponse.json();
    assert.equal(targetsBody.ok, true);
    assert.equal(targetsBody.jobs.length, 1);
    assert.equal(targetsBody.visits.length, 1);

    const assignExistingResponse = await fetch(`${base}/api/fielddocs/capture-batches/${encodeURIComponent(batch.id)}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId, mode: "existing_client", clientId: "client_1" })
    });
    const assignExistingBody = await assignExistingResponse.json();
    assert.equal(assignExistingBody.ok, true);
    assert.equal(assignExistingBody.batch.assignmentMode, "existing_client");
    assert.equal(assignExistingBody.batch.assignedClientId, "client_1");

    const inboxAfterAssignResponse = await fetch(`${base}/api/fielddocs/capture-batches?tenantId=${tenantId}&status=unassigned&limit=10`);
    const inboxAfterAssignBody = await inboxAfterAssignResponse.json();
    assert.equal(inboxAfterAssignBody.ok, true);
    assert.equal(inboxAfterAssignBody.batches.length, 0);

    const secondMedia = await uploadCapture(base, batch.id, "existing-client-2.jpg", { lat: 34.16, lng: -82.81 });
    const secondSavedBeforeMove = await mediaRepository.getMedia(tenantId, secondMedia.id);
    assert.equal(secondSavedBeforeMove?.clientId, "client_1");
    assert.equal(secondSavedBeforeMove?.jobId, undefined);
    assert.equal(secondSavedBeforeMove?.visitId, undefined);

    const moveResponse = await fetch(`${base}/api/fielddocs/media/${encodeURIComponent(secondMedia.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        clientId: "client_1",
        jobId: "job_1",
        visitId: "visit_1"
      })
    });
    const moveBody = await moveResponse.json();
    assert.equal(moveBody.ok, true);
    assert.equal(moveBody.media.jobId, "job_1");
    assert.equal(moveBody.media.visitId, "visit_1");
    assert.equal(moveBody.media.propertyId, "property_1");

    const clientMediaResponse = await fetch(`${base}/api/fielddocs/media?tenantId=${tenantId}&clientId=client_1&limit=10`);
    const clientMediaBody = await clientMediaResponse.json();
    assert.equal(clientMediaBody.ok, true);
    assert.equal(clientMediaBody.media.length, 2);
    assert.equal(clientMediaBody.media.some((item) => item.id === firstMedia.id && !item.jobId && !item.visitId), true);
    assert.equal(clientMediaBody.media.some((item) => item.id === secondMedia.id && item.jobId === "job_1" && item.visitId === "visit_1"), true);
  } finally {
    await stopServer(server);
  }
});

test("same-day decide-later sessions stay as separate batches with their own GPS anchor", serial, async () => {
  const crmRepository = new MemoryNativeCrmRepository(seedCrmRecords());
  const mediaRepository = new MemoryMediaRepository();
  const schedulingRepository = new InMemorySchedulingRepository();
  const { server, base } = await startServer({ crmRepository, mediaRepository, schedulingRepository });

  try {
    const firstBatch = await createCaptureBatch(base);
    const secondBatch = await createCaptureBatch(base);
    const firstMedia = await uploadCapture(base, firstBatch.id, "decide-later-1.jpg", { lat: 34.0101, lng: -82.0101 });
    const secondMedia = await uploadCapture(base, secondBatch.id, "decide-later-2.jpg", { lat: 34.9909, lng: -82.9909 });

    for (const batchId of [firstBatch.id, secondBatch.id]) {
      const response = await fetch(`${base}/api/fielddocs/capture-batches/${encodeURIComponent(batchId)}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId, mode: "decide_later" })
      });
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.batch.status, "unassigned");
    }

    const inboxResponse = await fetch(`${base}/api/fielddocs/capture-batches?tenantId=${tenantId}&status=unassigned&limit=10`);
    const inboxBody = await inboxResponse.json();
    assert.equal(inboxBody.ok, true);
    assert.equal(inboxBody.batches.length, 2);
    assert.equal(inboxBody.batches.some((batch) => batch.id === firstBatch.id && batch.latestGps?.lat === 34.0101 && batch.media.some((media) => media.id === firstMedia.id)), true);
    assert.equal(inboxBody.batches.some((batch) => batch.id === secondBatch.id && batch.latestGps?.lat === 34.9909 && batch.media.some((media) => media.id === secondMedia.id)), true);

    const firstSaved = await mediaRepository.getCaptureBatch(tenantId, firstBatch.id);
    const secondSaved = await mediaRepository.getCaptureBatch(tenantId, secondBatch.id);
    assert.notEqual(firstSaved?.id, secondSaved?.id);
    assert.equal(firstSaved?.status, "unassigned");
    assert.equal(secondSaved?.status, "unassigned");
    assert.equal(firstSaved?.originGps?.lat, 34.0101);
    assert.equal(secondSaved?.originGps?.lat, 34.9909);
    assert.equal(firstSaved?.latestGps?.lat, 34.0101);
    assert.equal(secondSaved?.latestGps?.lat, 34.9909);
  } finally {
    await stopServer(server);
  }
});

test("reopened unassigned batches keep the original GPS anchor while tracking the newest capture location", serial, async () => {
  const crmRepository = new MemoryNativeCrmRepository(seedCrmRecords());
  const mediaRepository = new MemoryMediaRepository();
  const schedulingRepository = new InMemorySchedulingRepository();
  const { server, base } = await startServer({ crmRepository, mediaRepository, schedulingRepository });

  try {
    const batch = await createCaptureBatch(base);
    const firstMedia = await uploadCapture(base, batch.id, "reopen-anchor-1.jpg", { lat: 34.2001, lng: -82.2001 });

    const parkResponse = await fetch(`${base}/api/fielddocs/capture-batches/${encodeURIComponent(batch.id)}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId, mode: "decide_later" })
    });
    const parkBody = await parkResponse.json();
    assert.equal(parkBody.ok, true);
    assert.equal(parkBody.batch.status, "unassigned");
    assert.equal(parkBody.batch.originGps?.lat, 34.2001);
    assert.equal(parkBody.batch.latestGps?.lat, 34.2001);

    const secondMedia = await uploadCapture(base, batch.id, "reopen-anchor-2.jpg", { lat: 34.2888, lng: -82.3111 });
    const reopenedBatch = await mediaRepository.getCaptureBatch(tenantId, batch.id);
    assert.deepEqual(reopenedBatch?.mediaIds, [firstMedia.id, secondMedia.id]);
    assert.equal(reopenedBatch?.originGps?.lat, 34.2001);
    assert.equal(reopenedBatch?.originGps?.lng, -82.2001);
    assert.equal(reopenedBatch?.latestGps?.lat, 34.2888);
    assert.equal(reopenedBatch?.latestGps?.lng, -82.3111);

    const inboxResponse = await fetch(`${base}/api/fielddocs/capture-batches?tenantId=${tenantId}&status=unassigned&limit=10`);
    const inboxBody = await inboxResponse.json();
    assert.equal(inboxBody.ok, true);
    assert.equal(inboxBody.batches.length, 1);
    assert.equal(inboxBody.batches[0].id, batch.id);
    assert.equal(inboxBody.batches[0].originGps?.lat, 34.2001);
    assert.equal(inboxBody.batches[0].latestGps?.lat, 34.2888);
  } finally {
    await stopServer(server);
  }
});

test("unassigned batch Nexi tools and Home queue stay tenant-wide for office and scoped for technicians", serial, async () => {
  const crmRepository = new MemoryNativeCrmRepository(seedCrmRecords());
  const mediaRepository = new MemoryMediaRepository([], [], [], [], [], [], [], [], [
    {
      id: "capture_batch_tech_1",
      tenantId,
      status: "unassigned",
      createdAt: "2026-07-18T12:00:00.000Z",
      updatedAt: "2026-07-18T12:05:00.000Z",
      createdBy: "tech_1",
      mediaIds: [],
      latestGps: { lat: 34.11, lng: -82.71 }
    },
    {
      id: "capture_batch_tech_2",
      tenantId,
      status: "unassigned",
      createdAt: "2026-07-18T12:10:00.000Z",
      updatedAt: "2026-07-18T12:15:00.000Z",
      createdBy: "tech_2",
      mediaIds: []
    }
  ]);
  const ownerTools = createFieldDocsTools({
    mediaRepository,
    crmRepository,
    viewerRole: "OWNER",
    viewerUserId: "owner_1"
  });
  const techTools = createFieldDocsTools({
    mediaRepository,
    crmRepository,
    viewerRole: "TECHNICIAN",
    viewerUserId: "tech_1"
  });
  const ownerListTool = ownerTools.find((tool) => tool.name === "listUnassignedPhotoBatches");
  const techListTool = techTools.find((tool) => tool.name === "listUnassignedPhotoBatches");
  const techAssignTool = techTools.find((tool) => tool.name === "assignPhotoBatch");
  assert.ok(ownerListTool);
  assert.ok(techListTool);
  assert.ok(techAssignTool);

  const ownerList = await ownerListTool.handler(tenant(), { limit: 10 });
  const techList = await techListTool.handler(tenant(), { limit: 10 });
  assert.equal(ownerList.result.batches.length, 2);
  assert.equal(techList.result.batches.length, 1);
  assert.equal(techList.result.batches[0].id, "capture_batch_tech_1");

  await assert.rejects(
    techAssignTool.handler(tenant(), { batchId: "capture_batch_tech_2", clientName: "Deborah Justice", mode: "existing_client" }),
    /outside your role scope/i
  );

  const loop = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "show me the unassigned photo batches" }],
    tools: ownerTools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(loop.toolRuns[0]?.name, "listUnassignedPhotoBatches");
  assert.match(loop.answer, /2 unassigned NexCam capture batches/i);

  const schedulingRepository = new InMemorySchedulingRepository();
  const lifecycleRepository = new MemoryJobLifecycleRepository();
  const notificationStateRepository = new InMemoryNotificationStateRepository();
  const eventBus = new InMemoryEventBus();
  const jobLifecycleService = new JobLifecycleService({
    crmRepository,
    schedulingRepository,
    lifecycleRepository,
    eventBus
  });
  const operationsHubService = new OperationsHubService({
    crmRepository,
    schedulingRepository,
    lifecycleRepository,
    jobLifecycleService,
    eventBus,
    notificationStateRepository,
    mediaRepository,
    platformRepository: platformRepository()
  });

  const ownerHome = await operationsHubService.getHomeSnapshot({
    access: access("OWNER", "owner_1"),
    referenceTime: "2026-07-18T16:00:00.000Z"
  });
  const techHome = await operationsHubService.getHomeSnapshot({
    access: access("TECHNICIAN", "tech_1"),
    referenceTime: "2026-07-18T16:00:00.000Z"
  });

  assert.equal(ownerHome.queues.find((queue) => queue.key === "unassigned-photo-batches")?.count, 2);
  assert.equal(techHome.queues.find((queue) => queue.key === "unassigned-photo-batches")?.count, 1);
  assert.equal(techHome.queues.find((queue) => queue.key === "unassigned-photo-batches")?.label, "My unassigned photo batches");
  assert.equal(techHome.queues.find((queue) => queue.key === "unassigned-photo-batches")?.target.module, "capture");
});

test("local Nexi routes assign an unassigned capture batch to an existing client by exact name", serial, async () => {
  const crmRepository = new MemoryNativeCrmRepository(seedCrmRecords());
  const mediaRepository = new MemoryMediaRepository(
    [{
      id: "media_batch_assign_1",
      tenantId,
      type: "photo",
      storageRef: "native://media_batch_assign_1.jpg",
      filename: "media_batch_assign_1.jpg",
      mime: "image/jpeg",
      createdAt: "2026-07-18T14:00:00.000Z",
      exif: {
        ts: "2026-07-18T14:00:00.000Z",
        gps: { lat: 34.2222, lng: -82.3333 }
      },
      aiCaption: "Equipment pad leak photo",
      aiTags: ["equipment_pad", "leak"],
      manualTags: [],
      capturedBy: "tech_1"
    }],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [{
      id: "capture_batch_assign_1",
      tenantId,
      status: "unassigned",
      createdAt: "2026-07-18T14:00:00.000Z",
      updatedAt: "2026-07-18T14:05:00.000Z",
      createdBy: "tech_1",
      mediaIds: ["media_batch_assign_1"],
      latestGps: { lat: 34.2222, lng: -82.3333 }
    }]
  );
  const tools = createFieldDocsTools({
    mediaRepository,
    crmRepository,
    viewerRole: "OWNER",
    viewerUserId: "owner_1"
  });

  const listLoop = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "show me the unassigned photo batches" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });
  assert.equal(listLoop.toolRuns[0]?.name, "listUnassignedPhotoBatches");
  assert.match(listLoop.answer, /first batch is capture_batch_assign_1/i);

  const assignLoop = await runExplicitLocalToolLoop({
    tenant: tenant(),
    system: "Use tools.",
    messages: [{ role: "user", content: "assign capture batch capture_batch_assign_1 to client Deborah Justice" }],
    tools,
    routeActionName: "/api/nexi/message",
    taskType: "job_desk_answer",
    env: {}
  });

  assert.equal(assignLoop.toolRuns[0]?.name, "assignPhotoBatch");
  assert.match(assignLoop.answer, /attached capture batch capture_batch_assign_1 to client client_1/i);

  const assignedBatch = await mediaRepository.getCaptureBatch(tenantId, "capture_batch_assign_1");
  const assignedMedia = await mediaRepository.getMedia(tenantId, "media_batch_assign_1");
  assert.equal(assignedBatch?.status, "assigned");
  assert.equal(assignedBatch?.assignedClientId, "client_1");
  assert.equal(assignedBatch?.assignmentMode, "existing_client");
  assert.equal(assignedMedia?.clientId, "client_1");
});
