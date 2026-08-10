import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  ApprovalQueueService,
  InMemoryApprovalQueueRepository,
  mediaSchema
} from "@nexteam/core";
import { MemoryNativeCrmRepository } from "@nexteam/providers";
import { FieldDocsService } from "../dist/fielddocs/fieldDocsService.js";
import { MemoryMediaRepository } from "../dist/fielddocs/mediaRepository.js";
import { registerFieldDocsRoutes } from "../dist/fielddocs/routes.js";
import { InMemoryMobileRepository } from "../dist/mobile/repository.js";
import { registerMobileRoutes } from "../dist/mobile/routes.js";
import { InMemorySchedulingRepository } from "../dist/scheduling/repository.js";

const LEAK_TEMPLATE_ID = "leak_detection_checklist_v1";

function makeUsageLog() {
  const records = [];
  return {
    records,
    async write(record) {
      records.push(record);
    }
  };
}

async function makeServer(options = {}) {
  const tenantId = "aquatrace";
  const crmRepository = new MemoryNativeCrmRepository({
    clients: [
      {
        id: "client_1",
        tenantId,
        name: "Deborah Justice",
        company: "Justice Pools",
        emails: ["deborah@example.test"],
        phones: ["8645551212"],
        tags: [],
        consent: { email: true, sms: true }
      },
      {
        id: "client_2",
        tenantId,
        name: "Nearby Neighbor",
        company: "Neighbor Pool",
        emails: [],
        phones: [],
        tags: [],
        consent: { email: false, sms: false }
      }
    ],
    properties: [
      {
        id: "property_1",
        tenantId,
        clientId: "client_1",
        siteName: "Main residence",
        label: "181 Isbell Road",
        address: {
          street1: "181 Isbell Road",
          city: "Fair Play",
          province: "SC",
          postalCode: "29643",
          country: "US"
        },
        access: {
          gateCode: "4411",
          accessNotes: "Use the left gate and latch it back."
        },
        geo: {
          lat: 34.5121,
          lng: -82.9853
        },
        assets: []
      },
      {
        id: "property_2",
        tenantId,
        clientId: "client_2",
        siteName: "Neighbor property",
        label: "183 Isbell Road",
        address: {
          street1: "183 Isbell Road",
          city: "Fair Play",
          province: "SC",
          postalCode: "29643",
          country: "US"
        },
        geo: {
          lat: 34.5124,
          lng: -82.9851
        },
        assets: []
      }
    ],
    jobs: [
      {
        id: "job_1",
        tenantId,
        clientId: "client_1",
        propertyId: "property_1",
        status: "Unscheduled",
        title: "Leak detection",
        lineItems: [{
          id: "line_1",
          source: "custom",
          code: "LEAK",
          name: "Leak detection",
          description: "Leak detection",
          quantity: 1,
          unitPrice: 795,
          total: 795
        }],
        totals: {
          subtotal: 795,
          tax: 0,
          total: 795
        },
        intake: {
          narrative: "Customer reports daily water loss.",
          fieldValues: [],
          fieldIndex: {
            pet_present: true,
            pet_name: "Buddy",
            pool_type: "Vinyl"
          }
        }
      }
    ]
  });
  const schedulingRepository = new InMemorySchedulingRepository();
  await schedulingRepository.saveVisit({
    id: "visit_1",
    tenantId,
    jobId: "job_1",
    start: "2026-07-20T14:00:00.000Z",
    end: "2026-07-20T16:00:00.000Z",
    assignedTo: ["local-technician"],
    checklistRef: "aquatrace-leak-detection",
    title: "Leak detection visit",
    location: {
      label: "181 Isbell Road",
      address: {
        street1: "181 Isbell Road",
        city: "Fair Play",
        province: "SC",
        postalCode: "29643",
        country: "US"
      },
      geo: {
        lat: 34.5121,
        lng: -82.9853
      }
    },
    status: "scheduled",
    details: "Initial site visit"
  });
  await schedulingRepository.saveVisit({
    id: "visit_2",
    tenantId,
    jobId: "job_1",
    start: "2026-07-20T17:00:00.000Z",
    end: "2026-07-20T18:00:00.000Z",
    assignedTo: ["local-technician-2"],
    checklistRef: "aquatrace-leak-detection",
    title: "Different tech visit",
    location: {
      label: "181 Isbell Road",
      address: {
        street1: "181 Isbell Road",
        city: "Fair Play",
        province: "SC",
        postalCode: "29643",
        country: "US"
      }
    },
    status: "scheduled",
    details: "Should stay hidden from Chris"
  });

  const mediaRepository = new MemoryMediaRepository(
    [
      mediaSchema.parse({
        id: "media_before_1",
        tenantId,
        clientId: "client_1",
        jobId: "job_1",
        visitId: "visit_1",
        propertyId: "property_1",
        type: "photo",
        storageRef: "gs://test-bucket/aquatrace/media_before_1.jpg",
        aiTags: ["before", "skimmer"],
        aiCaption: "Before photo at the skimmer throat.",
        comments: [
          {
            id: "comment_1",
            text: "Voice note: skimmer crack confirmed.",
            createdAt: "2026-07-20T13:56:00.000Z",
            author: "local-technician"
          }
        ],
        exif: {
          ts: "2026-07-20T13:55:00.000Z",
          gps: {
            lat: 34.5121,
            lng: -82.9853
          }
        }
      })
    ],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [
      {
        id: "batch_visible_1",
        tenantId,
        status: "unassigned",
        createdAt: "2026-07-20T13:50:00.000Z",
        updatedAt: "2026-07-20T13:55:00.000Z",
        createdBy: "local-technician",
        mediaIds: []
      },
      {
        id: "batch_hidden_1",
        tenantId,
        status: "unassigned",
        createdAt: "2026-07-20T13:51:00.000Z",
        updatedAt: "2026-07-20T13:56:00.000Z",
        createdBy: "local-technician-2",
        mediaIds: []
      }
    ]
  );
  const fieldDocsService = new FieldDocsService({ mediaRepository, crmRepository });
  await fieldDocsService.createChecklist({
    tenantId,
    templateId: LEAK_TEMPLATE_ID,
    propertyId: "property_1",
    jobId: "job_1",
    visitId: "visit_1"
  });

  const repository = new InMemoryMobileRepository();
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository());
  const usageLog = makeUsageLog();
  let fetchCalled = false;
  const platformRepository = {
    async getTenantBranding() {
      return {
        tenantId,
        displayName: "Aquatrace",
        logo: { url: "https://example.test/aquatrace-logo.png" }
      };
    }
  };
  const app = express();
  app.use(express.json({ limit: "8mb" }));
  registerMobileRoutes(app, {
    repository,
    approvalQueue,
    crmRepository,
    schedulingRepository,
    mediaRepository,
    fieldDocsService,
    platformRepository,
    usageLog,
    transcriptionFetch: async (...args) => {
      fetchCalled = true;
      if (options.transcriptionFetch) {
        return options.transcriptionFetch(...args);
      }
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ text: "Transcribed mobile narration." });
        }
      };
    },
    env: {
      TENANT_ID: tenantId,
      NEXI_FIREBASE_AUTH_REQUIRED: "false",
      OPENAI_API_KEY: "test_key",
      M11_TRANSCRIPTION_ENABLED: "true",
      M11_TRANSCRIPTION_CAP_USD: options.transcriptionCapUsd ?? "5"
    }
  });
  registerFieldDocsRoutes(app, {
    repository: mediaRepository,
    crmRepository,
    schedulingRepository,
    platformRepository,
    usageLog,
    env: {
      TENANT_ID: tenantId,
      NEXI_FIREBASE_AUTH_REQUIRED: "false"
    }
  });

  return {
    app,
    usageLog,
    getFetchCalled: () => fetchCalled
  };
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

function localProfileHeaders(profileId) {
  return {
    "x-nexteam-local-profile": profileId
  };
}

test("M11 mobile session bootstrap returns tenant branding plus the reusable local staff profile registry", async () => {
  const { app } = await makeServer();
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/mobile/session?tenantId=aquatrace`, {
      headers: localProfileHeaders("local-technician")
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.access.tenantUserId, "local-technician");
    assert.equal(body.access.role, "TECHNICIAN");
    assert.equal(body.branding.displayName, "Aquatrace");
    assert.equal(body.branding.logoUrl, "https://example.test/aquatrace-logo.png");
    assert.equal(body.authRequired, false);
    assert.equal(body.firebaseConfigured, false);
    assert.equal(body.localProfiles.some((profile) => profile.id === "local-owner"), true);
    assert.equal(body.localProfiles.some((profile) => profile.id === "local-technician"), true);
  });
});

test("M11 day board stays technician-scoped while exposing GPS suggestions, gate notes, and visible queue state", async () => {
  const { app } = await makeServer();
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/mobile/day-board?tenantId=aquatrace&date=2026-07-20`, {
      headers: localProfileHeaders("local-technician")
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.board.visits.length, 1);
    assert.equal(body.board.visits[0].id, "visit_1");
    assert.equal(body.board.visits[0].notes.gateCode, "4411");
    assert.equal(body.board.visits[0].notes.petName, "Buddy");
    assert.equal(body.board.visits[0].notes.poolType, "Vinyl");
    assert.deepEqual(body.board.batches.map((batch) => batch.id), ["batch_visible_1"]);
    assert.equal(body.board.suggestionCandidates.some((candidate) => candidate.kind === "today_visit" && candidate.visitId === "visit_1"), true);
    assert.equal(body.board.suggestionCandidates.some((candidate) => candidate.kind === "known_property" && candidate.propertyId === "property_2"), true);
  });
});

test("M11 visit context returns checklist and before/after candidates, and unassigned technicians stay fenced out", async () => {
  const { app } = await makeServer();
  await withServer(app, async (base) => {
    const assigned = await fetch(`${base}/api/mobile/visits/visit_1/context?tenantId=aquatrace`, {
      headers: localProfileHeaders("local-technician")
    });
    const assignedBody = await assigned.json();

    assert.equal(assigned.status, 200);
    assert.equal(assignedBody.ok, true);
    assert.equal(assignedBody.context.checklists.length, 1);
    assert.equal(assignedBody.context.beforeAfterCandidates.length, 1);
    assert.equal(assignedBody.context.beforeAfterCandidates[0].id, "media_before_1");

    const narrated = await fetch(`${base}/api/mobile/visits/visit_1/narration`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...localProfileHeaders("local-technician")
      },
      body: JSON.stringify({
        tenantId: "aquatrace",
        text: "Technician confirmed suction-side leak by the skimmer.",
        append: true
      })
    });
    const narratedBody = await narrated.json();
    assert.equal(narrated.status, 200);
    assert.match(narratedBody.visit.details, /suction-side leak/i);

    const blocked = await fetch(`${base}/api/mobile/visits/visit_1/context?tenantId=aquatrace`, {
      headers: localProfileHeaders("local-technician-2")
    });
    const blockedBody = await blocked.json();
    assert.equal(blocked.status, 403);
    assert.equal(blockedBody.error, "You do not have permission to perform that action.");
  });
});

test("M11 typed and voice narration both flow into the shared field report rail", async () => {
  const { app } = await makeServer();
  await withServer(app, async (base) => {
    const narrated = await fetch(`${base}/api/mobile/visits/visit_1/narration`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...localProfileHeaders("local-technician")
      },
      body: JSON.stringify({
        tenantId: "aquatrace",
        text: "Typed mobile note: confirmed suction leak under the skimmer lid.",
        append: true
      })
    });
    assert.equal(narrated.status, 200);

    const createdReport = await fetch(`${base}/api/fielddocs/reports`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        tenantId: "aquatrace",
        jobId: "job_1",
        propertyId: "property_1",
        visitId: "visit_1",
        title: "Leak detection field report",
        findings: ["Field note captured on site."],
        mediaIds: ["media_before_1"],
        status: "posted"
      })
    }).then((response) => response.json());

    assert.equal(createdReport.ok, true);

    const reportPdf = Buffer.from(await fetch(`${base}/api/fielddocs/reports/${createdReport.report.id}/pdf?tenantId=aquatrace`)
      .then((response) => response.arrayBuffer()));
    const reportText = reportPdf.toString("utf8");
    assert.match(reportText, /Typed mobile note: confirmed suction leak under the skimmer lid\./i);
    assert.match(reportText, /Voice note: skimmer crack confirmed\./i);
  });
});

test("M11 transcription blocks over-cap narration before provider fetch and writes a usage log record", async () => {
  const { app, usageLog, getFetchCalled } = await makeServer({
    transcriptionCapUsd: "0.0001"
  });
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/mobile/transcribe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...localProfileHeaders("local-technician")
      },
      body: JSON.stringify({
        tenantId: "aquatrace",
        fileName: "visit-note.m4a",
        mimeType: "audio/mp4",
        audioBase64: Buffer.from("voice-receipt").toString("base64"),
        durationMs: 60_000
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.result.attempted, false);
    assert.equal(body.result.blockedBudget, true);
    assert.match(body.result.reason, /exceeded the tenant cap/i);
    assert.equal(getFetchCalled(), false);
    assert.equal(usageLog.records.length, 1);
    assert.equal(usageLog.records[0].taskType, "m11_mobile_transcription");
    assert.equal(usageLog.records[0].ok, false);
    assert.match(usageLog.records[0].errorSummary, /blocked before provider call/i);
  });
});
