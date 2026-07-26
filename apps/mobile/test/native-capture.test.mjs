import test from "node:test";
import assert from "node:assert/strict";
import {
  findCaptureSuggestion,
  shouldReauthenticate
} from "../dist/native/captureHelpers.js";
import {
  InMemoryCaptureSessionStore
} from "../dist/native/captureQueue.js";
import {
  queueSummary,
  syncCaptureSession,
  syncQueuedSessions
} from "../dist/native/captureQueue.js";
import { captureSessionDraftSchema } from "../dist/native/captureModels.js";

function makeSession(overrides = {}) {
  return captureSessionDraftSchema.parse({
    id: "session_1",
    tenantId: "aquatrace",
    actorTenantUserId: "tech_chris",
    routeState: "fresh",
    visit: {
      id: "visit_1",
      jobId: "job_1",
      clientId: "client_1",
      clientName: "Deborah Justice",
      propertyId: "property_1",
      propertyName: "181 Isbell Road",
      title: "Leak detection",
      status: "scheduled",
      start: "2026-07-20T14:00:00.000Z",
      end: "2026-07-20T16:00:00.000Z",
      serviceAddress: {
        line1: "181 Isbell Road",
        city: "Fair Play",
        state: "SC",
        postalCode: "29643",
        geo: {
          latitude: 34.5121,
          longitude: -82.9853,
          accuracyMeters: 8
        }
      },
      assignedTo: ["tech_chris"],
      checklistIds: ["checklist_1"],
      notes: {
        gateCode: "4411",
        accessNotes: "Left gate sticks",
        petPresent: true,
        petName: "Buddy",
        poolType: "Vinyl"
      },
      details: "",
      jobStatus: "Unscheduled"
    },
    assignment: {
      mode: "request",
      requestDraft: {
        clientName: "Deborah Justice",
        email: "deborah@example.test",
        phone: "8645551212",
        propertyStreet1: "181 Isbell Road",
        propertyCity: "Fair Play",
        propertyProvince: "SC",
        propertyPostalCode: "29643",
        issueSummary: "Leak near main drain",
        gateCode: "4411",
        petPresent: true,
        petName: "Buddy",
        poolType: "Vinyl"
      }
    },
    visitNarrations: [{
      id: "visit_note_1",
      source: "typed",
      text: "Water loss confirmed at the pad.",
      createdAt: "2026-07-20T14:05:00.000Z",
      transcriptionStatus: "ready"
    }],
    photos: [{
      id: "photo_1",
      localFileUri: "file:///device/photo-1.jpg",
      previewUri: "file:///device/photo-1.jpg",
      fileName: "photo-1.jpg",
      mimeType: "image/jpeg",
      capturedAt: "2026-07-20T14:06:00.000Z",
      gps: {
        latitude: 34.51212,
        longitude: -82.98531,
        accuracyMeters: 5
      },
      caption: "Main drain before repair",
      pairingRole: "after",
      pairWithMediaId: "media_before_1",
      pairOverlayUri: "https://example.test/before.jpg",
      annotations: [{
        id: "annotation_1",
        kind: "path",
        color: "#14b8a6",
        createdAt: "2026-07-20T14:06:10.000Z",
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.8 }
        ]
      }],
      narrations: [{
        id: "photo_voice_1",
        source: "voice",
        text: "Pending transcription",
        createdAt: "2026-07-20T14:06:15.000Z",
        audioFileUri: "file:///device/photo-1.m4a",
        audioMimeType: "audio/mp4",
        transcriptionStatus: "pending_sync"
      }],
      syncStatus: "queued"
    }],
    checklists: [{
      id: "draft_checklist_1",
      remoteChecklistId: "checklist_1",
      templateId: "aquatrace-leak-detection",
      jobId: "job_1",
      visitId: "visit_1",
      propertyId: "property_1",
      updates: [{
        fieldId: "photo_required_field",
        status: "pass",
        localPhotoIds: ["photo_1"],
        photoRequired: true
      }],
      sectionStateUpdates: [{
        section: "equipment",
        status: "active",
        updatedBy: "tech_chris"
      }],
      complete: true,
      syncStatus: "queued",
      updatedAt: "2026-07-20T14:07:00.000Z"
    }],
    syncStatus: "queued",
    failureCount: 0,
    createdAt: "2026-07-20T14:00:00.000Z",
    updatedAt: "2026-07-20T14:07:00.000Z",
    ...overrides
  });
}

test("M11 local session re-auth waits seven days and GPS suggestions prefer today's assigned visit", () => {
  assert.equal(shouldReauthenticate(
    { lastAuthenticatedAt: "2026-07-13T09:00:00.000Z" },
    "2026-07-20T08:59:59.000Z"
  ), false);
  assert.equal(shouldReauthenticate(
    { lastAuthenticatedAt: "2026-07-13T09:00:00.000Z" },
    "2026-07-20T09:00:00.000Z"
  ), true);

  const suggestion = findCaptureSuggestion({
    latitude: 34.51211,
    longitude: -82.9853,
    accuracyMeters: 6
  }, [
    {
      kind: "known_property",
      clientId: "client_other",
      clientName: "Nearby but not today's job",
      propertyId: "property_other",
      propertyName: "183 Isbell Road",
      serviceAddress: {
        line1: "183 Isbell Road",
        city: "Fair Play",
        state: "SC",
        postalCode: "29643",
        geo: {
          latitude: 34.512105,
          longitude: -82.985302,
          accuracyMeters: 8
        }
      },
      priority: 2
    },
    {
      kind: "today_visit",
      clientId: "client_1",
      clientName: "Deborah Justice",
      propertyId: "property_1",
      propertyName: "181 Isbell Road",
      jobId: "job_1",
      visitId: "visit_1",
      serviceAddress: {
        line1: "181 Isbell Road",
        city: "Fair Play",
        state: "SC",
        postalCode: "29643",
        geo: {
          latitude: 34.51212,
          longitude: -82.98531,
          accuracyMeters: 8
        }
      },
      priority: 1
    }
  ]);

  assert.ok(suggestion);
  assert.equal(suggestion.candidate.kind, "today_visit");
  assert.equal(suggestion.candidate.visitId, "visit_1");
  assert.equal(suggestion.matchedBy, "today_visit");
});

test("M11 syncCaptureSession creates the request route, uploads media, transcribes voice, and maps checklist photo ids", async () => {
  const calls = {
    createRequestFromDraft: [],
    assignCaptureBatch: [],
    uploadFieldPhoto: [],
    updateMediaReview: [],
    updateVisitNarration: [],
    transcribeNarration: [],
    updateChecklist: []
  };
  const session = makeSession();
  const synced = await syncCaptureSession(session, {
    api: {
      async createCaptureBatch() {
        return {
          id: "batch_1",
          tenantId: "aquatrace",
          status: "draft",
          mediaIds: [],
          createdBy: "tech_chris",
          createdAt: "2026-07-20T14:07:05.000Z",
          updatedAt: "2026-07-20T14:07:05.000Z"
        };
      },
      async createRequestFromDraft(tenantId, draft) {
        calls.createRequestFromDraft.push({ tenantId, draft });
        return { id: "request_1", tenantId, clientName: draft.clientName, status: "new" };
      },
      async assignCaptureBatch(input) {
        calls.assignCaptureBatch.push(input);
        return {
          batch: {
            id: input.batchId,
            status: "assigned",
            assignmentMode: input.mode,
            assignedRequestId: input.requestId,
            mediaIds: [],
            createdAt: "2026-07-20T14:07:05.000Z",
            updatedAt: "2026-07-20T14:07:10.000Z"
          },
          request: {
            id: input.requestId,
            tenantId: input.tenantId,
            clientName: "Deborah Justice",
            status: "new"
          }
        };
      },
      async uploadFieldPhoto(input) {
        calls.uploadFieldPhoto.push(input);
        return {
          id: "media_1",
          tenantId: input.tenantId,
          clientId: "client_1",
          jobId: "job_1",
          visitId: "visit_1",
          propertyId: "property_1",
          captureBatchId: "batch_1",
          type: "photo",
          storageRef: "gs://test-bucket/media_1.jpg",
          exif: {
            ts: input.capturedAt,
            gps: input.gps
          },
          aiTags: ["after"],
          manualTags: [],
          aiCaption: "Main drain after repair"
        };
      },
      async updateMediaReview(input) {
        calls.updateMediaReview.push(input);
        return {
          id: input.mediaId,
          tenantId: input.tenantId,
          type: "photo",
          storageRef: "gs://test-bucket/media_1.jpg",
          aiTags: [],
          manualTags: input.manualTags ?? [],
          comments: input.comment ? [{
            id: "comment_1",
            text: input.comment,
            createdAt: "2026-07-20T14:08:00.000Z",
            author: "tech_chris"
          }] : [],
          annotations: input.annotations ?? []
        };
      },
      async updateVisitNarration(input) {
        calls.updateVisitNarration.push(input);
      },
      async transcribeNarration(input) {
        calls.transcribeNarration.push(input);
        return {
          enabled: true,
          attempted: true,
          transcript: "Main drain sealed and pressure is holding.",
          estimatedCostUsd: 0.0006
        };
      },
      async updateChecklist(input) {
        calls.updateChecklist.push(input);
        return {
          id: "checklist_1",
          tenantId: input.tenantId,
          templateId: "aquatrace-leak-detection",
          visitId: "visit_1",
          jobId: "job_1",
          title: "Leak detection checklist",
          status: input.complete ? "completed" : "draft",
          sectionStates: [],
          fields: [],
          createdAt: "2026-07-20T14:00:00.000Z",
          updatedAt: "2026-07-20T14:09:00.000Z"
        };
      },
      mediaUrl(tenantId, mediaId) {
        return `https://example.test/${tenantId}/${mediaId}`;
      }
    },
    readFileAsBase64: async (uri) => uri.endsWith(".m4a") ? "dm9pY2U=" : "cGhvdG8=",
    now: () => "2026-07-20T14:09:00.000Z"
  });

  assert.equal(calls.createRequestFromDraft.length, 1);
  assert.equal(calls.assignCaptureBatch[0].requestId, "request_1");
  assert.equal(calls.uploadFieldPhoto[0].captureBatchId, "batch_1");
  assert.deepEqual(calls.updateChecklist[0].updates[0].mediaIds, ["media_1"]);
  assert.equal(calls.transcribeNarration.length, 1);
  assert.equal(calls.updateVisitNarration[0].text, "Water loss confirmed at the pad.");
  assert.equal(calls.updateMediaReview[0].annotations.length, 1);
  assert.equal(synced.remoteBatchId, "batch_1");
  assert.equal(synced.photos[0].remoteMediaId, "media_1");
  assert.equal(synced.photos[0].narrations[0].text, "Main drain sealed and pressure is holding.");
  assert.equal(synced.checklists[0].syncStatus, "synced");
  assert.equal(synced.syncStatus, "synced");
});

test("M11 syncQueuedSessions marks failed batches for retry and keeps the queue visibly failed until backoff clears", async () => {
  const store = new InMemoryCaptureSessionStore();
  await store.save(makeSession({
    visitNarrations: [],
    checklists: [],
    photos: [{
      id: "photo_retry_1",
      localFileUri: "file:///device/photo-retry.jpg",
      previewUri: "file:///device/photo-retry.jpg",
      fileName: "photo-retry.jpg",
      mimeType: "image/jpeg",
      capturedAt: "2026-07-20T14:10:00.000Z",
      caption: "",
      annotations: [],
      narrations: [],
      syncStatus: "queued"
    }]
  }));

  let attempts = 0;
  const firstPass = await syncQueuedSessions(store, {
    api: {
      async createCaptureBatch() {
        attempts += 1;
        throw new Error("Signal dropped before the batch could be created.");
      }
    },
    readFileAsBase64: async () => "cGhvdG8=",
    now: () => "2026-07-20T14:11:00.000Z"
  });

  assert.equal(attempts, 1);
  assert.equal(firstPass[0].syncStatus, "failed");
  assert.equal(firstPass[0].failureCount, 1);
  assert.equal(firstPass[0].nextRetryAt, "2026-07-20T14:13:00.000Z");
  assert.deepEqual(queueSummary(firstPass), {
    pending: 0,
    syncing: 0,
    failed: 1,
    synced: 0
  });

  const secondPass = await syncQueuedSessions(store, {
    api: {
      async createCaptureBatch() {
        attempts += 1;
        throw new Error("Should not retry before backoff.");
      }
    },
    readFileAsBase64: async () => "cGhvdG8=",
    now: () => "2026-07-20T14:12:00.000Z"
  });

  assert.equal(attempts, 1);
  assert.equal(secondPass[0].syncStatus, "failed");
  assert.equal(secondPass[0].nextRetryAt, "2026-07-20T14:13:00.000Z");
});
