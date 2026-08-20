import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../NexOpsSchedulePage.tsx", import.meta.url), "utf8");

test("Visit Detail keeps document and visual-workflow actions reachable", () => {
  assert.match(source, /NexDocsClientWorkspace/);
  assert.match(source, /visitId=\{detail\.id\}/);
  assert.match(source, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*setVisitDetailSection\("overview"\);/);
  assert.match(source, /setVisitDetail\(null\); openEdit\(detail\);/);
  assert.match(source, /setVisitDetail\(null\); void openFieldDocsRail\(detail\);/);
});

test("Visit Detail respects the roster read-only edit rule", () => {
  assert.match(source, /!detail\.readOnly \? <button className="nexops-primary-inline-button"/);
});
