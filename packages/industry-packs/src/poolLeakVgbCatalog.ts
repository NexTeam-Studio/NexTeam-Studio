export interface CatalogLineItem {
  code: string;
  name: string;
  description: string;
  unitPriceCents: number;
  taxable: boolean;
}

const catalogNames = [
  "VGB compliance site review",
  "Main drain cover field verification",
  "Suction outlet flow rating check",
  "Dual drain spacing verification",
  "Single outlet unblockable review",
  "Sump depth measurement",
  "Cover fastener inspection",
  "Cover expiration documentation",
  "Manufacturer record capture",
  "Pool equipment room review",
  "Pump horsepower verification",
  "Vacuum release device review",
  "SVRS operational check",
  "Equalizer line inspection",
  "Skimmer safety assessment",
  "Hydrostatic valve review",
  "Return fitting condition review",
  "Therapy jet suction review",
  "Wading pool drain review",
  "Spa suction outlet review",
  "Interactive water feature review",
  "Commercial pool compliance note",
  "Residential pool compliance note",
  "Photo documentation package",
  "Owner findings summary",
  "Corrective action estimate",
  "Replacement drain cover labor",
  "Replacement drain cover material",
  "Fastener replacement allowance",
  "Sump modification allowance",
  "Secondary anti-entrapment review",
  "Plumbing isolation assessment",
  "Pressure-side leak screening",
  "Suction-side leak screening",
  "Static water loss observation",
  "Dye test observation",
  "Underwater visual inspection",
  "Deck-side visual inspection",
  "Light niche inspection",
  "Main drain dye test",
  "Skimmer throat dye test",
  "Return fitting dye test",
  "Tile line dye test",
  "Shell crack dye test",
  "Equipment pad leak inspection",
  "Backwash line inspection",
  "Autofill isolation check",
  "Hydrophone listening pass",
  "Pressure test setup",
  "Pressure test per line",
  "Line locating allowance",
  "Electronic leak detection pass",
  "Thermal observation allowance",
  "Findings consultation",
  "Repair priority plan",
  "Compliance photo labeling",
  "Hotel operator documentation",
  "HOA documentation package",
  "Municipal pool documentation",
  "Pre-repair verification",
  "Post-repair verification",
  "Before-after photo pairing",
  "Report PDF generation",
  "Client portal quote review",
  "Typed signature capture",
  "Invoice checkout preparation",
  "Paid invoice reconciliation",
  "Return visit allowance",
  "Emergency inspection surcharge",
  "Travel zone allowance",
  "After-hours inspection allowance",
  "Custom VGB scope placeholder"
] as const;

export const VGB_LINE_ITEM_CATALOG: readonly CatalogLineItem[] = catalogNames.map((name, index) => {
  const sequence = String(index + 1).padStart(3, "0");
  return {
    code: `VGB-${sequence}`,
    name,
    description: `${name} for a pool-leak or VGB compliance workflow.`,
    unitPriceCents: 0,
    taxable: false
  };
});

export function getVgbCatalogItem(code: string): CatalogLineItem | null {
  const normalized = code.trim().toUpperCase();
  return VGB_LINE_ITEM_CATALOG.find((item) => item.code === normalized) ?? null;
}
