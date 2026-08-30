import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("catalog create, edit, and deactivation preserve record identity while hiding the picker entry", async () => {
  const created = catalogItemFromDraft("tenant_1", { id: "", code: "TEST", name: "Test service", description: "Initial", price: 100, category: "service", tag: "Service", taxable: true, visible: true, source: "tenant" });
  const edited = catalogItemFromDraft("tenant_1", { ...created, name: "Test service revised", description: "Revised", price: 125, visible: false }, created);
  assert.equal(edited.id, created.id);
  assert.equal(edited.createdAt, created.createdAt);
  assert.equal(edited.visible, false);
  const catalogSource = await readFile(new URL("../NexOpsCatalog.tsx", import.meta.url), "utf8");
  assert.match(catalogSource, /\.filter\(\(item\) => item\.visible\)/);
});
