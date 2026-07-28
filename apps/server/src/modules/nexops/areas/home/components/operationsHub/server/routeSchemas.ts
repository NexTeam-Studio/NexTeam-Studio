import { z } from "zod";

export const scheduleWorkspaceQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  team: z.string().optional()
});
export const activityFeedQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  objectType: z.enum(["requests", "quotes", "jobs", "invoices", "payments"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});
export const documentationActivityQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional()
});
export const notificationActionBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  notificationId: z.string().min(1).optional()
});
