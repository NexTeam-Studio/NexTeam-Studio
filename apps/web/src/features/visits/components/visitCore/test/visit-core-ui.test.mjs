import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { dateRange, isScheduleAnchorDate, scheduleScopeLabel, scheduleViewLabel, visitToneClass } from "../NexOpsSchedulePage.tsx";

test("schedule ranges keep day and month reads tenant-query bounded", () => {
  assert.deepEqual(dateRange("2026-07-26", "day", "all"), {
    from: "2026-07-26T00:00:00.000Z",
    to: "2026-07-26T23:59:59.999Z"
  });
  assert.deepEqual(dateRange("2026-07-26", "month", "all"), {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-07-31T23:59:59.999Z"
  });
});

test("visit status tones map to stable component-owned style tokens", () => {
  assert.equal(visitToneClass("warning"), "warning");
  assert.equal(visitToneClass("success"), "success");
  assert.equal(visitToneClass("neutral"), "secondary");
});

test("schedule named controls use shared title capitalization", () => {
  assert.deepEqual(
    ["day", "week", "month", "list"].map(scheduleViewLabel),
    ["Day", "Week", "Month", "List"]
  );
  assert.deepEqual(
    ["all", "today", "upcoming"].map(scheduleScopeLabel),
    ["All", "Today", "Upcoming"]
  );
});

test("schedule anchor date accepts real calendar dates without relying on a native date picker", () => {
  assert.equal(isScheduleAnchorDate("2026-08-15"), true);
  assert.equal(isScheduleAnchorDate("2026-02-30"), false);
  assert.equal(isScheduleAnchorDate("08/15/2026"), false);
});

test("schedule inherits ModuleHeroCard through the shared roster template", async () => {
  const source = await readFile(new URL("../NexOpsSchedulePage.tsx", import.meta.url), "utf8");

  assert.match(source, /import \{ NexOpsDetailTemplate, NexOpsRosterSurface, NexOpsRosterTemplate \} from/);
  assert.match(source, /<NexOpsRosterTemplate[\s\S]*title="Visits"/);
  assert.match(source, /<NexOpsRosterSurface[\s\S]*searchTitle="Schedule Visits"/);
});
