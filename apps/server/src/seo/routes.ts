import type { Express, Request, Response } from "express";
import { RailError, type ApprovalQueueService } from "@nexteam/core";
import { actorIdForAccess, requireTenantRole } from "../auth/accessContext.js";
import type { SitesRepository } from "../sites/repository.js";
import { DataForSeoRankProvider } from "./dataForSeoProvider.js";
import type { SeoRepository } from "./repository.js";
import {
  auditSiteInputSchema,
  keywordGapBriefInputSchema,
  rankSnapshotInputSchema,
  seoReportInputSchema,
  seoQueueInputSchema
} from "./schemas.js";
import { SeoService } from "./service.js";

export interface SeoRouteDeps {
  repository: SeoRepository;
  sitesRepository: SitesRepository;
  approvalQueue: ApprovalQueueService;
  env?: NodeJS.ProcessEnv | undefined;
}

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return env.TENANT_ID || "aquatrace";
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown SEO route error";
  res.status(status).json({ ok: false, error: message });
}

export function registerSeoRoutes(app: Express, deps: SeoRouteDeps): void {
  const env = deps.env ?? process.env;
  const service = new SeoService({
    repository: deps.repository,
    sitesRepository: deps.sitesRepository,
    approvalQueue: deps.approvalQueue,
    rankProvider: new DataForSeoRankProvider(env),
    env
  });

  app.post("/api/seo/rank-snapshot", async (req: Request, res: Response) => {
    try {
      const input = rankSnapshotInputSchema.parse(req.body);
      const requestedTenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "seoRankSnapshot"
      });
      const snapshots = await service.rankSnapshot({
        tenantId: access.tenantId,
        targetDomain: input.targetDomain,
        keywords: input.keywords
      });
      res.status(201).json({ ok: true, snapshots });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/seo/sites/:slug/audit", async (req: Request, res: Response) => {
    try {
      const input = auditSiteInputSchema.parse({ ...req.body, slug: req.params.slug ?? "aquatrace" });
      const requestedTenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "seoAudit"
      });
      const result = await service.auditSite(access.tenantId, input.slug);
      res.status(201).json({ ok: true, siteId: result.site.id, audit: result.audit });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/seo/sites/:slug/fix", async (req: Request, res: Response) => {
    try {
      const input = auditSiteInputSchema.extend({ issueCode: auditSiteInputSchema.shape.slug.optional() })
        .parse({ ...req.body, slug: req.params.slug ?? "aquatrace" });
      const requestedTenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "seoDraftFix"
      });
      const result = await service.draftSiteFix({
        tenantId: access.tenantId,
        slug: input.slug,
        issueCode: typeof req.body?.issueCode === "string" ? req.body.issueCode : undefined,
        actorId: actorIdForAccess(access)
      });
      res.status(201).json({ ok: true, siteId: result.site.id, audit: result.audit, approval: result.approval });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/seo/sites/:slug/fixes/:approvalId/approve-apply", async (req: Request, res: Response) => {
    try {
      const input = auditSiteInputSchema.parse({ ...req.body, slug: req.params.slug ?? "aquatrace" });
      const requestedTenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "seoApplyFix"
      });
      const approvalId = req.params.approvalId;
      if (!approvalId) {
        throw new RailError("Approval id is required.", { provider: "approval", op: "seoApplyFix", status: 400 });
      }
      const result = await service.approveAndApplySiteFix({
        tenantId: access.tenantId,
        slug: input.slug,
        approvalId
      });
      res.json({ ok: true, approval: result.approval, site: result.site, remainingAudit: result.remainingAudit });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/seo/queue", async (req: Request, res: Response) => {
    try {
      const input = seoQueueInputSchema.parse({ tenantId: req.query.tenantId });
      const requestedTenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "seoQueue"
      });
      res.json({ ok: true, queue: await service.queue(access.tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/seo/keyword-gap/brief", async (req: Request, res: Response) => {
    try {
      const input = keywordGapBriefInputSchema.parse(req.body);
      const requestedTenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "seoKeywordGapBrief"
      });
      const result = await service.draftArticleBrief({
        tenantId: access.tenantId,
        keyword: input.keyword,
        geo: input.geo,
        competitorUrl: input.competitorUrl
      });
      res.status(201).json({ ok: true, ...result, publishingDeferred: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/seo/report/monthly", async (req: Request, res: Response) => {
    try {
      const input = seoReportInputSchema.parse(req.body);
      const requestedTenantId = input.tenantId ?? defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "seoReport"
      });
      const result = await service.monthlyReport({
        tenantId: access.tenantId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd
      });
      res.status(201).json({
        ok: true,
        report: result.report,
        pdfBytes: result.pdf.byteLength,
        pdfBase64: result.pdf.toString("base64")
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
