import { z } from "zod";
import { ServiceAddressSchema } from "../offline/schemas.js";
import {
  captureAnnotationSchema,
  captureChecklistFieldUpdateSchema,
  captureChecklistSectionStateUpdateSchema,
  mobileRoleSchema,
  mobileServerAccessSchema,
  type CaptureAnnotation,
  type CaptureChecklistFieldUpdate,
  type CaptureChecklistSectionStateUpdate,
  type CaptureRequestDraft,
  type MobileRole
} from "./captureModels.js";
import { requestDraftFieldValues } from "./captureHelpers.js";

export interface CaptureApiClientOptions {
  baseUrl: string;
  tokenProvider: () => Promise<string | null>;
  localDevProfileProvider?: () => Promise<string | null>;
}

type JsonRecord = Record<string, unknown>;

const localDevProfileSchema = z.object({
  id: z.string().min(1),
  tenantUserId: z.string().min(1),
  role: mobileRoleSchema,
  email: z.string().email(),
  label: z.string().min(1)
});

const sessionBrandingSchema = z.object({
  displayName: z.string().min(1),
  logoUrl: z.string().min(1).optional()
});

export const mobileSessionBootstrapSchema = z.object({
  access: mobileServerAccessSchema,
  branding: sessionBrandingSchema,
  authRequired: z.boolean(),
  firebaseConfigured: z.boolean(),
  localDevHeader: z.string().min(1),
  localProfiles: z.array(localDevProfileSchema)
});

const mobileDayBoardVisitSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["scheduled", "pending_approval", "complete", "cancelled"]),
  start: z.string().min(1),
  end: z.string().min(1),
  assignedTo: z.array(z.string().min(1)).default([]),
  checklistRef: z.string().min(1).optional(),
  checklistIds: z.array(z.string().min(1)).default([]),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  propertyId: z.string().nullable(),
  propertyName: z.string().nullable(),
  serviceAddress: ServiceAddressSchema,
  notes: z.object({
    gateCode: z.string().optional(),
    accessNotes: z.string().optional(),
    petPresent: z.boolean().optional(),
    petName: z.string().optional(),
    poolType: z.string().optional()
  }),
  details: z.string().default(""),
  jobStatus: z.string().nullable()
});

const mobileDayBoardBatchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["draft", "unassigned", "assigned"]),
  assignmentMode: z.enum(["existing_client", "request", "decide_later"]).nullable(),
  assignedClientId: z.string().nullable(),
  assignedJobId: z.string().nullable(),
  assignedVisitId: z.string().nullable(),
  mediaCount: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  originGps: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  latestGps: z.object({ lat: z.number(), lng: z.number() }).nullable()
});

const mobileDayBoardSuggestionCandidateSchema = z.object({
  kind: z.enum(["today_visit", "known_property"]),
  visitId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  propertyId: z.string().nullable().optional(),
  propertyName: z.string().nullable().optional(),
  serviceAddress: ServiceAddressSchema,
  priority: z.number().int().optional()
});

export const mobileDayBoardSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  technicianId: z.string().min(1),
  visits: z.array(mobileDayBoardVisitSchema),
  batches: z.array(mobileDayBoardBatchSchema),
  suggestionCandidates: z.array(mobileDayBoardSuggestionCandidateSchema)
});

const checklistSectionStateSchema = z.object({
  section: z.string().min(1),
  status: z.enum(["active", "not_applicable"]),
  updatedAt: z.string().min(1),
  updatedBy: z.string().optional()
});

const checklistFieldSchema = z.object({
  fieldId: z.string().min(1),
  label: z.string().min(1),
  section: z.string().min(1),
  type: z.enum(["multi_select", "count", "measurement", "pass_fail", "free_text", "photo_attachment"]),
  memory: z.enum(["property", "visit"]),
  required: z.boolean(),
  photoRequired: z.boolean().default(false),
  helpText: z.string().optional(),
  options: z.array(z.string().min(1)).optional(),
  unit: z.string().optional(),
  status: z.enum(["pending", "pass", "fail", "not_applicable"]).default("pending"),
  note: z.string().optional(),
  numberValue: z.number().optional(),
  multiValue: z.array(z.string().min(1)).optional(),
  mediaIds: z.array(z.string().min(1)).optional()
});

export const mobileChecklistSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  templateId: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  title: z.string().min(1),
  status: z.enum(["draft", "completed"]),
  sectionStates: z.array(checklistSectionStateSchema).default([]),
  fields: z.array(checklistFieldSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  completedAt: z.string().optional(),
  completedBy: z.string().optional()
});

const mediaCommentSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  createdAt: z.string().min(1),
  author: z.string().min(1)
});

const mediaAnnotationSchema = captureAnnotationSchema.extend({
  color: z.string().min(1).optional()
});

export const mobileContextMediaSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  clientId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  captureBatchId: z.string().min(1).optional(),
  type: z.enum(["photo", "video", "audio", "pdf"]),
  storageRef: z.string().min(1),
  thumbRef: z.string().optional(),
  exif: z.object({
    ts: z.string().optional(),
    gps: z.object({ lat: z.number(), lng: z.number() }).optional()
  }).optional(),
  aiTags: z.array(z.string()).default([]),
  manualTags: z.array(z.string()).optional(),
  aiCaption: z.string().optional(),
  comments: z.array(mediaCommentSchema).optional(),
  annotations: z.array(mediaAnnotationSchema).optional(),
  hiddenFromClient: z.boolean().optional()
});

const visitSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  requestId: z.string().min(1).optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  assignedTo: z.array(z.string().min(1)).default([]),
  checklistRef: z.string().min(1).optional(),
  title: z.string().min(1),
  location: z.object({
    label: z.string().min(1),
    address: z.object({
      street1: z.string().min(1),
      city: z.string().min(1),
      province: z.string().min(1),
      postalCode: z.string().min(1),
      country: z.string().min(1).optional()
    }).optional(),
    geo: z.object({ lat: z.number(), lng: z.number() }).optional()
  }),
  status: z.enum(["scheduled", "pending_approval", "complete", "cancelled"]),
  details: z.string().optional()
});

const visitContextBatchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["draft", "unassigned", "assigned"]),
  assignmentMode: z.enum(["existing_client", "request", "decide_later"]).nullable(),
  mediaIds: z.array(z.string().min(1)),
  updatedAt: z.string().min(1)
});

const beforeAfterCandidateSchema = z.object({
  id: z.string().min(1),
  aiCaption: z.string().default(""),
  tags: z.array(z.string()).default([]),
  mediaUrl: z.string().min(1),
  capturedAt: z.string().nullable()
});

export const mobileVisitContextSchema = z.object({
  visit: visitSchema,
  job: z.object({
    id: z.string().min(1),
    tenantId: z.string().min(1),
    clientId: z.string().min(1),
    propertyId: z.string().min(1).optional(),
    status: z.string().min(1),
    title: z.string().min(1),
    lineItems: z.array(z.record(z.unknown())).default([]),
    totals: z.record(z.number()).default({})
  }),
  client: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    emails: z.array(z.string()).default([]),
    phones: z.array(z.string()).default([])
  }).nullable(),
  property: z.object({
    id: z.string().min(1),
    clientId: z.string().min(1),
    siteName: z.string().optional(),
    label: z.string().optional(),
    address: z.object({
      street1: z.string().min(1),
      city: z.string().min(1),
      province: z.string().min(1),
      postalCode: z.string().min(1),
      country: z.string().min(1).optional()
    }),
    access: z.object({
      gateCode: z.string().optional(),
      accessNotes: z.string().optional()
    }).optional(),
    geo: z.object({ lat: z.number(), lng: z.number() }).optional()
  }).nullable(),
  checklists: z.array(mobileChecklistSchema),
  media: z.array(mobileContextMediaSchema),
  captureBatches: z.array(visitContextBatchSchema),
  beforeAfterCandidates: z.array(beforeAfterCandidateSchema)
});

const requestFormSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  intro: z.string().optional()
});

const createdRequestSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  clientName: z.string().min(1),
  status: z.string().min(1)
});

const captureBatchSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  status: z.enum(["draft", "unassigned", "assigned"]),
  assignmentMode: z.enum(["existing_client", "request", "decide_later"]).optional(),
  assignedClientId: z.string().optional(),
  assignedJobId: z.string().optional(),
  assignedVisitId: z.string().optional(),
  assignedRequestId: z.string().optional(),
  mediaIds: z.array(z.string().min(1)).default([]),
  createdBy: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

const uploadResultSchema = z.object({
  media: mobileContextMediaSchema
});

const assignCaptureResultSchema = z.object({
  batch: z.object({
    id: z.string().min(1),
    status: z.enum(["draft", "unassigned", "assigned"]),
    assignmentMode: z.enum(["existing_client", "request", "decide_later"]).optional(),
    assignedClientId: z.string().optional(),
    assignedJobId: z.string().optional(),
    assignedVisitId: z.string().optional(),
    assignedRequestId: z.string().optional(),
    mediaIds: z.array(z.string().min(1)).default([]),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1)
  }),
  request: createdRequestSchema.optional(),
  clientId: z.string().optional()
});

const transcriptionResultSchema = z.object({
  enabled: z.boolean(),
  attempted: z.boolean(),
  transcript: z.string().optional(),
  estimatedCostUsd: z.number().optional(),
  reason: z.string().optional(),
  usageRecordId: z.string().optional()
});

export type MobileSessionBootstrap = z.infer<typeof mobileSessionBootstrapSchema>;
export type MobileLocalProfile = z.infer<typeof localDevProfileSchema>;
export type MobileDayBoard = z.infer<typeof mobileDayBoardSchema>;
export type MobileDayBoardVisit = z.infer<typeof mobileDayBoardVisitSchema>;
export type MobileDayBoardBatch = z.infer<typeof mobileDayBoardBatchSchema>;
export type MobileDayBoardSuggestionCandidate = z.infer<typeof mobileDayBoardSuggestionCandidateSchema>;
export type MobileChecklist = z.infer<typeof mobileChecklistSchema>;
export type MobileContextMedia = z.infer<typeof mobileContextMediaSchema>;
export type MobileVisitContext = z.infer<typeof mobileVisitContextSchema>;
export type MobileRequestForm = z.infer<typeof requestFormSchema>;
export type MobileCreatedRequest = z.infer<typeof createdRequestSchema>;
export type MobileCreatedBatch = z.infer<typeof captureBatchSchema>;
export type MobileTranscriptionResult = z.infer<typeof transcriptionResultSchema>;

async function parseJson(response: Response): Promise<JsonRecord> {
  const body = await response.json() as JsonRecord;
  if (!response.ok || body.ok === false) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${response.status}`);
  }
  return body;
}

export class CaptureApiClient {
  constructor(private readonly options: CaptureApiClientOptions) {}

  async getSession(tenantId?: string): Promise<MobileSessionBootstrap> {
    const query = tenantId?.trim() ? `?tenantId=${encodeURIComponent(tenantId.trim())}` : "";
    const body = await this.request(`/api/mobile/session${query}`);
    return mobileSessionBootstrapSchema.parse(body);
  }

  async getDayBoard(input: { tenantId: string; date: string; technicianId?: string | undefined }): Promise<MobileDayBoard> {
    const params = new URLSearchParams({
      tenantId: input.tenantId,
      date: input.date
    });
    if (input.technicianId?.trim()) {
      params.set("technicianId", input.technicianId.trim());
    }
    const body = await this.request(`/api/mobile/day-board?${params.toString()}`);
    return mobileDayBoardSchema.parse(body.board);
  }

  async getVisitContext(input: { tenantId: string; visitId: string }): Promise<MobileVisitContext> {
    const params = new URLSearchParams({ tenantId: input.tenantId });
    const body = await this.request(`/api/mobile/visits/${encodeURIComponent(input.visitId)}/context?${params.toString()}`);
    return mobileVisitContextSchema.parse(body.context);
  }

  async createCaptureBatch(tenantId: string): Promise<MobileCreatedBatch> {
    const body = await this.request("/api/fielddocs/capture-batches", {
      method: "POST",
      body: JSON.stringify({ tenantId })
    });
    return captureBatchSchema.parse(body.batch);
  }

  async uploadFieldPhoto(input: {
    tenantId: string;
    filename: string;
    mime: string;
    fileBase64: string;
    captureBatchId?: string | undefined;
    clientId?: string | undefined;
    jobId?: string | undefined;
    visitId?: string | undefined;
    propertyId?: string | undefined;
    capturedAt?: string | undefined;
    gps?: { lat: number; lng: number } | undefined;
    capturedBy?: string | undefined;
    tags?: string[] | undefined;
  }): Promise<MobileContextMedia> {
    const body = await this.request("/api/fielddocs/uploads", {
      method: "POST",
      body: JSON.stringify({
        tenantId: input.tenantId,
        filename: input.filename,
        mime: input.mime,
        fileBase64: input.fileBase64,
        ...(input.captureBatchId ? { captureBatchId: input.captureBatchId } : {}),
        ...(input.clientId ? { clientId: input.clientId } : {}),
        ...(input.jobId ? { jobId: input.jobId } : {}),
        ...(input.visitId ? { visitId: input.visitId } : {}),
        ...(input.propertyId ? { propertyId: input.propertyId } : {}),
        ...(input.capturedAt ? { capturedAt: input.capturedAt } : {}),
        ...(input.gps ? { gps: input.gps } : {}),
        ...(input.capturedBy ? { capturedBy: input.capturedBy } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {})
      })
    });
    return uploadResultSchema.parse(body).media;
  }

  async assignCaptureBatch(input: {
    tenantId: string;
    batchId: string;
    mode: "existing_client" | "request" | "decide_later";
    clientId?: string | undefined;
    jobId?: string | undefined;
    visitId?: string | undefined;
    requestId?: string | undefined;
  }): Promise<z.infer<typeof assignCaptureResultSchema>> {
    const body = await this.request(`/api/fielddocs/capture-batches/${encodeURIComponent(input.batchId)}/assign`, {
      method: "POST",
      body: JSON.stringify(input)
    });
    return assignCaptureResultSchema.parse(body);
  }

  async updateVisitNarration(input: { tenantId: string; visitId: string; text: string; append?: boolean | undefined }): Promise<void> {
    await this.request(`/api/mobile/visits/${encodeURIComponent(input.visitId)}/narration`, {
      method: "PUT",
      body: JSON.stringify({
        tenantId: input.tenantId,
        text: input.text,
        append: input.append !== false
      })
    });
  }

  async updateChecklist(input: {
    tenantId: string;
    checklistId: string;
    updates: CaptureChecklistFieldUpdate[];
    sectionStateUpdates?: CaptureChecklistSectionStateUpdate[] | undefined;
    complete?: boolean | undefined;
  }): Promise<MobileChecklist> {
    const body = await this.request(`/api/fielddocs/checklists/${encodeURIComponent(input.checklistId)}`, {
      method: "PUT",
      body: JSON.stringify({
        tenantId: input.tenantId,
        updates: input.updates.map((update) => captureChecklistFieldUpdateSchema.parse(update)),
        sectionStateUpdates: (input.sectionStateUpdates ?? []).map((update) => captureChecklistSectionStateUpdateSchema.parse(update)),
        complete: input.complete === true
      })
    });
    return mobileChecklistSchema.parse(body.checklist);
  }

  async updateMediaReview(input: {
    tenantId: string;
    mediaId: string;
    comment?: string | undefined;
    aiTags?: string[] | undefined;
    manualTags?: string[] | undefined;
    annotations?: CaptureAnnotation[] | undefined;
  }): Promise<MobileContextMedia> {
    const body = await this.request(`/api/fielddocs/media/${encodeURIComponent(input.mediaId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        tenantId: input.tenantId,
        ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
        ...(input.aiTags?.length ? { aiTags: input.aiTags } : {}),
        ...(input.manualTags?.length ? { manualTags: input.manualTags } : {}),
        ...(input.annotations?.length ? { annotations: input.annotations.map((annotation) => captureAnnotationSchema.parse(annotation)) } : {})
      })
    });
    return mobileContextMediaSchema.parse(body.media);
  }

  async transcribeNarration(input: {
    tenantId: string;
    fileName: string;
    mimeType: string;
    audioBase64: string;
    durationMs?: number | undefined;
  }): Promise<MobileTranscriptionResult> {
    const body = await this.request("/api/mobile/transcribe", {
      method: "POST",
      body: JSON.stringify(input)
    });
    return transcriptionResultSchema.parse(body.result);
  }

  async listRequestForms(tenantId: string): Promise<MobileRequestForm[]> {
    const body = await this.request(`/api/crm/request-forms?tenantId=${encodeURIComponent(tenantId)}`);
    return z.array(requestFormSchema).parse(body.forms);
  }

  async createRequest(input: {
    tenantId: string;
    source: "office_new_client";
    formId: string;
    formSlug: string;
    fieldValues: Array<{ key: string; value: string | number | boolean | string[] }>;
  }): Promise<MobileCreatedRequest> {
    const body = await this.request("/api/crm/requests", {
      method: "POST",
      body: JSON.stringify(input)
    });
    return createdRequestSchema.parse(body.request);
  }

  async createRequestFromDraft(tenantId: string, draft: CaptureRequestDraft): Promise<MobileCreatedRequest> {
    const forms = await this.listRequestForms(tenantId);
    const form = forms[0];
    if (!form) {
      throw new Error("No request forms are available for this tenant yet.");
    }
    return this.createRequest({
      tenantId,
      source: "office_new_client",
      formId: form.id,
      formSlug: form.slug,
      fieldValues: requestDraftFieldValues(draft)
    });
  }

  mediaUrl(tenantId: string, mediaId: string): string {
    return `${this.options.baseUrl}/api/media/${encodeURIComponent(mediaId)}?tenantId=${encodeURIComponent(tenantId)}`;
  }

  imageSource(tenantId: string, mediaId: string): { uri: string; headers?: Record<string, string> } {
    const uri = this.mediaUrl(tenantId, mediaId);
    const headers: Record<string, string> = {};
    return { uri, headers };
  }

  private async request(path: string, init: RequestInit = {}): Promise<JsonRecord> {
    const [token, localDevProfile] = await Promise.all([
      this.options.tokenProvider(),
      this.options.localDevProfileProvider ? this.options.localDevProfileProvider() : Promise.resolve(null)
    ]);
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
    if (localDevProfile?.trim()) {
      headers.set("x-nexteam-local-profile", localDevProfile.trim());
    }
    return parseJson(await fetch(`${this.options.baseUrl}${path}`, { ...init, headers }));
  }
}
