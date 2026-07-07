import { findNearestClientMatch } from "./geo.js";
import type { ClientLocationCandidate } from "./geo.js";
import type { InMemoryMobileStore } from "./store.js";
import {
  ChecklistDraftSchema,
  ChecklistUpsertOperationSchema,
  JobStatusUpdateOperationSchema,
  NexiMobileConnectionSchema,
  OfflineOperationSchema,
  PhotoCaptureSchema,
  PhotoUploadOperationSchema,
  SyncSummarySchema,
  type CachedDaySchedule,
  type ChecklistAnswer,
  type MobileJobStatus,
  type OfflineOperation,
  type PhotoExif,
  type SyncSummary
} from "./schemas.js";

export type PreloadDayScheduleInput = {
  tenantId: string;
  date: string;
  technicianId: string;
};

export type RemoteConflictField = {
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  remoteUpdatedAt: string;
};

export type RemoteApplyResult = {
  remoteUpdatedAt: string;
  remoteUrl?: string;
  conflicts?: RemoteConflictField[];
};

export interface MobileRemoteAdapter {
  fetchDaySchedule(input: PreloadDayScheduleInput): Promise<CachedDaySchedule>;
  applyOperation(operation: OfflineOperation): Promise<RemoteApplyResult>;
}

type IdFactory = (prefix: string) => string;
type Clock = () => string;

export type MobileOfflineControllerOptions = {
  store: InMemoryMobileStore;
  remote: MobileRemoteAdapter;
  now?: Clock;
  idFactory?: IdFactory;
};

type ChecklistUpdateInput = {
  tenantId: string;
  jobId: string;
  checklistId: string;
  answers: Record<string, ChecklistAnswer>;
  updatedBy: string;
};

type PhotoCaptureInput = {
  tenantId: string;
  jobId: string;
  localUri: string;
  exif: PhotoExif;
  capturedBy: string;
  caption?: string;
  candidates?: ClientLocationCandidate[];
  maxMatchDistanceMeters?: number;
};

type JobCloseOutInput = {
  tenantId: string;
  jobId: string;
  status: Extract<MobileJobStatus, "completed" | "needs_review">;
  notes: string;
  updatedBy: string;
};

function defaultIdFactory(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultClock() {
  return new Date().toISOString();
}

function isNetworkLikeError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return message.includes("network") || message.includes("offline") || message.includes("timeout");
}

export class MobileOfflineController {
  private readonly store: InMemoryMobileStore;
  private readonly remote: MobileRemoteAdapter;
  private readonly now: Clock;
  private readonly idFactory: IdFactory;

  constructor(options: MobileOfflineControllerOptions) {
    this.store = options.store;
    this.remote = options.remote;
    this.now = options.now ?? defaultClock;
    this.idFactory = options.idFactory ?? defaultIdFactory;
  }

  setOnline(online: boolean) {
    this.store.setOnline(online);
  }

  getNexiConnectionState() {
    return NexiMobileConnectionSchema.parse(
      this.store.isOnline()
        ? {
            canAskNexi: true,
            showSpinner: false,
            message: "Nexi is online."
          }
        : {
            canAskNexi: false,
            showSpinner: false,
            message: "Nexi needs internet. Your checklist, notes, and photos are still saving here and will sync when the signal comes back."
          }
    );
  }

  async preloadDaySchedule(input: PreloadDayScheduleInput) {
    const schedule = await this.remote.fetchDaySchedule(input);
    if (schedule.tenantId !== input.tenantId) {
      throw new Error("Remote schedule returned the wrong tenant.");
    }
    return this.store.upsertSchedule(schedule);
  }

  updateChecklist(input: ChecklistUpdateInput) {
    const job = this.requireCachedJob(input.tenantId, input.jobId);
    const updatedAt = this.now();
    const existing = this.store.getChecklistDraft(input.tenantId, input.jobId, input.checklistId);
    const answers = {
      ...(existing?.answers ?? {}),
      ...input.answers
    };

    const draft = this.store.putChecklistDraft(
      ChecklistDraftSchema.parse({
        tenantId: input.tenantId,
        jobId: input.jobId,
        checklistId: input.checklistId,
        answers,
        updatedAt,
        updatedBy: input.updatedBy,
        syncStatus: "queued",
        version: (existing?.version ?? 0) + 1
      })
    );

    this.store.enqueueOperation(
      ChecklistUpsertOperationSchema.parse({
        tenantId: input.tenantId,
        opId: this.idFactory("checklist"),
        jobId: input.jobId,
        createdAt: updatedAt,
        localUpdatedAt: updatedAt,
        baseRemoteUpdatedAt: job.updatedAt,
        type: "checklist.upsert",
        payload: {
          checklistId: input.checklistId,
          answers,
          updatedBy: input.updatedBy
        }
      })
    );

    return draft;
  }

  captureJobPhoto(input: PhotoCaptureInput) {
    const job = this.requireCachedJob(input.tenantId, input.jobId);
    const createdAt = this.now();
    const localPhotoId = this.idFactory("photo");
    const candidates = input.candidates ?? this.clientCandidatesFromCachedJobs(input.tenantId);
    const nearestClientMatch = findNearestClientMatch(
      input.tenantId,
      input.exif,
      candidates,
      input.maxMatchDistanceMeters ?? 300
    );

    const photo = this.store.addPhotoCapture(
      PhotoCaptureSchema.parse({
        tenantId: input.tenantId,
        localPhotoId,
        jobId: input.jobId,
        clientId: job.clientId,
        uri: input.localUri,
        exif: input.exif,
        ...(nearestClientMatch ? { nearestClientMatch } : {}),
        caption: input.caption ?? "",
        capturedBy: input.capturedBy,
        createdAt,
        syncStatus: "queued"
      })
    );

    this.store.enqueueOperation(
      PhotoUploadOperationSchema.parse({
        tenantId: input.tenantId,
        opId: this.idFactory("photo_upload"),
        jobId: input.jobId,
        createdAt,
        localUpdatedAt: createdAt,
        baseRemoteUpdatedAt: job.updatedAt,
        type: "photo.upload",
        payload: {
          localPhotoId,
          clientId: job.clientId,
          uri: input.localUri,
          exif: input.exif,
          caption: input.caption ?? "",
          ...(nearestClientMatch ? { nearestClientMatch } : {}),
          capturedBy: input.capturedBy
        }
      })
    );

    return photo;
  }

  closeOutJob(input: JobCloseOutInput) {
    const job = this.requireCachedJob(input.tenantId, input.jobId);
    const updatedAt = this.now();
    const nextJob = this.store.upsertCachedJob({
      ...job,
      status: input.status,
      notes: input.notes,
      updatedAt
    });

    this.store.enqueueOperation(
      JobStatusUpdateOperationSchema.parse({
        tenantId: input.tenantId,
        opId: this.idFactory("job_status"),
        jobId: input.jobId,
        createdAt: updatedAt,
        localUpdatedAt: updatedAt,
        baseRemoteUpdatedAt: job.updatedAt,
        type: "jobStatus.update",
        payload: {
          status: input.status,
          notes: input.notes,
          updatedBy: input.updatedBy
        }
      })
    );

    return nextJob;
  }

  async syncNow(tenantId: string): Promise<SyncSummary> {
    const pending = this.store.listPendingOperations(tenantId);
    if (!this.store.isOnline()) {
      return SyncSummarySchema.parse({
        status: "offline",
        attempted: 0,
        synced: 0,
        conflicts: 0,
        remaining: pending.length
      });
    }

    let attempted = 0;
    let synced = 0;
    let conflicts = 0;

    for (const operation of pending) {
      attempted += 1;
      try {
        const parsedOperation = OfflineOperationSchema.parse(operation);
        const result = await this.remote.applyOperation(parsedOperation);
        for (const conflict of result.conflicts ?? []) {
          this.store.addConflict({
            conflictId: this.idFactory("conflict"),
            tenantId: parsedOperation.tenantId,
            opId: parsedOperation.opId,
            jobId: parsedOperation.jobId,
            field: conflict.field,
            localValue: conflict.localValue,
            remoteValue: conflict.remoteValue,
            localUpdatedAt: parsedOperation.localUpdatedAt,
            remoteUpdatedAt: conflict.remoteUpdatedAt,
            resolution: "last_write_wins",
            requiresReview: true,
            createdAt: this.now()
          });
          conflicts += 1;
        }
        this.applyLocalSyncSuccess(parsedOperation, result);
        this.store.removeOperation(parsedOperation.opId);
        synced += 1;
      } catch (error) {
        if (!isNetworkLikeError(error)) throw error;
        break;
      }
    }

    const remaining = this.store.listPendingOperations(tenantId).length;
    return SyncSummarySchema.parse({
      status: remaining === 0 ? "synced" : "partial",
      attempted,
      synced,
      conflicts,
      remaining
    });
  }

  private applyLocalSyncSuccess(operation: OfflineOperation, result: RemoteApplyResult) {
    if (operation.type === "checklist.upsert") {
      this.store.markChecklistSynced(operation.tenantId, operation.jobId, operation.payload.checklistId);
      return;
    }
    if (operation.type === "photo.upload") {
      this.store.markPhotoSynced(operation.tenantId, operation.payload.localPhotoId, result.remoteUrl);
      return;
    }
    const current = this.store.getCachedJob(operation.tenantId, operation.jobId);
    if (current) {
      this.store.upsertCachedJob({
        ...current,
        status: operation.payload.status,
        notes: operation.payload.notes,
        updatedAt: result.remoteUpdatedAt
      });
    }
  }

  private requireCachedJob(tenantId: string, jobId: string) {
    const job = this.store.getCachedJob(tenantId, jobId);
    if (!job) {
      throw new Error("That job is not cached on this device yet.");
    }
    return job;
  }

  private clientCandidatesFromCachedJobs(tenantId: string): ClientLocationCandidate[] {
    return this.store
      .listCachedJobs(tenantId)
      .flatMap((job) => {
        const geo = job.serviceAddress.geo;
        if (!geo) return [];
        return [
          {
            tenantId: job.tenantId,
            clientId: job.clientId,
            clientName: job.clientName,
            ...(job.propertyId ? { propertyId: job.propertyId } : {}),
            ...(job.propertyName ? { propertyName: job.propertyName } : {}),
            geo
          }
        ];
      });
  }
}
