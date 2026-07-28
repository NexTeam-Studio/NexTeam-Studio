import { z } from "zod";

export const invoiceStatusInputSchema = z.object({
  invoiceId: z.string().optional(),
  clientId: z.string().optional()
});
