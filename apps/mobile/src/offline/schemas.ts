import { z } from "zod";

export const TenantIdSchema = z.string().min(1);

export const GeoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional()
});

export const ServiceAddressSchema = z.object({
  line1: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(2),
  postalCode: z.string().min(3),
  geo: GeoPointSchema.optional()
});

export const MobileJobStatusSchema = z.enum([
  "scheduled",
  "in_progress",
  "completed",
  "needs_review",
  "canceled"
]);

export const MobileScheduleJobSchema = z.object({
  tenantId: TenantIdSchema,
  jobId: z.string().min(1),
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  propertyName: z.string().min(1).optional(),
  serviceAddress: ServiceAddressSchema,
  scheduledStart: z.string().min(1),
  scheduledEnd: z.string().min(1),
  status: MobileJobStatusSchema,
  technicianIds: z.array(z.string().min(1)),
  jobAccessLinkIds: z.array(z.string().min(1)).default([]),
  checklistTemplateIds: z.array(z.string().min(1)).default([]),
  notes: z.string().default(""),
  updatedAt: z.string().min(1)
});

export const CachedDayScheduleSchema = z.object({
  tenantId: TenantIdSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  technicianId: z.string().min(1),
  cachedAt: z.string().min(1),
  expiresAt: z.string().min(1),
  jobs: z.array(MobileScheduleJobSchema)
});

const ChecklistPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const ChecklistAnswerSchema = z.union([
  ChecklistPrimitiveSchema,
  z.array(ChecklistPrimitiveSchema)
]);

export const ChecklistDraftSchema = z.object({
  tenantId: TenantIdSchema,
  jobId: z.string().min(1),
  checklistId: z.string().min(1),
  answers: z.record(ChecklistAnswerSchema),
  updatedAt: z.string().min(1),
  updatedBy: z.string().min(1),
  syncStatus: z.enum(["local", "queued", "synced"]),
  version: z.number().int().nonnegative()
});

export const PhotoExifSchema = z.object({
  capturedAt: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional(),
  deviceModel: z.string().min(1).optional()
});

export const NearestClientMatchSchema = z.object({
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  propertyName: z.string().min(1).optional(),
  distanceMeters: z.number().nonnegative(),
  matchedBy: z.literal("gps_nearest_client")
});

export const PhotoCaptureSchema = z.object({
  tenantId: TenantIdSchema,
  localPhotoId: z.string().min(1),
  jobId: z.string().min(1),
  clientId: z.string().min(1),
  uri: z.string().min(1),
  exif: PhotoExifSchema,
  nearestClientMatch: NearestClientMatchSchema.optional(),
  caption: z.string().default(""),
  capturedBy: z.string().min(1),
  createdAt: z.string().min(1),
  syncStatus: z.enum(["queued", "synced"]),
  remoteUrl: z.string().min(1).optional()
});

const OfflineOperationBaseSchema = z.object({
  tenantId: TenantIdSchema,
  opId: z.string().min(1),
  jobId: z.string().min(1),
  actorTenantUserId: z.string().min(1).optional(),
  jobAccessLinkId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  localUpdatedAt: z.string().min(1),
  baseRemoteUpdatedAt: z.string().min(1).optional()
});

export const ChecklistUpsertOperationSchema = OfflineOperationBaseSchema.extend({
  type: z.literal("checklist.upsert"),
  payload: z.object({
    checklistId: z.string().min(1),
    answers: z.record(ChecklistAnswerSchema),
    updatedBy: z.string().min(1)
  })
});

export const PhotoUploadOperationSchema = OfflineOperationBaseSchema.extend({
  type: z.literal("photo.upload"),
  payload: z.object({
    localPhotoId: z.string().min(1),
    clientId: z.string().min(1),
    uri: z.string().min(1),
    exif: PhotoExifSchema,
    caption: z.string().default(""),
    nearestClientMatch: NearestClientMatchSchema.optional(),
    capturedBy: z.string().min(1)
  })
});

export const JobStatusUpdateOperationSchema = OfflineOperationBaseSchema.extend({
  type: z.literal("jobStatus.update"),
  payload: z.object({
    status: MobileJobStatusSchema,
    notes: z.string().default(""),
    updatedBy: z.string().min(1)
  })
});

export const OfflineOperationSchema = z.discriminatedUnion("type", [
  ChecklistUpsertOperationSchema,
  PhotoUploadOperationSchema,
  JobStatusUpdateOperationSchema
]);

export const MobileConflictSchema = z.object({
  conflictId: z.string().min(1),
  tenantId: TenantIdSchema,
  opId: z.string().min(1),
  jobId: z.string().min(1),
  field: z.string().min(1),
  localValue: z.unknown(),
  remoteValue: z.unknown(),
  localUpdatedAt: z.string().min(1),
  remoteUpdatedAt: z.string().min(1),
  resolution: z.literal("last_write_wins"),
  requiresReview: z.literal(true),
  createdAt: z.string().min(1)
});

export const SyncSummarySchema = z.object({
  status: z.enum(["offline", "synced", "partial"]),
  attempted: z.number().int().nonnegative(),
  synced: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative()
});

export const NexiMobileConnectionSchema = z.object({
  canAskNexi: z.boolean(),
  showSpinner: z.boolean(),
  message: z.string().min(1)
});

export const MobilePushRegistrationSchema = z.object({
  tenantId: TenantIdSchema,
  tenantUserId: z.string().min(1),
  role: z.enum(["OWNER", "OFFICE_ADMIN", "TECHNICIAN"]),
  expoPushToken: z.string().min(1),
  deviceId: z.string().min(1),
  platform: z.enum(["ios", "android", "web", "unknown"]).default("unknown"),
  registeredAt: z.string().min(1)
});

export const MobileSyncRequestSchema = z.object({
  operations: z.array(OfflineOperationSchema).min(1)
});

export const MobileSyncResultSchema = z.object({
  opId: z.string().min(1),
  ok: z.boolean(),
  remoteUpdatedAt: z.string().min(1).optional(),
  remoteUrl: z.string().min(1).optional(),
  conflicts: z.array(MobileConflictSchema).default([]),
  error: z.string().optional()
});

export type GeoPoint = z.infer<typeof GeoPointSchema>;
export type MobileJobStatus = z.infer<typeof MobileJobStatusSchema>;
export type MobileScheduleJob = z.infer<typeof MobileScheduleJobSchema>;
export type CachedDaySchedule = z.infer<typeof CachedDayScheduleSchema>;
export type ChecklistAnswer = z.infer<typeof ChecklistAnswerSchema>;
export type ChecklistDraft = z.infer<typeof ChecklistDraftSchema>;
export type PhotoExif = z.infer<typeof PhotoExifSchema>;
export type NearestClientMatch = z.infer<typeof NearestClientMatchSchema>;
export type PhotoCapture = z.infer<typeof PhotoCaptureSchema>;
export type OfflineOperation = z.infer<typeof OfflineOperationSchema>;
export type MobileConflict = z.infer<typeof MobileConflictSchema>;
export type SyncSummary = z.infer<typeof SyncSummarySchema>;
export type NexiMobileConnection = z.infer<typeof NexiMobileConnectionSchema>;
export type MobilePushRegistration = z.infer<typeof MobilePushRegistrationSchema>;
export type MobileSyncRequest = z.infer<typeof MobileSyncRequestSchema>;
export type MobileSyncResult = z.infer<typeof MobileSyncResultSchema>;
