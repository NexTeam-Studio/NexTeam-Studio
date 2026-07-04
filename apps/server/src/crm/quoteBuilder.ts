import { getVgbCatalogItem } from "@nexteam/industry-packs";
import { RailError, type LineItem, type QuoteDraft } from "@nexteam/core";
import { z } from "zod";

export const quoteCatalogItemInputSchema = z.object({
  catalogCode: z.string().min(1),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().min(0).optional()
});

export const draftQuoteInputSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  title: z.string().min(1),
  items: z.array(quoteCatalogItemInputSchema).min(1)
});

export type DraftQuoteInput = z.infer<typeof draftQuoteInputSchema>;

function centsToCurrency(cents: number): number {
  return Math.round(cents) / 100;
}

export function buildQuoteDraft(input: DraftQuoteInput): QuoteDraft {
  const lineItems: LineItem[] = input.items.map((item, index) => {
    const catalogItem = getVgbCatalogItem(item.catalogCode);
    if (!catalogItem) {
      throw new RailError(`VGB catalog item ${item.catalogCode} was not found.`, {
        provider: "native",
        op: "buildQuoteDraft",
        status: 400
      });
    }
    const unitPrice = centsToCurrency(item.unitPriceCents ?? catalogItem.unitPriceCents);
    return {
      id: `line_${catalogItem.code.toLowerCase()}_${index + 1}`,
      code: catalogItem.code,
      name: catalogItem.name,
      quantity: item.quantity,
      unitPrice,
      total: Number((item.quantity * unitPrice).toFixed(2))
    };
  });
  return {
    tenantId: input.tenantId,
    clientId: input.clientId,
    jobId: input.jobId,
    title: input.title,
    lineItems
  };
}
