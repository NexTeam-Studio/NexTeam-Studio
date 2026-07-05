import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { JobberAdapter, type JobberProductOrService } from "@nexteam/providers";

const tenantId = process.env.TENANT_ID || "aquatrace";
const receiptPath = process.argv[2] || "receipts/m2/jobber-catalog-pull.json";

const expectedVgb = [
  { code: "VGB-001", label: "Zone 1 base documentation", expectedUnitPrice: 950 },
  { code: "VGB-002", label: "Zone 2 base documentation", expectedUnitPrice: 1150 },
  { code: "VGB-003", label: "Zone 3 base documentation", expectedUnitPrice: 1350, note: "Prior record conflicts with 1450." },
  { code: "VGB-004", label: "Zone 4 base documentation", expectedUnitPrice: null },
  { code: "VGB-010", label: "Extra drain cover", expectedUnitPrice: null },
  { code: "VGB-011", label: "Extra on-site hours", expectedUnitPrice: null },
  { code: "VGB-020", label: "Cold-water surcharge at or below 60F", expectedUnitPrice: null },
  { code: "VGB-050", label: "Annual update Zone 1", expectedUnitPrice: 650 },
  { code: "VGB-051", label: "Annual update Zone 2", expectedUnitPrice: 800 },
  { code: "VGB-052", label: "Annual update Zone 3", expectedUnitPrice: 1000 },
  { code: "VGB-070", label: "10 percent discount for 3-4 pools same route", expectedUnitPrice: null }
];

const expectedStandard = [
  { key: "pool_only", label: "Standard leak detection pool only", expectedUnitPrice: 595 },
  { key: "pool_spa", label: "Standard leak detection pool+spa", expectedUnitPrice: 795 },
  { key: "travel_overage", label: "Travel/mileage over 50-mile radius", expectedUnitPrice: 2.5 }
];

function productCode(item: JobberProductOrService): string {
  const match = item.name.match(/\b[A-Z]+-\d{3}\b/);
  return match?.[0] ?? "";
}

function normalizedText(item: JobberProductOrService): string {
  return `${item.name}\n${item.description}`.toLowerCase();
}

function isVgb(item: JobberProductOrService): boolean {
  return /^VGB-\d{3}$/.test(productCode(item));
}

function isStandardLeakItem(item: JobberProductOrService): boolean {
  if (isVgb(item)) {
    return false;
  }
  const haystack = normalizedText(item);
  const price = item.defaultUnitCost;
  return (
    (haystack.includes("leak detection") && (price === 595 || price === 795))
    || ((haystack.includes("mileage") || haystack.includes("travel")) && (price === 2.5 || haystack.includes("$2.50")))
  );
}

function uniqueById(items: JobberProductOrService[]): JobberProductOrService[] {
  const seen = new Set<string>();
  const unique: JobberProductOrService[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

function sortByCodeThenName(left: JobberProductOrService, right: JobberProductOrService): number {
  return (productCode(left) || left.name).localeCompare(productCode(right) || right.name);
}

const adapter = JobberAdapter.fromEnv(process.env, tenantId);
const allProducts = await adapter.getProductsAndServices(undefined, 50);
const searchTerms = ["VGB", "Leak Detection", "Pool Leak Detection", "pool only", "pool spa", "mileage", "travel"];
const searchResults = Object.fromEntries(
  await Promise.all(searchTerms.map(async (term) => [term, await adapter.getProductsAndServices(term, 10)] as const))
);
const matchedProducts = uniqueById([
  ...allProducts.filter((item) => isVgb(item) || isStandardLeakItem(item)),
  ...Object.values(searchResults).flat().filter((item) => isVgb(item) || isStandardLeakItem(item))
]).sort(sortByCodeThenName);
const vgbItems = matchedProducts.filter(isVgb);
const standardLeakItems = matchedProducts.filter(isStandardLeakItem);
const vgbByCode = new Map(vgbItems.map((item) => [productCode(item), item]));

function discrepancyFor(expected: typeof expectedVgb[number]): Record<string, unknown> {
  const actual = vgbByCode.get(expected.code);
  if (!actual) {
    return { code: expected.code, status: "missing", label: expected.label, expectedUnitPrice: expected.expectedUnitPrice, note: expected.note ?? "" };
  }
  const discrepancy = expected.expectedUnitPrice !== null && actual.defaultUnitCost !== expected.expectedUnitPrice;
  return {
    code: expected.code,
    status: discrepancy ? "discrepancy" : "matched",
    label: expected.label,
    expectedUnitPrice: expected.expectedUnitPrice,
    jobberUnitPrice: actual.defaultUnitCost,
    jobberName: actual.name,
    note: expected.note ?? ""
  };
}

function standardStatus(expected: typeof expectedStandard[number]): Record<string, unknown> {
  const candidates = standardLeakItems.filter((item) => {
    const haystack = normalizedText(item);
    if (expected.key === "travel_overage") {
      return haystack.includes("mileage") || haystack.includes("travel");
    }
    if (expected.key === "pool_spa") {
      return item.defaultUnitCost === expected.expectedUnitPrice && haystack.includes("spa");
    }
    return item.defaultUnitCost === expected.expectedUnitPrice && haystack.includes("leak detection");
  });
  return {
    key: expected.key,
    status: candidates.length ? "matched" : "missing",
    label: expected.label,
    expectedUnitPrice: expected.expectedUnitPrice,
    jobberItems: candidates.map((item) => ({ id: item.id, name: item.name, defaultUnitCost: item.defaultUnitCost }))
  };
}

const receipt = {
  ok: true,
  dryRun: true,
  destructiveWrites: false,
  tenantId,
  source: "jobber",
  pulledAt: new Date().toISOString(),
  schemaNote: "Jobber ProductOrService exposes defaultUnitCost; current read permissions hide lastQuoteLineItem, so defaultUnitCost is preserved as the accessible unit-price field for catalog seeding.",
  counts: {
    allProducts: allProducts.length,
    matchedProducts: matchedProducts.length,
    vgbItems: vgbItems.length,
    standardLeakItems: standardLeakItems.length
  },
  matchedProducts,
  searchResultCounts: Object.fromEntries(Object.entries(searchResults).map(([term, items]) => [term, items.length])),
  discrepancyChecks: {
    vgb: expectedVgb.map(discrepancyFor),
    standardLeakDetection: expectedStandard.map(standardStatus)
  },
  missingExpectedItems: [
    ...expectedVgb.map(discrepancyFor).filter((item) => item.status === "missing"),
    ...expectedStandard.map(standardStatus).filter((item) => item.status === "missing")
  ]
};

writeFileSync(resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  ok: true,
  receiptPath,
  counts: receipt.counts,
  missingExpectedItems: receipt.missingExpectedItems.length,
  discrepancies: receipt.discrepancyChecks.vgb.filter((item) => item.status === "discrepancy").length
}, null, 2));
