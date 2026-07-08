import type { Express, Request, Response } from "express";
import { z } from "zod";
import { RailError, type ApprovalQueueService, type ArtifactKind, type Tenant } from "@nexteam/core";
import { actorIdForAccess, requireTenantRole } from "../auth/accessContext.js";
import type { CampaignRepository } from "./repository.js";
import { unsubscribeInputSchema } from "./schemas.js";
import { CampaignService } from "./service.js";

export interface CampaignRouteDeps {
  repository: CampaignRepository;
  approvalQueue: ApprovalQueueService;
  env?: NodeJS.ProcessEnv | undefined;
}

const tenantSchema = z.object({
  tenantId: z.string().min(1).default("aquatrace"),
  tenantName: z.string().default("Aquatrace")
});

const trackInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  campaignId: z.string().min(1),
  contactId: z.string().min(1),
  channel: z.enum(["email", "sms"]).default("email"),
  stepId: z.string().optional(),
  url: z.string().optional()
});

const queueStepInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  stepId: z.string().min(1)
});

const reportDeliverySchema = z.object({
  tenantId: z.string().min(1).optional(),
  to: z.string().email(),
  reportTitle: z.string().min(1),
  reportRef: z.string().min(1)
});

const invoicePaidSchema = z.object({
  tenantId: z.string().min(1).optional(),
  to: z.string().email(),
  invoiceId: z.string().min(1),
  clientName: z.string().min(1)
});

function tenantFrom(input: { tenantId?: string | undefined; tenantName?: string | undefined }, env: NodeJS.ProcessEnv): Tenant {
  const tenantId = input.tenantId || env.TENANT_ID || "aquatrace";
  const approval = Object.fromEntries(
    (["email", "sms", "gbp_post", "social_post", "article", "quote", "invoice", "site_publish", "review_reply"] satisfies ArtifactKind[])
      .map((kind) => [kind, { autoApprove: false, cleanStreak: 0 }])
  ) as Tenant["approval"];
  return {
    id: tenantId,
    name: input.tenantName || (tenantId === "aquatrace" ? "Aquatrace" : tenantId),
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "native", email: "gmail_relay" },
    approval,
    timezone: env.TENANT_TIMEZONE || "America/New_York",
    plan: "suite"
  };
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown Campaign route error";
  res.status(status).json({ ok: false, error: message });
}

export function registerCampaignRoutes(app: Express, deps: CampaignRouteDeps): void {
  const env = deps.env ?? process.env;
  const service = new CampaignService({ repository: deps.repository, approvalQueue: deps.approvalQueue, env });

  app.get("/api/campaigns/templates", async (req: Request, res: Response) => {
    try {
      const requestedTenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : env.TENANT_ID || "aquatrace";
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId,
        op: "campaignTemplates"
      });
      res.json({ ok: true, templates: await deps.repository.listTemplates(access.tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/campaigns/audience/preview", async (req: Request, res: Response) => {
    try {
      const tenantInput = tenantSchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantInput.tenantId,
        op: "campaignAudiencePreview"
      });
      const tenant = tenantFrom({ ...tenantInput, tenantId: access.tenantId }, env);
      const preview = await service.previewAudience(tenant, req.body?.filter ?? req.body);
      res.json({ ok: true, ...preview });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/campaigns/test-run", async (req: Request, res: Response) => {
    try {
      const tenantInput = tenantSchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantInput.tenantId,
        op: "campaignTestRun"
      });
      const tenant = tenantFrom({ ...tenantInput, tenantId: access.tenantId }, env);
      const result = await service.queueTemplateCampaign(tenant, req.body, actorIdForAccess(access));
      res.status(201).json({ ok: true, ...result, sendsAreApprovalQueuedOnly: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/campaigns/:id/queue-step", async (req: Request, res: Response) => {
    try {
      const input = queueStepInputSchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId ?? env.TENANT_ID ?? "aquatrace",
        op: "campaignQueueStep"
      });
      const tenant = tenantFrom({ tenantId: access.tenantId }, env);
      const campaignId = req.params.id;
      if (!campaignId) {
        throw new RailError("Campaign id is required.", { provider: "native", op: "queueCampaignStep", status: 400 });
      }
      const result = await service.queueStep(tenant, campaignId, input.stepId, undefined, actorIdForAccess(access));
      res.status(201).json({ ok: true, ...result, sendsAreApprovalQueuedOnly: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/campaigns/track/open", async (req: Request, res: Response) => {
    try {
      const input = trackInputSchema.parse(req.body ?? {});
      const tenant = tenantFrom({ tenantId: input.tenantId }, env);
      const event = await service.recordOpenOrClick(tenant, { ...input, type: "open" });
      res.json({ ok: true, event });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/campaigns/track/click", async (req: Request, res: Response) => {
    try {
      const input = trackInputSchema.parse(req.body ?? {});
      const tenant = tenantFrom({ tenantId: input.tenantId }, env);
      const event = await service.recordOpenOrClick(tenant, { ...input, type: "click" });
      res.json({ ok: true, event });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.all("/api/campaigns/unsubscribe", async (req: Request, res: Response) => {
    try {
      const raw = req.method === "GET" ? req.query : req.body;
      const input = unsubscribeInputSchema.parse(raw);
      const tenant = tenantFrom({ tenantId: input.tenantId }, env);
      const result = await service.unsubscribe(tenant, input);
      res.json({ ok: true, ...result, message: "You are unsubscribed from this campaign channel." });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/campaigns/transactional/report-delivery", async (req: Request, res: Response) => {
    try {
      const input = reportDeliverySchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId ?? env.TENANT_ID ?? "aquatrace",
        op: "campaignReportDelivery"
      });
      const tenant = tenantFrom({ tenantId: access.tenantId }, env);
      const approval = await service.queueTransactionalReportDelivery(tenant, input, actorIdForAccess(access));
      res.status(201).json({ ok: true, approval, sendsAreApprovalQueuedOnly: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/campaigns/transactional/invoice-paid", async (req: Request, res: Response) => {
    try {
      const input = invoicePaidSchema.parse(req.body ?? {});
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: input.tenantId ?? env.TENANT_ID ?? "aquatrace",
        op: "campaignInvoicePaid"
      });
      const tenant = tenantFrom({ tenantId: access.tenantId }, env);
      const approval = await service.queueInvoicePaidReviewRequest(tenant, input, actorIdForAccess(access));
      res.status(201).json({ ok: true, approval, delayHours: 48, sendsAreApprovalQueuedOnly: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/campaigns/stats", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : env.TENANT_ID || "aquatrace";
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "campaignStats"
      });
      const tenant = tenantFrom({ tenantId: access.tenantId }, env);
      res.json({ ok: true, stats: await service.stats(tenant) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
