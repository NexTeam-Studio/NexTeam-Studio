import type { Express, Request, Response } from "express";
import { z } from "zod";
import { type ApprovalQueueService, RailError } from "@nexteam/core";
import { MobilePushRegistrationSchema, MobileSyncRequestSchema, OfflineOperationSchema } from "@nexteam/mobile";
import { actorIdForAccess, requireAccessContext, requireTenantRole } from "../auth/accessContext.js";
import { assertMobileDayScheduleAccess, assertMobileJobAccess } from "./access.js";
import type { InMemoryMobileRepository } from "./repository.js";

const dayScheduleQuerySchema = z.object({
  tenantId: z.string().default("aquatrace"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  technicianId: z.string().optional()
});

const pushRegistrationSchema = z.object({
  tenantId: z.string().default("aquatrace"),
  expoPushToken: z.string().min(1),
  deviceId: z.string().min(1),
  platform: z.enum(["ios", "android", "web", "unknown"]).default("unknown")
});

export interface MobileRouteDeps {
  repository: InMemoryMobileRepository;
  approvalQueue: ApprovalQueueService;
  env?: NodeJS.ProcessEnv | undefined;
}

function sendError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  res.status(status).json({ ok: false, error: error instanceof Error ? error.message : "Unknown mobile error" });
}

export function registerMobileRoutes(app: Express, deps: MobileRouteDeps): void {
  const env = deps.env ?? process.env;

  app.get("/api/mobile/day-schedule", async (req: Request, res: Response) => {
    try {
      const input = dayScheduleQuerySchema.parse(req.query);
      const access = await requireAccessContext(req, env, {
        requestedTenantId: input.tenantId,
        op: "mobileDaySchedule"
      });
      const technicianId = assertMobileDayScheduleAccess(access, input.technicianId ?? access.tenantUserId);
      const schedule = deps.repository.getDaySchedule(access.tenantId, input.date, technicianId);
      res.json({ ok: true, schedule, access: { tenantId: access.tenantId, tenantUserId: access.tenantUserId, role: access.role } });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/mobile/jobs/:jobId", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : env.TENANT_ID || "aquatrace";
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "mobileJob" });
      const jobId = req.params.jobId;
      if (!jobId) {
        throw new RailError("Job id is required.", { provider: "native", op: "mobileJob", status: 400 });
      }
      const job = deps.repository.getJob(access.tenantId, jobId);
      if (!job) {
        throw new RailError("That job was not found.", { provider: "native", op: "mobileJob", status: 404 });
      }
      res.json({ ok: true, job: assertMobileJobAccess(access, job, "mobileJob") });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/mobile/sync", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : env.TENANT_ID || "aquatrace";
      const access = await requireAccessContext(req, env, { requestedTenantId: tenantId, op: "mobileSync" });
      const input = MobileSyncRequestSchema.parse(req.body);
      const results = input.operations.map((candidate) => {
        const operation = OfflineOperationSchema.parse(candidate);
        if (operation.tenantId !== access.tenantId) {
          throw new RailError("Offline operation tenant does not match sign-in.", { provider: "native", op: "mobileSync", status: 403 });
        }
        const job = deps.repository.getJob(operation.tenantId, operation.jobId);
        if (!job) {
          throw new RailError("Offline operation references a missing job.", { provider: "native", op: "mobileSync", status: 404 });
        }
        assertMobileJobAccess(access, job, "mobileSync");
        return deps.repository.applyOperation(operation);
      });
      res.json({
        ok: true,
        results,
        summary: {
          attempted: results.length,
          synced: results.filter((result) => result.ok).length,
          conflicts: results.reduce((count, result) => count + result.conflicts.length, 0)
        }
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/mobile/push-token", async (req: Request, res: Response) => {
    try {
      const input = pushRegistrationSchema.parse(req.body);
      const access = await requireAccessContext(req, env, {
        requestedTenantId: input.tenantId,
        op: "mobilePushToken"
      });
      if (access.accessKind !== "internal") {
        throw new RailError("Job-link users cannot register tenant push tokens.", { provider: "native", op: "mobilePushToken", status: 403 });
      }
      const registration = await deps.repository.registerPushToken(MobilePushRegistrationSchema.parse({
        tenantId: access.tenantId,
        tenantUserId: access.tenantUserId,
        role: access.role,
        expoPushToken: input.expoPushToken,
        deviceId: input.deviceId,
        platform: input.platform,
        registeredAt: new Date().toISOString()
      }));
      res.status(201).json({ ok: true, registration });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/mobile/approvals", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : env.TENANT_ID || "aquatrace";
      const access = await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN"], {
        requestedTenantId: tenantId,
        op: "mobileApprovals"
      });
      res.json({ ok: true, actorId: actorIdForAccess(access), items: await deps.approvalQueue.listPending(access.tenantId) });
    } catch (error) {
      sendError(res, error);
    }
  });
}
