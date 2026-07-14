import { z } from "zod";
import { type ApprovalQueueService, type NexiTool, type Source, type Tenant } from "@nexteam/core";
import type { JobLifecycleService } from "../crm/jobLifecycle.js";
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

const findSlotInputSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  location: locationSchema,
  from: z.string(),
  to: z.string(),
  durationMinutes: z.number().int().min(30).max(480).default(120),
  technicians: z.array(z.string()).default(["crew-1"])
});

const bookVisitInputSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  location: locationSchema,
  start: z.string(),
  end: z.string(),
  assignedTo: z.array(z.string()).default(["crew-1"]),
  notifyTo: z.string().email().optional()
});

const moveVisitInputSchema = z.object({
  visitId: z.string(),
  start: z.string(),
  end: z.string()
});

const whatsMyDayInputSchema = z.object({
  date: z.string(),
  technicianId: z.string().optional()
});
const completeVisitInputSchema = z.object({
  visitId: z.string()
});

function source(ref: string, label: string): Source {
  return { rail: "native", ref, label };
}

function visitFromInput(tenant: Tenant, input: z.infer<typeof bookVisitInputSchema>): ScheduledVisit {
  return {
    id: `visit_${crypto.randomUUID()}`,
    tenantId: tenant.id,
    jobId: input.jobId,
    title: input.title,
    start: input.start,
    end: input.end,
    assignedTo: input.assignedTo,
    location: input.location as ScheduleLocation,
    status: "pending_approval"
  };
}

export function createSchedulingNexiTools(input: {
  repository: SchedulingRepository;
  approvalQueue: ApprovalQueueService;
  jobLifecycleService?: JobLifecycleService | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}): NexiTool[] {
  return [
    {
      name: "findSlot",
      description: "Suggest low-conflict, low-drive-time visit slots for a job.",
      inputSchema: findSlotInputSchema,
      handler: async (tenant, args) => {
        const parsed = findSlotInputSchema.parse(args);
        const existingVisits = await input.repository.listVisits(tenant.id, { from: parsed.from, to: parsed.to });
        const suggestions = await suggestSlots({
          ...parsed,
          tenantId: tenant.id,
          existingVisits,
          location: parsed.location as ScheduleLocation
        }, driveTimeProviderFromEnv(input.env ?? process.env));
        return { result: { suggestions }, sources: [source("schedule_slots", "Native scheduling slot suggestions")] };
      }
    },
    {
      name: "bookVisit",
      description: "Park a visit booking and queue the client notification for approval.",
      inputSchema: bookVisitInputSchema,
      handler: async (tenant, args) => {
        const parsed = bookVisitInputSchema.parse(args);
        const visit = visitFromInput(tenant, parsed);
        const conflicts = detectConflicts(await input.repository.listVisits(tenant.id, { from: parsed.start, to: parsed.end }), visit);
        const saved = input.jobLifecycleService
          ? await input.jobLifecycleService.scheduleVisit({
            tenantId: tenant.id,
            jobId: parsed.jobId,
            title: parsed.title,
            start: parsed.start,
            end: parsed.end,
            assignedTo: parsed.assignedTo
          })
          : await input.repository.saveVisit(visit);
        const approval = await queueScheduleNotification({
          approvalQueue: input.approvalQueue,
          tenantId: tenant.id,
          visit: saved,
          notificationKind: "booking",
          to: parsed.notifyTo ?? null
        });
        return { result: { visit: saved, conflicts, approval }, sources: [source(saved.id, `Native visit ${saved.title}`), source(approval.id, `ApprovalQueue booking notification ${approval.id}`)] };
      }
    },
    {
      name: "moveVisit",
      description: "Move a native visit and report conflicts for review.",
      inputSchema: moveVisitInputSchema,
      handler: async (tenant, args) => {
        const parsed = moveVisitInputSchema.parse(args);
        const existing = await input.repository.getVisit(tenant.id, parsed.visitId);
        if (!existing) {
          return { result: { visit: null, conflicts: [] }, sources: [] };
        }
        const moved = input.jobLifecycleService
          ? await input.jobLifecycleService.moveVisit({
            tenantId: tenant.id,
            visitId: parsed.visitId,
            start: parsed.start,
            end: parsed.end
          })
          : await input.repository.saveVisit({ ...existing, start: parsed.start, end: parsed.end });
        const conflicts = detectConflicts(await input.repository.listVisits(tenant.id, { from: parsed.start, to: parsed.end }), moved).filter((visit) => visit.id !== moved.id);
        return { result: { visit: moved, conflicts }, sources: [source(moved.id, `Native visit ${moved.title}`)] };
      }
    },
    {
      name: "completeVisit",
      description: "Complete a native visit and trigger the admin review alert when the last scheduled visit is done.",
      inputSchema: completeVisitInputSchema,
      handler: async (tenant, args) => {
        if (!input.jobLifecycleService) {
          throw new Error("Job lifecycle tools are not wired for visit completion yet.");
        }
        const parsed = completeVisitInputSchema.parse(args);
        const result = await input.jobLifecycleService.completeVisit({
          tenantId: tenant.id,
          visitId: parsed.visitId,
          actorId: "nexi"
        });
        return {
          result,
          sources: [source(result.visit.id, `Native visit ${result.visit.title}`), source(result.job.id, `Native job ${result.job.title}`)]
        };
      }
    },
    {
      name: "whatsMyDay",
      description: "Read the native schedule for a date.",
      inputSchema: whatsMyDayInputSchema,
      handler: async (tenant, args) => {
        const parsed = whatsMyDayInputSchema.parse(args);
        const day = parsed.date.slice(0, 10);
        const from = `${day}T00:00:00.000Z`;
        const to = `${day}T23:59:59.999Z`;
        const visits = (await input.repository.listVisits(tenant.id, { from, to }))
          .filter((visit) => !parsed.technicianId || visit.assignedTo.includes(parsed.technicianId));
        return { result: { date: day, visits }, sources: [source("schedule_day", `Native schedule ${day}`)] };
      }
    }
  ];
}
