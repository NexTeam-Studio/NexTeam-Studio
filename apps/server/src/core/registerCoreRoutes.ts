import { Readable } from "node:stream";
import type { Express, Request, Response } from "express";
import type { ApprovalQueueService} from "@nexteam/core";
import { RailError, approvalItemSchema, logger } from "@nexteam/core";
import { CompanyCamAdapter } from "@nexteam/providers";
import { getBuildInfo } from "../buildInfo.js";
import { buildHealth } from "../health.js";
import type { ServerRuntime } from "../app/runtime.js";
import { configuredTenantId } from "./tenantConfig.js";
import { requireAccessContext } from "../auth/accessContext.js";

function sendError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown server error";
  logger.error({ status, message });
  res.status(status).json({ ok: false, error: message });
}

function firebaseRuntimeConfig(env: NodeJS.ProcessEnv): {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
} {
  return {
    apiKey: env.VITE_FIREBASE_API_KEY || "",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: env.VITE_FIREBASE_APP_ID || ""
  };
}

export function registerCoreRoutes(app: Express, runtime: ServerRuntime): void {
  app.get("/api/version", (_req: Request, res: Response) => {
    res.json(getBuildInfo());
  });

  app.get("/api/health", async (_req: Request, res: Response) => {
    try {
      res.json(await buildHealth(runtime.env));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/public/runtime-config", (_req: Request, res: Response) => {
    const firebase = firebaseRuntimeConfig(runtime.env);
    res.json({
      ok: true,
      firebase,
      firebaseConfigured: Object.values(firebase).every((value) => value.length > 0)
    });
  });

  app.get("/api/auth/access-context", async (req: Request, res: Response) => {
    try {
      const access = await requireAccessContext(req, runtime.env, { op: "shellAccessContext" });
      res.json({
        ok: true,
        tenantId: access.tenantId,
        tenantUserId: access.tenantUserId,
        role: access.role
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/media/:id", async (req: Request, res: Response) => {
    try {
      const mediaId = req.params.id;
      if (!mediaId) {
        throw new RailError("Media id is required.", { provider: "companycam", op: "fetchBinary", status: 400 });
      }
      const companyCam = CompanyCamAdapter.fromEnv(runtime.env);
      const binary = await companyCam.fetchBinary(mediaId);
      res.setHeader("content-type", binary.mime);
      if (req.query.download === "1") {
        res.setHeader("content-disposition", `attachment; filename="companycam-${mediaId.replace(/[^a-z0-9_-]/gi, "_")}.jpg"`);
      }
      if (binary.stream instanceof Readable) {
        binary.stream.pipe(res);
        return;
      }
      Readable.from(binary.stream as AsyncIterable<Uint8Array>).pipe(res);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/approval-queue", async (req: Request, res: Response) => {
    try {
      const item = await runtime.approvalQueue.create(req.body as Parameters<ApprovalQueueService["create"]>[0]);
      res.status(201).json(approvalItemSchema.parse(item));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/approval-queue", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string"
        ? req.query.tenantId
        : configuredTenantId(runtime.env, "listApprovalQueue");
      res.json({ ok: true, items: await runtime.approvalQueue.listPending(tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/approval-queue/:id/approve", async (req: Request, res: Response) => {
    try {
      const approvalId = req.params.id;
      if (!approvalId) {
        throw new RailError("Approval id is required.", { provider: "approval", op: "approve", status: 400 });
      }
      const tenantId = configuredTenantId(runtime.env, "approveApprovalQueueItem");
      const item = await runtime.approvalQueue.approve(tenantId, approvalId);
      res.json({ ok: true, item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/approval-queue/:id/execute", async (req: Request, res: Response) => {
    try {
      const approvalId = req.params.id;
      if (!approvalId) {
        throw new RailError("Approval id is required.", { provider: "approval", op: "execute", status: 400 });
      }
      const tenantId = configuredTenantId(runtime.env, "executeApprovalQueueItem");
      const result = await runtime.approvalQueue.executeApproved(tenantId, approvalId);
      res.json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });
}
