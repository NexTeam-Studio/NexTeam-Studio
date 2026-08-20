import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../NexOpsSchedulePage.tsx", import.meta.url), "utf8");

test("Visit Detail keeps document and visual-workflow actions reachable", () => {
  assert.match(source, /NexDocsClientWorkspace/);
  assert.match(source, /visitId=\{detail\.id\}/);
  assert.match(source, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*setVisitDetailSection\("overview"\);/);
  assert.match(source, /if \(visitDetail\) \{\s*window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\);/);
  assert.match(source, /setVisitDetail\(null\); openEdit\(detail\);/);
  assert.match(source, /setVisitDetail\(null\); void openFieldDocsRail\(detail\);/);
});

test("Visit Detail respects the roster read-only edit rule", () => {
  assert.match(source, /!detail\.readOnly \? <button className="nexops-primary-inline-button"/);
});

test("Visit Detail keeps evaporation calculation review separate from report generation", () => {
  assert.match(source, /setVisitDetailSection\("measurements"\); void loadEvaporationWorkspace\(detail\)/);
  assert.match(source, /\/api\/evaporation\/preview/);
  assert.match(source, /Calculate expected evaporation/);
  assert.match(source, /Generate evaporation report/);
  assert.match(source, /measurementDocumentId/);
  assert.match(source, /Upload Moasure report in Files/);
});
