import { z } from "zod";

export const scheduleJobVisitsToolInputSchema = z.object({
  jobId: z.string().min(1).optional(),
  query: z.string().optional(),
  visits: z.array(z.object({
    title: z.string().optional(),
    start: z.string().min(1),
    end: z.string().min(1),
    assignedTo: z.array(z.string().min(1)).optional(),
    assignedTeamQuery: z.string().optional(),
    details: z.string().optional()
  })).min(1)
}).superRefine((value, ctx) => {
  if (!value.jobId && !value.query?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "jobId or query is required.", path: ["query"] });
  }
});
export const shiftJobVisitSeriesToolInputSchema = z.object({
  visitId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  query: z.string().optional(),
  anchorStart: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  shiftDays: z.number().int().optional(),
  shiftHours: z.number().int().optional(),
  shiftRemaining: z.boolean().default(true)
}).superRefine((value, ctx) => {
  if (!value.visitId && !value.jobId && !value.query?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "visitId or an exact job match is required.", path: ["query"] });
  }
  const hasAbsoluteMove = Boolean(value.start?.trim() && value.end?.trim());
  const hasRelativeMove = Number.isFinite(value.shiftDays) || Number.isFinite(value.shiftHours);
  if (!hasAbsoluteMove && !hasRelativeMove) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide start/end or a day/hour offset.", path: ["start"] });
  }
  if (value.start?.trim() && !value.end?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "end is required when start is provided.", path: ["end"] });
  }
  if (value.end?.trim() && !value.start?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "start is required when end is provided.", path: ["start"] });
  }
});
