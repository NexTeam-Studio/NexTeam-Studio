import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../operationsHome.css", import.meta.url), "utf8");

test("Home live data cannot widen the mobile dashboard grid", () => {
  assert.match(styles, /\.nexops-home-surface \{[\s\S]*min-width: 0;/);
  assert.match(styles, /\.nexops-home-layout \{[\s\S]*min-width: 0;/);
  assert.match(styles, /\.nexops-home-surface > \*,[\s\S]*\.nexops-home-layout > \*,[\s\S]*\.nexops-home-health-strip > \* \{[\s\S]*min-width: 0;/);
});
