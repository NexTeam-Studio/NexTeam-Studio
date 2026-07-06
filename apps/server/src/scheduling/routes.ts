import type { Express, Request, Response } from "express";
import { z } from "zod";
import { type ApprovalQueueService, RailError } from "@nexteam/core";
import { detectConflicts, driveTimeProviderFromEnv, suggestSlots, type ScheduledVisit, type ScheduleLocation } from "./schedulingEngine.js";
import type { SchedulingRepository } from "./repository.js";
import { queueScheduleNotification } from "./notifications.js";

const locationSchema = z.object({
  label: z.string(),
  address: z.object({
    street1: z.string(),
    street2: z.string().optional(),
    city: z.string(),
    province: z.string(),
    postalCode: z.string(),
    country: z.string()
  }).optional(),
  geo: z.object({ lat: z.number(), lng: z.number() }).optional()
});

const findSlotSchema = z.object({
  tenantId: z.string().default("aquatrace"),
  jobId: z.string(),
  title: z.string(),
  location: locationSchema,
  from: z.string(),
  to: z.string(),
  durationMinutes: z.number().int().min(30).max(480).default(120),
  technicians: z.array(z.string()).default(["crew-1"])
});

const bookVisitSchema = z.object({
  tenantId: z.string().default("aquatrace"),
  jobId: z.string(),
  title: z.string(),
  location: locationSchema,
  start: z.string(),
  end: z.string(),
  assignedTo: z.array(z.string()).default(["crew-1"]),
  notifyTo: z.string().email().optional()
});

const queueVisitMessageSchema = z.object({
  tenantId: z.string().default("aquatrace"),
  channel: z.enum(["email", "sms"]).default("email"),
  notifyTo: z.string().optional(),
  etaMinutes: z.number().int().positive().max(480).optional()
});

function sendError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  res.status(status).json({ ok: false, error: error instanceof Error ? error.message : "Unknown scheduling error" });
}

function visitFromInput(input: z.infer<typeof bookVisitSchema>): ScheduledVisit {
  return {
    id: `visit_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    jobId: input.jobId,
    title: input.title,
    start: input.start,
    end: input.end,
    assignedTo: input.assignedTo,
    location: input.location as ScheduleLocation,
    status: "pending_approval"
  };
}

export interface SchedulingRouteDeps {
  repository: SchedulingRepository;
  approvalQueue: ApprovalQueueService;
  env?: NodeJS.ProcessEnv | undefined;
}

export function registerSchedulingRoutes(app: Express, deps: SchedulingRouteDeps): void {
  app.get("/api/scheduling/calendar", async (req: Request, res: Response) => {
    try {
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : process.env.TENANT_ID || "aquatrace";
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;
      const range: { from?: string; to?: string } = {};
      if (from) {
        range.from = from;
      }
      if (to) {
        range.to = to;
      }
      res.json({ ok: true, visits: await deps.repository.listVisits(tenantId, range) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/scheduling/find-slot", async (req: Request, res: Response) => {
    try {
      const input = findSlotSchema.parse(req.body);
      const existingVisits = await deps.repository.listVisits(input.tenantId, { from: input.from, to: input.to });
      const suggestions = await suggestSlots({
        ...input,
        existingVisits,
        location: input.location as ScheduleLocation
      }, driveTimeProviderFromEnv(deps.env ?? process.env));
      res.json({ ok: true, suggestions });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/scheduling/book-visit", async (req: Request, res: Response) => {
    try {
      const input = bookVisitSchema.parse(req.body);
      const visit = visitFromInput(input);
      const conflicts = detectConflicts(await deps.repository.listVisits(input.tenantId, { from: input.start, to: input.end }), visit);
      const saved = await deps.repository.saveVisit(visit);
      const approval = await queueScheduleNotification({
        approvalQueue: deps.approvalQueue,
        tenantId: input.tenantId,
        visit: saved,
        notificationKind: "booking",
        to: input.notifyTo ?? null
      });
      res.status(201).json({ ok: true, visit: saved, conflicts, approval });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/scheduling/visits/:id/reminder", async (req: Request, res: Response) => {
    try {
      const input = queueVisitMessageSchema.parse(req.body);
      const visitId = req.params.id;
      if (!visitId) {
        throw new RailError("Visit id is required.", { provider: "native", op: "queueReminder", status: 400 });
      }
      const visit = await deps.repository.getVisit(input.tenantId, visitId);
      if (!visit) {
        throw new RailError(`Visit ${visitId} was not found.`, { provider: "native", op: "queueReminder", status: 404 });
      }
      const approval = await queueScheduleNotification({
        approvalQueue: deps.approvalQueue,
        tenantId: input.tenantId,
        visit,
        notificationKind: "reminder",
        channel: input.channel,
        to: input.notifyTo ?? null
      });
      res.status(201).json({ ok: true, approval });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/scheduling/visits/:id/on-my-way", async (req: Request, res: Response) => {
    try {
      const input = queueVisitMessageSchema.parse(req.body);
      const visitId = req.params.id;
      if (!visitId) {
        throw new RailError("Visit id is required.", { provider: "native", op: "queueOnMyWay", status: 400 });
      }
      const visit = await deps.repository.getVisit(input.tenantId, visitId);
      if (!visit) {
        throw new RailError(`Visit ${visitId} was not found.`, { provider: "native", op: "queueOnMyWay", status: 404 });
      }
      const approval = await queueScheduleNotification({
        approvalQueue: deps.approvalQueue,
        tenantId: input.tenantId,
        visit,
        notificationKind: "on_my_way",
        channel: input.channel,
        to: input.notifyTo ?? null,
        etaMinutes: input.etaMinutes
      });
      res.status(201).json({ ok: true, approval });
    } catch (error) {
      sendError(res, error);
    }
  });
}
