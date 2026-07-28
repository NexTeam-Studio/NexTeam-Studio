import { z } from "zod";
import { workspaceAccessInputFields } from "../../../../../shared/tools/workspaceAccessSchemas.js";

export const getPipelineInputSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

export const getScheduleInputSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  day: z.string().optional(),
  teamMemberIds: z.array(z.string().min(1)).optional(),
  teamMemberQuery: z.string().optional(),
  includeUnscheduled: z.boolean().default(true),
  ...workspaceAccessInputFields
});
export const getActivityFeedInputSchema = z.object({
  objectType: z.enum(["requests", "quotes", "jobs", "invoices", "payments"]).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  ...workspaceAccessInputFields
});
export const getHomeQueuesInputSchema = z.object({
  ...workspaceAccessInputFields
});
