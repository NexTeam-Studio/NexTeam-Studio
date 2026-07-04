import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { InMemoryEventBus, RailError, type EventBus } from "@nexteam/core";
import { getAdminDb } from "../firebase.js";
import { createLeakDetectionChecklist } from "./checklists.js";
import { FirestoreMediaRepository, MemoryMediaRepository, type MediaRepository } from "./mediaRepository.js";
import { searchMediaWithVisionFallback } from "./photoSearch.js";
import { renderFieldReportPdf } from "./reportService.js";
import { createNativeMediaFromUpload, uploadMediaInputSchema } from "./uploadService.js";
import { maybeRunVision } from "./visionPipeline.js";

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
  visitId: z.string().min(1).optional()
});

const reportPdfInputSchema = z.object({
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
  title: z.string().min(1),
  findings: z.array(z.string()).default([]),
  mediaIds: z.array(z.string()).default([])
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
      const initial = createNativeMediaFromUpload(input);
      const vision = await maybeRunVision(initial, env);
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

  app.post("/api/fielddocs/checklists/leak-detection", (req: Request, res: Response) => {
    try {
      const input = checklistInputSchema.parse(req.body);
      res.status(201).json({ ok: true, checklist: createLeakDetectionChecklist(input) });
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
      const checklist = createLeakDetectionChecklist({ tenantId: input.tenantId, jobId: input.jobId });
      res.setHeader("content-type", "application/pdf");
      res.send(renderFieldReportPdf({
        tenantId: input.tenantId,
        jobId: input.jobId,
        title: input.title,
        findings: input.findings,
        media,
        checklist
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
