import { z } from "zod";
import { GeoPointSchema, ServiceAddressSchema } from "../offline/schemas.js";

export const mobileRoleSchema = z.enum(["OWNER", "OFFICE_ADMIN", "TECHNICIAN"]);
export const mobileSessionModeSchema = z.enum(["firebase", "local_dev"]);

export const mobileRuntimeFirebaseSchema = z.object({
  apiKey: z.string(),
  authDomain: z.string(),
  projectId: z.string(),
  storageBucket: z.string(),
  messagingSenderId: z.string(),
  appId: z.string()
});

export const mobileRuntimeConfigSchema = z.object({
  apiBaseUrl: z.string().min(1),
  tenantId: z.string().min(1),
  authRequired: z.boolean(),
  firebaseConfigured: z.boolean(),
  firebase: mobileRuntimeFirebaseSchema
});

export const mobileServerAccessSchema = z.object({
  tenantId: z.string().min(1),
  tenantUserId: z.string().min(1),
  role: mobileRoleSchema,
  accessKind: z.enum(["internal", "job_link"]),
  email: z.string().email().optional()
});

export const mobileSessionSchema = z.object({
  mode: mobileSessionModeSchema,
  tenantId: z.string().min(1),
  tenantUserId: z.string().min(1),
  role: mobileRoleSchema,
  email: z.string().email().optional(),
  userId: z.string().min(1),
  label: z.string().min(1),
  idToken: z.string().nullable().optional(),
  lastAuthenticatedAt: z.string().min(1)
});

export const mobileTenantBrandingSchema = z.object({
  tenantId: z.string().min(1),
  branding: z.object({
    displayName: z.string().min(1),
    logo: z.object({
      url: z.string().min(1).optional()
    }).optional()
  })
});

export const mobileVisitAssignmentSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  propertyId: z.string().nullable().optional(),
  propertyName: z.string().nullable().optional(),
  title: z.string().min(1),
  status: z.enum(["scheduled", "pending_approval", "complete", "cancelled"]),
  start: z.string().min(1),
  end: z.string().min(1),
  serviceAddress: ServiceAddressSchema,
  assignedTo: z.array(z.string().min(1)).default([]),
  checklistRef: z.string().min(1).optional(),
  checklistIds: z.array(z.string().min(1)).default([]),
  notes: z.object({
    gateCode: z.string().optional(),
    accessNotes: z.string().optional(),
    petPresent: z.boolean().optional(),
    petName: z.string().optional(),
    poolType: z.string().optional()
  }),
  details: z.string().default(""),
  jobStatus: z.string().nullable().optional()
});

export const mobileDayScheduleSchema = z.object({
  tenantId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  technicianId: z.string().min(1),
  cachedAt: z.string().min(1),
  expiresAt: z.string().min(1),
  visits: z.array(mobileVisitAssignmentSchema)
});

export const mobileGpsSuggestionSchema = z.object({
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  propertyId: z.string().nullable().optional(),
  propertyName: z.string().nullable().optional(),
  jobId: z.string().nullable().optional(),
  visitId: z.string().nullable().optional(),
  serviceAddress: ServiceAddressSchema,
  distanceMeters: z.number().nonnegative(),
  matchedBy: z.enum(["today_visit", "property_proximity"])
});

export const captureRouteChoiceSchema = z.enum(["existing_client", "request", "decide_later"]);
export const captureSyncStatusSchema = z.enum(["draft", "queued", "syncing", "synced", "failed"]);
export const narrationSourceSchema = z.enum(["typed", "voice"]);
export const transcriptionStatusSchema = z.enum(["ready", "pending_sync", "failed"]);

export const capturePathPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
});

export const captureAnnotationSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("path"),
  color: z.string().min(1).default("#14b8a6"),
  createdAt: z.string().min(1),
  points: z.array(capturePathPointSchema).min(2)
});

export const captureNarrationDraftSchema = z.object({
  id: z.string().min(1),
  source: narrationSourceSchema,
  text: z.string().min(1).default(""),
  createdAt: z.string().min(1),
  audioFileUri: z.string().min(1).optional(),
  audioMimeType: z.string().min(1).optional(),
  transcriptionStatus: transcriptionStatusSchema.default("ready"),
  lastError: z.string().optional(),
  syncedAt: z.string().min(1).optional()
});

export const capturePhotoDraftSchema = z.object({
  id: z.string().min(1),
  localFileUri: z.string().min(1),
  previewUri: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  capturedAt: z.string().min(1),
  gps: GeoPointSchema.optional(),
  caption: z.string().default(""),
  pairingRole: z.enum(["before", "after"]).optional(),
  pairWithMediaId: z.string().min(1).optional(),
  pairOverlayUri: z.string().min(1).optional(),
  annotations: z.array(captureAnnotationSchema).default([]),
  narrations: z.array(captureNarrationDraftSchema).default([]),
  remoteMediaId: z.string().min(1).optional(),
  remoteUrl: z.string().min(1).optional(),
  syncStatus: captureSyncStatusSchema,
  lastError: z.string().optional()
});

export const captureRequestDraftSchema = z.object({
  clientName: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  propertyStreet1: z.string().min(1),
  propertyCity: z.string().min(1),
  propertyProvince: z.string().min(1),
  propertyPostalCode: z.string().min(1),
  issueSummary: z.string().min(1),
  gateCode: z.string().optional(),
  petPresent: z.boolean().default(false),
  petName: z.string().optional(),
  poolType: z.string().optional()
});

export const captureChecklistFieldUpdateSchema = z.object({
  fieldId: z.string().min(1),
  status: z.enum(["pending", "pass", "fail", "not_applicable"]).optional(),
  note: z.string().optional(),
  numberValue: z.number().optional(),
  multiValue: z.array(z.string().min(1)).optional(),
  mediaIds: z.array(z.string().min(1)).optional(),
  localPhotoIds: z.array(z.string().min(1)).optional(),
  photoRequired: z.boolean().optional()
});

export const captureChecklistSectionStateUpdateSchema = z.object({
  section: z.string().min(1),
  status: z.enum(["active", "not_applicable"]),
  updatedBy: z.string().optional()
});

export const captureChecklistDraftSchema = z.object({
  id: z.string().min(1),
  remoteChecklistId: z.string().min(1).optional(),
  templateId: z.string().min(1),
  jobId: z.string().min(1),
  visitId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  updates: z.array(captureChecklistFieldUpdateSchema).default([]),
  sectionStateUpdates: z.array(captureChecklistSectionStateUpdateSchema).default([]),
  complete: z.boolean().default(false),
  syncStatus: captureSyncStatusSchema,
  lastError: z.string().optional(),
  updatedAt: z.string().min(1)
});

export const captureSessionAssignmentSchema = z.object({
  mode: captureRouteChoiceSchema,
  clientId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  requestDraft: captureRequestDraftSchema.optional()
});

export const captureSessionDraftSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  actorTenantUserId: z.string().min(1),
  routeState: z.enum(["fresh", "return_to_camera"]).default("fresh"),
  remoteBatchId: z.string().min(1).optional(),
  visit: mobileVisitAssignmentSchema.optional(),
  suggestion: mobileGpsSuggestionSchema.optional(),
  suggestionAccepted: z.boolean().default(false),
  assignment: captureSessionAssignmentSchema.optional(),
  visitNarrations: z.array(captureNarrationDraftSchema).default([]),
  photos: z.array(capturePhotoDraftSchema).default([]),
  checklists: z.array(captureChecklistDraftSchema).default([]),
  syncStatus: captureSyncStatusSchema,
  failureCount: z.number().int().nonnegative().default(0),
  lastAttemptAt: z.string().optional(),
  nextRetryAt: z.string().optional(),
  lastError: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const captureQueueSummarySchema = z.object({
  pending: z.number().int().nonnegative(),
  syncing: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  synced: z.number().int().nonnegative()
});

export type MobileRole = z.infer<typeof mobileRoleSchema>;
export type MobileRuntimeConfig = z.infer<typeof mobileRuntimeConfigSchema>;
export type MobileServerAccess = z.infer<typeof mobileServerAccessSchema>;
export type MobileSession = z.infer<typeof mobileSessionSchema>;
export type MobileTenantBranding = z.infer<typeof mobileTenantBrandingSchema>;
export type MobileVisitAssignment = z.infer<typeof mobileVisitAssignmentSchema>;
export type MobileDaySchedule = z.infer<typeof mobileDayScheduleSchema>;
export type MobileGpsSuggestion = z.infer<typeof mobileGpsSuggestionSchema>;
export type CaptureRouteChoice = z.infer<typeof captureRouteChoiceSchema>;
export type CaptureSyncStatus = z.infer<typeof captureSyncStatusSchema>;
export type CaptureAnnotation = z.infer<typeof captureAnnotationSchema>;
export type CaptureNarrationDraft = z.infer<typeof captureNarrationDraftSchema>;
export type CapturePhotoDraft = z.infer<typeof capturePhotoDraftSchema>;
export type CaptureRequestDraft = z.infer<typeof captureRequestDraftSchema>;
export type CaptureChecklistFieldUpdate = z.infer<typeof captureChecklistFieldUpdateSchema>;
export type CaptureChecklistSectionStateUpdate = z.infer<typeof captureChecklistSectionStateUpdateSchema>;
export type CaptureChecklistDraft = z.infer<typeof captureChecklistDraftSchema>;
export type CaptureSessionAssignment = z.infer<typeof captureSessionAssignmentSchema>;
export type CaptureSessionDraft = z.infer<typeof captureSessionDraftSchema>;
export type CaptureQueueSummary = z.infer<typeof captureQueueSummarySchema>;
