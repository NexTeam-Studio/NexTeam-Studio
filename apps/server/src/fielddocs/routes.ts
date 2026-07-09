import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { InMemoryEventBus, RailError, type EventBus } from "@nexteam/core";
import { requireTenantRole } from "../auth/accessContext.js";
import { getAdminDb } from "../firebase.js";
import { createLeakDetectionChecklist } from "./checklists.js";
import { FirestoreMediaRepository, MemoryMediaRepository, type MediaRepository } from "./mediaRepository.js";
import { searchMediaWithVisionFallback } from "./photoSearch.js";
import { createFieldReportRecord, renderFieldReportPdf } from "./reportService.js";
import { createNativeMediaFromUpload, uploadMediaInputSchema } from "./uploadService.js";
import { maybeRunVision } from "./visionPipeline.js";
import {
  AQUATRACE_VISION_TAG_TAXONOMY,
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

const checklistInputSchema = z.object({
  tenantId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  itemUpdates: z.array(z.object({
    id: z.string().min(1),
    status: z.enum(["pending", "pass", "fail", "not_applicable"]),
    note: z.string().optional()
  })).optional()
});

const reportPdfInputSchema = z.object({
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  title: z.string().min(1),
  findings: z.array(z.string()).default([]),
  mediaIds: z.array(z.string()).default([]),
  checklistId: z.string().min(1).optional(),
  status: z.enum(["draft", "posted"]).default("posted")
});

const optionalImageSchema = z.object({
  imageBase64: z.string().min(1).optional(),
  imageMime: z.string().min(1).optional()
});

export interface FieldDocsRouteDeps {
  repository?: MediaRepository | undefined;
  eventBus?: EventBus | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return env.TENANT_ID || "aquatrace";
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown FieldDocs route error";
  res.status(status).json({ ok: false, error: message });
}

export function registerFieldDocsRoutes(app: Express, deps: FieldDocsRouteDeps = {}): void {
  const env = deps.env ?? process.env;
  const fallbackRepository = deps.repository ?? new MemoryMediaRepository();
  const eventBus = deps.eventBus ?? new InMemoryEventBus();

  function repository(): MediaRepository {
    const db = getAdminDb(env);
    return db ? new FirestoreMediaRepository(db) : fallbackRepository;
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
      const initial = createNativeMediaFromUpload(input);
      const image = imageInput.imageBase64 && imageInput.imageMime
        ? { base64: imageInput.imageBase64, mime: imageInput.imageMime }
        : undefined;
      const vision = await maybeRunVision(initial, env, image);
      const saved = await repository().saveMedia(vision.media);
      await eventBus.emit({
        tenantId: saved.tenantId,
        type: "media.uploaded",
        payload: { mediaId: saved.id, jobId: saved.jobId ?? null, storageRef: saved.storageRef }
      });
      res.status(201).json({ ok: true, media: saved, vision: { enabled: vision.enabled, reason: vision.reason ?? null } });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/fielddocs/search", async (req: Request, res: Response) => {
    try {
      const input = searchQuerySchema.parse(req.query);
      const hits = await searchMediaWithVisionFallback(await repository().listMedia(input.tenantId), input.q, input.limit ?? 10, env);
      res.json({ ok: true, hits });
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
      res.json({ ok: true, tenantId: access.tenantId, taxonomy: AQUATRACE_VISION_TAG_TAXONOMY });
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
      const input = checklistInputSchema.parse(req.body);
      const checklist = await repository().saveChecklist(createLeakDetectionChecklist(input));
      res.status(201).json({ ok: true, checklist });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/fielddocs/reports", async (req: Request, res: Response) => {
    try {
      const input = reportPdfInputSchema.parse(req.body);
      const repo = repository();
      const media = (await Promise.all(input.mediaIds.map((id) => repo.getMedia(input.tenantId, id))))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const checklist = input.checklistId
        ? await repo.getChecklist(input.tenantId, input.checklistId)
        : createLeakDetectionChecklist({ tenantId: input.tenantId, jobId: input.jobId });
      const report = createFieldReportRecord({
        tenantId: input.tenantId,
        jobId: input.jobId,
        title: input.title,
        findings: input.findings,
        mediaIds: media.map((item) => item.id),
        checklistId: checklist?.id,
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
      const attachedChecklist = checklist ?? undefined;
      res.setHeader("content-type", "application/pdf");
      res.send(renderFieldReportPdf({
        tenantId: input.tenantId,
        jobId: input.jobId,
        title: input.title,
        findings: input.findings,
        media,
        checklist: attachedChecklist
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
      const attachedChecklist = checklist ?? undefined;
      res.setHeader("content-type", "application/pdf");
      res.send(renderFieldReportPdf({
        tenantId: report.tenantId,
        jobId: report.jobId,
        title: report.title,
        findings: report.findings,
        media,
        checklist: attachedChecklist
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
