import type { Express, Request, Response } from "express";
import { z } from "zod";
import { type ApprovalQueueService, RailError } from "@nexteam/core";
import type { JobLifecycleService } from "../crm/jobLifecycle.js";
import { configuredTenantId } from "../core/tenantConfig.js";
import { requireTenantRole } from "../auth/accessContext.js";
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
  tenantId: z.string().optional(),
  jobId: z.string(),
  title: z.string(),
  location: locationSchema,
  from: z.string(),
  to: z.string(),
  durationMinutes: z.number().int().min(30).max(480).default(120),
  technicians: z.array(z.string()).default(["crew-1"])
});

const bookVisitSchema = z.object({
  tenantId: z.string().optional(),
  jobId: z.string(),
  title: z.string(),
  location: locationSchema,
  start: z.string(),
  end: z.string(),
  assignedTo: z.array(z.string()).default(["crew-1"]),
  notifyTo: z.string().email().optional()
});

const queueVisitMessageSchema = z.object({
  tenantId: z.string().optional(),
  channel: z.enum(["email", "sms"]).default("email"),
  notifyTo: z.string().optional(),
  etaMinutes: z.number().int().positive().max(480).optional()
});

function sendError(res: Response, error: unknown): void {
  const status = error instanceof RailError ? error.status ?? 500 : 500;
  res.status(status).json({ ok: false, error: error instanceof Error ? error.message : "Unknown scheduling error" });
}

function visitFromInput(input: z.infer<typeof bookVisitSchema>): ScheduledVisit {
  if (!input.tenantId) {
    throw new RailError("tenantId is required to book a visit.", { provider: "native", op: "bookVisit", status: 400 });
  }
  return {
    id: `visit_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    jobId: input.jobId,
    title: input.title,
    start: input.start,
    end: input.end,
    assignedTo: input.assignedTo,
    location: input.location as ScheduleLocation,
    status: "scheduled"
  };
}

export interface SchedulingRouteDeps {
  repository: SchedulingRepository;
  approvalQueue: ApprovalQueueService;
  jobLifecycleService?: JobLifecycleService | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export function registerSchedulingRoutes(app: Express, deps: SchedulingRouteDeps): void {
  app.get("/api/scheduling/calendar", async (req: Request, res: Response) => {
    try {
      const env = deps.env ?? process.env;
      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : configuredTenantId(env, "schedulingCalendar");
      await requireTenantRole(req, env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: tenantId, op: "listSchedule" });
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;
      const range: { from?: string; to?: string } = {};
      if (from) {
        range.from = from;
      }
      if (to) {
        range.to = to;
      }
      const nativeVisits = (await deps.repository.listVisits(tenantId, range)).map((visit) => ({ ...visit, source: visit.source ?? "native" as const }));
      res.json({
        ok: true,
        visits: [...nativeVisits].sort((left, right) => left.start.localeCompare(right.start)),
        sourceCounts: { native: nativeVisits.length },
        warnings: []
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/scheduling/find-slot", async (req: Request, res: Response) => {
    try {
      const input = findSlotSchema.parse({
        ...req.body,
        tenantId: req.body?.tenantId ?? configuredTenantId(deps.env ?? process.env, "schedulingFindSlot")
      }) as z.infer<typeof findSlotSchema> & { tenantId: string };
      await requireTenantRole(req, deps.env ?? process.env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: input.tenantId, op: "findScheduleSlot" });
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
      const input = bookVisitSchema.parse({
        ...req.body,
        tenantId: req.body?.tenantId ?? configuredTenantId(deps.env ?? process.env, "schedulingBookVisit")
      }) as z.infer<typeof bookVisitSchema> & { tenantId: string };
      await requireTenantRole(req, deps.env ?? process.env, ["OWNER", "OFFICE_ADMIN"], { requestedTenantId: input.tenantId, op: "bookVisit" });
      const visit = visitFromInput(input);
      const conflicts = detectConflicts(await deps.repository.listVisits(input.tenantId, { from: input.start, to: input.end }), visit);
      const saved = deps.jobLifecycleService
        ? await deps.jobLifecycleService.scheduleVisit({
          tenantId: input.tenantId,
          jobId: input.jobId,
          title: input.title,
          start: input.start,
          end: input.end,
          assignedTo: input.assignedTo
        })
        : await deps.repository.saveVisit(visit);
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
      const input = queueVisitMessageSchema.parse({
        ...req.body,
        tenantId: req.body?.tenantId ?? configuredTenantId(deps.env ?? process.env, "schedulingReminder")
      }) as z.infer<typeof queueVisitMessageSchema> & { tenantId: string };
      await requireTenantRole(req, deps.env ?? process.env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: input.tenantId, op: "queueReminder" });
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
      const input = queueVisitMessageSchema.parse({
        ...req.body,
        tenantId: req.body?.tenantId ?? configuredTenantId(deps.env ?? process.env, "schedulingOnMyWay")
      }) as z.infer<typeof queueVisitMessageSchema> & { tenantId: string };
      await requireTenantRole(req, deps.env ?? process.env, ["OWNER", "OFFICE_ADMIN", "TECHNICIAN"], { requestedTenantId: input.tenantId, op: "queueOnMyWay" });
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
