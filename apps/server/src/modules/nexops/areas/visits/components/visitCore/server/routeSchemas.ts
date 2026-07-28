import { z } from "zod";

export const sendBookingConfirmationBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  visitId: z.string().min(1).optional(),
  mode: z.enum(["email", "sms"]),
  target: z.string().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  sendCopy: z.boolean().optional(),
  copyTarget: z.string().optional()
});

export const scheduleJobVisitBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  assignedTo: z.array(z.string().min(1)).optional(),
  details: z.string().optional()
});
export const scheduleJobVisitSeriesBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  visits: z.array(z.object({
    title: z.string().min(1).optional(),
    start: z.string().min(1),
    end: z.string().min(1),
    assignedTo: z.array(z.string().min(1)).optional(),
    details: z.string().optional()
  })).min(1)
});
export const moveJobVisitBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  shiftRemaining: z.boolean().optional()
});
export const completeJobVisitBodySchema = z.object({
  tenantId: z.string().min(1).optional()
});
