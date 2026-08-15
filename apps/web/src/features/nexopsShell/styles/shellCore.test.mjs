import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const styles = readFileSync(new URL("./shellCore.css", import.meta.url), "utf8");
const responsive = readFileSync(new URL("./shellResponsiveLegacy.css", import.meta.url), "utf8");

test("desktop NexOps shell stays inside the shared framed viewport", () => {
  assert.match(styles, /\.nexops-app \{[\s\S]*height: calc\(100vh - 36px\)/);
  assert.match(styles, /\.nexops-app-sidebar \{[\s\S]*height: calc\(100vh - 98px\)[\s\S]*margin-top: 62px/);
  assert.match(responsive, /\.nexops-app \{[\s\S]*height: auto;[\s\S]*min-height: 100vh/);
  assert.match(responsive, /\.nexops-web-topbar\.nexteam-product-header \{[\s\S]*display: none/);
});
