import type { Express, Request, Response } from "express";
import { RailError, type ApprovalQueueService } from "@nexteam/core";
import { actorIdForAccess, requireTenantRole } from "../auth/accessContext.js";
import type { IntakeService } from "./service.js";

export interface IntakeRouteDeps {
  service: IntakeService;
  approvalQueue: ApprovalQueueService;
  env?: NodeJS.ProcessEnv | undefined;
}

function defaultTenantId(env: NodeJS.ProcessEnv) {
  return env.TENANT_ID || "aquatrace";
}

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown intake route error";
  res.status(status).json({ ok: false, error: message });
}

function tenantIdFromRequest(req: Request, env: NodeJS.ProcessEnv): string {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const queryTenant = typeof req.query.tenantId === "string" ? req.query.tenantId : "";
  const bodyTenant = typeof body.tenantId === "string" ? body.tenantId : "";
  return bodyTenant || queryTenant || defaultTenantId(env);
}

export function registerIntakeRoutes(app: Express, deps: IntakeRouteDeps): void {
  const env = deps.env ?? process.env;

  app.post("/api/intake/start", async (req: Request, res: Response) => {
    try {
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantIdFromRequest(req, env),
        op: "intakeStart"
      });
      const session = await deps.service.start(req.body, access.tenantId);
      res.status(201).json({ ok: true, session, actorId: actorIdForAccess(access) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/intake/:sessionId/answer", async (req: Request, res: Response) => {
    try {
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantIdFromRequest(req, env),
        op: "intakeAnswer"
      });
      const session = await deps.service.answer({ ...req.body, sessionId: req.params.sessionId }, access.tenantId);
      res.json({ ok: true, session, actorId: actorIdForAccess(access) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/intake/:sessionId/finalize", async (req: Request, res: Response) => {
    try {
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantIdFromRequest(req, env),
        op: "intakeFinalize"
      });
      const result = await deps.service.finalize({ sessionId: req.params.sessionId }, access.tenantId, deps.approvalQueue, actorIdForAccess(access));
      res.json({ ok: true, ...result, actorId: actorIdForAccess(access), approvalQueuedOnly: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/intake/:sessionId", async (req: Request, res: Response) => {
    try {
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantIdFromRequest(req, env),
        op: "intakeRead"
      });
      const session = await deps.service.getSession(access.tenantId, String(req.params.sessionId ?? ""));
      if (!session) {
        throw new RailError("Intake session was not found.", { provider: "native", op: "intakeRead", status: 404 });
      }
      res.json({ ok: true, session });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/intake", async (req: Request, res: Response) => {
    try {
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantIdFromRequest(req, env),
        op: "intakeList"
      });
      res.json({ ok: true, sessions: await deps.service.listSessions(access.tenantId) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
