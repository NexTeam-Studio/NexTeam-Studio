import {
  capturePhotoDraftSchema,
  captureQueueSummarySchema,
  captureSessionDraftSchema,
  type CapturePhotoDraft,
  type CaptureQueueSummary,
  type CaptureSessionDraft,
  type CaptureSyncStatus
} from "./captureModels.js";
import { deriveSessionSyncStatus } from "./captureHelpers.js";
import type { CaptureApiClient } from "./captureApi.js";

export interface CaptureSessionStore {
  list(): Promise<CaptureSessionDraft[]>;
  get(sessionId: string): Promise<CaptureSessionDraft | null>;
  save(session: CaptureSessionDraft): Promise<CaptureSessionDraft>;
  remove(sessionId: string): Promise<void>;
}

export class InMemoryCaptureSessionStore implements CaptureSessionStore {
  private readonly sessions = new Map<string, CaptureSessionDraft>();

  async list(): Promise<CaptureSessionDraft[]> {
    return [...this.sessions.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async get(sessionId: string): Promise<CaptureSessionDraft | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async save(session: CaptureSessionDraft): Promise<CaptureSessionDraft> {
    const parsed = captureSessionDraftSchema.parse(session);
    this.sessions.set(parsed.id, parsed);
    return parsed;
  }

  async remove(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

export function queueSummary(sessions: CaptureSessionDraft[]): CaptureQueueSummary {
  const summary = sessions.reduce<CaptureQueueSummary>((accumulator, session) => {
    const status = deriveSessionSyncStatus(session);
    if (status === "queued") {
      accumulator.pending += 1;
    } else if (status === "syncing") {
      accumulator.syncing += 1;
    } else if (status === "failed") {
      accumulator.failed += 1;
    } else if (status === "synced") {
      accumulator.synced += 1;
    }
    return accumulator;
  }, { pending: 0, syncing: 0, failed: 0, synced: 0 });
  return captureQueueSummarySchema.parse(summary);
}

export function nextRetryAt(lastAttemptAt: string, failureCount: number): string {
  const minutes = Math.min(30, Math.max(1, 2 ** Math.max(0, failureCount)));
  const base = new Date(lastAttemptAt);
  base.setUTCMinutes(base.getUTCMinutes() + minutes);
  return base.toISOString();
}

export function applyPhotoSyncResult(input: {
  photo: CapturePhotoDraft;
  remoteMediaId?: string | undefined;
  remoteUrl?: string | undefined;
  syncStatus: CaptureSyncStatus;
  lastError?: string | undefined;
}): CapturePhotoDraft {
  return capturePhotoDraftSchema.parse({
    ...input.photo,
    ...(input.remoteMediaId ? { remoteMediaId: input.remoteMediaId } : {}),
    ...(input.remoteUrl ? { remoteUrl: input.remoteUrl } : {}),
    syncStatus: input.syncStatus,
    ...(input.lastError ? { lastError: input.lastError } : { lastError: undefined })
  });
}

export interface CaptureSyncDependencies {
  api: CaptureApiClient;
  readFileAsBase64: (uri: string) => Promise<string>;
  now?: () => string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sessionDueForRetry(session: CaptureSessionDraft, timestamp: string): boolean {
  if (!session.nextRetryAt) {
    return true;
  }
  return session.nextRetryAt <= timestamp;
}

function pendingNarrations(session: CaptureSessionDraft) {
  return session.visitNarrations.filter((entry) => !entry.syncedAt);
}

function pendingPhotoNarrations(photo: CapturePhotoDraft) {
  return photo.narrations.filter((entry) => !entry.syncedAt);
}

function remoteMediaIdsForLocalPhotos(
  localPhotoIds: string[] | undefined,
  photos: CaptureSessionDraft["photos"]
): string[] | undefined {
  if (!localPhotoIds?.length) {
    return undefined;
  }
  const ids = localPhotoIds
    .map((localPhotoId) => photos.find((photo) => photo.id === localPhotoId)?.remoteMediaId)
    .filter((mediaId): mediaId is string => Boolean(mediaId));
  return ids.length ? ids : undefined;
}

function markSessionFailed(session: CaptureSessionDraft, message: string, timestamp: string): CaptureSessionDraft {
  const failureCount = (session.failureCount ?? 0) + 1;
  return captureSessionDraftSchema.parse({
    ...session,
    syncStatus: "failed",
    failureCount,
    lastAttemptAt: timestamp,
    nextRetryAt: nextRetryAt(timestamp, failureCount),
    lastError: message
  });
}

async function syncNarrationText(input: {
  session: CaptureSessionDraft;
  text: string;
  mediaId?: string | undefined;
  visitId?: string | undefined;
  api: CaptureApiClient;
}): Promise<void> {
  if (input.mediaId) {
    await input.api.updateMediaReview({
      tenantId: input.session.tenantId,
      mediaId: input.mediaId,
      comment: input.text
    });
    return;
  }
  if (input.visitId) {
    await input.api.updateVisitNarration({
      tenantId: input.session.tenantId,
      visitId: input.visitId,
      text: input.text,
      append: true
    });
  }
}

async function ensureNarrationText(input: {
  session: CaptureSessionDraft;
  narration: CaptureSessionDraft["visitNarrations"][number];
  readFileAsBase64: (uri: string) => Promise<string>;
  api: CaptureApiClient;
}): Promise<string> {
  if (input.narration.source === "typed") {
    return input.narration.text;
  }
  if (!input.narration.audioFileUri || !input.narration.audioMimeType) {
    throw new Error("Voice narration is missing its local recording file.");
  }
  const audioBase64 = await input.readFileAsBase64(input.narration.audioFileUri);
  const result = await input.api.transcribeNarration({
    tenantId: input.session.tenantId,
    fileName: `${input.narration.id}.m4a`,
    mimeType: input.narration.audioMimeType,
    audioBase64
  });
  if (!result.enabled || !result.attempted || !result.transcript?.trim()) {
    throw new Error(result.reason || "Voice transcription did not return text.");
  }
  return result.transcript.trim();
}

export async function syncCaptureSession(
  session: CaptureSessionDraft,
  deps: CaptureSyncDependencies
): Promise<CaptureSessionDraft> {
  const timestamp = (deps.now ?? nowIso)();
  let next = captureSessionDraftSchema.parse({
    ...session,
    syncStatus: "syncing",
    lastAttemptAt: timestamp,
    nextRetryAt: undefined,
    lastError: undefined
  });

  try {
    if (!next.remoteBatchId) {
      const batch = await deps.api.createCaptureBatch(next.tenantId);
      next = captureSessionDraftSchema.parse({
        ...next,
        remoteBatchId: batch.id
      });
    }

    if (next.assignment) {
      let assignment = next.assignment;
      if (assignment.mode === "request" && !assignment.requestId) {
        if (!assignment.requestDraft) {
          throw new Error("The New Client route is missing its saved request draft.");
        }
        const request = await deps.api.createRequestFromDraft(next.tenantId, assignment.requestDraft);
        assignment = {
          ...assignment,
          requestId: request.id
        };
        next = captureSessionDraftSchema.parse({
          ...next,
          assignment
        });
      }
      const batchId = next.remoteBatchId;
      if (!batchId) {
        throw new Error("Capture batch did not persist before assignment.");
      }
      const assignResult = await deps.api.assignCaptureBatch({
        tenantId: next.tenantId,
        batchId,
        mode: assignment.mode,
        ...(assignment.clientId ? { clientId: assignment.clientId } : {}),
        ...(assignment.jobId ? { jobId: assignment.jobId } : {}),
        ...(assignment.visitId ? { visitId: assignment.visitId } : {}),
        ...(assignment.requestId ? { requestId: assignment.requestId } : {})
      });
      next = captureSessionDraftSchema.parse({
        ...next,
        assignment: {
          ...assignment,
          ...(assignResult.clientId ? { clientId: assignResult.clientId } : {})
        }
      });
    }

    for (let index = 0; index < next.photos.length; index += 1) {
      const current = next.photos[index];
      if (!current) {
        continue;
      }
      let workingPhoto = current;
      if (!workingPhoto.remoteMediaId) {
        const fileBase64 = await deps.readFileAsBase64(workingPhoto.localFileUri);
        const uploaded = await deps.api.uploadFieldPhoto({
          tenantId: next.tenantId,
          captureBatchId: next.remoteBatchId,
          filename: workingPhoto.fileName,
          mime: workingPhoto.mimeType,
          fileBase64,
          capturedAt: workingPhoto.capturedAt,
          ...(workingPhoto.gps ? { gps: { lat: workingPhoto.gps.latitude, lng: workingPhoto.gps.longitude } } : {}),
          capturedBy: next.actorTenantUserId,
          ...(workingPhoto.pairingRole ? { tags: [workingPhoto.pairingRole] } : {})
        });
        workingPhoto = applyPhotoSyncResult({
          photo: workingPhoto,
          remoteMediaId: uploaded.id,
          remoteUrl: deps.api.mediaUrl(next.tenantId, uploaded.id),
          syncStatus: "queued"
        });
      }

      if (workingPhoto.annotations.length) {
        await deps.api.updateMediaReview({
          tenantId: next.tenantId,
          mediaId: workingPhoto.remoteMediaId!,
          annotations: workingPhoto.annotations
        });
      }

      const syncedNarrations: CapturePhotoDraft["narrations"] = [];
      for (const narration of pendingPhotoNarrations(workingPhoto)) {
        const text = await ensureNarrationText({
          session: next,
          narration,
          readFileAsBase64: deps.readFileAsBase64,
          api: deps.api
        });
        await syncNarrationText({
          session: next,
          text,
          mediaId: workingPhoto.remoteMediaId,
          api: deps.api
        });
        syncedNarrations.push({
          ...narration,
          text,
          transcriptionStatus: "ready" as const,
          lastError: undefined,
          syncedAt: timestamp
        });
      }

      workingPhoto = capturePhotoDraftSchema.parse({
        ...workingPhoto,
        narrations: workingPhoto.narrations.map((narration) => syncedNarrations.find((entry) => entry.id === narration.id) ?? narration),
        syncStatus: "synced",
        lastError: undefined
      });
      next = captureSessionDraftSchema.parse({
        ...next,
        photos: next.photos.map((photo) => photo.id === workingPhoto.id ? workingPhoto : photo)
      });
    }

    const syncedVisitNarrations: CaptureSessionDraft["visitNarrations"] = [];
    for (const narration of pendingNarrations(next)) {
      const text = await ensureNarrationText({
        session: next,
        narration,
        readFileAsBase64: deps.readFileAsBase64,
        api: deps.api
      });
      await syncNarrationText({
        session: next,
        text,
        visitId: next.visit?.id,
        api: deps.api
      });
      syncedVisitNarrations.push({
        ...narration,
        text,
        transcriptionStatus: "ready" as const,
        lastError: undefined,
        syncedAt: timestamp
      });
    }

    if (syncedVisitNarrations.length) {
      next = captureSessionDraftSchema.parse({
        ...next,
        visitNarrations: next.visitNarrations.map((narration) => syncedVisitNarrations.find((entry) => entry.id === narration.id) ?? narration)
      });
    }

    for (let index = 0; index < next.checklists.length; index += 1) {
      const checklist = next.checklists[index];
      if (!checklist?.remoteChecklistId || checklist.syncStatus === "synced") {
        continue;
      }
      await deps.api.updateChecklist({
        tenantId: next.tenantId,
        checklistId: checklist.remoteChecklistId,
        updates: checklist.updates.map((update) => ({
          ...update,
          ...(update.localPhotoIds
            ? { mediaIds: remoteMediaIdsForLocalPhotos(update.localPhotoIds, next.photos) ?? update.mediaIds }
            : {})
        })),
        sectionStateUpdates: checklist.sectionStateUpdates,
        complete: checklist.complete
      });
      next = captureSessionDraftSchema.parse({
        ...next,
        checklists: next.checklists.map((entry) => entry.id === checklist.id ? { ...entry, syncStatus: "synced", lastError: undefined } : entry)
      });
    }

    return captureSessionDraftSchema.parse({
      ...next,
      syncStatus: deriveSessionSyncStatus(next),
      failureCount: 0,
      lastError: undefined,
      nextRetryAt: undefined,
      updatedAt: timestamp
    });
  } catch (error) {
    return markSessionFailed(next, error instanceof Error ? error.message : "Mobile sync failed.", timestamp);
  }
}

export async function syncQueuedSessions(
  store: CaptureSessionStore,
  deps: CaptureSyncDependencies
): Promise<CaptureSessionDraft[]> {
  const timestamp = (deps.now ?? nowIso)();
  const sessions = await store.list();
  const updated: CaptureSessionDraft[] = [];
  for (const session of sessions) {
    if (session.syncStatus === "synced" && !session.photos.some((photo) => photo.syncStatus !== "synced")) {
      updated.push(session);
      continue;
    }
    if (!sessionDueForRetry(session, timestamp)) {
      updated.push(session);
      continue;
    }
    const next = await syncCaptureSession(session, deps);
    await store.save(next);
    updated.push(next);
  }
  return updated;
}
