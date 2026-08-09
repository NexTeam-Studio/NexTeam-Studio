import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { InMemoryEventBus, RailError, type CaptureBatch, type EventBus, type Media } from "@nexteam/core";
import type { NativeCrmRepository } from "@nexteam/providers";
import type { UsageLogWriter } from "@nexteam/nexi";
import { requireTenantRole } from "../auth/accessContext.js";
import { FirestoreNativeCrmRepository } from "../modules/nexops/shared/persistence/nativeRepository.js";
import type { LedgerService } from "../crm/ledgerFoundation.js";
import { materializeRequestCaptureContext } from "../crm/requestFoundation.js";
import { getAdminDb, getAdminStorageBucket } from "../firebase.js";
import { configuredTenantId } from "../core/tenantConfig.js";
import type { PlatformRepository } from "../platform/repository.js";
import { FirestoreSchedulingRepository, type SchedulingRepository } from "../scheduling/repository.js";
import { checklistTemplateSchema, createLeakDetectionChecklist, summarizeChecklistTemplate } from "./checklists.js";
import { createDraftTemplate, FieldDocsService } from "./fieldDocsService.js";
import { fieldDocsBundleSchema, fieldDocsTextSnippetSchema, fieldReportTemplateSchema } from "./fieldDocsRecords.js";
import { FirestoreMediaRepository, MemoryMediaRepository, type MediaRepository } from "./mediaRepository.js";
import { NexDocsService } from "./nexDocsService.js";
import type { NexDocsOcrFetch } from "./nexDocsOcr.js";
import { searchMediaWithVisionFallback } from "./photoSearch.js";
import { createFieldReportRecord, renderFieldReportPdf, renderSignedDocumentPdf } from "./reportService.js";
import { createNativeMediaFromUpload, storeUploadedMediaBytes, uploadMediaInputSchema } from "./uploadService.js";
import { maybeRunVision } from "./visionPipeline.js";
import { formSchema } from "./forms.js";
import {
  POOL_LEAK_VISION_TAG_TAXONOMY,
  applyVisionSurveyCorrection,
  runVisionSurveyBatch,
  visionSurveyBatchInputSchema,
  visionSurveyCorrectionInputSchema
} from "./visionSurvey.js";

const uploadSessionInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  filename: z.string().min(1),
  mime: z.string().min(1),
  sizeBytes: z.number().int().min(0).optional()
});

const searchQuerySchema = z.object({
  tenantId: z.string().min(1),
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(25).optional()
});

const mediaListQuerySchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  includeTrashed: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const mediaDetailQuerySchema = z.object({
  tenantId: z.string().min(1)
});

const mediaActionBodySchema = z.object({
  tenantId: z.string().min(1)
});

const mediaReviewUpdateInputSchema = z.object({
  tenantId: z.string().min(1),
  aiTags: z.array(z.string().min(1)).optional(),
  manualTags: z.array(z.string().min(1)).optional(),
  comment: z.string().trim().min(1).max(500).optional(),
  hiddenFromClient: z.boolean().optional(),
  trashedAt: z.string().nullable().optional(),
  purgeAfter: z.string().nullable().optional(),
  clientId: z.string().min(1).nullable().optional(),
  jobId: z.string().min(1).nullable().optional(),
  visitId: z.string().min(1).nullable().optional(),
  propertyId: z.string().min(1).nullable().optional(),
  annotations: z.array(z.object({
    id: z.string().min(1).optional(),
    kind: z.literal("path"),
    color: z.string().min(1).max(32).optional(),
    createdAt: z.string().optional(),
    points: z.array(z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1)
    })).min(2)
  })).optional()
});

const captureBatchCreateInputSchema = z.object({
  tenantId: z.string().min(1)
});

const captureBatchListQuerySchema = z.object({
  tenantId: z.string().min(1),
  status: z.enum(["draft", "unassigned", "assigned"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const captureBatchAssignInputSchema = z.object({
  tenantId: z.string().min(1),
  mode: z.enum(["existing_client", "request", "decide_later"]),
  clientId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional()
}).superRefine((value, ctx) => {
  if (value.mode === "existing_client" && !value.clientId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "clientId is required for existing-client assignment.", path: ["clientId"] });
  }
  if (value.mode === "request" && !value.requestId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "requestId is required for request assignment.", path: ["requestId"] });
  }
});

const clientCaptureTargetsQuerySchema = z.object({
  tenantId: z.string().min(1)
});

const checklistCreateInputSchema = z.object({
  tenantId: z.string().min(1),
  templateId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  itemUpdates: z.array(z.object({
    id: z.string().min(1),
    status: z.enum(["pending", "pass", "fail", "not_applicable"]),
    note: z.string().optional()
  })).optional()
});
const formsListQuerySchema = z.object({ tenantId: z.string().min(1) });
const formCreateInputSchema = z.object({ tenantId: z.string().min(1), slug: z.string().min(1), title: z.string().min(1), description: z.string().optional(), active: z.boolean(), fields: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), type: z.enum(["text", "number", "boolean", "select", "multi_select", "date", "media"]), required: z.boolean().default(false), options: z.array(z.string().min(1)).optional(), visibleWhen: z.object({ fieldId: z.string().min(1), equals: z.union([z.string(), z.number(), z.boolean()]) }).optional() })).min(1) });
const formReviseInputSchema = formSchema;
const formResponseInputSchema = z.object({ tenantId: z.string().min(1), formId: z.string().min(1), responseId: z.string().min(1).optional(), values: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])), links: z.object({ clientId: z.string().min(1).optional(), propertyId: z.string().min(1).optional(), jobId: z.string().min(1).optional(), visitId: z.string().min(1).optional(), documentId: z.string().min(1).optional() }).default({}), submit: z.boolean().default(false) });
const formResponsesQuerySchema = z.object({ tenantId: z.string().min(1), formId: z.string().min(1).optional() });

const checklistUpdateInputSchema = z.object({
  tenantId: z.string().min(1),
  updates: z.array(z.object({
    fieldId: z.string().min(1),
    status: z.enum(["pending", "pass", "fail", "not_applicable"]).optional(),
    note: z.string().optional(),
    numberValue: z.number().optional(),
    multiValue: z.array(z.string().min(1)).optional(),
    mediaIds: z.array(z.string().min(1)).optional(),
    photoRequired: z.boolean().optional()
  })).default([]),
  sectionStateUpdates: z.array(z.object({
    section: z.string().min(1),
    status: z.enum(["active", "not_applicable"]),
    updatedBy: z.string().optional()
  })).default([]),
  complete: z.boolean().default(false)
});

const checklistListQuerySchema = z.object({
  tenantId: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  status: z.enum(["draft", "completed"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

const propertyHistoryQuerySchema = z.object({
  tenantId: z.string().min(1),
  templateId: z.string().min(1).optional(),
  fieldId: z.string().min(1).optional()
});

const checklistTemplateInputSchema = checklistTemplateSchema.extend({
  id: z.string().min(1).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

const reportPdfInputSchema = z.object({
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  kind: z.enum(["field_report", "ai_recap"]).default("field_report"),
  title: z.string().min(1),
  findings: z.array(z.string()).default([]),
  mediaIds: z.array(z.string()).default([]),
  checklistId: z.string().min(1).optional(),
  templateId: z.string().min(1).optional(),
  snippetIds: z.array(z.string().min(1)).default([]),
  watermarkEnabled: z.boolean().optional(),
  status: z.enum(["draft", "posted"]).default("posted")
});

const reportListQuerySchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const reportTemplateListQuerySchema = z.object({
  tenantId: z.string().min(1)
});

const bundleListQuerySchema = z.object({
  tenantId: z.string().min(1)
});

const textSnippetListQuerySchema = z.object({
  tenantId: z.string().min(1)
});

const signedDocumentListQuerySchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional()
});

const optionalImageSchema = z.object({
  imageBase64: z.string().min(1).optional(),
  imageMime: z.string().min(1).optional()
});

const fieldReportTemplateInputSchema = fieldReportTemplateSchema.extend({
  id: z.string().min(1).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

const fieldDocsBundleInputSchema = fieldDocsBundleSchema.extend({
  id: z.string().min(1).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

const fieldDocsTextSnippetInputSchema = fieldDocsTextSnippetSchema.extend({
  id: z.string().min(1).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

const signedDocumentCreateInputSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  kind: z.enum(["completion_signoff", "waiver", "change_order", "custom"]),
  title: z.string().min(1),
  bodyText: z.string().min(1)
});

const signedDocumentSignInputSchema = z.object({
  tenantId: z.string().min(1),
  signatureMode: z.enum(["drawn", "typed"]).optional(),
  typedName: z.string().trim().min(1).optional(),
  drawnDataUrl: z.string().trim().min(1).optional()
});

const nexDocsLibraryQuerySchema = z.object({
  tenantId: z.string().min(1),
  q: z.string().trim().optional()
});

const nexDocsFolderCreateInputSchema = z.object({
  tenantId: z.string().min(1),
  label: z.string().trim().min(1)
});

const nexDocsDocumentUploadInputSchema = z.object({
  tenantId: z.string().min(1),
  folderId: z.string().min(1).optional(),
  label: z.string().trim().min(1).optional(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileBase64: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional()
});

const nexDocsDocumentUpdateInputSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  folderId: z.string().min(1).nullable().optional(),
  label: z.string().trim().min(1).optional(),
  hiddenFromClient: z.boolean().optional()
});

const nexDocsDeleteBodySchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1)
});

export interface FieldDocsRouteDeps {
  repository?: MediaRepository | undefined;
  crmRepository?: NativeCrmRepository | undefined;
  schedulingRepository?: SchedulingRepository | undefined;
  ledgerService?: Pick<LedgerService, "listReceiptReviews"> | undefined;
  platformRepository?: Pick<PlatformRepository, "getTenantBranding"> | undefined;
  eventBus?: EventBus | undefined;
  usageLog?: UsageLogWriter | undefined;
  ocrFetch?: NexDocsOcrFetch | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return configuredTenantId(env, "fieldDocsRoute");
}

function nowIso(): string {
  return new Date().toISOString();
}

function plusDaysIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

async function watermarkBranding(
  deps: FieldDocsRouteDeps,
  tenantId: string
): Promise<{ label: string; assetUrl?: string | undefined }> {
  const branding = await deps.platformRepository?.getTenantBranding(tenantId);
  if (!branding) {
    return { label: tenantId };
  }
  return {
    label: branding.displayName,
    ...(branding.logo?.url?.trim() ? { assetUrl: branding.logo.url.trim() } : {})
  };
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown FieldDocs route error";
  res.status(status).json({ ok: false, error: message });
}

async function clientScopedIds(repository: NativeCrmRepository | undefined, tenantId: string, clientId: string): Promise<{ propertyIds: Set<string>; jobIds: Set<string> }> {
  if (!repository) {
    return { propertyIds: new Set(), jobIds: new Set() };
  }
  const [properties, jobs] = await Promise.all([
    repository.listProperties(tenantId),
    repository.listJobs(tenantId)
  ]);
  const propertyIds = new Set(properties.filter((property) => property.clientId === clientId).map((property) => property.id));
  const jobIds = new Set(
    jobs
      .filter((job) => job.clientId === clientId || (job.propertyId ? propertyIds.has(job.propertyId) : false))
      .map((job) => job.id)
  );
  return { propertyIds, jobIds };
}

function mediaTimestamp(value: { exif?: { ts?: string | undefined } | undefined }): string {
  return value.exif?.ts ?? "";
}

async function visitNarrationLines(
  repository: SchedulingRepository | undefined,
  tenantId: string,
  visitId: string | undefined
): Promise<string[]> {
  if (!repository || !visitId) {
    return [];
  }
  const visit = await repository.getVisit(tenantId, visitId);
  const details = visit?.details?.trim() ?? "";
  if (!details) {
    return [];
  }
  return details
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniqueLines(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  values.forEach((value) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }
    if (seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    lines.push(trimmed);
  });
  return lines;
}

function buildAiRecapFindings(input: {
  title: string;
  media: Array<{ aiCaption?: string | undefined; aiTags: string[] }>;
  checklist?: { fields: Array<{ status: string }> } | null | undefined;
}): string[] {
  const completedCount = input.checklist?.fields.filter((field) => field.status !== "pending").length ?? 0;
  const tags = [...new Set(input.media.flatMap((item) => item.aiTags).filter(Boolean))].slice(0, 6);
  const captions = input.media.map((item) => item.aiCaption).filter((value): value is string => Boolean(value?.trim())).slice(0, 3);
  return uniqueLines([
    `${input.title} recap prepared from ${input.media.length} media item${input.media.length === 1 ? "" : "s"} and ${completedCount} completed checklist response${completedCount === 1 ? "" : "s"}.`,
    tags.length ? `Top tags: ${tags.join(", ")}.` : undefined,
    ...captions
  ]);
}

function uniqueIds(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  values
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .forEach((value) => {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
      next.push(value);
    });
  return next;
}

function mediaMatchesClientScope(
  record: Media,
  input: { clientId?: string | undefined },
  scoped: { propertyIds: Set<string>; jobIds: Set<string> } | null
): boolean {
  if (!input.clientId) {
    return true;
  }
  return record.clientId === input.clientId
    || Boolean(record.propertyId && scoped?.propertyIds.has(record.propertyId))
    || Boolean(record.jobId && scoped?.jobIds.has(record.jobId));
}

function batchVisibleForAccess(
  access: Awaited<ReturnType<typeof requireTenantRole>>,
  batch: CaptureBatch
): boolean {
  if (access.role === "TECHNICIAN") {
    return batch.createdBy === access.tenantUserId;
  }
  return true;
}

async function expandCaptureBatch(repository: MediaRepository, batch: CaptureBatch): Promise<CaptureBatch & { media: Media[] }> {
  const media = (await Promise.all(batch.mediaIds.map((id) => repository.getMedia(batch.tenantId, id))))
    .filter((record): record is Media => Boolean(record))
    .sort((left, right) => mediaTimestamp(right).localeCompare(mediaTimestamp(left)));
  return { ...batch, media };
}

async function resolveBatchAssignmentContext(input: {
  tenantId: string;
  crmRepository?: NativeCrmRepository | undefined;
  schedulingRepository?: SchedulingRepository | undefined;
  clientId?: string | undefined;
  jobId?: string | undefined;
  visitId?: string | undefined;
}): Promise<{ clientId?: string | undefined; jobId?: string | undefined; visitId?: string | undefined; propertyId?: string | undefined }> {
  const repository = input.crmRepository;
  if (!repository) {
    return {
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.visitId ? { visitId: input.visitId } : {})
    };
  }

  const [clients, jobs] = await Promise.all([
    repository.listClients(input.tenantId),
    repository.listJobs(input.tenantId)
  ]);
  const client = input.clientId
    ? clients.find((record) => record.id === input.clientId)
    : undefined;
  if (input.clientId && !client) {
    throw new RailError(`Client ${input.clientId} was not found.`, { provider: "native", op: "fieldDocsCaptureAssign", status: 404 });
  }

  let job = input.jobId ? jobs.find((record) => record.id === input.jobId) : undefined;
  if (input.jobId && !job) {
    throw new RailError(`Job ${input.jobId} was not found.`, { provider: "native", op: "fieldDocsCaptureAssign", status: 404 });
  }

  let visit = input.visitId ? await input.schedulingRepository?.getVisit(input.tenantId, input.visitId) : undefined;
  if (input.visitId && !visit) {
    throw new RailError(`Visit ${input.visitId} was not found.`, { provider: "native", op: "fieldDocsCaptureAssign", status: 404 });
  }
  if (visit && !job) {
    job = jobs.find((record) => record.id === visit.jobId);
  }
  if (visit && job && visit.jobId !== job.id) {
    throw new RailError("Selected visit does not belong to the chosen job.", { provider: "native", op: "fieldDocsCaptureAssign", status: 409 });
  }
  if (client && job && job.clientId !== client.id) {
    throw new RailError("Selected job does not belong to that client.", { provider: "native", op: "fieldDocsCaptureAssign", status: 409 });
  }

  return {
    ...(client ? { clientId: client.id } : {}),
    ...(job ? { jobId: job.id } : {}),
    ...(visit ? { visitId: visit.id } : {}),
    ...(job?.propertyId ? { propertyId: job.propertyId } : {})
  };
}

export function registerFieldDocsRoutes(app: Express, deps: FieldDocsRouteDeps = {}): void {
  const env = deps.env ?? process.env;
  const fallbackRepository = deps.repository ?? new MemoryMediaRepository();
  const eventBus = deps.eventBus ?? new InMemoryEventBus();

  function repository(): MediaRepository {
    const db = getAdminDb(env);
    return db ? new FirestoreMediaRepository(db) : fallbackRepository;
  }

  function crmRepository(): NativeCrmRepository | undefined {
    if (deps.crmRepository) {
      return deps.crmRepository;
    }
    const db = getAdminDb(env);
    return db ? new FirestoreNativeCrmRepository(db) : undefined;
  }

  function schedulingRepository(): SchedulingRepository | undefined {
    if (deps.schedulingRepository) {
      return deps.schedulingRepository;
    }
    const db = getAdminDb(env);
    return db ? new FirestoreSchedulingRepository(db) : undefined;
  }

  function fieldDocsService(): FieldDocsService {
    return new FieldDocsService({
      mediaRepository: repository(),
      crmRepository: crmRepository()
    });
  }

  function nexDocsService(): NexDocsService {
    const crm = crmRepository();
    if (!crm) {
      throw new RailError("Native CRM is not configured for NexDocs.", { provider: "native", op: "nexDocsService", status: 503 });
    }
    return new NexDocsService({
      mediaRepository: repository(),
      crmRepository: crm,
      ledgerService: deps.ledgerService,
      usageLog: deps.usageLog,
      ocrFetch: deps.ocrFetch
    });
  }

  function parseStorageRef(storageRef: string): { bucketName: string; objectPath: string } | null {
    const match = storageRef.match(/^gs:\/\/([^/]+)\/(.+)$/);
    return match ? { bucketName: match[1]!, objectPath: match[2]! } : null;
  }

  async function sendNexDocsFile(res: Response, input: {
    storageRef: string;
    fallbackFileName: string;
    fallbackMimeType: string;
    download: boolean;
  }): Promise<void> {
    const storageRef = parseStorageRef(input.storageRef);
    if (!storageRef) {
      throw new RailError("NexDocs file is missing a valid storage reference.", { provider: "firebase", op: "fetchNexDocsFile", status: 409 });
    }
    const bucket = getAdminStorageBucket(env);
    if (!bucket) {
      throw new RailError("Firebase Storage is not configured for NexDocs file reads.", { provider: "firebase", op: "fetchNexDocsFile", status: 503 });
    }
    if (bucket.name !== storageRef.bucketName) {
      throw new RailError("NexDocs file is stored in a different Firebase bucket.", { provider: "firebase", op: "fetchNexDocsFile", status: 409 });
    }
    const file = bucket.file(storageRef.objectPath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new RailError("NexDocs file was not found in Storage.", { provider: "firebase", op: "fetchNexDocsFile", status: 404 });
    }
    const [metadata] = await file.getMetadata();
    res.setHeader("content-type", String(metadata.contentType ?? input.fallbackMimeType));
    if (input.download) {
      res.setHeader("content-disposition", `attachment; filename="${input.fallbackFileName.replace(/"/g, "")}"`);
    }
    file.createReadStream().pipe(res);
  }

  app.post("/api/fielddocs/uploads/sessions", (req: Request, res: Response) => {
    try {
      const input = uploadSessionInputSchema.parse(req.body);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const sessionId = `upload_${randomUUID()}`;
      res.status(201).json({
        ok: true,
        session: {
          id: sessionId,
          tenantId,
          filename: input.filename,
          mime: input.mime,
          sizeBytes: input.sizeBytes ?? null,
          uploadUrl: `/api/fielddocs/uploads?sessionId=${encodeURIComponent(sessionId)}`,
          resumable: true
        }
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/uploads", async (req: Request, res: Response) => {
    try {
      const input = uploadMediaInputSchema.parse(req.body);
      const imageInput = optionalImageSchema.parse(req.body);
      const repo = repository();
      const captureBatch = input.captureBatchId ? await repo.getCaptureBatch(input.tenantId, input.captureBatchId) : null;
      if (input.captureBatchId && !captureBatch) {
        throw new RailError(`Capture batch ${input.captureBatchId} was not found.`, { provider: "native", op: "fieldDocsUpload", status: 404 });
      }
      const scopedInput = captureBatch?.status === "assigned"
        ? {
            ...input,
            clientId: input.clientId ?? captureBatch.assignedClientId,
            jobId: input.jobId ?? captureBatch.assignedJobId,
            visitId: input.visitId ?? captureBatch.assignedVisitId
          }
        : input;
      const initial = createNativeMediaFromUpload(scopedInput);
      const image = imageInput.imageBase64 && imageInput.imageMime
        ? { base64: imageInput.imageBase64, mime: imageInput.imageMime }
        : undefined;
      const stored = await storeUploadedMediaBytes({
        media: initial,
        filename: input.filename,
        mime: input.mime,
        fileBase64: input.fileBase64,
        env
      });
      const vision = await maybeRunVision(stored, env, image);
      const saved = await repo.saveMedia(vision.media);
      if (captureBatch) {
        await repo.updateCaptureBatch(input.tenantId, captureBatch.id, {
          mediaIds: uniqueIds([...captureBatch.mediaIds, saved.id]),
          latestCapturedAt: saved.exif?.ts ?? captureBatch.latestCapturedAt,
          originGps: captureBatch.originGps ?? saved.exif?.gps,
          latestGps: saved.exif?.gps ?? captureBatch.latestGps,
          updatedAt: nowIso()
        });
        const requestRepository = crmRepository();
        if (captureBatch.assignmentMode === "request" && captureBatch.assignedRequestId && requestRepository) {
          const request = await requestRepository.getRequest(saved.tenantId, captureBatch.assignedRequestId);
          if (request) {
            await materializeRequestCaptureContext(requestRepository, request, [saved.id]);
          }
        }
      }
      await eventBus.emit({
        tenantId: saved.tenantId,
        type: "media.uploaded",
        payload: {
          mediaId: saved.id,
          jobId: saved.jobId ?? null,
          storageRef: saved.storageRef,
          ...(saved.capturedBy ? { capturedBy: saved.capturedBy } : {})
        }
      });
      res.status(201).json({ ok: true, media: saved, vision: { enabled: vision.enabled, reason: vision.reason ?? null } });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/capture-batches", async (req: Request, res: Response) => {
    try {
      const input = captureBatchCreateInputSchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: input.tenantId,
        op: "createCaptureBatch"
      });
      const timestamp = nowIso();
      const batch = await repository().saveCaptureBatch({
        id: `capture_batch_${randomUUID()}`,
        tenantId: input.tenantId,
        status: "draft",
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: access.tenantUserId,
        mediaIds: []
      });
      res.status(201).json({ ok: true, batch, media: [] });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/capture-batches", async (req: Request, res: Response) => {
    try {
      const input = captureBatchListQuerySchema.parse(req.query);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: input.tenantId,
        op: "listCaptureBatches"
      });
      const batches = (await repository().listCaptureBatches(input.tenantId))
        .filter((batch) => !input.status || batch.status === input.status)
        .filter((batch) => batchVisibleForAccess(access, batch))
        .slice(0, input.limit ?? 50);
      const expanded = await Promise.all(batches.map((batch) => expandCaptureBatch(repository(), batch)));
      res.json({ ok: true, batches: expanded });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/clients/:id/targets", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "fieldDocsClientTargets", status: 400 });
      }
      const input = clientCaptureTargetsQuerySchema.parse(req.query);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: input.tenantId,
        op: "fieldDocsClientTargets"
      });
      const repositoryForTenant = crmRepository();
      if (!repositoryForTenant) {
        res.json({ ok: true, jobs: [], visits: [] });
        return;
      }
      const jobs = (await repositoryForTenant.listJobs(input.tenantId))
        .filter((job) => job.clientId === clientId)
        .filter((job) => job.status !== "Archived");
      const visits = (await schedulingRepository()?.listVisits(input.tenantId, {}) ?? [])
        .filter((visit) => jobs.some((job) => job.id === visit.jobId))
        .filter((visit) => visit.status !== "complete" && visit.status !== "cancelled");
      res.json({
        ok: true,
        jobs: jobs.map((job) => ({
          id: job.id,
          number: job.number,
          title: job.title,
          status: job.status,
          propertyId: job.propertyId
        })),
        visits: visits.map((visit) => ({
          id: visit.id,
          jobId: visit.jobId,
          title: visit.title,
          status: visit.status,
          start: visit.start,
          end: visit.end
        }))
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/search", async (req: Request, res: Response) => {
    try {
      const input = searchQuerySchema.parse(req.query);
      const hits = await searchMediaWithVisionFallback(await repository().listMedia(input.tenantId), input.q, input.limit ?? 10, env);
      res.json({
        ok: true,
        hits: hits.map((hit) => ({
          ...hit.media,
          score: hit.score,
          matched: hit.matched
        }))
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/checklists/templates", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId
        : defaultTenantId(env);
      const templates = await fieldDocsService().listTemplates(tenantId);
      res.json({
        ok: true,
        tenantId,
        templates: templates.map((template) => summarizeChecklistTemplate(template))
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/media", async (req: Request, res: Response) => {
    try {
      const input = mediaListQuerySchema.parse(req.query);
      const scoped = input.clientId ? await clientScopedIds(crmRepository(), input.tenantId, input.clientId) : null;
      const media = (await repository().listMedia(input.tenantId))
        .filter((record) => input.includeTrashed ? true : !record.trashedAt)
        .filter((record) => !input.propertyId || record.propertyId === input.propertyId)
        .filter((record) => !input.jobId || record.jobId === input.jobId)
        .filter((record) => !input.visitId || record.visitId === input.visitId)
        .filter((record) => mediaMatchesClientScope(record, input, scoped))
        .filter((record) => {
          const ts = mediaTimestamp(record);
          return (!input.dateFrom || !ts || ts >= input.dateFrom) && (!input.dateTo || !ts || ts <= input.dateTo);
        })
        .sort((left, right) => mediaTimestamp(right).localeCompare(mediaTimestamp(left)))
        .slice(0, input.limit ?? 50);
      res.json({ ok: true, media });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/media/:id", async (req: Request, res: Response) => {
    try {
      const mediaId = req.params.id;
      if (!mediaId) {
        throw new RailError("Media id is required.", { provider: "native", op: "fieldDocsMediaDetail", status: 400 });
      }
      const input = mediaDetailQuerySchema.parse(req.query);
      const media = await repository().getMedia(input.tenantId, mediaId);
      if (!media) {
        throw new RailError(`Media ${mediaId} was not found.`, { provider: "native", op: "fieldDocsMediaDetail", status: 404 });
      }
      res.json({ ok: true, media });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/fielddocs/media/:id", async (req: Request, res: Response) => {
    try {
      const mediaId = req.params.id;
      if (!mediaId) {
        throw new RailError("Media id is required.", { provider: "native", op: "fieldDocsMediaReview", status: 400 });
      }
      const input = mediaReviewUpdateInputSchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: input.tenantId,
        op: "fieldDocsMediaReview"
      });
      const existing = await repository().getMedia(input.tenantId, mediaId);
      if (!existing) {
        throw new RailError(`Media ${mediaId} was not found.`, { provider: "native", op: "fieldDocsMediaReview", status: 404 });
      }
      const nextComments = input.comment
        ? [
            ...(existing.comments ?? []),
            {
              id: `comment_${randomUUID()}`,
              text: input.comment,
              createdAt: nowIso(),
              author: access.email ?? `${access.role.toLowerCase()}:${access.tenantUserId}`
            }
          ]
        : existing.comments;
      const nextAnnotations = input.annotations
        ? input.annotations.map((annotation) => ({
            id: annotation.id ?? `annotation_${randomUUID()}`,
            kind: "path" as const,
            color: annotation.color,
            createdAt: annotation.createdAt ?? nowIso(),
            points: annotation.points
          }))
        : existing.annotations;
      const assignmentContext = (input.clientId !== undefined || input.jobId !== undefined || input.visitId !== undefined)
        ? await resolveBatchAssignmentContext({
            tenantId: input.tenantId,
            crmRepository: crmRepository(),
            schedulingRepository: schedulingRepository(),
            ...(input.clientId ? { clientId: input.clientId } : {}),
            ...(input.jobId ? { jobId: input.jobId } : {}),
            ...(input.visitId ? { visitId: input.visitId } : {})
          })
        : {};
      const media = await repository().updateMedia(input.tenantId, mediaId, {
        ...(input.aiTags ? { aiTags: input.aiTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean) } : {}),
        ...(input.manualTags ? { manualTags: input.manualTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean) } : {}),
        ...(nextComments ? { comments: nextComments } : {}),
        ...(input.hiddenFromClient !== undefined ? { hiddenFromClient: input.hiddenFromClient } : {}),
        ...(nextAnnotations ? { annotations: nextAnnotations } : {}),
        ...(input.clientId !== undefined ? { clientId: input.clientId ?? undefined } : {}),
        ...(input.jobId !== undefined ? { jobId: assignmentContext.jobId ?? undefined } : {}),
        ...(input.visitId !== undefined ? { visitId: assignmentContext.visitId ?? undefined } : {}),
        ...(input.propertyId !== undefined
          ? { propertyId: input.propertyId ?? assignmentContext.propertyId ?? undefined }
          : assignmentContext.propertyId
            ? { propertyId: assignmentContext.propertyId }
            : {})
      });
      res.json({ ok: true, media });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/capture-batches/:id/assign", async (req: Request, res: Response) => {
    try {
      const batchId = req.params.id;
      if (!batchId) {
        throw new RailError("Capture batch id is required.", { provider: "native", op: "assignCaptureBatch", status: 400 });
      }
      const input = captureBatchAssignInputSchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: input.tenantId,
        op: "assignCaptureBatch"
      });
      const repo = repository();
      const batch = await repo.getCaptureBatch(input.tenantId, batchId);
      if (!batch) {
        throw new RailError(`Capture batch ${batchId} was not found.`, { provider: "native", op: "assignCaptureBatch", status: 404 });
      }
      if (!batchVisibleForAccess(access, batch)) {
        throw new RailError("Your role cannot access that capture batch.", { provider: "native", op: "assignCaptureBatch", status: 403 });
      }
      const media = (await Promise.all(batch.mediaIds.map((id) => repo.getMedia(input.tenantId, id))))
        .filter((record): record is Media => Boolean(record));
      const timestamp = nowIso();
      let requestRecord = null;
      let assignmentClientId: string | undefined;
      let assignmentJobId: string | undefined;
      let assignmentVisitId: string | undefined;

      if (input.mode === "decide_later") {
        for (const record of media) {
          await repo.updateMedia(access.tenantId, record.id, {
            clientId: undefined,
            jobId: undefined,
            visitId: undefined,
            propertyId: undefined
          });
        }
      } else if (input.mode === "existing_client") {
        const assignment = await resolveBatchAssignmentContext({
          tenantId: input.tenantId,
          crmRepository: crmRepository(),
          schedulingRepository: schedulingRepository(),
          clientId: input.clientId,
          jobId: input.jobId,
          visitId: input.visitId
        });
        assignmentClientId = assignment.clientId;
        assignmentJobId = assignment.jobId;
        assignmentVisitId = assignment.visitId;
        for (const record of media) {
          await repo.updateMedia(access.tenantId, record.id, {
            clientId: assignment.clientId,
            jobId: assignment.jobId,
            visitId: assignment.visitId,
            propertyId: assignment.jobId || assignment.visitId ? assignment.propertyId : undefined
          });
        }
      } else {
        const requestRepository = crmRepository();
        if (!requestRepository || !input.requestId) {
          throw new RailError("Request assignment is not configured in this environment.", { provider: "native", op: "assignCaptureBatch", status: 503 });
        }
        const request = await requestRepository.getRequest(input.tenantId, input.requestId);
        if (!request) {
          throw new RailError(`Request ${input.requestId} was not found.`, { provider: "native", op: "assignCaptureBatch", status: 404 });
        }
        const materialized = await materializeRequestCaptureContext(requestRepository, request, batch.mediaIds);
        requestRecord = materialized.request;
        assignmentClientId = materialized.client.id;
        for (const record of media) {
          await repo.updateMedia(access.tenantId, record.id, {
            clientId: materialized.client.id,
            jobId: undefined,
            visitId: undefined,
            propertyId: undefined
          });
        }
      }

      const nextBatch = await repo.updateCaptureBatch(access.tenantId, batch.id, {
        status: input.mode === "decide_later" ? "unassigned" : "assigned",
        assignmentMode: input.mode,
        assignedClientId: input.mode === "decide_later" ? undefined : assignmentClientId,
        assignedJobId: input.mode === "existing_client" ? assignmentJobId : undefined,
        assignedVisitId: input.mode === "existing_client" ? assignmentVisitId : undefined,
        assignedRequestId: input.mode === "request" ? input.requestId : undefined,
        assignedAt: input.mode === "decide_later" ? undefined : timestamp,
        updatedAt: timestamp
      });
      const expanded = await expandCaptureBatch(repo, nextBatch);
      res.json({
        ok: true,
        batch: expanded,
        ...(requestRecord ? { request: requestRecord } : {}),
        ...(assignmentClientId ? { clientId: assignmentClientId } : {})
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/media/:id/trash", async (req: Request, res: Response) => {
    try {
      const mediaId = req.params.id;
      if (!mediaId) {
        throw new RailError("Media id is required.", { provider: "native", op: "trashFieldDocsMedia", status: 400 });
      }
      const input = mediaActionBodySchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "trashFieldDocsMedia"
      });
      const existing = await repository().getMedia(input.tenantId, mediaId);
      if (!existing) {
        throw new RailError(`Media ${mediaId} was not found.`, { provider: "native", op: "trashFieldDocsMedia", status: 404 });
      }
      const media = await repository().updateMedia(access.tenantId, mediaId, {
        trashedAt: nowIso(),
        trashedBy: access.tenantUserId,
        purgeAfter: plusDaysIso(30)
      });
      res.json({ ok: true, media });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/media/:id/restore", async (req: Request, res: Response) => {
    try {
      const mediaId = req.params.id;
      if (!mediaId) {
        throw new RailError("Media id is required.", { provider: "native", op: "restoreFieldDocsMedia", status: 400 });
      }
      const input = mediaActionBodySchema.parse(req.body ?? {});
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "restoreFieldDocsMedia"
      });
      const existing = await repository().getMedia(input.tenantId, mediaId);
      if (!existing) {
        throw new RailError(`Media ${mediaId} was not found.`, { provider: "native", op: "restoreFieldDocsMedia", status: 404 });
      }
      const media = await repository().updateMedia(input.tenantId, mediaId, {
        trashedAt: undefined,
        trashedBy: undefined,
        purgeAfter: undefined
      });
      res.json({ ok: true, media });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/checklists/templates", async (req: Request, res: Response) => {
    try {
      const input = checklistTemplateInputSchema.parse(req.body);
      const saved = input.id
        ? await fieldDocsService().upsertTemplate({
            ...input,
            id: input.id,
            createdAt: input.createdAt ?? nowIso(),
            updatedAt: nowIso()
          })
        : await fieldDocsService().upsertTemplate(createDraftTemplate({
            tenantId: input.tenantId,
            title: input.title,
            slug: input.slug,
            description: input.description,
            appliesTo: input.appliesTo,
            fields: input.fields
          }));
      res.status(201).json({ ok: true, template: summarizeChecklistTemplate(saved) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/forms", async (req: Request, res: Response) => { try { const input = formsListQuerySchema.parse(req.query); await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: input.tenantId, op: "listTenantForms" }); res.json({ ok: true, forms: await fieldDocsService().listForms(input.tenantId) }); } catch (error) { sendRouteError(res, error); } });
  app.post("/api/fielddocs/forms", async (req: Request, res: Response) => { try { const input = formCreateInputSchema.parse(req.body); await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: input.tenantId, op: "createTenantForm" }); res.status(201).json({ ok: true, form: await fieldDocsService().createForm(input) }); } catch (error) { sendRouteError(res, error); } });
  app.put("/api/fielddocs/forms/:id", async (req: Request, res: Response) => { try { const id = req.params.id; if (!id) throw new RailError("Form id is required.", { provider: "native", op: "reviseTenantForm", status: 400 }); const input = formReviseInputSchema.parse({ ...req.body, id }); await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: input.tenantId, op: "reviseTenantForm" }); res.json({ ok: true, form: await fieldDocsService().reviseForm(input) }); } catch (error) { sendRouteError(res, error); } });
  app.get("/api/fielddocs/form-responses", async (req: Request, res: Response) => { try { const input = formResponsesQuerySchema.parse(req.query); await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: input.tenantId, op: "listFormResponses" }); res.json({ ok: true, responses: await fieldDocsService().listFormResponses(input.tenantId, input.formId) }); } catch (error) { sendRouteError(res, error); } });
  app.get("/api/fielddocs/form-responses/:id/audit", async (req: Request, res: Response) => { try { const tenantId = formsListQuerySchema.parse(req.query).tenantId; const id = req.params.id; if (!id) throw new RailError("Response id is required.", { provider: "native", op: "listFormAudit", status: 400 }); await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "listFormAudit" }); res.json({ ok: true, audit: await repository().listFormAudit(tenantId, id) }); } catch (error) { sendRouteError(res, error); } });
  app.post("/api/fielddocs/form-responses", async (req: Request, res: Response) => { try { const input = formResponseInputSchema.parse(req.body); const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: input.tenantId, op: "saveFormResponse" }); const response = await fieldDocsService().saveFormResponse({ tenantId: input.tenantId, formId: input.formId, values: input.values, links: input.links, submit: input.submit, actorId: access.tenantUserId, ...(input.responseId ? { responseId: input.responseId } : {}) }); res.status(input.responseId ? 200 : 201).json({ ok: true, response }); } catch (error) { sendRouteError(res, error); } });

  app.get("/api/fielddocs/checklists", async (req: Request, res: Response) => {
    try {
      const input = checklistListQuerySchema.parse(req.query);
      const checklists = await fieldDocsService().listChecklists(input);
      res.json({ ok: true, checklists });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/properties/:propertyId/history", async (req: Request, res: Response) => {
    try {
      const propertyId = req.params.propertyId;
      if (!propertyId) {
        throw new RailError("Property id is required.", { provider: "native", op: "fieldDocsPropertyHistory", status: 400 });
      }
      const input = propertyHistoryQuerySchema.parse(req.query);
      const history = await fieldDocsService().getPropertyHistory({
        tenantId: input.tenantId,
        propertyId,
        templateId: input.templateId,
        fieldId: input.fieldId
      });
      res.json({ ok: true, history });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/reports", async (req: Request, res: Response) => {
    try {
      const input = reportListQuerySchema.parse(req.query);
      const scoped = input.clientId ? await clientScopedIds(crmRepository(), input.tenantId, input.clientId) : null;
      const reports = (await repository().listReports(input.tenantId))
        .filter((record) => !input.propertyId || record.propertyId === input.propertyId)
        .filter((record) => !input.jobId || record.jobId === input.jobId)
        .filter((record) => !input.visitId || record.visitId === input.visitId)
        .filter((record) => !scoped || scoped.propertyIds.has(record.propertyId ?? "") || scoped.jobIds.has(record.jobId))
        .filter((record) => {
          const ts = record.postedAt ?? record.createdAt;
          return (!input.dateFrom || ts >= input.dateFrom) && (!input.dateTo || ts <= input.dateTo);
        })
        .sort((left, right) => (right.postedAt ?? right.createdAt).localeCompare(left.postedAt ?? left.createdAt))
        .slice(0, input.limit ?? 50);
      res.json({ ok: true, reports });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/vision-survey/taxonomy", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "fielddocsVisionTaxonomy"
      });
      res.json({ ok: true, tenantId: access.tenantId, taxonomy: POOL_LEAK_VISION_TAG_TAXONOMY });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/vision-survey/batches", async (req: Request, res: Response) => {
    try {
      const input = visionSurveyBatchInputSchema.parse(req.body ?? {});
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "fielddocsVisionSurveyBatch"
      });
      const result = await runVisionSurveyBatch(repository(), access.tenantId, { ...input, tenantId: access.tenantId });
      res.status(result.status === "blocked_budget" ? 409 : 201).json({ ok: result.status !== "blocked_budget", ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/vision-survey/corrections", async (req: Request, res: Response) => {
    try {
      const input = visionSurveyCorrectionInputSchema.parse(req.body ?? {});
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "fielddocsVisionSurveyCorrection"
      });
      const media = await applyVisionSurveyCorrection(repository(), access.tenantId, { ...input, tenantId: access.tenantId });
      res.json({ ok: true, media });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/checklists/leak-detection", async (req: Request, res: Response) => {
    try {
      const input = checklistCreateInputSchema.parse(req.body);
      const checklist = await repository().saveChecklist(createLeakDetectionChecklist(input));
      res.status(201).json({ ok: true, checklist });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/checklists", async (req: Request, res: Response) => {
    try {
      const input = checklistCreateInputSchema.parse(req.body);
      const checklist = await fieldDocsService().createChecklist({
        tenantId: input.tenantId,
        templateId: input.templateId ?? "leak_detection_checklist_v1",
        propertyId: input.propertyId,
        jobId: input.jobId,
        visitId: input.visitId
      });
      const seeded = input.itemUpdates?.length
        ? await fieldDocsService().updateChecklist({
            tenantId: input.tenantId,
            checklistId: checklist.id,
            updates: input.itemUpdates.map((item) => ({
              fieldId: item.id,
              ...(item.status !== undefined ? { status: item.status } : {}),
              ...(item.note !== undefined ? { note: item.note } : {})
            }))
          })
        : checklist;
      res.status(201).json({ ok: true, checklist: seeded });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.put("/api/fielddocs/checklists/:id", async (req: Request, res: Response) => {
    try {
      const checklistId = req.params.id;
      if (!checklistId) {
        throw new RailError("Checklist id is required.", { provider: "native", op: "updateChecklist", status: 400 });
      }
      const input = checklistUpdateInputSchema.parse(req.body);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: input.tenantId,
        op: "updateChecklist"
      });
      const existing = await repository().getChecklist(input.tenantId, checklistId);
      const wasCompleted = existing?.status === "completed";
      const checklist = await fieldDocsService().updateChecklist({
        tenantId: input.tenantId,
        checklistId,
        updates: input.updates,
        sectionStateUpdates: input.sectionStateUpdates,
        complete: input.complete,
        actorId: access.tenantUserId
      });
      if (!wasCompleted && checklist.status === "completed") {
        await eventBus.emit({
          tenantId: checklist.tenantId,
          type: "checklist.completed",
          payload: {
            checklistId: checklist.id,
            ...(checklist.jobId ? { jobId: checklist.jobId } : {}),
            ...(checklist.visitId ? { visitId: checklist.visitId } : {}),
            ...(checklist.propertyId ? { propertyId: checklist.propertyId } : {}),
            completedBy: access.tenantUserId
          }
        });
      }
      res.json({ ok: true, checklist });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/reports/templates", async (req: Request, res: Response) => {
    try {
      const input = reportTemplateListQuerySchema.parse(req.query);
      const templates = await fieldDocsService().listReportTemplates(input.tenantId);
      res.json({ ok: true, templates });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/reports/templates", async (req: Request, res: Response) => {
    try {
      const input = fieldReportTemplateInputSchema.parse(req.body);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "upsertFieldReportTemplate"
      });
      const template = await fieldDocsService().upsertReportTemplate({
        ...input,
        id: input.id ?? `field_report_template_${randomUUID()}`,
        createdAt: input.createdAt ?? nowIso(),
        updatedAt: nowIso()
      });
      res.status(201).json({ ok: true, template });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/bundles", async (req: Request, res: Response) => {
    try {
      const input = bundleListQuerySchema.parse(req.query);
      const bundles = await fieldDocsService().listBundles(input.tenantId);
      res.json({ ok: true, bundles });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/bundles", async (req: Request, res: Response) => {
    try {
      const input = fieldDocsBundleInputSchema.parse(req.body);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "upsertFieldDocsBundle"
      });
      const bundle = await fieldDocsService().upsertBundle({
        ...input,
        id: input.id ?? `fielddocs_bundle_${randomUUID()}`,
        createdAt: input.createdAt ?? nowIso(),
        updatedAt: nowIso()
      });
      res.status(201).json({ ok: true, bundle });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/text-snippets", async (req: Request, res: Response) => {
    try {
      const input = textSnippetListQuerySchema.parse(req.query);
      const snippets = await fieldDocsService().listTextSnippets(input.tenantId);
      res.json({ ok: true, snippets });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/text-snippets", async (req: Request, res: Response) => {
    try {
      const input = fieldDocsTextSnippetInputSchema.parse(req.body);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "upsertFieldDocsTextSnippet"
      });
      const snippet = await fieldDocsService().upsertTextSnippet({
        ...input,
        id: input.id ?? `fielddocs_snippet_${randomUUID()}`,
        createdAt: input.createdAt ?? nowIso(),
        updatedAt: nowIso()
      });
      res.status(201).json({ ok: true, snippet });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/reports", async (req: Request, res: Response) => {
    try {
      const input = reportPdfInputSchema.parse(req.body);
      const repo = repository();
      const service = fieldDocsService();
      const media = (await Promise.all(input.mediaIds.map((id) => repo.getMedia(input.tenantId, id))))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const checklist = input.checklistId
        ? await repo.getChecklist(input.tenantId, input.checklistId)
        : createLeakDetectionChecklist({ tenantId: input.tenantId, jobId: input.jobId });
      const reportTemplate = input.templateId
        ? await service.getReportTemplate(input.tenantId, input.templateId)
        : null;
      const snippets = input.snippetIds.length
        ? (await service.listTextSnippets(input.tenantId)).filter((snippet) => input.snippetIds.includes(snippet.id))
        : [];
      const visitNotes = await visitNarrationLines(schedulingRepository(), input.tenantId, input.visitId);
      const findings = input.kind === "ai_recap"
        ? buildAiRecapFindings({ title: input.title, media, checklist })
        : uniqueLines([
            ...input.findings,
            ...(reportTemplate?.sections.map((section) => section.defaultText) ?? []),
            ...snippets.map((snippet) => snippet.bodyText),
            ...visitNotes
          ]);
      const report = createFieldReportRecord({
        tenantId: input.tenantId,
        jobId: input.jobId,
        propertyId: input.propertyId,
        visitId: input.visitId,
        kind: input.kind,
        title: input.title,
        findings,
        mediaIds: media.map((item) => item.id),
        checklistId: checklist?.id,
        ...(input.templateId ? { templateId: input.templateId } : {}),
        ...(input.snippetIds.length ? { snippetIds: input.snippetIds } : {}),
        ...(input.watermarkEnabled !== undefined ? { watermarkEnabled: input.watermarkEnabled } : {}),
        status: input.status
      });
      const saved = await repo.saveReport(report);
      const pdfUrl = `/api/fielddocs/reports/${encodeURIComponent(saved.id)}/pdf?tenantId=${encodeURIComponent(saved.tenantId)}`;
      res.status(201).json({ ok: true, report: saved, pdfUrl });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/reports/pdf", async (req: Request, res: Response) => {
    try {
      const input = reportPdfInputSchema.parse(req.body);
      const repo = repository();
      const media = (await Promise.all(input.mediaIds.map((id) => repo.getMedia(input.tenantId, id))))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const checklist = input.checklistId
        ? await repo.getChecklist(input.tenantId, input.checklistId)
        : createLeakDetectionChecklist({ tenantId: input.tenantId, jobId: input.jobId });
      const watermark = input.watermarkEnabled ? await watermarkBranding(deps, input.tenantId) : null;
      const attachedChecklist = checklist ?? undefined;
      const visitNotes = await visitNarrationLines(schedulingRepository(), input.tenantId, input.visitId);
      res.setHeader("content-type", "application/pdf");
      res.send(renderFieldReportPdf({
        tenantId: input.tenantId,
        jobId: input.jobId,
        propertyId: input.propertyId,
        visitId: input.visitId,
        kind: input.kind,
        title: input.title,
        findings: input.findings,
        media,
        checklist: attachedChecklist,
        ...(visitNotes.length ? { visitNotes } : {}),
        ...(watermark ? { watermarkLabel: watermark.label } : {}),
        ...(watermark?.assetUrl ? { watermarkAssetUrl: watermark.assetUrl } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/reports/:id/pdf", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const reportId = req.params.id;
      if (!reportId) {
        throw new RailError("Report id is required.", { provider: "native", op: "renderFieldReportPdf", status: 400 });
      }
      const repo = repository();
      const report = await repo.getReport(tenantId, reportId);
      if (!report) {
        throw new RailError(`Field report ${reportId} was not found.`, { provider: "native", op: "renderFieldReportPdf", status: 404 });
      }
      const media = (await Promise.all(report.mediaIds.map((id) => repo.getMedia(report.tenantId, id))))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const checklist = report.checklistId ? await repo.getChecklist(report.tenantId, report.checklistId) : undefined;
      const watermark = report.watermarkEnabled ? await watermarkBranding(deps, report.tenantId) : null;
      const attachedChecklist = checklist ?? undefined;
      const visitNotes = await visitNarrationLines(schedulingRepository(), report.tenantId, report.visitId);
      res.setHeader("content-type", "application/pdf");
      res.send(renderFieldReportPdf({
        tenantId: report.tenantId,
        jobId: report.jobId,
        propertyId: report.propertyId,
        visitId: report.visitId,
        kind: report.kind,
        title: report.title,
        findings: report.findings,
        media,
        checklist: attachedChecklist,
        ...(visitNotes.length ? { visitNotes } : {}),
        ...(watermark ? { watermarkLabel: watermark.label } : {}),
        ...(watermark?.assetUrl ? { watermarkAssetUrl: watermark.assetUrl } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/signed-documents", async (req: Request, res: Response) => {
    try {
      const input = signedDocumentListQuerySchema.parse(req.query);
      const records = await fieldDocsService().listSignedDocuments(input);
      res.json({ ok: true, records });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/signed-documents", async (req: Request, res: Response) => {
    try {
      const input = signedDocumentCreateInputSchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: input.tenantId,
        op: "createSignedDocument"
      });
      const record = await fieldDocsService().createSignedDocument({
        ...input,
        createdBy: access.tenantUserId
      });
      await eventBus.emit({
        tenantId: record.tenantId,
        type: "signed_document.created",
        payload: {
          signedDocumentId: record.id,
          clientId: record.clientId,
          ...(record.jobId ? { jobId: record.jobId } : {}),
          ...(record.visitId ? { visitId: record.visitId } : {}),
          createdBy: access.tenantUserId
        }
      });
      res.status(201).json({ ok: true, record });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/signed-documents/:id/sign", async (req: Request, res: Response) => {
    try {
      const signedDocumentId = req.params.id;
      if (!signedDocumentId) {
        throw new RailError("Signed document id is required.", { provider: "native", op: "signSignedDocument", status: 400 });
      }
      const input = signedDocumentSignInputSchema.parse(req.body ?? {});
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: input.tenantId,
        op: "signSignedDocument"
      });
      const typedName = input.typedName?.trim();
      const drawnDataUrl = input.drawnDataUrl?.trim();
      if (!typedName && !drawnDataUrl) {
        throw new RailError("A typed or drawn signature is required before this document can be signed.", {
          provider: "native",
          op: "signSignedDocument",
          status: 400
        });
      }
      if (input.signatureMode === "typed" && !typedName) {
        throw new RailError("Type the signer name before submitting a typed signature.", {
          provider: "native",
          op: "signSignedDocument",
          status: 400
        });
      }
      if (input.signatureMode === "drawn" && !drawnDataUrl) {
        throw new RailError("Draw the signature before submitting it.", {
          provider: "native",
          op: "signSignedDocument",
          status: 400
        });
      }
      const signedAt = nowIso();
      const record = await fieldDocsService().signSignedDocument({
        tenantId: input.tenantId,
        signedDocumentId,
        signature: {
          mode: input.signatureMode ?? (drawnDataUrl ? "drawn" : "typed"),
          ...(typedName ? { typedName } : {}),
          ...(drawnDataUrl ? { drawnDataUrl } : {}),
          signedAt,
          ipAddress: req.ip || req.socket.remoteAddress || "unknown"
        }
      });
      await eventBus.emit({
        tenantId: record.tenantId,
        type: "signed_document.signed",
        payload: {
          signedDocumentId: record.id,
          clientId: record.clientId,
          ...(record.jobId ? { jobId: record.jobId } : {}),
          ...(record.visitId ? { visitId: record.visitId } : {}),
          signedAt
        }
      });
      res.json({ ok: true, record });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/signed-documents/:id/pdf", async (req: Request, res: Response) => {
    try {
      const signedDocumentId = req.params.id;
      if (!signedDocumentId) {
        throw new RailError("Signed document id is required.", { provider: "native", op: "renderSignedDocumentPdf", status: 400 });
      }
      const input = mediaDetailQuerySchema.parse(req.query);
      const record = await repository().getSignedDocument(input.tenantId, signedDocumentId);
      if (!record) {
        throw new RailError(`Signed document ${signedDocumentId} was not found.`, { provider: "native", op: "renderSignedDocumentPdf", status: 404 });
      }
      res.setHeader("content-type", "application/pdf");
      res.send(renderSignedDocumentPdf(record));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexdocs/clients/:id/library", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "listNexDocsLibrary", status: 400 });
      }
      const input = nexDocsLibraryQuerySchema.parse(req.query);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: input.tenantId,
        op: "listNexDocsLibrary"
      });
      const library = await nexDocsService().listClientLibrary({
        tenantId: input.tenantId,
        clientId,
        viewer: "staff",
        ...(input.q ? { q: input.q } : {})
      });
      res.json({
        ok: true,
        tenantId: input.tenantId,
        actorRole: access.role,
        permissions: {
          canUpload: true,
          canManageFolders: access.role !== "TECHNICIAN",
          canDeleteDocuments: access.role !== "TECHNICIAN",
          canToggleVisibility: access.role !== "TECHNICIAN"
        },
        library
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexdocs/clients/:id/folders", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "createNexDocsFolder", status: 400 });
      }
      const input = nexDocsFolderCreateInputSchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "createNexDocsFolder"
      });
      const folder = await nexDocsService().createFolder({
        tenantId: input.tenantId,
        clientId,
        label: input.label,
        createdBy: access.tenantUserId
      });
      res.status(201).json({ ok: true, folder });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.delete("/api/nexdocs/clients/:id/folders/:folderId", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      const folderId = req.params.folderId;
      if (!clientId || !folderId) {
        throw new RailError("Client id and folder id are required.", { provider: "native", op: "deleteNexDocsFolder", status: 400 });
      }
      const input = nexDocsDeleteBodySchema.parse(req.body ?? {});
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "deleteNexDocsFolder"
      });
      await nexDocsService().deleteFolder({
        tenantId: input.tenantId,
        clientId,
        folderId
      });
      res.json({ ok: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexdocs/clients/:id/documents", async (req: Request, res: Response) => {
    try {
      const clientId = req.params.id;
      if (!clientId) {
        throw new RailError("Client id is required.", { provider: "native", op: "uploadNexDocsDocument", status: 400 });
      }
      const input = nexDocsDocumentUploadInputSchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: input.tenantId,
        op: "uploadNexDocsDocument"
      });
      const document = await nexDocsService().uploadDocument({
        tenantId: input.tenantId,
        clientId,
        folderId: input.folderId,
        label: input.label,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileBase64: input.fileBase64,
        propertyId: input.propertyId,
        jobId: input.jobId,
        visitId: input.visitId,
        source: "staff_upload",
        uploadedBy: access.tenantUserId
      }, env);
      res.status(201).json({ ok: true, document });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/nexdocs/documents/:id", async (req: Request, res: Response) => {
    try {
      const documentId = req.params.id;
      if (!documentId) {
        throw new RailError("Document id is required.", { provider: "native", op: "updateNexDocsDocument", status: 400 });
      }
      const input = nexDocsDocumentUpdateInputSchema.parse(req.body ?? {});
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "updateNexDocsDocument"
      });
      const document = await nexDocsService().updateUploadedDocument({
        tenantId: input.tenantId,
        clientId: input.clientId,
        documentId,
        ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
        ...(input.label ? { label: input.label } : {}),
        ...(input.hiddenFromClient !== undefined ? { hiddenFromClient: input.hiddenFromClient } : {})
      });
      res.json({ ok: true, document });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.delete("/api/nexdocs/documents/:id", async (req: Request, res: Response) => {
    try {
      const documentId = req.params.id;
      if (!documentId) {
        throw new RailError("Document id is required.", { provider: "native", op: "deleteNexDocsDocument", status: 400 });
      }
      const input = nexDocsDeleteBodySchema.parse(req.body ?? {});
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "deleteNexDocsDocument"
      });
      await nexDocsService().deleteUploadedDocument({
        tenantId: input.tenantId,
        clientId: input.clientId,
        documentId,
        env
      });
      res.json({ ok: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexdocs/documents/:id/file", async (req: Request, res: Response) => {
    try {
      const documentId = req.params.id;
      if (!documentId) {
        throw new RailError("Document id is required.", { provider: "native", op: "fetchNexDocsFile", status: 400 });
      }
      const input = mediaDetailQuerySchema.parse(req.query);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: input.tenantId,
        op: "fetchNexDocsFile"
      });
      const document = await nexDocsService().getUploadedDocument(input.tenantId, documentId);
      await sendNexDocsFile(res, {
        storageRef: document.storageRef,
        fallbackFileName: document.fileName,
        fallbackMimeType: document.mimeType,
        download: req.query.download === "1"
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
