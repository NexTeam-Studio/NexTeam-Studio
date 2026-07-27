import type { Express, Request, Response } from "express";
import { z } from "zod";
import { InMemoryEventBus, RailError, type EventBus } from "@nexteam/core";
import { actorIdForAccess, requireTenantRole } from "../auth/accessContext.js";
import { configuredTenantId } from "../core/tenantConfig.js";
import type { NexReachService } from "./nexreachService.js";
import { nexReachBundleFileName } from "./nexreachService.js";
import { renderDraftBundleHtml, renderPortfolioHtml } from "./portfolioHtml.js";

const tenantQuerySchema = z.object({
  tenantId: z.string().min(1).optional()
});

const settingsBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  toneNotes: z.string().optional(),
  serviceAreaLine: z.string().optional(),
  licenseLine: z.string().optional(),
  ctaLine: z.string().optional()
});

const generateBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  cadence: z.enum(["owner_on_demand", "manual_batch"]).optional(),
  requestedKinds: z.array(z.enum(["article", "social_post", "gbp_post"])).optional()
});

const reviseDraftBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  shortCaption: z.string().optional(),
  longCaption: z.string().optional()
});

const showcaseBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  draftId: z.string().min(1),
  reviewIds: z.array(z.string().min(1)).optional()
});

const audienceQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  serviceType: z.string().optional(),
  locality: z.string().optional(),
  closedSince: z.string().optional()
});

const draftsQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  status: z.enum(["approval_pending", "publish_ready", "rejected", "all"]).optional()
});

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return configuredTenantId(env, "nexReachRoute");
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : error instanceof z.ZodError ? 400 : 500;
  const message = error instanceof z.ZodError
    ? error.issues.map((issue) => issue.message).join(" ")
    : error instanceof Error
      ? error.message
      : "Unknown NexReach route error";
  res.status(status).json({ ok: false, error: message });
}

function svgEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function watermarkSvg(input: { mediaUrl: string; label: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1200 900">
  <rect width="1200" height="900" fill="#d7e5dc"/>
  <image href="${svgEscape(input.mediaUrl)}" width="1200" height="900" preserveAspectRatio="xMidYMid slice"/>
  <rect x="36" y="810" width="500" height="54" rx="27" fill="rgba(17,32,28,0.78)"/>
  <text x="64" y="844" font-family="Montserrat, Segoe UI, sans-serif" font-size="24" letter-spacing="2.5" fill="#ffffff">${svgEscape(input.label)}</text>
</svg>`;
}

export interface NexReachRouteDeps {
  service: NexReachService;
  eventBus?: EventBus | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export function registerNexReachRoutes(app: Express, deps: NexReachRouteDeps): void {
  const env = deps.env ?? process.env;
  const eventBus = deps.eventBus ?? new InMemoryEventBus();

  eventBus.subscribe("job.closed", "nexreach-eligibility-sync", async (event) => {
    await deps.service.syncEligibility(event.tenantId);
  });

  app.get("/api/nexreach/eligibility", async (req: Request, res: Response) => {
    try {
      const { tenantId: requestedTenantId } = tenantQuerySchema.parse(req.query);
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachEligibility" });
      res.json({ ok: true, records: await deps.service.listEligibleJobs(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexreach/eligibility/sync", async (req: Request, res: Response) => {
    try {
      const { tenantId: requestedTenantId } = tenantQuerySchema.parse(req.body ?? {});
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachEligibilitySync" });
      res.json({ ok: true, records: await deps.service.syncEligibility(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexreach/jobs/:id/generate", async (req: Request, res: Response) => {
    try {
      const jobId = req.params.id;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "nexreachGenerate", status: 400 });
      }
      const input = generateBodySchema.parse(req.body ?? {});
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachGenerate" });
      const result = await deps.service.generateJobContent({
        tenantId,
        jobId,
        actorId: actorIdForAccess(access),
        cadence: input.cadence,
        requestedKinds: input.requestedKinds
      });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexreach/drafts", async (req: Request, res: Response) => {
    try {
      const { tenantId: requestedTenantId, status } = draftsQuerySchema.parse(req.query);
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachListDrafts" });
      const pending = await deps.service.listPendingDrafts(tenantId);
      if (!status || status === "approval_pending") {
        res.json({ ok: true, drafts: pending });
        return;
      }
      const allDrafts = await deps.service.getRepositoryDraftsForUi(tenantId);
      res.json({
        ok: true,
        drafts: status === "all"
          ? allDrafts
          : allDrafts.filter((draft) => draft.status === status)
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexreach/drafts/:id", async (req: Request, res: Response) => {
    try {
      const draftId = req.params.id;
      if (!draftId) {
        throw new RailError("Draft id is required.", { provider: "native", op: "nexreachGetDraft", status: 400 });
      }
      const { tenantId: requestedTenantId } = tenantQuerySchema.parse(req.query);
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachGetDraft" });
      const draft = await deps.service.getDraft(tenantId, draftId);
      if (!draft) {
        throw new RailError(`Draft ${draftId} was not found.`, { provider: "native", op: "nexreachGetDraft", status: 404 });
      }
      res.json({ ok: true, draft });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/nexreach/drafts/:id", async (req: Request, res: Response) => {
    try {
      const draftId = req.params.id;
      if (!draftId) {
        throw new RailError("Draft id is required.", { provider: "native", op: "nexreachReviseDraft", status: 400 });
      }
      const input = reviseDraftBodySchema.parse(req.body ?? {});
      const tenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachReviseDraft" });
      const result = await deps.service.reviseDraft({
        tenantId,
        draftId,
        actorId: actorIdForAccess(access),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.shortCaption !== undefined ? { shortCaption: input.shortCaption } : {}),
        ...(input.longCaption !== undefined ? { longCaption: input.longCaption } : {})
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexreach/drafts/:id/discard", async (req: Request, res: Response) => {
    try {
      const draftId = req.params.id;
      if (!draftId) {
        throw new RailError("Draft id is required.", { provider: "native", op: "nexreachDiscardDraft", status: 400 });
      }
      const { tenantId: requestedTenantId } = tenantQuerySchema.parse(req.body ?? {});
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachDiscardDraft" });
      res.json({
        ok: true,
        ...(await deps.service.discardDraft({ tenantId, draftId, actorId: actorIdForAccess(access) }))
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexreach/drafts/:id/approve", async (req: Request, res: Response) => {
    try {
      const draftId = req.params.id;
      if (!draftId) {
        throw new RailError("Draft id is required.", { provider: "native", op: "nexreachApproveDraft", status: 400 });
      }
      const { tenantId: requestedTenantId } = tenantQuerySchema.parse(req.body ?? {});
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER"], { requestedTenantId: tenantId, op: "nexreachApproveDraft" });
      res.json({
        ok: true,
        ...(await deps.service.approveDraft({ tenantId, draftId, actorId: actorIdForAccess(access) }))
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexreach/settings", async (req: Request, res: Response) => {
    try {
      const { tenantId: requestedTenantId } = tenantQuerySchema.parse(req.query);
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachSettings" });
      res.json({ ok: true, settings: await deps.service.getSettings(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexreach/settings", async (req: Request, res: Response) => {
    try {
      const input = settingsBodySchema.parse(req.body ?? {});
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER"], { requestedTenantId: tenantId, op: "nexreachSettingsSave" });
      res.json({
        ok: true,
        settings: await deps.service.saveSettings({
          tenantId,
          ...(input.toneNotes !== undefined ? { toneNotes: input.toneNotes } : {}),
          ...(input.serviceAreaLine !== undefined ? { serviceAreaLine: input.serviceAreaLine } : {}),
          ...(input.licenseLine !== undefined ? { licenseLine: input.licenseLine } : {}),
          ...(input.ctaLine !== undefined ? { ctaLine: input.ctaLine } : {})
        })
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexreach/showcases", async (req: Request, res: Response) => {
    try {
      const { tenantId: requestedTenantId } = tenantQuerySchema.parse(req.query);
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachShowcases" });
      res.json({ ok: true, showcases: await deps.service.listShowcases(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexreach/reviews", async (req: Request, res: Response) => {
    try {
      const { tenantId: requestedTenantId } = tenantQuerySchema.parse(req.query);
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachReviews" });
      res.json({ ok: true, reviews: await deps.service.listReviewCandidates(tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexreach/showcases", async (req: Request, res: Response) => {
    try {
      const input = showcaseBodySchema.parse(req.body ?? {});
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER"], { requestedTenantId: tenantId, op: "nexreachCreateShowcase" });
      res.status(201).json({
        ok: true,
        showcase: await deps.service.createShowcase({
          tenantId,
          draftId: input.draftId,
          reviewIds: input.reviewIds
        })
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexreach/audience", async (req: Request, res: Response) => {
    try {
      const input = audienceQuerySchema.parse(req.query);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachAudience" });
      res.json({
        ok: true,
        audience: await deps.service.listAudience(tenantId, {
          ...(input.serviceType ? { serviceType: input.serviceType } : {}),
          ...(input.locality ? { locality: input.locality } : {}),
          ...(input.closedSince ? { closedSince: input.closedSince } : {})
        })
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexreach/audience.csv", async (req: Request, res: Response) => {
    try {
      const input = audienceQuerySchema.parse(req.query);
      const tenantId = input.tenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachAudienceExport" });
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", `attachment; filename="nexreach-audience-${tenantId}.csv"`);
      res.send(await deps.service.exportAudienceCsv(tenantId, {
        ...(input.serviceType ? { serviceType: input.serviceType } : {}),
        ...(input.locality ? { locality: input.locality } : {}),
        ...(input.closedSince ? { closedSince: input.closedSince } : {})
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/nexreach/portfolio-link", async (req: Request, res: Response) => {
    try {
      const { tenantId: requestedTenantId } = tenantQuerySchema.parse(req.body ?? {});
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER"], { requestedTenantId: tenantId, op: "nexreachPortfolioLink" });
      const { token } = await deps.service.issuePortfolioLink(tenantId);
      const base = `${req.protocol}://${req.get("host") ?? "127.0.0.1:4175"}`;
      res.json({ ok: true, token, url: `${base}/nexportal/portfolio/${encodeURIComponent(tenantId)}?token=${encodeURIComponent(token)}` });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexreach/drafts/:id/bundle.txt", async (req: Request, res: Response) => {
    try {
      const draftId = req.params.id;
      if (!draftId) {
        throw new RailError("Draft id is required.", { provider: "native", op: "nexreachBundleText", status: 400 });
      }
      const { tenantId: requestedTenantId } = tenantQuerySchema.parse(req.query);
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachBundleText" });
      const draft = await deps.service.getDraft(tenantId, draftId);
      if (!draft) {
        throw new RailError(`Draft ${draftId} was not found.`, { provider: "native", op: "nexreachBundleText", status: 404 });
      }
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.setHeader("content-disposition", `attachment; filename="${nexReachBundleFileName(draft)}"`);
      res.send(deps.service.renderBundleText({ draft }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexreach/drafts/:id/media/:mediaId.svg", async (req: Request, res: Response) => {
    try {
      const draftId = req.params.id;
      const mediaId = req.params.mediaId;
      if (!draftId) {
        throw new RailError("Draft id is required.", { provider: "native", op: "nexreachBundleMedia", status: 400 });
      }
      if (!mediaId) {
        throw new RailError("Media id is required.", { provider: "native", op: "nexreachBundleMedia", status: 400 });
      }
      const { tenantId: requestedTenantId } = tenantQuerySchema.parse(req.query);
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachBundleMedia" });
      const draft = await deps.service.getDraft(tenantId, draftId);
      if (!draft || !draft.mediaRefs.includes(mediaId)) {
        throw new RailError(`Draft media ${mediaId} was not found for ${draftId}.`, { provider: "native", op: "nexreachBundleMedia", status: 404 });
      }
      res.setHeader("content-type", "image/svg+xml; charset=utf-8");
      res.send(watermarkSvg({
        mediaUrl: `/api/media/${encodeURIComponent(mediaId)}?tenantId=${encodeURIComponent(tenantId)}`,
        label: draft.watermarkLabel ?? `${tenantId} | NexCam`
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/nexreach/drafts/:id/bundle.html", async (req: Request, res: Response) => {
    try {
      const draftId = req.params.id;
      if (!draftId) {
        throw new RailError("Draft id is required.", { provider: "native", op: "nexreachBundleHtml", status: 400 });
      }
      const { tenantId: requestedTenantId } = tenantQuerySchema.parse(req.query);
      const tenantId = requestedTenantId ?? defaultTenantId(env);
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: tenantId, op: "nexreachBundleHtml" });
      const draft = await deps.service.getDraft(tenantId, draftId);
      if (!draft) {
        throw new RailError(`Draft ${draftId} was not found.`, { provider: "native", op: "nexreachBundleHtml", status: 404 });
      }
      const shell = await deps.service.getPortfolioShell(tenantId);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderDraftBundleHtml({
        tenantId,
        tenantName: shell.tenantName,
        branding: shell.branding,
        draft,
        manifestText: deps.service.renderBundleText({ draft })
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/nexportal/portfolio/:tenantId", async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId || defaultTenantId(env);
      const token = typeof req.query.token === "string" ? req.query.token : undefined;
      const snapshot = await deps.service.buildPortfolioSnapshot({ tenantId, ...(token ? { token } : {}) });
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(renderPortfolioHtml({
        tenantId,
        tenantName: snapshot.tenantName,
        branding: snapshot.branding,
        settings: snapshot.settings,
        showcases: snapshot.showcases,
        reviews: snapshot.reviews
      }));
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
