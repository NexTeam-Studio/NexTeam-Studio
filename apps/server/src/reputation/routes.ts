import type { Express, Request, Response } from "express";
import { RailError, type ApprovalQueueService, type ArtifactKind, type EventBus, type Tenant } from "@nexteam/core";
import { actorIdForAccess, requireTenantRole } from "../auth/accessContext.js";
import { EnvGbpReviewProvider, type GbpReviewProvider } from "./gbpProvider.js";
import type { ReputationRepository } from "./repository.js";
import { ReputationService } from "./service.js";

export interface ReputationRouteDeps {
  repository: ReputationRepository;
  approvalQueue: ApprovalQueueService;
  eventBus?: EventBus | undefined;
  gbpProvider?: GbpReviewProvider | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

function defaultTenantId(env: NodeJS.ProcessEnv): string {
  return env.TENANT_ID || "aquatrace";
}

function defaultApproval(): Tenant["approval"] {
  const kinds: ArtifactKind[] = ["client", "email", "sms", "gbp_post", "social_post", "article", "quote", "invoice", "site_publish", "gbp_profile_update", "review_reply"];
  return Object.fromEntries(kinds.map((kind) => [kind, { autoApprove: false, cleanStreak: 0 }])) as Tenant["approval"];
}

function tenantFrom(tenantId: string, env: NodeJS.ProcessEnv): Tenant {
  return {
    id: tenantId,
    name: tenantId === "aquatrace" ? "Aquatrace" : tenantId,
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "companycam", email: "gmail_relay" },
    approval: defaultApproval(),
    timezone: env.TENANT_TIMEZONE || "America/New_York",
    plan: "suite"
  };
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown Reputation route error";
  res.status(status).json({ ok: false, error: message });
}

export function registerReputationRoutes(app: Express, deps: ReputationRouteDeps): void {
  const env = deps.env ?? process.env;
  const service = new ReputationService({
    repository: deps.repository,
    approvalQueue: deps.approvalQueue,
    eventBus: deps.eventBus,
    gbpProvider: deps.gbpProvider ?? new EnvGbpReviewProvider(env)
  });

  app.post("/api/reputation/gbp/poll", async (req: Request, res: Response) => {
    try {
      const requestedTenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "reputationGbpPoll"
      });
      const result = await service.pollGbpReviews(tenantFrom(access.tenantId, env));
      res.json({ ok: true, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/reputation/reviews", async (req: Request, res: Response) => {
    try {
      const requestedTenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "reputationReviews"
      });
      res.json({ ok: true, reviews: await deps.repository.listReviews(access.tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/reputation/queue", async (req: Request, res: Response) => {
    try {
      const requestedTenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "reputationQueue"
      });
      const [reviews, profiles] = await Promise.all([
        deps.repository.listReviews(access.tenantId),
        deps.repository.listProfiles(access.tenantId)
      ]);
      res.json({ ok: true, reviews, profiles, pendingReplies: reviews.filter((review) => review.replyStatus === "drafted") });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/reputation/reviews/:id/reply/draft", async (req: Request, res: Response) => {
    try {
      const requestedTenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "reputationReplyDraft"
      });
      const reviewId = req.params.id;
      if (!reviewId) {
        throw new RailError("Review id is required.", { provider: "native", op: "draftReviewReply", status: 400 });
      }
      const result = await service.draftReviewReply(tenantFrom(access.tenantId, env), reviewId, actorIdForAccess(access));
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/reputation/review-requests", async (req: Request, res: Response) => {
    try {
      const requestedTenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "reputationReviewRequest"
      });
      const approval = await service.queueReviewRequest(tenantFrom(access.tenantId, env), req.body, actorIdForAccess(access));
      res.status(201).json({ ok: true, approval, sendsAreApprovalQueuedOnly: true, usesCampaignRail: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/reputation/profile-sync/draft", async (req: Request, res: Response) => {
    try {
      const requestedTenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : defaultTenantId(env);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "reputationProfileSync"
      });
      const result = await service.draftProfileSync(tenantFrom(access.tenantId, env), req.body, actorIdForAccess(access));
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/reputation/widget", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : defaultTenantId(env);
      const reviews = (await deps.repository.listReviews(tenantId))
        .filter((review) => review.rating >= 4)
        .slice(0, 6)
        .map((review) => ({
          rating: review.rating,
          quote: review.comment,
          attribution: review.authorName,
          reviewedAt: review.reviewedAt
        }));
      res.json({ ok: true, reviews, embedReady: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
