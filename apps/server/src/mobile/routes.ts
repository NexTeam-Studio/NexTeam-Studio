import type { Express, Request, Response } from "express";
import { z } from "zod";
import { type ApprovalQueueService, RailError, type CaptureBatch, type Property } from "@nexteam/core";
import type { UsageLogWriter } from "@nexteam/nexi";
import type { NativeCrmRepository } from "@nexteam/providers";
import { MobilePushRegistrationSchema, MobileSyncRequestSchema, OfflineOperationSchema } from "@nexteam/mobile";
import { LOCAL_DEV_PROFILE_HEADER, actorIdForAccess, listLocalDevWebProfiles, requireAccessContext, requireTenantRole, type AccessContext } from "../auth/accessContext.js";
import { configuredTenantId } from "../core/tenantConfig.js";
import type { LedgerService } from "../crm/ledgerFoundation.js";
import { createStripeTerminalConnectionToken, createStripeTerminalPaymentIntent, retrieveStripeTerminalPaymentIntent, stripeTerminalLocationForTenant, stripeTerminalMerchantDisplayNameForTenant, stripeTerminalSimulatedForTenant } from "../crm/stripe.js";
import type { FieldDocsService } from "../fielddocs/fieldDocsService.js";
import type { MediaRepository } from "../fielddocs/mediaRepository.js";
import type { PlatformRepository } from "../platform/repository.js";
import type { SchedulingRepository } from "../scheduling/repository.js";
import { assertMobileDayScheduleAccess, assertMobileJobAccess } from "./access.js";
import { publicErrorResponse } from "../core/publicError.js";
import type { InMemoryMobileRepository } from "./repository.js";
import { maybeTranscribeMobileNarration, type MobileTranscriptionFetch } from "./transcription.js";

const dayScheduleQuerySchema = z.object({
  tenantId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  technicianId: z.string().optional()
});

const sessionQuerySchema = z.object({
  tenantId: z.string().optional()
});

const dayBoardQuerySchema = z.object({
  tenantId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  technicianId: z.string().optional()
});

const visitContextQuerySchema = z.object({
  tenantId: z.string().optional()
});

const visitNarrationBodySchema = z.object({
  tenantId: z.string().optional(),
  text: z.string().trim().min(1).max(8_000),
  append: z.boolean().default(true)
});

const transcriptionBodySchema = z.object({
  tenantId: z.string().optional(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  audioBase64: z.string().min(1),
  durationMs: z.number().int().min(0).optional()
});

const pushRegistrationSchema = z.object({
  tenantId: z.string().optional(),
  expoPushToken: z.string().min(1),
  deviceId: z.string().min(1),
  platform: z.enum(["ios", "android", "web", "unknown"]).default("unknown")
});

const tapToPayConnectionTokenBodySchema = z.object({
  tenantId: z.string().optional()
});

const tapToPayStartBodySchema = z.object({
  tenantId: z.string().optional(),
  invoiceId: z.string().min(1),
  tipAmount: z.number().min(0).optional()
});

const tapToPayCompleteBodySchema = z.object({
  tenantId: z.string().optional(),
  invoiceId: z.string().min(1),
  paymentIntentId: z.string().min(1),
  deviceLabel: z.string().optional(),
  devicePlatform: z.string().optional()
});

const tapToPayFailureBodySchema = z.object({
  tenantId: z.string().optional(),
  invoiceId: z.string().min(1),
  paymentIntentId: z.string().min(1),
  failureMessage: z.string().min(1),
  deviceLabel: z.string().optional(),
  devicePlatform: z.string().optional()
});

export interface MobileRouteDeps {
  repository: InMemoryMobileRepository;
  approvalQueue: ApprovalQueueService;
  crmRepository?: NativeCrmRepository | undefined;
  schedulingRepository?: SchedulingRepository | undefined;
  mediaRepository?: MediaRepository | undefined;
  fieldDocsService?: FieldDocsService | undefined;
  ledgerService?: Pick<LedgerService, "getInvoice" | "recordInvoicePayment"> | undefined;
  platformRepository?: Pick<PlatformRepository, "getTenantBranding"> | undefined;
  usageLog?: UsageLogWriter | undefined;
  transcriptionFetch?: MobileTranscriptionFetch | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

function sendError(res: Response, error: unknown): void {
  const { status, message } = publicErrorResponse(error);
  res.status(status).json({ ok: false, error: message });
}

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return configuredTenantId(env, "mobileRoute");
}

function tapToPayLedger(deps: MobileRouteDeps): Pick<LedgerService, "getInvoice" | "recordInvoicePayment"> {
  if (!deps.ledgerService) {
    throw new RailError("Tap to Pay billing routes are not wired in this runtime.", {
      provider: "stripe",
      op: "mobileTapToPay",
      status: 503
    });
  }
  return deps.ledgerService;
}

async function tapToPayFallbackTenantName(
  deps: MobileRouteDeps,
  tenantId: string
): Promise<string> {
  const branding = deps.platformRepository ? await deps.platformRepository.getTenantBranding(tenantId) : null;
  if (branding?.displayName?.trim()) {
    return branding.displayName.trim();
  }
  return tenantId;
}

function firebaseConfigured(env: NodeJS.ProcessEnv): boolean {
  return [
    env.VITE_FIREBASE_API_KEY,
    env.VITE_FIREBASE_AUTH_DOMAIN,
    env.VITE_FIREBASE_PROJECT_ID,
    env.VITE_FIREBASE_STORAGE_BUCKET,
    env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    env.VITE_FIREBASE_APP_ID
  ].every((value) => Boolean(value?.trim()));
}

function fieldString(fieldIndex: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = fieldIndex?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fieldBoolean(fieldIndex: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = fieldIndex?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function mobileAccessNotes(property: Property | undefined, fieldIndex: Record<string, unknown> | undefined): {
  gateCode?: string | undefined;
  accessNotes?: string | undefined;
  petPresent?: boolean | undefined;
  petName?: string | undefined;
  poolType?: string | undefined;
} {
  const gateCode = property?.access?.gateCode ?? fieldString(fieldIndex, "gate_code");
  const accessNotes = property?.access?.accessNotes;
  const petPresent = fieldBoolean(fieldIndex, "pet_present");
  const petName = fieldString(fieldIndex, "pet_name");
  const poolType = fieldString(fieldIndex, "pool_type") ?? fieldString(fieldIndex, "pool_configuration");
  return {
    ...(gateCode ? { gateCode } : {}),
    ...(accessNotes ? { accessNotes } : {}),
    ...(petPresent !== undefined ? { petPresent } : {}),
    ...(petName ? { petName } : {}),
    ...(poolType ? { poolType } : {})
  };
}

function batchVisibleForAccess(access: AccessContext, batch: CaptureBatch, scopedJobIds: Set<string>, scopedVisitIds: Set<string>, scopedClientIds: Set<string>): boolean {
  if (access.role !== "TECHNICIAN") {
    return true;
  }
  return batch.createdBy === access.tenantUserId
    || Boolean(batch.assignedJobId && scopedJobIds.has(batch.assignedJobId))
    || Boolean(batch.assignedVisitId && scopedVisitIds.has(batch.assignedVisitId))
    || Boolean(batch.assignedClientId && scopedClientIds.has(batch.assignedClientId));
}

function ensureFieldCaptureDeps(deps: MobileRouteDeps, op: string): {
  crmRepository: NativeCrmRepository;
  schedulingRepository: SchedulingRepository;
} {
  if (!deps.crmRepository || !deps.schedulingRepository) {
    throw new RailError("Native mobile capture is not wired to the real CRM and scheduling rails in this runtime.", {
      provider: "native",
      op,
      status: 503
    });
  }
  return {
    crmRepository: deps.crmRepository,
    schedulingRepository: deps.schedulingRepository
  };
}

async function buildDayBoard(
  access: AccessContext,
  input: z.infer<typeof dayBoardQuerySchema>,
  deps: MobileRouteDeps
): Promise<{
  date: string;
  technicianId: string;
  visits: Array<Record<string, unknown>>;
  batches: Array<Record<string, unknown>>;
  suggestionCandidates: Array<Record<string, unknown>>;
}> {
  const { crmRepository, schedulingRepository } = ensureFieldCaptureDeps(deps, "mobileDayBoard");
  const technicianId = assertMobileDayScheduleAccess(access, input.technicianId ?? access.tenantUserId);
  const from = `${input.date}T00:00:00.000Z`;
  const to = `${input.date}T23:59:59.999Z`;
  const [visits, jobs, clients, properties, checklists, batches] = await Promise.all([
    schedulingRepository.listVisits(access.tenantId, { from, to }),
    crmRepository.listJobs(access.tenantId),
    crmRepository.listClients(access.tenantId),
    crmRepository.listProperties(access.tenantId),
    deps.fieldDocsService?.listChecklists({ tenantId: access.tenantId }) ?? Promise.resolve([]),
    deps.mediaRepository?.listCaptureBatches(access.tenantId) ?? Promise.resolve([])
  ]);
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const propertiesById = new Map(properties.map((property) => [property.id, property]));
  const checklistsByVisitId = new Map<string, string[]>();
  checklists.forEach((checklist) => {
    if (!checklist.visitId) {
      return;
    }
    checklistsByVisitId.set(checklist.visitId, [...(checklistsByVisitId.get(checklist.visitId) ?? []), checklist.id]);
  });

  const scopedVisits = visits
    .filter((visit) => visit.assignedTo.includes(technicianId))
    .map((visit) => {
      const job = jobsById.get(visit.jobId);
      const property = job?.propertyId ? propertiesById.get(job.propertyId) : undefined;
      const client = job ? clientsById.get(job.clientId) : undefined;
      const fieldIndex = {
        ...(job?.intake?.fieldIndex ?? {}),
        ...(visit.intake?.fieldIndex ?? {})
      } as Record<string, unknown>;
      const address = property?.address;
      const locationAddress = visit.location.address;
      return {
        id: visit.id,
        jobId: visit.jobId,
        title: visit.title,
        status: visit.status,
        start: visit.start,
        end: visit.end,
        assignedTo: visit.assignedTo,
        checklistRef: visit.checklistRef,
        checklistIds: checklistsByVisitId.get(visit.id) ?? [],
        clientId: job?.clientId ?? null,
        clientName: client?.name ?? null,
        propertyId: property?.id ?? null,
        propertyName: property?.siteName ?? property?.label ?? locationAddress?.street1 ?? null,
        serviceAddress: {
          line1: locationAddress?.street1 ?? address?.street1 ?? visit.location.label,
          city: locationAddress?.city ?? address?.city ?? "Unknown",
          state: locationAddress?.province ?? address?.province ?? "NA",
          postalCode: locationAddress?.postalCode ?? address?.postalCode ?? "00000",
          ...(property?.geo
            ? { geo: { latitude: property.geo.lat, longitude: property.geo.lng, accuracyMeters: 30 } }
            : visit.location.geo
              ? { geo: { latitude: visit.location.geo.lat, longitude: visit.location.geo.lng, accuracyMeters: 30 } }
              : {})
        },
        notes: mobileAccessNotes(property, fieldIndex),
        details: visit.details ?? "",
        jobStatus: job?.status ?? null
      };
    });

  const scopedJobIds = new Set(scopedVisits.map((visit) => String(visit.jobId)));
  const scopedVisitIds = new Set(scopedVisits.map((visit) => String(visit.id)));
  const scopedClientIds = new Set(scopedVisits.map((visit) => String(visit.clientId ?? "")).filter(Boolean));
  const visibleBatches = batches
    .filter((batch) => batchVisibleForAccess(access, batch, scopedJobIds, scopedVisitIds, scopedClientIds))
    .slice(0, 25)
    .map((batch) => ({
      id: batch.id,
      status: batch.status,
      assignmentMode: batch.assignmentMode ?? null,
      assignedClientId: batch.assignedClientId ?? null,
      assignedJobId: batch.assignedJobId ?? null,
      assignedVisitId: batch.assignedVisitId ?? null,
      mediaCount: batch.mediaIds.length,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      originGps: batch.originGps ?? null,
      latestGps: batch.latestGps ?? null
    }));

  const suggestionCandidates = [
    ...scopedVisits
      .filter((visit) => Boolean((visit.serviceAddress as { geo?: unknown }).geo))
      .map((visit) => ({
        kind: "today_visit",
        visitId: visit.id,
        jobId: visit.jobId,
        clientId: visit.clientId,
        clientName: visit.clientName,
        propertyId: visit.propertyId,
        propertyName: visit.propertyName,
        serviceAddress: visit.serviceAddress,
        priority: 1
      })),
    ...properties
      .filter((property) => property.geo)
      .filter((property) => !scopedClientIds.has(property.clientId))
      .slice(0, 40)
      .map((property) => ({
        kind: "known_property",
        clientId: property.clientId,
        clientName: clientsById.get(property.clientId)?.name ?? property.clientId,
        propertyId: property.id,
        propertyName: property.siteName ?? property.label ?? property.address.street1,
        serviceAddress: {
          line1: property.address.street1,
          city: property.address.city,
          state: property.address.province,
          postalCode: property.address.postalCode,
          geo: {
            latitude: property.geo?.lat,
            longitude: property.geo?.lng,
            accuracyMeters: 30
          }
        },
        priority: 2
      }))
  ];

  return {
    date: input.date,
    technicianId,
    visits: scopedVisits,
    batches: visibleBatches,
    suggestionCandidates
  };
}

async function buildVisitContext(
  access: AccessContext,
  tenantId: string,
  visitId: string,
  deps: MobileRouteDeps
): Promise<Record<string, unknown>> {
  const { crmRepository, schedulingRepository } = ensureFieldCaptureDeps(deps, "mobileVisitContext");
  const visit = await schedulingRepository.getVisit(tenantId, visitId);
  if (!visit) {
    throw new RailError(`Visit ${visitId} was not found.`, { provider: "native", op: "mobileVisitContext", status: 404 });
  }
  if (access.role === "TECHNICIAN" && !visit.assignedTo.includes(access.tenantUserId)) {
    throw new RailError("That visit is not assigned to this user.", { provider: "native", op: "mobileVisitContext", status: 403 });
  }
  const [jobs, clients, properties, checklists, media, batches] = await Promise.all([
    crmRepository.listJobs(tenantId),
    crmRepository.listClients(tenantId),
    crmRepository.listProperties(tenantId),
    deps.fieldDocsService?.listChecklists({ tenantId, visitId }) ?? Promise.resolve([]),
    deps.mediaRepository?.listMedia(tenantId) ?? Promise.resolve([]),
    deps.mediaRepository?.listCaptureBatches(tenantId) ?? Promise.resolve([])
  ]);
  const job = jobs.find((candidate) => candidate.id === visit.jobId);
  if (!job) {
    throw new RailError(`Job ${visit.jobId} was not found for this visit.`, { provider: "native", op: "mobileVisitContext", status: 404 });
  }
  const client = clients.find((candidate) => candidate.id === job.clientId) ?? null;
  const property = job.propertyId ? properties.find((candidate) => candidate.id === job.propertyId) ?? null : null;
  if (deps.fieldDocsService && checklists.length === 0) {
    await deps.fieldDocsService.maybeAttachBundleForJob({ tenantId, job });
  }
  const refreshedChecklists = deps.fieldDocsService
    ? await deps.fieldDocsService.listChecklists({ tenantId, visitId })
    : checklists;
  const scopedMedia = media
    .filter((item) => item.visitId === visit.id || item.jobId === job.id)
    .sort((left, right) => (right.exif?.ts ?? "").localeCompare(left.exif?.ts ?? ""));
  const visibleBatches = batches
    .filter((batch) => batchVisibleForAccess(access, batch, new Set([job.id]), new Set([visit.id]), new Set([job.clientId])))
    .filter((batch) => batch.assignedVisitId === visit.id || batch.assignedJobId === job.id || batch.createdBy === access.tenantUserId)
    .map((batch) => ({
      id: batch.id,
      status: batch.status,
      assignmentMode: batch.assignmentMode ?? null,
      mediaIds: batch.mediaIds,
      updatedAt: batch.updatedAt
    }));

  return {
    visit,
    job,
    client,
    property,
    checklists: refreshedChecklists,
    media: scopedMedia,
    captureBatches: visibleBatches,
    beforeAfterCandidates: scopedMedia
      .filter((item) => item.type === "photo")
      .map((item) => ({
        id: item.id,
        aiCaption: item.aiCaption ?? "",
        tags: [...item.aiTags, ...(item.manualTags ?? [])],
        mediaUrl: `/api/media/${encodeURIComponent(item.id)}`,
        capturedAt: item.exif?.ts ?? null
      }))
  };
}

export function registerMobileRoutes(app: Express, deps: MobileRouteDeps): void {
  const env = deps.env ?? process.env;

  app.get("/api/mobile/session", async (req: Request, res: Response) => {
    try {
      const input = sessionQuerySchema.parse(req.query);
      const access = await requireAccessContext(req, env, {
        requestedTenantId: input.tenantId?.trim() || defaultTenantId(env),
        op: "mobileSession"
      });
      const branding = deps.platformRepository
        ? await deps.platformRepository.getTenantBranding(access.tenantId)
        : null;
      res.json({
        ok: true,
        access: {
          tenantId: access.tenantId,
          tenantUserId: access.tenantUserId,
          role: access.role,
          ...(access.email ? { email: access.email } : {})
        },
        branding: {
          displayName: branding?.displayName?.trim() || access.tenantId,
          ...(branding?.logo?.url?.trim() ? { logoUrl: branding.logo.url.trim() } : {})
        },
        authRequired: env.NEXI_FIREBASE_AUTH_REQUIRED !== "false",
        firebaseConfigured: firebaseConfigured(env),
        localDevHeader: LOCAL_DEV_PROFILE_HEADER,
        localProfiles: listLocalDevWebProfiles(access.tenantId, env)
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/mobile/day-board", async (req: Request, res: Response) => {
    try {
      const input = dayBoardQuerySchema.parse(req.query);
      const access = await requireAccessContext(req, env, {
        requestedTenantId: input.tenantId,
        op: "mobileDayBoard"
      });
      const board = await buildDayBoard(access, input, deps);
      res.json({
        ok: true,
        access: {
          tenantId: access.tenantId,
          tenantUserId: access.tenantUserId,
          role: access.role,
          ...(access.email ? { email: access.email } : {})
        },
        board
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/mobile/visits/:visitId/context", async (req: Request, res: Response) => {
    try {
      const input = visitContextQuerySchema.parse(req.query);
      const visitId = req.params.visitId;
      if (!visitId) {
        throw new RailError("Visit id is required.", { provider: "native", op: "mobileVisitContext", status: 400 });
      }
      const access = await requireAccessContext(req, env, {
        requestedTenantId: input.tenantId,
        op: "mobileVisitContext"
      });
      res.json({
        ok: true,
        access: {
          tenantId: access.tenantId,
          tenantUserId: access.tenantUserId,
          role: access.role
        },
        context: await buildVisitContext(access, access.tenantId, visitId, deps)
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/mobile/visits/:visitId/narration", async (req: Request, res: Response) => {
    try {
      const visitId = req.params.visitId;
      if (!visitId) {
        throw new RailError("Visit id is required.", { provider: "native", op: "mobileVisitNarration", status: 400 });
      }
      const input = visitNarrationBodySchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: input.tenantId,
        op: "mobileVisitNarration"
      });
      const { schedulingRepository } = ensureFieldCaptureDeps(deps, "mobileVisitNarration");
      const visit = await schedulingRepository.getVisit(access.tenantId, visitId);
      if (!visit) {
        throw new RailError(`Visit ${visitId} was not found.`, { provider: "native", op: "mobileVisitNarration", status: 404 });
      }
      if (access.role === "TECHNICIAN" && !visit.assignedTo.includes(access.tenantUserId)) {
        throw new RailError("That visit is not assigned to this user.", { provider: "native", op: "mobileVisitNarration", status: 403 });
      }
      const trimmed = input.text.trim();
      const nextDetails = input.append && visit.details?.trim()
        ? `${visit.details.trim()}\n${trimmed}`
        : trimmed;
      const saved = await schedulingRepository.saveVisit({
        ...visit,
        details: nextDetails
      });
      res.json({ ok: true, visit: saved });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/mobile/transcribe", async (req: Request, res: Response) => {
    try {
      const input = transcriptionBodySchema.parse(req.body ?? {});
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], {
        requestedTenantId: tenantId,
        op: "mobileTranscribe"
      });
      const result = await maybeTranscribeMobileNarration({
        tenantId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        audioBase64: input.audioBase64,
        durationMs: input.durationMs,
        env,
        fetchImpl: deps.transcriptionFetch,
        usageLog: deps.usageLog
      });
      res.status(result.attempted ? 201 : 200).json({ ok: true, result });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/mobile/day-schedule", async (req: Request, res: Response) => {
    try {
      const input = dayScheduleQuerySchema.parse(req.query);
      const access = await requireAccessContext(req, env, {
        requestedTenantId: input.tenantId,
        op: "mobileDaySchedule"
      });
      const technicianId = assertMobileDayScheduleAccess(access, input.technicianId ?? access.tenantUserId);
      const schedule = deps.repository.getDaySchedule(access.tenantId, input.date, technicianId);
      res.json({ ok: true, schedule, access: { tenantId: access.tenantId, tenantUserId: access.tenantUserId, role: access.role } });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/mobile/jobs/:jobId", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "mobileJob" });
      const jobId = req.params.jobId;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "mobileJob", status: 400 });
      }
      const job = deps.repository.getJob(access.tenantId, jobId);
      if (!job) {
        throw new RailError("That job was not found.", { provider: "native", op: "mobileJob", status: 404 });
      }
      res.json({ ok: true, job: assertMobileJobAccess(access, job, "mobileJob") });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/mobile/sync", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "mobileSync" });
      const input = MobileSyncRequestSchema.parse(req.body);
      const results = input.operations.map((candidate) => {
        const operation = OfflineOperationSchema.parse(candidate);
        if (operation.tenantId !== access.tenantId) {
          throw new RailError("Offline operation tenant does not match sign-in.", { provider: "native", op: "mobileSync", status: 403 });
        }
        const job = deps.repository.getJob(operation.tenantId, operation.jobId);
        if (!job) {
          throw new RailError("Offline operation references a missing job.", { provider: "native", op: "mobileSync", status: 404 });
        }
        assertMobileJobAccess(access, job, "mobileSync");
        return deps.repository.applyOperation(operation);
      });
      res.json({
        ok: true,
        results,
        summary: {
          attempted: results.length,
          synced: results.filter((result) => result.ok).length,
          conflicts: results.reduce((count, result) => count + result.conflicts.length, 0)
        }
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/mobile/push-token", async (req: Request, res: Response) => {
    try {
      const input = pushRegistrationSchema.parse(req.body);
      const access = await requireAccessContext(req, env, {
        requestedTenantId: input.tenantId,
        op: "mobilePushToken"
      });
      if (access.accessKind !== "internal") {
        throw new RailError("Job-link users cannot register tenant push tokens.", { provider: "native", op: "mobilePushToken", status: 403 });
      }
      const registration = await deps.repository.registerPushToken(MobilePushRegistrationSchema.parse({
        tenantId: access.tenantId,
        tenantUserId: access.tenantUserId,
        role: access.role,
        expoPushToken: input.expoPushToken,
        deviceId: input.deviceId,
        platform: input.platform,
        registeredAt: new Date().toISOString()
      }));
      res.status(201).json({ ok: true, registration });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/mobile/approvals", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "mobileApprovals"
      });
      res.json({ ok: true, actorId: actorIdForAccess(access), items: await deps.approvalQueue.listPending(access.tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/mobile/tap-to-pay/connection-token", async (req: Request, res: Response) => {
    try {
      const input = tapToPayConnectionTokenBodySchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "mobileTapToPayConnectionToken"
      });
      const token = await createStripeTerminalConnectionToken(env, access.tenantId);
      res.status(201).json({ ok: true, tenantId: access.tenantId, secret: token.secret });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/mobile/tap-to-pay/payment-intent", async (req: Request, res: Response) => {
    try {
      const input = tapToPayStartBodySchema.parse(req.body);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "mobileTapToPayPaymentIntent"
      });
      const invoice = await tapToPayLedger(deps).getInvoice(access.tenantId, input.invoiceId);
      if (!invoice) {
        throw new RailError(`Invoice ${input.invoiceId} was not found.`, {
          provider: "stripe",
          op: "mobileTapToPayPaymentIntent",
          status: 404
        });
      }
      const amount = Number(((invoice.ledger?.balanceDue ?? invoice.totals.total) + (input.tipAmount ?? 0)).toFixed(2));
      const locationId = stripeTerminalLocationForTenant(env, access.tenantId);
      if (!locationId) {
        throw new RailError("Tap to Pay requires a Stripe Terminal location for this tenant.", {
          provider: "stripe",
          op: "mobileTapToPayPaymentIntent",
          status: 503
        });
      }
      const merchantDisplayName = stripeTerminalMerchantDisplayNameForTenant(
        env,
        access.tenantId,
        await tapToPayFallbackTenantName(deps, access.tenantId)
      );
      const paymentIntent = await createStripeTerminalPaymentIntent(env, {
        tenantId: access.tenantId,
        invoiceId: invoice.id,
        ...(invoice.quoteId ? { quoteId: invoice.quoteId } : {}),
        title: invoice.title,
        amount,
        ...(input.tipAmount !== undefined ? { tipAmount: input.tipAmount } : {})
      });
      if (!paymentIntent.client_secret) {
        throw new RailError("Stripe did not return a client secret for Tap to Pay collection.", {
          provider: "stripe",
          op: "mobileTapToPayPaymentIntent",
          status: 502
        });
      }
      res.status(201).json({
        ok: true,
        tenantId: access.tenantId,
        invoiceId: invoice.id,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount,
        currency: "usd",
        tipAmount: input.tipAmount ?? 0,
        locationId,
        merchantDisplayName,
        simulated: stripeTerminalSimulatedForTenant(env, access.tenantId)
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/mobile/tap-to-pay/complete", async (req: Request, res: Response) => {
    try {
      const input = tapToPayCompleteBodySchema.parse(req.body);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "mobileTapToPayComplete"
      });
      const paymentIntent = await retrieveStripeTerminalPaymentIntent(env, access.tenantId, input.paymentIntentId);
      if ((paymentIntent.metadata?.tenantId ?? access.tenantId) !== access.tenantId) {
        throw new RailError("Tap to Pay payment intent tenant does not match this sign-in.", {
          provider: "stripe",
          op: "mobileTapToPayComplete",
          status: 409
        });
      }
      if ((paymentIntent.metadata?.invoiceId ?? input.invoiceId) !== input.invoiceId) {
        throw new RailError("Tap to Pay payment intent does not belong to this invoice.", {
          provider: "stripe",
          op: "mobileTapToPayComplete",
          status: 409
        });
      }
      if (paymentIntent.status !== "succeeded") {
        throw new RailError(`Tap to Pay payment is still ${paymentIntent.status ?? "unknown"} in Stripe.`, {
          provider: "stripe",
          op: "mobileTapToPayComplete",
          status: 409
        });
      }
      const tipAmount = Number(paymentIntent.metadata?.tipAmount ?? "0");
      const cardPresent = paymentIntent.latest_charge?.payment_method_details?.card_present;
      const recorded = await tapToPayLedger(deps).recordInvoicePayment({
        tenantId: access.tenantId,
        invoiceId: input.invoiceId,
        amount: Number((paymentIntent.amount / 100).toFixed(2)),
        ...(tipAmount > 0 ? { tipAmount } : {}),
        provider: "stripe",
        method: "card",
        actorId: actorIdForAccess(access),
        note: "Tap to Pay collection recorded from the field app.",
        externalIds: { stripePaymentIntentId: paymentIntent.id },
        methodDetails: {
          collectionChannel: "tap_to_pay",
          ...(input.deviceLabel?.trim() ? { deviceLabel: input.deviceLabel.trim() } : {}),
          ...(input.devicePlatform?.trim() ? { devicePlatform: input.devicePlatform.trim() } : {})
        },
        ...(cardPresent ? {
          cardSummary: {
            ...(cardPresent.cardholder_name ? { cardholderName: cardPresent.cardholder_name } : {}),
            ...(cardPresent.brand ? { brand: cardPresent.brand } : {}),
            ...(cardPresent.last4 ? { last4: cardPresent.last4 } : {})
          }
        } : {})
      });
      res.status(201).json({
        ok: true,
        tenantId: access.tenantId,
        actorRole: access.role,
        ...recorded,
        cardPresent: {
          ...(cardPresent?.brand ? { brand: cardPresent.brand } : {}),
          ...(cardPresent?.last4 ? { last4: cardPresent.last4 } : {}),
          ...(cardPresent?.cardholder_name ? { cardholderName: cardPresent.cardholder_name } : {})
        }
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/mobile/tap-to-pay/failure", async (req: Request, res: Response) => {
    try {
      const input = tapToPayFailureBodySchema.parse(req.body);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId,
        op: "mobileTapToPayFailure"
      });
      const paymentIntent = await retrieveStripeTerminalPaymentIntent(env, access.tenantId, input.paymentIntentId);
      const tipAmount = Number(paymentIntent.metadata?.tipAmount ?? "0");
      const recorded = await tapToPayLedger(deps).recordInvoicePayment({
        tenantId: access.tenantId,
        invoiceId: input.invoiceId,
        amount: Number((paymentIntent.amount / 100).toFixed(2)),
        ...(tipAmount > 0 ? { tipAmount } : {}),
        provider: "stripe",
        method: "card",
        actorId: actorIdForAccess(access),
        note: "Tap to Pay collection failed in the field app.",
        externalIds: { stripePaymentIntentId: input.paymentIntentId },
        status: "failed",
        methodDetails: {
          collectionChannel: "tap_to_pay",
          failureMessage: input.failureMessage.trim(),
          ...(input.deviceLabel?.trim() ? { deviceLabel: input.deviceLabel.trim() } : {}),
          ...(input.devicePlatform?.trim() ? { devicePlatform: input.devicePlatform.trim() } : {})
        }
      });
      res.status(201).json({ ok: true, tenantId: access.tenantId, actorRole: access.role, ...recorded });
    } catch (error) {
      sendError(res, error);
    }
  });
}
