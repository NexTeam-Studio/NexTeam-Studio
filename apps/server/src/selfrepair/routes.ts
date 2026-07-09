import type { Express, Request, Response } from "express";
import { z } from "zod";
import { RailError } from "@nexteam/core";
import { requireTenantRole } from "../auth/accessContext.js";
import type { SelfRepairService } from "./service.js";

export interface SelfRepairRouteDeps {
  service: SelfRepairService;
  env?: NodeJS.ProcessEnv | undefined;
}

const listQuerySchema = z.object({
  tenantId: z.string().min(1).default("aquatrace"),
  limit: z.coerce.number().int().min(1).max(60).default(14)
});

function sendRouteError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  const message = error instanceof Error ? error.message : "Unknown self-repair route error";
  res.status(status).json({ ok: false, error: message });
}

export function registerSelfRepairRoutes(app: Express, deps: SelfRepairRouteDeps): void {
  const env = deps.env ?? process.env;

  app.post("/api/self-repair/run", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.body?.tenantId === "string" && req.body.tenantId.trim()
        ? req.body.tenantId.trim()
        : env.TENANT_ID || "aquatrace";
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "selfRepairRun"
      });
      const log = await deps.service.run({ ...req.body, tenantId: access.tenantId });
      res.status(201).json({ ok: true, log });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/self-repair/logs", async (req: Request, res: Response) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: query.tenantId,
        op: "selfRepairList"
      });
      res.json({ ok: true, logs: await deps.service.listLogs(access.tenantId, query.limit) });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/self-repair/logs/:date", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
        ? req.query.tenantId.trim()
        : env.TENANT_ID || "aquatrace";
      const date = req.params.date;
      if (!date) {
        throw new RailError("Self-repair log date is required.", { provider: "platform", op: "getSelfRepairLog", status: 400 });
      }
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "selfRepairGet"
      });
      const log = await deps.service.getLog(access.tenantId, date);
      if (!log) {
        throw new RailError("Self-repair log was not found.", { provider: "platform", op: "getSelfRepairLog", status: 404 });
      }
      res.json({ ok: true, log });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
