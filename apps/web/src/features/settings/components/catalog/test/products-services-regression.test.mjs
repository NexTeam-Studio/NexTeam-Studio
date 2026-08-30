import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const quotePage = new URL("../../../../quotes/components/quoteEngine/NexOpsQuotesPage.tsx", import.meta.url);

test("Selecting a catalog item creates a detached editable snapshot", async () => {
  const source = await readFile(quotePage, "utf8");
  assert.match(source, /catalogSelectionSnapshot\(\{/);
  assert.match(source, /code: item\.code, name: item\.name, description: item\.description/);
  assert.doesNotMatch(source, /catalogItemId: item\.id/);
  assert.match(source, /patch\.unitPrice !== undefined/);
});

test("Editing a catalog item does not mutate an existing quote line snapshot", async () => {
  const source = await readFile(quotePage, "utf8");
  assert.match(source, /items: \[\.\.\.current\.items, lineDraftFromCatalogItem\(item\)\]/);
  assert.doesNotMatch(source, /items\.map\([^)]*catalogItemId[^)]*settingsRecord/);
});

test("A freeform custom line remains available alongside catalog selection", async () => {
  const source = await readFile(quotePage, "utf8");
  assert.match(source, /function addCustomLine/);
  assert.match(source, /kind: "custom"/);
  assert.match(source, /catalogItemId: ""/);
});
