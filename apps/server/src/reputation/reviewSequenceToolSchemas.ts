import { z } from "zod";

export const reviewSequenceStatusInputSchema = z.object({
  clientId: z.string().min(1).optional(),
  clientQuery: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  jobQuery: z.string().min(1).optional()
}).superRefine((value, ctx) => {
  if (!value.clientId && !value.clientQuery?.trim() && !value.jobId && !value.jobQuery?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide a client or job to inspect review status.", path: ["clientQuery"] });
  }
});
export const reviewSequenceActionInputSchema = z.object({
  reviewSequenceId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  jobQuery: z.string().min(1).optional()
}).superRefine((value, ctx) => {
  if (!value.reviewSequenceId && !value.jobId && !value.jobQuery?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "reviewSequenceId or an exact job match is required.", path: ["jobQuery"] });
  }
});
export const startReviewSequenceToolInputSchema = z.object({
  jobId: z.string().min(1).optional(),
  jobQuery: z.string().min(1).optional()
}).superRefine((value, ctx) => {
  if (!value.jobId && !value.jobQuery?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "jobId or an exact job match is required.", path: ["jobQuery"] });
  }
});
