import { z } from "zod";

export const startReviewSequenceBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  jobId: z.string().min(1),
  source: z.enum(["automatic", "manual"]).optional()
});
export const reviewSequenceActionBodySchema = z.object({
  tenantId: z.string().min(1).optional()
});
