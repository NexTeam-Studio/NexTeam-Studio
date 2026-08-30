import type { LineItem } from "./types.js";

export type CatalogSelection = {
  code: string;
  name: string;
  description?: string | undefined;
  price: number;
  taxable?: boolean | undefined;
};

/**
 * A catalog is a picker only. Its identity is deliberately never copied onto
 * a business document: selected values become an independent line snapshot.
 */
export function catalogSelectionSnapshot(input: CatalogSelection & {
  id: string;
  quantity?: number | undefined;
  unitPrice?: number | undefined;
  clientSelectable?: boolean | undefined;
  defaultSelected?: boolean | undefined;
}): LineItem {
  const quantity = input.quantity ?? 1;
  const unitPrice = Number((input.unitPrice ?? input.price).toFixed(2));
  return {
    id: input.id,
    code: input.code,
    name: input.name,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    quantity,
    unitPrice,
    total: Number((quantity * unitPrice).toFixed(2)),
    source: "custom",
    ...(input.clientSelectable !== undefined ? { clientSelectable: input.clientSelectable } : {}),
    ...(input.defaultSelected !== undefined ? { defaultSelected: input.defaultSelected } : {})
  };
}

/** Converts a formerly-linked stored line into the same inert snapshot shape. */
export function detachCatalogSnapshot(line: LineItem): LineItem {
  const { catalogItemId: _catalogItemId, catalogCode: _catalogCode, ...snapshot } = line;
  return { ...snapshot, source: "custom" };
}
