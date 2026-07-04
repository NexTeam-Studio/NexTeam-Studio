import { Router, type Request, type Response } from "express";
import { type ArtifactKind, type Tenant } from "@nexteam/core";
import { getAdminDb } from "../firebase.js";
import { FirestoreUsageLogWriter, MemoryUsageLogWriter } from "../usageLog.js";
import { FirestoreNexiRepository, MemoryNexiRepository, type NexiRepository } from "./nexiRepository.js";
import { createNexiJobDeskTools } from "./nexiTools.js";
import { answerNexiMessage } from "./nexiService.js";
import { ingestSiteJobBlueprint } from "./siteJobBlueprintIngest.js";

const memoryRepository = new MemoryNexiRepository();
const memoryUsageLog = new MemoryUsageLogWriter();

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

function runtimeStores(env: NodeJS.ProcessEnv): { repository: NexiRepository; usageLog: FirestoreUsageLogWriter | MemoryUsageLogWriter } {
  const db = getAdminDb(env);
  if (db) {
    return { repository: new FirestoreNexiRepository(db), usageLog: new FirestoreUsageLogWriter(db) };
  }
  return { repository: memoryRepository, usageLog: memoryUsageLog };
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
      const conversationId = typeof req.body?.conversationId === "string" && req.body.conversationId.trim()
        ? req.body.conversationId.trim()
        : undefined;
      const tenant = loadTenant(req);
      const stores = runtimeStores(env);
      const result = await answerNexiMessage({
        tenant,
        message,
        conversationId,
        tools: createNexiJobDeskTools(env, stores.repository),
        repository: stores.repository,
        usageLog: stores.usageLog,
        env
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/site-job-blueprints/ingest", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : process.env.TENANT_ID || "aquatrace";
      const sourceId = typeof req.body?.sourceId === "string" ? req.body.sourceId : "inline";
      const text = typeof req.body?.text === "string" ? req.body.text : "";
      const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : undefined;
      const siteJobBlueprint = ingestSiteJobBlueprint({ tenantId, sourceId, text, jobId });
      await runtimeStores(env).repository.saveSiteJobBlueprint(siteJobBlueprint);
      res.json({ ok: true, siteJobBlueprint });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/debug/state", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      conversations: memoryRepository.conversations,
      failureLog: memoryRepository.failureLog,
      siteJobBlueprints: memoryRepository.siteJobBlueprints,
      usageLog: memoryUsageLog.records
    });
  });

  return router;
}
