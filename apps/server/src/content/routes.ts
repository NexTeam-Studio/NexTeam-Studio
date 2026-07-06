import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { InMemoryEventBus, RailError, type ApprovalQueueService, type EventBus } from "@nexteam/core";
import { summarizeContentStats, type ContentDraftKind, type ContentPerformanceSnapshot, type TenantBrandVoice } from "./contentEngine.js";
import type { ContentRepository } from "./repository.js";
import { draftContentForJob } from "./workflow.js";

const contentKindSchema = z.enum(["gbp_post", "social_post", "article"]);

const jobFactSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  title: z.string().min(1),
  clientName: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  outcome: z.string().optional(),
  completedAt: z.string().optional(),
  lineItems: z.array(z.object({
    name: z.string().min(1),
    total: z.number().optional()
  })).optional()
});

const mediaFactSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["photo", "video", "pdf"]),
  thumbRef: z.string().optional(),
  storageRef: z.string().optional(),
  caption: z.string().optional()
});

const brandVoiceSchema = z.object({
  businessName: z.string().optional(),
  assistantName: z.string().optional(),
  serviceArea: z.array(z.string()).optional(),
  tone: z.string().optional(),
  softCta: z.string().optional()
}).optional();

const draftFromJobSchema = z.object({
  tenantId: z.string().min(1).optional(),
  job: jobFactSchema,
  media: z.array(mediaFactSchema).default([]),
  requestedKinds: z.array(contentKindSchema).optional(),
  brandVoice: brandVoiceSchema
});

const jobCompletedPayloadSchema = z.object({
  job: jobFactSchema,
  media: z.array(mediaFactSchema).default([]),
  brandVoice: brandVoiceSchema
});

const performanceInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  provider: z.enum(["gbp", "meta", "native"]).default("native"),
  metricDate: z.string().min(1),
  impressions: z.number().int().min(0).default(0),
  clicks: z.number().int().min(0).default(0),
  calls: z.number().int().min(0).default(0),
  bookings: z.number().int().min(0).default(0),
  notes: z.string().default("Manual or API-limited performance snapshot.")
});

export interface ContentRouteDeps {
  repository: ContentRepository;
  approvalQueue: ApprovalQueueService;
  eventBus?: EventBus | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return env.TENANT_ID || "aquatrace";
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown Content route error";
  res.status(status).json({ ok: false, error: message });
}

function cleanBrandVoice(input: z.infer<typeof brandVoiceSchema>): Partial<TenantBrandVoice> | undefined {
  if (!input) {
    return undefined;
  }
  const brandVoice: Partial<TenantBrandVoice> = {};
  if (input.businessName) {
    brandVoice.businessName = input.businessName;
  }
  if (input.assistantName) {
    brandVoice.assistantName = input.assistantName;
  }
  if (input.serviceArea) {
    brandVoice.serviceArea = input.serviceArea;
  }
  if (input.tone) {
    brandVoice.tone = input.tone;
  }
  if (input.softCta) {
    brandVoice.softCta = input.softCta;
  }
  return brandVoice;
}

export function registerContentRoutes(app: Express, deps: ContentRouteDeps): void {
  const env = deps.env ?? process.env;
  const eventBus = deps.eventBus ?? new InMemoryEventBus();

  eventBus.subscribe("job.completed", "m5-content-drafter", async (event) => {
    const parsed = jobCompletedPayloadSchema.safeParse(event.payload);
    if (!parsed.success) {
      return;
    }
    await draftContentForJob({
      tenantId: event.tenantId,
      job: { ...parsed.data.job, tenantId: event.tenantId },
      media: parsed.data.media,
      brandVoice: cleanBrandVoice(parsed.data.brandVoice),
      repository: deps.repository,
      approvalQueue: deps.approvalQueue,
      requestedKinds: ["gbp_post"],
      now: event.ts
    });
  });

  app.post("/api/content/jobs/:id/draft", async (req: Request, res: Response) => {
    try {
      const input = draftFromJobSchema.parse(req.body);
      const tenantId = input.tenantId ?? input.job.tenantId ?? defaultTenantId(env);
      const drafts = await draftContentForJob({
        tenantId,
        job: { ...input.job, tenantId },
        media: input.media,
        requestedKinds: input.requestedKinds as ContentDraftKind[] | undefined,
        brandVoice: cleanBrandVoice(input.brandVoice),
        repository: deps.repository,
        approvalQueue: deps.approvalQueue
      });
      res.status(201).json({ ok: true, drafts, publishingDeferred: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/content/queue", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      res.json({ ok: true, drafts: await deps.repository.listDrafts(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/content/drafts/:id/approve", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      const draftId = req.params.id;
      if (!draftId) {
        throw new RailError("Content draft id is required.", { provider: "native", op: "approveContentDraft", status: 400 });
      }
      const draft = await deps.repository.getDraft(tenantId, draftId);
      if (!draft) {
        throw new RailError(`Content draft ${draftId} was not found.`, { provider: "native", op: "approveContentDraft", status: 404 });
      }
      const approval = draft.approvalId ? await deps.approvalQueue.approve(draft.approvalId) : null;
      const updated = await deps.repository.updateDraft(tenantId, draft.id, {
        status: "publish_ready"
      });
      res.json({ ok: true, draft: updated, approval, publishingDeferred: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/content/calendar", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      res.json({ ok: true, items: await deps.repository.listCalendar(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/content/performance/ingest", async (req: Request, res: Response) => {
    try {
      const input = performanceInputSchema.parse(req.body);
      const snapshot: ContentPerformanceSnapshot = {
        id: `perf_${randomUUID()}`,
        tenantId: input.tenantId ?? defaultTenantId(env),
        provider: input.provider,
        metricDate: input.metricDate,
        impressions: input.impressions,
        clicks: input.clicks,
        calls: input.calls,
        bookings: input.bookings,
        notes: input.notes
      };
      res.status(201).json({ ok: true, snapshot: await deps.repository.savePerformance(snapshot) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/content/stats", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const drafts = await deps.repository.listDrafts(tenantId);
      const performance = await deps.repository.listPerformance(tenantId);
      res.json({ ok: true, stats: summarizeContentStats(drafts, performance), publishingDeferred: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
