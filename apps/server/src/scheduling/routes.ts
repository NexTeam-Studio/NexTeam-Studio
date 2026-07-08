import type { Express, Request, Response } from "express";
import { z } from "zod";
import { type ApprovalQueueService, type Job, RailError } from "@nexteam/core";
import { JobberAdapter } from "@nexteam/providers";
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
  jobber?: JobberScheduleReader | null | undefined;
}

export interface JobberScheduleReader {
  isConfigured(): boolean;
  getJobs(range: { from: string; to: string }): Promise<Job[]>;
}

function addressLabel(job: Job): string {
  const property = "property" in job && job.property && typeof job.property === "object" ? job.property as { address?: Partial<{ street1: string; city: string; province: string; postalCode: string; country: string }> } : null;
  const address = property?.address;
  return [
    address?.street1,
    address?.city,
    address?.province
  ].filter(Boolean).join(", ") || "Jobber schedule";
}

function addDefaultEnd(start: string): string {
  const date = new Date(start);
  if (!Number.isFinite(date.getTime())) {
    return start;
  }
  date.setUTCHours(date.getUTCHours() + 2);
  return date.toISOString();
}

export function jobberVisitFromJob(job: Job): ScheduledVisit | null {
  if (!job.startAt) {
    return null;
  }
  return {
    id: `jobber_${job.externalIds?.jobber ?? job.id}`,
    tenantId: job.tenantId,
    jobId: job.id,
    title: job.title,
    start: job.startAt,
    end: job.endAt && job.endAt !== job.startAt ? job.endAt : addDefaultEnd(job.startAt),
    assignedTo: [],
    location: { label: addressLabel(job) },
    status: job.status === "complete" ? "complete" : "scheduled",
    source: "jobber",
    readOnly: true
  };
}

async function listJobberOverlayVisits(input: {
  tenantId: string;
  range: { from?: string; to?: string };
  env: NodeJS.ProcessEnv;
  reader?: JobberScheduleReader | null | undefined;
}): Promise<{ visits: ScheduledVisit[]; warning?: string | undefined }> {
  if (!input.range.from || !input.range.to) {
    return { visits: [], warning: "Jobber overlay skipped because calendar range was incomplete." };
  }
  const reader = input.reader === undefined ? JobberAdapter.fromEnv(input.env, input.tenantId) : input.reader;
  if (!reader || !reader.isConfigured()) {
    return { visits: [] };
  }
  try {
    const jobs = await reader.getJobs({ from: input.range.from, to: input.range.to });
    return { visits: jobs.map(jobberVisitFromJob).filter((visit): visit is ScheduledVisit => Boolean(visit)) };
  } catch (error) {
    return { visits: [], warning: error instanceof Error ? error.message : "Jobber overlay unavailable." };
  }
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
      const nativeVisits = (await deps.repository.listVisits(tenantId, range)).map((visit) => ({ ...visit, source: visit.source ?? "native" as const }));
      const overlay = await listJobberOverlayVisits({
        tenantId,
        range,
        env: deps.env ?? process.env,
        reader: deps.jobber
      });
      const nativeJobIds = new Set(nativeVisits.map((visit) => visit.jobId));
      const jobberVisits = overlay.visits.filter((visit) => !nativeJobIds.has(visit.jobId));
      res.json({
        ok: true,
        visits: [...nativeVisits, ...jobberVisits].sort((left, right) => left.start.localeCompare(right.start)),
        sourceCounts: { native: nativeVisits.length, jobber: jobberVisits.length },
        warnings: overlay.warning ? [overlay.warning] : []
      });
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
