import {
  CachedDayScheduleSchema,
  MobileConflictSchema,
  MobilePushRegistrationSchema,
  MobileScheduleJobSchema,
  MobileSyncResultSchema,
  type CachedDaySchedule,
  type MobileConflict,
  type MobilePushRegistration,
  type MobileScheduleJob,
  type MobileSyncResult,
  type OfflineOperation
} from "@nexteam/mobile";

function nowIso() {
  return new Date().toISOString();
}

function addHours(iso: string, hours: number) {
  const date = new Date(iso);
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
}

function defaultJobs(): MobileScheduleJob[] {
  return [
    MobileScheduleJobSchema.parse({
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
    }),
    MobileScheduleJobSchema.parse({
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
    })
  ];
}

export class InMemoryMobileRepository {
  private readonly jobs = new Map<string, MobileScheduleJob>();
  private readonly pushRegistrations = new Map<string, MobilePushRegistration>();
  private readonly conflicts: MobileConflict[] = [];

  constructor(seedJobs: MobileScheduleJob[] = defaultJobs()) {
    for (const job of seedJobs) {
      this.jobs.set(this.key(job.tenantId, job.jobId), MobileScheduleJobSchema.parse(job));
    }
  }

  getJob(tenantId: string, jobId: string): MobileScheduleJob | null {
    return this.jobs.get(this.key(tenantId, jobId)) ?? null;
  }

  listJobsForDay(tenantId: string, date: string, technicianId: string): MobileScheduleJob[] {
    return [...this.jobs.values()]
      .filter((job) => job.tenantId === tenantId)
      .filter((job) => job.scheduledStart.startsWith(date))
      .filter((job) => job.technicianIds.includes(technicianId))
      .sort((left, right) => left.scheduledStart.localeCompare(right.scheduledStart));
  }

  getDaySchedule(tenantId: string, date: string, technicianId: string): CachedDaySchedule {
    const cachedAt = nowIso();
    return CachedDayScheduleSchema.parse({
      tenantId,
      date,
      technicianId,
      cachedAt,
      expiresAt: addHours(cachedAt, 18),
      jobs: this.listJobsForDay(tenantId, date, technicianId)
    });
  }

  async registerPushToken(input: MobilePushRegistration): Promise<MobilePushRegistration> {
    const parsed = MobilePushRegistrationSchema.parse(input);
    this.pushRegistrations.set(`${parsed.tenantId}:${parsed.tenantUserId}:${parsed.deviceId}`, parsed);
    return parsed;
  }

  listPushRegistrations(tenantId: string): MobilePushRegistration[] {
    return [...this.pushRegistrations.values()]
      .filter((registration) => registration.tenantId === tenantId)
      .sort((left, right) => left.registeredAt.localeCompare(right.registeredAt));
  }

  applyOperation(operation: OfflineOperation): MobileSyncResult {
    const job = this.getJob(operation.tenantId, operation.jobId);
    if (!job) {
      return MobileSyncResultSchema.parse({
        opId: operation.opId,
        ok: false,
        error: "Job is not cached on the server."
      });
    }

    const conflicts = this.detectConflicts(job, operation);
    const remoteUpdatedAt = operation.localUpdatedAt || nowIso();
    if (operation.type === "jobStatus.update") {
      this.jobs.set(this.key(job.tenantId, job.jobId), MobileScheduleJobSchema.parse({
        ...job,
        status: operation.payload.status,
        notes: operation.payload.notes,
        updatedAt: remoteUpdatedAt
      }));
    }

    const result = MobileSyncResultSchema.parse({
      opId: operation.opId,
      ok: true,
      remoteUpdatedAt,
      ...(operation.type === "photo.upload"
        ? { remoteUrl: `gs://nexteam-studio.firebasestorage.app/${operation.tenantId}/field-photos/${operation.payload.localPhotoId}.jpg` }
        : {}),
      conflicts
    });

    this.conflicts.push(...result.conflicts);
    return result;
  }

  listConflicts(tenantId: string): MobileConflict[] {
    return this.conflicts.filter((conflict) => conflict.tenantId === tenantId);
  }

  private detectConflicts(job: MobileScheduleJob, operation: OfflineOperation): MobileConflict[] {
    if (!operation.baseRemoteUpdatedAt || job.updatedAt <= operation.baseRemoteUpdatedAt) {
      return [];
    }
    if (operation.type !== "jobStatus.update") {
      return [];
    }
    return [
      MobileConflictSchema.parse({
        conflictId: `conflict_${crypto.randomUUID()}`,
        tenantId: operation.tenantId,
        opId: operation.opId,
        jobId: operation.jobId,
        field: "status",
        localValue: operation.payload.status,
        remoteValue: job.status,
        localUpdatedAt: operation.localUpdatedAt,
        remoteUpdatedAt: job.updatedAt,
        resolution: "last_write_wins",
        requiresReview: true,
        createdAt: nowIso()
      })
    ];
  }

  private key(tenantId: string, jobId: string): string {
    return `${tenantId}:${jobId}`;
  }
}
