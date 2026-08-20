import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../NexOpsSchedulePage.tsx", import.meta.url), "utf8");

test("mobile schedule keeps visit and queue order aligned for sighted and keyboard users", () => {
  assert.match(source, /const \[isNarrowSchedule, setIsNarrowSchedule\] = useState\(\(\) => window\.matchMedia\("\(max-width: 800px\)"\)\.matches\)/);
  assert.match(source, /\{!isNarrowSchedule \? renderUnscheduledJobs\(\) : null\}[\s\S]*\{view === "list"/);
  assert.match(source, /\{view === "week"[\s\S]*\{isNarrowSchedule \? renderUnscheduledJobs\(\) : null\}/);
});
