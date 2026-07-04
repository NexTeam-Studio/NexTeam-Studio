import { Router, type Request, type Response } from "express";
import { type ArtifactKind, type Tenant } from "@nexteam/core";
import { createNexiJobDeskTools } from "./nexiTools.js";
import { answerNexiMessage, MemoryNexiRepository } from "./nexiService.js";
import { ingestSiteJobBlueprint } from "./siteJobBlueprintIngest.js";

const repository = new MemoryNexiRepository();

function defaultApproval(): Tenant["approval"] {
  const kinds: ArtifactKind[] = ["email", "sms", "gbp_post", "social_post", "article", "quote", "invoice", "site_publish", "review_reply"];
  return Object.fromEntries(kinds.map((kind) => [kind, { autoApprove: false, cleanStreak: 0 }])) as Tenant["approval"];
}

function loadTenant(req: Request): Tenant {
  const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim() ? req.body.tenantId.trim() : process.env.TENANT_ID || "aquatrace";
  return {
    id: tenantId,
    name: tenantId === "aquatrace" ? "Aquatrace" : tenantId,
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "jobber", media: "companycam", email: "gmail_relay" },
    approval: defaultApproval(),
    timezone: "America/New_York",
    plan: "suite"
  };
}

function sendError(res: Response, error: unknown): void {
  res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Unknown Nexi error" });
}

export function createNexiRouter(env: NodeJS.ProcessEnv = process.env): Router {
  const router = Router();

  router.post("/message", async (req: Request, res: Response) => {
    try {
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      if (!message) {
        res.status(400).json({ ok: false, error: "message is required" });
        return;
      }
      const tenant = loadTenant(req);
      const result = await answerNexiMessage({ tenant, message, tools: createNexiJobDeskTools(env), repository });
      res.json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/site-job-blueprints/ingest", (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : process.env.TENANT_ID || "aquatrace";
      const sourceId = typeof req.body?.sourceId === "string" ? req.body.sourceId : "inline";
      const text = typeof req.body?.text === "string" ? req.body.text : "";
      const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : undefined;
      const siteJobBlueprint = ingestSiteJobBlueprint({ tenantId, sourceId, text, jobId });
      res.json({ ok: true, siteJobBlueprint });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/debug/state", (_req: Request, res: Response) => {
    res.json({ ok: true, conversations: repository.conversations, failureLog: repository.failureLog });
  });

  return router;
}

