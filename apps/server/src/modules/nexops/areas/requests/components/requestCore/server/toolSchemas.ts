import { z } from "zod";

export const listRequestsInputSchema = z.object({
  q: z.string().default(""),
  status: z.enum(["new", "archived", "converted_to_quote", "converted_to_job"]).optional()
});
export const getRequestDetailInputSchema = z.object({
  requestId: z.string().optional(),
  query: z.string().optional(),
  fieldKey: z.string().optional()
});

export const createRequestToolInputSchema = z.object({
  rawText: z.string().default(""),
  clientName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  poolConfiguration: z.string().optional(),
  poolType: z.string().optional(),
  gateCode: z.string().optional(),
  petPresent: z.boolean().optional(),
  petName: z.string().optional(),
  waterLossRate: z.string().optional(),
  issueSummary: z.string().optional()
});
