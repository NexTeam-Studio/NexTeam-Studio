import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (relativePath) => readFileSync(path.resolve(relativePath), "utf8");
const templates = read("apps/web/src/shared/ui/NexOpsBusinessTemplates.tsx");
const styles = read("apps/web/src/shared/ui/NexOpsBusinessTemplates.css");
const clients = read("apps/web/src/features/clients/components/contact/ContactRoster.tsx");
const requests = read("apps/web/src/features/requests/components/requestCore/NexOpsRequestsPage.tsx");

test("shared roster template owns the standard responsive page inset", () => {
  assert.match(styles, /\.nexops-roster-template\s*\{[\s\S]*?box-sizing: border-box;[\s\S]*?width: min\(100%, 1480px\);[\s\S]*?padding: 28px 28px 56px;/);
  assert.match(styles, /@media \(max-width: 700px\)\s*\{[\s\S]*?\.nexops-roster-template\s*\{ padding: 14px 14px 36px; \}/);
  assert.doesNotMatch(clients, /nexops-clients-workspace/);
});

test("shared hero owns primary and secondary action rows", () => {
  assert.match(templates, /module-hero-card__primary-action/);
  assert.match(templates, /module-hero-card__secondary-actions/);
  assert.match(styles, /\.module-hero-card__secondary-actions\s*\{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(clients, /primaryAction=\{<button className="nexops-hero-primary-button"/);
  assert.match(clients, /secondaryActions=\{<>/);
  assert.match(requests, /primaryAction=\{<button className="nexops-hero-primary-button"/);
  assert.match(requests, /secondaryActions=\{<>/);
  assert.doesNotMatch(requests, /primaryAction=\{\(\s*<div className="nexops-inline-actions"/);
});
