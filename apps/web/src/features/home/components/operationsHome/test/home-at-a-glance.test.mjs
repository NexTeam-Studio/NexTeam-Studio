import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../NexOpsHomePage.tsx", import.meta.url), "utf8");
const workspace = await readFile(new URL("../../../../nexopsShell/NexOpsWorkspace.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../operationsHome.css", import.meta.url), "utf8");

test("Home receives the signed-in operator name and places a time-aware greeting below its unchanged hero", () => {
  assert.match(workspace, /<NexOpsHomePage tenantId=\{operatorContext\.tenantId\} operatorName=\{profileName\}/);
  assert.match(page, /function greetingForCurrentTime/);
  assert.match(page, /Good morning/);
  assert.match(page, /Good afternoon/);
  assert.match(page, /Good evening/);
  assert.match(page, /<ModuleHeroCard[\s\S]*<section className="nexops-home-greeting/);
  assert.match(page, /\{greetingForCurrentTime\(\)\}, \{props\.operatorName\}/);
});

test("Home orders live queues by urgency, retains real amounts only, and keeps role-gated health separate from documentation", () => {
  assert.match(page, /const QUEUE_URGENCY_ORDER = \[/);
  assert.match(page, /"action-required",[\s\S]*"past-due"/);
  assert.match(page, /function urgencyOrderedQueues/);
  assert.match(page, /<h2>Live Queues<\/h2>/);
  assert.match(page, /<NexOpsNavGlyph module=\{queueIconModule\(row\)\}/);
  assert.match(page, /typeof row\.totalValue === "number"/);
  assert.match(page, /home\?\.health\.length/);
  assert.match(page, /<h2>Documentation Activity<\/h2>/);
  assert.match(page, /<h2>Recent Activity<\/h2>/);
});

test("Recent Activity filters are horizontally reachable rather than wrapping on narrow screens", () => {
  assert.match(styles, /\.nexops-home-layout \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(styles, /\.nexops-home-filter-row \{[\s\S]*overflow-x: auto;[\s\S]*flex-wrap: nowrap;/);
  assert.match(styles, /\.nexops-home-filter-row button \{[\s\S]*flex: 0 0 auto;/);
});
