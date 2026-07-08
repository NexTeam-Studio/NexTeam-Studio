import { Router, type Request, type Response } from "express";
import { RailError, type ArtifactKind, type NexiTool, type Tenant } from "@nexteam/core";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth, getAdminDb } from "../firebase.js";
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

function loadDefaultTenant(req: Request): Tenant {
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
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  res.status(status).json({ ok: false, error: error instanceof Error ? error.message : "Unknown Nexi error" });
}

function runtimeStores(env: NodeJS.ProcessEnv): { repository: NexiRepository; usageLog: FirestoreUsageLogWriter | MemoryUsageLogWriter } {
  const db = getAdminDb(env);
  if (db) {
    return { repository: new FirestoreNexiRepository(db), usageLog: new FirestoreUsageLogWriter(db) };
  }
  return { repository: memoryRepository, usageLog: memoryUsageLog };
}

function envList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

function hasOperatorAccess(decoded: DecodedIdToken, env: NodeJS.ProcessEnv): boolean {
  const allowedUids = envList(env.FIREBASE_PLATFORM_OPERATOR_UIDS);
  const allowedEmails = envList(env.FIREBASE_PLATFORM_OPERATOR_EMAILS);
  const email = decoded.email?.toLowerCase() ?? "";
  const roles = Array.isArray(decoded.roles) ? decoded.roles.map((role) => String(role).toLowerCase()) : [];
  return allowedUids.includes(decoded.uid.toLowerCase())
    || (!!email && allowedEmails.includes(email))
    || decoded.platform_operator === true
    || roles.includes("platform_operator");
}

async function requireNexiOperator(req: Request, env: NodeJS.ProcessEnv): Promise<void> {
  if (env.NEXI_FIREBASE_AUTH_REQUIRED === "false") {
    return;
  }
  const auth = getAdminAuth(env);
  if (!auth) {
    return;
  }
  const header = req.header("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new RailError("Firebase operator sign-in is required.", { provider: "firebase", op: "nexiAuth", status: 401 });
  }
  const decoded = await auth.verifyIdToken(match[1]);
  if (!hasOperatorAccess(decoded, env)) {
    throw new RailError("Firebase user is not authorized for Nexi Job Desk.", { provider: "firebase", op: "nexiAuth", status: 403 });
  }
}

export interface NexiRouterDeps {
  extraTools?: NexiTool[] | undefined;
  extraToolsForRequest?: ((req: Request, tenant: Tenant) => Promise<NexiTool[]> | NexiTool[]) | undefined;
  loadTenant?: ((req: Request) => Promise<Tenant> | Tenant) | undefined;
  filterTools?: ((tenant: Tenant, tools: NexiTool[]) => NexiTool[]) | undefined;
}

export function createNexiRouter(env: NodeJS.ProcessEnv = process.env, deps: NexiRouterDeps = {}): Router {
  const router = Router();

  router.post("/message", async (req: Request, res: Response) => {
    try {
      await requireNexiOperator(req, env);
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      if (!message) {
        res.status(400).json({ ok: false, error: "message is required" });
        return;
      }
      const conversationId = typeof req.body?.conversationId === "string" && req.body.conversationId.trim()
        ? req.body.conversationId.trim()
        : undefined;
      const tenant = deps.loadTenant ? await deps.loadTenant(req) : loadDefaultTenant(req);
      const stores = runtimeStores(env);
      const requestTools = deps.extraToolsForRequest ? await deps.extraToolsForRequest(req, tenant) : [];
      const rawTools = [
        ...createNexiJobDeskTools(env, stores.repository),
        ...(deps.extraTools ?? []),
        ...requestTools
      ];
      const tools = deps.filterTools ? deps.filterTools(tenant, rawTools) : rawTools;
      const result = await answerNexiMessage({
        tenant,
        message,
        conversationId,
        tools,
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
      await requireNexiOperator(req, env);
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

  router.get("/debug/state", async (req: Request, res: Response) => {
    try {
      await requireNexiOperator(req, env);
      res.json({
        ok: true,
        conversations: memoryRepository.conversations,
        failureLog: memoryRepository.failureLog,
        siteJobBlueprints: memoryRepository.siteJobBlueprints,
        usageLog: memoryUsageLog.records
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
