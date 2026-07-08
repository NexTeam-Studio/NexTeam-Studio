import {
  CachedDayScheduleSchema,
  ChecklistDraftSchema,
  MobileConflictSchema,
  MobileScheduleJobSchema,
  OfflineOperationSchema,
  PhotoCaptureSchema,
  type CachedDaySchedule,
  type ChecklistDraft,
  type MobileConflict,
  type MobileScheduleJob,
  type OfflineOperation,
  type PhotoCapture
} from "./schemas.js";

function scheduleKey(tenantId: string, date: string, technicianId: string) {
  return `${tenantId}:${date}:${technicianId}`;
}

function jobKey(tenantId: string, jobId: string) {
  return `${tenantId}:${jobId}`;
}

function checklistKey(tenantId: string, jobId: string, checklistId: string) {
  return `${tenantId}:${jobId}:${checklistId}`;
}

function photoKey(tenantId: string, localPhotoId: string) {
  return `${tenantId}:${localPhotoId}`;
}

export class InMemoryMobileStore {
  private online = true;
  private readonly schedules = new Map<string, CachedDaySchedule>();
  private readonly jobs = new Map<string, MobileScheduleJob>();
  private readonly checklists = new Map<string, ChecklistDraft>();
  private readonly photos = new Map<string, PhotoCapture>();
  private readonly operations = new Map<string, OfflineOperation>();
  private readonly conflicts = new Map<string, MobileConflict>();

  setOnline(online: boolean) {
    this.online = online;
  }

  isOnline() {
    return this.online;
  }

  upsertSchedule(schedule: CachedDaySchedule) {
    const parsed = CachedDayScheduleSchema.parse(schedule);
    this.schedules.set(scheduleKey(parsed.tenantId, parsed.date, parsed.technicianId), parsed);
    for (const job of parsed.jobs) {
      this.jobs.set(jobKey(job.tenantId, job.jobId), job);
    }
    return parsed;
  }

  getCachedDaySchedule(tenantId: string, date: string, technicianId: string) {
    return this.schedules.get(scheduleKey(tenantId, date, technicianId)) ?? null;
  }

  getCachedJob(tenantId: string, jobId: string) {
    return this.jobs.get(jobKey(tenantId, jobId)) ?? null;
  }

  listCachedJobs(tenantId: string) {
    return Array.from(this.jobs.values())
      .filter((job) => job.tenantId === tenantId)
      .sort((left, right) => left.scheduledStart.localeCompare(right.scheduledStart));
  }

  upsertCachedJob(job: MobileScheduleJob) {
    const parsed = MobileScheduleJobSchema.parse(job);
    this.jobs.set(jobKey(parsed.tenantId, parsed.jobId), parsed);
    return parsed;
  }

  putChecklistDraft(draft: ChecklistDraft) {
    const parsed = ChecklistDraftSchema.parse(draft);
    this.checklists.set(checklistKey(parsed.tenantId, parsed.jobId, parsed.checklistId), parsed);
    return parsed;
  }

  getChecklistDraft(tenantId: string, jobId: string, checklistId: string) {
    return this.checklists.get(checklistKey(tenantId, jobId, checklistId)) ?? null;
  }

  addPhotoCapture(photo: PhotoCapture) {
    const parsed = PhotoCaptureSchema.parse(photo);
    this.photos.set(photoKey(parsed.tenantId, parsed.localPhotoId), parsed);
    return parsed;
  }

  getPhotoCapture(tenantId: string, localPhotoId: string) {
    return this.photos.get(photoKey(tenantId, localPhotoId)) ?? null;
  }

  markPhotoSynced(tenantId: string, localPhotoId: string, remoteUrl?: string) {
    const current = this.getPhotoCapture(tenantId, localPhotoId);
    if (!current) return null;
    const next = PhotoCaptureSchema.parse({
      ...current,
      ...(remoteUrl ? { remoteUrl } : {}),
      syncStatus: "synced"
    });
    this.photos.set(photoKey(tenantId, localPhotoId), next);
    return next;
  }

  markChecklistSynced(tenantId: string, jobId: string, checklistId: string) {
    const current = this.getChecklistDraft(tenantId, jobId, checklistId);
    if (!current) return null;
    const next = ChecklistDraftSchema.parse({ ...current, syncStatus: "synced" });
    this.checklists.set(checklistKey(tenantId, jobId, checklistId), next);
    return next;
  }

  enqueueOperation(operation: OfflineOperation) {
    const parsed = OfflineOperationSchema.parse(operation);
    this.operations.set(parsed.opId, parsed);
    return parsed;
  }

  listPendingOperations(tenantId?: string) {
    return Array.from(this.operations.values())
      .filter((operation) => !tenantId || operation.tenantId === tenantId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  removeOperation(opId: string) {
    this.operations.delete(opId);
  }

  addConflict(conflict: MobileConflict) {
    const parsed = MobileConflictSchema.parse(conflict);
    this.conflicts.set(parsed.conflictId, parsed);
    return parsed;
  }

  listConflicts(tenantId?: string) {
    return Array.from(this.conflicts.values())
      .filter((conflict) => !tenantId || conflict.tenantId === tenantId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
}
