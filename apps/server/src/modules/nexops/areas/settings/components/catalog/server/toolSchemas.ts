import { z } from "zod";

export const listCatalogItemsInputSchema = z.object({
  q: z.string().default(""),
  visibleOnly: z.boolean().default(false)
});
export const saveCatalogItemInputSchema = z.object({
  id: z.string().optional(),
  code: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().min(0),
  category: z.enum(["service", "material", "equipment"]).default("service"),
  tag: z.string().default("Service"),
  taxable: z.boolean().default(false),
  visible: z.boolean().default(true)
});
