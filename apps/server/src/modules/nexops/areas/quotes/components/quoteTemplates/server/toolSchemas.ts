import { z } from "zod";

export const listQuoteTemplatesInputSchema = z.object({
  q: z.string().default("")
});
