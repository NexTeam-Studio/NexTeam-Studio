import { Router, type Request, type Response } from "express";
import { RailError, type ArtifactKind, type NexiTool, type Tenant } from "@nexteam/core";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth, getAdminDb } from "../firebase.js";
import { FirestoreUsageLogWriter, MemoryUsageLogWriter } from "../usageLog.js";
import { FirestoreNexiRepository, MemoryNexiRepository, type NexiRepository } from "./nexiRepository.js";
import { createNexiLookupTools } from "./nexiTools.js";
import { answerNexiMessage, pendingApprovalFromConversationRecords, type NexiRequestorContext } from "./nexiService.js";
import { ingestSiteJobBlueprint } from "./siteJobBlueprintIngest.js";
import { mergeNexiToolSets } from "./toolRegistry.js";

const memoryRepository = new MemoryNexiRepository();
const memoryUsageLog = new MemoryUsageLogWriter();
const NEXI_USER_SAFE_ERROR_MESSAGE = "I couldn't pull that up just now - the check failed on my end and I've logged it to fix. Give me a moment and try again.";

function defaultApproval(): Tenant["approval"] {
  const kinds: ArtifactKind[] = ["client", "job", "tenant_provisioning", "email", "sms", "gbp_post", "social_post", "article", "quote", "invoice", "site_publish", "gbp_profile_update", "seo_fix", "review_reply"];
  return Object.fromEntries(kinds.map((kind) => [kind, { autoApprove: false, cleanStreak: 0 }])) as Tenant["approval"];
}

function loadDefaultTenant(req: Request): Tenant {
  const bodyTenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim() ? req.body.tenantId.trim() : "";
  const queryTenantId = typeof req.query?.tenantId === "string" && req.query.tenantId.trim() ? req.query.tenantId.trim() : "";
  const tenantId = bodyTenantId || queryTenantId || process.env.TENANT_ID || "aquatrace";
  return {
    id: tenantId,
    name: tenantId === "aquatrace" ? "Aquatrace" : tenantId,
    industryPack: "pool_leak",
    branding: { assistantName: "Nexi" },
    adapters: { crm: "native", media: "native", email: "gmail_relay" },
    approval: defaultApproval(),
    timezone: "America/New_York",
    plan: "suite"
  };
}

function sendError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  res.status(status).json({ ok: false, error: error instanceof Error ? error.message : "Unknown Nexi error" });
}

function sanitizeNexiRouteError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/duplicate nexi tool registration|tool names must be unique|unknown tool:|anthropic_api_key|typeerror:|referenceerror:|syntaxerror:/i.test(message)) {
    return NEXI_USER_SAFE_ERROR_MESSAGE;
  }
  return message || NEXI_USER_SAFE_ERROR_MESSAGE;
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
  loadRequestorContext?: ((req: Request, tenant: Tenant) => Promise<NexiRequestorContext | null> | NexiRequestorContext | null) | undefined;
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
      const actorDisplayName = typeof req.body?.actorDisplayName === "string" && req.body.actorDisplayName.trim()
        ? req.body.actorDisplayName.trim()
        : undefined;
      const requestorOrigin = typeof req.body?.requestorOrigin === "string" && req.body.requestorOrigin.trim()
        ? req.body.requestorOrigin.trim()
        : undefined;
      const pendingApproval = req.body?.pendingApproval && typeof req.body.pendingApproval === "object"
        ? req.body.pendingApproval
        : undefined;
      const tenant = deps.loadTenant ? await deps.loadTenant(req) : loadDefaultTenant(req);
      const requestorContext = deps.loadRequestorContext ? await deps.loadRequestorContext(req, tenant) : null;
      const stores = runtimeStores(env);
      const requestTools = deps.extraToolsForRequest ? await deps.extraToolsForRequest(req, tenant) : [];
      const rawTools = mergeNexiToolSets([
        { label: "lookup", tools: createNexiLookupTools(stores.repository) },
        { label: "static-extra", tools: deps.extraTools ?? [] },
        { label: "request-scoped", tools: requestTools }
      ]);
      const tools = deps.filterTools ? deps.filterTools(tenant, rawTools) : rawTools;
      const result = await answerNexiMessage({
        tenant,
        message,
        conversationId,
        actorDisplayName,
        requestorContext: requestorContext || requestorOrigin ? {
          ...(requestorContext ?? {}),
          ...(requestorOrigin ? { origin: requestorOrigin } : {})
        } : undefined,
        pendingApproval,
        tools,
        repository: stores.repository,
        usageLog: stores.usageLog,
        env
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof RailError && (error.status === 401 || error.status === 403 || error.status === 400)) {
        sendError(res, error);
        return;
      }
      res.status(500).json({ ok: false, error: sanitizeNexiRouteError(error) });
    }
  });

  router.get("/history", async (req: Request, res: Response) => {
    try {
      await requireNexiOperator(req, env);
      const conversationId = typeof req.query?.conversationId === "string" && req.query.conversationId.trim()
        ? req.query.conversationId.trim()
        : "";
      if (!conversationId) {
        res.status(400).json({ ok: false, error: "conversationId is required" });
        return;
      }
      const tenant = deps.loadTenant ? await deps.loadTenant(req) : loadDefaultTenant(req);
      const stores = runtimeStores(env);
      const recent = await stores.repository.loadRecentConversations(tenant.id, conversationId, 100);
      res.json({
        ok: true,
        conversationId,
        messages: recent.flatMap((record) => [
          {
            id: `${record.id}:user`,
            role: "user",
            text: record.userText,
            sources: []
          },
          {
            id: `${record.id}:assistant`,
            role: "assistant",
            text: record.assistantText,
            sources: record.sources
          }
        ]),
        pendingApproval: pendingApprovalFromConversationRecords(recent, null)
      });
    } catch (error) {
      if (error instanceof RailError && (error.status === 401 || error.status === 403 || error.status === 400)) {
        sendError(res, error);
        return;
      }
      res.status(500).json({ ok: false, error: sanitizeNexiRouteError(error) });
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
