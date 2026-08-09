import test from "node:test";
import assert from "node:assert/strict";

import { catalogCodeSeed, catalogItemFromDraft } from "../NexOpsCatalog.tsx";

test("Catalog owns reusable item normalization independently of consuming documents", () => {
  assert.equal(catalogCodeSeed("  annual filter service  "), "ANNUAL-FILTER-SERVICE");
  const item = catalogItemFromDraft("tenant_1", {
    id: "",
    code: "FILTER-ANNUAL",
    name: "Annual filter service",
    description: "Replace and inspect",
    price: 199.999,
    category: "material",
    tag: "Service",
    taxable: true,
    visible: true,
    source: "tenant"
  });
  assert.equal(item.tenantId, "tenant_1");
  assert.equal(item.price, 200);
  assert.equal(item.category, "material");
  assert.equal(item.source, "tenant");
});
